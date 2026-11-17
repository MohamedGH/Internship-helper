import * as cheerio from 'cheerio';
import {
  extractAtsFormLinksFromHtml,
  extractContactFormsFromHtml,
  extractEmailsFromHtml,
  extractOfficialContactAndCareerLinks,
} from './extractors/htmlExtractor.ts';
import {
  extractApplicationContactsFromJsonLd,
  extractJobPostingsFromJsonLd,
} from './extractors/jsonLdExtractor.ts';
import { findJobBoardByDomain } from './jobboards/jobBoardRegistry.ts';
import { checkRobotsAllowance } from './security/robotsGuard.ts';
import { assertSafePublicUrl } from './security/urlGuard.ts';
import { fetchWithRetry } from './utils/httpClient.ts';

export type ChannelRole =
  | 'direct_form'
  | 'recruiting_email'
  | 'hr_contact'
  | 'recruiter_contact'
  | 'official_career_page'
  | 'company_contact_form';

export type ChannelVerificationStatus =
  | 'verified_published'
  | 'verified_ats_form'
  | 'candidate_syntax_only'
  | 'unverified';

export type ChannelRelevance = 'high' | 'medium' | 'low';

export interface ScrapedChannelResult {
  readonly type: 'email' | 'form' | 'portal';
  readonly target: string;
  readonly label: string;
  readonly channelRole: ChannelRole;
  readonly contactName?: string;
  readonly verified: boolean;
  readonly verificationStatus: ChannelVerificationStatus;
  readonly relevance: ChannelRelevance;
  readonly sourceUrl: string;
  readonly discoveredAt: string;
}

const HIGH_RELEVANCE_EMAIL_KEYWORDS = [
  'recrut',
  'recruit',
  'talent',
  'jobs',
  'career',
  'carriere',
  'stage',
  'intern',
  'campus',
  'hiring',
  'people',
  'rh@',
  'hr@',
  'drh',
];

const MEDIUM_RELEVANCE_EMAIL_KEYWORDS = ['contact', 'bonjour', 'hello', 'team', 'equipe'];
const LOW_RELEVANCE_EMAIL_KEYWORDS = ['support', 'press', 'marketing', 'sales', 'noreply', 'no-reply', 'info'];

const ATS_PLATFORM_LABELS: ReadonlyArray<{ readonly pattern: string; readonly label: string }> = [
  { pattern: 'greenhouse.io', label: 'Greenhouse Application Form' },
  { pattern: 'lever.co', label: 'Lever Application Form' },
  { pattern: 'ashbyhq.com', label: 'Ashby Application Form' },
  { pattern: 'welcomekit.co', label: 'WelcomeKit Application Form' },
  { pattern: 'myworkdayjobs.com', label: 'Workday Career Form' },
  { pattern: 'smartrecruiters.com', label: 'SmartRecruiters Form' },
  { pattern: 'taleez.com', label: 'Taleez Application Form' },
  { pattern: 'teamtailor.com', label: 'Teamtailor Application Form' },
];

export const classifyDiscoveredEmail = (
  email: string,
  organization: string,
  contactName?: string
): {
  readonly channelRole: ChannelRole;
  readonly relevance: ChannelRelevance;
  readonly label: string;
} => {
  const lower = email.toLowerCase();
  const local = lower.split('@')[0] ?? lower;

  if (contactName && contactName.trim().length > 1) {
    return {
      channelRole: 'recruiter_contact',
      relevance: 'high',
      label: `${contactName.trim()} (${organization})`,
    };
  }

  if (local.startsWith('rh') || local.startsWith('hr') || local.includes('drh') || local.includes('people')) {
    return {
      channelRole: 'hr_contact',
      relevance: 'high',
      label: `${organization} HR Contact`,
    };
  }

  if (HIGH_RELEVANCE_EMAIL_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      channelRole: 'recruiting_email',
      relevance: 'high',
      label: `${organization} Recruiting Inbox`,
    };
  }

  if (LOW_RELEVANCE_EMAIL_KEYWORDS.some((kw) => local.includes(kw))) {
    return {
      channelRole: 'hr_contact',
      relevance: 'low',
      label: `${organization} General Inbox`,
    };
  }

  if (MEDIUM_RELEVANCE_EMAIL_KEYWORDS.some((kw) => local.includes(kw))) {
    return {
      channelRole: 'hr_contact',
      relevance: 'medium',
      label: `${organization} Official Contact Email`,
    };
  }

  return {
    channelRole: 'recruiter_contact',
    relevance: 'medium',
    label: `${organization} Published Email`,
  };
};

