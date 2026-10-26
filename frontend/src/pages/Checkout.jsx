import { useState } from 'react';
import { useCart } from '../CartContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

function Checkout() {
  const { cart } = useCart();
  const { formatPrice } = useCurrency();

  const [namn, setNamn] = useState('');
  const [adress, setAdress] = useState('');
  const [telefon, setTelefon] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Samma produkt flera gånger i varukorgen → en rad med antal
  const rows = Object.values(
    cart.reduce((acc, item) => {
      acc[item.productid] ??= { ...item, antal: 0 };
      acc[item.productid].antal += 1;
      return acc;
    }, {}),
  );

  // Bara för att VISA. Servern räknar det riktiga beloppet från databasen.
  const total = rows.reduce((sum, r) => sum + Number(r.pris) * r.antal, 0);

  const handleBetala = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Bara VAD och HUR MÅNGA – aldrig priset
        body: JSON.stringify({
          items: rows.map((r) => ({ productid: r.productid, antal: r.antal })),
          leverans_namn: namn,
          leverans_adress: adress,
          leverans_telefon: telefon,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Något gick fel');

      // Till Stripes betalsida
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="page-container">
        <h1>Kassan</h1>
        <p>Din varukorg är tom.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1>Kassan</h1>

      {rows.map((r) => (
        <p key={r.productid}>
          {r.antal} × {r.product_beskr} – {formatPrice(Number(r.pris) * r.antal)}
        </p>
      ))}

      <input placeholder="Namn" value={namn} onChange={(e) => setNamn(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      <input placeholder="Adress" value={adress} onChange={(e) => setAdress(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      <input placeholder="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />

      <p><strong>Totalt: {formatPrice(total)}</strong></p>
      <p style={{ fontSize: '13px', color: '#666' }}>
        Varav moms {formatPrice(total * 0.2)}. Du betalar i SEK hos Stripe. Frakt tillkommer i nästa steg.
      </p>

      {error && <p style={{ color: '#a12622' }}>{error}</p>}

      <button className="btn" onClick={handleBetala} disabled={loading}>
        {loading ? 'Skickar till betalning…' : 'Betala'}
      </button>
    </div>
  );
}

export default Checkout;