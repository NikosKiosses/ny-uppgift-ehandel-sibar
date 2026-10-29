const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

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

export async function fetchJson(url: string, options?: FetchOptions): Promise<unknown> {
  const response = await fetchWithRetry(url, options);
  return response.json();
}

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