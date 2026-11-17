import React, { useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Mail,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  ApplicationStatus,
  ChannelType,
  CustomSource,
  InternshipOffer,
  WorkMode,
} from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import {
  selectFilteredOffers,
  selectPipelineCounts,
} from '../managers/stateManager';
import { extractMatchingSkills } from '../modules/dossierComposer';
import { selectPreferredChannel } from '../modules/channelFinder';
import { isOfferExternallyUnverified } from '../modules/oneClickDispatcher';
import { AddCustomSourceModal } from './AddCustomSourceModal';

interface DiscoverViewProps {
  readonly onOpenDossier: (offerId: string) => void;
  readonly onGoToProfile: () => void;
}

const getStatusLabel = (
  status: ApplicationStatus,
  isUnverifiedExternal: boolean
): string => {
  if (isUnverifiedExternal) {
    return status === ApplicationStatus.Sent
      ? 'Logged externally'
      : 'External link only (verify on site)';
  }
  switch (status) {
    case ApplicationStatus.Discovered:
      return 'Not prepared';
    case ApplicationStatus.Drafting:
      return 'Drafting';
    case ApplicationStatus.Ready:
      return 'Ready to send';
    case ApplicationStatus.Sent:
      return 'Sent';
    case ApplicationStatus.Interview:
      return 'Interview';
    case ApplicationStatus.Archived:
      return 'Archived';
  }
};

const IT_DOMAINS = [
  'Développement logiciel',
  'Développement web',
  'Data',
  'IA',
  'Informatique décisionnelle',
] as const;

const getAccessModeShortLabel = (mode?: CustomSource['accessMode']): string => {
  switch (mode) {
    case 'ats_api':
      return 'ATS API';
    case 'official_api':
      return 'Official API';
    case 'rss_feed':
      return 'RSS Feed';
    case 'authorized_html':
      return 'Authorized HTML';
    case 'search_index':
      return 'Search Index';
    case 'link_only':
      return 'Link / Index';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Custom';
  }
};

const getCollectionModeLabel = (offer: InternshipOffer): string =>
  offer.collectionMode === 'discovered' ? 'Discovered (External)' : 'Collected (Authorized)';

