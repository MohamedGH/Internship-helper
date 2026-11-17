import {
  ConnectorExecutionResult,
  CustomSourceInput,
  ExternalSearchLink,
  ScraperConnector,
  SearchCriteria,
} from './types.ts';
import { createAshbyConnector } from './connectors/ashbyScraper.ts';
import { createGenericHtmlConnector } from './connectors/genericHtmlScraper.ts';
import { createGreenhouseConnector } from './connectors/greenhouseScraper.ts';
import { createLeverConnector } from './connectors/leverScraper.ts';

const createPolicyDisabledConnector = (config: {
  readonly id: string;
  readonly sourceName: string;
  readonly reason: string;
  readonly buildUrl: (criteria: SearchCriteria) => string;
}): ScraperConnector => ({
  id: config.id,
  sourceName: config.sourceName,
  policyDisabled: true,
  policyReason: config.reason,
  buildExternalSearchLink: (criteria) => ({
    source: config.sourceName,
    label: `Search on ${config.sourceName}`,
    url: config.buildUrl(criteria),
    reason: config.reason,
  }),
  collect: async (criteria): Promise<ConnectorExecutionResult> => ({
    source: config.sourceName,
    connector: `${config.id}_policy_disabled`,
    status: 'disabled_policy',
    offers: [],
    externalSearchLinks: [
      {
        source: config.sourceName,
        label: `Search on ${config.sourceName}`,
        url: config.buildUrl(criteria),
        reason: config.reason,
      },
    ],
    durationMs: 0,
    message: config.reason,
  }),
});

export interface RegistryDependencies {
  readonly fetchFn?: typeof fetch;
}

export const resolveConnectorsForCriteria = (
  criteria: SearchCriteria,
  deps: RegistryDependencies = {}
): readonly ScraperConnector[] => {
  const fetchFn = deps.fetchFn ?? fetch;
  const selectedNames = new Set(criteria.sources.map((s) => s.trim().toLowerCase()));
  const connectors: ScraperConnector[] = [];

  const builtinConnectors: readonly ScraperConnector[] = [
    // Direct verified public ATS boards under "Company Career Page"
    createGreenhouseConnector(undefined, 'Company Career Page', fetchFn),
    createLeverConnector(undefined, 'Company Career Page', fetchFn),
    createAshbyConnector(undefined, 'Company Career Page', fetchFn),

    // Policy-restricted / auth-gated portals: never scraped, exposed via official external links
    createPolicyDisabledConnector({
      id: 'linkedin',
      sourceName: 'LinkedIn',
      reason: 'Automated scraping disabled (anti-bot/ToS policy). Open official search link.',
      buildUrl: (c) =>
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(c.keywords)}&location=${encodeURIComponent(c.location)}&f_E=1`,
    }),
    createPolicyDisabledConnector({
      id: 'indeed',
      sourceName: 'Indeed',
      reason: 'Automated scraping disabled (anti-bot/ToS policy). Open official search link.',
      buildUrl: (c) =>
        `https://fr.indeed.com/jobs?q=${encodeURIComponent(c.keywords)}&l=${encodeURIComponent(c.location)}&jt=internship`,
    }),
    createPolicyDisabledConnector({
      id: 'wttj',
      sourceName: 'Welcome to the Jungle',
      reason: 'Protected dynamic portal (no open unauthenticated feed). Open official search link.',
      buildUrl: (c) =>
        `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(c.keywords)}&refinementList%5Bcontract_type%5D%5B%5D=internship`,
    }),
    createPolicyDisabledConnector({
      id: 'hellowork',
      sourceName: 'HelloWork',
      reason: 'WAF-protected portal. Open official search link.',
      buildUrl: (c) =>
        `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${encodeURIComponent(c.keywords)}&l=${encodeURIComponent(c.location)}&c=Stage`,
    }),
    createPolicyDisabledConnector({
      id: 'jobteaser',
      sourceName: 'JobTeaser',
      reason: 'Authenticated university portal (auth bypass prohibited). Open official search link.',
      buildUrl: (c) =>
        `https://www.jobteaser.com/fr/job-offers?query=${encodeURIComponent(c.keywords)}`,
    }),
  ];

  for (const conn of builtinConnectors) {
    if (selectedNames.size === 0 || selectedNames.has(conn.sourceName.toLowerCase())) {
      connectors.push(conn);
    }
  }

  // Custom user-configured sources (non-default or overridden HTML/ATS URLs)
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
