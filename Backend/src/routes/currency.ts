import { Router } from 'express';
import { getRates } from '../integrations/currencyAdapter.ts';

const router = Router();

const TILLÅTNA_VALUTOR = ['SEK', 'EUR', 'USD', 'DKK'];

router.get('/rates', async (req, res) => {
  const base = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'SEK';

  if (!TILLÅTNA_VALUTOR.includes(base)) {
    res.status(400).json({ error: `Valutan ${base} stöds inte` });
    return;
  }

  const kurser = await getRates(base, TILLÅTNA_VALUTOR);
  res.set('X-Cache', kurser.fromCache ? 'HIT' : 'MISS');
  res.json(kurser);
});

export default router;