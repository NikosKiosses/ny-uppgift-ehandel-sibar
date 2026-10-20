import { fetchJson } from '../lib/fetchJson.ts';
import { z } from 'zod';

const BASE_URL = process.env.CURRENCY_API_URL ?? 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 5000; // 5 sekunder

// Hur Frankfurters svar SKA se ut. Kontrolleras när programmet körs.
const FrankfurterResponse = z.object({
  amount: z.number(),
  base: z.string().length(3),                    // "SEK" – exakt 3 bokstäver
  date: z.iso.date(),                            // "2026-10-06"
  rates: z.record(z.string().length(3), z.number()) // { "EUR": 0.091, "USD": 0.098 });
});

// TypeScript-typen skapas FRÅN schemat – vi skriver fälten bara en gång
type FrankfurterResponse = z.infer<typeof FrankfurterResponse>;

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
  base = 'SEK',
  symbols = ['SEK', 'EUR', 'USD', 'DKK']
): Promise<Rates> {
  const url = new URL(`${BASE_URL}/latest`);
  url.searchParams.set('base', base);
  url.searchParams.set('symbols', symbols.filter((s) => s !== base).join(','));

// 1. Hämta – fetchJson sköter timeout, retries och response.ok
  const raw = await fetchJson(url.toString(), { timeoutMs: TIMEOUT_MS });

  // 2. Kontrollera – ser svaret ut som vi förväntar oss?
  const parsed = FrankfurterResponse.safeParse(raw);

  // 3. Fel format → stoppa här med ett tydligt fel
  if (!parsed.success) {
    throw new Error(`Frankfurter responded with an unexpected format:\n${z.prettifyError(parsed.error)}`);
  }

  // 4. Nu VET vi att datan är rätt – inget "as" behövs
  const data = parsed.data;

  return {
    base: data.base,
    date: data.date,
    rates: { ...data.rates, [base]: 1 },
  };
}