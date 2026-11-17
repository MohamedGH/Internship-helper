import crypto from 'node:crypto';
import { parseDurationMonths } from '../../src/modules/sourceAggregator.ts';
import {
  NormalizedScrapedOffer,
  RawScrapedOffer,
  WorkModeValue,
} from './types.ts';
import { verifyScrapedOffer } from './validators/offerVerifier.ts';

const TECH_SKILLS_DICTIONARY = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Vue',
  'Angular',
  'Node.js',
  'Python',
  'Java',
  'Go',
  'Rust',
  'C++',
  'C#',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Docker',
  'Kubernetes',
  'AWS',
  'GCP',
  'Azure',
  'PyTorch',
  'TensorFlow',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'LLM',
  'Power BI',
  'Tableau',
  'dbt',
  'Spark',
  'Airflow',
  'Snowflake',
  'BigQuery',
  'GraphQL',
  'REST',
  'Git',
  'CI/CD',
  'Tailwind',
];

export const extractSkillsFromCorpus = (
  explicitSkills: readonly string[] | undefined,
  corpus: string
): readonly string[] => {
  const result = new Set<string>(
    (explicitSkills ?? []).map((s) => s.trim()).filter((s) => s.length >= 2)
  );
  const lower = corpus.toLowerCase();

  for (const skill of TECH_SKILLS_DICTIONARY) {
    const token = skill.toLowerCase();
    if (token === 'go') {
      if (/\bgolang\b|\bgo\b/.test(corpus)) result.add('Go');
    } else if (token === 'c++' || token === 'c#') {
      if (lower.includes(token)) result.add(skill);
    } else if (lower.includes(token)) {
      result.add(skill);
    }
  }

  return Array.from(result).slice(0, 12);
};

export const normalizeWorkMode = (
  rawMode: string | null | undefined,
  corpus: string
): WorkModeValue => {
  const combined = `${rawMode ?? ''} ${corpus}`.toLowerCase();
  if (
    combined.includes('full remote') ||
    combined.includes('100% remote') ||
    combined.includes('100% télétravail') ||
    rawMode?.toLowerCase() === 'remote'
  ) {
    return 'Remote';
  }
  if (
    combined.includes('hybrid') ||
    combined.includes('hybride') ||
    combined.includes('télétravail partiel')
  ) {
    return 'Hybrid';
  }
  if (combined.includes('remote') || combined.includes('télétravail')) {
    return 'Remote';
  }
  return 'On-site';
};

const extractLanguagesFromCorpus = (
  explicit: readonly string[] | undefined,
  corpus: string
): readonly string[] => {
  const langs = new Set<string>((explicit ?? []).map((l) => l.trim()).filter(Boolean));
  if (/\b(français|french|francophone)\b/i.test(corpus)) langs.add('French');
  if (/\b(anglais|english|fluent english|bilingual)\b/i.test(corpus)) langs.add('English');
  return Array.from(langs);
};

const extractEducationLevel = (
  explicit: string | null | undefined,
  corpus: string
): string | null => {
  if (explicit?.trim()) return explicit.trim();
  const match = corpus.match(/\b(bac\s*\+\s*[2-5]|master\s*[12]?|m[12]\b|miage|licence|bachelor|ingénieur|engineering student)\b/i);
  return match ? match[0].trim() : null;
};

