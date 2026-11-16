import { ApplicationChannel, ChannelType } from '../types/domain';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_REGEX = /https?:\/\/[^\s"'<>()]+/g;

export const extractEmailsFromText = (text: string): readonly string[] => {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const normalized = matches
    .map((item) => item.trim().toLowerCase())
    .filter((item) => !item.endsWith('.png') && !item.endsWith('.jpg') && !item.endsWith('.svg'));
  return Array.from(new Set(normalized));
};

export const extractUrlsFromText = (text: string): readonly string[] => {
  const matches = text.match(URL_REGEX) ?? [];
  const cleaned = matches.map((item) => item.replace(/[.,;!?]+$/, '').trim());
  return Array.from(new Set(cleaned));
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
  return 'Official Career Form';
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

export const normalizeChannelsFromRaw = (
  offerId: string,
  rawChannels: readonly Partial<ApplicationChannel>[],
  fallbackSourceUrl: string
): readonly ApplicationChannel[] => {
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

      const label =
        ch.label?.trim() ||
        (inferredType === ChannelType.Email
          ? 'Direct Recruiting Email'
          : classifyAtsPlatform(target));

      return {
        id: ch.id?.trim() || `${offerId}_ch_${idx + 1}`,
        type: inferredType,
        target,
        label,
        contactName: ch.contactName?.trim() || undefined,
        verified:
          typeof ch.verified === 'boolean'
            ? ch.verified
            : inferredType === ChannelType.Email
              ? isValidEmailAddress(target)
              : isValidHttpUrl(target),
        sourceUrl: ch.sourceUrl?.trim() || fallbackSourceUrl,
      };
    });

  const deduplicated = mapped.filter(
    (item, index, arr) =>
      arr.findIndex((other) => other.target.toLowerCase() === item.target.toLowerCase()) === index
  );

  if (deduplicated.length > 0) {
    return deduplicated;
  }

  if (isValidHttpUrl(fallbackSourceUrl)) {
    return [
      {
        id: `${offerId}_ch_fallback`,
        type: ChannelType.Form,
        target: fallbackSourceUrl,
        label: classifyAtsPlatform(fallbackSourceUrl),
        verified: true,
        sourceUrl: fallbackSourceUrl,
      },
    ];
  }

  return [];
};

export const selectPreferredChannel = (
  channels: readonly ApplicationChannel[],
  preferredId?: string
): ApplicationChannel | undefined => {
  if (preferredId) {
    const explicit = channels.find((ch) => ch.id === preferredId);
    if (explicit) return explicit;
  }
  const verifiedEmail = channels.find((ch) => ch.type === ChannelType.Email && ch.verified);
  if (verifiedEmail) return verifiedEmail;

  const verifiedForm = channels.find((ch) => ch.type === ChannelType.Form && ch.verified);
  if (verifiedForm) return verifiedForm;

  return channels[0];
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
): { readonly ready: boolean; readonly reason?: string } => {
  if (!channel) {
    return { ready: false, reason: 'No application email or form URL configured.' };
  }
  if (channel.type === ChannelType.Email) {
    return isValidEmailAddress(channel.target)
      ? { ready: true }
      : { ready: false, reason: 'Recruiter email address format is invalid.' };
  }
  return isValidHttpUrl(channel.target)
    ? { ready: true }
    : { ready: false, reason: 'Application form URL must start with http:// or https://.' };
};
