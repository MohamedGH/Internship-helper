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
    'c#',
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
    'php',
    'laravel',
    'symfony',
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
    'pandas',
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
  paris: [
    'ile-de-france',
    'idf',
    'levallois',
    'boulogne',
    'neuilly',
    'issy',
    'la defense',
    'nanterre',
    'courbevoie',
    'montreuil',
    'saint-denis',
    'puteaux',
    'clichy',
  ],
  lyon: ['auvergne-rhone-alpes', 'villeurbanne', 'bron', 'ecully', 'venissieux'],
  bordeaux: ['nouvelle-aquitaine', 'merignac', 'pessac', 'talence'],
  toulouse: ['occitanie', 'blagnac', 'labege', 'colomiers'],
  nantes: ['pays de la loire', 'carquefou', 'saint-herblain'],
  lille: [
    'hauts-de-france',
    'villeneuve',
    "villeneuve-d'ascq",
    'villeneuve d ascq',
    'roubaix',
    'tourcoing',
    'marcq',
    'wasquehal',
    'lambersart',
    'lesquin',
    'lomme',
    'hellemmes',
    'nord',
  ],
  marseille: ['aix-en-provence', 'aix', 'bouches-du-rhone', 'paca'],
  strasbourg: ['alsace', 'grand est', 'illkirch'],
  rennes: ['bretagne', 'cesson-sevigne'],
  grenoble: ['isere', 'meylan'],
  montpellier: ['herault', 'castelnau'],
  nice: ['sophia antipolis', 'sophia-antipolis', 'cannes', 'valbonne'],
};

const FRENCH_CITIES = new Set(Object.keys(REGION_NEIGHBORS));

const INTERNSHIP_KEYWORDS_REGEX =
  /\b(stage|stagiaire|intern|internship|pfe|fin d['’]etudes|fin d['’]études|cesure|césure|alternance|apprentice|werkstudent|trainee)\b/i;

const STOPWORDS = new Set([
  'stage',
  'intern',
  'internship',
  'de',
  'du',
  'des',
  'en',
  'et',
  'ou',
  'or',
  'and',
  'the',
  'for',
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
  ['php', 'laravel', 'symfony'],
  ['next.js', 'nextjs'],
  ['vue', 'vuejs', 'vue.js'],
  ['kubernetes', 'k8s'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai', 'ia', 'intelligence artificielle'],
  ['business intelligence', 'bi', 'informatique decisionnelle', 'decisionnel'],
  ['c#', 'csharp'],
  ['tailwind', 'tailwindcss'],
  ['developpeur', 'developer', 'dev', 'software engineer', 'ingenieur'],
];

export const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const expandTermWithSynonyms = (term: string): readonly string[] => {
  const clean = stripAccents(term.trim());
  if (!clean) return [];
  const expanded = new Set<string>([clean]);
  for (const group of TECH_SYNONYM_GROUPS) {
    if (group.includes(clean)) {
      for (const alias of group) expanded.add(alias);
    }
  }
  return Array.from(expanded);
};

const corpusMatchesTermOrSynonym = (normalizedCorpus: string, term: string): boolean => {
  const aliases = expandTermWithSynonyms(term);
  return aliases.some((alias) => {
    if (alias.length <= 3) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalizedCorpus);
    }
    return normalizedCorpus.includes(alias);
  });
};

