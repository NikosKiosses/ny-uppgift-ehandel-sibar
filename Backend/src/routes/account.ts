import { Router } from 'express';
import { pool } from '../db.ts';
import { requireCustomer, type Customer } from '../lib/session.ts';

const router = Router();

// Alla routes här kräver inloggad kund → annars 401 (kontrolleras på servern, inte i React)
router.use(requireCustomer);

// GET /api/account/orders → den inloggade kundens EGNA ordrar, nyast först
router.get('/orders', async (_req, res) => {
  const customer = res.locals.customer as Customer;

  // customer_id = $1: en kund kan aldrig se någon annans ordrar
  const { rows } = await pool.query(
    `SELECT o.orderid, o.orderstatus, o.pris, o.frakt, o.frakt_metod, o.ombud_namn, o.created_at, o.paid_at,
            COALESCE(
              json_agg(json_build_object('namn', p.product_beskr, 'antal', r.antal, 'pris', r.pris))
                FILTER (WHERE r.order_id IS NOT NULL),
              '[]'
            ) AS items
     FROM orders o
     LEFT JOIN orderrad r ON r.order_id = o.orderid
     LEFT JOIN products p ON p.productid = r.product_id
     WHERE o.customer_id = $1
     GROUP BY o.orderid
     ORDER BY o.orderid DESC`,
    [customer.id],
  );

  res.json({ customer, orders: rows });
});

export default router;