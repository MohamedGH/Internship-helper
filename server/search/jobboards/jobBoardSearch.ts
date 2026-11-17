import {
  createGenericWebDiscoveryAdapter,
} from '../platforms/genericSearchProvider.ts';
import { createPlatformAdapterForConfig } from '../platforms/platformRegistry.ts';
import {
  ExternalSearchLink,
  JobBoardPolicySnapshot,
  ScraperConnector,
  SearchCriteria,
} from '../types.ts';
import { isSearchIndexDiscoveryAllowed, toPolicySnapshot } from './jobBoardPolicy.ts';
import { listJobBoardConfigs, resolveJobBoardsForCriteria } from './jobBoardRegistry.ts';
import {
  WebSearchDiscoveryProvider,
  resolveActiveDiscoveryProvider,
} from './searchDiscoveryProvider.ts';

export interface JobBoardSearchOptions {
  readonly fetchFn?: typeof fetch;
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly skipSecurityForTest?: boolean;
}

/**
 * Builds ScraperConnector adapters from the platform registry so the main
 * scraperEngine executes ATS connectors and multi-platform providers uniformly.
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
    const adapter = createPlatformAdapterForConfig(config, {
      fetchFn,
      discoveryProvider,
      env,
      skipSecurityForTest: options.skipSecurityForTest,
    });

    connectors.push({
      id: adapter.id,
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
      collect: (c) => adapter.collect(c),
    });
  }

  // Overarching multi-query FR/EN Web Discovery connector when an authorized search index
  // provider (SearXNG JSON, Brave API, Custom Search JSON) is configured.
  if (
    criteria.includeExternalDiscovery !== false &&
    discoveryProvider &&
    discoveryProvider.isConfigured()
  ) {
    connectors.push(createGenericWebDiscoveryAdapter(discoveryProvider, { maxQueries: 6 }));
  }

  return connectors;
};

export const getJobBoardPolicySnapshots = (
  env: Readonly<Record<string, string | undefined>> = process.env
): readonly JobBoardPolicySnapshot[] =>
  listJobBoardConfigs().map((cfg) => toPolicySnapshot(cfg, env));
