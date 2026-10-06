import { useState } from 'react';
import { useCart } from '../CartContext';

function Checkout() {
  const { cart } = useCart();
  const totalPris = cart.reduce((sum, item) => sum + Number(item.pris), 0);

  const [namn, setNamn] = useState('');
  const [adress, setAdress] = useState('');
  const [telefon, setTelefon] = useState('');

  const handleBetala = () => {
    const varor = cart.map(item => ({
      product_id: item.productid,
      antal: 1
    }));

    fetch('https://fsu25d-systemutveckling-uppgift-1-min-o0fb.onrender.com/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 1,
        pris: totalPris,
        moms: Math.round(totalPris * 0.25),
        frakt: 49,
        varor: varor,
        leverans_namn: namn,
        leverans_adress: adress,
        leverans_telefon: telefon
      })
    })
      .then(res => res.json())
      .then(data => {
        console.log('Order skapad:', data);
      });
  };

  return (
    <div className="page-container">
      <h1>Kassan</h1>

      <input placeholder="Namn" value={namn} onChange={(e) => setNamn(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      <input placeholder="Adress" value={adress} onChange={(e) => setAdress(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      <input placeholder="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />

      <p>Delsumma: {totalPris} kr</p>
      <p>Moms (25%): {Math.round(totalPris * 0.25)} kr</p>
      <p>Frakt: 49 kr</p>
      <p><strong>Totalt: {totalPris + Math.round(totalPris * 0.25) + 49} kr</strong></p>
      <button className="btn" onClick={handleBetala}>Betala</button>
    </div>
  );
}

export default Checkout;