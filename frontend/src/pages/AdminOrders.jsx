import { useState, useEffect } from 'react';
import { API } from '../api';

function AdminOrders() {
  const [orders, setOrders] = useState([]);

  const loadOrders = () => {
    fetch(`${API}/orders`)
      .then(res => res.json())
      .then(data => setOrders(data));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = (id, newStatus) => {
    fetch(`${API}/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderstatus: newStatus })
    })
      .then(() => loadOrders());
  };

  return (
    <div>
      <h1>Admin - Ordrar</h1>
      {orders.map(order => (
        <div key={order.orderid}>
          <p>Order #{order.orderid} - {order.pris} kr - Status: {order.orderstatus}</p>
          <select
            value={order.orderstatus}
            onChange={(e) => handleStatusChange(order.orderid, e.target.value)}
          >
            <option value="Beställd">Beställd</option>
            <option value="Behandlas">Behandlas</option>
            <option value="Levererad">Levererad</option>
            <option value="Återbetald">Återbetald</option>
          </select>
        </div>
      ))}
    </div>
  );
}

export default AdminOrders;