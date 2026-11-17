import {
  ApplicationChannel,
  ChannelRelevance,
  ChannelRole,
  ChannelType,
  ChannelVerificationStatus,
} from '../types/domain';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_REGEX = /https?:\/\/[^\s"'<>()]+/g;

export const extractEmailsFromText = (text: string): readonly string[] => {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const normalized = matches
    .map((item) => item.trim().toLowerCase())
    .filter(
      (item) =>
        !item.endsWith('.png') &&
        !item.endsWith('.jpg') &&
        !item.endsWith('.svg') &&
        !item.startsWith('noreply@') &&
        !item.startsWith('no-reply@') &&
        !item.startsWith('donotreply@')
    );
  return Array.from(new Set(normalized));
};

export const extractUrlsFromText = (text: string): readonly string[] => {
  const matches = text.match(URL_REGEX) ?? [];
  const cleaned = matches.map((item) => item.replace(/[.,;!?]+$/, '').trim());
  return Array.from(new Set(cleaned));
};

export const isKnownAtsUrl = (url: string): boolean => {
  const lower = url.toLowerCase();
  return (
    lower.includes('greenhouse.io') ||
    lower.includes('lever.co') ||
    lower.includes('ashbyhq.com') ||
    lower.includes('myworkdayjobs.com') ||
    lower.includes('smartrecruiters.com') ||
    lower.includes('taleez.com') ||
    lower.includes('teamtailor.com') ||
    lower.includes('welcomekit.co')
  );
};

export const classifyAtsPlatform = (url: string): string => {
  const lower = url.toLowerCase();
  if (lower.includes('welcomekit') || lower.includes('welcometothejungle')) {
    return 'Welcome to the Jungle Form';
  }
  if (lower.includes('greenhouse.io')) return 'Greenhouse Application Form';
  if (lower.includes('lever.co')) return 'Lever Application Form';
  if (lower.includes('ashbyhq.com')) return 'Ashby Application Form';
  if (lower.includes('myworkdayjobs.com') || lower.includes('workday')) return 'Workday Career Form';
  if (lower.includes('smartrecruiters.com')) return 'SmartRecruiters Form';
  if (lower.includes('taleez.com')) return 'Taleez Career Form';
  if (lower.includes('teamtailor.com')) return 'Teamtailor Form';
  if (lower.includes('typeform.com') || lower.includes('tally.so') || lower.includes('forms.gle')) {
    return 'Direct Application Form';
  }
  return 'Official Career Page';
};

export const isValidEmailAddress = (email: string): boolean =>
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());

export const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const classifyEmailRelevance = (
  email: string,
  contactName?: string
): { readonly role: ChannelRole; readonly relevance: ChannelRelevance } => {
  const lower = email.toLowerCase();
  const local = lower.split('@')[0] ?? lower;

  if (contactName && contactName.trim().length > 1) {
    return { role: 'recruiter_contact', relevance: 'high' };
  }
  if (local.startsWith('rh') || local.startsWith('hr') || local.includes('drh') || local.includes('people')) {
    return { role: 'hr_contact', relevance: 'high' };
  }
  if (
    /(recrut|recruit|talent|jobs|career|carriere|stage|intern|campus|hiring)/.test(lower)
  ) {
    return { role: 'recruiting_email', relevance: 'high' };
  }
  if (/(support|press|marketing|sales|noreply|no-reply|info)/.test(local)) {
    return { role: 'hr_contact', relevance: 'low' };
  }
  if (/(contact|bonjour|hello|team|equipe)/.test(local)) {
    return { role: 'hr_contact', relevance: 'medium' };
  }
  return { role: 'recruiter_contact', relevance: 'medium' };
};

