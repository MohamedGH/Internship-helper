import React from 'react';
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Mail,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  ApplicationStatus,
  ChannelType,
  InternshipOffer,
  SourceProvider,
  WorkMode,
} from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import {
  selectFilteredOffers,
  selectPipelineCounts,
} from '../managers/stateManager';
import { ALL_SOURCES } from '../modules/sourceAggregator';
import { extractMatchingSkills } from '../modules/dossierComposer';
import { selectPreferredChannel } from '../modules/channelFinder';

interface DiscoverViewProps {
  readonly onOpenDossier: (offerId: string) => void;
  readonly onGoToProfile: () => void;
}

const getStatusLabel = (status: ApplicationStatus): string => {
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

  const filteredOffers = selectFilteredOffers(state);
  const counts = selectPipelineCounts(state);

  const toggleSourceInQuery = (source: SourceProvider) => {
    const exists = state.searchQuery.sources.includes(source);
    const nextSources = exists
      ? state.searchQuery.sources.filter((s) => s !== source)
      : [...state.searchQuery.sources, source];
    dispatch({ type: 'SET_SEARCH_QUERY', query: { sources: nextSources } });
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
          <span>Active CV: {state.profile.fullName}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onGoToProfile}
            className="text-blue-700 hover:text-blue-800 font-medium underline underline-offset-4 min-h-[44px] sm:min-h-0 flex items-center"
          >
            Edit CV &amp; Skills ({state.profile.skills.length})
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

          {/* Multi-source selector buttons */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Sources:</span>
            {ALL_SOURCES.map((source) => {
              const selected = state.searchQuery.sources.includes(source);
              return (
                <button
                  key={source}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSourceInQuery(source)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {source}
                </button>
              );
            })}
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
          <div className="text-xs text-slate-500 mt-0.5">Across {ALL_SOURCES.length} sources</div>
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
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                filters: { sourceFilter: e.target.value as SourceProvider | 'all' },
              })
            }
            className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          >
            <option value="all">All Sources</option>
            {ALL_SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-64">
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
            className="w-full h-9 px-3 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
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

      {/* Grounding Attribution URLs from live Search */}
      {state.lastSearchGroundingUrls.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-medium text-slate-800">Verified search references:</span>
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
        {filteredOffers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              No internships match your current filters
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Clear active filters or run a new multi-source search above to discover stage offers.
            </p>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'SET_FILTERS',
                  filters: { sourceFilter: 'all', channelFilter: 'all', textFilter: '' },
                })
              }
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
                        <span>{offer.source}</span>
                        <span aria-hidden="true">·</span>
                        <span>{offer.location}</span>
                        <span aria-hidden="true">·</span>
                        <span>{offer.workMode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono">{offer.duration}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-medium ${
                            offer.status === ApplicationStatus.Sent
                              ? 'text-emerald-700'
                              : offer.status === ApplicationStatus.Ready
                                ? 'text-blue-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {getStatusLabel(offer.status)}
                        </span>
                      </div>

                      <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                        {offer.title}
                      </h2>

                      <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                        {offer.description}
                      </p>

                      {/* Matched CV Skills & Channel line (clean unboxed text) */}
                      <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs text-slate-600">
                        <div>
                          <span className="font-medium text-slate-800">CV Match:</span>{' '}
                          <span>{matchedSkills.join(' · ')}</span>
                        </div>
                        {preferredChannel && (
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
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
