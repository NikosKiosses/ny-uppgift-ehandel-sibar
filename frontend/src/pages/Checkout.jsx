import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../CartContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

const formatDay = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' });

const formatEstimate = (est) => {
  if (!est) return null;
  if (est.date) return `Beräknad leverans: ${formatDay(est.date)}`;
  if (est.daysMin != null) return `Beräknad leverans: ${est.daysMin}–${est.daysMax} dagar`;
  return null;
};

const inputStyle = { display: 'block', marginBottom: '12px', width: '100%', padding: '8px' };

function Checkout() {
  const { cart } = useCart();
  const { formatPrice } = useCurrency();

  const [form, setForm] = useState({
    fornamn: '', efternamn: '', email: '', telefon: '', adress: '', postnummer: '', ort: '',
  });
  const [quote, setQuote] = useState(null);     
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [method, setMethod] = useState('service_point');
  const [servicePointId, setServicePointId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rows = useMemo(
    () =>
      Object.values(
        cart.reduce((acc, item) => {
          acc[item.productid] ??= { ...item, antal: 0 };
          acc[item.productid].antal += 1;
          return acc;
        }, {}),
      ),
    [cart],
  );
  const items = useMemo(() => rows.map((r) => ({ productid: r.productid, antal: r.antal })), [rows]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const postalCode = form.postnummer.replace(/\s/g, '');
  useEffect(() => {
    if (!/^\d{5}$/.test(postalCode) || items.length === 0) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const res = await fetch(`${API}/shipping/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, postalCode }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Kunde inte hämta frakt');
        setQuote(data);
        if (data.servicePoints.length > 0) {
          setServicePointId(data.servicePoints[0].id);
        } else {
          setServicePointId('');
          setMethod('home');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        setQuote(null);
        setQuoteError(err.message);
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [postalCode, items]);

  const selected = quote?.methods.find((m) => m.method === method);
  const shipping = selected?.price ?? null;

  const handleBetala = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          ...form,
          shippingMethod: method,
          servicePointId: method === 'service_point' ? servicePointId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Något gick fel');
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
    <div className="page-container checkout">
      <h1>Kassan</h1>

      <h2>Dina varor</h2>
      {rows.map((r) => (
        <p key={r.productid}>
          {r.antal} × {r.product_beskr} – {formatPrice(Number(r.pris) * r.antal)}
        </p>
      ))}

      <h2>Leveransuppgifter</h2>
      <div className="checkout-row">
        <input name="fornamn" placeholder="Förnamn" value={form.fornamn} onChange={handleChange} style={inputStyle} />
        <input name="efternamn" placeholder="Efternamn" value={form.efternamn} onChange={handleChange} style={inputStyle} />
      </div>
      <input name="email" type="email" placeholder="E-post" value={form.email} onChange={handleChange} style={inputStyle} />
      <input name="telefon" placeholder="Telefon" value={form.telefon} onChange={handleChange} style={inputStyle} />
      <input name="adress" placeholder="Gatuadress" value={form.adress} onChange={handleChange} style={inputStyle} />
      <div className="checkout-row">
        <input name="postnummer" placeholder="Postnummer" value={form.postnummer} onChange={handleChange} style={inputStyle} />
        <input name="ort" placeholder="Ort" value={form.ort} onChange={handleChange} style={inputStyle} />
      </div>

      <h2>Frakt</h2>
      {!quote && !quoteLoading && !quoteError && <p className="checkout-hint">Fyll i ditt postnummer för att se fraktalternativ.</p>}
      {quoteLoading && <p className="checkout-hint">Hämtar fraktalternativ…</p>}
      {quoteError && <p className="checkout-error">{quoteError}</p>}

      {quote && (
        <>
          {quote.leftForFreeShipping > 0 && (
            <p className="checkout-hint">
              Handla för {formatPrice(quote.leftForFreeShipping)} till så får du fri frakt.
            </p>
          )}

          {quote.methods.map((m) => (
            <label key={m.method} className={`checkout-option ${method === m.method ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name="shippingMethod"
                value={m.method}
                checked={method === m.method}
                onChange={() => setMethod(m.method)}
                disabled={m.method === 'service_point' && quote.servicePoints.length === 0}
              />
              <span>
                <strong>{m.name}</strong> – {m.price === 0 ? 'Fri frakt' : formatPrice(m.price)}
                <br />
                <small>{formatEstimate(quote.deliveryEstimates?.[m.method]) ?? 'Leveranstid kunde inte beräknas just nu'}</small>
              </span>
            </label>
          ))}

          {quote.servicePointsError && <p className="checkout-error">{quote.servicePointsError}</p>}

          {method === 'service_point' && quote.servicePoints.length > 0 && (
            <div className="checkout-points">
              <p><strong>Välj ombud</strong></p>
              {quote.servicePoints.map((p) => (
                <label key={p.id} className="checkout-point">
                  <input
                    type="radio"
                    name="servicePoint"
                    value={p.id}
                    checked={servicePointId === p.id}
                    onChange={() => setServicePointId(p.id)}
                  />
                  <span>{p.name}<br /><small>{p.address}</small></span>
                </label>
              ))}
            </div>
          )}

          <div className="checkout-summary">
            <p>Varor: {formatPrice(quote.subtotal)}</p>
            <p>Frakt: {shipping === 0 ? 'Fri frakt' : formatPrice(shipping)}</p>
            <p><strong>Totalt: {formatPrice(quote.subtotal + shipping)}</strong></p>
            <p className="checkout-hint">
              Varav moms {formatPrice((quote.subtotal + shipping) * 0.2)}. Du betalar i SEK hos Stripe.
            </p>
          </div>
        </>
      )}

      {error && <p className="checkout-error">{error}</p>}

      <button className="btn" onClick={handleBetala} disabled={loading || !quote}>
        {loading ? 'Skickar till betalning…' : 'Betala'}
      </button>
    </div>
  );
}

export default Checkout;