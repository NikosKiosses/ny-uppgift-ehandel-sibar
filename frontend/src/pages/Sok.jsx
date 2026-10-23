import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API } from '../api';

const PAGE_SIZE = 12;

function Sok() {
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

  // Ny söktext, sortering eller filter → börja om på sida 1
  useEffect(() => {
    setPage(1);
  }, [q, sort, inStock]);

  useEffect(() => {
    // AbortController: skriver man snabbt avbryts den gamla sökningen,
    // så ett gammalt svar aldrig skriver över ett nyare.
    const controller = new AbortController();

    // Debounce: vänta 300 ms efter sista tangenttrycket innan vi söker
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
        if (err.name === 'AbortError') return;   // avbruten med flit – inget fel
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

  return (
    <div className="sok">
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
      {loading && <p>Söker…</p>}

      {meta && !error && (
        <p>{meta.total} träffar{q && <> för ”{q}”</>}</p>
      )}

      {!loading && !error && meta?.total === 0 && <p>Inga produkter matchade din sökning.</p>}

      <div className="sok-resultat">
        {results.map((p) => (
          <article key={p.id} className="sok-produkt">
            {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
            <h3>{p.name}</h3>
            {p.category && <p>{p.category}</p>}
            <p>{p.price} kr</p>
            <p>{p.stock > 0 ? `${p.stock} i lager` : 'Slut i lager'}</p>
          </article>
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="sok-sidor">
          <button onClick={() => setPage((n) => n - 1)} disabled={page <= 1 || loading}>
            ← Föregående
          </button>
          <span>Sida {meta.page} av {meta.totalPages}</span>
          <button onClick={() => setPage((n) => n + 1)} disabled={page >= meta.totalPages || loading}>
            Nästa →
          </button>
        </div>
      )}
    </div>
  );
}

export default Sok;