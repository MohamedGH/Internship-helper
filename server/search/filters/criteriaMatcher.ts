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

export const TECH_SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['react', 'reactjs', 'react.js'],
  ['node.js', 'node', 'nodejs'],
  ['postgresql', 'postgres', 'psql'],
  ['python', 'py'],
  ['next.js', 'nextjs'],
  ['vue', 'vuejs', 'vue.js'],
  ['kubernetes', 'k8s'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai', 'ia', 'intelligence artificielle'],
  ['business intelligence', 'bi', 'informatique décisionnelle', 'décisionnel'],
  ['c#', 'csharp'],
  ['tailwind', 'tailwindcss'],
  ['developpeur', 'développeur', 'developer', 'dev', 'software engineer', 'ingénieur'],
];

export const expandTermWithSynonyms = (term: string): readonly string[] => {
  const clean = term.toLowerCase().trim();
  if (!clean) return [];
  const expanded = new Set<string>([clean]);
  for (const group of TECH_SYNONYM_GROUPS) {
    if (group.includes(clean)) {
      for (const alias of group) expanded.add(alias);
    }
  }
  return Array.from(expanded);
};

const corpusMatchesTermOrSynonym = (corpus: string, term: string): boolean => {
  const aliases = expandTermWithSynonyms(term);
  return aliases.some((alias) => {
    if (alias.length <= 2) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(corpus);
    }
    return corpus.includes(alias);
  });
};

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
  if (!requestedLoc || requestedLoc === 'all' || requestedLoc === 'anywhere' || requestedLoc === 'international') {
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

  // Discovered search links may only contain city inside title/description rather than structured location
  const searchCorpus = `${offerLocLower} ${offer.title.toLowerCase()}`;

  for (const part of locParts) {
    if (part === 'remote' || part === 'télétravail') continue;
    if (searchCorpus.includes(part)) return true;

    const neighbors = REGION_NEIGHBORS[part];
    if (neighbors && (criteria.radiusKm === undefined || criteria.radiusKm >= 15)) {
      if (neighbors.some((n) => searchCorpus.includes(n))) return true;
    }
  }

  // Country fallback when "France" is part of offer location and requested city is French
  if (
    locParts.some((p) => FRENCH_CITIES.has(p)) &&
    offerLocLower.includes('france') &&
    (criteria.radiusKm === undefined || criteria.radiusKm >= 50)
  ) {
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

const matchesEducationAndExperience = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  if (criteria.educationLevel?.trim() && offer.educationLevel) {
    const reqEdu = criteria.educationLevel.toLowerCase();
    const offerEdu = offer.educationLevel.toLowerCase();
    const isMaster = /bac\s*\+\s*5|master|m2|miage|ingénieur/.test(reqEdu);
    const offerIsBachelorOnly = /bac\s*\+\s*2|bts|dut/.test(offerEdu) && !/bac\s*\+\s*[345]/.test(offerEdu);
    if (isMaster && offerIsBachelorOnly) return false;
  }

  if (criteria.experienceLevel?.trim() && offer.experienceLevel) {
    const reqExp = criteria.experienceLevel.toLowerCase();
    const seniorYears = offer.experienceLevel.match(/([3-9]|1\d)\+/);
    if ((reqExp.includes('junior') || reqExp.includes('no experience') || reqExp.includes('stage')) && seniorYears) {
      return false;
    }
  }

  if (criteria.languages && criteria.languages.length > 0 && offer.languages.length > 0) {
    const reqLangs = criteria.languages.map((l) => l.toLowerCase());
    const hasLang = offer.languages.some((ol) =>
      reqLangs.some((rl) => ol.toLowerCase().includes(rl) || rl.includes(ol.toLowerCase()))
    );
    if (!hasLang) return false;
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

  const hasKeywordHit = keywordTokens.some((tok) => corpusMatchesTermOrSynonym(corpus, tok));
  const hasDomainHit = domainTerms.some((term) => corpusMatchesTermOrSynonym(corpus, term));
  const hasSkillHit = explicitSkills.some((sk) => corpusMatchesTermOrSynonym(corpus, sk));

  return hasKeywordHit || hasDomainHit || hasSkillHit;
};

export const matchesMandatoryCriteria = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  // 0. Reject expired offers
  if (offer.verificationLevel === 'expired') {
    return false;
  }

  // 1. Must prioritize internship/stage
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

  // 6. Education / Experience / Language checks
  if (!matchesEducationAndExperience(offer, criteria)) {
    return false;
  }

  // 7. Keywords / domains / skills relevance check (with technical synonyms)
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

  // Keyword hits with synonym awareness (title hits weigh more than description hits)
  const keywordTokens = tokenizeKeywords(criteria.keywords);
  if (keywordTokens.length > 0) {
    let tokenPoints = 0;
    for (const tok of keywordTokens) {
      if (corpusMatchesTermOrSynonym(titleLower, tok)) tokenPoints += 12;
      else if (corpusMatchesTermOrSynonym(corpus, tok)) tokenPoints += 5;
    }
    score += Math.min(30, tokenPoints);
  }

  // Explicit skills hits with synonym matching
  const reqSkills = (criteria.skills ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  if (reqSkills.length > 0) {
    const matchedCount = reqSkills.filter((sk) => corpusMatchesTermOrSynonym(corpus, sk)).length;
    score += Math.round((matchedCount / reqSkills.length) * 20);
  }

  // Domain taxonomy bonus
  for (const dom of criteria.domains ?? []) {
    const terms = DOMAIN_TAXONOMY[dom.toLowerCase().trim()] ?? [dom.toLowerCase().trim()];
    if (terms.some((t) => corpusMatchesTermOrSynonym(corpus, t))) {
      score += 8;
      break;
    }
  }

  // Prioritize collected & verified offers over externally_unverified links
  if (offer.verificationLevel === 'verified') {
    score += 12;
  } else if (offer.collectionMode === 'collected') {
    score += 7;
  }

  if (offer.applicationEmail) score += 5;
  if (offer.applicationUrl) score += 5;
  if (offer.durationMonths !== null) score += 3;
  if (offer.startDate !== null) score += 3;

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
