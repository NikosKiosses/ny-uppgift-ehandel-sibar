import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { pool } from '../db.ts';
import { removeProductImage, uploadProductImage, type ImageType } from '../integrations/storageAdapter.ts';
import { syncProducts, type ProductRow } from '../integrations/searchAdapter.ts';

const router = Router();

const MAX_MB = Number(process.env.IMAGE_MAX_MB ?? 4);
const MAX_BYTES = MAX_MB * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });


function receiveImage(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: `Bilden är för stor. Max ${MAX_MB} MB.` });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Kunde inte läsa filen. Skicka EN bild i fältet "image".' });
      return;
    }
    next();
  });
}

function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

type ImageRow = ProductRow & { product_img_path: string | null };

router.get('/image-rules', (_req, res) => {
  res.json({ maxMb: MAX_MB, types: ['image/jpeg', 'image/png'] });
});

router.post('/products/:id/image', receiveImage, async (req, res) => {
  // 1. Validera id och fil
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Ogiltigt produkt-id' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Ingen bild skickades. Välj en JPEG- eller PNG-fil.' });
    return;
  }
  const type = detectImageType(req.file.buffer);
  if (!type) {
    res.status(400).json({ error: 'Filen är inte en JPEG- eller PNG-bild.' });
    return;
  }

  const { rows } = await pool.query<ImageRow>('SELECT productid, sku, product_img_path FROM products WHERE productid = $1', [id]);
  const product = rows[0];
  if (!product) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }
  const oldPath = product.product_img_path;
  const folder = product.sku ?? `id-${product.productid}`;

  let image: { path: string; url: string };
  try {
    image = await uploadProductImage(folder, req.file.buffer, type);
  } catch (err) {
    console.error('[storage] Upload failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Bildtjänsten svarar inte just nu. Produkten har kvar sin gamla bild.' });
    return;
  }

  let updated: ProductRow;
  try {
    const result = await pool.query<ProductRow>(
      'UPDATE products SET product_img = $1, product_img_path = $2 WHERE productid = $3 RETURNING *',
      [image.url, image.path, id],
    );
    updated = result.rows[0]!;
  } catch (err) {
    await removeProductImage(image.path).catch(() => {});
    throw err; // → error handlern svarar 500
  }

  if (oldPath) {
    await removeProductImage(oldPath).catch((err) =>
      console.warn(`[storage] Could not remove old image ${oldPath}:`, err instanceof Error ? err.message : err),
    );
  }

  const searchIndexed = await syncProducts([updated]);
  res.status(201).json({ ...updated, searchIndexed });
});

export default router;