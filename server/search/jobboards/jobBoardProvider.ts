import * as cheerio from 'cheerio';
import { checkRobotsAllowance } from '../security/robotsGuard.ts';
import { assertSafePublicUrl } from '../security/urlGuard.ts';
import {
  ConnectorExecutionResult,
  ExternalSearchLink,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import { createTtlCache } from '../utils/cache.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import {
  JobBoardSourceConfig,
  isSearchIndexDiscoveryAllowed,
  sanitizeOfferByPolicy,
} from './jobBoardPolicy.ts';
import {
  WebSearchDiscoveryHit,
  WebSearchDiscoveryProvider,
  buildDiscoveryQueries,
} from './searchDiscoveryProvider.ts';

export interface JobBoardProvider {
  readonly id: string;
  readonly config: JobBoardSourceConfig;
  readonly collect: (criteria: SearchCriteria) => Promise<ConnectorExecutionResult>;
}

const rssCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);
const remotiveCache = createTtlCache<readonly RawScrapedOffer[]>(10 * 60 * 1000);

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const buildBoardExternalLink = (
  config: JobBoardSourceConfig,
  criteria: SearchCriteria,
  reason: string
): ExternalSearchLink => ({
  source: config.name,
  label: `Search on ${config.name}`,
  url: config.buildExternalSearchUrl(criteria),
  reason,
  accessMode: config.accessMode,
});

/**
 * Maps an external WebSearchDiscoveryHit into a strictly unverified RawScrapedOffer.
 * Never fetches restricted target pages and never invents missing duration/dates.
 */
export const mapDiscoveryHitToRawOffer = (
  hit: WebSearchDiscoveryHit,
  boardConfig?: JobBoardSourceConfig
): RawScrapedOffer => {
  const withoutBoardSuffix = hit.title
    .replace(/\s+[-|]\s+(Meteojob|HelloWork|Apec|Welcome to the Jungle).*$/i, '')
    .trim();
  const orgMatch =
    withoutBoardSuffix.match(/\bchez\s+([^-|–]+)$/i)?.[1] ??
    withoutBoardSuffix.match(/\bat\s+([^-|–]+)$/i)?.[1] ??
    withoutBoardSuffix.match(/[-|–]\s*([^-|–]{2,40})$/)?.[1];

  const cleanTitle = orgMatch
    ? withoutBoardSuffix
        .replace(/\s+(?:chez|at)\s+[^-|–]+$/i, '')
        .replace(/\s*[-|–]\s*[^-|–]{2,40}$/, '')
        .trim()
    : withoutBoardSuffix;

  const sourceName = boardConfig?.name ?? hit.matchedBoardName ?? hit.domain;

  const raw: RawScrapedOffer = {
    title: cleanTitle || withoutBoardSuffix || hit.title,
    organization: orgMatch?.trim() || sourceName,
    organizationSummary: `Discovered via external search index (${hit.discoveryProvider}) on ${hit.domain}. Verify full details on the original listing.`,
    location: null,
    workMode: null,
    contractType: /\b(stage|intern|internship|pfe)\b/i.test(`${hit.title} ${hit.snippet}`)
      ? 'Internship / Stage'
      : null,
    duration: null,
    durationMonths: null,
    postedDate: hit.publishedDate ?? null,
    startDate: null,
    endDate: null,
    description: hit.snippet || `External link discovered on ${hit.domain}.`,
    originalUrl: hit.url,
    applicationUrl: null,
    applicationEmail: null,
    source: sourceName,
    isExternalDiscovery: true,
    collectionMode: 'discovered',
    accessMode: boardConfig?.accessMode ?? 'search_index',
  };

  return boardConfig ? sanitizeOfferByPolicy(raw, boardConfig) : raw;
};

/**
 * Link-only + optional authorized search-index discovery provider.
 * Used for Meteojob, HelloWork, Welcome to the Jungle, Apec, LinkedIn, Indeed, JobTeaser.
 */
