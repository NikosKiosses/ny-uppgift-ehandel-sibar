import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import currencyRouter from './routes/currency.ts';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.ts';
import adminRouter from './routes/admin.ts';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/currency', currencyRouter);
app.use('/api/admin', adminRouter);


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});
// ─────────────────────────────────────────────
// Produkter
// ─────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  const allproducts = await pool.query("SELECT * FROM Products");
  res.json(allproducts.rows);
});

app.post('/api/products', async (req, res) => {
  const { product_img, product_beskr, pris, benefits, frakt } = req.body;

  const nyProdukt = await pool.query(
    "INSERT INTO products (product_img, product_beskr, pris, benefits, frakt) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [product_img, product_beskr, pris, benefits, frakt]
  );

  res.json(nyProdukt.rows[0]);
});

app.patch('/api/products/:id', async (req, res) => {
  const { product_img, product_beskr, pris, benefits, frakt } = req.body;
  const id = req.params.id;

  const uppdateradProdukt = await pool.query(
    "UPDATE products SET product_img = $1, product_beskr = $2, pris = $3, benefits = $4, frakt = $5 WHERE productid = $6 RETURNING *",
    [product_img, product_beskr, pris, benefits, frakt, id]
  );

  res.json(uppdateradProdukt.rows[0]);
});

app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  await pool.query("DELETE FROM products WHERE productid = $1", [id]);

  res.json({ meddelande: "Produkten är borttagen" });
});

// ─────────────────────────────────────────────
// Användare och inloggning
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Ordrar
// ─────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  const { user_id, varor, pris, moms, frakt, leverans_namn, leverans_adress, leverans_telefon } = req.body;

  const nyOrder = await pool.query(
    "INSERT INTO orders (user_id, pris, moms, frakt, orderstatus, leverans_namn, leverans_adress, leverans_telefon) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
    [user_id, pris, moms, frakt, "Beställd", leverans_namn, leverans_adress, leverans_telefon]
  );

  const orderId = nyOrder.rows[0].orderid;

  for (const vara of varor) {
    await pool.query(
      "INSERT INTO orderrad (order_id, product_id, antal) VALUES ($1, $2, $3)",
      [orderId, vara.product_id, vara.antal]
    );
  }

  res.json(nyOrder.rows[0]);
});

app.get('/api/orders', async (req, res) => {
  const allaOrders = await pool.query("SELECT * FROM orders");
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

// ─────────────────────────────────────────────
// Felhantering – fångar ALLA fel från ALLA routes
// ─────────────────────────────────────────────
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);

  // Detaljerna → terminalen (för DIG)
  console.error(`${req.method} ${req.originalUrl} failed: ${message}`);

  // Kort meddelande → webbläsaren (för KUNDEN)
  res.status(500).json({ error: 'Något gick fel på servern' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});