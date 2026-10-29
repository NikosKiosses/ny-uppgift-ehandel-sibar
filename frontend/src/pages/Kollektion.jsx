import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

const LOW_STOCK = 5; 

function Kollektion() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const { cart, addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/products`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setProducts)
      .catch(() => setError('Kunde inte hämta produkterna just nu. Försök igen om en stund.'));
  }, []);

  const inCart = (id) => cart.filter((item) => item.productid === id).length;

  if (error) return <p className="page-container">{error}</p>;

  return (
    <div className="product-grid">
      {products.map((product) => {
        const stock = product.lagersaldo ?? 0;
        const left = stock - inCart(product.productid); 
        const soldOut = stock <= 0;

        return (
          <div className={`product-card ${soldOut ? 'is-sold-out' : ''}`} key={product.productid}>
            {product.product_img && (
              <img src={product.product_img} alt={product.product_beskr} loading="lazy" />
            )}
            <div className="product-card-body">
              <h3>{product.product_beskr}</h3>
              <p>{formatPrice(product.pris)}</p>
              {product.benefits && <p>{product.benefits}</p>}

              <p className={`stock ${soldOut ? 'stock-out' : stock <= LOW_STOCK ? 'stock-low' : 'stock-ok'}`}>
                {soldOut ? 'Slut i lager' : stock <= LOW_STOCK ? `Få kvar – ${stock} st` : `${stock} i lager`}
              </p>

              <button
                className="btn"
                disabled={left <= 0}
                onClick={() => {
                  addToCart(product);
                  navigate('/cart');
                }}
              >
                {soldOut ? 'Slut i lager' : left <= 0 ? 'Alla i varukorgen' : 'Lägg i varukorg'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Kollektion;