export const createLinkOnlyOrDiscoveryProvider = (
  config: JobBoardSourceConfig,
  options: {
    readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
    readonly env?: Readonly<Record<string, string | undefined>>;
  } = {}
): JobBoardProvider => ({
  id: `jobboard:${config.id}`,
  config,
  collect: async (criteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const effective = config.resolveEffectiveAccessMode
      ? config.resolveEffectiveAccessMode(options.env ?? process.env)
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

    const canDiscoverViaSearchIndex =
      criteria.includeExternalDiscovery !== false &&
      isSearchIndexDiscoveryAllowed(config) &&
      options.discoveryProvider?.isConfigured();

    if (!canDiscoverViaSearchIndex || !options.discoveryProvider) {
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
      const queries = buildDiscoveryQueries(criteria, [config], 1);
      const query = queries[0];
      if (!query) {
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

      const hits = await options.discoveryProvider.search(query);
      const offers = hits.map((hit) => mapDiscoveryHitToRawOffer(hit, config));

      return {
        source: config.name,
        connector: `${config.id}_search_index`,
        accessMode: 'search_index',
        status: 'ok',
        offers,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Discovered ${offers.length} unverified external link(s) via ${options.discoveryProvider.name}.`,
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
        message: err instanceof Error ? err.message : 'External search discovery failed',
      };
    }
  },
});

export interface FranceTravailOfferPayload {
  readonly id?: string;
  readonly intitule?: string;
  readonly description?: string;
  readonly dateCreation?: string;
  readonly dateActualisation?: string;
  readonly lieuTravail?: {
    readonly libelle?: string;
    readonly codePostal?: string;
    readonly commune?: string;
  };
  readonly entreprise?: {
    readonly nom?: string;
    readonly description?: string;
  };
  readonly typeContrat?: string;
  readonly typeContratLibelle?: string;
  readonly dureeTravailLibelle?: string;
  readonly competences?: Array<{ readonly libelle?: string }>;
  readonly contact?: {
    readonly nom?: string;
    readonly courriel?: string;
    readonly urlPostulation?: string;
  };
  readonly origineOffre?: {
    readonly urlOrigine?: string;
  };
}

export const parseFranceTravailPayload = (
  payload: { readonly resultats?: readonly FranceTravailOfferPayload[] },
  sourceName = 'France Travail'
): readonly RawScrapedOffer[] => {
  const offers: RawScrapedOffer[] = [];
  for (const item of payload.resultats ?? []) {
    if (!item.intitule?.trim()) continue;
    const url =
      item.origineOffre?.urlOrigine?.trim() ||
      (item.id ? `https://candidat.francetravail.fr/offres/recherche/detail/${item.id}` : '');
    if (!url) continue;

    const skills = (item.competences ?? [])
      .map((c) => c.libelle?.trim())
      .filter((x): x is string => Boolean(x));

    offers.push({
      externalId: item.id ?? null,
      title: item.intitule.trim(),
      organization: item.entreprise?.nom?.trim() || 'Employeur France Travail',
      organizationSummary: item.entreprise?.description?.trim() ?? null,
      location: item.lieuTravail?.libelle?.trim() ?? null,
      workMode: null,
      contractType: item.typeContratLibelle?.trim() || item.typeContrat?.trim() || null,
      duration: item.dureeTravailLibelle?.trim() ?? null,
      postedDate: item.dateCreation ? item.dateCreation.slice(0, 10) : null,
      startDate: null,
      endDate: null,
      skills,
      description: item.description?.trim() ?? null,
      originalUrl: url,
      applicationUrl: item.contact?.urlPostulation?.trim() ?? url,
      applicationEmail: item.contact?.courriel?.trim() ?? null,
      contactName: item.contact?.nom?.trim() ?? null,
      source: sourceName,
      isAuthorizedApi: true,
      collectionMode: 'collected',
      accessMode: 'official_api',
    });
  }
  return offers;
};

/**
 * Dedicated France Travail Official Offres d'emploi v2 API provider.
 * Strictly handles credentials, OAuth2 token, pagination, filters, quota/429 & suspension.
 * NEVER falls back to scraping francetravail.fr when unavailable or suspended.
 */
export const createFranceTravailApiProvider = (
  config: JobBoardSourceConfig,
  options: {
    readonly fetchFn?: typeof fetch;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly tokenEndpoint?: string;
    readonly searchEndpoint?: string;
    readonly maxPages?: number;
  } = {}
): JobBoardProvider => ({
  id: 'jobboard:france_travail',
  config,
  collect: async (criteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const env = options.env ?? process.env;
    const fetchFn = options.fetchFn ?? fetch;
    const effective = config.resolveEffectiveAccessMode
      ? config.resolveEffectiveAccessMode(env)
      : { accessMode: config.accessMode, authorizationStatus: config.authorizationStatus };

    const externalLink = buildBoardExternalLink(
      config,
      criteria,
      effective.reason ?? config.policySummary
    );

    if (effective.accessMode !== 'official_api') {
      return {
        source: config.name,
        connector: 'france_travail_official_api',
        accessMode: effective.accessMode,
        status: effective.accessMode === 'disabled' ? 'disabled_policy' : 'link_only',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: effective.reason,
      };
    }

    const clientId = env.FRANCE_TRAVAIL_CLIENT_ID?.trim() ?? '';
    const clientSecret = env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim() ?? '';

    try {
      const tokenEndpoint =
        options.tokenEndpoint ??
        'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';

      const form = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_offresdemploiv2 o2dsoffre',
      });

      const tokenRes = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
      });

      if (!tokenRes.ok) {
        const msg =
          tokenRes.status === 401 || tokenRes.status === 403
            ? `France Travail OAuth rejected (${tokenRes.status}). Check credentials/authorization.`
            : tokenRes.status === 503
              ? 'France Travail OAuth/API temporarily unavailable or suspended (503). Falling back to official link only.'
              : `France Travail OAuth failed with HTTP ${tokenRes.status}`;
        return {
          source: config.name,
          connector: 'france_travail_official_api',
          accessMode: 'link_only',
          status: 'error',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: msg,
        };
      }

      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) {
        return {
          source: config.name,
          connector: 'france_travail_official_api',
          accessMode: 'link_only',
          status: 'error',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: 'France Travail OAuth response missing access_token.',
        };
      }

      const searchEndpoint =
        options.searchEndpoint ??
        config.apiEndpoint ??
        'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
      const maxPages = options.maxPages ?? 2;
      const pageSize = 50;
      const allOffers: RawScrapedOffer[] = [];

      for (let page = 0; page < maxPages; page += 1) {
        const start = page * pageSize;
        const end = start + pageSize - 1;
        const url = new URL(searchEndpoint);
        const kwWithStage = /\bstage\b/i.test(criteria.keywords)
          ? criteria.keywords.trim()
          : `stage ${criteria.keywords.trim()}`;
        url.searchParams.set('motsCles', kwWithStage);
        url.searchParams.set('range', `${start}-${end}`);
        if (criteria.radiusKm && criteria.radiusKm > 0) {
          url.searchParams.set('distance', String(criteria.radiusKm));
        }

        const apiRes = await fetchFn(url.toString(), {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            Accept: 'application/json',
          },
        });

        if (apiRes.status === 429) {
          return {
            source: config.name,
            connector: 'france_travail_official_api',
            accessMode: 'official_api',
            status: 'error',
            offers: allOffers,
            externalSearchLinks: [externalLink],
            durationMs: Date.now() - started,
            message: 'France Travail API quota/rate limit reached (HTTP 429).',
          };
        }

        if (apiRes.status === 503 || apiRes.status === 403 || apiRes.status === 410) {
          return {
            source: config.name,
            connector: 'france_travail_official_api',
            accessMode: 'link_only',
            status: 'error',
            offers: allOffers,
            externalSearchLinks: [externalLink],
            durationMs: Date.now() - started,
            message: `France Travail API unavailable or suspended (HTTP ${apiRes.status}). No scraping fallback used.`,
          };
        }

        if (!apiRes.ok && apiRes.status !== 206) {
          return {
            source: config.name,
            connector: 'france_travail_official_api',
            accessMode: 'official_api',
            status: 'error',
            offers: allOffers,
            externalSearchLinks: [externalLink],
            durationMs: Date.now() - started,
            message: `France Travail API HTTP ${apiRes.status}`,
          };
        }

        const data = (await apiRes.json()) as { resultats?: FranceTravailOfferPayload[] };
        const parsed = parseFranceTravailPayload(data, config.name);
        allOffers.push(...parsed);

        if ((data.resultats?.length ?? 0) < pageSize) {
          break;
        }
      }

      return {
        source: config.name,
        connector: 'france_travail_official_api',
        accessMode: 'official_api',
        status: 'ok',
        offers: allOffers,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Collected ${allOffers.length} offers via France Travail API v2.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'france_travail_official_api',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'France Travail API request failed',
      };
    }
  },
});

