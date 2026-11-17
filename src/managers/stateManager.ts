import {
  ApplicationChannel,
  ApplicationStatus,
  AppError,
  AppState,
  CandidateProfile,
  CustomSource,
  FilterState,
  InternshipOffer,
  PreparedDossier,
  SearchQuery,
} from '../types/domain';
import { errorReducer } from './errorManager';
import {
  DEFAULT_SEARCH_QUERY,
  DEFAULT_SEED_OFFERS,
  deduplicateOffers,
  filterOffers,
} from '../modules/sourceAggregator';
import {
  DEFAULT_BUILTIN_SOURCES,
  addCustomSource,
  removeCustomSource,
  toggleCustomSource,
  updateCustomSource,
} from '../modules/customSources';
import { buildPreparedDossier } from '../modules/dossierComposer';

export const DEFAULT_AVATAR_PATH = '/src/assets/images/avatar_candidate_profile_1794841530446.jpg';

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = {
  id: 'cand_default',
  fullName: 'Lucas Bernard',
  email: 'lucas.bernard@polytech-etu.fr',
  phone: '+33 6 45 78 90 12',
  location: 'Paris, France',
  school: 'CentraleSupélec / Université Paris-Saclay',
  degree: 'MSc Software Engineering & AI Systems',
  graduationYear: '2027',
  targetRole: 'Full-Stack / Frontend Engineering Intern (Stage PFE)',
  availability: 'February 2027 — 6 months',
  portfolioUrl: 'https://lucasbernard.dev',
  linkedinUrl: 'https://linkedin.com/in/lucas-bernard-eng',
  skills: [
    'TypeScript',
    'React',
    'Node.js',
    'Python',
    'Tailwind CSS',
    'PostgreSQL',
    'REST APIs',
    'Automated Testing',
  ],
  experiences: [
    'Built a real-time analytics web app in React, TypeScript, and Express (4,000+ monthly active student users)',
    'Software Engineering Intern at Capgemini Invent — implemented REST microservices and unit test suites in Python & Node.js',
  ],
  rawCvText: `Lucas Bernard — MSc Software Engineering (CentraleSupélec, 2027)
Looking for a 6-month end-of-studies internship (Stage PFE) starting February 2027 in Paris or Remote.
Technical Skills: TypeScript, React, Node.js, Python, Tailwind CSS, PostgreSQL, REST APIs, Automated Testing.
Experience:
- Software Engineering Intern, Capgemini Invent (4 months): Built REST APIs and automated integration tests.
- Student Lead Developer, Campus Hub: Shipped responsive React + TypeScript portal for 4,000+ students.`,
  avatarUrl: DEFAULT_AVATAR_PATH,
};

export type AppAction =
  | { readonly type: 'SET_PROFILE'; readonly profile: CandidateProfile }
  | { readonly type: 'SET_SEARCH_QUERY'; readonly query: Partial<SearchQuery> }
  | { readonly type: 'SET_FILTERS'; readonly filters: Partial<FilterState> }
  | { readonly type: 'SEARCH_STARTED' }
  | {
      readonly type: 'SEARCH_SUCCEEDED';
      readonly offers: readonly InternshipOffer[];
      readonly groundingUrls: readonly { readonly title: string; readonly url: string }[];
    }
  | { readonly type: 'SEARCH_FAILED'; readonly error: AppError }
  | { readonly type: 'PREPARE_STARTED'; readonly offerId: string }
  | {
      readonly type: 'PREPARE_SUCCEEDED';
      readonly offerId: string;
      readonly dossier: PreparedDossier;
    }
  | { readonly type: 'PREPARE_FAILED'; readonly error: AppError }
  | { readonly type: 'UPDATE_DOSSIER'; readonly offerId: string; readonly patch: Partial<PreparedDossier> }
  | { readonly type: 'DISCOVER_CHANNELS_STARTED'; readonly offerId: string }
  | {
      readonly type: 'DISCOVER_CHANNELS_SUCCEEDED';
      readonly offerId: string;
      readonly channels: readonly ApplicationChannel[];
    }
  | { readonly type: 'DISCOVER_CHANNELS_FAILED'; readonly error: AppError }
  | {
      readonly type: 'ADD_CUSTOM_CHANNEL';
      readonly offerId: string;
      readonly channel: ApplicationChannel;
    }
  | {
      readonly type: 'MARK_SENT';
      readonly offerId: string;
      readonly channelId: string;
      readonly sentAt: string;
      readonly notice: string;
    }
  | { readonly type: 'SET_OFFER_STATUS'; readonly offerId: string; readonly status: ApplicationStatus }
  | { readonly type: 'RESET_FILTERS' }
  | { readonly type: 'ADD_CUSTOM_SOURCE'; readonly source: CustomSource }
  | { readonly type: 'REMOVE_CUSTOM_SOURCE'; readonly sourceId: string }
  | { readonly type: 'TOGGLE_CUSTOM_SOURCE'; readonly sourceId: string }
  | { readonly type: 'UPDATE_CUSTOM_SOURCE'; readonly sourceId: string; readonly patch: Partial<CustomSource> }
  | { readonly type: 'ADD_ERROR'; readonly error: AppError }
  | { readonly type: 'DISMISS_ERROR'; readonly id: string }
  | { readonly type: 'CLEAR_NOTICE' };

