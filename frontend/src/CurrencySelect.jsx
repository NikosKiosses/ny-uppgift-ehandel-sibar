import { useCurrency, CURRENCIES } from './CurrencyContext';

function CurrencySelect() {
  const { currency, setCurrency, error } = useCurrency();

  return (
    <select
      className="currency-select"
      value={currency}
      onChange={(e) => setCurrency(e.target.value)}
      disabled={!!error}
      title={error ?? 'Välj valuta'}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

export default CurrencySelect;