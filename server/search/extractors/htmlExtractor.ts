import * as cheerio from 'cheerio';
import { CustomSourceSelectors, RawScrapedOffer } from '../types.ts';
import {
  extractExplicitDurationText,
  extractExplicitStartDate,
  stripHtmlToText,
} from './jsonLdExtractor.ts';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const KNOWN_ATS_HOSTS = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'jobs.ashbyhq.com',
  'welcomekit.co',
  'teamtailor.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'taleez.com',
];

const JOB_LINK_KEYWORDS = [
  'stage',
  'intern',
  'internship',
  'apprenti',
  'pfe',
  'job',
  'jobs',
  'offre',
  'offer',
  'position',
  'career',
  'emploi',
];

const resolveSafeHref = (href: string | undefined, baseUrl: string): string | null => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:')) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
};

export const extractCompanyFromPage = ($: cheerio.CheerioAPI, pageUrl: string): string => {
  const ogSiteName = $('meta[property="og:site_name"]').attr('content')?.trim();
  if (ogSiteName && ogSiteName.length >= 2 && ogSiteName.length <= 60) {
    return ogSiteName;
  }
  const titleText = $('title').text().trim();
  if (titleText) {
    const firstPart = titleText.split(/\s[|\-–—]\s/)[0]?.trim();
    if (firstPart && firstPart.length >= 2 && firstPart.length <= 50) {
      return firstPart;
    }
  }
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '');
    const stem = host.split('.')[0] ?? 'Company';
    return stem.charAt(0).toUpperCase() + stem.slice(1);
  } catch {
    return 'Company';
  }
};

export const extractEmailsFromHtml = ($: cheerio.CheerioAPI): readonly string[] => {
  const emails = new Set<string>();

  $('a[href^="mailto:"]').each((_idx, el) => {
    const href = $(el).attr('href') ?? '';
    const addr = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (addr.includes('@') && !addr.includes('example.')) {
      emails.add(addr);
    }
  });

  const bodyText = $('body').text();
  const matches = bodyText.match(EMAIL_PATTERN) ?? [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (
      !lower.endsWith('.png') &&
      !lower.endsWith('.jpg') &&
      !lower.endsWith('.svg') &&
      !lower.includes('example.') &&
      !lower.includes('sentry.io')
    ) {
      emails.add(lower);
    }
  }

  return Array.from(emails);
};

export const extractAtsFormLinksFromHtml = (
  $: cheerio.CheerioAPI,
  pageUrl: string
): readonly string[] => {
  const links = new Set<string>();
  $('a[href]').each((_idx, el) => {
    const resolved = resolveSafeHref($(el).attr('href'), pageUrl);
    if (!resolved) return;
    const lower = resolved.toLowerCase();
    if (KNOWN_ATS_HOSTS.some((host) => lower.includes(host))) {
      links.add(resolved);
    }
  });
  return Array.from(links);
};

export const extractOffersWithSelectors = (
  html: string,
  pageUrl: string,
  sourceName: string,
  selectors: CustomSourceSelectors
): readonly RawScrapedOffer[] => {
  if (!selectors.jobListSelector) return [];
  const $ = cheerio.load(html);
  const defaultCompany = extractCompanyFromPage($, pageUrl);
  const pageEmails = extractEmailsFromHtml($);
  const offers: RawScrapedOffer[] = [];

  $(selectors.jobListSelector).each((_idx, card) => {
    const $card = $(card);
    const titleEl = selectors.titleSelector ? $card.find(selectors.titleSelector).first() : $card;
    const title = titleEl.text().replace(/\s+/g, ' ').trim();
    if (!title || title.length < 3) return;

    const company = selectors.companySelector
      ? $card.find(selectors.companySelector).first().text().replace(/\s+/g, ' ').trim() ||
        defaultCompany
      : defaultCompany;

    const location = selectors.locationSelector
      ? $card.find(selectors.locationSelector).first().text().replace(/\s+/g, ' ').trim() || null
      : null;

    const linkHref = selectors.linkSelector
      ? $card.find(selectors.linkSelector).first().attr('href')
      : $card.is('a')
        ? $card.attr('href')
        : $card.find('a[href]').first().attr('href');
    const originalUrl = resolveSafeHref(linkHref, pageUrl) ?? pageUrl;

    const description = selectors.descriptionSelector
      ? stripHtmlToText($card.find(selectors.descriptionSelector).first().html() ?? $card.text())
      : stripHtmlToText($card.text());

    const dateText = selectors.dateSelector
      ? $card.find(selectors.dateSelector).first().text().trim()
      : '';
    const durationText = selectors.durationSelector
      ? $card.find(selectors.durationSelector).first().text().trim()
      : '';
    const cardEmailText = selectors.emailSelector
      ? $card.find(selectors.emailSelector).first().text().trim()
      : '';

    const cardEmails = cardEmailText.match(EMAIL_PATTERN) ?? $card.text().match(EMAIL_PATTERN) ?? [];
    const applicationEmail = cardEmails[0] ?? pageEmails[0] ?? null;

    const fullText = `${title} ${description}`;
    const duration = durationText || extractExplicitDurationText(fullText);
    const startDate = extractExplicitStartDate(fullText);
    const postedDate =
      dateText && /^\d{4}-\d{2}-\d{2}/.test(dateText) ? dateText.slice(0, 10) : null;

    let workMode: string | null = null;
    const lower = fullText.toLowerCase();
    if (lower.includes('remote') || lower.includes('télétravail')) workMode = 'Remote';
    else if (lower.includes('hybride') || lower.includes('hybrid')) workMode = 'Hybrid';

    offers.push({
      title,
      organization: company,
      location,
      workMode,
      contractType: lower.includes('stage') || lower.includes('intern') ? 'Internship' : null,
      duration,
      postedDate,
      startDate,
      endDate: null,
      skills: [],
      description: description || null,
      originalUrl,
      applicationUrl: null,
      applicationEmail,
      source: sourceName,
      isAtsApi: false,
    });
  });

  return offers;
};

