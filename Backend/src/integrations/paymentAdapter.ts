// Adapter för betalning (Stripe).
// Det här är den ENDA filen som vet hur Stripe fungerar: nycklar, öre, line_items och webhook-signaturen.
// Resten av shoppen ser bara VÅR modell: en order och dess rader in – en betal-URL eller en händelse ut.

import Stripe from 'stripe';
import { z } from 'zod';

// Allt som kan ändras ligger i .env – inget hårdkodat
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;          // får skapa betalningar – bara på servern
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;  // verifierar att webhooken kommer från Stripe
const TIMEOUT_MS = Number(process.env.STRIPE_TIMEOUT_MS ?? 10000);
const CURRENCY = process.env.STRIPE_CURRENCY ?? 'sek';
// Stripe kräver minst 30 minuter och högst 24 timmar
const EXPIRES_MINUTES = Math.min(Math.max(Number(process.env.CHECKOUT_EXPIRES_MINUTES ?? 30), 30), 24 * 60);
const CLIENT_URL = process.env.CLIENT_URL;                 // dit Stripe skickar kunden tillbaka

// Klienten skapas först när den behövs → saknas nyckeln kraschar inte hela servern vid start
let client: Stripe | undefined;
function stripe(): Stripe {
  if (!SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing in .env');
  // Timeout per försök. Stripe-klienten gör själv om anropet vid nätverksfel (med samma
  // idempotensnyckel, så samma session skapas aldrig två gånger).
  client ??= new Stripe(SECRET_KEY, { timeout: TIMEOUT_MS, maxNetworkRetries: 2 });
  return client;
}

// ─────────────────────────────────────────────
// 1. SKAPA BETALNING – Stripes egen betalsida (hosted)
// ─────────────────────────────────────────────

// En orderrad i VÅRT format. Priset kommer från VÅR databas, aldrig från React.
export type CheckoutLine = {
  name: string;
  unitPrice: number;   // kronor
  quantity: number;
};

export async function createCheckout(orderId: number, lines: CheckoutLine[]) {
  if (!CLIENT_URL) throw new Error('CLIENT_URL is missing in .env');

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.round(line.unitPrice * 100), // Stripe räknar i öre: 599 kr → 59900
        product_data: { name: line.name },
      },
    })),
    // Vårt order-id följer med betalningen → webhooken vet vilken order som betalades
    client_reference_id: String(orderId),
    // Stripe byter ut {CHECKOUT_SESSION_ID} mot sessionens id innan kunden skickas tillbaka
    success_url: `${CLIENT_URL}/orderbekraftelse?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${CLIENT_URL}/cart`,
    // Hur länge kunden har på sig. Därefter: checkout.session.expired → ordern avbryts
    expires_at: Math.floor(Date.now() / 1000) + EXPIRES_MINUTES * 60,
  });

  console.log(`[payment] Checkout session ${session.id} created for order ${orderId}`);
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { sessionId: session.id, url: session.url };
}

// ─────────────────────────────────────────────
// 2. WEBHOOK – Stripe berättar vad som hänt med betalningen
// ─────────────────────────────────────────────

// Händelsen i VÅRT format – routen behöver inte känna till Stripes händelsetyper
export type PaymentEvent =
  | { type: 'paid'; orderId: number; sessionId: string }
  | { type: 'expired'; orderId: number; sessionId: string }
  | { type: 'ignored'; reason: string };

// client_reference_id är extern data → kontrollera att det är ett giltigt order-id
const OrderId = z.coerce.number().int().positive();

// Kastar om signaturen är fel (t.ex. en falsk "betald" skickad med curl).
// rawBody måste vara bytes EXAKT som Stripe skickade dem – signaturen räknas på dem.
export function parseWebhook(rawBody: Buffer, signature: string): PaymentEvent {
  if (!WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is missing in .env');
  const event = stripe().webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  console.log(`[payment] Webhook ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // "completed" betyder inte alltid betald – t.ex. banköverföring betalas senare
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