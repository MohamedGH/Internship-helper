import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import {
  ApplicationChannel,
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
  composeApplicationEmail,
  composeCoverLetterTemplate,
  countWordsAndChars,
} from '../modules/dossierComposer';
import {
  isValidEmailAddress,
  isValidHttpUrl,
  selectPreferredChannel,
} from '../modules/channelFinder';
import {
  buildDispatchBundle,
  DispatchBundle,
  evaluatePreFlightChecks,
  isOfferExternallyUnverified,
} from '../modules/oneClickDispatcher';

interface DossierStudioViewProps {
  readonly offerId: string;
  readonly onBack: () => void;
  readonly onGoToQueue: () => void;
}

const formatVerificationLabel = (ch: ApplicationChannel): { text: string; verified: boolean } => {
  if (ch.verificationStatus === 'verified_ats_form') {
    return { text: 'Verified ATS Form', verified: true };
  }
  if (ch.verificationStatus === 'verified_published' || ch.verified) {
    return { text: 'Verified Published Contact', verified: true };
  }
  if (ch.verificationStatus === 'candidate_syntax_only') {
    return { text: 'Syntax only — Unverified', verified: false };
  }
  return { text: 'Unverified Link', verified: false };
};

const formatRoleLabel = (role?: ApplicationChannel['channelRole']): string => {
  switch (role) {
    case 'recruiting_email':
      return 'Recruiting Email';
    case 'hr_contact':
      return 'HR Contact';
    case 'recruiter_contact':
      return 'Recruiter Contact';
    case 'direct_form':
      return 'Direct Form';
    case 'official_career_page':
      return 'Official Career Page';
    case 'company_contact_form':
      return 'Company Contact Form';
    default:
      return 'Channel';
  }
};

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
  const [newChannelVerified, setNewChannelVerified] = useState(true);
  const [showCustomChannelForm, setShowCustomChannelForm] = useState(false);
  const [copiedType, setCopiedType] = useState<'letter' | 'email' | 'note' | null>(null);
  const [openedBundle, setOpenedBundle] = useState<DispatchBundle | null>(null);

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
  const selectedChannel = selectPreferredChannel(offer.channels, activeDossier?.selectedChannelId);
  const letterMetrics = countWordsAndChars(activeDossier?.coverLetter ?? '');
  const emailMetrics = countWordsAndChars(activeDossier?.emailBody ?? '');
  const isDiscovering = state.isDiscoveringChannelsId === offer.id;
  const unverifiedOffer = isOfferExternallyUnverified(offer);
  const hasRealContent = offer.contentAccessible !== false && offer.description.trim().length > 0;

  const handleLanguageOrToneChange = (
    nextLanguage: CoverLetterLanguage,
    nextTone: CoverLetterTone
  ) => {
    if (!activeDossier) return;
    const emailDraft = composeApplicationEmail(
      offer,
      state.profile,
      nextLanguage,
      nextTone,
      selectedChannel
    );
    dispatch({
      type: 'UPDATE_DOSSIER',
      offerId: offer.id,
      patch: {
        language: nextLanguage,
        tone: nextTone,
        emailSubject: emailDraft.subject,
        emailBody: emailDraft.body,
        formCoverNote: emailDraft.formCoverNote,
        recipientEmail: emailDraft.recipientEmail,
        coverLetter: composeCoverLetterTemplate(offer, state.profile, nextLanguage, nextTone),
        aiGenerated: false,
      },
    });
  };

  const handleRegenerateEmailOnly = () => {
    if (!activeDossier) return;
    const emailDraft = composeApplicationEmail(
      offer,
      state.profile,
      activeDossier.language,
      activeDossier.tone,
      selectedChannel
    );
    dispatch({
      type: 'UPDATE_DOSSIER',
      offerId: offer.id,
      patch: {
        emailSubject: emailDraft.subject,
        emailBody: emailDraft.body,
        formCoverNote: emailDraft.formCoverNote,
        recipientEmail: emailDraft.recipientEmail,
      },
    });
  };

  const handleRegenerateLetterOnly = () => {
    if (!activeDossier) return;
    dispatch({
      type: 'UPDATE_DOSSIER',
      offerId: offer.id,
      patch: {
        coverLetter: composeCoverLetterTemplate(
          offer,
          state.profile,
          activeDossier.language,
          activeDossier.tone
        ),
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
          newChannelLabel.trim() ||
          (isEmail ? 'Manually Added Email' : 'Manually Added Form URL'),
        channelRole: isEmail ? 'recruiter_contact' : 'direct_form',
        verified: newChannelVerified,
        verificationStatus: newChannelVerified
          ? 'verified_published'
          : 'candidate_syntax_only',
        relevance: 'high',
        sourceUrl: offer.sourceUrl,
        discoveredAt: new Date().toISOString(),
      },
    });

    setNewChannelTarget('');
    setNewChannelLabel('');
    setShowCustomChannelForm(false);
  };

  const handleCopyText = async (text: string, type: 'letter' | 'email' | 'note') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Clipboard optional in restricted environments
    }
  };

  const handleOpenApplication = async () => {
    if (!activeDossier) return;
    if (!preFlight.readyToSend || !preFlight.selectedChannel) {
      reportError(
        createAppError({
          code: 'PREFLIGHT_BLOCKED',
          severity: ErrorSeverity.Dispatch,
          message: preFlight.blockingReason ?? 'Complete all checklist items before opening.',
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
      // Clipboard optional
    }

    dispatch({
      type: 'MARK_OPENED',
      offerId: offer.id,
      channelId: preFlight.selectedChannel.id,
      openedAt: new Date().toISOString(),
      notice: `Draft opened for ${offer.organization} (${bundle.targetValue}) — confirm once actually sent.`,
    });

    setOpenedBundle(bundle);
  };

  const handleConfirmSent = () => {
    if (!selectedChannel) return;
    dispatch({
      type: 'CONFIRM_SENT',
      offerId: offer.id,
      channelId: selectedChannel.id,
      sentAt: new Date().toISOString(),
      notice: `Confirmed application sent to ${offer.organization} via ${selectedChannel.target}.`,
    });
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-28 md:pb-12">
      {/* Breadcrumb & Provenance Links */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] sm:min-h-0 self-start"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Discover
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Source: {offer.source}</span>
          <span aria-hidden="true">·</span>
          <a
            href={offer.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
          >
            Original listing
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          {selectedChannel && isValidHttpUrl(selectedChannel.target) && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={selectedChannel.target}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
              >
                Direct apply link
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Result-Oriented Offer Header (No long description walls) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{offer.organization}</span>
          <span aria-hidden="true">·</span>
          <span>{offer.location}</span>
          <span aria-hidden="true">·</span>
          <span>{offer.workMode}</span>
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
          {typeof offer.matchScore === 'number' && offer.matchScore > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-semibold text-blue-700">
                Match {offer.matchScore}%
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span
            className={`font-semibold ${
              unverifiedOffer
                ? 'text-amber-700'
                : offer.status === ApplicationStatus.Sent
                  ? 'text-emerald-700'
                  : offer.status === ApplicationStatus.Opened
                    ? 'text-amber-700'
                    : 'text-blue-700'
            }`}
          >
            {unverifiedOffer
              ? 'Unverified / Content Not Accessible'
              : offer.status === ApplicationStatus.Sent
                ? 'Confirmed Sent'
                : offer.status === ApplicationStatus.Opened
                  ? 'Draft Opened (Awaiting confirmation)'
                  : 'Ready to review'}
          </span>
        </div>

        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
          {offer.title}
        </h1>

        {offer.organizationSummary && (
          <p className="text-sm text-slate-600">{offer.organizationSummary}</p>
        )}

        {!hasRealContent && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
            <span>
              The full offer description from {offer.source} could not be accessed automatically. Open the original listing before customizing and confirming your application.
            </span>
          </div>
        )}

        {(hasRealContent || offer.requirements.length > 0) && (
          <details className="text-xs text-slate-600 pt-1">
            <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900 select-none">
              Inspect offer details &amp; requirements ({offer.requirements.length} skills)
            </summary>
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-2 text-sm text-slate-700">
              {offer.requirements.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-900">Requirements: </span>
                  <span className="text-xs text-slate-600">{offer.requirements.join(' · ')}</span>
                </div>
              )}
              {offer.description && <p className="leading-relaxed text-xs">{offer.description}</p>}
            </div>
          </details>
        )}
      </section>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Document 1 (Email / Form Note) + Document 2 (Cover Letter) + CV Checklist */}
        <div className="lg:col-span-8 space-y-6">
          {/* Shared Language & Tone Bar */}
          {activeDossier && (
            <section className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Document Language &amp; Tone:</span>
                <div
                  role="group"
                  aria-label="Document language"
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
                  aria-label="Document tone"
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
              <div className="text-xs text-slate-500">
                Matched CV skills: <span className="font-medium text-slate-800">{activeDossier.matchedSkills.join(' · ')}</span>
              </div>
            </section>
          )}

          {/* DOCUMENT 1: Application Email & Form Message */}
          {activeDossier && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    1. Application Email (Distinct from Cover Letter)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedChannel?.type === ChannelType.Email && selectedChannel.verified
                      ? `Recipient: ${selectedChannel.target} (Verified published email)`
                      : 'No verified email selected — use the form message below if applying via web form.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{emailMetrics.words} words</span>
                  <button
                    type="button"
                    onClick={handleRegenerateEmailOnly}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-sans font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Regenerate Email
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyText(
                        `Subject: ${activeDossier.emailSubject}\n\n${activeDossier.emailBody}`,
                        'email'
                      )
                    }
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 font-sans font-semibold"
                  >
                    {copiedType === 'email' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        Copied Email
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Copy Email
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="dossier-subject"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Email Subject
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
                    htmlFor="dossier-email-body"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Email Body (Concise intro, motivation, availability, attachments &amp; sign-off)
                  </label>
                  <textarea
                    id="dossier-email-body"
                    rows={8}
                    value={activeDossier.emailBody}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_DOSSIER',
                        offerId: offer.id,
                        patch: { emailBody: e.target.value },
                      })
                    }
                    className="w-full p-3.5 text-sm text-slate-900 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                </div>

                {/* Companion Form Message when applying via ATS / Web Form */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="dossier-form-note"
                      className="text-xs font-medium text-slate-700"
                    >
                      Form Companion Message (for ATS / Web application forms)
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleCopyText(activeDossier.formCoverNote, 'note')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      {copiedType === 'note' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                          Copied Note
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          Copy Form Note
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    id="dossier-form-note"
                    rows={4}
                    value={activeDossier.formCoverNote}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_DOSSIER',
                        offerId: offer.id,
                        patch: { formCoverNote: e.target.value },
                      })
                    }
                    className="w-full p-3 text-xs text-slate-900 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                </div>
              </div>
            </section>
          )}

          {/* DOCUMENT 2: Personalized Lettre de motivation */}
          {activeDossier && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    2. Lettre de Motivation (Personalized Document)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Grounded in {state.profile.fullName || 'candidate'}&apos;s CV, {offer.organization}&apos;s listing missions, requested stack, and stage constraints.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{letterMetrics.words} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{letterMetrics.chars} chars</span>
                  <button
                    type="button"
                    onClick={handleRegenerateLetterOnly}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-sans font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Regenerate Letter
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyText(activeDossier.coverLetter, 'letter')}
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 font-sans font-semibold"
                  >
                    {copiedType === 'letter' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        Copied Letter
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Copy Letter
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="dossier-letter" className="sr-only">
                  Lettre de motivation
                </label>
                <textarea
                  id="dossier-letter"
                  rows={12}
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
            </section>
          )}

          {/* CV Adaptation Highlights */}
          {activeDossier && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                CV Adaptation Checklist for {offer.organization}
              </h2>
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

        {/* Right Column (4 cols): 2-Step Dispatch Workflow + Contacts & Channels */}
        <aside className="lg:col-span-4 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pre-Flight Check &amp; Dispatch
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
                    <div className="text-slate-600 break-words">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            {unverifiedOffer ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  This listing was discovered externally or its full content could not be read automatically. Inspect it directly on {offer.source} before applying.
                </p>
                <a
                  href={offer.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] px-4 py-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <span>Open Original Listing</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Step 1: Open Email Draft / Form (transitions ONLY to Opened) */}
                <button
                  type="button"
                  onClick={() => void handleOpenApplication()}
                  className="w-full min-h-[44px] px-4 py-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  {preFlight.selectedChannel?.type === ChannelType.Email
                    ? 'Prepare & Open Email Draft'
                    : 'Copy Note & Open Form'}
                </button>

                {/* Step 2: Explicit User Confirmation before marking Sent */}
                {offer.status !== ApplicationStatus.Sent && preFlight.selectedChannel && (
                  <button
                    type="button"
                    onClick={handleConfirmSent}
                    className={`w-full min-h-[44px] px-4 py-2.5 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-xl border transition-colors ${
                      offer.status === ApplicationStatus.Opened
                        ? 'text-emerald-900 bg-emerald-50 border-emerald-300 hover:bg-emerald-100'
                        : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    Confirm Application Sent
                  </button>
                )}

                {offer.status === ApplicationStatus.Sent && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <div className="font-semibold">Application Confirmed as Sent</div>
                    <div className="font-mono text-[11px]">
                      {offer.sentAt ? offer.sentAt.slice(0, 16).replace('T', ' ') : ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {openedBundle && offer.status !== ApplicationStatus.Sent && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
                <div className="font-semibold text-amber-950">
                  Draft opened (not marked Sent yet)
                </div>
                <p className="text-amber-900">
                  Target: <span className="font-mono break-all">{openedBundle.targetValue}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={openedBundle.launchUri}
                    target={openedBundle.mode === 'form' ? '_blank' : undefined}
                    rel={openedBundle.mode === 'form' ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    {openedBundle.mode === 'mailto'
                      ? 'Open Mail Client'
                      : 'Open Application Form'}
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={onGoToQueue}
                    className="px-2.5 py-1.5 font-medium text-amber-950 hover:underline"
                  >
                    View Queue
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Discovered Contacts & Application Channels */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Contacts &amp; Channels
              </h2>
              <button
                type="button"
                disabled={isDiscovering}
                onClick={() => void discoverChannelsForOffer(offer)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                {isDiscovering ? 'Scanning...' : 'Deep Scan Official Pages'}
              </button>
            </div>

            {offer.channels.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No verified recruiting email or application form was found automatically. Run Deep Scan or add a verified contact manually below.
              </p>
            ) : (
              <div className="space-y-2.5">
                {offer.channels.map((channel) => {
                  const selected = preFlight.selectedChannel?.id === channel.id;
                  const verInfo = formatVerificationLabel(channel);

                  return (
                    <div
                      key={channel.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        selected
                          ? 'border-blue-700 bg-blue-50/40'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_DOSSIER',
                            offerId: offer.id,
                            patch: {
                              selectedChannelId: channel.id,
                              recipientEmail:
                                channel.type === ChannelType.Email && channel.verified
                                  ? channel.target
                                  : null,
                            },
                          })
                        }
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                            {channel.type === ChannelType.Email ? (
                              <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                            )}
                            {channel.label}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {selected ? 'Selected' : 'Select'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-800 break-all mt-1">
                          {channel.target}
                        </div>
                      </button>

                      {/* Channel Provenance Metadata (Zero pills, clean middot line) */}
                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        <span>{formatRoleLabel(channel.channelRole)}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            verInfo.verified ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {verInfo.text}
                        </span>
                        {channel.relevance && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Relevance: {channel.relevance}</span>
                          </>
                        )}
                        {channel.discoveredAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Found {channel.discoveredAt.slice(0, 10)}
                            </span>
                          </>
                        )}
                        {channel.sourceUrl && (
                          <>
                            <span aria-hidden="true">·</span>
                            <a
                              href={channel.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:underline inline-flex items-center gap-0.5"
                            >
                              Source
                              <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                aria-expanded={showCustomChannelForm}
                onClick={() => setShowCustomChannelForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {showCustomChannelForm ? 'Hide custom channel' : 'Add email or form URL'}
              </button>

              {showCustomChannelForm && (
                <form onSubmit={handleAddCustomChannel} className="mt-3 space-y-2.5">
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
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={newChannelVerified}
                      onChange={(e) => setNewChannelVerified(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>I verified this contact on an official company source</span>
                  </label>
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
