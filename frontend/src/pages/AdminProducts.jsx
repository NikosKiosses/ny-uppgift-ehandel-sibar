import { useState, useEffect } from 'react';
import { API } from '../api';
import ImportPanel from '../ImportPanel';

const EMPTY_FORM = { product_beskr: '', pris: '', benefits: '', frakt: '' };

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);   
  const [message, setMessage] = useState(null);     

  const [rules, setRules] = useState(null);      
  const [files, setFiles] = useState({});            
  const [uploadingId, setUploadingId] = useState(null);
  const [imageMsg, setImageMsg] = useState({});       

  const loadProducts = () => {
    fetch(`${API}/products`)
      .then((res) => res.json())
      .then((data) => setProducts(data));
  };

  useEffect(() => {
    loadProducts();
    fetch(`${API}/admin/image-rules`)
      .then((res) => res.json())
      .then(setRules)
      .catch(() => setRules(null));
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resultMessage = (data, okText) =>
    data.searchIndexed === false
      ? { type: 'warning', text: `${okText}, men sökindexet kunde inte uppdateras. Sökningen visar gammal data tills du kör om indexeringen.` }
      : { type: 'ok', text: okText };

  const handleSave = async () => {
    const isEdit = editingId !== null;
    try {
      const res = await fetch(isEdit ? `${API}/products/${editingId}` : `${API}/products`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);

      setMessage(resultMessage(data, isEdit ? 'Produkten är ändrad' : 'Produkten är tillagd'));
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
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);
      setMessage(resultMessage(data, 'Produkten är borttagen'));
      loadProducts();
    } catch (err) {
      setMessage({ type: 'error', text: `Kunde inte ta bort: ${err.message}` });
    }
  };

  const setMsgFor = (id, msg) => setImageMsg((prev) => ({ ...prev, [id]: msg }));

  const handleFileChange = (id, file) => {
    setFiles((prev) => ({ ...prev, [id]: file }));
    setMsgFor(id, null);
    if (file && rules && file.size > rules.maxMb * 1024 * 1024) {
      setMsgFor(id, { type: 'error', text: `Bilden är för stor (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${rules.maxMb} MB.` });
    }
  };

  const handleUpload = async (id) => {
    const file = files[id];
    if (!file) return;
    if (rules && file.size > rules.maxMb * 1024 * 1024) {
      setMsgFor(id, { type: 'error', text: `Bilden är för stor. Max ${rules.maxMb} MB.` });
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setUploadingId(id);
    setMsgFor(id, null);
    try {
      const res = await fetch(`${API}/admin/products/${id}/image`, { method: 'POST', body: formData });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || (res.status === 413 ? 'Bilden är för stor.' : `Fel ${res.status}`));
      }
      setMsgFor(id, resultMessage(data, 'Bilden är uppladdad'));
      setFiles((prev) => ({ ...prev, [id]: undefined }));
      loadProducts();
    } catch (err) {
      const text = err.message === 'Failed to fetch'
        ? 'Uppladdningen avbröts. Är filen för stor eller servern nere?'
        : err.message;
      setMsgFor(id, { type: 'error', text: `Bilden laddades inte upp: ${text}` });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div>
      <h1>Admin - Produkter</h1>

      <ImportPanel onDone={loadProducts} />

      <h2>{editingId !== null ? `Ändra produkt #${editingId}` : 'Lägg till produkt'}</h2>
      <input name="product_beskr" placeholder="Namn" value={form.product_beskr} onChange={handleChange} />
      <input name="pris" placeholder="Pris" value={form.pris} onChange={handleChange} />
      <input name="benefits" placeholder="Benefits" value={form.benefits} onChange={handleChange} />
      <input name="frakt" placeholder="Frakt" value={form.frakt} onChange={handleChange} />
      <button onClick={handleSave}>{editingId !== null ? 'Spara ändring' : 'Lägg till'}</button>
      {editingId !== null && <button onClick={handleCancel}>Avbryt</button>}

      {message && <p className={`admin-message admin-message-${message.type}`}>{message.text}</p>}

      <h2>Alla produkter</h2>
      {rules && <p className="admin-hint">Bilder: JPEG eller PNG, max {rules.maxMb} MB.</p>}

      {products.map((p) => (
        <div key={p.productid} className="admin-product">
          {p.product_img
            ? <img src={p.product_img} alt={p.product_beskr} className="admin-thumb" />
            : <div className="admin-thumb admin-thumb-empty">Ingen bild</div>}

          <div className="admin-product-info">
            <p>{p.product_beskr} - {p.pris} kr {p.sku && <small>({p.sku})</small>}</p>
            <div className="admin-product-actions">
              <button onClick={() => handleEdit(p)}>Ändra</button>
              <button onClick={() => handleDelete(p.productid)}>Ta bort</button>
            </div>
            <div className="admin-product-actions">
              {}
              <input type="file" onChange={(e) => handleFileChange(p.productid, e.target.files[0])} />
              <button onClick={() => handleUpload(p.productid)} disabled={!files[p.productid] || uploadingId !== null}>
                {uploadingId === p.productid ? 'Laddar upp…' : 'Ladda upp bild'}
              </button>
            </div>
            {imageMsg[p.productid] && (
              <p className={`admin-message admin-message-${imageMsg[p.productid].type}`}>
                {imageMsg[p.productid].text}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default AdminProducts;