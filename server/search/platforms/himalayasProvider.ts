import {
  extractExplicitDurationText,
  extractExplicitStartDate,
} from '../extractors/jsonLdExtractor.ts';
import {
  JobBoardSourceConfig,
  sanitizeOfferByPolicy,
} from '../jobboards/jobBoardPolicy.ts';
import { buildBoardExternalLink } from '../jobboards/jobBoardProvider.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import { createTtlCache } from '../utils/cache.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import {
  PlatformAdapter,
  PlatformProviderOptions,
  dedupeRawOffers,
  stripHtmlTags,
} from './platformProvider.ts';

export interface HimalayasApiJob {
  readonly title?: string;
  readonly companyName?: string;
  readonly employmentType?: string;
  readonly locationRestrictions?: readonly string[];
  readonly categories?: readonly string[];
  readonly excerpt?: string;
  readonly description?: string;
  readonly pubDate?: number;
  readonly expiryDate?: number;
  readonly guid?: string;
  readonly applicationLink?: string;
}

const himalayasCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const parseHimalayasPayload = (
  payload: unknown,
  sourceName = 'Himalayas'
): readonly RawScrapedOffer[] => {
  if (!payload || typeof payload !== 'object') return [];
  const jobs = (payload as { jobs?: unknown[] }).jobs;
  if (!Array.isArray(jobs)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of jobs) {
    if (!item || typeof item !== 'object') continue;
    const job = item as HimalayasApiJob;
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const originalUrl =
      typeof job.guid === 'string' && job.guid.startsWith('http')
        ? job.guid.trim()
        : typeof job.applicationLink === 'string' && job.applicationLink.startsWith('http')
          ? job.applicationLink.trim()
          : '';
    if (!title || !originalUrl) continue;

    const description = stripHtmlTags(job.description || job.excerpt).slice(0, 1600);
    const fullCorpus = `${title} ${job.employmentType ?? ''} ${description}`;

    const location =
      job.locationRestrictions && job.locationRestrictions.length > 0
        ? job.locationRestrictions.join(', ')
        : 'Remote / Worldwide';

    const postedDate =
      typeof job.pubDate === 'number' && job.pubDate > 0
        ? new Date(job.pubDate * 1000).toISOString().slice(0, 10)
        : null;

    const expiresAt =
      typeof job.expiryDate === 'number' && job.expiryDate > 0
        ? new Date(job.expiryDate * 1000).toISOString().slice(0, 10)
        : null;

    offers.push({
      externalId: job.guid?.trim() || originalUrl,
      title,
      organization: job.companyName?.trim() || 'Himalayas Employer',
      location,
      workMode: 'Remote',
      contractType: job.employmentType?.trim() || null,
      duration: extractExplicitDurationText(fullCorpus),
      postedDate,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      expiresAt,
      skills: (job.categories ?? []).slice(0, 8),
      description: description || null,
      originalUrl,
      applicationUrl:
        typeof job.applicationLink === 'string' && job.applicationLink.startsWith('http')
          ? job.applicationLink.trim()
          : originalUrl,
      source: sourceName,
      isAuthorizedApi: true,
      collectionMode: 'collected',
      accessMode: 'official_api',
    });
  }

  return offers;
};

export const createHimalayasProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:himalayas',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const maxPages = options.maxPages ?? 2;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    const cacheKey = `himalayas:p${maxPages}`;
    const cached = himalayasCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'himalayas_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} jobs from Himalayas cache.`,
      };
    }

    const collected: RawScrapedOffer[] = [];
    let cursor: string | null = null;
    let lastError: string | undefined;

    try {
      const baseEndpoint = config.apiEndpoint ?? 'https://himalayas.app/jobs/api';
      for (let page = 0; page < maxPages; page += 1) {
        const url = new URL(baseEndpoint);
        url.searchParams.set('limit', '50');
        if (cursor) {
          url.searchParams.set('cursor', cursor);
        }

        const res = await fetchWithRetry(url.toString(), {
          timeoutMs: 8000,
          retries: 1,
          fetchFn,
          skipDnsCheck: options.skipSecurityForTest,
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          lastError = `Himalayas API HTTP ${res.status}`;
          break;
        }

        const json = JSON.parse(res.bodyText) as {
          jobs?: HimalayasApiJob[];
          nextCursor?: string | null;
        };
        const parsed = parseHimalayasPayload(json, config.name).map((o) =>
          sanitizeOfferByPolicy(o, config)
        );
        collected.push(...parsed);

        cursor = json.nextCursor ?? null;
        if (!cursor || (json.jobs?.length ?? 0) === 0) {
          break;
        }
      }

      const unique = dedupeRawOffers(collected);
      if (unique.length > 0) {
        himalayasCache.set(cacheKey, unique, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'himalayas_official_api',
        accessMode: 'official_api',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: lastError
          ? lastError
          : `Collected ${unique.length} jobs from Himalayas cursor-paginated API.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'himalayas_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Himalayas API request failed',
      };
    }
  },
});
