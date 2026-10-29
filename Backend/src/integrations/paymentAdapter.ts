
import Stripe from 'stripe';
import { z } from 'zod';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;         
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;  
const TIMEOUT_MS = Number(process.env.STRIPE_TIMEOUT_MS ?? 10000);
const CURRENCY = process.env.STRIPE_CURRENCY ?? 'sek';
const EXPIRES_MINUTES = Math.min(Math.max(Number(process.env.CHECKOUT_EXPIRES_MINUTES ?? 30), 30), 24 * 60);
const CLIENT_URL = process.env.CLIENT_URL;                
let client: Stripe | undefined;
function stripe(): Stripe {
  if (!SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing in .env');

  client ??= new Stripe(SECRET_KEY, { timeout: TIMEOUT_MS, maxNetworkRetries: 2 });
  return client;
}



export type CheckoutLine = {
  name: string;
  unitPrice: number;   // kronor
  quantity: number;
};

export async function createCheckout(
  orderId: number,
  lines: CheckoutLine[],
  shipping?: { name: string; price: number },
  email?: string,
) {
  if (!CLIENT_URL) throw new Error('CLIENT_URL is missing in .env');

  const allLines = shipping && shipping.price > 0
    ? [...lines, { name: shipping.name, unitPrice: shipping.price, quantity: 1 }]
    : lines;

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    ...(email ? { customer_email: email } : {}),
    line_items: allLines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.round(line.unitPrice * 100), 
        product_data: { name: line.name },
      },
    })),
    client_reference_id: String(orderId),
    success_url: `${CLIENT_URL}/orderbekraftelse?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${CLIENT_URL}/cart`,
    expires_at: Math.floor(Date.now() / 1000) + EXPIRES_MINUTES * 60,
  });

  console.log(`[payment] Checkout session ${session.id} created for order ${orderId}`);
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { sessionId: session.id, url: session.url };
}


export type PaymentEvent =
  | { type: 'paid'; orderId: number; sessionId: string }
  | { type: 'expired'; orderId: number; sessionId: string }
  | { type: 'ignored'; reason: string };

const OrderId = z.coerce.number().int().positive();


export function parseWebhook(rawBody: Buffer, signature: string): PaymentEvent {
  if (!WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is missing in .env');
  const event = stripe().webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  console.log(`[payment] Webhook ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status !== 'paid') return { type: 'ignored', reason: 'not paid yet' };
      const orderId = OrderId.safeParse(session.client_reference_id);
      if (!orderId.success) return { type: 'ignored', reason: 'missing or invalid order id' };
      return { type: 'paid', orderId: orderId.data, sessionId: session.id };
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      const orderId = OrderId.safeParse(session.client_reference_id);
      if (!orderId.success) return { type: 'ignored', reason: 'missing or invalid order id' };
      return { type: 'expired', orderId: orderId.data, sessionId: session.id };
    }
    default:
      return { type: 'ignored', reason: event.type };
  }
}