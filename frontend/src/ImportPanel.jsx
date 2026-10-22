import { useState } from 'react';

function ImportPanel({ onDone }) {
  const [loading, setLoading] = useState(null);   // 'csv' | 'xml' | null
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  async function runImport(format) {
    setLoading(format);
    setError(null);
    setReport(null);
    try {
      // Relativ adress: Vite-proxyn lokalt, Vercel-rewriten live
      const res = await fetch(`/api/admin/products/import/${format}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);
      setReport(data);
      onDone?.();   // uppdatera produktlistan i AdminProducts
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="import-panel">
      <h2>Importera produkter från leverantör</h2>

      <button onClick={() => runImport('csv')} disabled={loading !== null}>
        {loading === 'csv' ? 'Importerar…' : 'Importera CSV'}
      </button>
      <button onClick={() => runImport('xml')} disabled={loading !== null}>
        {loading === 'xml' ? 'Importerar…' : 'Importera XML'}
      </button>

      {error && <p className="import-error">Importen misslyckades: {error}</p>}

      {report && (
        <div className="import-report">
          <h3>Rapport ({report.format.toUpperCase()}, {report.total} rader i filen)</h3>
          <ul>
            <li>Nya: {report.created}</li>
            <li>Uppdaterade: {report.updated}</li>
            <li>Överhoppade: {report.skipped.length}</li>
          </ul>

          {report.skipped.length > 0 && (
            <table>
              <thead>
                <tr><th>Artikelnr</th><th>Orsak</th></tr>
              </thead>
              <tbody>
                {report.skipped.map((s) => (
                  <tr key={s.sku}>
                    <td>{s.sku}</td>
                    <td>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

export default ImportPanel;