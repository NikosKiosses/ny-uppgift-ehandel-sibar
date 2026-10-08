// ─────────────────────────────────────────────
// 1. Importer 
// ─────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import pg from 'pg';

// pg är ett äldre paket – importerar hela paketet
// och plockar ut Pool på en egen rad
const { Pool } = pg;


// ─────────────────────────────────────────────
// 2. Databas och app
// ─────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// 3. Produkter
// ─────────────────────────────────────────────
app.get('/products', async (req, res) => {
  const allproducts = await pool.query("SELECT * FROM Products");
  res.json(allproducts.rows);
});

app.post('/products', async (req, res) => {
  const { product_img, product_beskr, pris, benefits, frakt } = req.body;

  const nyProdukt = await pool.query(
    "INSERT INTO products (product_img, product_beskr, pris, benefits, frakt) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [product_img, product_beskr, pris, benefits, frakt]
  );

  res.json(nyProdukt.rows[0]);
});

app.patch('/products/:id', async (req, res) => {
  const { product_img, product_beskr, pris, benefits, frakt } = req.body;
  const id = req.params.id;

  const uppdateradProdukt = await pool.query(
    "UPDATE products SET product_img = $1, product_beskr = $2, pris = $3, benefits = $4, frakt = $5 WHERE productid = $6 RETURNING *",
    [product_img, product_beskr, pris, benefits, frakt, id]
  );

  res.json(uppdateradProdukt.rows[0]);
});

app.delete('/products/:id', async (req, res) => {
  const id = req.params.id;

  await pool.query("DELETE FROM products WHERE productid = $1", [id]);

  res.json({ meddelande: "Produkten är borttagen" });
});

// ─────────────────────────────────────────────
// 4. Användare och inloggning
// ─────────────────────────────────────────────
app.post('/users', async (req, res) => {
  const { namn, email, password, adress, telefon, admin } = req.body;
  const hashat = await bcrypt.hash(password, 10);

  const nyAnv = await pool.query(
    "INSERT INTO users (namn, email, password, adress, telefon, admin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [namn, email, hashat, adress, telefon, admin]
  );

  res.json(nyAnv.rows[0]);
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const nyLogin = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

  const user = nyLogin.rows[0];
  const matchar = await bcrypt.compare(password, user.password);

  if (matchar) {
    res.json({
      meddelande: "Inloggning lyckades",
      admin: user.admin,
      user_id: user.userid
    });
  } else {
    res.json({ meddelande: "Fel lösenord" });
  }
});

// ─────────────────────────────────────────────
// 5. Ordrar
// ─────────────────────────────────────────────
app.post('/orders', async (req, res) => {
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

app.get('/orders', async (req, res) => {
  const allaOrders = await pool.query("SELECT * FROM orders");
  res.json(allaOrders.rows);
});

app.patch('/orders/:id', async (req, res) => {
  const { orderstatus } = req.body;
  const id = req.params.id;

  const uppdateradOrder = await pool.query(
    "UPDATE orders SET orderstatus = $1 WHERE orderid = $2 RETURNING *",
    [orderstatus, id]
  );

  res.json(uppdateradOrder.rows[0]);
});

// ─────────────────────────────────────────────
// 6. Starta servern
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});