import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCustomer } from '../CustomerContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

// Felkoderna som servern skickar med i ?error=… efter en misslyckad inloggning
const ERRORS = {
  cancelled: 'Inloggningen avbröts. Du kan försöka igen när du vill.',
  state: 'Inloggningen kunde inte verifieras (den kan ha tagit för lång tid). Försök igen.',
  google: 'Google svarade inte som väntat. Försök igen om en stund.',
  'not-verified': 'Ditt Google-konto har ingen bekräftad e-postadress.',
  config: 'Inloggning med Google är inte tillgänglig just nu.',
};

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');

function MinaSidor() {
  const { customer, loading, logout } = useCustomer();
  const { formatPrice } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const errorCode = searchParams.get('error');

  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(null);

  // Hämta kundens EGNA ordrar – servern avgör vems de är utifrån cookien
  useEffect(() => {
    if (!customer) return;
    fetch(`${API}/account/orders`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);
        setOrders(data.orders);
      })
      .catch((err) => setOrdersError(err.message));
  }, [customer]);

  if (loading) return <div className="page-container"><p>Laddar…</p></div>;

  // ───── Inte inloggad: visa knappen (och eventuellt fel) ─────
  if (!customer) {
    return (
      <div className="page-container account">
        <h1>Mina sidor</h1>
        {errorCode && (
          <p className="account-error">{ERRORS[errorCode] ?? 'Inloggningen misslyckades. Försök igen.'}</p>
        )}
        <p>Logga in för att se dina beställningar.</p>
        {/* En vanlig länk – inte fetch – eftersom webbläsaren ska skickas vidare till Google */}
        <a href={`${API}/auth/google`} className="btn btn-google" onClick={() => setSearchParams({})}>
          Logga in med Google
        </a>
        <p className="account-hint">
          Vi får bara ditt namn och din e-postadress från Google.{' '}
          <Link to="/integritetspolicy">Så hanterar vi dina uppgifter</Link>
        </p>
        <p className="account-hint">
          Admin? <Link to="/login">Logga in här</Link>
        </p>
      </div>
    );
  }

  // ───── Inloggad: kundens ordrar ─────
  return (
    <div className="page-container account">
      <h1>Mina sidor</h1>
      <p>Inloggad som <strong>{customer.name}</strong> ({customer.email})</p>
      <button className="btn" onClick={logout}>Logga ut</button>

      <h2>Mina beställningar</h2>
      {ordersError && <p className="account-error">Kunde inte hämta dina beställningar: {ordersError}</p>}
      {!ordersError && orders.length === 0 && (
        <p>Du har inga beställningar än. <Link to="/kollektion">Börja handla</Link></p>
      )}

      {orders.map((o) => (
        <div key={o.orderid} className="account-order">
          <div className="account-order-head">
            <strong>Order #{o.orderid}</strong>
            <span>{formatDate(o.created_at)}</span>
            <span className={`account-status status-${o.orderstatus}`}>{o.orderstatus}</span>
          </div>
          {o.items.map((item, i) => (
            <p key={i}>{item.antal} × {item.namn} – {formatPrice(Number(item.pris) * item.antal)}</p>
          ))}
          <p>Frakt: {Number(o.frakt) === 0 ? 'Fri frakt' : formatPrice(Number(o.frakt))}
            {o.ombud_namn && <> · Ombud: {o.ombud_namn}</>}
          </p>
          <p><strong>Totalt: {formatPrice(Number(o.pris) + Number(o.frakt))}</strong></p>
        </div>
      ))}
    </div>
  );
}

export default MinaSidor;