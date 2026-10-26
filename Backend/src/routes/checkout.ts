import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { createCheckout } from '../integrations/paymentAdapter.ts';

const router = Router();

// React skickar bara VAD kunden vill köpa och vart det ska – ALDRIG priset.
const Cart = z.object({
  items: z
    .array(
      z.object({
        productid: z.coerce.number().int().positive('Ogiltig produkt'),
        antal: z.coerce.number().int('Antal måste vara ett heltal').min(1, 'Antal måste vara minst 1').max(99, 'Högst 99 av samma vara'),
      }),
    )
    .min(1, 'Varukorgen är tom')
    .max(50, 'För många olika varor'),
  leverans_namn: z.string().trim().min(1, 'Namn saknas').max(100),
  leverans_adress: z.string().trim().min(1, 'Adress saknas').max(200),
  leverans_telefon: z.string().trim().min(5, 'Telefonnummer saknas').max(30),
});

type ProductForSale = { productid: number; product_beskr: string | null; pris: string | null; lagersaldo: number };

// POST /api/checkout  →  { url } till Stripes betalsida
router.post('/', async (req, res) => {
  // 1. Validera varukorgen
  const cart = Cart.safeParse(req.body);
  if (!cart.success) {
    res.status(400).json({ error: cart.error.issues.map((i) => i.message).join(', ') });
    return;
  }

  // Samma vara flera gånger i varukorgen → slå ihop till EN rad med rätt antal
  const quantities = new Map<number, number>();
  for (const item of cart.data.items) {
    quantities.set(item.productid, (quantities.get(item.productid) ?? 0) + item.antal);
  }

  // 2. Hämta namn, PRIS och lagersaldo från databasen – aldrig från React
  const { rows: products } = await pool.query<ProductForSale>(
    'SELECT productid, product_beskr, pris, lagersaldo FROM products WHERE productid = ANY($1)',
    [[...quantities.keys()]],
  );

  const lines = [];
  for (const [productid, antal] of quantities) {
    const product = products.find((p) => p.productid === productid);
    const price = Number(product?.pris);
    if (!product || !(price > 0)) {
      res.status(400).json({ error: `Produkten med id ${productid} finns inte eller saknar pris` });
      return;
    }
    if (product.lagersaldo < antal) {
      res.status(400).json({
        error: `${product.product_beskr} finns bara i ${product.lagersaldo} ex i lager (du ville köpa ${antal})`,
      });
      return;
    }
    lines.push({ productid, name: product.product_beskr ?? `Produkt ${productid}`, unitPrice: price, quantity: antal });
  }

  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const moms = Math.round(total * 0.2 * 100) / 100; // momsen som INGÅR i priset (25 % på nettot = 20 % av totalen)

  // 3. Spara ordern som OBETALD – i en transaktion, så att order och rader alltid hör ihop
  const db = await pool.connect();
  let orderId: number;
  try {
    await db.query('BEGIN');
    const { rows } = await db.query<{ orderid: number }>(
      `INSERT INTO orders (pris, moms, frakt, orderstatus, leverans_namn, leverans_adress, leverans_telefon)
       VALUES ($1, $2, 0, 'Obetald', $3, $4, $5) RETURNING orderid`,
      [total, moms, cart.data.leverans_namn, cart.data.leverans_adress, cart.data.leverans_telefon],
    );
    orderId = rows[0]!.orderid;
    for (const line of lines) {
      await db.query('INSERT INTO orderrad (order_id, product_id, antal, pris) VALUES ($1, $2, $3, $4)', [
        orderId, line.productid, line.quantity, line.unitPrice,
      ]);
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err; // → error handlern svarar 500
  } finally {
    db.release();
  }
  console.log(`[checkout] Order ${orderId} created (Obetald), total ${total} kr`);

  // 4. Skapa betalningen hos Stripe. Svarar inte Stripe förblir ordern obetald.
  try {
    const checkout = await createCheckout(orderId, lines);
    // Spara sessionens id → bekräftelsesidan hittar ordern med ?session_id=...
    await pool.query('UPDATE orders SET stripe_session_id = $1 WHERE orderid = $2', [checkout.sessionId, orderId]);
    res.json({ url: checkout.url, orderId });
  } catch (err) {
    console.error(`[checkout] Stripe failed for order ${orderId}:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Betaltjänsten svarar inte just nu. Försök igen om en stund – inget har dragits från ditt kort.' });
  }
});

// GET /api/checkout/order?session_id=cs_test_...  →  ordern för bekräftelsesidan
// Bara LÄSNING. Statusen ändras aldrig härifrån – bara webhooken gör det.
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
    `SELECT orderid, orderstatus, pris, moms, frakt, created_at, paid_at
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