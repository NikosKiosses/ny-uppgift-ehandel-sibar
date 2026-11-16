// Adapter för "Logga in med Google" 
// Det här är den ENDA filen som vet hur Google fungerar: URL:er, client id, client secret och tokenens format.
// Resten av shoppen får VÅR modell: { sub, email, emailVerified, name }.
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const TIMEOUT_MS = Number(process.env.GOOGLE_TIMEOUT_MS ?? 5000);

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function config() {
  if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or GOOGLE_CALLBACK_URL is missing in .env');
  }
  return { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, callbackUrl: CALLBACK_URL };
}

export const isHttps = () => (CALLBACK_URL ?? '').startsWith('https://');

// ─────────────────────────────────────────────
// Skickar kunden till Googles inloggningssida
// ─────────────────────────────────────────────
export function getAuthorizeUrl(state: string, codeChallenge: string): string {
  const { clientId, callbackUrl } = config();
  const params = new URLSearchParams({
    response_type: 'code',            // Authorization Code flow
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'openid email profile',    // MINSTA scope: bara vem kunden är, namn och e-post
    state,                            // kontrolleras i callbacken → skyddar mot CSRF
    code_challenge: codeChallenge,    // PKCE: hashen av en hemlighet bara vår server känner till
    code_challenge_method: 'S256',
    prompt: 'select_account',         // låt kunden välja konto varje gång
  });
  return `${AUTHORIZE_URL}?${params}`;
}

// ─────────────────────────────────────────────
// Koden från callbacken → tokens från Google → vem kunden är
// ─────────────────────────────────────────────

const TokenAnswer = z.object({
  id_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});


const IdTokenClaims = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com'], { error: 'The ID token is not from Google' }),
  aud: z.string(),
  exp: z.number(),
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export type GoogleUser = { sub: string; email: string; emailVerified: boolean; name: string };


export async function exchangeCode(code: string, codeVerifier: string): Promise<GoogleUser> {
  const { clientId, clientSecret, callbackUrl } = config();

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Google token endpoint: no answer within ${TIMEOUT_MS} ms`);
    }
    // Hela orsaken till loggen (t.ex. ett felaktigt värde) – aldrig secret eller kod
    const detail = err instanceof Error
      ? `${err.name}: ${err.message}${err.cause instanceof Error ? ` – ${err.cause.message}` : ''}`
      : String(err);
    throw new Error(`Google token endpoint: ${detail}`);
  }

  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(raw);
    throw new Error(`Google refused the code: ${error.success ? error.data.error : response.status}`);
  }

  const answer = TokenAnswer.safeParse(raw);
  if (!answer.success) throw new Error('Unexpected token answer from Google (no id_token)');

  const claims = IdTokenClaims.safeParse(jwt.decode(answer.data.id_token));
  if (!claims.success) throw new Error(`Invalid ID token from Google: ${z.prettifyError(claims.error)}`);
  if (claims.data.aud !== clientId) throw new Error('The ID token is for another app');
  if (claims.data.exp * 1000 < Date.now()) throw new Error('The ID token has expired');

  return {
    sub: claims.data.sub,
    email: claims.data.email,
    emailVerified: claims.data.email_verified === true,
    name: claims.data.name ?? claims.data.email,
  };
}