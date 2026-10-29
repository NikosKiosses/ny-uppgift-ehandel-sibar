import { Router } from 'express';
import { z } from 'zod';
import { CartError, CartItems, priceCart } from '../lib/cart.ts';
import { shippingQuote } from '../lib/shippingPrices.ts';
import { findServicePoints, getDeliveryEstimates } from '../integrations/shippingAdapter.ts';

const router = Router();

export const PostalCode = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{5}$/, 'Postnumret ska vara 5 siffror'));

const QuoteRequest = z.object({ items: CartItems, postalCode: PostalCode });

router.post('/quote', async (req, res) => {
  const input = QuoteRequest.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues.map((i) => i.message).join(', ') });
    return;
  }

  let subtotal: number;
  try {
    ({ subtotal } = await priceCart(input.data.items));
  } catch (err) {
    if (err instanceof CartError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const [points, delivery] = await Promise.allSettled([
    findServicePoints(input.data.postalCode),
    getDeliveryEstimates(input.data.postalCode),
  ]);
  if (points.status === 'rejected') console.warn('[shipping]', points.reason instanceof Error ? points.reason.message : points.reason);
  if (delivery.status === 'rejected') console.warn('[shipping]', delivery.reason instanceof Error ? delivery.reason.message : delivery.reason);

  res.json({
    subtotal,
    ...shippingQuote(subtotal),
    servicePoints: points.status === 'fulfilled' ? points.value : [],
    servicePointsError: points.status === 'rejected' ? 'Kunde inte hämta ombud från PostNord just nu. Du kan välja hemleverans.' : null,
    deliveryEstimates: delivery.status === 'fulfilled' ? delivery.value : null,
  });
});

export default router;