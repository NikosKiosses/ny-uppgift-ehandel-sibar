import { z } from 'zod';
import { pool } from '../db.ts';

export const CartItems = z
  .array(
    z.object({
      productid: z.coerce.number().int().positive('Ogiltig produkt'),
      antal: z.coerce.number().int('Antal måste vara ett heltal').min(1, 'Antal måste vara minst 1').max(99, 'Högst 99 av samma vara'),
    }),
  )
  .min(1, 'Varukorgen är tom')
  .max(50, 'För många olika varor');

export type CartLine = { productid: number; name: string; unitPrice: number; quantity: number };

export class CartError extends Error {}

type ProductForSale = { productid: number; product_beskr: string | null; pris: string | null; lagersaldo: number };

export async function priceCart(items: z.infer<typeof CartItems>) {
  const quantities = new Map<number, number>();
  for (const item of items) quantities.set(item.productid, (quantities.get(item.productid) ?? 0) + item.antal);

  const { rows: products } = await pool.query<ProductForSale>(
    'SELECT productid, product_beskr, pris, lagersaldo FROM products WHERE productid = ANY($1)',
    [[...quantities.keys()]],
  );

  const lines: CartLine[] = [];
  for (const [productid, antal] of quantities) {
    const product = products.find((p) => p.productid === productid);
    const price = Number(product?.pris);
    if (!product || !(price > 0)) throw new CartError(`Produkten med id ${productid} finns inte eller saknar pris`);
    if (product.lagersaldo < antal) {
      throw new CartError(`${product.product_beskr} finns bara i ${product.lagersaldo} ex i lager (du ville köpa ${antal})`);
    }
    lines.push({ productid, name: product.product_beskr ?? `Produkt ${productid}`, unitPrice: price, quantity: antal });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return { lines, subtotal };
}