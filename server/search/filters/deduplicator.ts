import { NormalizedScrapedOffer } from '../types.ts';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gh_src',
  'lever-source',
  'lever-origin',
  'ashby_jid',
  'ref',
  'fbclid',
  'gclid',
]);

export const canonicalizeOfferUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl.trim());
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
};

const buildIdentityKey = (offer: NormalizedScrapedOffer): string => {
  const org = offer.organization.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const title = offer.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const loc = offer.location.toLowerCase().split(',')[0]?.replace(/[^a-z0-9]+/g, ' ').trim() || '';
  return `${org}::${title}::${loc}`;
};

const mergeOffers = (
  primary: NormalizedScrapedOffer,
  secondary: NormalizedScrapedOffer
): NormalizedScrapedOffer => {
  const preferSecondaryUrl =
    primary.verificationStatus === 'generic_career_page' &&
    (secondary.verificationStatus === 'verified_ats_api' ||
      secondary.verificationStatus === 'verified_offer');

  const mergedSkills = Array.from(
    new Set([...primary.requirements, ...secondary.requirements])
  );

  return {
    ...primary,
    sourceUrl: preferSecondaryUrl ? secondary.sourceUrl : primary.sourceUrl,
    verificationStatus: preferSecondaryUrl
      ? secondary.verificationStatus
      : primary.verificationStatus,
    description:
      secondary.description.length > primary.description.length
        ? secondary.description
        : primary.description,
    location: primary.location === 'Unspecified' ? secondary.location : primary.location,
    duration: primary.duration ?? secondary.duration,
    durationMonths: primary.durationMonths ?? secondary.durationMonths,
    startDate: primary.startDate ?? secondary.startDate,
    endDate: primary.endDate ?? secondary.endDate,
    postedDate: primary.postedDate ?? secondary.postedDate,
    applicationUrl: primary.applicationUrl ?? secondary.applicationUrl,
    applicationFormUrl: primary.applicationFormUrl ?? secondary.applicationFormUrl,
    applicationEmail: primary.applicationEmail ?? secondary.applicationEmail,
    contactName: primary.contactName ?? secondary.contactName,
    requirements: mergedSkills,
  };
};

export const deduplicateScrapedOffers = (
  offers: readonly NormalizedScrapedOffer[]
): readonly NormalizedScrapedOffer[] => {
  const byUrl = new Map<string, number>();
  const byIdentity = new Map<string, number>();
  const result: NormalizedScrapedOffer[] = [];

  for (const offer of offers) {
    const canonUrl = canonicalizeOfferUrl(offer.sourceUrl);
    const identityKey = buildIdentityKey(offer);

    const existingIdx = byUrl.get(canonUrl) ?? byIdentity.get(identityKey);

    if (existingIdx !== undefined) {
      result[existingIdx] = mergeOffers(result[existingIdx], offer);
      byUrl.set(canonUrl, existingIdx);
      byIdentity.set(identityKey, existingIdx);
    } else {
      const idx = result.length;
      result.push(offer);
      byUrl.set(canonUrl, idx);
      byIdentity.set(identityKey, idx);
    }
  }

  return result;
};
