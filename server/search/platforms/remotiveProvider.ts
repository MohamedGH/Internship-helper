import {
  JobBoardSourceConfig,
  sanitizeOfferByPolicy,
} from '../jobboards/jobBoardPolicy.ts';
import {
  RemotiveApiJob,
  buildBoardExternalLink,
  parseRemotiveApiPayload,
} from '../jobboards/jobBoardProvider.ts';
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
} from './platformProvider.ts';
import { buildMultipliedQueries } from './queryPlanner.ts';

const remotiveMultiCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const createRemotivePlatformProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:remotive',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    // Remotive is an English/international API; use multiplied EN & skill search terms
    const planned = buildMultipliedQueries(criteria, { maxQueries: 8 })
      .filter((q) => q.language === 'en' || Boolean(q.skillHint))
      .map((q) => q.skillHint || q.query);

    const searchTerms = Array.from(
      new Set(['intern', ...planned.slice(0, options.maxQueries ?? 3)])
    );

    const cacheKey = `remotive:${searchTerms.join('|').toLowerCase()}`;
    const cached = remotiveMultiCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'remotive_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} jobs from Remotive cache.`,
      };
    }

    const collected: RawScrapedOffer[] = [];
    let lastError: string | undefined;

    try {
      const baseEndpoint = config.apiEndpoint ?? 'https://remotive.com/api/remote-jobs';

      const responses = await Promise.allSettled(
        searchTerms.map(async (term) => {
          const endpoint = new URL(baseEndpoint);
          endpoint.searchParams.set('search', term);
          endpoint.searchParams.set('limit', '40');

          const res = await fetchWithRetry(endpoint.toString(), {
            timeoutMs: 8000,
            retries: 1,
            fetchFn,
            skipDnsCheck: options.skipSecurityForTest,
          });
          if (!res.ok) {
            throw new Error(`Remotive API HTTP ${res.status}`);
          }
          const data = JSON.parse(res.bodyText) as { jobs?: RemotiveApiJob[] };
          return parseRemotiveApiPayload(data, config.name).map((o) =>
            sanitizeOfferByPolicy(o, config)
          );
        })
      );

      for (const r of responses) {
        if (r.status === 'fulfilled') {
          collected.push(...r.value);
        } else {
          lastError = r.reason instanceof Error ? r.reason.message : 'Remotive query failed';
        }
      }

      const unique = dedupeRawOffers(collected);
      if (unique.length > 0) {
        remotiveMultiCache.set(cacheKey, unique, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'remotive_official_api',
        accessMode: 'official_api',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message:
          lastError && unique.length === 0
            ? lastError
            : `Collected ${unique.length} jobs from Remotive API (${searchTerms.length} queries).`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'remotive_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Remotive API failed',
      };
    }
  },
});