export const extractOffersHeuristicallyFromHtml = (
  html: string,
  pageUrl: string,
  sourceName: string
): readonly RawScrapedOffer[] => {
  const $ = cheerio.load(html);
  const defaultCompany = extractCompanyFromPage($, pageUrl);
  const pageEmails = extractEmailsFromHtml($);
  const atsLinks = extractAtsFormLinksFromHtml($, pageUrl);
  const offers: RawScrapedOffer[] = [];
  const seenUrls = new Set<string>();

  const candidateSelectors = [
    'article',
    '[class*="job"]',
    '[class*="offer"]',
    '[class*="position"]',
    '[class*="opening"]',
    'li a[href]',
    'a[href]',
  ];

  for (const selector of candidateSelectors) {
    $(selector).each((_idx, el) => {
      if (offers.length >= 25) return;

      const $el = $(el);
      const $anchor = $el.is('a') ? $el : $el.find('a[href]').first();
      const resolvedUrl = resolveSafeHref($anchor.attr('href'), pageUrl);
      if (!resolvedUrl || seenUrls.has(resolvedUrl)) return;

      const headingText = $el.find('h1, h2, h3, h4').first().text().replace(/\s+/g, ' ').trim();
      const anchorText = $anchor.text().replace(/\s+/g, ' ').trim();
      const title = headingText || anchorText;

      if (!title || title.length < 5 || title.length > 140) return;

      const combinedLower = `${title} ${resolvedUrl}`.toLowerCase();
      const looksRelevant = JOB_LINK_KEYWORDS.some((kw) => combinedLower.includes(kw));
      if (!looksRelevant) return;

      seenUrls.add(resolvedUrl);

      const blockText = $el.text().replace(/\s+/g, ' ').trim();
      const blockEmails = blockText.match(EMAIL_PATTERN) ?? [];
      const applicationEmail = blockEmails[0] ?? pageEmails[0] ?? null;

      let workMode: string | null = null;
      const lowerBlock = blockText.toLowerCase();
      if (lowerBlock.includes('remote') || lowerBlock.includes('télétravail')) workMode = 'Remote';
      else if (lowerBlock.includes('hybride') || lowerBlock.includes('hybrid')) workMode = 'Hybrid';

      const atsLink = atsLinks.find((link) => link === resolvedUrl) ?? null;

      offers.push({
        title,
        organization: defaultCompany,
        location: null,
        workMode,
        contractType:
          lowerBlock.includes('stage') || lowerBlock.includes('intern') ? 'Internship' : null,
        duration: extractExplicitDurationText(blockText),
        postedDate: null,
        startDate: extractExplicitStartDate(blockText),
        endDate: null,
        skills: [],
        description: blockText !== title ? blockText.slice(0, 500) : null,
        originalUrl: resolvedUrl,
        applicationUrl: atsLink,
        applicationEmail,
        source: sourceName,
        isAtsApi: false,
      });
    });

    if (offers.length > 0) break;
  }

  return offers;
};

export interface DetailPageMetadata {
  readonly description: string | null;
  readonly applicationEmail: string | null;
  readonly applicationUrl: string | null;
  readonly duration: string | null;
  readonly startDate: string | null;
}

export const extractDetailPageMetadata = (
  html: string,
  detailUrl: string
): DetailPageMetadata => {
  const $ = cheerio.load(html);
  const emails = extractEmailsFromHtml($);
  const atsLinks = extractAtsFormLinksFromHtml($, detailUrl);
  const mainText = stripHtmlToText(
    $('main').html() || $('article').html() || $('body').html() || ''
  );

  return {
    description: mainText ? mainText.slice(0, 1500) : null,
    applicationEmail: emails[0] ?? null,
    applicationUrl: atsLinks[0] ?? null,
    duration: mainText ? extractExplicitDurationText(mainText) : null,
    startDate: mainText ? extractExplicitStartDate(mainText) : null,
  };
};
