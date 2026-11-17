import { filterAndScoreOffers } from './filters/criteriaMatcher.ts';
import { deduplicateScrapedOffers } from './filters/deduplicator.ts';
import { getJobBoardPolicySnapshots } from './jobboards/jobBoardSearch.ts';
import { WebSearchDiscoveryProvider } from './jobboards/searchDiscoveryProvider.ts';
import { normalizeScrapedOffer } from './normalizer.ts';
import {
  buildMultipliedQueries,
  enrichCriteriaWithProfile,
} from './platforms/queryPlanner.ts';
import { resolveConnectorsForCriteria } from './scraperRegistry.ts';
import {
  ConnectorExecutionResult,
  ExternalSearchLink,
  NormalizedScrapedOffer,
  ScraperConnector,
  ScrapingEngineResponse,
  SearchCriteria,
  SourceCollectionLog,
} from './types.ts';
import { logScrapeEvent } from './utils/logger.ts';

export interface EngineRunOptions {
  readonly concurrency?: number;
  readonly connectorTimeoutMs?: number;
  readonly connectorsOverride?: readonly ScraperConnector[];
  readonly fetchFn?: typeof fetch;
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly onConnectorStart?: (connector: ScraperConnector) => void;
  readonly onConnectorComplete?: (log: SourceCollectionLog, result: ConnectorExecutionResult) => void;
}

const runWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<readonly R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx]);
    }
  });

  await Promise.all(runners);
  return results;
};

const toLogStatus = (res: ConnectorExecutionResult): SourceCollectionLog['status'] => {
  if (res.status === 'ok' && res.offers.length === 0) {
    return 'empty';
  }
  return res.status;
};

const runConnectorSafely = async (
  connector: ScraperConnector,
  criteria: SearchCriteria,
  timeoutMs: number,
  options: EngineRunOptions
): Promise<ConnectorExecutionResult> => {
  const started = Date.now();
  options.onConnectorStart?.(connector);
  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Connector timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    const res = await Promise.race([connector.collect(criteria), timeoutPromise]);
    logScrapeEvent({
      level: res.status === 'error' ? 'warn' : 'info',
      event: 'connector_completed',
      source: res.source,
      connector: res.connector,
      detail: {
        status: res.status,
        accessMode: res.accessMode,
        collectedCount: res.offers.length,
        durationMs: res.durationMs,
        message: res.message,
      },
    });
    options.onConnectorComplete?.(
      {
        source: res.source,
        connector: res.connector,
        accessMode: res.accessMode,
        status: toLogStatus(res),
        collectedCount: res.offers.length,
        matchedCount: 0,
        durationMs: res.durationMs,
        message: res.message,
      },
      res
    );
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown connector error';
    logScrapeEvent({
      level: 'error',
      event: 'connector_failed',
      source: connector.sourceName,
      connector: connector.id,
      detail: { error: msg },
    });
    const failRes: ConnectorExecutionResult = {
      source: connector.sourceName,
      connector: connector.id,
      status: 'error',
      offers: [],
      externalSearchLinks: [],
      durationMs: Date.now() - started,
      message: msg,
    };
    options.onConnectorComplete?.(
      {
        source: failRes.source,
        connector: failRes.connector,
        status: 'error',
        collectedCount: 0,
        matchedCount: 0,
        durationMs: failRes.durationMs,
        message: msg,
      },
      failRes
    );
    return failRes;
  }
};

export const runScrapingSearch = async (
  rawCriteria: SearchCriteria,
  options: EngineRunOptions = {}
): Promise<ScrapingEngineResponse> => {
  const engineStart = Date.now();
  const criteria = enrichCriteriaWithProfile(rawCriteria);
  const queriesExecuted = buildMultipliedQueries(criteria, { maxQueries: 8 }).map((q) => q.query);
  const concurrency = options.concurrency ?? 4;
  const connectorTimeoutMs = options.connectorTimeoutMs ?? 15_000;

  const connectors =
    options.connectorsOverride ??
    resolveConnectorsForCriteria(criteria, {
      fetchFn: options.fetchFn,
      discoveryProvider: options.discoveryProvider,
      env: options.env,
    });

  const executionResults = await runWithConcurrency(
    connectors,
    concurrency,
    (connector) => runConnectorSafely(connector, criteria, connectorTimeoutMs, options)
  );

  const collectedAt = new Date().toISOString();
  const normalizedOffers: NormalizedScrapedOffer[] = [];
  const externalSearchLinks: ExternalSearchLink[] = [];

  for (const res of executionResults) {
    externalSearchLinks.push(...res.externalSearchLinks);
    for (const raw of res.offers) {
      const normalized = normalizeScrapedOffer(raw, collectedAt);
      if (normalized) {
        normalizedOffers.push(normalized);
      }
    }
  }

  const deduplicated = deduplicateScrapedOffers(normalizedOffers);
  const filtered = filterAndScoreOffers(deduplicated, criteria);

  // Build per-connector logs including multi-source deduplicated offers
  const matchedBySource = new Map<string, number>();
  for (const offer of filtered) {
    for (const src of offer.sources) {
      matchedBySource.set(src, (matchedBySource.get(src) ?? 0) + 1);
    }
  }

  const sourceLogs: SourceCollectionLog[] = executionResults.map((res) => ({
    source: res.source,
    connector: res.connector,
    accessMode: res.accessMode,
    status: toLogStatus(res),
    collectedCount: res.offers.length,
    matchedCount: matchedBySource.get(res.source) ?? 0,
    durationMs: res.durationMs,
    message: res.message,
  }));

  const uniqueSourcesSeen = new Set<string>();
  const groundingUrls: Array<{ title: string; url: string }> = [];
  for (const offer of filtered) {
    if (!uniqueSourcesSeen.has(offer.sourceUrl) && groundingUrls.length < 8) {
      uniqueSourcesSeen.add(offer.sourceUrl);
      groundingUrls.push({
        title: `${offer.organization} — ${offer.title}`,
        url: offer.sourceUrl,
      });
    }
  }

  const collectedCount = filtered.filter((o) => o.collectionMode === 'collected').length;
  const discoveredCount = filtered.filter((o) => o.collectionMode === 'discovered').length;
  const totalDurationMs = Date.now() - engineStart;

  logScrapeEvent({
    level: 'info',
    event: 'search_engine_completed',
    detail: {
      keywords: criteria.keywords,
      queriesExecutedCount: queriesExecuted.length,
      totalCollected: normalizedOffers.length,
      afterDeduplication: deduplicated.length,
      afterFiltering: filtered.length,
      collectedCount,
      discoveredCount,
      durationMs: totalDurationMs,
    },
  });

  return {
    offers: filtered,
    groundingUrls,
    externalSearchLinks,
    sourceLogs,
    jobBoardPolicies: getJobBoardPolicySnapshots(options.env),
    queriesExecuted,
    stats: {
      totalCollected: normalizedOffers.length,
      afterDeduplication: deduplicated.length,
      afterFiltering: filtered.length,
      collectedCount,
      discoveredCount,
      durationMs: totalDurationMs,
    },
  };
};