const getVerificationLabel = (offer: InternshipOffer): string | null => {
  const level = offer.verificationLevel;
  if (level === 'expired' || offer.verificationStatus === 'expired') return 'Expired';
  if (level === 'externally_unverified' || offer.verificationStatus === 'externally_unverified') {
    return 'Externally Unverified';
  }
  if (offer.verificationStatus === 'verified_ats_api') return 'Verified ATS API';
  if (offer.verificationStatus === 'verified_offer' || level === 'verified') {
    return 'Verified Offer';
  }
  if (offer.verificationStatus === 'collected' || level === 'collected') {
    return 'Collected Feed / API';
  }
  if (offer.verificationStatus === 'generic_career_page') return 'Career Page Link';
  if (offer.verificationStatus === 'unverified_url') return 'Externally Unverified';
  return null;
};

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  onOpenDossier,
  onGoToProfile,
}) => {
  const {
    state,
    dispatch,
    runMultiSourceSearch,
    prepareOfferDossier,
    discoverChannelsForOffer,
  } = useAppState();

  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);

  const filteredOffers = selectFilteredOffers(state);
  const counts = selectPipelineCounts(state);

  const toggleSourceInQuery = (sourceName: string) => {
    const exists = state.searchQuery.sources.includes(sourceName);
    const nextSources = exists
      ? state.searchQuery.sources.filter((s) => s !== sourceName)
      : [...state.searchQuery.sources, sourceName];
    dispatch({ type: 'SET_SEARCH_QUERY', query: { sources: nextSources } });
  };

  const toggleDomainInQuery = (domain: string) => {
    const current = state.searchQuery.domains ?? [];
    const next = current.includes(domain)
      ? current.filter((d) => d !== domain)
      : [...current, domain];
    dispatch({ type: 'SET_SEARCH_QUERY', query: { domains: next } });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runMultiSourceSearch();
  };

  const handlePrepareAndOpen = async (offer: InternshipOffer) => {
    if (!state.dossiers[offer.id]) {
      await prepareOfferDossier(offer, 'fr', 'professional', true);
    }
    onOpenDossier(offer.id);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-24 md:pb-12">
      {/* Page Intro & Profile Context */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Multi-Source Stage &amp; Internship Finder
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1.5">
            Search internships across job boards and company career portals, adapt your{' '}
            <span className="text-slate-900 font-medium">lettre de motivation</span> and CV to
            each offer, verify where to apply, and send in one click.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
          <span>
            Active CV:{' '}
            {state.profile.fullName.trim() ? state.profile.fullName : 'Not configured yet'}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onGoToProfile}
            className="text-blue-700 hover:text-blue-800 font-medium underline underline-offset-4 min-h-[44px] sm:min-h-0 flex items-center"
          >
            {state.profile.fullName.trim()
              ? `Edit CV & Skills (${state.profile.skills.length})`
              : 'Configure CV Profile'}
          </button>
        </div>
      </section>

      {/* Multi-Source Search Form Card */}
      <section
        aria-label="Multi-source internship search"
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <label
                htmlFor="search-keywords"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Role, domain, or stack
              </label>
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="search-keywords"
                  type="text"
                  value={state.searchQuery.keywords}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_SEARCH_QUERY',
                      query: { keywords: e.target.value },
                    })
                  }
                  placeholder="e.g. Full-Stack Software Engineer Stage"
                  className="w-full h-11 pl-9 pr-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="search-location"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Location
              </label>
              <input
                id="search-location"
                type="text"
                value={state.searchQuery.location}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { location: e.target.value },
                  })
                }
                placeholder="Paris, Lyon, Remote"
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="search-workmode"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Work mode
              </label>
              <select
                id="search-workmode"
                value={state.searchQuery.workMode}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { workMode: e.target.value as WorkMode | 'all' },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              >
                <option value="all">All modes</option>
                <option value={WorkMode.Hybrid}>Hybrid</option>
                <option value={WorkMode.Remote}>Remote</option>
                <option value={WorkMode.OnSite}>On-site</option>
              </select>
            </div>

            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={state.isSearching}
                className="w-full h-11 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                {state.isSearching ? 'Searching...' : 'Search Sources'}
              </button>
            </div>
          </div>

          {/* Row 2: Stage Dates & Duration Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label
                htmlFor="search-min-duration"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Min Duration
              </label>
              <select
                id="search-min-duration"
                value={state.searchQuery.minDurationMonths}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { minDurationMonths: parseInt(e.target.value, 10) || 1 },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              >
                <option value={1}>1 month</option>
                <option value={2}>2 months</option>
                <option value={3}>3 months</option>
                <option value={4}>4 months</option>
                <option value={5}>5 months</option>
                <option value={6}>6 months</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="search-max-duration"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Max Duration
              </label>
              <select
                id="search-max-duration"
                value={state.searchQuery.maxDurationMonths}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { maxDurationMonths: parseInt(e.target.value, 10) || 6 },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              >
                <option value={2}>2 months</option>
                <option value={3}>3 months</option>
                <option value={4}>4 months</option>
                <option value={5}>5 months</option>
                <option value={6}>6 months</option>
                <option value={8}>8 months</option>
                <option value={10}>10 months</option>
                <option value={12}>12 months</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="search-date-from"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stage Start Date From
              </label>
              <input
                id="search-date-from"
                type="date"
                value={state.searchQuery.startDateFrom}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { startDateFrom: e.target.value },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="search-date-to"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stage Start Date To
              </label>
              <input
                id="search-date-to"
                type="date"
                value={state.searchQuery.startDateTo}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { startDateTo: e.target.value },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="search-education"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Study Level (Optional)
              </label>
              <input
                id="search-education"
                type="text"
                value={state.searchQuery.educationLevel ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { educationLevel: e.target.value },
                  })
                }
                placeholder="e.g. Bac+5 / Master / MIAGE"
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="search-language"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Language Preference
              </label>
              <select
                id="search-language"
                value={(state.searchQuery.languages ?? [])[0] ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    query: { languages: e.target.value ? [e.target.value] : [] },
                  })
                }
                className="w-full h-11 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
              >
                <option value="">French &amp; English (All)</option>
                <option value="French">French (FR)</option>
                <option value="English">English (EN / International)</option>
              </select>
            </div>
          </div>

          {/* IT Domains selector */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Domains:</span>
            {IT_DOMAINS.map((domain) => {
              const selected = (state.searchQuery.domains ?? []).includes(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleDomainInQuery(domain)}
                  className={`px-2.5 py-1 min-h-[32px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {domain}
                </button>
              );
            })}
          </div>

          {/* Multi-source provider toggles with explicit Access Mode */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Sources &amp; Access Modes:</span>
            {state.customSources.map((source) => {
              const selected = state.searchQuery.sources.includes(source.name);
              const modeLabel = getAccessModeShortLabel(source.accessMode);
              return (
                <button
                  key={source.id}
                  type="button"
                  aria-pressed={selected}
                  title={source.policySummary ?? source.description}
                  onClick={() => toggleSourceInQuery(source.name)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  <span>{source.name}</span>
                  <span
                    className={`text-[10px] font-mono ${
                      selected ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    ({source.isDefault ? modeLabel : 'Custom'})
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsSourceModalOpen(true)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg border border-dashed border-blue-300 text-blue-700 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Manage &amp; Add Sources
            </button>
          </div>
        </form>
      </section>

      {/* 4-Column Pipeline KPI Strip */}
      <section
        aria-label="Application pipeline summary"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Discovered Offers</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums font-mono">
            {counts.discovered}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Across {state.customSources.length} sources ({state.customSources.filter((s) => !s.isDefault).length} custom)
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Channels Verified</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums font-mono">
            {counts.channelsVerified}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Email inbox or ATS form</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Ready to Send</div>
          <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums font-mono">
            {counts.ready}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Letter &amp; CV adapted</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Sent Applications</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums font-mono">
            {counts.sent}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Dispatched in one click</div>
        </div>
      </section>

      {/* Client-side Filter & Grounding Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter by application channel"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  { key: 'all', label: 'All Channels' },
                  { key: ChannelType.Email, label: 'Direct Email' },
                  { key: ChannelType.Form, label: 'Web Form' },
                ] as const
              ).map((tab) => {
                const active = state.filters.channelFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'SET_FILTERS',
                        filters: { channelFilter: tab.key },
                      })
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <select
              aria-label="Filter by source provider"
              value={state.filters.sourceFilter}
              onChange={(e) =>
                dispatch({
                  type: 'SET_FILTERS',
                  filters: { sourceFilter: e.target.value },
                })
              }
              className="h-9 px-3 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            >
              <option value="all">All Sources</option>
              {state.customSources.map((src) => (
                <option key={src.id} value={src.name}>
                  {src.name} {!src.isDefault ? '(Custom)' : ''}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by stage duration"
              value={
                state.filters.minDurationFilter === 0 && state.filters.maxDurationFilter === 0
                  ? 'all'
                  : `${state.filters.minDurationFilter}-${state.filters.maxDurationFilter}`
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all') {
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { minDurationFilter: 0, maxDurationFilter: 0 },
                  });
                } else if (val === '1-3') {
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { minDurationFilter: 1, maxDurationFilter: 3 },
                  });
                } else if (val === '4-5') {
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { minDurationFilter: 4, maxDurationFilter: 5 },
                  });
                } else if (val === '6-6') {
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { minDurationFilter: 6, maxDurationFilter: 6 },
                  });
                }
              }}
              className="h-9 px-3 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            >
              <option value="all">Any Duration</option>
              <option value="1-3">Short (1 - 3 months)</option>
              <option value="4-5">Medium (4 - 5 months)</option>
              <option value="6-6">Full 6 months (PFE)</option>
            </select>
          </div>

          <div className="w-full lg:w-72">
            <label htmlFor="filter-offers-text" className="sr-only">
              Filter discovered offers
            </label>
            <input
              id="filter-offers-text"
              type="search"
              value={state.filters.textFilter}
              onChange={(e) =>
                dispatch({
                  type: 'SET_FILTERS',
                  filters: { textFilter: e.target.value },
                })
              }
              placeholder="Filter by company, skill, city..."
              className="w-full h-9 px-3 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>

        {/* Verification & Collection Mode Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div
            role="group"
            aria-label="Filter by collection and verification status"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(
              [
                { key: 'all', label: 'All Results' },
                { key: 'collected', label: 'Collected' },
                { key: 'verified', label: 'Verified' },
                { key: 'discovered', label: 'Discovered Links' },
                { key: 'externally_unverified', label: 'Unverified External' },
              ] as const
            ).map((tab) => {
              const active = state.filters.verificationFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'SET_FILTERS',
                      filters: { verificationFilter: tab.key },
                    })
                  }
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Start Date:</span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-date-from" className="text-slate-500">
                From:
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={state.filters.dateRangeFrom}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { dateRangeFrom: e.target.value },
                  })
                }
                className="h-8 px-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-date-to" className="text-slate-500">
                To:
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={state.filters.dateRangeTo}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_FILTERS',
                    filters: { dateRangeTo: e.target.value },
                  })
                }
                className="h-8 px-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            {(state.filters.minDurationFilter > 0 ||
              state.filters.maxDurationFilter > 0 ||
              state.filters.dateRangeFrom ||
              state.filters.dateRangeTo ||
              state.filters.sourceFilter !== 'all' ||
              state.filters.channelFilter !== 'all' ||
              state.filters.verificationFilter !== 'all' ||
              state.filters.textFilter) && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'RESET_FILTERS' })}
                className="text-xs font-medium text-blue-700 hover:underline min-h-[36px] flex items-center whitespace-nowrap"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Loading Skeleton State */}
      {state.isSearching && (
        <section
          aria-label="Searching internship sources"
          className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100"
        >
          {[1, 2, 3].map((row) => (
            <div key={row} className="p-5 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </section>
      )}

      {/* Scraper Collection Summary & Policy-Restricted External Links */}
      {(state.lastSourceLogs.length > 0 || state.lastExternalSearchLinks.length > 0) && (
        <section
          aria-label="Scraping report and external board links"
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs text-slate-600"
        >
          {state.lastSourceLogs.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="font-semibold text-slate-800">Scraper Run:</span>
              {state.lastSourceLogs.map((log, idx) => (
                <span key={`${log.connector}_${idx}`} className="font-mono text-[11px] text-slate-700">
                  {log.source} ({log.connector}): {log.matchedCount}/{log.collectedCount} matched ·{' '}
                  <span
                    className={
                      log.status === 'ok' || log.status === 'cached'
                        ? 'text-emerald-700 font-semibold'
                        : log.status === 'disabled_policy'
                          ? 'text-slate-500'
                          : 'text-amber-700 font-semibold'
                    }
                  >
                    {log.status}
                  </span>
                </span>
              ))}
            </div>
          )}

          {state.lastExternalSearchLinks.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="font-semibold text-slate-800">
                External Portals (ToS / Auth Protected — Open Directly):
              </span>
              {state.lastExternalSearchLinks.map((link) => (
                <a
                  key={`${link.source}_${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.reason}
                  className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                >
                  <span>{link.label}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Grounding Attribution URLs from live Search */}
      {state.lastSearchGroundingUrls.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-medium text-slate-800">Collected Listing URLs:</span>
          {state.lastSearchGroundingUrls.slice(0, 5).map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-700 hover:underline truncate max-w-[220px]"
            >
              <span className="truncate">{item.title}</span>
              <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
            </a>
          ))}
        </section>
      )}

      {/* Offers List (Zero-pill clean metadata + single elevation) */}
      <section aria-label="Discovered internships list">
        {state.offers.length === 0 && !state.isSearching ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              No internships collected yet
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Run a live search above to scrape verified internship listings from public Greenhouse,
              Lever, and Ashby ATS boards as well as your custom career sources.
            </p>
            <button
              type="button"
              onClick={() => void runMultiSourceSearch()}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              Search Live Sources Now
            </button>
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              No internships match your current filters
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Clear active filters or run a new multi-source search above to discover stage offers.
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET_FILTERS' })}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {filteredOffers.map((offer) => {
              const matchedSkills = extractMatchingSkills(state.profile, offer);
              const preferredChannel = selectPreferredChannel(offer.channels);
              const isPreparing = state.isPreparingOfferId === offer.id;
              const isDiscovering = state.isDiscoveringChannelsId === offer.id;
              const hasPreparedDossier = Boolean(state.dossiers[offer.id]);
              const isUnverifiedExternal = isOfferExternallyUnverified(offer);
              const verificationText = getVerificationLabel(offer);
              const sourcesList =
                offer.sources && offer.sources.length > 0 ? offer.sources : [offer.source];
              const discoveredDate = (offer.discoveredAt ?? offer.collectedAt)?.slice(0, 10);

              return (
                <article
                  key={offer.id}
                  data-testid={`offer-card-${offer.id}`}
                  className="p-4 sm:p-6 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Lead directly with clean 1-line unboxed metadata kicker */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-800">{offer.organization}</span>
                        <span aria-hidden="true">·</span>
                        <span>{sourcesList.join(' + ')}</span>
                        <span aria-hidden="true">·</span>
                        <span>{getCollectionModeLabel(offer)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{offer.location}</span>
                        <span aria-hidden="true">·</span>
                        <span>{offer.workMode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono">
                          {offer.duration ?? 'Duration unspecified'}
                        </span>
                        {offer.startDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-mono">
                              {offer.endDate
                                ? `${offer.startDate} to ${offer.endDate}`
                                : `Start: ${offer.startDate}`}
                            </span>
                          </>
                        )}
                        {discoveredDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-mono">
                              Seen {discoveredDate}
                            </span>
                          </>
                        )}
                        {verificationText && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-medium ${
                                isUnverifiedExternal ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {verificationText}
                            </span>
                          </>
                        )}
                        {typeof offer.matchScore === 'number' && offer.matchScore > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-blue-700 font-semibold">
                              Match {offer.matchScore}%
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-medium ${
                            isUnverifiedExternal
                              ? 'text-amber-700'
                              : offer.status === ApplicationStatus.Sent
                                ? 'text-emerald-700'
                                : offer.status === ApplicationStatus.Ready
                                  ? 'text-blue-700'
                                  : 'text-slate-600'
                          }`}
                        >
                          {getStatusLabel(offer.status, isUnverifiedExternal)}
                        </span>
                      </div>

                      <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                        <a
                          href={offer.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-700 hover:underline inline-flex items-center gap-1.5"
                        >
                          <span>{offer.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        </a>
                      </h2>

                      <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                        {offer.description}
                      </p>

                      {/* Matched CV Skills & Channel / Provenance line (clean unboxed text) */}
                      <div className="pt-1 flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 sm:gap-4 text-xs text-slate-600">
                        <div>
                          <span className="font-medium text-slate-800">CV Match:</span>{' '}
                          <span>{matchedSkills.join(' · ')}</span>
                        </div>
                        <a
                          href={offer.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium"
                        >
                          <span>Open original listing</span>
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        </a>
                        {!isUnverifiedExternal && preferredChannel && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {preferredChannel.type === ChannelType.Email ? (
                              <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                            )}
                            <span className="font-medium text-slate-800 shrink-0">
                              Where to apply:
                            </span>
                            <span className="font-mono text-slate-700 truncate max-w-[260px]">
                              {preferredChannel.target}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-wrap sm:flex-nowrap lg:flex-col items-stretch sm:items-center lg:items-end gap-2 shrink-0">
                      {isUnverifiedExternal ? (
                        <>
                          <a
                            href={offer.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>Open External Board</span>
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            disabled={isPreparing}
                            onClick={() => void handlePrepareAndOpen(offer)}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>{isPreparing ? 'Drafting...' : 'Draft Notes (Unverified)'}</span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isPreparing}
                            onClick={() => void handlePrepareAndOpen(offer)}
                            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>
                              {isPreparing
                                ? 'Adapting Letter...'
                                : hasPreparedDossier
                                  ? 'Review & Send'
                                  : 'Prepare Letter & CV'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            disabled={isDiscovering}
                            onClick={() => void discoverChannelsForOffer(offer)}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Search className="w-3.5 h-3.5" aria-hidden="true" />
                            {isDiscovering ? 'Scanning...' : 'Find Email / Form'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Add & Manage Custom Sources Dialog */}
      <AddCustomSourceModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        customSources={state.customSources}
        onAddSource={(source) => dispatch({ type: 'ADD_CUSTOM_SOURCE', source })}
        onRemoveSource={(sourceId) => dispatch({ type: 'REMOVE_CUSTOM_SOURCE', sourceId })}
        onToggleSource={(sourceId) => dispatch({ type: 'TOGGLE_CUSTOM_SOURCE', sourceId })}
      />
    </main>
  );
};
