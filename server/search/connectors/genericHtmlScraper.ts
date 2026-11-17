import {
  extractDetailPageMetadata,
  extractOffersHeuristicallyFromHtml,
  extractOffersWithSelectors,
} from '../extractors/htmlExtractor.ts';
import { extractJobPostingsFromJsonLd } from '../extractors/jsonLdExtractor.ts';
import { checkRobotsAllowance } from '../security/robotsGuard.ts';
import { assertSafePublicUrl } from '../security/urlGuard.ts';
import {
  ConnectorExecutionResult,
  CustomSourceInput,
  RawScrapedOffer,
  ScraperConnector,
  SearchCriteria,
} from '../types.ts';
import { createTtlCache } from '../utils/cache.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import { isSpecificOfferUrl } from '../validators/offerVerifier.ts';
import { fetchAshbyBoard, parseAshbyBoardName } from './ashbyScraper.ts';
import { fetchGreenhouseBoard, parseGreenhouseBoardToken } from './greenhouseScraper.ts';
import { fetchLeverBoard, parseLeverSlug } from './leverScraper.ts';

const customHtmlCache = createTtlCache<readonly RawScrapedOffer[]>(5 * 60 * 1000);

export const resolveCustomSourceTargetUrl = (
  source: CustomSourceInput,
  criteria: SearchCriteria
): string => {
  if (!source.searchUrlTemplate) return source.baseUrl;
  return source.searchUrlTemplate
    .replace(/{keywords}/g, encodeURIComponent(criteria.keywords.trim()))
    .replace(/{location}/g, encodeURIComponent(criteria.location.trim()));
};

