import {
  CustomSourceInput,
  ExternalSearchLink,
  ScraperConnector,
  SearchCriteria,
} from './types.ts';
import { createAshbyConnector } from './connectors/ashbyScraper.ts';
import { createGenericHtmlConnector } from './connectors/genericHtmlScraper.ts';
import { createGreenhouseConnector } from './connectors/greenhouseScraper.ts';
import { createLeverConnector } from './connectors/leverScraper.ts';
import { resolveJobBoardConnectors } from './jobboards/jobBoardSearch.ts';
import { WebSearchDiscoveryProvider } from './jobboards/searchDiscoveryProvider.ts';

export interface RegistryDependencies {
  readonly fetchFn?: typeof fetch;
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export const resolveConnectorsForCriteria = (
  criteria: SearchCriteria,
  deps: RegistryDependencies = {}
): readonly ScraperConnector[] => {
  const fetchFn = deps.fetchFn ?? fetch;
  const selectedNames = new Set(criteria.sources.map((s) => s.trim().toLowerCase()));
  const connectors: ScraperConnector[] = [];

  // 1. Direct verified public ATS boards under "Company Career Page"
  const atsConnectors: readonly ScraperConnector[] = [
    createGreenhouseConnector(undefined, 'Company Career Page', fetchFn),
    createLeverConnector(undefined, 'Company Career Page', fetchFn),
    createAshbyConnector(undefined, 'Company Career Page', fetchFn),
  ];

  for (const conn of atsConnectors) {
    if (selectedNames.size === 0 || selectedNames.has(conn.sourceName.toLowerCase())) {
      connectors.push(conn);
    }
  }

  // 2. General JobBoards (Meteojob, HelloWork, WTTJ, France Travail, Apec, Remotive, We Work Remotely, LinkedIn, Indeed, JobTeaser)
  // + External Web Discovery layer
  const jobBoardConnectors = resolveJobBoardConnectors(criteria, {
    fetchFn,
    discoveryProvider: deps.discoveryProvider,
    env: deps.env,
  });
  connectors.push(...jobBoardConnectors);

  // 3. Custom user-configured sources (non-default or overridden HTML/ATS URLs)
  const customSources: readonly CustomSourceInput[] = criteria.customSources ?? [];
  for (const custom of customSources) {
    if (!custom.enabled || custom.isDefault) continue;
    const isSelected =
      selectedNames.size === 0 || selectedNames.has(custom.name.trim().toLowerCase());
    if (!isSelected) continue;

    connectors.push(createGenericHtmlConnector(custom, { fetchFn }));
  }

  return connectors;
};

export const buildFallbackExternalLinks = (
  criteria: SearchCriteria
): readonly ExternalSearchLink[] => {
  const connectors = resolveConnectorsForCriteria(criteria);
  const links: ExternalSearchLink[] = [];
  for (const conn of connectors) {
    const link = conn.buildExternalSearchLink?.(criteria);
    if (link) links.push(link);
  }
  return links;
};
