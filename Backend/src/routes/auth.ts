import { Router, type CookieOptions } from 'express';
import { pool } from '../db.ts';
import { exchangeCode, getAuthorizeUrl } from '../integrations/googleAdapter.ts';
import { randomString, toCodeChallenge } from '../lib/pkce.ts';
import { cookieOptions, endSession, readCustomer, startSession, type Customer } from '../lib/session.ts';

const router = Router();

// Dit kunden skickas efter inloggningen (en sida i React). Fel skickas med som ?error=…
const DONE_PAGE = '/mina-sidor';

// state och code verifier för EN inloggning: gäller i 10 minuter och skickas bara till /api/auth/google…
const flowCookie = (): CookieOptions => ({ ...cookieOptions(), path: '/api/auth/google', maxAge: 10 * 60 * 1000 });

// ─────────────────────────────────────────────
// START: GET /api/auth/google → kunden skickas till Google
// ─────────────────────────────────────────────
router.get('/google', (_req, res) => {
  const state = randomString();
  const codeVerifier = randomString();

  let url: string;
  try {
    url = getAuthorizeUrl(state, toCodeChallenge(codeVerifier));
  } catch (err) {
    console.error('[auth] Google is not configured:', err instanceof Error ? err.message : err);
    res.redirect(`${DONE_PAGE}?error=config`);
    return;
  }

  // Sparas i httpOnly-cookies, så att vi kan kontrollera dem när kunden kommer tillbaka
  res.cookie('oauth_state', state, flowCookie());
  res.cookie('oauth_verifier', codeVerifier, flowCookie());
  console.log('[auth] 1. Sending the customer to Google');
  res.redirect(url);
});

// ─────────────────────────────────────────────
// CALLBACK: GET /api/auth/google/callback?code=…&state=…  (Google skickar tillbaka kunden hit)
// ─────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState: unknown = req.cookies?.oauth_state;
  const codeVerifier: unknown = req.cookies?.oauth_verifier;

  // Används bara EN gång – kastas direkt
  res.clearCookie('oauth_state', flowCookie());
  res.clearCookie('oauth_verifier', flowCookie());

  // Kunden klickade "Avbryt" hos Google (error=access_denied) eller annat fel från Google
  if (error) {
    console.warn(`[auth] Google returned error: ${String(error)}`);
    res.redirect(`${DONE_PAGE}?error=${error === 'access_denied' ? 'cancelled' : 'google'}`);
    return;
  }

  // Inte den inloggning VI startade → stoppa. Utan verifier kan koden inte heller bytas
  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof expectedState !== 'string' ||
    typeof codeVerifier !== 'string' ||
    state !== expectedState
  ) {
    console.warn('[auth] State missing or does not match – login rejected');
    res.redirect(`${DONE_PAGE}?error=state`);
    return;
  }

  // 3. Byt koden mot Googles ID-token – på servern, med client secret och code verifier
  let googleUser;
  try {
    googleUser = await exchangeCode(code, codeVerifier);
  } catch (err) {
    console.error('[auth] Google login failed:', err instanceof Error ? err.message : err);
    res.redirect(`${DONE_PAGE}?error=google`);
    return;
  }
  if (!googleUser.emailVerified) {
    res.redirect(`${DONE_PAGE}?error=not-verified`);
    return;
  }

  // 4. Hitta kunden via Googles sub – ALDRIG via e-post – eller skapa den vid första inloggningen.
  //    Namn och e-post uppdateras om kunden har ändrat dem hos Google.
  const { rows } = await pool.query<{ customerid: number; name: string; email: string; created: boolean }>(
    `INSERT INTO customers (google_sub, email, name, last_login_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, last_login_at = now()
     RETURNING customerid, name, email, (xmax = 0) AS created`,
    [googleUser.sub, googleUser.email, googleUser.name],
  );
  const row = rows[0]!;
  const customer: Customer = { id: row.customerid, name: row.name, email: row.email };
  console.log(`[auth] 2. Customer ${customer.id} logged in (${row.created ? 'new' : 'existing'} customer)`);

  // 5. Shoppens EGEN inloggning: vår JWT i en httpOnly-cookie. Googles token når aldrig webbläsaren.
  startSession(res, customer);
  res.redirect(DONE_PAGE);
});

// ─────────────────────────────────────────────
// VEM ÄR INLOGGAD? GET /api/auth/me → { customer } eller { customer: null }
// (200 även utloggad – React använder den för att visa rätt knapp i headern)
// ─────────────────────────────────────────────
router.get('/me', (req, res) => {
  res.json({ customer: readCustomer(req) });
});

// ─────────────────────────────────────────────
// LOGGA UT: POST /api/auth/logout
// React kan inte ta bort httpOnly-cookies själv – det måste servern göra.
// ─────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  endSession(res);
  res.json({ loggedOut: true });
});

export default router;