export const normalizeChannelsFromRaw = (
  offerId: string,
  rawChannels: readonly Partial<ApplicationChannel>[],
  fallbackSourceUrl: string,
  discoveredAtFallback?: string
): readonly ApplicationChannel[] => {
  const discoveredAt = discoveredAtFallback ?? new Date().toISOString();

  const mapped: ApplicationChannel[] = rawChannels
    .filter((ch) => typeof ch.target === 'string' && ch.target.trim().length > 0)
    .map((ch, idx) => {
      const target = (ch.target ?? '').trim();
      const inferredType =
        ch.type ??
        (isValidEmailAddress(target)
          ? ChannelType.Email
          : isValidHttpUrl(target)
            ? ChannelType.Form
            : ChannelType.Portal);

      const emailMeta =
        inferredType === ChannelType.Email
          ? classifyEmailRelevance(target, ch.contactName)
          : null;

      const label =
        ch.label?.trim() ||
        (inferredType === ChannelType.Email
          ? emailMeta?.role === 'hr_contact'
            ? 'HR Contact Email'
            : 'Recruiting Email'
          : classifyAtsPlatform(target));

      // CRITICAL: Never confuse valid email/URL syntax with a verified published contact.
      // Only explicitly verified entries (e.g. scraped from an authorized page / official ATS) are verified: true.
      const isExplicitlyVerified = ch.verified === true;
      const syntaxValid =
        inferredType === ChannelType.Email ? isValidEmailAddress(target) : isValidHttpUrl(target);

      const verificationStatus: ChannelVerificationStatus =
        ch.verificationStatus ??
        (isExplicitlyVerified
          ? inferredType === ChannelType.Form && isKnownAtsUrl(target)
            ? 'verified_ats_form'
            : 'verified_published'
          : syntaxValid
            ? 'candidate_syntax_only'
            : 'unverified');

      const channelRole: ChannelRole =
        ch.channelRole ??
        (inferredType === ChannelType.Email
          ? emailMeta?.role ?? 'recruiting_email'
          : inferredType === ChannelType.Form
            ? 'direct_form'
            : 'official_career_page');

      const relevance: ChannelRelevance =
        ch.relevance ??
        (inferredType === ChannelType.Email
          ? emailMeta?.relevance ?? 'medium'
          : inferredType === ChannelType.Form
            ? 'high'
            : 'medium');

      return {
        id: ch.id?.trim() || `${offerId}_ch_${idx + 1}`,
        type: inferredType,
        target,
        label,
        channelRole,
        contactName: ch.contactName?.trim() || undefined,
        verified: isExplicitlyVerified && syntaxValid,
        verificationStatus,
        relevance,
        sourceUrl: ch.sourceUrl?.trim() || fallbackSourceUrl,
        discoveredAt: ch.discoveredAt?.trim() || discoveredAt,
      };
    });

  const deduplicated = mapped.filter(
    (item, index, arr) =>
      arr.findIndex((other) => other.target.toLowerCase() === item.target.toLowerCase()) === index
  );

  if (deduplicated.length > 0) {
    return deduplicated;
  }

  // Fallback to sourceUrl ONLY if it is a recognized ATS form, otherwise keep as unverified portal reference
  if (isValidHttpUrl(fallbackSourceUrl)) {
    const knownAts = isKnownAtsUrl(fallbackSourceUrl);
    return [
      {
        id: `${offerId}_ch_fallback`,
        type: knownAts ? ChannelType.Form : ChannelType.Portal,
        target: fallbackSourceUrl,
        label: classifyAtsPlatform(fallbackSourceUrl),
        channelRole: knownAts ? 'direct_form' : 'official_career_page',
        verified: knownAts,
        verificationStatus: knownAts ? 'verified_ats_form' : 'unverified',
        relevance: knownAts ? 'high' : 'low',
        sourceUrl: fallbackSourceUrl,
        discoveredAt,
      },
    ];
  }

  return [];
};

const channelPriorityScore = (ch: ApplicationChannel): number => {
  const verifiedScore = ch.verified ? 100 : 0;
  const typeScore =
    ch.type === ChannelType.Email ? 30 : ch.type === ChannelType.Form ? 20 : 5;
  const relScore = ch.relevance === 'high' ? 15 : ch.relevance === 'medium' ? 8 : 2;
  return verifiedScore + typeScore + relScore;
};

export const selectPreferredChannel = (
  channels: readonly ApplicationChannel[],
  preferredId?: string
): ApplicationChannel | undefined => {
  if (preferredId) {
    const explicit = channels.find((ch) => ch.id === preferredId);
    if (explicit) return explicit;
  }
  if (channels.length === 0) return undefined;

  return [...channels].sort((a, b) => channelPriorityScore(b) - channelPriorityScore(a))[0];
};

export const buildMailtoUri = (
  recipientEmail: string,
  subject: string,
  body: string
): string => {
  const safeEmail = recipientEmail.trim();
  const params = new URLSearchParams({
    subject: subject.trim(),
    body: body.trim(),
  });
  // URLSearchParams encodes spaces as '+', whereas mailto clients prefer '%20'
  const query = params.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(safeEmail)}?${query}`;
};

export const verifyChannelReadiness = (
  channel: ApplicationChannel | undefined
): {
  readonly ready: boolean;
  readonly verified: boolean;
  readonly warning?: string;
  readonly reason?: string;
} => {
  if (!channel) {
    return {
      ready: false,
      verified: false,
      reason: 'No application email or form URL found for this offer.',
    };
  }
  if (channel.type === ChannelType.Email) {
    if (!isValidEmailAddress(channel.target)) {
      return {
        ready: false,
        verified: false,
        reason: 'Recruiter email address format is invalid.',
      };
    }
    if (!channel.verified) {
      return {
        ready: false,
        verified: false,
        reason: `Email syntax is valid (${channel.target}), but it is NOT verified on an official source.`,
      };
    }
    return { ready: true, verified: true };
  }

  if (!isValidHttpUrl(channel.target)) {
    return {
      ready: false,
      verified: false,
      reason: 'Application form URL must start with http:// or https://.',
    };
  }

  if (!channel.verified) {
    return {
      ready: false,
      verified: false,
      reason: `Link (${channel.target}) is unverified and has not been confirmed as an active application form.`,
    };
  }

  return { ready: true, verified: true };
};