export const createInitialState = (
  seedProfile: CandidateProfile = DEFAULT_CANDIDATE_PROFILE,
  seedOffers: readonly InternshipOffer[] = DEFAULT_SEED_OFFERS,
  seedCustomSources: readonly CustomSource[] = DEFAULT_BUILTIN_SOURCES
): AppState => {
  const firstReadyOffer = seedOffers[0];
  const initialDossiers: Record<string, PreparedDossier> = firstReadyOffer
    ? { [firstReadyOffer.id]: buildPreparedDossier(firstReadyOffer, seedProfile, 'fr', 'professional') }
    : {};

  return {
    profile: seedProfile,
    searchQuery: {
      ...DEFAULT_SEARCH_QUERY,
      sources: seedCustomSources.filter((s) => s.enabled).map((s) => s.name),
    },
    filters: {
      sourceFilter: 'all',
      channelFilter: 'all',
      textFilter: '',
      minDurationFilter: 0,
      maxDurationFilter: 0,
      dateRangeFrom: '',
      dateRangeTo: '',
    },
    customSources: seedCustomSources,
    offers: seedOffers,
    dossiers: initialDossiers,
    isSearching: false,
    isPreparingOfferId: null,
    isDiscoveringChannelsId: null,
    lastSearchGroundingUrls: [],
    errors: [],
    lastDispatchNotice: null,
  };
};

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_PROFILE':
      return {
        ...state,
        profile: action.profile,
      };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: {
          ...state.searchQuery,
          ...action.query,
        },
      };

    case 'SET_FILTERS':
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.filters,
        },
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: {
          sourceFilter: 'all',
          channelFilter: 'all',
          textFilter: '',
          minDurationFilter: 0,
          maxDurationFilter: 0,
          dateRangeFrom: '',
          dateRangeTo: '',
        },
      };

    case 'ADD_CUSTOM_SOURCE': {
      const nextCustomSources = addCustomSource(state.customSources, action.source);
      const nextSearchSources = state.searchQuery.sources.includes(action.source.name)
        ? state.searchQuery.sources
        : [...state.searchQuery.sources, action.source.name];

      return {
        ...state,
        customSources: nextCustomSources,
        searchQuery: {
          ...state.searchQuery,
          sources: nextSearchSources,
        },
      };
    }

    case 'REMOVE_CUSTOM_SOURCE': {
      const target = state.customSources.find((s) => s.id === action.sourceId);
      const nextCustomSources = removeCustomSource(state.customSources, action.sourceId);
      const nextSearchSources = target
        ? state.searchQuery.sources.filter((name) => name !== target.name)
        : state.searchQuery.sources;
      const nextSourceFilter =
        target && state.filters.sourceFilter === target.name ? 'all' : state.filters.sourceFilter;

      return {
        ...state,
        customSources: nextCustomSources,
        searchQuery: {
          ...state.searchQuery,
          sources: nextSearchSources,
        },
        filters: {
          ...state.filters,
          sourceFilter: nextSourceFilter,
        },
      };
    }

    case 'TOGGLE_CUSTOM_SOURCE': {
      const nextCustomSources = toggleCustomSource(state.customSources, action.sourceId);
      const target = nextCustomSources.find((s) => s.id === action.sourceId);
      let nextSearchSources = state.searchQuery.sources;
      if (target) {
        if (target.enabled && !nextSearchSources.includes(target.name)) {
          nextSearchSources = [...nextSearchSources, target.name];
        } else if (!target.enabled && nextSearchSources.includes(target.name)) {
          nextSearchSources = nextSearchSources.filter((name) => name !== target.name);
        }
      }

      return {
        ...state,
        customSources: nextCustomSources,
        searchQuery: {
          ...state.searchQuery,
          sources: nextSearchSources,
        },
      };
    }

    case 'UPDATE_CUSTOM_SOURCE': {
      const nextCustomSources = updateCustomSource(
        state.customSources,
        action.sourceId,
        action.patch
      );
      return {
        ...state,
        customSources: nextCustomSources,
      };
    }

    case 'SEARCH_STARTED':
      return {
        ...state,
        isSearching: true,
        lastDispatchNotice: null,
      };

    case 'SEARCH_SUCCEEDED':
      return {
        ...state,
        isSearching: false,
        offers: deduplicateOffers(action.offers, state.offers),
        lastSearchGroundingUrls: action.groundingUrls,
      };

    case 'SEARCH_FAILED':
      return {
        ...state,
        isSearching: false,
        errors: errorReducer(state.errors, { type: 'ADD_ERROR', error: action.error }),
      };

    case 'PREPARE_STARTED':
      return {
        ...state,
        isPreparingOfferId: action.offerId,
      };

    case 'PREPARE_SUCCEEDED': {
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId && offer.status === ApplicationStatus.Discovered
          ? { ...offer, status: ApplicationStatus.Ready }
          : offer
      );
      return {
        ...state,
        isPreparingOfferId: null,
        offers: updatedOffers,
        dossiers: {
          ...state.dossiers,
          [action.offerId]: action.dossier,
        },
      };
    }

    case 'PREPARE_FAILED':
      return {
        ...state,
        isPreparingOfferId: null,
        errors: errorReducer(state.errors, { type: 'ADD_ERROR', error: action.error }),
      };

    case 'UPDATE_DOSSIER': {
      const existing = state.dossiers[action.offerId];
      if (!existing) {
        return state;
      }
      const nextDossier: PreparedDossier = {
        ...existing,
        ...action.patch,
        updatedAt: new Date().toISOString(),
      };
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId && offer.status === ApplicationStatus.Discovered
          ? { ...offer, status: ApplicationStatus.Ready }
          : offer
      );
      return {
        ...state,
        offers: updatedOffers,
        dossiers: {
          ...state.dossiers,
          [action.offerId]: nextDossier,
        },
      };
    }

    case 'DISCOVER_CHANNELS_STARTED':
      return {
        ...state,
        isDiscoveringChannelsId: action.offerId,
      };

    case 'DISCOVER_CHANNELS_SUCCEEDED': {
      const updatedOffers = state.offers.map((offer) => {
        if (offer.id !== action.offerId) return offer;
        const merged = [...action.channels, ...offer.channels].filter(
          (ch, idx, arr) =>
            arr.findIndex((other) => other.target.toLowerCase() === ch.target.toLowerCase()) === idx
        );
        return { ...offer, channels: merged };
      });
      const existingDossier = state.dossiers[action.offerId];
      const nextDossiers =
        existingDossier && action.channels[0]
          ? {
              ...state.dossiers,
              [action.offerId]: {
                ...existingDossier,
                selectedChannelId: action.channels[0].id,
              },
            }
          : state.dossiers;

      return {
        ...state,
        isDiscoveringChannelsId: null,
        offers: updatedOffers,
        dossiers: nextDossiers,
      };
    }

    case 'DISCOVER_CHANNELS_FAILED':
      return {
        ...state,
        isDiscoveringChannelsId: null,
        errors: errorReducer(state.errors, { type: 'ADD_ERROR', error: action.error }),
      };

    case 'ADD_CUSTOM_CHANNEL': {
      const updatedOffers = state.offers.map((offer) => {
        if (offer.id !== action.offerId) return offer;
        const withoutDup = offer.channels.filter(
          (ch) => ch.target.toLowerCase() !== action.channel.target.toLowerCase()
        );
        return {
          ...offer,
          channels: [action.channel, ...withoutDup],
        };
      });

      const existingDossier = state.dossiers[action.offerId];
      const nextDossiers = existingDossier
        ? {
            ...state.dossiers,
            [action.offerId]: {
              ...existingDossier,
              selectedChannelId: action.channel.id,
            },
          }
        : state.dossiers;

      return {
        ...state,
        offers: updatedOffers,
        dossiers: nextDossiers,
      };
    }

    case 'MARK_SENT': {
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId
          ? {
              ...offer,
              status: ApplicationStatus.Sent,
              sentAt: action.sentAt,
              sentViaChannelId: action.channelId,
            }
          : offer
      );
      return {
        ...state,
        offers: updatedOffers,
        lastDispatchNotice: action.notice,
      };
    }

    case 'SET_OFFER_STATUS': {
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId ? { ...offer, status: action.status } : offer
      );
      return {
        ...state,
        offers: updatedOffers,
      };
    }

    case 'ADD_ERROR':
      return {
        ...state,
        errors: errorReducer(state.errors, { type: 'ADD_ERROR', error: action.error }),
      };

    case 'DISMISS_ERROR':
      return {
        ...state,
        errors: errorReducer(state.errors, { type: 'DISMISS_ERROR', id: action.id }),
      };

    case 'CLEAR_NOTICE':
      return {
        ...state,
        lastDispatchNotice: null,
      };

    default:
      return state;
  }
};

