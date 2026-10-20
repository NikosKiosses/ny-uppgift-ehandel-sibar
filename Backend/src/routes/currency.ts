import { Router } from 'express';
import { getRates } from '../integrations/currencyAdapter.ts';

const router = Router();

const TILLÅTNA_VALUTOR = ['SEK', 'EUR', 'USD', 'DKK'];

// GET /api/currency/rates?base=SEK
router.get('/rates', async (req, res) => {
  const base = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'SEK';

  // Fel i FÖRFRÅGAN – det är klientens fel, så vi svarar 400 direkt
  if (!TILLÅTNA_VALUTOR.includes(base)) {
    res.status(400).json({ error: `Valutan ${base} stöds inte` });
    return;
  }

  // Inget try/catch! Kastar getRates ett fel skickar Express 5
  // det vidare till error handlern i index.ts
  const kurser = await getRates(base, TILLÅTNA_VALUTOR);
  res.json(kurser);
});

export default router;