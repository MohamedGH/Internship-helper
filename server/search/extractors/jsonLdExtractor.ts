import * as cheerio from 'cheerio';
import { RawScrapedOffer } from '../types.ts';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const stripHtmlToText = (html: string | undefined | null): string => {
  if (!html) return '';
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, ' ').trim();
};

export const extractExplicitDurationText = (text: string): string | null => {
  const match = text.match(
    /\b(\d{1,2}\s*(?:à|-|to)\s*\d{1,2}\s*(?:mois|months?)|\d{1,2}\s*(?:mois|months?|semaines?|weeks?))\b/i
  );
  return match ? match[1].trim() : null;
};

export const extractExplicitStartDate = (text: string): string | null => {
  const isoMatch = text.match(
    /(?:d[ée]but|start(?:ing)?(?:\s+date)?|à partir d[eu]|dès|from)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (isoMatch) return isoMatch[1];

  const monthMap: Record<string, string> = {
    janvier: '01',
    january: '01',
    jan: '01',
    février: '02',
    fevrier: '02',
    february: '02',
    feb: '02',
    mars: '03',
    march: '03',
    mar: '03',
    avril: '04',
    april: '04',
    apr: '04',
    mai: '05',
    may: '05',
    juin: '06',
    june: '06',
    jun: '06',
    juillet: '07',
    july: '07',
    jul: '07',
    août: '08',
    aout: '08',
    august: '08',
    aug: '08',
    septembre: '09',
    september: '09',
    sep: '09',
    sept: '09',
    octobre: '10',
    october: '10',
    oct: '10',
    novembre: '11',
    november: '11',
    nov: '11',
    décembre: '12',
    decembre: '12',
    december: '12',
    dec: '12',
  };

  const namedMonthMatch = text.match(
    /(?:d[ée]but|start(?:ing)?|dès|à partir de|from)\s*[:\-]?\s*(janvier|january|jan|f[ée]vrier|february|feb|mars|march|mar|avril|april|apr|mai|may|juin|june|jun|juillet|july|jul|ao[ûu]t|august|aug|septembre|september|sept?|octobre|october|oct|novembre|november|nov|d[ée]cembre|december|dec)\s+(20\d{2})/i
  );
  if (namedMonthMatch) {
    const mKey = namedMonthMatch[1].toLowerCase();
    const monthNum = monthMap[mKey];
    if (monthNum) {
      return `${namedMonthMatch[2]}-${monthNum}-01`;
    }
  }

  return null;
};

const flattenJsonLdNodes = (node: unknown): Record<string, unknown>[] => {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap(flattenJsonLdNodes);
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const results: Record<string, unknown>[] = [];
    if (obj['@graph']) {
      results.push(...flattenJsonLdNodes(obj['@graph']));
    }
    const rawType = obj['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (types.some((t) => typeof t === 'string' && t.toLowerCase().includes('jobposting'))) {
      results.push(obj);
    }
    return results;
  }
  return [];
};

