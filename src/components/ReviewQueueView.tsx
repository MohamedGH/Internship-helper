import React, { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe,
  Mail,
  Send,
} from 'lucide-react';
import { ChannelType, ErrorSeverity, InternshipOffer } from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import { selectReadyQueue } from '../managers/stateManager';
import { createAppError } from '../managers/errorManager';
import {
  buildDispatchBundle,
  DispatchBundle,
  evaluatePreFlightChecks,
} from '../modules/oneClickDispatcher';

interface ReviewQueueViewProps {
  readonly onOpenDossier: (offerId: string) => void;
  readonly onGoToDiscover: () => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  onOpenDossier,
  onGoToDiscover,
}) => {
  const { state, dispatch, reportError } = useAppState();
  const readyOffers = selectReadyQueue(state);
  const [lastDispatched, setLastDispatched] = useState<{
    readonly offerId: string;
    readonly organization: string;
    readonly bundle: DispatchBundle;
  } | null>(null);

  const handleOneClickSend = async (offer: InternshipOffer) => {
    const dossier = state.dossiers[offer.id];
    if (!dossier) return;

    const preFlight = evaluatePreFlightChecks(offer, state.profile, dossier);
    if (!preFlight.readyToSend || !preFlight.selectedChannel) {
      reportError(
        createAppError({
          code: 'QUEUE_DISPATCH_BLOCKED',
          severity: ErrorSeverity.Dispatch,
          message: preFlight.blockingReason ?? 'Application dossier needs review before sending.',
          context: 'queue',
        })
      );
      return;
    }

    const bundle = buildDispatchBundle(offer, state.profile, dossier);
    if (!bundle) return;

    try {
      await navigator.clipboard?.writeText(bundle.clipboardText);
    } catch {
      // Clipboard optional
    }

    dispatch({
      type: 'MARK_SENT',
      offerId: offer.id,
      channelId: preFlight.selectedChannel.id,
      sentAt: new Date().toISOString(),
      notice: `Sent application to ${offer.organization} (${bundle.targetValue})`,
    });

    setLastDispatched({
      offerId: offer.id,
      organization: offer.organization,
      bundle,
    });
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-24 md:pb-12">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Ready-to-Send Review Queue
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect your adapted cover letter and verified application channel, then send in one click.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 tabular-nums">
          {readyOffers.length} dossier{readyOffers.length === 1 ? '' : 's'} queued
        </div>
      </section>

      {lastDispatched && (
        <section
          aria-live="polite"
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs sm:text-sm text-emerald-900">
            <span className="font-semibold">{lastDispatched.organization}</span> marked as sent
            and dossier copied to clipboard.
            <span className="ml-2 font-mono text-xs text-emerald-800">
              {lastDispatched.bundle.targetValue}
            </span>
          </div>
          <a
            href={lastDispatched.bundle.launchUri}
            target={lastDispatched.bundle.mode === 'form' ? '_blank' : undefined}
            rel={lastDispatched.bundle.mode === 'form' ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap self-start sm:self-center"
          >
            {lastDispatched.bundle.mode === 'mailto'
              ? 'Open Pre-filled Email'
              : 'Open Application Form'}
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </section>
      )}

      {readyOffers.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Your review queue is empty
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Pick an internship from Discover and prepare an adapted lettre de motivation to queue it
            for single-click sending.
          </p>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            Browse Discovered Stages
          </button>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
          {readyOffers.map((offer) => {
            const dossier = state.dossiers[offer.id];
            const preFlight = evaluatePreFlightChecks(offer, state.profile, dossier);
            const channel = preFlight.selectedChannel;

            return (
              <article
                key={offer.id}
                data-testid={`queue-item-${offer.id}`}
                className="p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">{offer.organization}</span>
                      <span aria-hidden="true">·</span>
                      <span>{offer.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{offer.duration}</span>
                      {offer.startDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {offer.endDate ? `${offer.startDate} to ${offer.endDate}` : `Start: ${offer.startDate}`}
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      {offer.title}
                    </h2>

                    {dossier && (
                      <div className="text-xs text-slate-600 pt-1">
                        <span className="font-medium text-slate-800">Subject:</span>{' '}
                        {dossier.emailSubject}
                      </div>
                    )}

                    {dossier && (
                      <p className="text-sm text-slate-600 line-clamp-2 max-w-3xl">
                        {dossier.coverLetter}
                      </p>
                    )}

                    <div className="pt-1 flex flex-wrap items-center gap-4 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${
                            preFlight.readyToSend ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                          aria-hidden="true"
                        />
                        {preFlight.readyToSend
                          ? 'Pre-flight verified'
                          : (preFlight.blockingReason ?? 'Needs attention')}
                      </span>

                      {channel && (
                        <span className="inline-flex items-center gap-1.5 font-mono text-slate-700">
                          {channel.type === ChannelType.Email ? (
                            <Mail className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                          ) : (
                            <Globe className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                          )}
                          {channel.target}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenDossier(offer.id)}
                      className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit Letter
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOneClickSend(offer)}
                      className="min-h-[44px] sm:min-h-[38px] px-4 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      Check &amp; Send
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
};