export const tokenizeKeywords = (keywords: string): readonly string[] =>
  stripAccents(keywords)
    .split(/[^a-z0-9+#.-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

export const isInternshipOffer = (offer: NormalizedScrapedOffer): boolean => {
  const corpus = `${offer.title} ${offer.contractType ?? ''} ${offer.description.slice(0, 450)}`;
  return INTERNSHIP_KEYWORDS_REGEX.test(corpus);
};

type LocationMatchTier = 'exact_city' | 'region_metro' | 'remote_global' | 'unmatched';

const evaluateLocationTier = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): LocationMatchTier => {
  const requestedLoc = stripAccents(criteria.location.trim());
  if (
    !requestedLoc ||
    requestedLoc === 'all' ||
    requestedLoc === 'anywhere' ||
    requestedLoc === 'international'
  ) {
    return 'exact_city';
  }

  const locParts = requestedLoc
    .split(/[/,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const wantsRemoteToo = locParts.some(
    (p) => p.includes('remote') || p.includes('teletravail')
  );
  if (wantsRemoteToo && offer.workMode === 'Remote') {
    return 'remote_global';
  }

  const offerLocLower = stripAccents(offer.location);
  if (offerLocLower === 'unspecified') {
    return 'remote_global';
  }

  const searchCorpus = `${offerLocLower} ${stripAccents(offer.title)}`;

  for (const part of locParts) {
    if (part === 'remote' || part === 'teletravail') continue;
    if (searchCorpus.includes(part)) return 'exact_city';

    const neighbors = REGION_NEIGHBORS[part];
    if (neighbors && (criteria.radiusKm === undefined || criteria.radiusKm >= 15)) {
      if (neighbors.some((n) => searchCorpus.includes(n))) return 'region_metro';
    }
  }

  // National France remote or European remote fallback
  if (
    locParts.some((p) => FRENCH_CITIES.has(p)) &&
    offer.workMode === 'Remote' &&
    (offerLocLower.includes('france') ||
      offerLocLower.includes('europe') ||
      offerLocLower.includes('emea') ||
      offerLocLower.includes('worldwide') ||
      offerLocLower.includes('remote')) &&
    (criteria.radiusKm === undefined || criteria.radiusKm >= 50)
  ) {
    return 'remote_global';
  }

  return 'unmatched';
};

const matchesWorkModeCriteria = (
  offer: NormalizedScrapedOffer,
  workMode: string
): boolean => {
  const normalized = stripAccents(workMode.trim());
  if (!normalized || normalized === 'all') return true;
  if (normalized === 'remote' || normalized === 'teletravail') {
    return offer.workMode === 'Remote';
  }
  if (normalized === 'hybrid' || normalized === 'hybride') {
    return offer.workMode === 'Hybrid';
  }
  if (normalized === 'on-site' || normalized === 'presentiel') {
    return offer.workMode === 'On-site';
  }
  return true;
};

const matchesEducationAndExperience = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  if (criteria.educationLevel?.trim() && offer.educationLevel) {
    const reqEdu = stripAccents(criteria.educationLevel);
    const offerEdu = stripAccents(offer.educationLevel);
    const isMaster = /bac\s*\+\s*5|master|m2|ingenieur/.test(reqEdu);
    const offerIsBachelorOnly =
      /bac\s*\+\s*2|bts|dut/.test(offerEdu) && !/bac\s*\+\s*[345]/.test(offerEdu);
    if (isMaster && offerIsBachelorOnly) return false;
  }

  if (criteria.experienceLevel?.trim() && offer.experienceLevel) {
    const reqExp = stripAccents(criteria.experienceLevel);
    const seniorYears = offer.experienceLevel.match(/([3-9]|1\d)\+/);
    if (
      (reqExp.includes('junior') ||
        reqExp.includes('no experience') ||
        reqExp.includes('stage')) &&
      seniorYears
    ) {
      return false;
    }
  }

  if (criteria.languages && criteria.languages.length > 0 && offer.languages.length > 0) {
    const reqLangs = criteria.languages.map((l) => stripAccents(l));
    const hasLang = offer.languages.some((ol) =>
      reqLangs.some(
        (rl) => stripAccents(ol).includes(rl) || rl.includes(stripAccents(ol))
      )
    );
    if (!hasLang) return false;
  }

  return true;
};

const matchesKeywordOrDomain = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): boolean => {
  const corpus = stripAccents(
    `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`
  );
  const keywordTokens = tokenizeKeywords(criteria.keywords);

  const domainTerms: string[] = [];
  for (const dom of criteria.domains ?? []) {
    const mapped = DOMAIN_TAXONOMY[dom.toLowerCase().trim()];
    if (mapped) {
      domainTerms.push(...mapped.map(stripAccents));
    } else if (dom.trim()) {
      domainTerms.push(stripAccents(dom.trim()));
    }
  }

  const explicitSkills = (criteria.skills ?? [])
    .map((s) => stripAccents(s.trim()))
    .filter(Boolean);

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
  if (offer.verificationLevel === 'expired') {
    return false;
  }

  if (!isInternshipOffer(offer)) {
    return false;
  }

  if (!matchesWorkModeCriteria(offer, criteria.workMode)) {
    return false;
  }

  if (evaluateLocationTier(offer, criteria) === 'unmatched') {
    return false;
  }

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

  if (!matchesEducationAndExperience(offer, criteria)) {
    return false;
  }

  if (!matchesKeywordOrDomain(offer, criteria)) {
    return false;
  }

  return true;
};

export const explainRelevanceMatch = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): { readonly score: number; readonly reasons: readonly string[] } => {
  let score = 20;
  const reasons: string[] = [];
  const titleNorm = stripAccents(offer.title);
  const corpusNorm = stripAccents(
    `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`
  );

  // 1. Keyword relevance (title weights significantly higher)
  const keywordTokens = tokenizeKeywords(criteria.keywords);
  if (keywordTokens.length > 0) {
    let tokenPoints = 0;
    const hitWords: string[] = [];
    for (const tok of keywordTokens) {
      if (corpusMatchesTermOrSynonym(titleNorm, tok)) {
        tokenPoints += 12;
        hitWords.push(tok);
      } else if (corpusMatchesTermOrSynonym(corpusNorm, tok)) {
        tokenPoints += 5;
        hitWords.push(tok);
      }
    }
    if (hitWords.length > 0) {
      reasons.push(`Role/keyword fit: ${hitWords.slice(0, 3).join(', ')}`);
    }
    score += Math.min(28, tokenPoints);
  }

  // 2. Priority geographic & workMode score
  const locTier = evaluateLocationTier(offer, criteria);
  if (locTier === 'exact_city') {
    score += 12;
    reasons.push(`Priority location: ${offer.location}`);
  } else if (locTier === 'region_metro') {
    score += 8;
    reasons.push(`Nearby metro: ${offer.location}`);
  } else if (locTier === 'remote_global' && offer.workMode === 'Remote') {
    score += 4;
    reasons.push('Remote compatible');
  }

  // 3. Explicit CV / query skill hits
  const reqSkills = (criteria.skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (reqSkills.length > 0) {
    const matchedSkills = reqSkills.filter((sk) =>
      corpusMatchesTermOrSynonym(corpusNorm, stripAccents(sk))
    );
    if (matchedSkills.length > 0) {
      score += Math.round((matchedSkills.length / reqSkills.length) * 18);
      reasons.push(`Skills: ${matchedSkills.slice(0, 4).join(', ')}`);
    }
  }

  // 4. Domain taxonomy bonus
  for (const dom of criteria.domains ?? []) {
    const terms = (DOMAIN_TAXONOMY[dom.toLowerCase().trim()] ?? [dom]).map(stripAccents);
    if (terms.some((t) => corpusMatchesTermOrSynonym(corpusNorm, t))) {
      score += 6;
      reasons.push(`Domain: ${dom}`);
      break;
    }
  }

  // 5. Verified / full-content quality weighting
  if (offer.verificationLevel === 'verified') {
    score += 10;
    reasons.push('Verified ATS / Official');
  } else if (offer.collectionMode === 'collected') {
    score += 6;
    reasons.push('Collected full offer');
  }

  if (offer.applicationEmail) score += 4;
  if (offer.applicationUrl) score += 3;
  if (offer.durationMonths !== null) score += 2;
  if (offer.startDate !== null) score += 2;

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
};

export const computeRelevanceScore = (
  offer: NormalizedScrapedOffer,
  criteria: SearchCriteria
): number => explainRelevanceMatch(offer, criteria).score;

export const filterAndScoreOffers = (
  offers: readonly NormalizedScrapedOffer[],
  criteria: SearchCriteria
): readonly NormalizedScrapedOffer[] =>
  offers
    .filter((offer) => matchesMandatoryCriteria(offer, criteria))
    .map((offer) => {
      const { score, reasons } = explainRelevanceMatch(offer, criteria);
      return {
        ...offer,
        matchScore: score,
        matchReasons: reasons,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
