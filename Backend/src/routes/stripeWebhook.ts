import express, { Router } from 'express';
import { pool } from '../db.ts';
import { parseWebhook, type PaymentEvent } from '../integrations/paymentAdapter.ts';
import { syncProducts, type ProductRow } from '../integrations/searchAdapter.ts';

const router = Router();

// POST /api/stripe/webhook – anropas av STRIPE, inte av React.
// express.raw: behåll body som RÅA bytes. Signaturen räknas på exakt de bytes Stripe skickade.
// Därför registreras den här routern FÖRE app.use(express.json()) i index.ts.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Kommer anropet verkligen från Stripe?
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(400).send('Missing Stripe-Signature');
    return;
  }

  let event: PaymentEvent;
  try {
    event = parseWebhook(req.body, signature);
  } catch (err) {
    console.warn('[webhook] Invalid signature:', err instanceof Error ? err.message : err);
    res.status(400).send('Invalid signature'); // inte från Stripe – ingen order ändras
    return;
  }

  // 2. Spara i databasen. Kastas ett fel här svarar vi 500 → Stripe skickar händelsen igen senare.
  let changedProducts: ProductRow[] = [];
  if (event.type === 'paid') changedProducts = await markPaid(event.orderId, event.sessionId);
  else if (event.type === 'expired') await markCancelled(event.orderId);
  else console.log(`[webhook] Ignored: ${event.reason}`);

  // 3. Svara Stripe DIREKT – annars tror Stripe att leveransen misslyckades och skickar igen
  res.json({ received: true });

  // 4. Långsamt arbete EFTER svaret: nytt lagersaldo → uppdatera sökindexet.
  //    Databasen är redan klar; misslyckas Algolia loggas det bara (syncProducts kastar aldrig).
  if (changedProducts.length > 0) void syncProducts(changedProducts);
});

// Betald: orderstatus OCH lagersaldo i EN transaktion, så de aldrig kan bli osams.
// Returnerar produkterna vars lagersaldo ändrades (tom lista om ordern redan var hanterad).
async function markPaid(orderId: number, sessionId: string): Promise<ProductRow[]> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    // Bara om ordern fortfarande är Obetald. Samma händelse kan komma flera gånger –
    // andra gången uppdateras 0 rader, och lagret minskas inte igen.
    const order = await db.query(
      `UPDATE orders SET orderstatus = 'Betald', paid_at = now(), stripe_session_id = COALESCE(stripe_session_id, $2)
       WHERE orderid = $1 AND orderstatus = 'Obetald'`,
      [orderId, sessionId],
    );
    if (order.rowCount === 0) {
      await db.query('COMMIT');
      console.log(`[webhook] Order ${orderId} already handled – nothing changed`);
      return [];
    }

    // Minska lagersaldot med köpt antal för varje rad i ordern
    const stock = await db.query<ProductRow>(
      `UPDATE products p SET lagersaldo = p.lagersaldo - r.antal
       FROM orderrad r
       WHERE r.order_id = $1 AND p.productid = r.product_id
       RETURNING p.*`,
      [orderId],
    );

    await db.query('COMMIT');
    console.log(`[webhook] Order ${orderId} paid, stock lowered for ${stock.rows.length} product(s)`);
    return stock.rows;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

// Utgången session: avbryt ordern – men ALDRIG en order som redan är betald
async function markCancelled(orderId: number) {
  const result = await pool.query(
    `UPDATE orders SET orderstatus = 'Avbruten' WHERE orderid = $1 AND orderstatus = 'Obetald'`,
    [orderId],
  );
  console.log(
    result.rowCount
      ? `[webhook] Order ${orderId} cancelled (session expired)`
      : `[webhook] Order ${orderId} not cancelled – it was not Obetald`,
  );
}

export default router;