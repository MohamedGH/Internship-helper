import { JobBoardSourceConfig } from '../jobboards/jobBoardPolicy.ts';
import {
  FranceTravailOfferPayload,
  buildBoardExternalLink,
  parseFranceTravailPayload,
} from '../jobboards/jobBoardProvider.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import {
  PlatformAdapter,
  PlatformProviderOptions,
  dedupeRawOffers,
} from './platformProvider.ts';
import { buildMultipliedQueries } from './queryPlanner.ts';

export interface FranceTravailPlatformOptions extends PlatformProviderOptions {
  readonly tokenEndpoint?: string;
  readonly searchEndpoint?: string;
}

/**
 * Multi-query & paginated France Travail Official Offres d'emploi v2 API adapter.
 * Strictly respects OAuth2 client credentials, quota 429, suspension 503, and
 * NEVER falls back to scraping francetravail.fr.
 */
export const createFranceTravailPlatformProvider = (
  config: JobBoardSourceConfig,
  options: FranceTravailPlatformOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:france_travail',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
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
            ? `France Travail OAuth rejected (${tokenRes.status}). Check credentials.`
            : tokenRes.status === 503
              ? 'France Travail OAuth/API suspended (503). Official external link only.'
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
      const maxQueries = options.maxQueries ?? 2;
      const pageSize = 50;

      const frQueries = buildMultipliedQueries(criteria, { maxQueries: 4 })
        .filter((q) => q.language === 'fr')
        .slice(0, maxQueries);
      const keywordsList =
        frQueries.length > 0
          ? frQueries.map((q) => q.query)
          : [
              /\bstage\b/i.test(criteria.keywords)
                ? criteria.keywords.trim()
                : `stage ${criteria.keywords.trim()}`,
            ];

      const allOffers: RawScrapedOffer[] = [];
      for (const kwQuery of keywordsList) {
        for (let page = 0; page < maxPages; page += 1) {
          const start = page * pageSize;
          const end = start + pageSize - 1;
          const url = new URL(searchEndpoint);
          url.searchParams.set('motsCles', kwQuery);
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
              offers: dedupeRawOffers(allOffers),
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
              offers: dedupeRawOffers(allOffers),
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
              offers: dedupeRawOffers(allOffers),
              externalSearchLinks: [externalLink],
              durationMs: Date.now() - started,
              message: `France Travail API HTTP ${apiRes.status}`,
            };
          }

          const data = (await apiRes.json()) as { resultats?: FranceTravailOfferPayload[] };
          allOffers.push(...parseFranceTravailPayload(data, config.name));

          if ((data.resultats?.length ?? 0) < pageSize) {
            break;
          }
        }
      }

      const unique = dedupeRawOffers(allOffers);
      return {
        source: config.name,
        connector: 'france_travail_official_api',
        accessMode: 'official_api',
        status: 'ok',
        offers: unique,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Collected ${unique.length} offers via France Travail API v2 (${keywordsList.length} queries).`,
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
