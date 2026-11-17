import { extractDetailPageMetadata } from '../extractors/htmlExtractor.ts';
import { extractJobPostingsFromJsonLd } from '../extractors/jsonLdExtractor.ts';
import { JobBoardSourceConfig } from '../jobboards/jobBoardPolicy.ts';
import { checkRobotsAllowance } from '../security/robotsGuard.ts';
import { assertSafePublicUrl } from '../security/urlGuard.ts';
import {
  ConnectorExecutionResult,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';
import { fetchWithRetry } from '../utils/httpClient.ts';
import { isSpecificOfferUrl } from '../validators/offerVerifier.ts';

export interface PlatformProviderOptions {
  readonly fetchFn?: typeof fetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly skipSecurityForTest?: boolean;
  readonly maxPages?: number;
  readonly maxQueries?: number;
  readonly enrichDetailPages?: boolean;
}

export interface PlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly config: JobBoardSourceConfig;
  readonly collect: (criteria: SearchCriteria) => Promise<ConnectorExecutionResult>;
}

export const stripHtmlTags = (html: string | null | undefined): string =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

export const dedupeRawOffers = (offers: readonly RawScrapedOffer[]): readonly RawScrapedOffer[] => {
  const seen = new Set<string>();
  const out: RawScrapedOffer[] = [];
  for (const offer of offers) {
    const key = (offer.originalUrl || `${offer.organization}::${offer.title}`)
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(offer);
  }
  return out;
};

/**
 * Inspects an authorized offer's detail page (when robots.txt permits)
 * to extract Schema.org JobPosting JSON-LD or semantic HTML details
 * without inventing any missing fields.
 */
export const enrichAuthorizedOfferDetail = async (
  offer: RawScrapedOffer,
  fetchFn: typeof fetch = fetch,
  skipSecurity = false
): Promise<RawScrapedOffer> => {
  if (!isSpecificOfferUrl(offer.originalUrl)) {
    return offer;
  }
  const hasRichDesc = Boolean(offer.description && offer.description.length > 260);
  if (hasRichDesc && (offer.duration || offer.applicationEmail)) {
    return offer;
  }

  try {
    if (!skipSecurity) {
      const safe = await assertSafePublicUrl(offer.originalUrl);
      if (!safe.safe) return offer;
      const robots = await checkRobotsAllowance(offer.originalUrl, fetchFn);
      if (!robots.allowed) return offer;
    }

    const res = await fetchWithRetry(offer.originalUrl, {
      timeoutMs: 6000,
      retries: 0,
      fetchFn,
      skipDnsCheck: skipSecurity,
    });
    if (!res.ok) return offer;

    const jsonLd = extractJobPostingsFromJsonLd(res.bodyText, offer.originalUrl, offer.source);
    const meta = extractDetailPageMetadata(res.bodyText, offer.originalUrl);

    const richJson = jsonLd[0];
    const bestDescription =
      richJson?.description && richJson.description.length > (offer.description?.length ?? 0)
        ? richJson.description
        : meta.description && meta.description.length > (offer.description?.length ?? 0)
          ? meta.description
          : offer.description;

    return {
      ...offer,
      organization:
        offer.organization && offer.organization !== offer.source
          ? offer.organization
          : richJson?.organization || offer.organization,
      location: offer.location ?? richJson?.location ?? null,
      workMode: offer.workMode ?? richJson?.workMode ?? null,
      contractType: offer.contractType ?? richJson?.contractType ?? null,
      duration: offer.duration ?? richJson?.duration ?? meta.duration ?? null,
      startDate: offer.startDate ?? richJson?.startDate ?? meta.startDate ?? null,
      postedDate: offer.postedDate ?? richJson?.postedDate ?? null,
      skills:
        offer.skills && offer.skills.length > 0
          ? offer.skills
          : richJson?.skills ?? [],
      description: bestDescription ?? null,
      applicationEmail:
        offer.applicationEmail ?? richJson?.applicationEmail ?? meta.applicationEmail ?? null,
      applicationUrl:
        offer.applicationUrl ?? richJson?.applicationUrl ?? meta.applicationUrl ?? null,
    };
  } catch {
    return offer;
  }
};
