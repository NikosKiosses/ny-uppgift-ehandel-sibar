import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { getSupplierCatalog } from '../integrations/supplierAdapter.ts';

const router = Router();

// VÅRA regler för en produkt innan den får sparas. Samma för CSV och XML.
// (L2: kontrollera DERAS data före översättning. L3: VÅRA regler efter översättning.)
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

// Upsert på sku: finns den → uppdatera, annars → skapa.
// Bara fält som LEVERANTÖREN äger uppdateras – bild och benefits lämnas orörda.
// (xmax = 0) är sant när raden precis skapades → så vet vi om den var ny eller uppdaterad.
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
  RETURNING (xmax = 0) AS inserted
`;

// POST /api/admin/products/import/csv  eller  /xml
router.post('/products/import/:format', async (req, res) => {
  // 1. Kontrollera formatet
  const { format } = req.params;
  if (format !== 'csv' && format !== 'xml') {
    res.status(400).json({ error: 'Formatet måste vara csv eller xml' });
    return;
  }

  // 2. Adaptern hämtar, tolkar och översätter. Routen vet inget om CSV, XML eller leverantörens fält.
  const candidates = await getSupplierCatalog(format);

  const report = {
    format,
    total: candidates.length,
    created: 0,
    updated: 0,
    skipped: [] as { sku: string; reason: string }[],
  };

  for (const candidate of candidates) {
    // 3. Validera EN produkt i taget – en trasig produkt stoppar inte resten
    const result = ImportedProduct.safeParse(candidate);
    if (!result.success) {
      const reason = result.error.issues.map((issue) => issue.message).join(', ');
      report.skipped.push({ sku: candidate.sku || '(saknas)', reason });
      console.warn(`[import] Skipping ${candidate.sku}: ${reason}`);
      continue;
    }

    // 4. Spara med upsert
    const p = result.data;
    const saved = await pool.query<{ inserted: boolean }>(UPSERT_SQL, [
      p.sku, p.ean, p.name, p.category, p.price, p.stock, p.variants,
    ]);

    if (saved.rows[0]?.inserted) report.created++;
    else report.updated++;
  }

  // 5. Rapport till admin
  console.log(
    `[import] ${format.toUpperCase()}: ${report.created} new, ${report.updated} updated, ${report.skipped.length} skipped`,
  );
  res.json(report);
});

export default router;