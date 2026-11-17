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

export interface ArbeitnowApiJob {
  readonly slug?: string;
  readonly company_name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly remote?: boolean;
  readonly url?: string;
  readonly tags?: readonly string[];
  readonly job_types?: readonly string[];
  readonly location?: string;
  readonly created_at?: number;
}

const arbeitnowCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const parseArbeitnowPayload = (
  payload: unknown,
  sourceName = 'Arbeitnow'
): readonly RawScrapedOffer[] => {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown[] }).data;
  if (!Array.isArray(data)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const job = item as ArbeitnowApiJob;
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const url = typeof job.url === 'string' ? job.url.trim() : '';
    if (!title || !url.startsWith('http')) continue;

    const description = stripHtmlTags(job.description).slice(0, 1600);
    const jobTypesText = (job.job_types ?? []).join(' ');
    const fullCorpus = `${title} ${jobTypesText} ${description}`;
    const isIntern = /\b(intern|internship|werkstudent|working student|stage|stagiaire|trainee)\b/i.test(
      fullCorpus
    );

    const postedDate =
      typeof job.created_at === 'number' && job.created_at > 0
        ? new Date(job.created_at * 1000).toISOString().slice(0, 10)
        : null;

    offers.push({
      externalId: job.slug?.trim() || url,
      title,
      organization: job.company_name?.trim() || 'Arbeitnow Employer',
      location: job.location?.trim() || (job.remote ? 'Remote / Europe' : 'Europe'),
      workMode: job.remote ? 'Remote' : null,
      contractType: isIntern ? 'Internship' : jobTypesText || null,
      duration: extractExplicitDurationText(fullCorpus),
      postedDate,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      skills: (job.tags ?? []).slice(0, 10),
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

export const createArbeitnowProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:arbeitnow',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const maxPages = options.maxPages ?? 3;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    const cacheKey = `arbeitnow:p${maxPages}`;
    const cached = arbeitnowCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'arbeitnow_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} jobs from Arbeitnow cache.`,
      };
    }

    const collected: RawScrapedOffer[] = [];
    let lastError: string | undefined;

    try {
      const baseEndpoint = config.apiEndpoint ?? 'https://www.arbeitnow.com/api/job-board-api';
      for (let page = 1; page <= maxPages; page += 1) {
        const url = new URL(baseEndpoint);
        url.searchParams.set('page', String(page));

        const res = await fetchWithRetry(url.toString(), {
          timeoutMs: 8000,
          retries: 1,
          fetchFn,
          skipDnsCheck: options.skipSecurityForTest,
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          lastError = `Arbeitnow API HTTP ${res.status}`;
          break;
        }

        const json = JSON.parse(res.bodyText) as {
          data?: ArbeitnowApiJob[];
          links?: { next?: string | null };
        };
        const parsed = parseArbeitnowPayload(json, config.name).map((o) =>
          sanitizeOfferByPolicy(o, config)
        );
        collected.push(...parsed);

        if (!json.links?.next || (json.data?.length ?? 0) === 0) {
          break;
        }
      }

      const unique = dedupeRawOffers(collected);
      if (unique.length > 0) {
        arbeitnowCache.set(cacheKey, unique, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'arbeitnow_official_api',
        accessMode: 'official_api',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: lastError
          ? lastError
          : `Collected ${unique.length} European/tech jobs across paginated Arbeitnow API.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'arbeitnow_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Arbeitnow API request failed',
      };
    }
  },
});
