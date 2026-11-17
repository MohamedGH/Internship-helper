import {
  ApplicationChannel,
  ApplicationStatus,
  ChannelType,
  CustomSource,
  FilterState,
  InternshipOffer,
  SearchQuery,
  SourceProvider,
  WorkMode,
} from '../types/domain';
import { normalizeChannelsFromRaw } from './channelFinder';

export const ALL_SOURCES: readonly string[] = [
  SourceProvider.CompanyCareer,
  SourceProvider.FranceTravail,
  SourceProvider.Meteojob,
  SourceProvider.Apec,
  SourceProvider.WelcomeToTheJungle,
  SourceProvider.HelloWork,
  SourceProvider.Remotive,
  SourceProvider.WeWorkRemotely,
  SourceProvider.LinkedIn,
  SourceProvider.Indeed,
  SourceProvider.JobTeaser,
];

export const DEFAULT_SEARCH_QUERY: SearchQuery = {
  keywords: 'Software Data AI Stage',
  location: 'Paris / Remote',
  duration: '',
  minDurationMonths: 1,
  maxDurationMonths: 6,
  startDateFrom: '',
  startDateTo: '',
  workMode: 'all',
  educationLevel: '',
  languages: [],
  experienceLevel: '',
  includeExternalDiscovery: true,
  sources: ALL_SOURCES.slice(0, 8),
};

export const mapRawSourceName = (
  raw: string | undefined,
  customSources?: readonly CustomSource[]
): string => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return SourceProvider.CompanyCareer;

  if (customSources && customSources.length > 0) {
    const rawLower = trimmed.toLowerCase();
    const matchedCustom = customSources.find((cs) => {
      const csLower = cs.name.toLowerCase().trim();
      if (csLower === rawLower || rawLower.includes(csLower) || csLower.includes(rawLower)) {
        return true;
      }
      const words = csLower.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && w !== 'jobs');
      return words.length > 0 && words.some((word) => rawLower.includes(word));
    });
    if (matchedCustom) {
      return matchedCustom.name;
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('welcome') || lower.includes('wttj')) {
    return SourceProvider.WelcomeToTheJungle;
  }
  if (lower.includes('meteojob')) return SourceProvider.Meteojob;
  if (lower.includes('apec')) return SourceProvider.Apec;
  if (lower.includes('france travail') || lower.includes('pole-emploi')) return SourceProvider.FranceTravail;
  if (lower.includes('remotive')) return SourceProvider.Remotive;
  if (lower.includes('we work remotely') || lower.includes('weworkremotely')) return SourceProvider.WeWorkRemotely;
  if (lower.includes('linkedin')) return SourceProvider.LinkedIn;
  if (lower.includes('indeed')) return SourceProvider.Indeed;
  if (lower.includes('hellowork') || lower.includes('regionsjob')) return SourceProvider.HelloWork;
  if (lower.includes('jobteaser')) return SourceProvider.JobTeaser;
  if (lower.includes('career') || lower.includes('entreprise')) return SourceProvider.CompanyCareer;

  return trimmed;
};

export const mapRawWorkMode = (raw: string | undefined): WorkMode => {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('remote') || lower.includes('télétravail') || lower.includes('full remote')) {
    return WorkMode.Remote;
  }
  if (lower.includes('hybrid') || lower.includes('hybride')) {
    return WorkMode.Hybrid;
  }
  return WorkMode.OnSite;
};

export const parseDurationMonths = (durationStr?: string | null): number | null => {
  if (!durationStr) return null;
  const lower = durationStr.toLowerCase().trim();
  if (!lower) return null;

  const rangeMatch = lower.match(/(\d+)\s*(?:à|-|to)\s*(\d+)\s*(?:mois|months?|m\b)/);
  if (rangeMatch && rangeMatch[2]) {
    return parseInt(rangeMatch[2], 10);
  }
  const weekMatch = lower.match(/(\d+)\s*(?:semaines?|weeks?)/);
  if (weekMatch && weekMatch[1]) {
    const val = parseInt(weekMatch[1], 10);
    return Math.max(1, Math.round(val / 4.3));
  }
  const singleMatch = lower.match(/(\d+)\s*(?:mois|months?|m\b)/);
  if (singleMatch && singleMatch[1]) {
    return parseInt(singleMatch[1], 10);
  }
  return null;
};

