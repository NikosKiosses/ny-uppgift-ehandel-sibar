import { createContext, useContext, useEffect, useState } from 'react';

export const CURRENCIES = ['SEK', 'EUR', 'USD', 'DKK'];

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('SEK');

  const [rates, setRates] = useState({ SEK: 1 });

  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/currency/rates')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        console.log('Kurser hämtade:', data.rates);
        setRates(data.rates);
      })
      .catch((err) => setError(err.message));
  }, []);

  function formatPrice(priceInSek) {
    const rate = rates[currency];
    const visadValuta = rate ? currency : 'SEK';   // saknas kursen: visa SEK
    const belopp = Number(priceInSek) * (rate ?? 1);

    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: visadValuta,
    }).format(belopp);
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice, error }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}