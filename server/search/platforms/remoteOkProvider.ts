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
  stripHtmlTags,
} from './platformProvider.ts';

export interface RemoteOkApiJob {
  readonly id?: string | number;
  readonly slug?: string;
  readonly company?: string;
  readonly position?: string;
  readonly tags?: readonly string[];
  readonly location?: string;
  readonly description?: string;
  readonly date?: string;
  readonly url?: string;
  readonly apply_url?: string;
}

const remoteOkCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const parseRemoteOkPayload = (
  payload: unknown,
  sourceName = 'Remote OK'
): readonly RawScrapedOffer[] => {
  if (!Array.isArray(payload)) return [];

  const offers: RawScrapedOffer[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const job = item as RemoteOkApiJob;
    // Element 0 in Remote OK API is the legal notice object without position/company
    const title = typeof job.position === 'string' ? job.position.trim() : '';
    const company = typeof job.company === 'string' ? job.company.trim() : '';
    const url = typeof job.url === 'string' ? job.url.trim() : '';
    if (!title || !company || !url.startsWith('http')) continue;

    const description = stripHtmlTags(job.description).slice(0, 1600);
    const fullCorpus = `${title} ${(job.tags ?? []).join(' ')} ${description}`;
    const isIntern =
      /\b(intern|internship|stage|stagiaire|junior|entry[- ]level|trainee|graduate)\b/i.test(
        fullCorpus
      );

    offers.push({
      externalId: job.id !== undefined ? String(job.id) : url,
      title,
      organization: company,
      location: job.location?.trim() || 'Remote / Worldwide',
      workMode: 'Remote',
      contractType: isIntern ? 'Internship / Entry-Level' : null,
      duration: extractExplicitDurationText(fullCorpus),
      postedDate: typeof job.date === 'string' ? job.date.slice(0, 10) : null,
      startDate: extractExplicitStartDate(fullCorpus),
      endDate: null,
      skills: (job.tags ?? []).slice(0, 10),
      description: description || null,
      originalUrl: url,
      applicationUrl:
        typeof job.apply_url === 'string' && job.apply_url.startsWith('http')
          ? job.apply_url
          : url,
      source: sourceName,
      isAuthorizedApi: true,
      collectionMode: 'collected',
      accessMode: 'official_api',
    });
  }

  return offers;
};

export const createRemoteOkProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:remoteok',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    const cacheKey = 'remoteok:feed';
    const cached = remoteOkCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'remoteok_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} jobs from Remote OK cache.`,
      };
    }

    try {
      const endpoint = config.apiEndpoint ?? 'https://remoteok.com/api';
      const res = await fetchWithRetry(endpoint, {
        timeoutMs: 8000,
        retries: 1,
        fetchFn,
        skipDnsCheck: options.skipSecurityForTest,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        return {
          source: config.name,
          connector: 'remoteok_official_api',
          accessMode: 'link_only',
          status: 'error',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: `Remote OK API returned HTTP ${res.status}`,
        };
      }

      const json = JSON.parse(res.bodyText) as unknown;
      const offers = parseRemoteOkPayload(json, config.name).map((o) =>
        sanitizeOfferByPolicy(o, config)
      );

      if (offers.length > 0) {
        remoteOkCache.set(cacheKey, offers, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'remoteok_official_api',
        accessMode: 'official_api',
        status: 'ok',
        offers,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Collected ${offers.length} jobs from Remote OK public API.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'remoteok_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Remote OK API request failed',
      };
    }
  },
});
