import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCart } from '../CartContext';
import { API } from '../api';

const STATUS_TEXT = {
  Obetald: 'Vi väntar på bekräftelse av betalningen…',
  Betald: 'Tack! Din betalning är genomförd.',
  Avbruten: 'Ordern avbröts eftersom betalningen inte slutfördes.',
};

function Orderbekraftelse() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { clearCart } = useCart();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Ingen order angiven.');
      return;
    }

    let attempts = 0;
    let timer;

    const load = async () => {
      try {
        const res = await fetch(`${API}/checkout/order?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Kunde inte hämta ordern');
        setOrder(data);

        if (data.orderstatus === 'Betald') clearCart();
        else if (data.orderstatus === 'Obetald' && ++attempts < 15) timer = setTimeout(load, 2000);
      } catch (err) {
        setError(err.message);
      }
    };
    load();

    return () => clearTimeout(timer);
  }, [sessionId]);

  if (error) return <div className="page-container"><h1>Orderbekräftelse</h1><p>{error}</p></div>;
  if (!order) return <div className="page-container"><p>Hämtar din order…</p></div>;

  return (
    <div className="page-container">
      <h1>Orderbekräftelse</h1>
      <p>Ordernummer: <strong>#{order.orderid}</strong></p>
      <p>Status: <strong>{order.orderstatus}</strong></p>
      <p>{STATUS_TEXT[order.orderstatus] ?? ''}</p>

      <h2>Dina varor</h2>
      {order.items.map((item, i) => (
        <p key={i}>{item.antal} × {item.namn} – {Number(item.pris) * item.antal} kr</p>
      ))}
        <p>Frakt: {Number(order.frakt) === 0 ? 'Fri frakt' : `${Number(order.frakt)} kr`}</p>
        {order.ombud_namn && (
          <p>Hämtas hos ombud: <strong>{order.ombud_namn}</strong>, {order.ombud_adress}</p>
        )}
        {order.frakt_metod === 'home' && (
          <p>Levereras hem till: {order.leverans_adress}, {order.leverans_postnummer} {order.leverans_ort}</p>
        )}
        <p>
          <strong>Totalt: {Number(order.pris) + Number(order.frakt)} kr</strong> (varav moms {Number(order.moms)} kr)
        </p>
      <Link to="/kollektion" className="btn" style={{ display: 'inline-block', marginTop: '16px', textDecoration: 'none' }}>
        Fortsätt handla
      </Link>
    </div>
  );
}

export default Orderbekraftelse;