const detectAtsLabel = (url: string): string | null => {
  const lower = url.toLowerCase();
  const found = ATS_PLATFORM_LABELS.find((item) => lower.includes(item.pattern));
  return found ? found.label : null;
};

const isProhibitedJobBoardUrl = (url: string): boolean => {
  const board = findJobBoardByDomain(url);
  if (!board) return false;
  return (
    board.accessMode === 'link_only' ||
    board.accessMode === 'disabled' ||
    board.authorizationStatus === 'prohibited_without_agreement' ||
    board.authorizationStatus === 'requires_written_agreement'
  );
};

const relevanceRank = (rel: ChannelRelevance): number =>
  rel === 'high' ? 3 : rel === 'medium' ? 2 : 1;

const roleRank = (role: ChannelRole): number => {
  switch (role) {
    case 'recruiting_email':
      return 6;
    case 'recruiter_contact':
      return 5;
    case 'direct_form':
      return 4;
    case 'hr_contact':
      return 3;
    case 'official_career_page':
      return 2;
    case 'company_contact_form':
      return 1;
  }
};

export interface ChannelDiscoveryOptions {
  readonly fetchFn?: typeof fetch;
  readonly skipSecurityForTest?: boolean;
  readonly nowIso?: string;
}

export const discoverChannelsFromUrl = async (
  input: {
    readonly organization: string;
    readonly title: string;
    readonly sourceUrl?: string;
    readonly applicationUrl?: string;
    readonly companyUrl?: string;
  },
  options: ChannelDiscoveryOptions = {}
): Promise<readonly ScrapedChannelResult[]> => {
  const discoveredAt = options.nowIso ?? new Date().toISOString();
  const discovered: ScrapedChannelResult[] = [];
  const seenTargets = new Map<string, number>();

  const pushOrUpgrade = (channel: ScrapedChannelResult) => {
    const key = channel.target.toLowerCase().trim();
    const existingIdx = seenTargets.get(key);
    if (existingIdx === undefined) {
      seenTargets.set(key, discovered.length);
      discovered.push(channel);
      return;
    }
    const prev = discovered[existingIdx];
    const nextScore = relevanceRank(channel.relevance) * 10 + roleRank(channel.channelRole);
    const prevScore = relevanceRank(prev.relevance) * 10 + roleRank(prev.channelRole);
    if (nextScore > prevScore) {
      discovered[existingIdx] = channel;
    }
  };

  const primaryCandidates = [input.applicationUrl, input.sourceUrl, input.companyUrl].filter(
    (u): u is string => typeof u === 'string' && u.startsWith('http')
  );

  const visitedUrls = new Set<string>();
  const secondaryCompanyUrls: string[] = [];

  const canFetchAuthorizedUrl = async (
    rawUrl: string
  ): Promise<{ readonly allowed: boolean; readonly normalizedUrl?: string }> => {
    if (isProhibitedJobBoardUrl(rawUrl)) {
      return { allowed: false };
    }
    if (options.skipSecurityForTest) {
      return { allowed: true, normalizedUrl: rawUrl };
    }
    const safeCheck = await assertSafePublicUrl(rawUrl);
    if (!safeCheck.safe || !safeCheck.normalizedUrl) {
      return { allowed: false };
    }
    const robots = await checkRobotsAllowance(safeCheck.normalizedUrl);
    if (!robots.allowed) {
      return { allowed: false };
    }
    return { allowed: true, normalizedUrl: safeCheck.normalizedUrl };
  };

  const fetchHtmlPage = async (url: string): Promise<{ url: string; bodyText: string } | null> => {
    if (options.fetchFn) {
      const res = await options.fetchFn(url, { headers: { Accept: 'text/html' } });
      if (!res.ok) return null;
      return { url: res.url || url, bodyText: await res.text() };
    }
    const res = await fetchWithRetry(url, { timeoutMs: 6500, retries: 0 });
    if (!res.ok) return null;
    return { url: res.url, bodyText: res.bodyText };
  };

  const scanAuthorizedPage = async (targetUrl: string, isSecondary: boolean) => {
    const authCheck = await canFetchAuthorizedUrl(targetUrl);
    if (!authCheck.allowed || !authCheck.normalizedUrl) return;
    const normalizedUrl = authCheck.normalizedUrl;

    if (visitedUrls.has(normalizedUrl)) return;
    visitedUrls.add(normalizedUrl);

    const atsLabel = detectAtsLabel(normalizedUrl);
    if (atsLabel) {
      pushOrUpgrade({
        type: 'form',
        target: normalizedUrl,
        label: atsLabel,
        channelRole: 'direct_form',
        verified: true,
        verificationStatus: 'verified_ats_form',
        relevance: 'high',
        sourceUrl: normalizedUrl,
        discoveredAt,
      });
    }

    try {
      const page = await fetchHtmlPage(normalizedUrl);
      if (!page) return;

      const $ = cheerio.load(page.bodyText);

      // 1. JSON-LD JobPosting + applicationContact + hiringOrganization URLs
      const jsonLdOffers = extractJobPostingsFromJsonLd(
        page.bodyText,
        page.url,
        input.organization
      );
      for (const offer of jsonLdOffers) {
        if (offer.applicationEmail) {
          const emailMeta = classifyDiscoveredEmail(offer.applicationEmail, input.organization);
          pushOrUpgrade({
            type: 'email',
            target: offer.applicationEmail,
            label: emailMeta.label,
            channelRole: emailMeta.channelRole,
            verified: true,
            verificationStatus: 'verified_published',
            relevance: emailMeta.relevance,
            sourceUrl: page.url,
            discoveredAt,
          });
        }
        if (offer.applicationUrl) {
          const formAtsLabel = detectAtsLabel(offer.applicationUrl);
          pushOrUpgrade({
            type: 'form',
            target: offer.applicationUrl,
            label: formAtsLabel ?? 'Official Application Form',
            channelRole: 'direct_form',
            verified: true,
            verificationStatus: formAtsLabel ? 'verified_ats_form' : 'verified_published',
            relevance: 'high',
            sourceUrl: page.url,
            discoveredAt,
          });
        }
      }

      const jsonLdContacts = extractApplicationContactsFromJsonLd(page.bodyText, page.url);
      for (const item of jsonLdContacts.emails) {
        const emailMeta = classifyDiscoveredEmail(
          item.email,
          input.organization,
          item.contactName
        );
        pushOrUpgrade({
          type: 'email',
          target: item.email,
          label: emailMeta.label,
          channelRole: emailMeta.channelRole,
          contactName: item.contactName,
          verified: true,
          verificationStatus: 'verified_published',
          relevance: 'high',
          sourceUrl: page.url,
          discoveredAt,
        });
      }
      for (const applyUrl of jsonLdContacts.applyUrls) {
        const formAtsLabel = detectAtsLabel(applyUrl);
        pushOrUpgrade({
          type: 'form',
          target: applyUrl,
          label: formAtsLabel ?? 'Direct Application Form',
          channelRole: 'direct_form',
          verified: true,
          verificationStatus: formAtsLabel ? 'verified_ats_form' : 'verified_published',
          relevance: 'high',
          sourceUrl: page.url,
          discoveredAt,
        });
      }

      // 2. HTML Published Emails (recruiting, HR, contact)
      for (const email of extractEmailsFromHtml($).slice(0, 5)) {
        const emailMeta = classifyDiscoveredEmail(email, input.organization);
        pushOrUpgrade({
          type: 'email',
          target: email,
          label: emailMeta.label,
          channelRole: emailMeta.channelRole,
          verified: true,
          verificationStatus: 'verified_published',
          relevance: emailMeta.relevance,
          sourceUrl: page.url,
          discoveredAt,
        });
      }

      // 3. ATS Direct Form Links
      for (const atsUrl of extractAtsFormLinksFromHtml($, page.url).slice(0, 4)) {
        const detectedLabel = detectAtsLabel(atsUrl) ?? 'Detected ATS Application Form';
        pushOrUpgrade({
          type: 'form',
          target: atsUrl,
          label: detectedLabel,
          channelRole: 'direct_form',
          verified: true,
          verificationStatus: 'verified_ats_form',
          relevance: 'high',
          sourceUrl: page.url,
          discoveredAt,
        });
      }

      // 4. HTML Application / Company Contact <form>
      for (const form of extractContactFormsFromHtml($, page.url).slice(0, 3)) {
        pushOrUpgrade({
          type: 'form',
          target: form.actionUrl,
          label: form.label,
          channelRole: form.isApplicationForm ? 'direct_form' : 'company_contact_form',
          verified: true,
          verificationStatus: 'verified_published',
          relevance: form.isApplicationForm ? 'high' : 'medium',
          sourceUrl: page.url,
          discoveredAt,
        });
      }

      // 5. Discover secondary official career & contact pages on first pass
      if (!isSecondary) {
        const officialLinks = extractOfficialContactAndCareerLinks($, page.url);
        for (const careerUrl of officialLinks.careerPages.slice(0, 2)) {
          pushOrUpgrade({
            type: 'portal',
            target: careerUrl,
            label: `${input.organization} Official Career Page`,
            channelRole: 'official_career_page',
            verified: true,
            verificationStatus: 'verified_published',
            relevance: 'medium',
            sourceUrl: page.url,
            discoveredAt,
          });
          secondaryCompanyUrls.push(careerUrl);
        }
        for (const contactUrl of officialLinks.contactPages.slice(0, 2)) {
          secondaryCompanyUrls.push(contactUrl);
        }
        for (const orgUrl of jsonLdContacts.organizationUrls.slice(0, 1)) {
          secondaryCompanyUrls.push(orgUrl);
        }
      }
    } catch {
      // Non-blocking per-URL channel scan
    }
  };

  for (const url of primaryCandidates) {
    // Even if an ATS link is inside applicationUrl/sourceUrl and is prohibited only for HTML scraping,
    // recognize official ATS links directly.
    const atsLabel = detectAtsLabel(url);
    if (atsLabel) {
      pushOrUpgrade({
        type: 'form',
        target: url,
        label: atsLabel,
        channelRole: 'direct_form',
        verified: true,
        verificationStatus: 'verified_ats_form',
        relevance: 'high',
        sourceUrl: url,
        discoveredAt,
      });
    }
    await scanAuthorizedPage(url, false);
  }

  // Explore up to 3 authorized company career/contact pages discovered from the primary pages
  for (const secUrl of Array.from(new Set(secondaryCompanyUrls)).slice(0, 3)) {
    await scanAuthorizedPage(secUrl, true);
  }

  return [...discovered].sort((a, b) => {
    const scoreA = relevanceRank(a.relevance) * 10 + roleRank(a.channelRole);
    const scoreB = relevanceRank(b.relevance) * 10 + roleRank(b.channelRole);
    return scoreB - scoreA;
  });
};