export const parseRssOrAtomFeed = (
  xmlText: string,
  sourceName: string
): readonly RawScrapedOffer[] => {
  const $ = cheerio.load(xmlText, { xmlMode: true });
  const offers: RawScrapedOffer[] = [];

  // RSS 2.0 <item>
  $('channel > item, rss > channel > item, item').each((_idx, el) => {
    const titleRaw = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim() || $(el).find('guid').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim();
    const descriptionRaw = $(el).find('description').first().text().trim();
    const region = $(el).find('region').first().text().trim();

    if (!titleRaw || !link.startsWith('http')) return;

    const colonSplit = titleRaw.split(':');
    const organization =
      colonSplit.length >= 2 && colonSplit[0].trim().length >= 2
        ? colonSplit[0].trim()
        : sourceName;
    const title =
      colonSplit.length >= 2 ? colonSplit.slice(1).join(':').trim() : titleRaw;

    offers.push({
      externalId: link,
      title,
      organization,
      location: region || null,
      workMode: /remote/i.test(`${titleRaw} ${region}`) ? 'Remote' : null,
      contractType: /\b(stage|intern|internship)\b/i.test(`${titleRaw} ${descriptionRaw}`)
        ? 'Internship / Stage'
        : null,
      duration: null,
      postedDate: pubDate && !Number.isNaN(Date.parse(pubDate))
        ? new Date(pubDate).toISOString().slice(0, 10)
        : null,
      startDate: null,
      endDate: null,
      description: stripHtml(descriptionRaw).slice(0, 1400) || null,
      originalUrl: link,
      applicationUrl: link,
      source: sourceName,
      isRssFeed: true,
      collectionMode: 'collected',
      accessMode: 'rss_feed',
    });
  });

  // Atom <entry>
  if (offers.length === 0) {
    $('feed > entry, entry').each((_idx, el) => {
      const title = $(el).find('title').first().text().trim();
      const link = $(el).find('link').first().attr('href')?.trim() ?? '';
      const updated = $(el).find('updated, published').first().text().trim();
      const summary = $(el).find('summary, content').first().text().trim();
      const author = $(el).find('author > name').first().text().trim();

      if (!title || !link.startsWith('http')) return;

      offers.push({
        externalId: link,
        title,
        organization: author || sourceName,
        location: null,
        postedDate:
          updated && !Number.isNaN(Date.parse(updated))
            ? new Date(updated).toISOString().slice(0, 10)
            : null,
        description: stripHtml(summary).slice(0, 1400) || null,
        originalUrl: link,
        applicationUrl: link,
        source: sourceName,
        isRssFeed: true,
        collectionMode: 'collected',
        accessMode: 'rss_feed',
      });
    });
  }

  return offers;
};

