import { SearchCriteria } from '../types.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import { JobBoardSourceConfig, isSearchIndexDiscoveryAllowed } from './jobBoardPolicy.ts';
import { findJobBoardByDomain } from './jobBoardRegistry.ts';

export interface WebSearchDiscoveryHit {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
  readonly domain: string;
  readonly publishedDate?: string | null;
  readonly discoveryProvider: string;
  readonly searchQuery: string;
  readonly matchedBoardName?: string;
}

export interface WebSearchDiscoveryQuery {
  readonly query: string;
  readonly language?: 'fr' | 'en' | 'all';
  readonly maxResults?: number;
  readonly targetDomains?: readonly string[];
}

export interface WebSearchDiscoveryProvider {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: () => boolean;
  readonly search: (request: WebSearchDiscoveryQuery) => Promise<readonly WebSearchDiscoveryHit[]>;
}

const extractHostname = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const buildDiscoveryQueries = (
  criteria: SearchCriteria,
  targetBoards: readonly JobBoardSourceConfig[],
  maxQueries = 5
): readonly WebSearchDiscoveryQuery[] => {
  const kw = criteria.keywords.trim();
  const loc =
    criteria.location &&
    !['all', 'anywhere'].includes(criteria.location.trim().toLowerCase())
      ? criteria.location.split(/[/,;]/)[0]?.trim() ?? ''
      : '';
  const skillsHint = (criteria.skills ?? []).slice(0, 2).join(' ').trim();
  const eduHint = criteria.educationLevel?.trim() ?? '';
  const startYearHint = criteria.startDateFrom?.slice(0, 4) ?? '';

  const baseTerms = [kw, skillsHint, loc, eduHint, startYearHint].filter(Boolean).join(' ').trim();
  const queries: WebSearchDiscoveryQuery[] = [];

  // 1. Targeted site: queries for search-index-eligible jobboards (Meteojob, HelloWork, WTTJ, Apec)
  const discoverableBoards = targetBoards.filter(isSearchIndexDiscoveryAllowed);
  for (const board of discoverableBoards) {
    if (queries.length >= maxQueries) break;
    const primaryDomain = board.domains[0];
    if (!primaryDomain) continue;
    const isStagePresent = /\b(stage|intern|internship|pfe)\b/i.test(baseTerms);
    const stageToken = isStagePresent ? '' : 'stage';
    const q = [`site:${primaryDomain}`, stageToken, kw, loc].filter(Boolean).join(' ').trim();
    queries.push({
      query: q,
      language: board.countryScope === 'FR' ? 'fr' : 'all',
      maxResults: 8,
      targetDomains: board.domains,
    });
  }

  // 2. General French discovery query
  if (queries.length < maxQueries) {
    const hasFrStage = /\bstage\b/i.test(baseTerms);
    queries.push({
      query: `${hasFrStage ? '' : 'stage '}${baseTerms}`.trim(),
      language: 'fr',
      maxResults: 8,
    });
  }

  // 3. General English discovery query
  if (queries.length < maxQueries) {
    const cleanKw = kw.replace(/\bstage\b/gi, '').trim() || kw;
    queries.push({
      query: `internship ${cleanKw} ${skillsHint} ${loc}`.replace(/\s+/g, ' ').trim(),
      language: 'en',
      maxResults: 8,
    });
  }

  return queries.slice(0, maxQueries);
};

/**
 * Official SearXNG JSON API provider (never scrapes Google/Bing HTML).
 */
export const createSearxngDiscoveryProvider = (
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  options: { readonly skipDnsCheck?: boolean } = {}
): WebSearchDiscoveryProvider => ({
  id: 'searxng_api',
  name: 'SearXNG JSON API',
  isConfigured: () => Boolean(baseUrl.trim()),
  search: async (request) => {
    const cleanBase = baseUrl.trim().replace(/\/+$/, '');
    if (!cleanBase) return [];

    const url = new URL(`${cleanBase}/search`);
    url.searchParams.set('q', request.query);
    url.searchParams.set('format', 'json');
    if (request.language === 'fr') url.searchParams.set('language', 'fr-FR');
    else if (request.language === 'en') url.searchParams.set('language', 'en-US');

    const res = await fetchWithRetry(url.toString(), {
      timeoutMs: 7000,
      retries: 1,
      fetchFn,
      skipDnsCheck: options.skipDnsCheck,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`SearXNG API returned HTTP ${res.status}`);
    }

    const parsed = JSON.parse(res.bodyText) as {
      results?: Array<{
        url?: string;
        title?: string;
        content?: string;
        publishedDate?: string;
      }>;
    };

    const hits: WebSearchDiscoveryHit[] = [];
    for (const item of (parsed.results ?? []).slice(0, request.maxResults ?? 10)) {
      if (!item.url || !item.title) continue;
      const domain = extractHostname(item.url);
      if (!domain) continue;
      if (
        request.targetDomains &&
        request.targetDomains.length > 0 &&
        !request.targetDomains.some((d) => domain === d || domain.endsWith(`.${d}`))
      ) {
        continue;
      }

      const matchedBoard = findJobBoardByDomain(domain);
      hits.push({
        url: item.url,
        title: item.title.trim(),
        snippet: (item.content ?? '').trim(),
        domain,
        publishedDate: item.publishedDate ? item.publishedDate.slice(0, 10) : null,
        discoveryProvider: 'searxng_api',
        searchQuery: request.query,
        matchedBoardName: matchedBoard?.name,
      });
    }

    return hits;
  },
});

