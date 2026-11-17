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
  readonly checks: readonly PreFlightCheckItem[];
  readonly selectedChannel?: ApplicationChannel;
  readonly blockingReason?: string;
}

export interface DispatchBundle {
  readonly mode: 'mailto' | 'form';
  readonly targetLabel: string;
  readonly targetValue: string;
  readonly launchUri: string;
  readonly clipboardText: string;
}

export const isOfferExternallyUnverified = (offer: InternshipOffer): boolean =>
  offer.verificationLevel === 'externally_unverified' ||
  offer.verificationStatus === 'externally_unverified' ||
  offer.verificationStatus === 'unverified_url' ||
  offer.verificationLevel === 'expired' ||
  offer.verificationStatus === 'expired';

export const evaluatePreFlightChecks = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  dossier: PreparedDossier | undefined
): PreFlightReport => {
  const selectedChannel = selectPreferredChannel(offer.channels, dossier?.selectedChannelId);
  const channelStatus = verifyChannelReadiness(selectedChannel);

  const isExpired =
    offer.verificationLevel === 'expired' || offer.verificationStatus === 'expired';
  const isOfferVerified = !isOfferExternallyUnverified(offer);
  const hasProfile =
    profile.fullName.trim().length > 1 && profile.email.trim().includes('@');
  const hasLetter = Boolean(dossier && dossier.coverLetter.trim().length >= 80);
  const hasSubject = Boolean(dossier && dossier.emailSubject.trim().length >= 5);
  const hasCvHighlights = Boolean(dossier && dossier.cvTailoringHighlights.length > 0);

  const checks: PreFlightCheckItem[] = [
    {
      id: 'offer_verified',
      label: 'Offer Verification & Legality',
      passed: isOfferVerified,
      detail: isOfferVerified
        ? 'Verified or legally collected listing'
        : isExpired
          ? 'This listing is expired and cannot be dispatched.'
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
      label: 'Adapted Lettre de Motivation',
      passed: hasLetter && hasSubject,
      detail:
        hasLetter && hasSubject
          ? `${dossier?.coverLetter.trim().length ?? 0} chars ready`
          : 'Generate or write a cover letter (at least 80 characters).',
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
      label: 'Application Channel (Email / Form)',
      passed: channelStatus.ready,
      detail: channelStatus.ready
        ? `${selectedChannel?.label}: ${selectedChannel?.target}`
        : (channelStatus.reason ?? 'Verify an email or form URL.'),
    },
  ];

  const firstFailed = checks.find((item) => !item.passed);

  return {
    readyToSend: checks.every((item) => item.passed),
    checks,
    selectedChannel,
    blockingReason: firstFailed?.detail,
  };
};

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
  const clipboardText = formatDossierForClipboard(offer, dossier, profile);

  if (channel.type === ChannelType.Email) {
    return {
      mode: 'mailto',
      targetLabel: channel.label,
      targetValue: channel.target,
      launchUri: buildMailtoUri(channel.target, dossier.emailSubject, dossier.coverLetter),
      clipboardText,
    };
  }

  return {
    mode: 'form',
    targetLabel: channel.label,
    targetValue: channel.target,
    launchUri: channel.target,
    clipboardText,
  };
};
