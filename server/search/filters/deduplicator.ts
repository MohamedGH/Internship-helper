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
  const loc =
    offer.location === 'Unspecified'
      ? ''
      : offer.location.toLowerCase().split(',')[0]?.replace(/[^a-z0-9]+/g, ' ').trim() || '';
  return `${org}::${title}::${loc}`;
};

const buildOrgTitleKey = (offer: NormalizedScrapedOffer): string => {
  const org = offer.organization.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const title = offer.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${org}::${title}`;
};

const computeDescriptionJaccard = (a: string, b: string): number => {
  if (a.length < 60 || b.length < 60) return 0;
  const tokA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  const tokB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  if (tokA.size < 8 || tokB.size < 8) return 0;
  let intersection = 0;
  for (const w of tokA) {
    if (tokB.has(w)) intersection += 1;
  }
  const union = tokA.size + tokB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const verificationRank = (offer: NormalizedScrapedOffer): number => {
  if (offer.verificationLevel === 'verified') return 4;
  if (offer.verificationLevel === 'collected') return 3;
  if (offer.collectionMode === 'collected') return 2;
  return 1;
};

const mergeOffers = (
  a: NormalizedScrapedOffer,
  b: NormalizedScrapedOffer
): NormalizedScrapedOffer => {
  const [primary, secondary] = verificationRank(b) > verificationRank(a) ? [b, a] : [a, b];

  const mergedSkills = Array.from(new Set([...primary.requirements, ...secondary.requirements]));
  const mergedLanguages = Array.from(new Set([...primary.languages, ...secondary.languages]));
  const mergedSources = Array.from(new Set([...primary.sources, ...secondary.sources]));
  const mergedAltUrls = Array.from(
    new Set(
      [primary.sourceUrl, secondary.sourceUrl, ...primary.alternateUrls, ...secondary.alternateUrls]
        .filter((u) => Boolean(u) && u !== primary.sourceUrl)
    )
  );

  return {
    ...primary,
    externalId: primary.externalId ?? secondary.externalId,
    description:
      secondary.collectionMode === 'collected' &&
      secondary.description.length > primary.description.length
        ? secondary.description
        : primary.description,
    location: primary.location === 'Unspecified' ? secondary.location : primary.location,
    duration: primary.duration ?? secondary.duration,
    durationMonths: primary.durationMonths ?? secondary.durationMonths,
    startDate: primary.startDate ?? secondary.startDate,
    endDate: primary.endDate ?? secondary.endDate,
    postedDate: primary.postedDate ?? secondary.postedDate,
    educationLevel: primary.educationLevel ?? secondary.educationLevel,
    experienceLevel: primary.experienceLevel ?? secondary.experienceLevel,
    applicationUrl: primary.applicationUrl ?? secondary.applicationUrl,
    applicationFormUrl: primary.applicationFormUrl ?? secondary.applicationFormUrl,
    applicationEmail: primary.applicationEmail ?? secondary.applicationEmail,
    contactName: primary.contactName ?? secondary.contactName,
    requirements: mergedSkills,
    languages: mergedLanguages,
    sources: mergedSources,
    alternateUrls: mergedAltUrls,
  };
};

export const deduplicateScrapedOffers = (
  offers: readonly NormalizedScrapedOffer[]
): readonly NormalizedScrapedOffer[] => {
  const byUrl = new Map<string, number>();
  const byExternalId = new Map<string, number>();
  const byIdentity = new Map<string, number>();
  const byOrgTitle = new Map<string, number>();
  const result: NormalizedScrapedOffer[] = [];

  for (const offer of offers) {
    const canonUrl = canonicalizeOfferUrl(offer.sourceUrl);
    const identityKey = buildIdentityKey(offer);
    const orgTitleKey = buildOrgTitleKey(offer);
    const extIdKey = offer.externalId ? `${offer.source}::${offer.externalId}` : null;

    let existingIdx =
      byUrl.get(canonUrl) ??
      (extIdKey ? byExternalId.get(extIdKey) : undefined) ??
      byIdentity.get(identityKey);

    // Match across jobboard vs company career page when org+title match even if one has Unspecified location
    if (existingIdx === undefined) {
      const candidateIdx = byOrgTitle.get(orgTitleKey);
      if (candidateIdx !== undefined) {
        const candidate = result[candidateIdx];
        if (
          offer.location === 'Unspecified' ||
          candidate.location === 'Unspecified' ||
          (offer.collectionMode === 'collected' &&
            candidate.collectionMode === 'collected' &&
            computeDescriptionJaccard(offer.description, candidate.description) >= 0.65)
        ) {
          existingIdx = candidateIdx;
        }
      }
    }

    // Content similarity check when both offers are legally collected from same org
    if (existingIdx === undefined && offer.collectionMode === 'collected') {
      const idx = result.findIndex(
        (existing) =>
          existing.collectionMode === 'collected' &&
          existing.organization.toLowerCase() === offer.organization.toLowerCase() &&
          computeDescriptionJaccard(existing.description, offer.description) >= 0.72
      );
      if (idx !== -1) {
        existingIdx = idx;
      }
    }

    if (existingIdx !== undefined) {
      result[existingIdx] = mergeOffers(result[existingIdx], offer);
      byUrl.set(canonUrl, existingIdx);
      if (extIdKey) byExternalId.set(extIdKey, existingIdx);
      byIdentity.set(identityKey, existingIdx);
      byOrgTitle.set(orgTitleKey, existingIdx);
    } else {
      const idx = result.length;
      result.push(offer);
      byUrl.set(canonUrl, idx);
      if (extIdKey) byExternalId.set(extIdKey, idx);
      byIdentity.set(identityKey, idx);
      byOrgTitle.set(orgTitleKey, idx);
    }
  }

  return result;
};