export const createRssJobBoardProvider = (
  config: JobBoardSourceConfig,
  options: {
    readonly fetchFn?: typeof fetch;
    readonly skipRobotsOrDns?: boolean;
  } = {}
): JobBoardProvider => ({
  id: `jobboard:${config.id}`,
  config,
  collect: async (criteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const feedUrls = config.rssFeedUrls ?? [];
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    if (feedUrls.length === 0) {
      return {
        source: config.name,
        connector: `${config.id}_rss`,
        accessMode: 'link_only',
        status: 'link_only',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: 'No RSS feed URLs configured.',
      };
    }

    const cacheKey = `${config.id}:${feedUrls[0]}`;
    const cached = rssCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: `${config.id}_rss`,
        accessMode: 'rss_feed',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
      };
    }

    const allOffers: RawScrapedOffer[] = [];
    let lastError: string | undefined;

    for (const feedUrl of feedUrls) {
      try {
        if (!options.skipRobotsOrDns) {
          const safe = await assertSafePublicUrl(feedUrl);
          if (!safe.safe) {
            lastError = safe.reason;
            continue;
          }
          const robots = await checkRobotsAllowance(feedUrl, fetchFn);
          if (!robots.allowed) {
            return {
              source: config.name,
              connector: `${config.id}_rss`,
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
          timeoutMs: 7000,
          retries: 1,
          fetchFn,
          skipDnsCheck: options.skipRobotsOrDns,
        });

        if (!res.ok) {
          lastError = `RSS HTTP ${res.status}`;
          continue;
        }

        const parsed = parseRssOrAtomFeed(res.bodyText, config.name).map((o) =>
          sanitizeOfferByPolicy(o, config)
        );
        allOffers.push(...parsed);
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'RSS fetch error';
      }
    }

    if (allOffers.length > 0) {
      rssCache.set(cacheKey, allOffers, 10 * 60 * 1000);
    }

    return {
      source: config.name,
      connector: `${config.id}_rss`,
      accessMode: 'rss_feed',
      status: allOffers.length > 0 ? 'ok' : lastError ? 'error' : 'ok',
      offers: allOffers,
      externalSearchLinks: [externalLink],
      durationMs: Date.now() - started,
      message: lastError,
    };
  },
});

