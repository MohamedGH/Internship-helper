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

export interface AshbyTargetBoard {
  readonly boardName: string;
  readonly organization: string;
}

export const DEFAULT_ASHBY_BOARDS: readonly AshbyTargetBoard[] = [
  { boardName: 'alan', organization: 'Alan' },
  { boardName: 'mistral.ai', organization: 'Mistral AI' },
  { boardName: 'qonto', organization: 'Qonto' },
  { boardName: 'pennylane', organization: 'Pennylane' },
  { boardName: 'dust', organization: 'Dust' },
  { boardName: 'huggingface', organization: 'Hugging Face' },
  { boardName: 'pigment', organization: 'Pigment' },
];

const ashbyCache = createTtlCache<readonly RawScrapedOffer[]>(5 * 60 * 1000);

export const parseAshbyBoardName = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('ashbyhq.com')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'posting-api' && segments[1] === 'job-board' && segments[2]) {
      return segments[2];
    }
    return segments[0] ?? null;
  } catch {
    return null;
  }
};

export const parseAshbyBoardPayload = (
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
    if (job.isListed === false) continue;

    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const jobUrl = typeof job.jobUrl === 'string' ? job.jobUrl.trim() : '';
    if (!title || !jobUrl) continue;

    const location = typeof job.location === 'string' ? job.location.trim() : null;
    const isRemote = job.isRemote === true;
    const workplaceType =
      typeof job.workplaceType === 'string'
        ? job.workplaceType.trim()
        : isRemote
          ? 'Remote'
          : null;

    const employmentType =
      typeof job.employmentType === 'string' ? job.employmentType.trim() : null;

    const description =
      typeof job.descriptionPlain === 'string' && job.descriptionPlain.trim()
        ? job.descriptionPlain.trim()
        : stripHtmlToText(typeof job.descriptionHtml === 'string' ? job.descriptionHtml : '');

    const fullCorpus = `${title} ${employmentType ?? ''} ${description}`;
    const emailMatch = description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    const publishedAt =
      typeof job.publishedAt === 'string' ? job.publishedAt.slice(0, 10) : null;

    const applyUrl =
      typeof job.applyUrl === 'string' && job.applyUrl.trim() ? job.applyUrl.trim() : jobUrl;

    offers.push({
      title,
      organization,
      organizationSummary: null,
      location,
      workMode: workplaceType,
      contractType:
        employmentType ??
        (/\b(intern|internship|stage|pfe|stagiaire)\b/i.test(fullCorpus)
          ? 'Internship'
          : null),
      duration: extractExplicitDurationText(fullCorpus),
      postedDate: publishedAt,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      skills: [],
      description: description || null,
      originalUrl: jobUrl,
      applicationUrl: applyUrl,
      applicationEmail: emailMatch ? emailMatch[0].toLowerCase() : null,
      source: sourceName,
      isAtsApi: true,
    });
  }

  return offers;
};

export const fetchAshbyBoard = async (
  board: AshbyTargetBoard,
  sourceName: string,
  fetchFn: typeof fetch = fetch
): Promise<readonly RawScrapedOffer[]> => {
  const cacheKey = `${sourceName}::${board.boardName}`;
  const cached = ashbyCache.get(cacheKey);
  if (cached) return cached;

  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardName)}?includeCompensation=true`;
  const res = await fetchWithRetry(apiUrl, { timeoutMs: 8000, retries: 1, fetchFn });
  if (!res.ok) {
    throw new Error(`Ashby API HTTP ${res.status} for board "${board.boardName}"`);
  }

  const json = JSON.parse(res.bodyText) as unknown;
  const offers = parseAshbyBoardPayload(json, board.organization, sourceName);
  ashbyCache.set(cacheKey, offers);
  return offers;
};

export const createAshbyConnector = (
  boards: readonly AshbyTargetBoard[] = DEFAULT_ASHBY_BOARDS,
  sourceName = 'Company Career Page',
  fetchFn: typeof fetch = fetch
): ScraperConnector => ({
  id: `ashby:${sourceName}`,
  sourceName,
  collect: async (_criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const collected: RawScrapedOffer[] = [];
    const errors: string[] = [];

    const results = await Promise.allSettled(
      boards.map((board) => fetchAshbyBoard(board, sourceName, fetchFn))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        collected.push(...r.value);
      } else {
        errors.push(r.reason instanceof Error ? r.reason.message : 'Ashby fetch failed');
      }
    }

    return {
      source: sourceName,
      connector: 'ashbyScraper',
      status: collected.length > 0 ? 'ok' : errors.length > 0 ? 'error' : 'ok',
      offers: collected,
      externalSearchLinks: [],
      durationMs: Date.now() - started,
      message: errors.length > 0 ? errors.join('; ') : `Collected ${collected.length} jobs from ${boards.length} Ashby boards`,
    };
  },
});
