import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { createCheckout } from '../integrations/paymentAdapter.ts';
import { findServicePoints, type ServicePoint } from '../integrations/shippingAdapter.ts';
import { CartError, CartItems, priceCart } from '../lib/cart.ts';
import { METHOD_NAMES, SHIPPING_METHODS, shippingPrice } from '../lib/shippingPrices.ts';
import { PostalCode } from './shipping.ts';

const router = Router();

const CheckoutRequest = z
  .object({
    items: CartItems,
    fornamn: z.string().trim().min(1, 'Förnamn saknas').max(50),
    efternamn: z.string().trim().min(1, 'Efternamn saknas').max(50),
    email: z.email('Ogiltig e-postadress'),
    telefon: z.string().trim().min(5, 'Telefonnummer saknas').max(30),
    adress: z.string().trim().min(1, 'Adress saknas').max(200),
    postnummer: PostalCode,
    ort: z.string().trim().min(1, 'Ort saknas').max(100),
    shippingMethod: z.enum(SHIPPING_METHODS, { error: 'Välj ett fraktsätt' }),
    servicePointId: z.string().trim().optional(),
  })
  .refine((d) => d.shippingMethod !== 'service_point' || !!d.servicePointId, {
    message: 'Välj ett ombud',
    path: ['servicePointId'],
  });

router.post('/', async (req, res) => {
  const input = CheckoutRequest.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues.map((i) => i.message).join(', ') });
    return;
  }
  const c = input.data;

  let cart: Awaited<ReturnType<typeof priceCart>>;
  try {
    cart = await priceCart(c.items);
  } catch (err) {
    if (err instanceof CartError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  let servicePoint: ServicePoint | null = null;
  if (c.shippingMethod === 'service_point') {
    let nearby: ServicePoint[];
    try {
      nearby = await findServicePoints(c.postnummer);
    } catch (err) {
      console.error('[checkout] PostNord failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Kunde inte kontrollera ombudet hos PostNord just nu. Försök igen, eller välj hemleverans.' });
      return;
    }
    servicePoint = nearby.find((p) => p.id === c.servicePointId) ?? null;
    if (!servicePoint) {
      res.status(400).json({ error: `Ombudet finns inte bland ombuden för postnummer ${c.postnummer}. Välj ett ombud i listan.` });
      return;
    }
  }

  const frakt = shippingPrice(c.shippingMethod, cart.subtotal);
  const fraktNamn = servicePoint ? `${METHOD_NAMES.service_point} (${servicePoint.name})` : METHOD_NAMES[c.shippingMethod];
  const total = cart.subtotal + frakt;
  const moms = Math.round(total * 0.2 * 100) / 100; 

  const db = await pool.connect();
  let orderId: number;
  try {
    await db.query('BEGIN');
    const { rows } = await db.query<{ orderid: number }>(
      `INSERT INTO orders (pris, moms, frakt, orderstatus,
         leverans_namn, leverans_adress, leverans_telefon, leverans_email, leverans_postnummer, leverans_ort,
         frakt_metod, ombud_id, ombud_namn, ombud_adress)
       VALUES ($1, $2, $3, 'Obetald', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING orderid`,
      [
        cart.subtotal, moms, frakt,
        `${c.fornamn} ${c.efternamn}`, c.adress, c.telefon, c.email, c.postnummer, c.ort,
        c.shippingMethod, servicePoint?.id ?? null, servicePoint?.name ?? null, servicePoint?.address ?? null,
      ],
    );
    orderId = rows[0]!.orderid;
    for (const line of cart.lines) {
      await db.query('INSERT INTO orderrad (order_id, product_id, antal, pris) VALUES ($1, $2, $3, $4)', [
        orderId, line.productid, line.quantity, line.unitPrice,
      ]);
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
  console.log(`[checkout] Order ${orderId} created (Obetald): ${cart.subtotal} kr + frakt ${frakt} kr`);

  try {
    const checkout = await createCheckout(orderId, cart.lines, { name: fraktNamn, price: frakt }, c.email);
    await pool.query('UPDATE orders SET stripe_session_id = $1 WHERE orderid = $2', [checkout.sessionId, orderId]);
    res.json({ url: checkout.url, orderId });
  } catch (err) {
    console.error(`[checkout] Stripe failed for order ${orderId}:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Betaltjänsten svarar inte just nu. Försök igen om en stund – inget har dragits från ditt kort.' });
  }
});

const SessionQuery = z.object({
  session_id: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Ogiltigt session_id'),
});

router.get('/order', async (req, res) => {
  const query = SessionQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'Ogiltigt session_id' });
    return;
  }

  const { rows: orders } = await pool.query(
    `SELECT orderid, orderstatus, pris, moms, frakt, frakt_metod, ombud_namn, ombud_adress,
            leverans_namn, leverans_adress, leverans_postnummer, leverans_ort, created_at, paid_at
     FROM orders WHERE stripe_session_id = $1`,
    [query.data.session_id],
  );
  const order = orders[0];
  if (!order) {
    res.status(404).json({ error: 'Ordern hittades inte' });
    return;
  }

  const { rows: items } = await pool.query(
    `SELECT r.antal, r.pris, p.product_beskr AS namn
     FROM orderrad r LEFT JOIN products p ON p.productid = r.product_id
     WHERE r.order_id = $1`,
    [order.orderid],
  );

  res.json({ ...order, items });
});

export default router;