// Pure Selectors
export const selectFilteredOffers = (state: AppState): readonly InternshipOffer[] =>
  filterOffers(state.offers, state.filters);

export const selectOfferById = (state: AppState, offerId: string): InternshipOffer | undefined =>
  state.offers.find((offer) => offer.id === offerId);

export const selectDossierByOfferId = (
  state: AppState,
  offerId: string
): PreparedDossier | undefined => state.dossiers[offerId];

export const selectReadyQueue = (state: AppState): readonly InternshipOffer[] =>
  state.offers.filter(
    (offer) =>
      (offer.status === ApplicationStatus.Ready || offer.status === ApplicationStatus.Drafting) &&
      Boolean(state.dossiers[offer.id])
  );

export const selectTrackedApplications = (state: AppState): readonly InternshipOffer[] =>
  state.offers.filter(
    (offer) =>
      offer.status === ApplicationStatus.Sent ||
      offer.status === ApplicationStatus.Interview ||
      offer.status === ApplicationStatus.Ready ||
      offer.status === ApplicationStatus.Archived
  );

export const selectPipelineCounts = (state: AppState) => {
  const discovered = state.offers.length;
  const ready = state.offers.filter(
    (o) => o.status === ApplicationStatus.Ready && Boolean(state.dossiers[o.id])
  ).length;
  const sent = state.offers.filter(
    (o) => o.status === ApplicationStatus.Sent || o.status === ApplicationStatus.Interview
  ).length;
  const channelsVerified = state.offers.filter((o) =>
    o.channels.some((c) => c.verified)
  ).length;

  return { discovered, ready, sent, channelsVerified };
};

