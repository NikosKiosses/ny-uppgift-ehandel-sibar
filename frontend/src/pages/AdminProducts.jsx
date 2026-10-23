import { useState, useEffect } from 'react';
import { API } from '../api';
import ImportPanel from '../ImportPanel';

const EMPTY_FORM = { product_img: '', product_beskr: '', pris: '', benefits: '', frakt: '' };

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);   // null = lägg till, annars = ändra
  const [message, setMessage] = useState(null);       // { type: 'ok' | 'warning' | 'error', text }

  const loadProducts = () => {
    fetch(`${API}/products`)
      .then((res) => res.json())
      .then((data) => setProducts(data));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Talar om för admin om sökindexet hängde med (Labb 2-kravet)
  const showResult = (data, okText) => {
    if (data.searchIndexed === false) {
      setMessage({ type: 'warning', text: `${okText}, men sökindexet kunde inte uppdateras. Sökningen visar gammal data tills du kör om indexeringen.` });
    } else {
      setMessage({ type: 'ok', text: okText });
    }
  };

  const handleSave = async () => {
    const isEdit = editingId !== null;
    try {
      const res = await fetch(isEdit ? `${API}/products/${editingId}` : `${API}/products`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);

      showResult(data, isEdit ? 'Produkten är ändrad' : 'Produkten är tillagd');
      setForm(EMPTY_FORM);
      setEditingId(null);
      loadProducts();
    } catch (err) {
      setMessage({ type: 'error', text: `Kunde inte spara: ${err.message}` });
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.productid);
    setForm({
      product_img: p.product_img ?? '',
      product_beskr: p.product_beskr ?? '',
      pris: p.pris ?? '',
      benefits: p.benefits ?? '',
      frakt: p.frakt ?? '',
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API}/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);
      showResult(data, 'Produkten är borttagen');
      loadProducts();
    } catch (err) {
      setMessage({ type: 'error', text: `Kunde inte ta bort: ${err.message}` });
    }
  };

  return (
    <div>
      <h1>Admin - Produkter</h1>

      <ImportPanel onDone={loadProducts} />

      <h2>{editingId !== null ? `Ändra produkt #${editingId}` : 'Lägg till produkt'}</h2>
      <input name="product_img" placeholder="Bild-URL" value={form.product_img} onChange={handleChange} />
      <input name="product_beskr" placeholder="Beskrivning" value={form.product_beskr} onChange={handleChange} />
      <input name="pris" placeholder="Pris" value={form.pris} onChange={handleChange} />
      <input name="benefits" placeholder="Benefits" value={form.benefits} onChange={handleChange} />
      <input name="frakt" placeholder="Frakt" value={form.frakt} onChange={handleChange} />
      <button onClick={handleSave}>{editingId !== null ? 'Spara ändring' : 'Lägg till'}</button>
      {editingId !== null && <button onClick={handleCancel}>Avbryt</button>}

      {message && <p className={`admin-message admin-message-${message.type}`}>{message.text}</p>}

      <h2>Alla produkter</h2>
      {products.map((p) => (
        <div key={p.productid}>
          <p>{p.product_beskr} - {p.pris} kr {p.sku && <small>({p.sku})</small>}</p>
          <button onClick={() => handleEdit(p)}>Ändra</button>
          <button onClick={() => handleDelete(p.productid)}>Ta bort</button>
        </div>
      ))}
    </div>
  );
}

export default AdminProducts;