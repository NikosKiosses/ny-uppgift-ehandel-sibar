import { z } from 'zod';
import { fetchJson } from '../lib/fetchJson.ts';

const BASE_URL = process.env.CURRENCY_API_URL ?? 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 5000;
const CACHE_MS = Number(process.env.CURRENCY_CACHE_SECONDS ?? 3600) * 1000;

// Hur Frankfurters svar SKA se ut. Kontrolleras när programmet körs.
const FrankfurterResponse = z.object({
  amount: z.number(),
  base: z.string().length(3),
  date: z.iso.date(),
  rates: z.record(z.string(), z.number().positive()),
});

type FrankfurterResponse = z.infer<typeof FrankfurterResponse>;

// VÅRT format – det här får routes och React
export type Rates = {
  base: string;
  date: string;
  rates: Record<string, number>;
};

// ─────────────────────────────────────────────
// Hämta från Frankfurter (det här är "att gå och handla")
// ─────────────────────────────────────────────
async function fetchRates(base: string, symbols: string[]): Promise<Rates> {
  const url = new URL(`${BASE_URL}/latest`);
  url.searchParams.set('base', base);
  url.searchParams.set('symbols', symbols.filter((s) => s !== base).join(','));

  console.log(`[currency] Hämtar nya kurser för ${base} från Frankfurter`);
  const raw = await fetchJson(url.toString(), { timeoutMs: TIMEOUT_MS });

  const parsed = FrankfurterResponse.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Frankfurter responded with an unexpected format:\n${z.prettifyError(parsed.error)}`);
  }
  const data = parsed.data;

  return {
    base: data.base,
    date: data.date,
    rates: { ...data.rates, [base]: 1 },
  };
}

// ─────────────────────────────────────────────
// Cache i minnet 
// ─────────────────────────────────────────────
const cache = new Map<string, { value: Rates; expiresAt: number }>();

export async function getRates(
  base = 'SEK',
  symbols = ['SEK', 'EUR', 'USD', 'DKK']
): Promise<Rates & { fromCache: boolean }> {
  // 1. Finns det något färskt i kylen?
  const cached = cache.get(base);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, fromCache: true };   // HIT
  }

  // 2. Annars: hämta, lägg i kylen med ett "bäst före"-datum, returnera
  const value = await fetchRates(base, symbols);
  cache.set(base, { value, expiresAt: Date.now() + CACHE_MS });
  return { ...value, fromCache: false };           // MISS
}