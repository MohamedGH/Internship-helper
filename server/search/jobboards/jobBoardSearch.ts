import {
  ConnectorExecutionResult,
  ExternalSearchLink,
  JobBoardPolicySnapshot,
  ScraperConnector,
  SearchCriteria,
} from '../types.ts';
import { isSearchIndexDiscoveryAllowed, toPolicySnapshot } from './jobBoardPolicy.ts';
import {
  createJobBoardProviderForConfig,
  mapDiscoveryHitToRawOffer,
} from './jobBoardProvider.ts';
import { listJobBoardConfigs, resolveJobBoardsForCriteria } from './jobBoardRegistry.ts';
import {
  WebSearchDiscoveryProvider,
  buildDiscoveryQueries,
  resolveActiveDiscoveryProvider,
} from './searchDiscoveryProvider.ts';

export interface JobBoardSearchOptions {
  readonly fetchFn?: typeof fetch;
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly skipSecurityForTest?: boolean;
}

/**
 * Builds ScraperConnector adapters from the JobBoard registry so the main
 * scraperEngine executes ATS connectors and JobBoard providers uniformly.
 */
export const resolveJobBoardConnectors = (
  criteria: SearchCriteria,
  options: JobBoardSearchOptions = {}
): readonly ScraperConnector[] => {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchFn ?? fetch;
  const discoveryProvider =
    options.discoveryProvider !== undefined
      ? options.discoveryProvider
      : resolveActiveDiscoveryProvider(env, fetchFn);

  const selectedBoards = resolveJobBoardsForCriteria(criteria);
  const connectors: ScraperConnector[] = [];

  for (const config of selectedBoards) {
    const provider = createJobBoardProviderForConfig(config, {
      fetchFn,
      discoveryProvider,
      env,
      skipSecurityForTest: options.skipSecurityForTest,
    });

    connectors.push({
      id: provider.id,
      sourceName: config.name,
      policyDisabled:
        config.accessMode === 'disabled' ||
        (config.accessMode === 'link_only' && !isSearchIndexDiscoveryAllowed(config)),
      policyReason: config.policySummary,
      buildExternalSearchLink: (c): ExternalSearchLink => ({
        source: config.name,
        label: `Search on ${config.name}`,
        url: config.buildExternalSearchUrl(c),
        reason: config.policySummary,
        accessMode: config.accessMode,
      }),
      collect: (c) => provider.collect(c),
    });
  }

  // Also add an overarching bilingual Web Discovery connector when a search API / SearXNG
  // instance is configured and external discovery is requested.
  if (
    criteria.includeExternalDiscovery !== false &&
    discoveryProvider &&
    discoveryProvider.isConfigured()
  ) {
    connectors.push({
      id: `web_discovery:${discoveryProvider.id}`,
      sourceName: `Web Discovery (${discoveryProvider.name})`,
      collect: async (c): Promise<ConnectorExecutionResult> => {
        const started = Date.now();
        try {
          const allQueries = buildDiscoveryQueries(c, selectedBoards, 4);
          // Skip targeted board queries already run per-board above; run general FR/EN queries
          const generalQueries = allQueries.filter((q) => !q.targetDomains?.length);
          const hitBatches = await Promise.all(
            generalQueries.map((q) => discoveryProvider.search(q).catch(() => []))
          );
          const offers = hitBatches
            .flat()
            .map((hit) => mapDiscoveryHitToRawOffer(hit));

          return {
            source: `Web Discovery (${discoveryProvider.name})`,
            connector: discoveryProvider.id,
            accessMode: 'search_index',
            status: 'ok',
            offers,
            externalSearchLinks: [],
            durationMs: Date.now() - started,
            message: `Discovered ${offers.length} general FR/EN web result(s) via ${discoveryProvider.name}.`,
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
  }

  return connectors;
};

export const getJobBoardPolicySnapshots = (
  env: Readonly<Record<string, string | undefined>> = process.env
): readonly JobBoardPolicySnapshot[] =>
  listJobBoardConfigs().map((cfg) => toPolicySnapshot(cfg, env));