/**
 * Official Brave Search Web API provider (uses authorized REST API with X-Subscription-Token).
 */
export const createBraveSearchDiscoveryProvider = (
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  options: { readonly skipDnsCheck?: boolean } = {}
): WebSearchDiscoveryProvider => ({
  id: 'brave_search_api',
  name: 'Brave Search API',
  isConfigured: () => Boolean(apiKey.trim()),
  search: async (request) => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) return [];

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', request.query);
    url.searchParams.set('count', String(Math.min(20, request.maxResults ?? 10)));
    if (request.language === 'fr') url.searchParams.set('search_lang', 'fr');
    else if (request.language === 'en') url.searchParams.set('search_lang', 'en');

    const res = await fetchWithRetry(url.toString(), {
      timeoutMs: 7000,
      retries: 1,
      fetchFn,
      skipDnsCheck: options.skipDnsCheck,
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': cleanKey,
      },
    });

    if (!res.ok) {
      throw new Error(`Brave Search API returned HTTP ${res.status}`);
    }

    const parsed = JSON.parse(res.bodyText) as {
      web?: {
        results?: Array<{
          url?: string;
          title?: string;
          description?: string;
          age?: string;
        }>;
      };
    };

    const hits: WebSearchDiscoveryHit[] = [];
    for (const item of parsed.web?.results ?? []) {
      if (!item.url || !item.title) continue;
      const domain = extractHostname(item.url);
      if (!domain) continue;
      if (
        request.targetDomains &&
        request.targetDomains.length > 0 &&
        !request.targetDomains.some((d) => domain === d || domain.endsWith(`.${d}`))
      ) {
        continue;
      }

      const matchedBoard = findJobBoardByDomain(domain);
      hits.push({
        url: item.url,
        title: item.title.trim(),
        snippet: (item.description ?? '').trim(),
        domain,
        publishedDate: null,
        discoveryProvider: 'brave_search_api',
        searchQuery: request.query,
        matchedBoardName: matchedBoard?.name,
      });
    }

    return hits;
  },
});

/**
 * Generic configurable JSON web search API provider (e.g. custom search gateway or Tavily-compatible endpoint).
 */
export const createCustomJsonSearchDiscoveryProvider = (
  endpointUrl: string,
  apiKey?: string,
  fetchFn: typeof fetch = fetch,
  options: { readonly skipDnsCheck?: boolean } = {}
): WebSearchDiscoveryProvider => ({
  id: 'custom_search_api',
  name: 'Configured Web Search API',
  isConfigured: () => Boolean(endpointUrl.trim()),
  search: async (request) => {
    const cleanEndpoint = endpointUrl.trim();
    if (!cleanEndpoint) return [];

    const url = new URL(cleanEndpoint);
    url.searchParams.set('q', request.query);
    url.searchParams.set('limit', String(request.maxResults ?? 10));

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetchWithRetry(url.toString(), {
      timeoutMs: 7000,
      retries: 1,
      fetchFn,
      skipDnsCheck: options.skipDnsCheck,
      headers,
    });

    if (!res.ok) {
      throw new Error(`Web Search API returned HTTP ${res.status}`);
    }

    const parsed = JSON.parse(res.bodyText) as {
      results?: Array<{
        url?: string;
        title?: string;
        snippet?: string;
        content?: string;
        publishedDate?: string;
      }>;
    };

    const hits: WebSearchDiscoveryHit[] = [];
    for (const item of parsed.results ?? []) {
      if (!item.url || !item.title) continue;
      const domain = extractHostname(item.url);
      if (!domain) continue;
      const matchedBoard = findJobBoardByDomain(domain);
      hits.push({
        url: item.url,
        title: item.title.trim(),
        snippet: (item.snippet ?? item.content ?? '').trim(),
        domain,
        publishedDate: item.publishedDate ? item.publishedDate.slice(0, 10) : null,
        discoveryProvider: 'custom_search_api',
        searchQuery: request.query,
        matchedBoardName: matchedBoard?.name,
      });
    }

    return hits;
  },
});

export const resolveActiveDiscoveryProvider = (
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchFn: typeof fetch = fetch
): WebSearchDiscoveryProvider | null => {
  if (env.SEARXNG_BASE_URL?.trim()) {
    return createSearxngDiscoveryProvider(env.SEARXNG_BASE_URL, fetchFn);
  }
  if (env.BRAVE_SEARCH_API_KEY?.trim()) {
    return createBraveSearchDiscoveryProvider(env.BRAVE_SEARCH_API_KEY, fetchFn);
  }
  if (env.WEB_SEARCH_API_URL?.trim()) {
    return createCustomJsonSearchDiscoveryProvider(
      env.WEB_SEARCH_API_URL,
      env.WEB_SEARCH_API_KEY,
      fetchFn
    );
  }
  return null;
};