export interface RemotiveApiJob {
  readonly id?: number;
  readonly url?: string;
  readonly title?: string;
  readonly company_name?: string;
  readonly job_type?: string;
  readonly publication_date?: string;
  readonly candidate_required_location?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export const parseRemotiveApiPayload = (
  payload: { readonly jobs?: readonly RemotiveApiJob[] },
  sourceName = 'Remotive'
): readonly RawScrapedOffer[] => {
  const offers: RawScrapedOffer[] = [];
  for (const job of payload.jobs ?? []) {
    if (!job.title?.trim() || !job.url?.startsWith('http')) continue;
    offers.push({
      externalId: job.id ? String(job.id) : job.url,
      title: job.title.trim(),
      organization: job.company_name?.trim() || 'Remotive Company',
      location: job.candidate_required_location?.trim() || 'Remote',
      workMode: 'Remote',
      contractType: job.job_type?.trim() || null,
      duration: null,
      postedDate: job.publication_date ? job.publication_date.slice(0, 10) : null,
      startDate: null,
      endDate: null,
      skills: (job.tags ?? []).slice(0, 10),
      description: job.description ? stripHtml(job.description).slice(0, 1400) : null,
      originalUrl: job.url.trim(),
      applicationUrl: job.url.trim(),
      source: sourceName,
      isAuthorizedApi: true,
      collectionMode: 'collected',
      accessMode: 'official_api',
    });
  }
  return offers;
};

export const createRemotiveApiProvider = (
  config: JobBoardSourceConfig,
  options: {
    readonly fetchFn?: typeof fetch;
    readonly skipDnsCheck?: boolean;
  } = {}
): JobBoardProvider => ({
  id: 'jobboard:remotive',
  config,
  collect: async (criteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);
    const cacheKey = `remotive:${criteria.keywords.toLowerCase().trim()}`;
    const cached = remotiveCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'remotive_official_api',
        accessMode: 'official_api',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
      };
    }

    try {
      const endpoint = new URL(config.apiEndpoint ?? 'https://remotive.com/api/remote-jobs');
      endpoint.searchParams.set('search', criteria.keywords.trim());
      endpoint.searchParams.set('limit', '40');

      const res = await fetchWithRetry(endpoint.toString(), {
        timeoutMs: 7000,
        retries: 1,
        fetchFn,
        skipDnsCheck: options.skipDnsCheck,
      });

      if (!res.ok) {
        return {
          source: config.name,
          connector: 'remotive_official_api',
          accessMode: 'link_only',
          status: 'error',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: `Remotive API returned HTTP ${res.status}`,
        };
      }

      const data = JSON.parse(res.bodyText) as { jobs?: RemotiveApiJob[] };
      const offers = parseRemotiveApiPayload(data, config.name).map((o) =>
        sanitizeOfferByPolicy(o, config)
      );
      if (offers.length > 0) {
        remotiveCache.set(cacheKey, offers, 10 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'remotive_official_api',
        accessMode: 'official_api',
        status: 'ok',
        offers,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Collected ${offers.length} remote jobs from Remotive public API.`,
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
        message: err instanceof Error ? err.message : 'Remotive API request failed',
      };
    }
  },
});

export const createJobBoardProviderForConfig = (
  config: JobBoardSourceConfig,
  options: {
    readonly fetchFn?: typeof fetch;
    readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly skipSecurityForTest?: boolean;
  } = {}
): JobBoardProvider => {
  if (config.id === 'france_travail') {
    return createFranceTravailApiProvider(config, {
      fetchFn: options.fetchFn,
      env: options.env,
    });
  }
  if (config.id === 'remotive') {
    return createRemotiveApiProvider(config, {
      fetchFn: options.fetchFn,
      skipDnsCheck: options.skipSecurityForTest,
    });
  }
  if (config.accessMode === 'rss_feed') {
    return createRssJobBoardProvider(config, {
      fetchFn: options.fetchFn,
      skipRobotsOrDns: options.skipSecurityForTest,
    });
  }
  return createLinkOnlyOrDiscoveryProvider(config, {
    discoveryProvider: options.discoveryProvider,
    env: options.env,
  });
};
