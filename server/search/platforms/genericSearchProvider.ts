import {
  JobBoardSourceConfig,
  isSearchIndexDiscoveryAllowed,
} from '../jobboards/jobBoardPolicy.ts';
import {
  buildBoardExternalLink,
  mapDiscoveryHitToRawOffer,
} from '../jobboards/jobBoardProvider.ts';
import {
  WebSearchDiscoveryProvider,
  WebSearchDiscoveryQuery,
  resolveActiveDiscoveryProvider,
} from '../jobboards/searchDiscoveryProvider.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import { PlatformAdapter, dedupeRawOffers } from './platformProvider.ts';
import { buildMultipliedQueries } from './queryPlanner.ts';

export interface MultiQueryDiscoveryOptions {
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchFn?: typeof fetch;
  readonly maxQueriesPerBoard?: number;
}

export const buildMultipliedSiteQueries = (
  criteria: SearchCriteria,
  board: JobBoardSourceConfig,
  maxQueries = 3
): readonly WebSearchDiscoveryQuery[] => {
  const primaryDomain = board.domains[0];
  if (!primaryDomain) return [];

  const planned = buildMultipliedQueries(criteria, { maxQueries: maxQueries + 2 });
  const targetLang = board.countryScope === 'FR' ? 'fr' : 'all';

  const preferred = planned.filter((q) =>
    board.countryScope === 'FR' ? q.language === 'fr' : true
  );
  const candidates = (preferred.length > 0 ? preferred : planned).slice(0, maxQueries);

  return candidates.map((q) => ({
    query: `site:${primaryDomain} ${q.query}`.trim(),
    language: targetLang,
    maxResults: 8,
    targetDomains: board.domains,
  }));
};

/**
 * Shared CGU-compliant adapter for portals that prohibit direct HTML scraping:
 * - Emits tailored official external search URLs immediately.
 * - When an authorized search index provider (SearXNG JSON, Brave API, Custom JSON Search)
 *   is configured and search_index discovery is permitted, runs multiplied site: queries
 *   and returns explicitly flagged externally_unverified offers.
 */
export const createDiscoveryOrLinkPlatformAdapter = (
  config: JobBoardSourceConfig,
  options: MultiQueryDiscoveryOptions = {}
): PlatformAdapter => ({
  id: `jobboard:${config.id}`,
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const env = options.env ?? process.env;
    const discoveryProvider =
      options.discoveryProvider !== undefined
        ? options.discoveryProvider
        : resolveActiveDiscoveryProvider(env, options.fetchFn ?? fetch);

    const effective = config.resolveEffectiveAccessMode
      ? config.resolveEffectiveAccessMode(env)
      : {
          accessMode: config.accessMode,
          authorizationStatus: config.authorizationStatus,
          reason: config.policySummary,
        };

    const externalLink = buildBoardExternalLink(
      config,
      criteria,
      effective.reason ?? config.policySummary
    );

    const canDiscover =
      criteria.includeExternalDiscovery !== false &&
      isSearchIndexDiscoveryAllowed(config) &&
      Boolean(discoveryProvider?.isConfigured());

    if (!canDiscover || !discoveryProvider) {
      return {
        source: config.name,
        connector: `${config.id}_link_only`,
        accessMode: effective.accessMode,
        status: effective.accessMode === 'disabled' ? 'disabled_policy' : 'link_only',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: effective.reason ?? config.policySummary,
      };
    }

    try {
      const queries = buildMultipliedSiteQueries(
        criteria,
        config,
        options.maxQueriesPerBoard ?? 3
      );
      if (queries.length === 0) {
        return {
          source: config.name,
          connector: `${config.id}_link_only`,
          accessMode: 'link_only',
          status: 'link_only',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: effective.reason,
        };
      }

      const batches = await Promise.allSettled(
        queries.map((q) => discoveryProvider.search(q))
      );

      const collected: RawScrapedOffer[] = [];
      let lastError: string | undefined;
      for (const batch of batches) {
        if (batch.status === 'fulfilled') {
          for (const hit of batch.value) {
            collected.push(mapDiscoveryHitToRawOffer(hit, config));
          }
        } else {
          lastError = batch.reason instanceof Error ? batch.reason.message : 'Discovery query error';
        }
      }

      const unique = dedupeRawOffers(collected);
      return {
        source: config.name,
        connector: `${config.id}_search_index`,
        accessMode: 'search_index',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message:
          lastError && unique.length === 0
            ? lastError
            : `Discovered ${unique.length} indexed link(s) across ${queries.length} queries via ${discoveryProvider.name}.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: `${config.id}_search_index`,
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Search index discovery failed',
      };
    }
  },
});

/**
 * General multi-query web discovery connector across open FR & EN search queries
 * using interchangeable SearXNG / Brave / Custom JSON API providers.
 */
export const createGenericWebDiscoveryAdapter = (
  discoveryProvider: WebSearchDiscoveryProvider,
  options: { readonly maxQueries?: number } = {}
): {
  readonly id: string;
  readonly sourceName: string;
  readonly collect: (criteria: SearchCriteria) => Promise<ConnectorExecutionResult>;
} => ({
  id: `web_discovery:${discoveryProvider.id}`,
  sourceName: `Web Discovery (${discoveryProvider.name})`,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    try {
      const planned = buildMultipliedQueries(criteria, {
        maxQueries: options.maxQueries ?? 6,
      });

      const hitBatches = await Promise.allSettled(
        planned.map((pq) =>
          discoveryProvider.search({
            query: pq.query,
            language: pq.language,
            maxResults: 10,
          })
        )
      );

      const collected: RawScrapedOffer[] = [];
      let lastError: string | undefined;
      for (const batch of hitBatches) {
        if (batch.status === 'fulfilled') {
          for (const hit of batch.value) {
            collected.push(mapDiscoveryHitToRawOffer(hit));
          }
        } else {
          lastError = batch.reason instanceof Error ? batch.reason.message : 'Discovery failed';
        }
      }

      const unique = dedupeRawOffers(collected);
      return {
        source: `Web Discovery (${discoveryProvider.name})`,
        connector: discoveryProvider.id,
        accessMode: 'search_index',
        status: unique.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
        offers: unique,
        externalSearchLinks: [],
        durationMs: Date.now() - started,
        message:
          lastError && unique.length === 0
            ? lastError
            : `Discovered ${unique.length} general FR/EN web result(s) across ${planned.length} queries via ${discoveryProvider.name}.`,
      };
    } catch (err) {
      return {
        source: `Web Discovery (${discoveryProvider.name})`,
        connector: discoveryProvider.id,
        accessMode: 'search_index',
        status: 'error',
        offers: [],
        externalSearchLinks: [],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Web discovery failed',
      };
    }
  },
});
