import { z } from 'zod';


const API_URL = process.env.RESEND_API_URL ?? 'https://api.resend.com';
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM;
const TIMEOUT_MS = Number(process.env.RESEND_TIMEOUT_MS ?? 5000);

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string; 
};

// Resends svar – kontrolleras innan vi använder det
const SentAnswer = z.object({ id: z.string().min(1) });
const ErrorAnswer = z.object({ message: z.string(), name: z.string().optional() });

export async function sendEmail({ to, subject, html, text, idempotencyKey }: Email): Promise<string> {
  if (!API_KEY || !FROM) throw new Error('RESEND_API_KEY or EMAIL_FROM is missing in .env');

  let response: Response;
  try {
    response = await fetch(`${API_URL}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS} ms` : 'network error';
    throw new Error(`Resend: ${reason}`);
  }

  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    
    const error = ErrorAnswer.safeParse(raw);
    throw new Error(`Resend answered ${response.status}: ${error.success ? error.data.message : 'unknown error'}`);
  }

  const answer = SentAnswer.safeParse(raw);
  if (!answer.success) throw new Error('Unexpected answer from Resend (no id)');
  return answer.data.id;
}