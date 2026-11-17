import { pool } from '../db.ts';
import { sendEmail } from '../integrations/emailAdapter.ts';



export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const kr = (amount: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);

export type ConfirmationOrder = {
  orderId: number;
  name: string;
  items: { name: string; quantity: number; price: number }[]; // pris per st i kronor
  shipping: number;
  shippingName: string;
};

export function buildOrderConfirmation(order: ConfirmationOrder) {
  const subtotal = order.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const total = subtotal + order.shipping;
  const subject = `Orderbekräftelse #${order.orderId} – KLEOS`;

  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${kr(i.price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${kr(i.quantity * i.price)}</td>
      </tr>`,
    )
    .join('');

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h1 style="font-size:22px">Tack för din beställning, ${escapeHtml(order.name)}!</h1>
    <p>Vi har tagit emot din betalning för order <strong>#${order.orderId}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #111">Produkt</th>
        <th style="padding:6px 8px;border-bottom:2px solid #111">Antal</th>
        <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111">Pris</th>
        <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111">Summa</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;margin:12px 8px 0">Frakt (${escapeHtml(order.shippingName)}): ${order.shipping === 0 ? 'Fri frakt' : kr(order.shipping)}</p>
    <p style="text-align:right;margin:4px 8px;font-size:18px"><strong>Totalt: ${kr(total)}</strong></p>
    <p style="color:#666;font-size:12px">Priserna inkluderar moms.</p>
  </div>`;

  const text = [
    `Tack för din beställning, ${order.name}!`,
    '',
    `Order #${order.orderId}`,
    '',
    ...order.items.map((i) => `${i.quantity} × ${i.name} – ${kr(i.quantity * i.price)}`),
    '',
    `Frakt (${order.shippingName}): ${order.shipping === 0 ? 'Fri frakt' : kr(order.shipping)}`,
    `Totalt: ${kr(total)}`,
  ].join('\n');

  return { subject, html, text };
}

const SHIPPING_NAMES: Record<string, string> = {
  service_point: 'PostNord – ombud',
  home: 'PostNord – hemleverans',
};

// Skickar bekräftelsen för en BETALD order – högst en gång.
// Kastar ALDRIG: ett misslyckat mejl får inte påverka ordern eller webhookens svar. Felet loggas.
export async function sendOrderConfirmation(orderId: number): Promise<void> {
  try {
    // Bara betalda ordrar som INTE redan har fått sin bekräftelse
    const { rows: orders } = await pool.query<{
      leverans_namn: string; leverans_email: string | null; frakt: string; frakt_metod: string | null; ombud_namn: string | null;
    }>(
      `SELECT leverans_namn, leverans_email, frakt, frakt_metod, ombud_namn
       FROM orders WHERE orderid = $1 AND orderstatus = 'Betald' AND confirmation_email_id IS NULL`,
      [orderId],
    );
    const order = orders[0];
    if (!order) {
      console.log(`[email] Order ${orderId}: confirmation already sent (or order not paid) – skipping`);
      return;
    }
    if (!order.leverans_email) {
      console.warn(`[email] Order ${orderId} has no e-mail address – no confirmation sent`);
      return;
    }

    const { rows: items } = await pool.query<{ namn: string | null; antal: number; pris: string }>(
      `SELECT p.product_beskr AS namn, r.antal, r.pris
       FROM orderrad r LEFT JOIN products p ON p.productid = r.product_id
       WHERE r.order_id = $1`,
      [orderId],
    );

    const email = buildOrderConfirmation({
      orderId,
      name: order.leverans_namn,
      items: items.map((i) => ({ name: i.namn ?? 'Produkt', quantity: i.antal, price: Number(i.pris) })),
      shipping: Number(order.frakt),
      shippingName: order.ombud_namn
        ? `${SHIPPING_NAMES.service_point} ${order.ombud_namn}`
        : SHIPPING_NAMES[order.frakt_metod ?? ''] ?? 'PostNord',
    });

    
    const emailId = await sendEmail({ to: order.leverans_email, ...email, idempotencyKey: `order-confirmation/${orderId}` });

    
    await pool.query('UPDATE orders SET confirmation_email_id = $1 WHERE orderid = $2', [emailId, orderId]);
    console.log(`[email] Order ${orderId}: confirmation sent – Resend id ${emailId}`);
  } catch (err) {
    
    console.error(`[email] Order ${orderId}: confirmation NOT sent:`, err instanceof Error ? err.message : err);
  }
}