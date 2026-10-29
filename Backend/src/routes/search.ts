import { Router } from 'express';
import { z } from 'zod';
import { searchProducts, SORTS } from '../integrations/searchAdapter.ts';

const router = Router();

const MAX_PAGE_SIZE = Number(process.env.SEARCH_MAX_PAGE_SIZE ?? 50);

const SearchQuery = z.object({
  q: z.string().trim().max(100, 'Söktexten får vara högst 100 tecken').default(''),
  page: z.coerce.number({ error: 'page måste vara ett tal' }).int('page måste vara ett heltal').min(1, 'page måste vara 1 eller större').default(1),
  pageSize: z.coerce
    .number({ error: 'pageSize måste vara ett tal' })
    .int('pageSize måste vara ett heltal')
    .min(1, 'pageSize måste vara 1 eller större')
    .max(MAX_PAGE_SIZE, `pageSize får vara högst ${MAX_PAGE_SIZE}`)
    .default(12),
  sort: z.enum(SORTS, { error: `sort måste vara ${SORTS.join(', ')}` }).default('relevance'),
  category: z.string().trim().min(1).max(100).optional(),
  inStock: z.stringbool({ error: 'inStock måste vara true eller false' }).optional(),
});

router.get('/', async (req, res) => {
  const result = SearchQuery.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({
      error: 'Ogiltiga sökparametrar',
      details: result.error.issues.map((issue) => issue.message),
    });
    return;
  }

  try {
    res.json(await searchProducts(result.data));
  } catch (err) {
    console.error('[search] Search failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Sökningen är inte tillgänglig just nu. Försök igen om en stund.' });
  }
});

export default router;