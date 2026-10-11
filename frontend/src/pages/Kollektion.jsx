import { useState, useEffect } from 'react';
import { useCart } from '../CartContext';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../CurrencyContext';

function Kollektion() {
  const [products, setProducts] = useState([]);
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('https://fsu25d-systemutveckling-uppgift-1-min-o0fb.onrender.com/products')
      .then(res => res.json())
      .then(data => setProducts(data));
  }, []);

    return (
    <div className="product-grid">
        {products.map(product => (
        <div className="product-card" key={product.productid}>
            <img src={product.product_img} alt={product.product_beskr} />
            <div className="product-card-body">
            <h3>{product.product_beskr}</h3>
            <p>{formatPrice(product.pris)}</p>
            <p>{product.benefits}</p>
            <button className="btn" onClick={() => { addToCart(product); navigate('/cart'); }}>
            Lägg i varukorg
            </button>            
            </div>
        </div>
        ))}
    </div>
    );
}

export default Kollektion;