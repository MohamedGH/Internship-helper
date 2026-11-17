import * as cheerio from 'cheerio';
import {
  JobBoardSourceConfig,
  sanitizeOfferByPolicy,
} from '../jobboards/jobBoardPolicy.ts';
import { buildBoardExternalLink } from '../jobboards/jobBoardProvider.ts';
import { checkRobotsAllowance } from '../security/robotsGuard.ts';
import { assertSafePublicUrl } from '../security/urlGuard.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import { createTtlCache } from '../utils/cache.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import {
  PlatformAdapter,
  PlatformProviderOptions,
  enrichAuthorizedOfferDetail,
  stripHtmlTags,
} from './platformProvider.ts';

const afjvCache = createTtlCache<readonly RawScrapedOffer[]>(15 * 60 * 1000);

export const parseAfjvRssFeed = (
  xmlText: string,
  sourceName = 'AFJV'
): readonly RawScrapedOffer[] => {
  const $ = cheerio.load(xmlText, { xmlMode: true });
  const offers: RawScrapedOffer[] = [];

  $('channel > item, item').each((_idx, el) => {
    const rawTitle = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim() || $(el).find('guid').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim();
    const descriptionRaw = $(el).find('description').first().text().trim();
    const category = $(el).find('category').first().text().trim();

    if (!rawTitle || !link.startsWith('http')) return;

    const cleanDesc = stripHtmlTags(descriptionRaw);
    // AFJV RSS titles typically look like "Stage - Game Designer H/F - Studio (Lille)" or "Programmeur C++ (Stage)"
    const dashParts = rawTitle.split(/\s+-\s+/);
    let title = rawTitle;
    let organization = sourceName;
    let location: string | null = null;

    if (dashParts.length >= 2) {
      title = dashParts.slice(0, -1).join(' - ').trim();
      const tail = dashParts[dashParts.length - 1]?.trim() ?? '';
      const locMatch = tail.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (locMatch) {
        organization = locMatch[1].trim() || sourceName;
        location = locMatch[2].trim() || null;
      } else if (tail.length >= 2 && tail.length <= 60) {
        organization = tail;
      }
    }

    const fullCorpus = `${rawTitle} ${category} ${cleanDesc}`;
    const isStage = /\b(stage|stagiaire|intern|internship|alternance)\b/i.test(fullCorpus);

    offers.push({
      externalId: link,
      title,
      organization,
      location,
      workMode: /\b(télétravail|remote)\b/i.test(fullCorpus) ? 'Remote' : null,
      contractType: isStage ? 'Stage / Internship' : category || null,
      duration: null,
      postedDate:
        pubDate && !Number.isNaN(Date.parse(pubDate))
          ? new Date(pubDate).toISOString().slice(0, 10)
          : null,
      startDate: null,
      endDate: null,
      description: cleanDesc ? cleanDesc.slice(0, 1400) : null,
      originalUrl: link,
      applicationUrl: link,
      source: sourceName,
      isRssFeed: true,
      collectionMode: 'collected',
      accessMode: 'rss_feed',
    });
  });

  return offers;
};

export const createAfjvProvider = (
  config: JobBoardSourceConfig,
  options: PlatformProviderOptions = {}
): PlatformAdapter => ({
  id: 'jobboard:afjv',
  name: config.name,
  config,
  collect: async (criteria: SearchCriteria): Promise<ConnectorExecutionResult> => {
    const started = Date.now();
    const fetchFn = options.fetchFn ?? fetch;
    const feedUrl = config.rssFeedUrls?.[0] ?? 'https://emploi.afjv.com/rss.xml';
    const externalLink = buildBoardExternalLink(config, criteria, config.policySummary);

    const cacheKey = `afjv:${feedUrl}`;
    const cached = afjvCache.get(cacheKey);
    if (cached) {
      return {
        source: config.name,
        connector: 'afjv_official_rss',
        accessMode: 'rss_feed',
        status: 'cached',
        offers: cached,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Loaded ${cached.length} AFJV offers from cache.`,
      };
    }

    try {
      if (!options.skipSecurityForTest) {
        const safe = await assertSafePublicUrl(feedUrl);
        if (!safe.safe) {
          return {
            source: config.name,
            connector: 'afjv_official_rss',
            accessMode: 'link_only',
            status: 'error',
            offers: [],
            externalSearchLinks: [externalLink],
            durationMs: Date.now() - started,
            message: safe.reason,
          };
        }
        const robots = await checkRobotsAllowance(feedUrl, fetchFn);
        if (!robots.allowed) {
          return {
            source: config.name,
            connector: 'afjv_official_rss',
            accessMode: 'link_only',
            status: 'robots_blocked',
            offers: [],
            externalSearchLinks: [externalLink],
            durationMs: Date.now() - started,
            message: robots.reason ?? 'Disallowed by AFJV robots.txt',
          };
        }
      }

      const res = await fetchWithRetry(feedUrl, {
        timeoutMs: 8000,
        retries: 1,
        fetchFn,
        skipDnsCheck: options.skipSecurityForTest,
      });

      if (!res.ok) {
        return {
          source: config.name,
          connector: 'afjv_official_rss',
          accessMode: 'link_only',
          status: 'error',
          offers: [],
          externalSearchLinks: [externalLink],
          durationMs: Date.now() - started,
          message: `AFJV RSS HTTP ${res.status}`,
        };
      }

      const rawOffers = parseAfjvRssFeed(res.bodyText, config.name).map((o) =>
        sanitizeOfferByPolicy(o, config)
      );

      // Enrich top 4 Stage offers with Schema.org JSON-LD from detail pages (robots.txt allowed)
      let finalOffers = rawOffers;
      if (options.enrichDetailPages !== false) {
        const stageCandidates = rawOffers
          .filter((o) => /\bstage\b/i.test(`${o.title} ${o.contractType ?? ''}`))
          .slice(0, 4);
        const stageSet = new Set(stageCandidates.map((o) => o.originalUrl));
        const enrichedTop = await Promise.all(
          stageCandidates.map((o) =>
            enrichAuthorizedOfferDetail(o, fetchFn, options.skipSecurityForTest ?? false)
          )
        );
        const enrichedByUrl = new Map(enrichedTop.map((o) => [o.originalUrl, o]));
        finalOffers = rawOffers.map((o) =>
          stageSet.has(o.originalUrl) ? enrichedByUrl.get(o.originalUrl) ?? o : o
        );
      }

      if (finalOffers.length > 0) {
        afjvCache.set(cacheKey, finalOffers, 15 * 60 * 1000);
      }

      return {
        source: config.name,
        connector: 'afjv_official_rss',
        accessMode: 'rss_feed',
        status: 'ok',
        offers: finalOffers,
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: `Collected ${finalOffers.length} IT / video game / 3D offers via official AFJV RSS feed.`,
      };
    } catch (err) {
      return {
        source: config.name,
        connector: 'afjv_official_rss',
        accessMode: 'link_only',
        status: 'error',
        offers: [],
        externalSearchLinks: [externalLink],
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'AFJV RSS request failed',
      };
    }
  },
});
