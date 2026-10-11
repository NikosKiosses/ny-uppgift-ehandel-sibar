import { Router } from 'express';
import { getRates, CurrencyError } from '../integrations/currencyAdapter.ts';

const router = Router();

const TILLÅTNA_VALUTOR = ['SEK', 'EUR', 'USD', 'DKK'];

// GET /api/currency/rates?base=SEK
router.get('/rates', async (req, res) => {
  // 1. Läs ?base=... från adressen. Saknas den använder vi SEK.
  const base = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'SEK';

  // 2. Kontrollera att valutan är tillåten innan vi ens frågar Frankfurter
  if (!TILLÅTNA_VALUTOR.includes(base)) {
    res.status(400).json({ error: `Valutan ${base} stöds inte` });
    return;
  }

  // 3. Anropa adaptern och fånga eventuella fel
  try {
    const kurser = await getRates(base, TILLÅTNA_VALUTOR);
    res.json(kurser);
  } catch (err) {
    const status = err instanceof CurrencyError ? err.status : 500;
    const meddelande = err instanceof Error ? err.message : 'Okänt fel';

    console.error('[currency]', meddelande);   // till DIG i terminalen
    res.status(status).json({ error: meddelande }); // till React
  }
});

export default router;