import {
  isOfferWithinDateRange,
  isOfferWithinDuration,
} from '../../../src/modules/sourceAggregator.ts';
import { NormalizedScrapedOffer, SearchCriteria } from '../types.ts';

export const DOMAIN_TAXONOMY: Record<string, readonly string[]> = {
  'développement logiciel': [
    'software',
    'logiciel',
    'backend',
    'full-stack',
    'fullstack',
    'engineer',
    'ingénieur',
    'developer',
    'développeur',
    'java',
    'python',
    'c++',
    'go',
    'rust',
  ],
  'développement web': [
    'web',
    'frontend',
    'front-end',
    'full-stack',
    'fullstack',
    'react',
    'typescript',
    'javascript',
    'next.js',
    'vue',
    'node',
    'css',
    'html',
  ],
  data: [
    'data',
    'données',
    'analytics',
    'analyst',
    'data engineer',
    'etl',
    'sql',
    'dbt',
    'spark',
    'snowflake',
    'bigquery',
    'pipeline',
  ],
  ia: [
    'ia',
    'ai',
    'artificial intelligence',
    'intelligence artificielle',
    'machine learning',
    'deep learning',
    'ml',
    'llm',
    'nlp',
    'computer vision',
    'pytorch',
    'tensorflow',
  ],
  'informatique décisionnelle': [
    'bi',
    'business intelligence',
    'informatique décisionnelle',
    'décisionnel',
    'power bi',
    'tableau',
    'looker',
    'reporting',
    'kpi',
    'data warehouse',
  ],
};

const REGION_NEIGHBORS: Record<string, readonly string[]> = {
  paris: ['ile-de-france', 'île-de-france', 'levallois', 'boulogne', 'neuilly', 'issy', 'la défense'],
  lyon: ['auvergne-rhône-alpes', 'villeurbanne'],
  bordeaux: ['nouvelle-aquitaine'],
  toulouse: ['occitanie', 'blagnac'],
  nantes: ['pays de la loire'],
  lille: ['hauts-de-france', 'villeneuve'],
};

const FRENCH_CITIES = new Set(Object.keys(REGION_NEIGHBORS));