export const isOfferWithinDuration = (
  durationMonths: number | null | undefined,
  minMonths: number,
  maxMonths: number,
  allowUnspecified = true
): boolean => {
  if (durationMonths === null || durationMonths === undefined) {
    return (minMonths <= 0 && maxMonths <= 0) || allowUnspecified;
  }
  if (minMonths > 0 && durationMonths < minMonths) {
    return false;
  }
  if (maxMonths > 0 && durationMonths > maxMonths) {
    return false;
  }
  return true;
};

export const isOfferWithinDateRange = (
  offerStartDate: string | null | undefined,
  dateFrom: string,
  dateTo: string,
  allowUnspecified = true
): boolean => {
  if (!dateFrom && !dateTo) return true;
  if (!offerStartDate) return allowUnspecified;

  const offerStart = offerStartDate.trim().slice(0, 10);
  if (dateFrom && offerStart < dateFrom.slice(0, 10)) {
    return false;
  }
  if (dateTo && offerStart > dateTo.slice(0, 10)) {
    return false;
  }
  return true;
};

export interface RawOfferInput {
  readonly id?: string;
  readonly externalId?: string | null;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary?: string | null;
  readonly location?: string | null;
  readonly workMode?: string | null;
  readonly contractType?: string | null;
  readonly duration?: string | null;
  readonly durationMonths?: number | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly source?: string;
  readonly sources?: readonly string[];
  readonly sourceUrl?: string;
  readonly alternateUrls?: readonly string[];
  readonly applicationUrl?: string | null;
  readonly postedDate?: string | null;
  readonly collectedAt?: string;
  readonly discoveredAt?: string;
  readonly collectionMode?: InternshipOffer['collectionMode'];
  readonly contentAccessible?: boolean;
  readonly accessMode?: InternshipOffer['accessMode'];
  readonly verificationStatus?: InternshipOffer['verificationStatus'];
  readonly verificationLevel?: InternshipOffer['verificationLevel'];
  readonly educationLevel?: string | null;
  readonly experienceLevel?: string | null;
  readonly languages?: readonly string[];
  readonly matchScore?: number;
  readonly description?: string;
  readonly requirements?: readonly string[];
  readonly applicationEmail?: string | null;
  readonly applicationFormUrl?: string | null;
  readonly contactName?: string | null;
}

