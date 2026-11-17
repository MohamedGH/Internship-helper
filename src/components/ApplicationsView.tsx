import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApplicationStatus } from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import { selectTrackedApplications } from '../managers/stateManager';
import { selectPreferredChannel } from '../modules/channelFinder';

interface ApplicationsViewProps {
  readonly onOpenDossier: (offerId: string) => void;
  readonly onGoToDiscover: () => void;
}

const STATUS_OPTIONS: ReadonlyArray<{ readonly value: ApplicationStatus; readonly label: string }> =
  [
    { value: ApplicationStatus.Ready, label: 'Ready' },
    { value: ApplicationStatus.Opened, label: 'Opened' },
    { value: ApplicationStatus.Sent, label: 'Sent' },
    { value: ApplicationStatus.Interview, label: 'Interview' },
    { value: ApplicationStatus.Archived, label: 'Archived' },
  ];

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  onOpenDossier,
  onGoToDiscover,
}) => {
  const { state, dispatch } = useAppState();
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');

  const tracked = selectTrackedApplications(state).filter((offer) =>
    statusFilter === 'all' ? true : offer.status === statusFilter
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-24 md:pb-12">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Applications Tracker
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track ready, opened drafts, confirmed sent, and interview-stage applications with direct links to each dossier.
          </p>
        </div>

        <div
          role="group"
          aria-label="Filter applications by status"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.slice(0, 4).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === opt.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {tracked.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            No tracked applications in this view
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Prepare an application dossier or confirm a sent application from the Review Queue to track it here.
          </p>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            Discover Internships
          </button>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Desktop High-Density Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Organization &amp; Role</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Activity Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {tracked.map((offer) => {
                  const dossier = state.dossiers[offer.id];
                  const channel = selectPreferredChannel(
                    offer.channels,
                    offer.sentViaChannelId ?? offer.openedViaChannelId ?? dossier?.selectedChannelId
                  );
                  const dateDisplay = offer.sentAt
                    ? `Sent ${offer.sentAt.slice(0, 10)}`
                    : offer.openedAt
                      ? `Opened ${offer.openedAt.slice(0, 10)}`
                      : '—';

                  return (
                    <tr key={offer.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{offer.organization}</div>
                        <div className="text-xs text-slate-600">{offer.title}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {offer.source}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-700 max-w-[220px] truncate">
                        {channel?.target ?? 'Not set'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {dateDisplay}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Status for ${offer.organization}`}
                          value={offer.status}
                          onChange={(e) =>
                            dispatch({
                              type: 'SET_OFFER_STATUS',
                              offerId: offer.id,
                              status: e.target.value as ApplicationStatus,
                            })
                          }
                          className="h-8 px-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenDossier(offer.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                        >
                          Open Dossier
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Tap Rows */}
          <div className="md:hidden divide-y divide-slate-200">
            {tracked.map((offer) => {
              const dossier = state.dossiers[offer.id];
              const channel = selectPreferredChannel(
                offer.channels,
                offer.sentViaChannelId ?? offer.openedViaChannelId ?? dossier?.selectedChannelId
              );

              return (
                <div key={offer.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{offer.organization}</span>
                    <span className="font-mono tabular-nums">
                      {offer.sentAt
                        ? `Sent ${offer.sentAt.slice(0, 10)}`
                        : offer.openedAt
                          ? `Opened ${offer.openedAt.slice(0, 10)}`
                          : 'Not sent'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{offer.title}</div>
                  {channel && (
                    <div className="text-xs font-mono text-slate-600 truncate">
                      {channel.target}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <select
                      aria-label={`Status for ${offer.organization}`}
                      value={offer.status}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_OFFER_STATUS',
                          offerId: offer.id,
                          status: e.target.value as ApplicationStatus,
                        })
                      }
                      className="h-10 px-3 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => onOpenDossier(offer.id)}
                      className="min-h-[44px] px-3 text-xs font-semibold text-blue-700 hover:underline"
                    >
                      Open Dossier
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
};