const STORAGE_KEY = 'stagepilot_app_state_v1';

export const serializePersistedState = (state: AppState): string =>
  JSON.stringify({
    profile: state.profile,
    searchQuery: state.searchQuery,
    customSources: state.customSources,
    offers: state.offers,
    dossiers: state.dossiers,
  });

export const hydratePersistedState = (raw: string | null): AppState => {
  const base = createInitialState();
  if (!raw) {
    return base;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<
      Pick<AppState, 'profile' | 'searchQuery' | 'customSources' | 'offers' | 'dossiers'>
    >;
    return {
      ...base,
      profile: parsed.profile?.fullName ? parsed.profile : base.profile,
      searchQuery: parsed.searchQuery?.keywords ? parsed.searchQuery : base.searchQuery,
      customSources:
        Array.isArray(parsed.customSources) && parsed.customSources.length > 0
          ? parsed.customSources
          : base.customSources,
      offers: Array.isArray(parsed.offers) && parsed.offers.length > 0 ? parsed.offers : base.offers,
      dossiers: parsed.dossiers && typeof parsed.dossiers === 'object' ? parsed.dossiers : base.dossiers,
    };
  } catch {
    return base;
  }
};

export const loadStateFromStorage = (): AppState => {
  if (typeof window === 'undefined') {
    return createInitialState();
  }
  return hydratePersistedState(window.localStorage.getItem(STORAGE_KEY));
};

export const saveStateToStorage = (state: AppState): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serializePersistedState(state));
  } catch {
    // Ignore storage quota errors silently
  }
};
