import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

const LOW_STOCK = 5;
const FALLBACK_ERROR = 'Kunde inte hämta produkterna just nu. Försök igen om en stund.';

function Kollektion() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { cart, addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/products`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || FALLBACK_ERROR);
      setProducts(data);
    } catch (err) {
      // Nätverksfel (backend nere) ger "Failed to fetch" – visa då vår egen text
      setError(err instanceof TypeError ? FALLBACK_ERROR : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const inCart = (id) => cart.filter((item) => item.productid === id).length;

  if (loading) return <p className="page-container">Hämtar produkter...</p>;

  if (error) {
    return (
      <div className="page-container">
        <p>{error}</p>
        <button className="btn" onClick={loadProducts}>Försök igen</button>
      </div>
    );
  }

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