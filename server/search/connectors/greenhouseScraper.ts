import {
  extractExplicitDurationText,
  extractExplicitStartDate,
  stripHtmlToText,
} from '../extractors/jsonLdExtractor.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  ScraperConnector,
  SearchCriteria,
} from '../types.ts';
import { createTtlCache } from '../utils/cache.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';

export interface GreenhouseTargetBoard {
  readonly token: string;
  readonly organization: string;
}

export const DEFAULT_GREENHOUSE_BOARDS: readonly GreenhouseTargetBoard[] = [
  { token: 'datadog', organization: 'Datadog' },
  { token: 'mirakl', organization: 'Mirakl' },
  { token: 'dataiku', organization: 'Dataiku' },
  { token: 'algolia', organization: 'Algolia' },
  { token: 'doctolib', organization: 'Doctolib' },
  { token: 'contentsquare', organization: 'Contentsquare' },
  { token: 'spendesk', organization: 'Spendesk' },
  { token: 'payfit', organization: 'PayFit' },
];

const greenhouseCache = createTtlCache<readonly RawScrapedOffer[]>(5 * 60 * 1000);

export const parseGreenhouseBoardToken = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('greenhouse.io')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'v1' && segments[1] === 'boards' && segments[2]) {
      return segments[2];
    }
    return segments[0] ?? null;
  } catch {
    return null;
  }
};

export const parseGreenhouseJobsPayload = (
  payload: unknown,
  organization: string,
  sourceName: string
): readonly RawScrapedOffer[] => {
  if (!payload || typeof payload !== 'object') return [];
  const jobs = (payload as { jobs?: unknown[] }).jobs;
  if (!Array.isArray(jobs)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of jobs) {
    if (!item || typeof item !== 'object') continue;
    const job = item as Record<string, unknown>;
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const absoluteUrl = typeof job.absolute_url === 'string' ? job.absolute_url.trim() : '';
    if (!title || !absoluteUrl) continue;

    const locObj = job.location as Record<string, unknown> | undefined;
    const location =
      locObj && typeof locObj.name === 'string' ? locObj.name.trim() : null;

    const description = stripHtmlToText(
      typeof job.content === 'string' ? job.content : ''
    );
    const fullCorpus = `${title} ${description}`;
    const emailMatch = description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    const updatedAt =
      typeof job.updated_at === 'string' ? job.updated_at.slice(0, 10) : null;

    offers.push({
      title,
      organization,
      organizationSummary: null,
      location,
      workMode: null,
      contractType: /\b(intern|internship|stage|pfe|stagiaire)\b/i.test(fullCorpus)
        ? 'Internship'
        : null,
      duration: extractExplicitDurationText(fullCorpus),
      postedDate: updatedAt,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      skills: [],
      description: description || null,
      originalUrl: absoluteUrl,
      applicationUrl: absoluteUrl,
      applicationEmail: emailMatch ? emailMatch[0].toLowerCase() : null,
      source: sourceName,
      isAtsApi: true,
    });
  }

  return offers;
};

export const fetchGreenhouseBoard = async (
  board: GreenhouseTargetBoard,
  sourceName: string,
  fetchFn: typeof fetch = fetch
): Promise<readonly RawScrapedOffer[]> => {
  const cacheKey = `${sourceName}::${board.token}`;
  const cached = greenhouseCache.get(cacheKey);
  if (cached) return cached;

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs?content=true`;
  const res = await fetchWithRetry(apiUrl, { timeoutMs: 8000, retries: 1, fetchFn });
  if (!res.ok) {
    throw new Error(`Greenhouse API HTTP ${res.status} for board "${board.token}"`);
  }

  const json = JSON.parse(res.bodyText) as unknown;
  const offers = parseGreenhouseJobsPayload(json, board.organization, sourceName);
  greenhouseCache.set(cacheKey, offers);
  return offers;
};

export const createGreenhouseConnector = (
  boards: readonly GreenhouseTargetBoard[] = DEFAULT_GREENHOUSE_BOARDS,
  sourceName = 'Company Career Page',
  fetchFn: typeof fetch = fetch
): ScraperConnector => ({
  id: `greenhouse:${sourceName}`,
  sourceName,
  collect: async (_criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const collected: RawScrapedOffer[] = [];
    const errors: string[] = [];

    const results = await Promise.allSettled(
      boards.map((board) => fetchGreenhouseBoard(board, sourceName, fetchFn))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        collected.push(...r.value);
      } else {
        errors.push(r.reason instanceof Error ? r.reason.message : 'Greenhouse fetch failed');
      }
    }

    return {
      source: sourceName,
      connector: 'greenhouseScraper',
      status: collected.length > 0 ? 'ok' : errors.length > 0 ? 'error' : 'ok',
      offers: collected,
      externalSearchLinks: [],
      durationMs: Date.now() - started,
      message: errors.length > 0 ? errors.join('; ') : `Collected ${collected.length} jobs from ${boards.length} Greenhouse boards`,
    };
  },
});
