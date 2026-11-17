import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  Mail,
  Send,
} from 'lucide-react';
import {
  ApplicationStatus,
  ChannelType,
  ErrorSeverity,
  InternshipOffer,
} from '../types/domain';
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<{
    readonly offerId: string;
    readonly organization: string;
    readonly channelId: string;
    readonly bundle: DispatchBundle;
  } | null>(null);

  const handleCopyItem = async (key: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard optional
    }
  };

  const handleOpenApplication = async (offer: InternshipOffer) => {
    const dossier = state.dossiers[offer.id];
    if (!dossier) return;

    const preFlight = evaluatePreFlightChecks(offer, state.profile, dossier);
    if (!preFlight.readyToSend || !preFlight.selectedChannel) {
      reportError(
        createAppError({
          code: 'QUEUE_DISPATCH_BLOCKED',
          severity: ErrorSeverity.Dispatch,
          message: preFlight.blockingReason ?? 'Application dossier needs review before opening.',
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
      type: 'MARK_OPENED',
      offerId: offer.id,
      channelId: preFlight.selectedChannel.id,
      openedAt: new Date().toISOString(),
      notice: `Draft opened for ${offer.organization} (${bundle.targetValue}) — confirm once sent.`,
    });

    setLastOpened({
      offerId: offer.id,
      organization: offer.organization,
      channelId: preFlight.selectedChannel.id,
      bundle,
    });
  };

  const handleConfirmSent = (offer: InternshipOffer, channelId: string) => {
    dispatch({
      type: 'CONFIRM_SENT',
      offerId: offer.id,
      channelId,
      sentAt: new Date().toISOString(),
      notice: `Confirmed application sent to ${offer.organization}.`,
    });
    if (lastOpened?.offerId === offer.id) {
      setLastOpened(null);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-24 md:pb-12">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Review &amp; Dispatch Queue
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Review verified contacts, copy your tailored letter or email, open your draft, and confirm once actually sent.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 tabular-nums">
          {readyOffers.length} dossier{readyOffers.length === 1 ? '' : 's'} queued
        </div>
      </section>

      {lastOpened && (
        <section
          aria-live="polite"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs sm:text-sm text-amber-950">
            <span className="font-semibold">{lastOpened.organization}</span> draft prepared &amp;
            copied (not yet marked Sent).
            <span className="ml-2 font-mono text-xs text-amber-900">
              {lastOpened.bundle.targetValue}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <a
              href={lastOpened.bundle.launchUri}
              target={lastOpened.bundle.mode === 'form' ? '_blank' : undefined}
              rel={lastOpened.bundle.mode === 'form' ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              {lastOpened.bundle.mode === 'mailto'
                ? 'Open Email Client'
                : 'Open Application Form'}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => {
                const targetOffer = readyOffers.find((o) => o.id === lastOpened.offerId);
                if (targetOffer) handleConfirmSent(targetOffer, lastOpened.channelId);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Confirm Sent
            </button>
          </div>
        </section>
      )}

      {readyOffers.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Your review queue is empty
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Pick an internship from Discover and prepare an adapted lettre de motivation and application email to queue it here.
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
            const isOpened = offer.status === ApplicationStatus.Opened;

            return (
              <article
                key={offer.id}
                data-testid={`queue-item-${offer.id}`}
                className="p-5 sm:p-6 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">{offer.organization}</span>
                      <span aria-hidden="true">·</span>
                      <span>{offer.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{offer.duration ?? 'Duration unspecified'}</span>
                      {typeof offer.matchScore === 'number' && offer.matchScore > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums font-semibold text-blue-700">
                            Match {offer.matchScore}%
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${isOpened ? 'text-amber-700' : 'text-blue-700'}`}>
                        {isOpened ? 'Opened (Awaiting Sent confirmation)' : 'Ready'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        {offer.title}
                      </h2>
                      <a
                        href={offer.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                      >
                        Original listing
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>

                    {dossier && (
                      <div className="text-xs text-slate-700 pt-0.5">
                        <span className="font-medium text-slate-900">Subject:</span>{' '}
                        {dossier.emailSubject}
                      </div>
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
                          <span>{channel.target}</span>
                          <span
                            className={`font-sans text-[11px] font-medium ${
                              channel.verified ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            ({channel.verified ? 'Verified' : 'Unverified'})
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {dossier && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopyItem(`${offer.id}_letter`, dossier.coverLetter)}
                          className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                        >
                          {copiedId === `${offer.id}_letter` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          Copy Letter
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyItem(
                              `${offer.id}_email`,
                              `Subject: ${dossier.emailSubject}\n\n${dossier.emailBody}`
                            )
                          }
                          className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                        >
                          {copiedId === `${offer.id}_email` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          Copy Email
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenDossier(offer.id)}
                      className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOpenApplication(offer)}
                      className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      {channel?.type === ChannelType.Email ? 'Open Email Draft' : 'Open Form'}
                    </button>

                    {isOpened && channel && (
                      <button
                        type="button"
                        onClick={() => handleConfirmSent(offer, channel.id)}
                        className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Confirm Sent
                      </button>
                    )}
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