const extractLocationFromJobPosting = (node: Record<string, unknown>): string | null => {
  const jobLoc = node.jobLocation;
  const locList = Array.isArray(jobLoc) ? jobLoc : jobLoc ? [jobLoc] : [];
  for (const item of locList) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object') {
      const place = item as Record<string, unknown>;
      if (typeof place.name === 'string' && place.name.trim()) return place.name.trim();
      const addr = place.address as Record<string, unknown> | undefined;
      if (addr && typeof addr === 'object') {
        const parts = [
          typeof addr.addressLocality === 'string' ? addr.addressLocality.trim() : '',
          typeof addr.addressRegion === 'string' ? addr.addressRegion.trim() : '',
          typeof addr.addressCountry === 'string' ? addr.addressCountry.trim() : '',
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  }
  return null;
};

const extractWorkModeFromJobPosting = (
  node: Record<string, unknown>,
  textCorpus: string
): string | null => {
  const locType = String(node.jobLocationType ?? '').toUpperCase();
  if (locType.includes('TELECOMMUTE')) {
    return 'Remote';
  }
  const lower = textCorpus.toLowerCase();
  if (lower.includes('full remote') || lower.includes('100% télétravail')) return 'Remote';
  if (lower.includes('hybride') || lower.includes('hybrid')) return 'Hybrid';
  return null;
};

const extractSkillsFromJobPosting = (node: Record<string, unknown>): string[] => {
  const rawSkills = node.skills ?? node.qualifications;
  if (Array.isArray(rawSkills)) {
    return rawSkills
      .map((item) => (typeof item === 'string' ? stripHtmlToText(item) : ''))
      .filter((item) => item.length > 0 && item.length <= 40);
  }
  if (typeof rawSkills === 'string') {
    return stripHtmlToText(rawSkills)
      .split(/[,;•|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 35)
      .slice(0, 8);
  }
  return [];
};

const resolveUrl = (rawUrl: unknown, pageUrl: string): string => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return pageUrl;
  try {
    return new URL(rawUrl.trim(), pageUrl).toString();
  } catch {
    return pageUrl;
  }
};

export const extractJobPostingsFromJsonLd = (
  html: string,
  pageUrl: string,
  sourceName: string
): readonly RawScrapedOffer[] => {
  const $ = cheerio.load(html);
  const offers: RawScrapedOffer[] = [];

  $('script[type="application/ld+json"]').each((_idx, el) => {
    const rawJson = $(el).text().trim();
    if (!rawJson) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return;
    }

    const postings = flattenJsonLdNodes(parsed);
    for (const node of postings) {
      const title = typeof node.title === 'string' ? node.title.trim() : '';
      if (!title) continue;

      const orgNode = node.hiringOrganization as Record<string, unknown> | string | undefined;
      let organization = '';
      if (typeof orgNode === 'string') {
        organization = orgNode.trim();
      } else if (orgNode && typeof orgNode === 'object') {
        organization = typeof orgNode.name === 'string' ? orgNode.name.trim() : '';
      }
      if (!organization) {
        try {
          organization = new URL(pageUrl).hostname.replace(/^www\./, '').split('.')[0] ?? sourceName;
        } catch {
          organization = sourceName;
        }
      }

      const description = stripHtmlToText(
        typeof node.description === 'string' ? node.description : ''
      );
      const fullCorpus = `${title} ${description}`;
      const originalUrl = resolveUrl(node.url, pageUrl);
      const location = extractLocationFromJobPosting(node);
      const workMode = extractWorkModeFromJobPosting(node, fullCorpus);

      const empTypeRaw = Array.isArray(node.employmentType)
        ? node.employmentType.join(', ')
        : typeof node.employmentType === 'string'
          ? node.employmentType
          : null;

      const emailMatches = description.match(EMAIL_PATTERN) ?? [];
      const applicationEmail =
        emailMatches.find((e) => !e.endsWith('.png') && !e.endsWith('.jpg')) ?? null;

      const postedDate =
        typeof node.datePosted === 'string' && node.datePosted.trim()
          ? node.datePosted.trim().slice(0, 10)
          : null;

      const duration = extractExplicitDurationText(fullCorpus);
      const startDate = extractExplicitStartDate(fullCorpus);
      const skills = extractSkillsFromJobPosting(node);

      const applyUrl =
        typeof node.applicationContact === 'object' &&
        node.applicationContact &&
        typeof (node.applicationContact as Record<string, unknown>).url === 'string'
          ? resolveUrl((node.applicationContact as Record<string, unknown>).url, pageUrl)
          : null;

      offers.push({
        title,
        organization,
        location,
        workMode,
        contractType: empTypeRaw,
        duration,
        postedDate,
        startDate,
        endDate: null,
        skills,
        description: description || null,
        originalUrl,
        applicationUrl: applyUrl,
        applicationEmail,
        source: sourceName,
        isAtsApi: false,
      });
    }
  });

  return offers;
};