const INTERNSHIP_KEYWORDS_REGEX =
  /\b(stage|stagiaire|intern|internship|pfe|fin d['’]études|césure|alternance|apprentice)\b/i;

const STOPWORDS = new Set([
  'stage',
  'intern',
  'internship',
  'de',
  'du',
  'des',
  'en',
  'et',
  'or',
  'and',
  'the',
  'for',
  'à',
  'a',
  'in',
]);

export const tokenizeKeywords = (keywords: string): readonly string[] =>
  keywords
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôöùûüç+#.-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

export const isInternshipOffer = (offer: NormalizedScrapedOffer): boolean => {
  const corpus = `${offer.title} ${offer.contractType ?? ''} ${offer.description.slice(0, 350)}`;
  return INTERNSHIP_KEYWORDS_REGEX.test(corpus);
};

const matchesLocationCriteria = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  const requestedLoc = criteria.location.trim().toLowerCase();
  if (!requestedLoc || requestedLoc === 'all' || requestedLoc === 'anywhere') {
    return true;
  }

  const locParts = requestedLoc
    .split(/[/,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // If user requested "Paris / Remote", allow Remote offers or location match
  const wantsRemoteToo = locParts.some((p) => p.includes('remote') || p.includes('télétravail'));
  if (wantsRemoteToo && offer.workMode === 'Remote') {
    return true;
  }

  const offerLocLower = offer.location.toLowerCase();
  if (offerLocLower === 'unspecified') {
    return true;
  }

  for (const part of locParts) {
    if (part === 'remote' || part === 'télétravail') continue;
    if (offerLocLower.includes(part)) return true;

    const neighbors = REGION_NEIGHBORS[part];
    if (neighbors && (criteria.radiusKm === undefined || criteria.radiusKm >= 15)) {
      if (neighbors.some((n) => offerLocLower.includes(n))) return true;
    }
  }

  // Country fallback when "France" is part of offer location and requested city is French
  if (
    locParts.some((p) => FRENCH_CITIES.has(p)) &&
    offerLocLower.includes('france') &&
    (criteria.radiusKm === undefined || criteria.radiusKm >= 50)
  ) {
    // Allow hybrid/remote French offers if radius >= 50km, otherwise keep city match strict
    if (offer.workMode === 'Remote') return true;
  }

  return false;
};

const matchesWorkModeCriteria = (
  offer: NormalizedScrapedOffer,
  workMode: string
): boolean => {
  const normalized = workMode.trim().toLowerCase();
  if (!normalized || normalized === 'all') return true;
  if (normalized === 'remote' || normalized === 'télétravail') {
    return offer.workMode === 'Remote';
  }
  if (normalized === 'hybrid' || normalized === 'hybride') {
    return offer.workMode === 'Hybrid';
  }
  if (normalized === 'on-site' || normalized === 'présentiel') {
    return offer.workMode === 'On-site';
  }
  return true;
};

const matchesKeywordOrDomain = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  const corpus = `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`.toLowerCase();
  const keywordTokens = tokenizeKeywords(criteria.keywords);

  const domainTerms: string[] = [];
  for (const dom of criteria.domains ?? []) {
    const mapped = DOMAIN_TAXONOMY[dom.toLowerCase().trim()];
    if (mapped) {
      domainTerms.push(...mapped);
    } else if (dom.trim()) {
      domainTerms.push(dom.toLowerCase().trim());
    }
  }

  const explicitSkills = (criteria.skills ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);

  if (keywordTokens.length === 0 && domainTerms.length === 0 && explicitSkills.length === 0) {
    return true;
  }

  const hasKeywordHit = keywordTokens.some((tok) => corpus.includes(tok));
  const hasDomainHit = domainTerms.some((term) => corpus.includes(term));
  const hasSkillHit = explicitSkills.some((sk) => corpus.includes(sk));

  return hasKeywordHit || hasDomainHit || hasSkillHit;
};

export const matchesMandatoryCriteria = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  // 1. Must be an internship/stage (unless title lacks contract marker only on a dedicated internship source)
  if (!isInternshipOffer(offer)) {
    return false;
  }

  // 2. WorkMode check
  if (!matchesWorkModeCriteria(offer, criteria.workMode)) {
    return false;
  }

  // 3. Location check
  if (!matchesLocationCriteria(offer, criteria)) {
    return false;
  }

  // 4. Duration min/max check (reject if known & out of bounds; keep null when unspecified)
  if (
    !isOfferWithinDuration(
      offer.durationMonths,
      criteria.minDurationMonths ?? 0,
      criteria.maxDurationMonths ?? 0,
      criteria.includeUnspecifiedDuration ?? true
    )
  ) {
    return false;
  }

  // 5. Start date range check (reject if known & out of bounds; keep null when unspecified)
  if (
    !isOfferWithinDateRange(
      offer.startDate,
      criteria.startDateFrom ?? '',
      criteria.startDateTo ?? '',
      criteria.includeUnspecifiedDates ?? true
    )
  ) {
    return false;
  }

  // 6. Keywords / domains / skills relevance check
  if (!matchesKeywordOrDomain(offer, criteria)) {
    return false;
  }

  return true;
};

export const computeRelevanceScore = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): number => {
  let score = 20;
  const titleLower = offer.title.toLowerCase();
  const corpus = `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`.toLowerCase();

  // Keyword hits (title hits weigh more than description hits)
  const keywordTokens = tokenizeKeywords(criteria.keywords);
  if (keywordTokens.length > 0) {
    let tokenPoints = 0;
    for (const tok of keywordTokens) {
      if (titleLower.includes(tok)) tokenPoints += 12;
      else if (corpus.includes(tok)) tokenPoints += 5;
    }
    score += Math.min(30, tokenPoints);
  }

  // Explicit skills hits
  const reqSkills = (criteria.skills ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  if (reqSkills.length > 0) {
    const matchedCount = reqSkills.filter((sk) => corpus.includes(sk)).length;
    score += Math.round((matchedCount / reqSkills.length) * 20);
  }

  // Domain taxonomy bonus
  for (const dom of criteria.domains ?? []) {
    const terms = DOMAIN_TAXONOMY[dom.toLowerCase().trim()] ?? [dom.toLowerCase().trim()];
    if (terms.some((t) => corpus.includes(t))) {
      score += 8;
      break;
    }
  }

  // Verification quality & channel completeness
  if (offer.verificationStatus === 'verified_ats_api' || offer.verificationStatus === 'verified_offer') {
    score += 10;
  }
  if (offer.applicationEmail) score += 6;
  if (offer.applicationUrl) score += 6;
  if (offer.durationMonths !== null) score += 4;
  if (offer.startDate !== null) score += 4;

  return Math.max(0, Math.min(100, score));
};

export const filterAndScoreOffers = (
  offers: readonly NormalizedScrapedOffer[],
  criteria: SearchCriteria
): readonly NormalizedScrapedOffer[] =>
  offers
    .filter((offer) => matchesMandatoryCriteria(offer, criteria))
    .map((offer) => ({
      ...offer,
      matchScore: computeRelevanceScore(offer, criteria),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
