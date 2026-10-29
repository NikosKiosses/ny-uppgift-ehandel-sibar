import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCart } from '../CartContext';
import { useCurrency } from '../CurrencyContext';
import { API } from '../api';

const PAGE_SIZE = 12;

const toCartItem = (p) => ({
  productid: p.id,
  product_beskr: p.name,
  pris: p.price,
  product_img: p.image,
});

function Sok() {
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();

  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const setQ = (value) => setSearchParams(value ? { q: value } : {}, { replace: true });

  const [sort, setSort] = useState('relevance');
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);  

  useEffect(() => {
    setPage(1);
  }, [q, sort, inStock]);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q, sort, page: String(page), pageSize: String(PAGE_SIZE) });
      if (inStock) params.set('inStock', 'true');

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/search?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sökningen misslyckades');
        setResults(data.data);
        setMeta(data.meta);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setResults([]);
        setMeta(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, sort, inStock, page]);

  const handleAdd = (product) => {
    addToCart(toCartItem(product));
    setAdded(product.id);
    setTimeout(() => setAdded(null), 1500);
  };

  return (
    <div>
      <div className="sok-header">
        <h1>Sök produkter</h1>
        <div className="sok-kontroller">
          <input
            type="search"
            placeholder="Sök, t.ex. hoodie"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Sök produkter"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sortera">
            <option value="relevance">Mest relevant</option>
            <option value="price_asc">Pris: lägst först</option>
            <option value="price_desc">Pris: högst först</option>
          </select>
          <label>
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
            Bara i lager
          </label>
        </div>

        {error && <p className="sok-fel">{error}</p>}
        {!error && meta && (
          <p className="sok-antal">
            {loading ? 'Söker…' : <>{meta.total} träffar{q && <> för ”{q}”</>}</>}
          </p>
        )}
        {!loading && !error && meta?.total === 0 && <p>Inga produkter matchade din sökning.</p>}
      </div>

      <div className="product-grid">
        {results.map((p) => (
          <div className="product-card" key={p.id}>
            {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
            <div className="product-card-body">
              <h3>{p.name}</h3>
              <p>{formatPrice(p.price)}</p>
              <p>{p.stock > 0 ? `${p.stock} i lager` : 'Slut i lager'}</p>
              <button className="btn" onClick={() => handleAdd(p)} disabled={p.stock <= 0}>
                {added === p.id ? 'Tillagd ✓' : p.stock > 0 ? 'Lägg i varukorg' : 'Slut i lager'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="sok-sidor">
          <button className="btn" onClick={() => setPage((n) => n - 1)} disabled={page <= 1 || loading}>
            ← Föregående
          </button>
          <span>Sida {meta.page} av {meta.totalPages}</span>
          <button className="btn" onClick={() => setPage((n) => n + 1)} disabled={page >= meta.totalPages || loading}>
            Nästa →
          </button>
        </div>
      )}
    </div>
  );
}

export default Sok;