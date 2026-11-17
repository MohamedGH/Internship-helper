import { assertSafePublicUrl } from '../security/urlGuard.ts';

export const DEFAULT_USER_AGENT =
  'StagePilotBot/1.0 (Internship Research Assistant; respectful-crawler)';

export interface HttpFetchOptions {
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly minDomainIntervalMs?: number;
  readonly headers?: Record<string, string>;
  readonly fetchFn?: typeof fetch;
  readonly skipDnsCheck?: boolean;
}

export interface HttpResponseResult {
  readonly ok: boolean;
  readonly status: number;
  readonly url: string;
  readonly contentType: string;
  readonly bodyText: string;
}

const lastDomainRequestAt = new Map<string, number>();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const throttleDomain = async (url: string, minIntervalMs: number): Promise<void> => {
  if (minIntervalMs <= 0) return;
  try {
    const host = new URL(url).hostname;
    const prev = lastDomainRequestAt.get(host) ?? 0;
    const elapsed = Date.now() - prev;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    lastDomainRequestAt.set(host, Date.now());
  } catch {
    // Ignore malformed domain tracking
  }
};

export const fetchWithRetry = async (
  rawUrl: string,
  options: HttpFetchOptions = {}
): Promise<HttpResponseResult> => {
  const {
    timeoutMs = 8000,
    retries = 1,
    retryDelayMs = 450,
    minDomainIntervalMs = 250,
    headers = {},
    fetchFn = fetch,
    skipDnsCheck = false,
  } = options;

  if (!skipDnsCheck) {
    const safeCheck = await assertSafePublicUrl(rawUrl);
    if (!safeCheck.safe) {
      throw new Error(`SSRF_BLOCKED: ${safeCheck.reason ?? 'Unsafe URL'}`);
    }
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    await throttleDomain(rawUrl, minDomainIntervalMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(rawUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/json, text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          ...headers,
        },
      });
      clearTimeout(timer);

      const contentType = response.headers.get('content-type') ?? '';
      const bodyText = await response.text();

      // Do not retry client errors except 429 rate-limiting
      if (!response.ok && response.status !== 429 && response.status < 500) {
        return {
          ok: false,
          status: response.status,
          url: response.url || rawUrl,
          contentType,
          bodyText,
        };
      }

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          url: response.url || rawUrl,
          contentType,
          bodyText,
        };
      }

      lastError = new Error(`HTTP ${response.status} from ${rawUrl}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }

    attempt += 1;
    if (attempt <= retries) {
      const backoff = retryDelayMs * 2 ** (attempt - 1);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('HTTP request failed');
};
