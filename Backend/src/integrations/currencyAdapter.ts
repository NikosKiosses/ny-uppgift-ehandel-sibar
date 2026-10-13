const BASE_URL = process.env.CURRENCY_API_URL ?? 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 5000; // 5 sekunder
import { fetchJson } from '../lib/fetchJson.ts';

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

export type Rates = {
  base: string;
  date: string;
  rates: Record<string, number>;
};

// Vårt eget feltyp. Den bär med sig en HTTP-statuskod,
// så att routen senare vet vad den ska svara React.
export class CurrencyError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);          // skicka meddelandet vidare till Error
    this.name = 'CurrencyError';
    this.status = status;
  }
}

export async function getRates(
  base = 'EUR',
  symbols = ['SEK', 'EUR', 'USD', 'DKK']
): Promise<Rates> {
  const url = new URL(`${BASE_URL}/latest`);
  url.searchParams.set('base', base);
  url.searchParams.set('symbols', symbols.filter((s) => s !== base).join(','));

const data = (await fetchJson(url.toString(), { timeoutMs: TIMEOUT_MS })) as FrankfurterResponse;

  return {
    base: data.base,
    date: data.date,
    rates: { ...data.rates, [base]: 1 },
  };
}