const extractExperienceLevel = (
  explicit: string | null | undefined,
  corpus: string
): string | null => {
  if (explicit?.trim()) return explicit.trim();
  if (/\b(sans expérience|no experience|débutant|junior|intern|stage)\b/i.test(corpus)) {
    return 'Junior / Internship';
  }
  const yearsMatch = corpus.match(/\b([3-9]|1\d)\s*\+?\s*(?:ans d['’]expérience|years? of experience)\b/i);
  if (yearsMatch) {
    return `${yearsMatch[1]}+ years`;
  }
  return null;
};

const normalizeDateIso = (rawDate: string | null | undefined): string | null => {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return null;
};

const buildDeterministicOfferId = (raw: RawScrapedOffer, canonicalUrl: string): string => {
  const digest = crypto
    .createHash('sha1')
    .update(`${raw.source}::${raw.organization}::${raw.title}::${canonicalUrl}`)
    .digest('hex')
    .slice(0, 12);
  return `scr_${digest}`;
};

export const normalizeScrapedOffer = (
  raw: RawScrapedOffer,
  collectedAt = new Date().toISOString()
): NormalizedScrapedOffer | null => {
  const verification = verifyScrapedOffer(raw);
  if (!verification.valid) {
    return null;
  }

  const title = raw.title.trim();
  const organization = raw.organization.trim();
  const description = (raw.description ?? '').trim();
  const corpus = `${title} ${description}`;

  const durationText = raw.duration?.trim() || null;
  const durationMonths =
    typeof raw.durationMonths === 'number' && raw.durationMonths > 0
      ? raw.durationMonths
      : parseDurationMonths(durationText ?? corpus);

  const normalizedDuration =
    durationText ?? (durationMonths ? `${durationMonths} months` : null);

  const contractType =
    raw.contractType?.trim() ||
    (/\b(stage|intern|internship|pfe|apprenti)\b/i.test(corpus) ? 'Internship / Stage' : null);

  const location = raw.location?.trim() || 'Unspecified';
  const workMode = normalizeWorkMode(raw.workMode, `${location} ${corpus}`);
  const skills = extractSkillsFromCorpus(raw.skills, corpus);
  const languages = extractLanguagesFromCorpus(raw.languages, corpus);
  const educationLevel = extractEducationLevel(raw.educationLevel, corpus);
  const experienceLevel = extractExperienceLevel(raw.experienceLevel, corpus);

  const applicationUrl =
    verification.collectionMode === 'discovered'
      ? null
      : verification.normalizedApplicationUrl &&
          verification.normalizedApplicationUrl !== verification.normalizedOriginalUrl
        ? verification.normalizedApplicationUrl
        : verification.normalizedApplicationUrl ?? null;

  const accessMode =
    raw.accessMode ??
    (raw.isAtsApi
      ? 'ats_api'
      : raw.isAuthorizedApi
        ? 'official_api'
        : raw.isRssFeed
          ? 'rss_feed'
          : raw.isExternalDiscovery
            ? 'search_index'
            : 'custom_html');

  const summaryFallback =
    verification.collectionMode === 'discovered'
      ? `${organization} — discovered via ${raw.source} external search link (unverified on source portal).`
      : `${organization} — ${raw.source} verified career listing.`;

  return {
    id: buildDeterministicOfferId(raw, verification.normalizedOriginalUrl),
    externalId: raw.externalId?.trim() || null,
    title,
    organization,
    organizationSummary: raw.organizationSummary?.trim() || summaryFallback,
    description:
      description || `${title} at ${organization} (source: ${raw.source}).`,
    location,
    workMode,
    contractType,
    duration: normalizedDuration,
    durationMonths: durationMonths ?? null,
    postedDate: normalizeDateIso(raw.postedDate),
    startDate: normalizeDateIso(raw.startDate),
    endDate: normalizeDateIso(raw.endDate),
    expiresAt: normalizeDateIso(raw.expiresAt),
    requirements: skills,
    languages,
    educationLevel,
    experienceLevel,
    source: raw.source,
    sources: [raw.source],
    sourceUrl: verification.normalizedOriginalUrl,
    alternateUrls: [],
    applicationUrl,
    applicationEmail: verification.normalizedEmail,
    applicationFormUrl: applicationUrl,
    contactName: raw.contactName?.trim() || null,
    collectedAt,
    discoveredAt: collectedAt,
    collectionMode: verification.collectionMode,
    accessMode,
    verificationStatus: verification.status,
    verificationLevel: verification.verificationLevel,
    matchScore: 0,
  };
};
