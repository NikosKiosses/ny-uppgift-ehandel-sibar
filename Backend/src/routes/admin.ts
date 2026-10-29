import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { getSupplierCatalog } from '../integrations/supplierAdapter.ts';
import { configureIndex, indexProducts, syncProducts, type ProductRow } from '../integrations/searchAdapter.ts';
const router = Router();


const ImportedProduct = z.object({
  sku: z.string().min(1, 'Artikelnummer saknas'),
  ean: z.string().regex(/^\d{13}$/, 'EAN måste vara exakt 13 siffror'),
  name: z.string().min(1, 'Namn saknas'),
  category: z.string().min(1, 'Kategori saknas'),
  price: z.number({ error: 'Priset är inte ett tal' }).positive('Priset måste vara större än 0'),
  stock: z
    .number({ error: 'Lagersaldot är inte ett tal' })
    .int('Lagersaldot måste vara ett heltal')
    .nonnegative('Lagersaldot får inte vara negativt'),
  variants: z.array(z.string().min(1)),
});


const UPSERT_SQL = `
  INSERT INTO products (sku, ean, product_beskr, kategori, pris, lagersaldo, varianter)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (sku) DO UPDATE SET
    ean           = EXCLUDED.ean,
    product_beskr = EXCLUDED.product_beskr,
    kategori      = EXCLUDED.kategori,
    pris          = EXCLUDED.pris,
    lagersaldo    = EXCLUDED.lagersaldo,
    varianter     = EXCLUDED.varianter
  RETURNING *, (xmax = 0) AS inserted
  `;

router.post('/products/import/:format', async (req, res) => {
  const { format } = req.params;
  if (format !== 'csv' && format !== 'xml') {
    res.status(400).json({ error: 'Formatet måste vara csv eller xml' });
    return;
  }

  const candidates = await getSupplierCatalog(format);

    const report = {
    format,
    total: candidates.length,
    created: 0,
    updated: 0,
    skipped: [] as { sku: string; reason: string }[],
    searchIndexed: true,
  };
  const saved: ProductRow[] = [];

  for (const candidate of candidates) {
    const result = ImportedProduct.safeParse(candidate);
    if (!result.success) {
      const reason = result.error.issues.map((issue) => issue.message).join(', ');
      report.skipped.push({ sku: candidate.sku || '(saknas)', reason });
      console.warn(`[import] Skipping ${candidate.sku}: ${reason}`);
      continue;
    }

    const p = result.data;
    const { rows } = await pool.query<ProductRow & { inserted: boolean }>(UPSERT_SQL, [
      p.sku, p.ean, p.name, p.category, p.price, p.stock, p.variants,
    ]);
    const row = rows[0];
    if (!row) continue;

    if (row.inserted) report.created++;
    else report.updated++;
    saved.push(row);
  }

  report.searchIndexed = await syncProducts(saved);

  console.log(
    `[import] ${format.toUpperCase()}: ${report.created} new, ${report.updated} updated, ${report.skipped.length} skipped`,
  );
  res.json(report);
});

router.post('/search/reindex', async (_req, res) => {
  const { rows } = await pool.query<ProductRow>('SELECT * FROM products');
  try {
    await configureIndex();
    const indexed = await indexProducts(rows);
    res.json({ indexed });
  } catch (err) {
    console.error('[search] Could not reindex:', err);
    res.status(502).json({ error: 'Sökindexet kunde inte uppdateras. Försök igen senare.' });
  }
});

export default router;