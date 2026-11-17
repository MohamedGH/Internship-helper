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

export interface LeverTargetBoard {
  readonly slug: string;
  readonly organization: string;
}

export const DEFAULT_LEVER_BOARDS: readonly LeverTargetBoard[] = [
  { slug: 'swile', organization: 'Swile' },
  { slug: 'qonto', organization: 'Qonto' },
  { slug: 'blablacar', organization: 'BlaBlaCar' },
];

const leverCache = createTtlCache<readonly RawScrapedOffer[]>(5 * 60 * 1000);

export const parseLeverSlug = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('lever.co')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'v0' && segments[1] === 'postings' && segments[2]) {
      return segments[2];
    }
    return segments[0] ?? null;
  } catch {
    return null;
  }
};

export const parseLeverPostingsPayload = (
  payload: unknown,
  organization: string,
  sourceName: string
): readonly RawScrapedOffer[] => {
  if (!Array.isArray(payload)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const post = item as Record<string, unknown>;
    const title = typeof post.text === 'string' ? post.text.trim() : '';
    const hostedUrl = typeof post.hostedUrl === 'string' ? post.hostedUrl.trim() : '';
    if (!title || !hostedUrl) continue;

    const categories = (post.categories as Record<string, unknown> | undefined) ?? {};
    const location =
      typeof categories.location === 'string' ? categories.location.trim() : null;
    const commitment =
      typeof categories.commitment === 'string' ? categories.commitment.trim() : null;

    const workplaceType =
      typeof post.workplaceType === 'string' ? post.workplaceType.trim() : null;

    const listsText = Array.isArray(post.lists)
      ? post.lists
          .map((l) =>
            l && typeof l === 'object'
              ? `${(l as Record<string, unknown>).text ?? ''} ${stripHtmlToText(String((l as Record<string, unknown>).content ?? ''))}`
              : ''
          )
          .join(' ')
      : '';

    const descPlain =
      typeof post.descriptionPlain === 'string' && post.descriptionPlain.trim()
        ? post.descriptionPlain.trim()
        : stripHtmlToText(typeof post.description === 'string' ? post.description : '');

    const description = [descPlain, listsText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const fullCorpus = `${title} ${commitment ?? ''} ${description}`;
    const emailMatch = description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    const createdAtMs = typeof post.createdAt === 'number' ? post.createdAt : null;
    const postedDate =
      createdAtMs && createdAtMs > 0
        ? new Date(createdAtMs).toISOString().slice(0, 10)
        : null;

    const applyUrl =
      typeof post.applyUrl === 'string' && post.applyUrl.trim()
        ? post.applyUrl.trim()
        : `${hostedUrl}/apply`;

    offers.push({
      title,
      organization,
      organizationSummary: `${organization} — Official Lever ATS job board.`,
      location,
      workMode: workplaceType,
      contractType:
        commitment ??
        (/\b(intern|internship|stage|pfe|stagiaire)\b/i.test(fullCorpus)
          ? 'Internship'
          : null),
      duration: extractExplicitDurationText(fullCorpus),
      postedDate,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      skills: [],
      description: description || null,
      originalUrl: hostedUrl,
      applicationUrl: applyUrl,
      applicationEmail: emailMatch ? emailMatch[0].toLowerCase() : null,
      source: sourceName,
      isAtsApi: true,
    });
  }

  return offers;
};

export const fetchLeverBoard = async (
  board: LeverTargetBoard,
  sourceName: string,
  fetchFn: typeof fetch = fetch
): Promise<readonly RawScrapedOffer[]> => {
  const cacheKey = `${sourceName}::${board.slug}`;
  const cached = leverCache.get(cacheKey);
  if (cached) return cached;

  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(board.slug)}?mode=json`;
  const res = await fetchWithRetry(apiUrl, { timeoutMs: 8000, retries: 1, fetchFn });
  if (!res.ok) {
    throw new Error(`Lever API HTTP ${res.status} for slug "${board.slug}"`);
  }

  const json = JSON.parse(res.bodyText) as unknown;
  const offers = parseLeverPostingsPayload(json, board.organization, sourceName);
  leverCache.set(cacheKey, offers);
  return offers;
};

export const createLeverConnector = (
  boards: readonly LeverTargetBoard[] = DEFAULT_LEVER_BOARDS,
  sourceName = 'Company Career Page',
  fetchFn: typeof fetch = fetch
): ScraperConnector => ({
  id: `lever:${sourceName}`,
  sourceName,
  collect: async (_criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const collected: RawScrapedOffer[] = [];
    const errors: string[] = [];

    const results = await Promise.allSettled(
      boards.map((board) => fetchLeverBoard(board, sourceName, fetchFn))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        collected.push(...r.value);
      } else {
        errors.push(r.reason instanceof Error ? r.reason.message : 'Lever fetch failed');
      }
    }

    return {
      source: sourceName,
      connector: 'leverScraper',
      status: collected.length > 0 ? 'ok' : errors.length > 0 ? 'error' : 'ok',
      offers: collected,
      externalSearchLinks: [],
      durationMs: Date.now() - started,
      message: errors.length > 0 ? errors.join('; ') : `Collected ${collected.length} jobs from ${boards.length} Lever boards`,
    };
  },
});
