import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  ApplicationStatus,
  ChannelType,
  CoverLetterLanguage,
  CoverLetterTone,
  ErrorSeverity,
} from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import {
  selectDossierByOfferId,
  selectOfferById,
} from '../managers/stateManager';
import { createAppError } from '../managers/errorManager';
import {
  composeCoverLetterTemplate,
  composeEmailSubject,
  countWordsAndChars,
} from '../modules/dossierComposer';
import {
  isValidEmailAddress,
  isValidHttpUrl,
} from '../modules/channelFinder';
import {
  buildDispatchBundle,
  DispatchBundle,
  evaluatePreFlightChecks,
} from '../modules/oneClickDispatcher';

interface DossierStudioViewProps {
  readonly offerId: string;
  readonly onBack: () => void;
  readonly onGoToQueue: () => void;
}

export const DossierStudioView: React.FC<DossierStudioViewProps> = ({
  offerId,
  onBack,
  onGoToQueue,
}) => {
  const {
    state,
    dispatch,
    prepareOfferDossier,
    discoverChannelsForOffer,
    reportError,
  } = useAppState();

  const offer = selectOfferById(state, offerId);
  const dossier = selectDossierByOfferId(state, offerId);

  const [newChannelTarget, setNewChannelTarget] = useState('');
  const [newChannelLabel, setNewChannelLabel] = useState('');
  const [showCustomChannelForm, setShowCustomChannelForm] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [dispatchedBundle, setDispatchedBundle] = useState<DispatchBundle | null>(null);

  useEffect(() => {
    if (offer && !dossier) {
      void prepareOfferDossier(offer, 'fr', 'professional', false);
    }
  }, [offer, dossier, prepareOfferDossier]);

  if (!offer) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Internship offer not found
        </h1>
        <p className="text-sm text-slate-600">
          The requested offer is not in your active discovery list.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          Back to Discover
        </button>
      </main>
    );
  }

  const activeDossier = dossier;
  const preFlight = evaluatePreFlightChecks(offer, state.profile, activeDossier);
  const metrics = countWordsAndChars(activeDossier?.coverLetter ?? '');
  const isPreparing = state.isPreparingOfferId === offer.id;
  const isDiscovering = state.isDiscoveringChannelsId === offer.id;

  const handleLanguageOrToneChange = (
    nextLanguage: CoverLetterLanguage,
    nextTone: CoverLetterTone
  ) => {
    if (!activeDossier) return;
    dispatch({
      type: 'UPDATE_DOSSIER',
      offerId: offer.id,
      patch: {
        language: nextLanguage,
        tone: nextTone,
        emailSubject: composeEmailSubject(offer, state.profile, nextLanguage),
        coverLetter: composeCoverLetterTemplate(offer, state.profile, nextLanguage, nextTone),
        aiGenerated: false,
      },
    });
  };

  const handleAddCustomChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const target = newChannelTarget.trim();
    if (!target) {
      reportError(
        createAppError({
          code: 'EMPTY_CHANNEL',
          severity: ErrorSeverity.Validation,
          message: 'Enter an email address or application form URL.',
          context: 'channel',
        })
      );
      return;
    }

    const isEmail = isValidEmailAddress(target);
    const isUrl = isValidHttpUrl(target);

    if (!isEmail && !isUrl) {
      reportError(
        createAppError({
          code: 'INVALID_CHANNEL',
          severity: ErrorSeverity.Validation,
          message: 'Channel must be a valid email (name@company.com) or URL (https://...).',
          context: 'channel',
        })
      );
      return;
    }

    dispatch({
      type: 'ADD_CUSTOM_CHANNEL',
      offerId: offer.id,
      channel: {
        id: `ch_custom_${Date.now()}`,
        type: isEmail ? ChannelType.Email : ChannelType.Form,
        target,
        label:
          newChannelLabel.trim() || (isEmail ? 'Verified Recruiter Email' : 'Direct Form URL'),
        verified: true,
      },
    });

    setNewChannelTarget('');
    setNewChannelLabel('');
  };

  const handleCopyLetter = async () => {
    if (!activeDossier) return;
    try {
      await navigator.clipboard.writeText(activeDossier.coverLetter);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    } catch {
      // Clipboard fallback ignored if restricted
    }
  };

  const handleSingleClickSend = async () => {
    if (!activeDossier) return;
    if (!preFlight.readyToSend || !preFlight.selectedChannel) {
      reportError(
        createAppError({
          code: 'PREFLIGHT_BLOCKED',
          severity: ErrorSeverity.Dispatch,
          message: preFlight.blockingReason ?? 'Complete all checklist items before sending.',
          context: 'dispatch',
        })
      );
      return;
    }

    const bundle = buildDispatchBundle(offer, state.profile, activeDossier);
    if (!bundle) return;

    try {
      await navigator.clipboard?.writeText(bundle.clipboardText);
    } catch {
      // Non-blocking clipboard best effort
    }

    dispatch({
      type: 'MARK_SENT',
      offerId: offer.id,
      channelId: preFlight.selectedChannel.id,
      sentAt: new Date().toISOString(),
      notice: `Application dispatched for ${offer.organization} via ${bundle.targetValue}`,
    });

    setDispatchedBundle(bundle);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-28 md:pb-12">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] sm:min-h-0 self-start"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Discover
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>Source: {offer.source}</span>
          <span aria-hidden="true">·</span>
          <a
            href={offer.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-700 hover:underline"
          >
            Original listing
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Offer Title & Organization Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{offer.organization}</span>
          <span aria-hidden="true">·</span>
          <span>{offer.location}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{offer.duration ?? 'Duration unspecified'}</span>
          {offer.startDate && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {offer.endDate ? `${offer.startDate} to ${offer.endDate}` : `Start: ${offer.startDate}`}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span
            className={`font-semibold ${
              offer.status === ApplicationStatus.Sent ? 'text-emerald-700' : 'text-blue-700'
            }`}
          >
            {offer.status === ApplicationStatus.Sent ? 'Sent' : 'Ready to review'}
          </span>
        </div>

        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-2">
          {offer.title}
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{offer.organizationSummary}</p>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">{offer.description}</p>
      </section>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main Column (8 cols): Cover Letter & CV Tailoring */}
        <div className="lg:col-span-8 space-y-6">
          {/* Lettre de motivation Editor */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Adapted Lettre de Motivation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tailored to {offer.organization}, the offer requirements, and {state.profile.fullName}&apos;s CV.
                </p>
              </div>

              <button
                type="button"
                disabled={isPreparing || !activeDossier}
                onClick={() =>
                  activeDossier &&
                  void prepareOfferDossier(
                    offer,
                    activeDossier.language,
                    activeDossier.tone,
                    true
                  )
                }
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                {isPreparing ? 'Adapting with AI...' : 'AI Adapt to Offer & Org'}
              </button>
            </div>

            {/* Language & Tone Controls */}
            {activeDossier && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-2 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    role="group"
                    aria-label="Cover letter language"
                    className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
                  >
                    <button
                      type="button"
                      onClick={() => handleLanguageOrToneChange('fr', activeDossier.tone)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        activeDossier.language === 'fr'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Français
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageOrToneChange('en', activeDossier.tone)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        activeDossier.language === 'en'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      English
                    </button>
                  </div>

                  <select
                    aria-label="Cover letter tone"
                    value={activeDossier.tone}
                    onChange={(e) =>
                      handleLanguageOrToneChange(
                        activeDossier.language,
                        e.target.value as CoverLetterTone
                      )
                    }
                    className="h-8 px-2.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="professional">Professional tone</option>
                    <option value="enthusiastic">Enthusiastic tone</option>
                    <option value="concise">Concise tone</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{metrics.words} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{metrics.chars} chars</span>
                  <button
                    type="button"
                    onClick={() => void handleCopyLetter()}
                    className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-sans font-medium"
                  >
                    {copiedFlag ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Subject & Letter Inputs */}
            {activeDossier && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="dossier-subject"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Email Subject / Application Headline
                  </label>
                  <input
                    id="dossier-subject"
                    type="text"
                    value={activeDossier.emailSubject}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_DOSSIER',
                        offerId: offer.id,
                        patch: { emailSubject: e.target.value },
                      })
                    }
                    className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dossier-letter"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Lettre de motivation
                  </label>
                  <textarea
                    id="dossier-letter"
                    rows={13}
                    value={activeDossier.coverLetter}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_DOSSIER',
                        offerId: offer.id,
                        patch: { coverLetter: e.target.value },
                      })
                    }
                    className="w-full p-3.5 text-sm text-slate-900 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                </div>
              </div>
            )}
          </section>

          {/* CV Adaptation Highlights */}
          {activeDossier && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                CV Adaptation Checklist for {offer.organization}
              </h2>
              <p className="text-xs text-slate-500">
                Matched skills: {activeDossier.matchedSkills.join(' · ')}
              </p>
              <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                {activeDossier.cvTailoringHighlights.map((point, idx) => (
                  <li key={idx} className="py-2.5 flex items-start gap-2.5">
                    <span className="font-mono text-xs text-slate-400 mt-0.5 tabular-nums">
                      0{idx + 1}.
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right Column (4 cols): Single-Click Pre-Flight & Send + Channel Finder */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Pre-Flight Readiness & Single-Click Send */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pre-Flight Check &amp; Send
            </h2>

            <ul className="space-y-2.5 text-xs">
              {preFlight.checks.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5">
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      item.passed ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{item.label}</div>
                    <div className="text-slate-600 truncate">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => void handleSingleClickSend()}
              className="w-full min-h-[48px] px-4 py-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {offer.status === ApplicationStatus.Sent
                ? 'Send Again (Copy & Launch)'
                : preFlight.selectedChannel?.type === ChannelType.Email
                  ? 'Check & Send Email in 1 Click'
                  : 'Check, Copy & Open Form in 1 Click'}
            </button>

            {dispatchedBundle && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                <div className="font-semibold text-emerald-900">
                  Ready &amp; Logged as Sent · Dossier copied to clipboard
                </div>
                <p className="text-emerald-800">
                  Target: <span className="font-mono">{dispatchedBundle.targetValue}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={dispatchedBundle.launchUri}
                    target={dispatchedBundle.mode === 'form' ? '_blank' : undefined}
                    rel={dispatchedBundle.mode === 'form' ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    {dispatchedBundle.mode === 'mailto'
                      ? 'Launch Email Draft'
                      : 'Open Application Form'}
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={onGoToQueue}
                    className="px-2.5 py-1.5 font-medium text-emerald-900 hover:underline"
                  >
                    Next in Queue
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Where to Apply (Channels) */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Where to Postuler
              </h2>
              <button
                type="button"
                disabled={isDiscovering}
                onClick={() => void discoverChannelsForOffer(offer)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                {isDiscovering ? 'Searching...' : 'Scan Web'}
              </button>
            </div>

            <div className="space-y-2">
              {offer.channels.map((channel) => {
                const selected = preFlight.selectedChannel?.id === channel.id;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'UPDATE_DOSSIER',
                        offerId: offer.id,
                        patch: { selectedChannelId: channel.id },
                      })
                    }
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selected
                        ? 'border-blue-700 bg-blue-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                        {channel.type === ChannelType.Email ? (
                          <Mail className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                        )}
                        {channel.label}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {selected ? 'Selected' : 'Select'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-600 truncate mt-1">
                      {channel.target}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                aria-expanded={showCustomChannelForm}
                onClick={() => setShowCustomChannelForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {showCustomChannelForm ? 'Hide custom channel' : 'Add verified email or form URL'}
              </button>

              {showCustomChannelForm && (
                <form onSubmit={handleAddCustomChannel} className="mt-3 space-y-2">
                  <label htmlFor="custom-channel-target" className="sr-only">
                    Email or form URL
                  </label>
                  <input
                    id="custom-channel-target"
                    type="text"
                    value={newChannelTarget}
                    onChange={(e) => setNewChannelTarget(e.target.value)}
                    placeholder="recrutement@company.com or https://..."
                    className="w-full h-9 px-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      aria-label="Channel label (optional)"
                      value={newChannelLabel}
                      onChange={(e) => setNewChannelLabel(e.target.value)}
                      placeholder="Label (optional)"
                      className="flex-1 h-9 px-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                    />
                    <button
                      type="submit"
                      className="h-9 px-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
};
