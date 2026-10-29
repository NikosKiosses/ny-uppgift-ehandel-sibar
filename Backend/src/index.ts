import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.ts';
import currencyRouter from './routes/currency.ts';
import adminRouter from './routes/admin.ts';
import searchRouter from './routes/search.ts';
import checkoutRouter from './routes/checkout.ts';
import stripeWebhookRouter from './routes/stripeWebhook.ts';
import productImageRouter from './routes/productImage.ts';
import { syncProducts, syncRemoved, type ProductRow } from './integrations/searchAdapter.ts';
import shippingRouter from './routes/shipping.ts';

const app = express();

app.use(cors());

app.use('/api/stripe/webhook', stripeWebhookRouter);
app.use(express.json());
app.use('/api/currency', currencyRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', productImageRouter);
app.use('/api/search', searchRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/shipping', shippingRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

const ProductInput = z.object({
  product_beskr: z.string({ error: 'Namn saknas' }).trim().min(1, 'Namn saknas'),
  pris: z.coerce.number({ error: 'Priset måste vara ett tal' }).positive('Priset måste vara större än 0'),
  benefits: z.preprocess(emptyToNull, z.string().trim().nullable()),
  frakt: z.preprocess(
    emptyToNull,
    z.coerce.number({ error: 'Frakt måste vara ett tal' }).nonnegative('Frakt får inte vara negativ').nullable(),
  ),
});

app.get('/api/products', async (req, res) => {
  const allproducts = await pool.query("SELECT * FROM Products ORDER BY productid");
  res.json(allproducts.rows);
});

app.post('/api/products', async (req, res) => {
  const input = ProductInput.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues.map((i) => i.message).join(', ') });
    return;
  }
  const { product_beskr, pris, benefits, frakt } = input.data;

  const { rows } = await pool.query<ProductRow>(
    "INSERT INTO products (product_beskr, pris, benefits, frakt) VALUES ($1, $2, $3, $4) RETURNING *",
    [product_beskr, pris, benefits, frakt]
  );
  const nyProdukt = rows[0]!;

  const searchIndexed = await syncProducts([nyProdukt]);
  res.status(201).json({ ...nyProdukt, searchIndexed });
});

app.patch('/api/products/:id', async (req, res) => {
  const input = ProductInput.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues.map((i) => i.message).join(', ') });
    return;
  }
  const { product_beskr, pris, benefits, frakt } = input.data;
  const id = req.params.id;

  const { rows } = await pool.query<ProductRow>(
    "UPDATE products SET product_beskr = $1, pris = $2, benefits = $3, frakt = $4 WHERE productid = $5 RETURNING *",
    [product_beskr, pris, benefits, frakt, id]
  );
  const uppdaterad = rows[0];
  if (!uppdaterad) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }

  const searchIndexed = await syncProducts([uppdaterad]);
  res.json({ ...uppdaterad, searchIndexed });
});

app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  const { rows } = await pool.query<ProductRow>(
    "DELETE FROM products WHERE productid = $1 RETURNING productid, sku",
    [id]
  );
  const borttagen = rows[0];
  if (!borttagen) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }

  const searchIndexed = await syncRemoved([borttagen]);
  res.json({ meddelande: "Produkten är borttagen", searchIndexed });
});

app.post('/api/users', async (req, res) => {
  const { namn, email, password, adress, telefon, admin } = req.body;
  const hashat = await bcrypt.hash(password, 10);

  const nyAnv = await pool.query(
    "INSERT INTO users (namn, email, password, adress, telefon, admin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [namn, email, hashat, adress, telefon, admin]
  );

  res.json(nyAnv.rows[0]);
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const nyLogin = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = nyLogin.rows[0];

  if (!user) {
    res.status(401).json({ meddelande: "Fel email eller lösenord" });
    return;
  }

  const matchar = await bcrypt.compare(password, user.password);

  if (!matchar) {
    res.status(401).json({ meddelande: "Fel email eller lösenord" });
    return;
  }

  res.json({
    meddelande: "Inloggning lyckades",
    admin: user.admin,
    user_id: user.userid
  });
});

app.get('/api/orders', async (req, res) => {
  const allaOrders = await pool.query("SELECT * FROM orders ORDER BY orderid DESC");
  res.json(allaOrders.rows);
});

app.patch('/api/orders/:id', async (req, res) => {
  const { orderstatus } = req.body;
  const id = req.params.id;

  const uppdateradOrder = await pool.query(
    "UPDATE orders SET orderstatus = $1 WHERE orderid = $2 RETURNING *",
    [orderstatus, id]
  );

  res.json(uppdateradOrder.rows[0]);
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);

  console.error(`${req.method} ${req.originalUrl} failed: ${message}`);

  res.status(500).json({ error: 'Något gick fel på servern' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});