const renderWithOptionalPlaywright = async (url: string): Promise<string | null> => {
  try {
    // Dynamic import so server never crashes when playwright is absent or unprovisioned
    const pwModuleName = 'playwright';
    const pw = (await import(pwModuleName)) as {
      chromium?: {
        launch: (opts: { headless: boolean }) => Promise<{
          newPage: () => Promise<{
            goto: (u: string, o: { waitUntil: string; timeout: number }) => Promise<void>;
            content: () => Promise<string>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };
    if (!pw?.chromium) return null;
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
};

export const extractOffersFromHtmlDocument = (
  html: string,
  pageUrl: string,
  source: CustomSourceInput
): readonly RawScrapedOffer[] => {
  // 1. Always check Schema.org JSON-LD first
  const jsonLdOffers = extractJobPostingsFromJsonLd(html, pageUrl, source.name);
  if (jsonLdOffers.length > 0) {
    return jsonLdOffers;
  }

  // 2. If custom CSS selectors are configured, use them
  if (source.cssSelectors?.jobListSelector) {
    const selectorOffers = extractOffersWithSelectors(
      html,
      pageUrl,
      source.name,
      source.cssSelectors
    );
    if (selectorOffers.length > 0) {
      return selectorOffers;
    }
  }

  // 3. Fallback to Cheerio career page heuristics
  return extractOffersHeuristicallyFromHtml(html, pageUrl, source.name);
};

const enrichOfferFromDetailPage = async (
  offer: RawScrapedOffer,
  fetchFn: typeof fetch,
  skipRobotsOrDns = false
): Promise<RawScrapedOffer> => {
  if (!isSpecificOfferUrl(offer.originalUrl) || (offer.description && offer.applicationEmail)) {
    return offer;
  }

  try {
    if (!skipRobotsOrDns) {
      const robots = await checkRobotsAllowance(offer.originalUrl, fetchFn);
      if (!robots.allowed) return offer;
    }

    const res = await fetchWithRetry(offer.originalUrl, {
      timeoutMs: 6000,
      retries: 0,
      fetchFn,
      skipDnsCheck: skipRobotsOrDns,
    });
    if (!res.ok) return offer;

    const jsonLd = extractJobPostingsFromJsonLd(res.bodyText, offer.originalUrl, offer.source);
    if (jsonLd[0]) {
      return {
        ...offer,
        description: offer.description ?? jsonLd[0].description,
        duration: offer.duration ?? jsonLd[0].duration,
        startDate: offer.startDate ?? jsonLd[0].startDate,
        postedDate: offer.postedDate ?? jsonLd[0].postedDate,
        location: offer.location ?? jsonLd[0].location,
        applicationEmail: offer.applicationEmail ?? jsonLd[0].applicationEmail,
        applicationUrl: offer.applicationUrl ?? jsonLd[0].applicationUrl,
      };
    }

    const meta = extractDetailPageMetadata(res.bodyText, offer.originalUrl);
    return {
      ...offer,
      description: offer.description ?? meta.description,
      duration: offer.duration ?? meta.duration,
      startDate: offer.startDate ?? meta.startDate,
      applicationEmail: offer.applicationEmail ?? meta.applicationEmail,
      applicationUrl: offer.applicationUrl ?? meta.applicationUrl,
    };
  } catch {
    return offer;
  }
};

export interface GenericHtmlConnectorOptions {
  readonly fetchFn?: typeof fetch;
  readonly skipRobotsOrDns?: boolean;
}

export const createGenericHtmlConnector = (
  source: CustomSourceInput,
  options: GenericHtmlConnectorOptions = {}
): ScraperConnector => ({
  id: `custom:${source.id}`,
  sourceName: source.name,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const skipSecurityForTest = options.skipRobotsOrDns ?? false;
    const targetUrl = resolveCustomSourceTargetUrl(source, criteria);

    // Delegate ATS URLs automatically to public ATS API scrapers
    const ghToken = parseGreenhouseBoardToken(source.baseUrl);
    if (ghToken) {
      try {
        const offers = await fetchGreenhouseBoard(
          { token: ghToken, organization: source.name },
          source.name,
          fetchFn
        );
        return {
          source: source.name,
          connector: 'greenhouseScraper',
          status: 'ok',
          offers,
          externalSearchLinks: [],
          durationMs: Date.now() - started,
        };
      } catch (err) {
        return {
          source: source.name,
          connector: 'greenhouseScraper',
          status: 'error',
          offers: [],
          externalSearchLinks: [],
          durationMs: Date.now() - started,
          message: err instanceof Error ? err.message : 'Greenhouse custom board failed',
        };
      }
    }

    const leverSlug = parseLeverSlug(source.baseUrl);
    if (leverSlug) {
      try {
        const offers = await fetchLeverBoard(
          { slug: leverSlug, organization: source.name },
          source.name,
          fetchFn
        );
        return {
          source: source.name,
          connector: 'leverScraper',
          status: 'ok',
          offers,
          externalSearchLinks: [],
          durationMs: Date.now() - started,
        };
      } catch (err) {
        return {
          source: source.name,
          connector: 'leverScraper',
          status: 'error',
          offers: [],
          externalSearchLinks: [],
          durationMs: Date.now() - started,
          message: err instanceof Error ? err.message : 'Lever custom board failed',
        };
      }
    }

    const ashbyBoard = parseAshbyBoardName(source.baseUrl);
    if (ashbyBoard) {
      try {
        const offers = await fetchAshbyBoard(
          { boardName: ashbyBoard, organization: source.name },
          source.name,
          fetchFn
        );
        return {
          source: source.name,
          connector: 'ashbyScraper',
          status: 'ok',
          offers,
          externalSearchLinks: [],
          durationMs: Date.now() - started,
        };
      } catch (err) {
        return {
          source: source.name,
          connector: 'ashbyScraper',
          status: 'error',
          offers: [],
          externalSearchLinks: [],
          durationMs: Date.now() - started,
          message: err instanceof Error ? err.message : 'Ashby custom board failed',
        };
      }
    }

    // Check SSRF protection
    if (!skipSecurityForTest) {
      const safe = await assertSafePublicUrl(targetUrl);
      if (!safe.safe) {
        return {
          source: source.name,
          connector: 'genericHtmlScraper',
          status: 'error',
          offers: [],
          externalSearchLinks: [],
          durationMs: Date.now() - started,
          message: safe.reason ?? 'Blocked unsafe custom source URL',
        };
      }

      // Check robots.txt allowance
      const robots = await checkRobotsAllowance(targetUrl, fetchFn);
      if (!robots.allowed) {
        return {
          source: source.name,
          connector: 'genericHtmlScraper',
          status: 'robots_blocked',
          offers: [],
          externalSearchLinks: [
            {
              source: source.name,
              label: `Open ${source.name} directly`,
              url: targetUrl,
              reason: robots.reason ?? 'Disallowed by site robots.txt',
            },
          ],
          durationMs: Date.now() - started,
          message: robots.reason ?? 'Disallowed by site robots.txt',
        };
      }
    }

    const ttlMs = (source.collectFrequencyMinutes ?? 10) * 60 * 1000;
    const cacheKey = `${source.id}::${targetUrl}`;
    const cached = ttlMs > 0 ? customHtmlCache.get(cacheKey) : undefined;
    if (cached) {
      return {
        source: source.name,
        connector: 'genericHtmlScraper',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [],
        durationMs: Date.now() - started,
      };
    }

    try {
      const res = await fetchWithRetry(targetUrl, {
        timeoutMs: 8000,
        retries: 1,
        fetchFn,
        skipDnsCheck: skipSecurityForTest,
      });

      if (!res.ok) {
        return {
          source: source.name,
          connector: 'genericHtmlScraper',
          status: 'error',
          offers: [],
          externalSearchLinks: [
            {
              source: source.name,
              label: `Search directly on ${source.name}`,
              url: targetUrl,
              reason: `Site returned HTTP ${res.status}`,
            },
          ],
          durationMs: Date.now() - started,
          message: `HTTP ${res.status} returned by ${source.name}`,
        };
      }

      let extracted = extractOffersFromHtmlDocument(res.bodyText, res.url, source);

      if (extracted.length === 0 && source.usePlaywright && !skipSecurityForTest) {
        const renderedHtml = await renderWithOptionalPlaywright(res.url);
        if (renderedHtml) {
          extracted = extractOffersFromHtmlDocument(renderedHtml, res.url, source);
        }
      }

      // Enrich top 5 offers that have specific detail URLs missing descriptions/emails
      const head = await Promise.all(
        extracted
          .slice(0, 5)
          .map((item) => enrichOfferFromDetailPage(item, fetchFn, skipSecurityForTest))
      );
      const finalOffers = [...head, ...extracted.slice(5)];

      if (ttlMs > 0 && finalOffers.length > 0) {
        customHtmlCache.set(cacheKey, finalOffers, ttlMs);
      }

      return {
        source: source.name,
        connector: 'genericHtmlScraper',
        status: 'ok',
        offers: finalOffers,
        externalSearchLinks:
          finalOffers.length === 0
            ? [
                {
                  source: source.name,
                  label: `Open ${source.name} in browser`,
                  url: targetUrl,
                  reason: 'No static HTML or JSON-LD offers detected on page.',
                },
              ]
            : [],
        durationMs: Date.now() - started,
        message: `Extracted ${finalOffers.length} candidate offers from ${res.url}`,
      };
    } catch (err) {
      return {
        source: source.name,
        connector: 'genericHtmlScraper',
        status: 'error',
        offers: [],
        externalSearchLinks: [
          {
            source: source.name,
            label: `Open ${source.name}`,
            url: targetUrl,
            reason: err instanceof Error ? err.message : 'Request failed',
          },
        ],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Custom source fetch failed',
      };
    }
  },
});