export const normalizeOffer = (
  raw: RawOfferInput,
  index: number,
  customSources?: readonly CustomSource[]
): InternshipOffer => {
  const slug = `${raw.organization}_${raw.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 42);
  const id = raw.id?.trim() || `offer_${slug}_${index}`;
  const sourceUrl = raw.sourceUrl?.trim() || '';

  const isExternalUnverified =
    raw.verificationLevel === 'externally_unverified' ||
    raw.verificationStatus === 'externally_unverified' ||
    raw.collectionMode === 'discovered' ||
    raw.contentAccessible === false;

  const contentAccessible = raw.contentAccessible ?? !isExternalUnverified;

  const rawChannels: Array<Partial<ApplicationChannel>> = [];

  if (!isExternalUnverified && raw.applicationEmail && raw.applicationEmail.trim().includes('@')) {
    rawChannels.push({
      type: ChannelType.Email,
      target: raw.applicationEmail.trim(),
      label: raw.contactName ? `${raw.contactName} (Email)` : 'Published Recruiting Email',
      contactName: raw.contactName ?? undefined,
      verified: true,
      verificationStatus: 'verified_published',
      sourceUrl,
      discoveredAt: raw.collectedAt ?? raw.discoveredAt,
    });
  }

  const resolvedFormUrl = isExternalUnverified
    ? ''
    : raw.applicationFormUrl?.trim() || raw.applicationUrl?.trim() || '';
  if (resolvedFormUrl.startsWith('http')) {
    const isAts =
      raw.verificationStatus === 'verified_ats_api' ||
      resolvedFormUrl.includes('greenhouse.io') ||
      resolvedFormUrl.includes('lever.co') ||
      resolvedFormUrl.includes('ashbyhq.com') ||
      resolvedFormUrl.includes('welcomekit.co') ||
      resolvedFormUrl.includes('workday') ||
      resolvedFormUrl.includes('teamtailor.com') ||
      resolvedFormUrl.includes('taleez.com') ||
      resolvedFormUrl.includes('smartrecruiters.com');
    rawChannels.push({
      type: ChannelType.Form,
      target: resolvedFormUrl,
      label: isAts ? 'Official ATS Application Form' : 'Official Application Form',
      channelRole: 'direct_form',
      verified: true,
      verificationStatus: isAts ? 'verified_ats_form' : 'verified_published',
      relevance: 'high',
      sourceUrl,
      discoveredAt: raw.collectedAt ?? raw.discoveredAt,
    });
  }

  const channels = isExternalUnverified
    ? []
    : normalizeChannelsFromRaw(id, rawChannels, sourceUrl, raw.collectedAt ?? raw.discoveredAt);
  const durationMonths =
    typeof raw.durationMonths === 'number' && raw.durationMonths > 0
      ? raw.durationMonths
      : parseDurationMonths(raw.duration);

  const primarySource = mapRawSourceName(raw.source, customSources);
  const sources =
    raw.sources && raw.sources.length > 0
      ? raw.sources.map((s) => mapRawSourceName(s, customSources))
      : [primarySource];

  return {
    id,
    externalId: raw.externalId ?? null,
    title: raw.title.trim(),
    organization: raw.organization.trim(),
    organizationSummary: raw.organizationSummary?.trim() || null,
    location: raw.location?.trim() || 'Unspecified',
    workMode: mapRawWorkMode(raw.workMode ?? undefined),
    contractType: raw.contractType?.trim() || null,
    duration: raw.duration?.trim() || (durationMonths ? `${durationMonths} months` : null),
    durationMonths,
    startDate: raw.startDate?.trim() || null,
    endDate: raw.endDate?.trim() || null,
    source: primarySource,
    sources: Array.from(new Set(sources)),
    sourceUrl,
    alternateUrls: raw.alternateUrls ?? [],
    applicationUrl: resolvedFormUrl || null,
    postedDate: raw.postedDate?.trim() || null,
    collectedAt: raw.collectedAt,
    discoveredAt: raw.discoveredAt ?? raw.collectedAt,
    collectionMode: raw.collectionMode ?? (isExternalUnverified ? 'discovered' : 'collected'),
    contentAccessible,
    accessMode: raw.accessMode,
    verificationStatus: raw.verificationStatus,
    verificationLevel:
      raw.verificationLevel ?? (isExternalUnverified ? 'externally_unverified' : undefined),
    educationLevel: raw.educationLevel ?? null,
    experienceLevel: raw.experienceLevel ?? null,
    languages: raw.languages ?? [],
    matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : undefined,
    description: raw.description?.trim() || '',
    requirements: (raw.requirements ?? []).map((item) => item.trim()).filter(Boolean),
    channels,
    status: ApplicationStatus.Discovered,
  };
};

export const deduplicateOffers = (
  incoming: readonly InternshipOffer[],
  existing: readonly InternshipOffer[]
): readonly InternshipOffer[] => {
  const indexByKey = new Map<string, number>();
  const result: InternshipOffer[] = [];

  const registerKey = (offer: InternshipOffer) =>
    `${offer.organization.toLowerCase().trim()}::${offer.title.toLowerCase().trim()}`;

  // Preserve existing prepared/sent offers first
  for (const offer of existing) {
    const key = registerKey(offer);
    if (!indexByKey.has(key)) {
      indexByKey.set(key, result.length);
      result.push(offer);
    }
  }

  // Prepend new incoming offers at the top when unique; merge alternate sources if matched
  const newUnique: InternshipOffer[] = [];
  for (const offer of incoming) {
    const key = registerKey(offer);
    const existingIdx = indexByKey.get(key);
    if (existingIdx !== undefined) {
      const target = result[existingIdx];
      const mergedSources = Array.from(
        new Set([...(target.sources ?? [target.source]), ...(offer.sources ?? [offer.source])])
      );
      result[existingIdx] = {
        ...target,
        sources: mergedSources,
      };
    } else {
      indexByKey.set(key, existing.length + newUnique.length);
      newUnique.push(offer);
    }
  }

  return [...newUnique, ...result];
};

export const filterOffers = (
  offers: readonly InternshipOffer[],
  filters: FilterState
): readonly InternshipOffer[] => {
  const query = filters.textFilter.trim().toLowerCase();

  return offers.filter((offer) => {
    if (
      filters.sourceFilter !== 'all' &&
      offer.source !== filters.sourceFilter &&
      !(offer.sources ?? []).includes(filters.sourceFilter)
    ) {
      return false;
    }

    if (
      filters.channelFilter !== 'all' &&
      !offer.channels.some((ch) => ch.type === filters.channelFilter)
    ) {
      return false;
    }

    if (filters.verificationFilter && filters.verificationFilter !== 'all') {
      const mode = offer.collectionMode ?? 'collected';
      const level = offer.verificationLevel ?? 'collected';
      if (filters.verificationFilter === 'collected' && mode !== 'collected') return false;
      if (filters.verificationFilter === 'discovered' && mode !== 'discovered') return false;
      if (
        filters.verificationFilter === 'verified' &&
        level !== 'verified' &&
        offer.verificationStatus !== 'verified_ats_api' &&
        offer.verificationStatus !== 'verified_offer'
      ) {
        return false;
      }
      if (
        filters.verificationFilter === 'externally_unverified' &&
        level !== 'externally_unverified' &&
        offer.verificationStatus !== 'externally_unverified' &&
        offer.verificationStatus !== 'unverified_url'
      ) {
        return false;
      }
    }

    if (
      !isOfferWithinDuration(
        offer.durationMonths,
        filters.minDurationFilter,
        filters.maxDurationFilter
      )
    ) {
      return false;
    }

    if (!isOfferWithinDateRange(offer.startDate, filters.dateRangeFrom, filters.dateRangeTo)) {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        offer.title,
        offer.organization,
        offer.location,
        offer.description,
        offer.requirements.join(' '),
        (offer.sources ?? [offer.source]).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
};

export const validateSearchQuery = (
  query: SearchQuery
): { readonly valid: boolean; readonly message?: string } => {
  if (query.keywords.trim().length < 2) {
    return {
      valid: false,
      message: 'Please enter at least 2 characters for the internship role or domain.',
    };
  }
  if (query.sources.length === 0) {
    return {
      valid: false,
      message: 'Select at least one internship source to search.',
    };
  }
  if (
    query.minDurationMonths > 0 &&
    query.maxDurationMonths > 0 &&
    query.minDurationMonths > query.maxDurationMonths
  ) {
    return {
      valid: false,
      message: 'Minimum duration cannot exceed maximum duration.',
    };
  }
  if (query.startDateFrom && query.startDateTo && query.startDateFrom > query.startDateTo) {
    return {
      valid: false,
      message: 'Start date range "From" cannot be after "To".',
    };
  }
  return { valid: true };
};
