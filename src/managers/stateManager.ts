import {
  ApplicationChannel,
  ApplicationStatus,
  AppError,
  AppState,
  CandidateProfile,
  CustomSource,
  ExternalSearchLink,
  FilterState,
  InternshipOffer,
  LivePlatformState,
  PreparedDossier,
  SearchQuery,
  SourceCollectionLog,
} from '../types/domain';
import { errorReducer } from './errorManager';
import {
  DEFAULT_SEARCH_QUERY,
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

export const EMPTY_CANDIDATE_PROFILE: CandidateProfile = {
  id: 'cand_local',
  fullName: '',
  email: '',
  phone: '',
  location: '',
  school: '',
  degree: '',
  graduationYear: '',
  targetRole: '',
  availability: '',
  portfolioUrl: '',
  linkedinUrl: '',
  skills: [],
  experiences: [],
  rawCvText: '',
  avatarUrl: '',
};

export type AppAction =
  | { readonly type: 'SET_PROFILE'; readonly profile: CandidateProfile }
  | { readonly type: 'SET_SEARCH_QUERY'; readonly query: Partial<SearchQuery> }
  | { readonly type: 'SET_FILTERS'; readonly filters: Partial<FilterState> }
  | { readonly type: 'SEARCH_STARTED'; readonly sources?: readonly string[] }
  | {
      readonly type: 'SEARCH_PROGRESS_INIT';
      readonly queriesExecuted: readonly string[];
      readonly sources: readonly string[];
    }
  | { readonly type: 'SEARCH_SOURCE_STARTED'; readonly source: string }
  | { readonly type: 'SEARCH_SOURCE_COMPLETED'; readonly log: SourceCollectionLog }
  | {
      readonly type: 'SEARCH_SUCCEEDED';
      readonly offers: readonly InternshipOffer[];
      readonly groundingUrls: readonly { readonly title: string; readonly url: string }[];
      readonly externalSearchLinks?: readonly ExternalSearchLink[];
      readonly sourceLogs?: readonly SourceCollectionLog[];
      readonly queriesExecuted?: readonly string[];
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
      readonly type: 'MARK_OPENED';
      readonly offerId: string;
      readonly channelId: string;
      readonly openedAt: string;
      readonly notice: string;
    }
  | {
      readonly type: 'CONFIRM_SENT';
      readonly offerId: string;
      readonly channelId: string;
      readonly sentAt: string;
      readonly notice: string;
    }
  | {
      readonly type: 'MARK_SENT';
      readonly offerId: string;
      readonly channelId: string;
      readonly sentAt: string;
      readonly notice: string;
      readonly confirmedByUser?: boolean;
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
  initialProfile: CandidateProfile = EMPTY_CANDIDATE_PROFILE,
  initialOffers: readonly InternshipOffer[] = [],
  initialCustomSources: readonly CustomSource[] = DEFAULT_BUILTIN_SOURCES
): AppState => ({
  profile: initialProfile,
  searchQuery: {
    ...DEFAULT_SEARCH_QUERY,
    sources: initialCustomSources.filter((s) => s.enabled).map((s) => s.name),
  },
  filters: {
    sourceFilter: 'all',
    channelFilter: 'all',
    verificationFilter: 'all',
    textFilter: '',
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '',
    dateRangeTo: '',
  },
  customSources: initialCustomSources,
  offers: initialOffers,
  dossiers: {},
  isSearching: false,
  isPreparingOfferId: null,
  isDiscoveringChannelsId: null,
  lastSearchGroundingUrls: [],
  lastExternalSearchLinks: [],
  lastSourceLogs: [],
  livePlatformStatuses: {},
  lastQueriesExecuted: [],
  errors: [],
  lastDispatchNotice: null,
});

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
          verificationFilter: 'all',
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

    case 'SEARCH_STARTED': {
      const initStatuses: Record<string, LivePlatformState> = {};
      for (const s of action.sources ?? state.searchQuery.sources) {
        initStatuses[s] = 'pending';
      }
      return {
        ...state,
        isSearching: true,
        lastDispatchNotice: null,
        lastSourceLogs: [],
        livePlatformStatuses: initStatuses,
      };
    }

    case 'SEARCH_PROGRESS_INIT': {
      const nextStatuses: Record<string, LivePlatformState> = { ...state.livePlatformStatuses };
      for (const s of action.sources) {
        if (!nextStatuses[s]) nextStatuses[s] = 'pending';
      }
      return {
        ...state,
        lastQueriesExecuted: action.queriesExecuted,
        livePlatformStatuses: nextStatuses,
      };
    }

    case 'SEARCH_SOURCE_STARTED':
      return {
        ...state,
        livePlatformStatuses: {
          ...state.livePlatformStatuses,
          [action.source]: 'running',
        },
      };

    case 'SEARCH_SOURCE_COMPLETED': {
      const existingLogs = state.lastSourceLogs.filter(
        (l) => !(l.source === action.log.source && l.connector === action.log.connector)
      );
      return {
        ...state,
        lastSourceLogs: [...existingLogs, action.log],
        livePlatformStatuses: {
          ...state.livePlatformStatuses,
          [action.log.source]: action.log.status,
        },
      };
    }

    case 'SEARCH_SUCCEEDED': {
      const preservedOffers = state.offers.filter(
        (o) => o.status !== ApplicationStatus.Discovered || Boolean(state.dossiers[o.id])
      );
      const finalStatuses: Record<string, LivePlatformState> = { ...state.livePlatformStatuses };
      for (const log of action.sourceLogs ?? []) {
        finalStatuses[log.source] = log.status;
      }
      return {
        ...state,
        isSearching: false,
        offers: deduplicateOffers(action.offers, preservedOffers),
        lastSearchGroundingUrls: action.groundingUrls,
        lastExternalSearchLinks: action.externalSearchLinks ?? [],
        lastSourceLogs: action.sourceLogs ?? [],
        livePlatformStatuses: finalStatuses,
        lastQueriesExecuted: action.queriesExecuted ?? state.lastQueriesExecuted,
      };
    }

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
      const updatedOffers = state.offers.map((offer) => {
        if (offer.id !== action.offerId || offer.status !== ApplicationStatus.Discovered) {
          return offer;
        }
        const isUnverifiedExternal =
          offer.verificationLevel === 'externally_unverified' ||
          offer.verificationStatus === 'externally_unverified' ||
          offer.verificationStatus === 'unverified_url';
        return {
          ...offer,
          status: isUnverifiedExternal ? ApplicationStatus.Drafting : ApplicationStatus.Ready,
        };
      });
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
      const updatedOffers = state.offers.map((offer) => {
        if (offer.id !== action.offerId || offer.status !== ApplicationStatus.Discovered) {
          return offer;
        }
        const isUnverifiedExternal =
          offer.verificationLevel === 'externally_unverified' ||
          offer.verificationStatus === 'externally_unverified' ||
          offer.verificationStatus === 'unverified_url';
        return {
          ...offer,
          status: isUnverifiedExternal ? ApplicationStatus.Drafting : ApplicationStatus.Ready,
        };
      });
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
      const topChannel = action.channels[0];
      const nextDossiers =
        existingDossier && topChannel
          ? {
              ...state.dossiers,
              [action.offerId]: {
                ...existingDossier,
                selectedChannelId: topChannel.id,
                recipientEmail:
                  topChannel.type === 'email' && topChannel.verified ? topChannel.target : null,
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
              recipientEmail:
                action.channel.type === 'email' && action.channel.verified
                  ? action.channel.target
                  : null,
            },
          }
        : state.dossiers;

      return {
        ...state,
        offers: updatedOffers,
        dossiers: nextDossiers,
      };
    }

    case 'MARK_OPENED': {
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId
          ? {
              ...offer,
              status: ApplicationStatus.Opened,
              openedAt: action.openedAt,
              openedViaChannelId: action.channelId,
            }
          : offer
      );
      return {
        ...state,
        offers: updatedOffers,
        lastDispatchNotice: action.notice,
      };
    }

    case 'CONFIRM_SENT': {
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId
          ? {
              ...offer,
              status: ApplicationStatus.Sent,
              sentAt: action.sentAt,
              sentViaChannelId: action.channelId,
              sentConfirmed: true,
            }
          : offer
      );
      return {
        ...state,
        offers: updatedOffers,
        lastDispatchNotice: action.notice,
      };
    }

    case 'MARK_SENT': {
      // Reliability guard: never mark as Sent without explicit user confirmation
      if (action.confirmedByUser !== true) {
        const updatedOffers = state.offers.map((offer) =>
          offer.id === action.offerId
            ? {
                ...offer,
                status: ApplicationStatus.Opened,
                openedAt: action.sentAt,
                openedViaChannelId: action.channelId,
              }
            : offer
        );
        return {
          ...state,
          offers: updatedOffers,
          lastDispatchNotice: action.notice,
        };
      }
      const updatedOffers = state.offers.map((offer) =>
        offer.id === action.offerId
          ? {
              ...offer,
              status: ApplicationStatus.Sent,
              sentAt: action.sentAt,
              sentViaChannelId: action.channelId,
              sentConfirmed: true,
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
      (offer.status === ApplicationStatus.Ready ||
        offer.status === ApplicationStatus.Drafting ||
        offer.status === ApplicationStatus.Opened) &&
      offer.verificationLevel !== 'externally_unverified' &&
      offer.verificationStatus !== 'externally_unverified' &&
      offer.contentAccessible !== false &&
      Boolean(state.dossiers[offer.id])
  );

export const selectTrackedApplications = (state: AppState): readonly InternshipOffer[] =>
  state.offers.filter(
    (offer) =>
      offer.status === ApplicationStatus.Ready ||
      offer.status === ApplicationStatus.Opened ||
      offer.status === ApplicationStatus.Sent ||
      offer.status === ApplicationStatus.Interview ||
      offer.status === ApplicationStatus.Archived
  );

export const selectPipelineCounts = (state: AppState) => {
  const discovered = state.offers.length;
  const ready = state.offers.filter(
    (o) =>
      (o.status === ApplicationStatus.Ready || o.status === ApplicationStatus.Opened) &&
      o.verificationLevel !== 'externally_unverified' &&
      o.contentAccessible !== false &&
      Boolean(state.dossiers[o.id])
  ).length;
  const opened = state.offers.filter((o) => o.status === ApplicationStatus.Opened).length;
  const sent = state.offers.filter(
    (o) => o.status === ApplicationStatus.Sent || o.status === ApplicationStatus.Interview
  ).length;
  const channelsVerified = state.offers.filter(
    (o) =>
      o.verificationLevel !== 'externally_unverified' &&
      o.channels.some((c) => c.verified)
  ).length;

  return { discovered, ready, opened, sent, channelsVerified };
};

const STORAGE_KEY = 'stagepilot_app_state_v2';

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
    const savedSources =
      Array.isArray(parsed.customSources) && parsed.customSources.length > 0
        ? parsed.customSources
        : [];
    const existingIds = new Set(savedSources.map((s) => s.id));
    const mergedSources =
      savedSources.length > 0
        ? [
            ...savedSources.map((saved) => {
              const builtin = base.customSources.find((b) => b.id === saved.id);
              return builtin
                ? { ...builtin, enabled: saved.enabled }
                : saved;
            }),
            ...base.customSources.filter((b) => !existingIds.has(b.id)),
          ]
        : base.customSources;

    const hydratedOffers = Array.isArray(parsed.offers)
      ? parsed.offers.map((o) => ({
          ...o,
          organizationSummary: o.organizationSummary ?? null,
          contentAccessible:
            typeof o.contentAccessible === 'boolean'
              ? o.contentAccessible
              : o.collectionMode !== 'discovered',
        }))
      : base.offers;

    const rawDossiers =
      parsed.dossiers && typeof parsed.dossiers === 'object' ? parsed.dossiers : {};
    const hydratedDossiers: Record<string, PreparedDossier> = {};
    for (const [k, d] of Object.entries(rawDossiers)) {
      if (d && typeof d === 'object') {
        hydratedDossiers[k] = {
          ...d,
          emailBody: typeof d.emailBody === 'string' ? d.emailBody : '',
          formCoverNote: typeof d.formCoverNote === 'string' ? d.formCoverNote : '',
          recipientEmail: d.recipientEmail ?? null,
        };
      }
    }

    const newDefaultEnabledNames = base.customSources
      .filter((b) => !existingIds.has(b.id) && b.enabled)
      .map((b) => b.name);

    const hydratedSearchQuery = parsed.searchQuery?.keywords
      ? {
          ...parsed.searchQuery,
          sources: Array.from(
            new Set([...(parsed.searchQuery.sources ?? []), ...newDefaultEnabledNames])
          ),
        }
      : base.searchQuery;

    return {
      ...base,
      profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : base.profile,
      searchQuery: hydratedSearchQuery,
      customSources: mergedSources,
      offers: hydratedOffers,
      dossiers: hydratedDossiers,
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
