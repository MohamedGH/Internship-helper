import {
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
  SourceProvider.WelcomeToTheJungle,
  SourceProvider.LinkedIn,
  SourceProvider.Indeed,
  SourceProvider.HelloWork,
  SourceProvider.JobTeaser,
  SourceProvider.CompanyCareer,
];

export const DEFAULT_SEARCH_QUERY: SearchQuery = {
  keywords: 'Full-Stack Software Engineer Stage',
  location: 'Paris / Remote',
  duration: '6 months',
  minDurationMonths: 3,
  maxDurationMonths: 6,
  startDateFrom: '2027-02-01',
  startDateTo: '2027-09-01',
  workMode: 'all',
  sources: ALL_SOURCES,
};

export const DEFAULT_SEED_OFFERS: readonly InternshipOffer[] = [
  {
    id: 'offer_alan_fullstack_2026',
    title: 'Software Engineer Intern (Stage PFE - Full-Stack)',
    organization: 'Alan',
    organizationSummary:
      'European digital health insurance platform building seamless healthcare experiences with React, TypeScript, and Python.',
    location: 'Paris, France',
    workMode: WorkMode.Hybrid,
    duration: '6 months',
    durationMonths: 6,
    startDate: '2027-02-01',
    endDate: '2027-07-31',
    source: SourceProvider.WelcomeToTheJungle,
    sourceUrl: 'https://www.welcometothejungle.com/fr/companies/alan/jobs',
    postedDate: '2026-11-14',
    description:
      'Join the Member Experience squad to design and ship customer-facing React & TypeScript features, improve API latency, and participate in weekly product discovery.',
    requirements: ['React', 'TypeScript', 'Python', 'REST APIs', 'Automated Testing'],
    channels: [
      {
        id: 'ch_alan_form',
        type: ChannelType.Form,
        target: 'https://jobs.lever.co/alan',
        label: 'Lever Application Form',
        verified: true,
        sourceUrl: 'https://www.welcometothejungle.com/fr/companies/alan/jobs',
      },
      {
        id: 'ch_alan_email',
        type: ChannelType.Email,
        target: 'internships@alan.com',
        label: 'University Recruiting Inbox',
        contactName: 'Campus Recruiting Team',
        verified: true,
        sourceUrl: 'https://alan.com/careers',
      },
    ],
    status: ApplicationStatus.Ready,
  },
  {
    id: 'offer_mistral_frontend_2026',
    title: 'Frontend & AI Tooling Intern (Stage 6 mois)',
    organization: 'Mistral AI',
    organizationSummary:
      'Frontier AI lab based in Paris building open and enterprise language models and developer studio interfaces.',
    location: 'Paris, France',
    workMode: WorkMode.OnSite,
    duration: '6 mois',
    durationMonths: 6,
    startDate: '2027-03-01',
    endDate: '2027-08-31',
    source: SourceProvider.CompanyCareer,
    sourceUrl: 'https://mistral.ai/careers',
    postedDate: '2026-11-15',
    description:
      'Build high-throughput streaming interfaces, interactive prompt evaluation views, and responsive developer dashboards with TypeScript and Tailwind CSS.',
    requirements: ['TypeScript', 'React', 'Node.js', 'Tailwind CSS', 'Streaming UI'],
    channels: [
      {
        id: 'ch_mistral_form',
        type: ChannelType.Form,
        target: 'https://jobs.lever.co/mistral',
        label: 'Lever Application Form',
        verified: true,
        sourceUrl: 'https://mistral.ai/careers',
      },
    ],
    status: ApplicationStatus.Discovered,
  },
  {
    id: 'offer_qonto_product_eng_2026',
    title: 'Product Engineering Intern — Finance Core',
    organization: 'Qonto',
    organizationSummary:
      'Leading European business finance solution empowering 500,000+ SMEs and freelancers with fast banking and invoicing workflows.',
    location: 'Paris / Remote FR',
    workMode: WorkMode.Hybrid,
    duration: '6 months',
    durationMonths: 6,
    startDate: '2027-02-15',
    endDate: '2027-08-15',
    source: SourceProvider.LinkedIn,
    sourceUrl: 'https://www.linkedin.com/jobs/',
    postedDate: '2026-11-12',
    description:
      'Collaborate with product managers and senior engineers to deliver reliable payment workflows, strict TypeScript state modules, and end-to-end integration tests.',
    requirements: ['TypeScript', 'React', 'PostgreSQL', 'Git', 'Testing'],
    channels: [
      {
        id: 'ch_qonto_email',
        type: ChannelType.Email,
        target: 'stages-tech@qonto.com',
        label: 'Tech Campus Team',
        contactName: 'Claire Moreau — Tech Talent',
        verified: true,
        sourceUrl: 'https://qonto.com/en/careers',
      },
      {
        id: 'ch_qonto_form',
        type: ChannelType.Form,
        target: 'https://jobs.lever.co/qonto',
        label: 'Lever Application Form',
        verified: true,
      },
    ],
    status: ApplicationStatus.Discovered,
  },
  {
    id: 'offer_doctolib_data_web_2026',
    title: 'Stage Développeur Web & Plateforme Patient',
    organization: 'Doctolib',
    organizationSummary:
      'Healthcare technology company transforming patient scheduling and practitioner workflows across France, Germany, and Italy.',
    location: 'Levallois-Perret, France',
    workMode: WorkMode.Hybrid,
    duration: '6 mois',
    durationMonths: 6,
    startDate: '2027-04-01',
    endDate: '2027-09-30',
    source: SourceProvider.HelloWork,
    sourceUrl: 'https://www.hellowork.com/',
    postedDate: '2026-11-11',
    description:
      'Develop accessible React components, optimize mobile-first booking journeys, and monitor quality metrics in agile sprint teams.',
    requirements: ['React', 'JavaScript', 'Accessibility', 'Node.js', 'Mobile-first UI'],
    channels: [
      {
        id: 'ch_doctolib_form',
        type: ChannelType.Form,
        target: 'https://about.doctolib.fr/carrieres/',
        label: 'Doctolib Career Portal',
        verified: true,
      },
    ],
    status: ApplicationStatus.Discovered,
  },
  {
    id: 'offer_datadog_observability_2026',
    title: 'Software Engineering Intern — Frontend Telemetry',
    organization: 'Datadog',
    organizationSummary:
      'Cloud-scale monitoring and security platform with a major R&D engineering hub in Paris.',
    location: 'Paris, France',
    workMode: WorkMode.OnSite,
    duration: '4 months',
    durationMonths: 4,
    startDate: '2027-05-01',
    endDate: '2027-08-31',
    source: SourceProvider.Indeed,
    sourceUrl: 'https://fr.indeed.com/',
    postedDate: '2026-11-10',
    description:
      'Build real-time visualization widgets, state management modules, and low-latency query builders for engineering teams.',
    requirements: ['TypeScript', 'React', 'Data Visualization', 'Performance'],
    channels: [
      {
        id: 'ch_datadog_form',
        type: ChannelType.Form,
        target: 'https://careers.datadoghq.com/students/',
        label: 'Greenhouse Application Form',
        verified: true,
      },
      {
        id: 'ch_datadog_email',
        type: ChannelType.Email,
        target: 'paris-internships@datadoghq.com',
        label: 'Paris R&D Recruiting',
        verified: true,
      },
    ],
    status: ApplicationStatus.Discovered,
  },
  {
    id: 'offer_backmarket_stage_2026',
    title: 'Stage Ingénieur Full-Stack — Marketplace',
    organization: 'Back Market',
    organizationSummary:
      'Global marketplace for refurbished tech dedicated to extending device lifespans with clean engineering.',
    location: 'Paris / Bordeaux',
    workMode: WorkMode.Remote,
    duration: '3 months',
    durationMonths: 3,
    startDate: '2027-06-01',
    endDate: '2027-08-31',
    source: SourceProvider.JobTeaser,
    sourceUrl: 'https://www.jobteaser.com/',
    postedDate: '2026-11-09',
    description:
      'Ship high-conversion merchant onboarding tools, API integrations, and automated quality suites.',
    requirements: ['React', 'TypeScript', 'Python', 'REST APIs'],
    channels: [
      {
        id: 'ch_bm_email',
        type: ChannelType.Email,
        target: 'campus@backmarket.com',
        label: 'Campus & Stage Inbox',
        verified: true,
      },
    ],
    status: ApplicationStatus.Discovered,
  },
];

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
  readonly sourceUrl?: string;
  readonly applicationUrl?: string | null;
  readonly postedDate?: string | null;
  readonly collectedAt?: string;
  readonly verificationStatus?: InternshipOffer['verificationStatus'];
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

  const rawChannels: Array<{
    type: ChannelType;
    target: string;
    label: string;
    contactName?: string;
  }> = [];

  if (raw.applicationEmail && raw.applicationEmail.trim().includes('@')) {
    rawChannels.push({
      type: ChannelType.Email,
      target: raw.applicationEmail.trim(),
      label: raw.contactName ? `${raw.contactName} (Email)` : 'Direct Recruiting Email',
      contactName: raw.contactName ?? undefined,
    });
  }

  const resolvedFormUrl = raw.applicationFormUrl?.trim() || raw.applicationUrl?.trim() || '';
  if (resolvedFormUrl.startsWith('http')) {
    rawChannels.push({
      type: ChannelType.Form,
      target: resolvedFormUrl,
      label: 'Official Application Form',
    });
  }

  const channels = normalizeChannelsFromRaw(id, rawChannels, sourceUrl);
  const durationMonths =
    typeof raw.durationMonths === 'number' && raw.durationMonths > 0
      ? raw.durationMonths
      : parseDurationMonths(raw.duration);

  return {
    id,
    title: raw.title.trim(),
    organization: raw.organization.trim(),
    organizationSummary:
      raw.organizationSummary?.trim() || `${raw.organization.trim()} engineering and product team.`,
    location: raw.location?.trim() || 'Unspecified',
    workMode: mapRawWorkMode(raw.workMode ?? undefined),
    contractType: raw.contractType?.trim() || null,
    duration: raw.duration?.trim() || (durationMonths ? `${durationMonths} months` : null),
    durationMonths,
    startDate: raw.startDate?.trim() || null,
    endDate: raw.endDate?.trim() || null,
    source: mapRawSourceName(raw.source, customSources),
    sourceUrl,
    applicationUrl: resolvedFormUrl || null,
    postedDate: raw.postedDate?.trim() || null,
    collectedAt: raw.collectedAt,
    verificationStatus: raw.verificationStatus,
    matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : undefined,
    description:
      raw.description?.trim() ||
      `Internship / stage opportunity as ${raw.title.trim()} at ${raw.organization.trim()}.`,
    requirements: (raw.requirements ?? []).map((item) => item.trim()).filter(Boolean),
    channels,
    status: ApplicationStatus.Discovered,
  };
};

export const deduplicateOffers = (
  incoming: readonly InternshipOffer[],
  existing: readonly InternshipOffer[]
): readonly InternshipOffer[] => {
  const seenKeys = new Set<string>();
  const result: InternshipOffer[] = [];

  const registerKey = (offer: InternshipOffer) =>
    `${offer.organization.toLowerCase().trim()}::${offer.title.toLowerCase().trim()}`;

  // Preserve existing prepared/sent offers first
  for (const offer of existing) {
    const key = registerKey(offer);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(offer);
    }
  }

  // Prepend new incoming offers at the top when unique
  const newUnique: InternshipOffer[] = [];
  for (const offer of incoming) {
    const key = registerKey(offer);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
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
    if (filters.sourceFilter !== 'all' && offer.source !== filters.sourceFilter) {
      return false;
    }

    if (
      filters.channelFilter !== 'all' &&
      !offer.channels.some((ch) => ch.type === filters.channelFilter)
    ) {
      return false;
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
