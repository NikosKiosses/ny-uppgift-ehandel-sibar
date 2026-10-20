// Gemensam hjälp för ALLA anrop till externa tjänster:
// timeout, retries på tillfälliga fel och kontroll av response.ok.
// fetchJson  → för tjänster som svarar med JSON (t.ex. Frankfurter)
// fetchBytes → för tjänster som skickar filer (t.ex. leverantörens CSV/XML)

// Fel som kan gå över av sig själva → värda att försöka igen
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

// Kärnan: gör anropet med timeout och retries, och returnerar ett lyckat Response.
async function fetchWithRetry(
  url: string,
  { headers = {}, timeoutMs = 5000 }: FetchOptions = {},
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error(`No response from ${url} within ${timeoutMs} ms (timeout)`);
      }
      throw new Error(`Could not reach ${url} (network error)`, { cause: err });
    }

    if (response.ok) return response;

    if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`${url} responded with status ${response.status} ${response.statusText}`);
    }

    console.warn(`Status ${response.status}, attempt ${attempt} of ${MAX_ATTEMPTS}. Trying again in 1 second.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Unreachable');
}

// JSON-svar. unknown = "kontrollera innan du använder det" (t.ex. med Zod).
export async function fetchJson(url: string, options?: FetchOptions): Promise<unknown> {
  const response = await fetchWithRetry(url, options);
  return response.json();
}

// Filer: de RÅA bytesen plus Content-Type, så att anroparen själv kan avkoda
// med rätt teckenkodning. (response.text() avkodar ALLTID som UTF-8.)
export async function fetchBytes(
  url: string,
  options?: FetchOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetchWithRetry(url, options);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? '',
  };
}