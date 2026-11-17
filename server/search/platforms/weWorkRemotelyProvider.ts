import {
  JobBoardSourceConfig,
  sanitizeOfferByPolicy,
} from '../jobboards/jobBoardPolicy.ts';
import {
  buildBoardExternalLink,
  parseRssOrAtomFeed,
} from '../jobboards/jobBoardProvider.ts';
import { checkRobotsAllowance } from '../security/robotsGuard.ts';
import { assertSafePublicUrl } from '../security/urlGuard.ts';
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

const wwrCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

export const createWeWorkRemotelyProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:weworkremotely',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const feedUrls = config.rssFeedUrls ?? [
      'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
      'https://weworkremotely.com/remote-jobs.rss',
    ];
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    const cacheKey = `wwr:${feedUrls.join(',')}`;
    const cached = wwrCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'weworkremotely_rss',
        accessMode: 'rss_feed',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} offers from We Work Remotely RSS cache.`,
      };
    }

    const collected: RawScrapedOffer[] = [];
    let lastError: string | undefined;

    for (const feedUrl of feedUrls) {
      try {
        if (!options.skipSecurityForTest) {
          const safe = await assertSafePublicUrl(feedUrl);
          if (!safe.safe) {
            lastError = safe.reason;
            continue;
          }
          const robots = await checkRobotsAllowance(feedUrl, fetchFn);
          if (!robots.allowed) {
            return {
              source: config.name,
              connector: 'weworkremotely_rss',
              accessMode: 'link_only',
              status: 'robots_blocked',
              offers: [],
              externalSearchLinks: [externalLink],
              durationMs: Date.now() - started,
              message: robots.reason ?? 'Disallowed by robots.txt',
            };
          }
        }

        const res = await fetchWithRetry(feedUrl, {
          timeoutMs: 8000,
          retries: 1,
          fetchFn,
          skipDnsCheck: options.skipSecurityForTest,
        });
        if (!res.ok) {
          lastError = `WWR RSS HTTP ${res.status}`;
          continue;
        }
        const parsed = parseRssOrAtomFeed(res.bodyText, config.name).map((o) =>
          sanitizeOfferByPolicy(o, config)
        );
        collected.push(...parsed);
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'WWR RSS error';
      }
    }

    const unique = dedupeRawOffers(collected);
    if (unique.length > 0) {
      wwrCache.set(cacheKey, unique, 10 * 60 * 1000);
    }

    return {
      source: config.name,
      connector: 'weworkremotely_rss',
      accessMode: 'rss_feed',
      status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
      offers: unique,
      externalSearchLinks: [externalLink],
      durationMs: Date.now() - started,
      message:
        lastError && unique.length === 0
          ? lastError
          : `Collected ${unique.length} jobs across ${feedUrls.length} We Work Remotely RSS feeds.`,
    };
  },
});
