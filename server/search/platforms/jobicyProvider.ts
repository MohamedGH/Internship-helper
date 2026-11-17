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
import { deriveProfileContext } from './queryPlanner.ts';

export interface JobicyApiJob {
  readonly id?: number;
  readonly url?: string;
  readonly jobTitle?: string;
  readonly companyName?: string;
  readonly jobIndustry?: readonly string[];
  readonly jobType?: readonly string[];
  readonly jobGeo?: string;
  readonly jobLevel?: string;
  readonly jobExcerpt?: string;
  readonly jobDescription?: string;
  readonly pubDate?: string;
}

const jobicyCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const parseJobicyPayload = (
  payload: unknown,
  sourceName = 'Jobicy'
): readonly RawScrapedOffer[] => {
  if (!payload || typeof payload !== 'object') return [];
  const jobs = (payload as { jobs?: unknown[] }).jobs;
  if (!Array.isArray(jobs)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of jobs) {
    if (!item || typeof item !== 'object') continue;
    const job = item as JobicyApiJob;
    const title = typeof job.jobTitle === 'string' ? job.jobTitle.trim() : '';
    const url = typeof job.url === 'string' ? job.url.trim() : '';
    if (!title || !url.startsWith('http')) continue;

    const description = stripHtmlTags(job.jobDescription || job.jobExcerpt).slice(0, 1600);
    const jobTypeStr = Array.isArray(job.jobType) ? job.jobType.join(', ') : '';
    const fullCorpus = `${title} ${jobTypeStr} ${job.jobLevel ?? ''} ${description}`;

    offers.push({
      externalId: job.id !== undefined ? String(job.id) : url,
      title,
      organization: job.companyName?.trim() || 'Jobicy Employer',
      location: job.jobGeo?.trim() || 'Remote / Worldwide',
      workMode: 'Remote',
      contractType: jobTypeStr || null,
      duration: extractExplicitDurationText(fullCorpus),
      postedDate: typeof job.pubDate === 'string' ? job.pubDate.slice(0, 10) : null,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      experienceLevel: job.jobLevel?.trim() || null,
      skills: (job.jobIndustry ?? []).slice(0, 6),
      description: description || null,
      originalUrl: url,
      applicationUrl: url,
      source: sourceName,
      isAuthorizedApi: true,
      collectionMode: 'collected',
      accessMode: 'official_api',
    });
  }

  return offers;
};

export const createJobicyProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:jobicy',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);
    const signals = deriveProfileContext(criteria);
    const topTag = signals.skills[0]?.toLowerCase() || '';

    const cacheKey = `jobicy:${topTag || 'all'}`;
    const cached = jobicyCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'jobicy_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} jobs from Jobicy cache.`,
      };
    }

    try {
      const baseEndpoint = config.apiEndpoint ?? 'https://jobicy.com/api/v2/remote-jobs';
      const urls: string[] = [`${baseEndpoint}?count=50`];
      if (topTag && /^[a-z0-9-]+$/i.test(topTag)) {
        urls.push(`${baseEndpoint}?count=50&tag=${encodeURIComponent(topTag)}`);
      }

      const collected: RawScrapedOffer[] = [];
      let lastError: string | undefined;

      for (const targetUrl of urls) {
        const res = await fetchWithRetry(targetUrl, {
          timeoutMs: 8000,
          retries: 1,
          fetchFn,
          skipDnsCheck: options.skipSecurityForTest,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          lastError = `Jobicy API HTTP ${res.status}`;
          continue;
        }
        const json = JSON.parse(res.bodyText) as unknown;
        const parsed = parseJobicyPayload(json, config.name).map((o) =>
          sanitizeOfferByPolicy(o, config)
        );
        collected.push(...parsed);
      }

      const unique = dedupeRawOffers(collected);
      if (unique.length > 0) {
        jobicyCache.set(cacheKey, unique, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'jobicy_official_api',
        accessMode: 'official_api',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: lastError && unique.length === 0
          ? lastError
          : `Collected ${unique.length} remote jobs from Jobicy API v2.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'jobicy_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Jobicy API request failed',
      };
    }
  },
});
