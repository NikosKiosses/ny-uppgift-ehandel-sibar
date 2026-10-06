import { useCart } from '../CartContext';
import { Link } from 'react-router-dom';

function Cart() {
  const { cart, removeFromCart } = useCart();
  const totalPris = cart.reduce((sum, item) => sum + Number(item.pris), 0);

  return (
    <div className="page-container">
      <h1>Varukorg</h1>
      {cart.length === 0 && <p>Din varukorg är tom</p>}
      {cart.map((item, index) => (
        <div className="cart-item" key={index}>
          <span>{item.product_beskr} - {item.pris} kr</span>
          <button className="btn" onClick={() => removeFromCart(index)}>Ta bort</button>
        </div>
      ))}
      <p style={{ marginTop: '16px', fontWeight: 'bold' }}>Totalt: {totalPris} kr</p>
        <Link to="/kollektion" className="btn" style={{ display: 'inline-block', marginTop: '16px', marginRight: '12px', textDecoration: 'none', background: '#666' }}>
        Fortsätt handla
        </Link>
        <Link to="/checkout" className="btn" style={{ display: 'inline-block', marginTop: '16px', textDecoration: 'none' }}>
        Gå till kassan
        </Link>
    </div>
  );
}

export default Cart;