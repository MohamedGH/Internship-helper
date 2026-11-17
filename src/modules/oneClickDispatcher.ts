import {
  ApplicationChannel,
  CandidateProfile,
  ChannelType,
  InternshipOffer,
  PreparedDossier,
} from '../types/domain';
import { buildMailtoUri, selectPreferredChannel, verifyChannelReadiness } from './channelFinder';

export interface PreFlightCheckItem {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface PreFlightReport {
  readonly readyToSend: boolean;
  readonly channelVerified: boolean;
  readonly checks: readonly PreFlightCheckItem[];
  readonly selectedChannel?: ApplicationChannel;
  readonly blockingReason?: string;
}

export interface DispatchBundle {
  readonly mode: 'mailto' | 'form';
  readonly targetLabel: string;
  readonly targetValue: string;
  readonly recipientEmail: string | null;
  readonly launchUri: string;
  readonly clipboardText: string;
  readonly clipboardEmailText: string;
  readonly clipboardLetterText: string;
}

export const isOfferExternallyUnverified = (offer: InternshipOffer): boolean =>
  offer.verificationLevel === 'externally_unverified' ||
  offer.verificationStatus === 'externally_unverified' ||
  offer.verificationStatus === 'unverified_url' ||
  offer.verificationLevel === 'expired' ||
  offer.verificationStatus === 'expired' ||
  offer.contentAccessible === false;

export const evaluatePreFlightChecks = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  dossier: PreparedDossier | undefined
): PreFlightReport => {
  const selectedChannel = selectPreferredChannel(offer.channels, dossier?.selectedChannelId);
  const channelStatus = verifyChannelReadiness(selectedChannel);

  const isExpired =
    offer.verificationLevel === 'expired' || offer.verificationStatus === 'expired';
  const isInaccessible = offer.contentAccessible === false;
  const isOfferVerified = !isOfferExternallyUnverified(offer);
  const hasProfile =
    profile.fullName.trim().length > 1 && profile.email.trim().includes('@');
  const hasLetter = Boolean(dossier && dossier.coverLetter.trim().length >= 80);
  const hasEmailDraft = Boolean(
    dossier &&
      (dossier.emailBody.trim().length >= 40 || dossier.formCoverNote.trim().length >= 30)
  );
  const hasSubject = Boolean(dossier && dossier.emailSubject.trim().length >= 5);
  const hasCvHighlights = Boolean(dossier && dossier.cvTailoringHighlights.length > 0);

  const checks: PreFlightCheckItem[] = [
    {
      id: 'offer_verified',
      label: 'Offer Accessibility & Verification',
      passed: isOfferVerified,
      detail: isOfferVerified
        ? 'Listing content accessible and legally collected'
        : isExpired
          ? 'This listing is expired and cannot be dispatched.'
          : isInaccessible
            ? 'Listing content not accessible automatically — verify details on the original site before applying.'
            : 'Unverified external discovery link — inspect original job board before applying.',
    },
    {
      id: 'cv_profile',
      label: 'Candidate CV & Contact Info',
      passed: hasProfile,
      detail: hasProfile
        ? `${profile.fullName} · ${profile.email}`
        : 'Add your full name and email in CV Profile.',
    },
    {
      id: 'cover_letter',
      label: 'Lettre de Motivation (Personalized)',
      passed: hasLetter,
      detail: hasLetter
        ? `${dossier?.coverLetter.trim().length ?? 0} chars ready`
        : 'Generate or write a personalized cover letter (at least 80 characters).',
    },
    {
      id: 'application_email',
      label:
        selectedChannel?.type === ChannelType.Form
          ? 'Form Companion Message'
          : 'Application Email & Subject',
      passed: hasEmailDraft && hasSubject,
      detail:
        hasEmailDraft && hasSubject
          ? `Subject + ${selectedChannel?.type === ChannelType.Form ? 'form note' : 'concise email'} ready`
          : 'Complete the email subject and message body.',
    },
    {
      id: 'cv_tailoring',
      label: 'CV Adaptation Highlights',
      passed: hasCvHighlights,
      detail: hasCvHighlights
        ? `${dossier?.matchedSkills.length ?? 0} matched skills highlighted`
        : 'Prepare dossier to compute CV highlights.',
    },
    {
      id: 'channel_verified',
      label: 'Verified Application Channel',
      passed: channelStatus.ready && channelStatus.verified,
      detail:
        channelStatus.ready && channelStatus.verified
          ? `${selectedChannel?.label}: ${selectedChannel?.target} (Verified)`
          : (channelStatus.reason ?? 'Verify a published recruiting email or direct form URL.'),
    },
  ];

  const firstFailed = checks.find((item) => !item.passed);

  return {
    readyToSend: checks.every((item) => item.passed),
    channelVerified: channelStatus.verified,
    checks,
    selectedChannel,
    blockingReason: firstFailed?.detail,
  };
};

export const formatEmailForClipboard = (
  dossier: PreparedDossier,
  recipientEmail?: string | null
): string =>
  [
    ...(recipientEmail ? [`To: ${recipientEmail}`] : []),
    `Subject: ${dossier.emailSubject}`,
    '',
    (dossier.emailBody || '').trim(),
  ].join('\n');

export const formatDossierForClipboard = (
  offer: InternshipOffer,
  dossier: PreparedDossier,
  profile: CandidateProfile
): string =>
  [
    `Subject: ${dossier.emailSubject}`,
    `Organization: ${offer.organization} — ${offer.title}`,
    `Candidate: ${profile.fullName} (${profile.email})`,
    '',
    dossier.coverLetter.trim(),
  ].join('\n');

export const buildDispatchBundle = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  dossier: PreparedDossier
): DispatchBundle | null => {
  const report = evaluatePreFlightChecks(offer, profile, dossier);
  if (!report.readyToSend || !report.selectedChannel) {
    return null;
  }

  const channel = report.selectedChannel;
  const clipboardLetterText = formatDossierForClipboard(offer, dossier, profile);
  const clipboardEmailText = formatEmailForClipboard(
    dossier,
    channel.type === ChannelType.Email ? channel.target : dossier.recipientEmail
  );

  if (channel.type === ChannelType.Email) {
    const bodyToSend = dossier.emailBody.trim() || dossier.coverLetter.trim();
    return {
      mode: 'mailto',
      targetLabel: channel.label,
      targetValue: channel.target,
      recipientEmail: channel.target,
      launchUri: buildMailtoUri(channel.target, dossier.emailSubject, bodyToSend),
      clipboardText: clipboardEmailText,
      clipboardEmailText,
      clipboardLetterText,
    };
  }

  const noteText = dossier.formCoverNote.trim() || dossier.coverLetter.trim();
  return {
    mode: 'form',
    targetLabel: channel.label,
    targetValue: channel.target,
    recipientEmail: dossier.recipientEmail,
    launchUri: channel.target,
    clipboardText: noteText,
    clipboardEmailText,
    clipboardLetterText,
  };
};
