import { useState, useEffect } from 'react';

const API = 'https://fsu25d-systemutveckling-uppgift-1-min-o0fb.onrender.com';

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    product_img: '', product_beskr: '', pris: '', benefits: '', frakt: ''
  });

  const loadProducts = () => {
    fetch(`${API}/products`)
      .then(res => res.json())
      .then(data => setProducts(data));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAdd = () => {
    fetch(`${API}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
      .then(res => res.json())
      .then(() => {
        loadProducts();
        setForm({ product_img: '', product_beskr: '', pris: '', benefits: '', frakt: '' });
      });
  };

  const handleDelete = (id) => {
    fetch(`${API}/products/${id}`, { method: 'DELETE' })
      .then(() => loadProducts());
  };

  return (
    <div>
      <h1>Admin - Produkter</h1>

      <h2>Lägg till produkt</h2>
      <input name="product_img" placeholder="Bild-URL" value={form.product_img} onChange={handleChange} />
      <input name="product_beskr" placeholder="Beskrivning" value={form.product_beskr} onChange={handleChange} />
      <input name="pris" placeholder="Pris" value={form.pris} onChange={handleChange} />
      <input name="benefits" placeholder="Benefits" value={form.benefits} onChange={handleChange} />
      <input name="frakt" placeholder="Frakt" value={form.frakt} onChange={handleChange} />
      <button onClick={handleAdd}>Lägg till</button>

      <h2>Alla produkter</h2>
      {products.map(p => (
        <div key={p.productid}>
          <p>{p.product_beskr} - {p.pris} kr</p>
          <button onClick={() => handleDelete(p.productid)}>Ta bort</button>
        </div>
      ))}
    </div>
  );
}

export default AdminProducts;