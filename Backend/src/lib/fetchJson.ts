// Fel som kan gå över av sig själva → värda att försöka igen
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

type FetchJsonOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function fetchJson(
  url: string,
  { headers = {}, timeoutMs = 5000 }: FetchJsonOptions = {},
): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    // 1. Försök nå tjänsten
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // fetch KASTAR när vi inte får något svar alls
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error(`No response from ${url} within ${timeoutMs} ms (timeout)`);
      }
      throw new Error(`Could not reach ${url} (network error)`, { cause: err });
    }

    // 2. Lyckades → returnera datan (det avslutar också loopen)
    if (response.ok) {
      return response.json();
    }

    // 3. Inte värt att försöka igen, eller slut på försök → ge upp
    if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`${url} responded with status ${response.status} ${response.statusText}`);
    }

    // 4. Annars: logga, vänta 1 sekund, och låt loopen försöka igen
    console.warn(`Status ${response.status}, attempt ${attempt} of ${MAX_ATTEMPTS}. Trying again in 1 second.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Hit kommer vi aldrig, men TypeScript vill se att funktionen alltid slutar
  throw new Error('Unreachable');
}