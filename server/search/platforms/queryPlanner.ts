import { CandidateProfileContext, SearchCriteria } from '../types.ts';

export interface DerivedCandidateSignals {
  readonly effectiveKeywords: string;
  readonly rolePhrases: readonly string[];
  readonly skills: readonly string[];
  readonly domains: readonly string[];
  readonly primaryCity: string;
  readonly educationLevel: string;
  readonly languages: readonly string[];
  readonly searchTokens: readonly string[];
}

export interface PlannedSearchQuery {
  readonly query: string;
  readonly language: 'fr' | 'en' | 'all';
  readonly kind: 'primary' | 'skill' | 'domain' | 'english' | 'education';
  readonly skillHint?: string;
}

const KNOWN_CV_TECH_TERMS = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Vue',
  'Angular',
  'Node.js',
  'PHP',
  'Laravel',
  'Symfony',
  'Python',
  'Java',
  'Spring',
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
  'Power BI',
  'Tableau',
  'dbt',
  'Spark',
  'PyTorch',
  'TensorFlow',
  'Machine Learning',
  'Data',
] as const;

const ROLE_STOPWORDS = new Set([
  'stage',
  'stagiaire',
  'intern',
  'internship',
  'de',
  'du',
  'des',
  'en',
  'et',
  'ou',
  'and',
  'or',
  'the',
  'for',
  'a',
  'à',
  'in',
]);

const stripStageWords = (raw: string): string =>
  raw
    .replace(/\b(stage|stagiaire|internship|intern|pfe|césure)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const extractPrimaryCity = (rawLocation: string | undefined): string => {
  const trimmed = (rawLocation ?? '').trim();
  if (!trimmed) return '';
  const firstPart = trimmed.split(/[/,;]+/)[0]?.trim() ?? '';
  const lower = firstPart.toLowerCase();
  if (
    !firstPart ||
    ['all', 'anywhere', 'international', 'remote', 'télétravail'].includes(lower)
  ) {
    return '';
  }
  return firstPart;
};

export const extractSkillsFromProfile = (
  criteriaSkills: readonly string[] | undefined,
  profile?: CandidateProfileContext
): readonly string[] => {
  const collected = new Set<string>();
  for (const s of criteriaSkills ?? []) {
    if (s.trim()) collected.add(s.trim());
  }
  for (const s of profile?.skills ?? []) {
    if (s.trim()) collected.add(s.trim());
  }
  const cvCorpus = [
    profile?.targetRole ?? '',
    profile?.degree ?? '',
    ...(profile?.experiences ?? []),
    profile?.rawCvText ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (cvCorpus) {
    for (const term of KNOWN_CV_TECH_TERMS) {
      const token = term.toLowerCase();
      if (token === 'go' || token === 'php') {
        const re = new RegExp(`\\b${token}\\b`, 'i');
        if (re.test(cvCorpus)) collected.add(term);
      } else if (cvCorpus.includes(token)) {
        collected.add(term);
      }
    }
  }

  return Array.from(collected).slice(0, 14);
};

export const deriveProfileContext = (
  criteria: SearchCriteria,
  profile: CandidateProfileContext | undefined = criteria.profile
): DerivedCandidateSignals => {
  const roleParts = [criteria.keywords.trim(), profile?.targetRole?.trim() ?? ''].filter(Boolean);
  const effectiveKeywords = roleParts[0] || 'Stage Informatique';

  const rolePhrases = Array.from(
    new Set(
      [criteria.keywords, profile?.targetRole ?? '']
        .map((r) => stripStageWords(r))
        .filter((r) => r.length >= 2)
    )
  );

  const skills = extractSkillsFromProfile(criteria.skills, profile);
  const domains = (criteria.domains ?? []).map((d) => d.trim()).filter(Boolean);

  const primaryCity =
    extractPrimaryCity(criteria.location) || extractPrimaryCity(profile?.location);

  const educationLevel =
    criteria.educationLevel?.trim() || profile?.degree?.trim() || '';

  const languages =
    criteria.languages && criteria.languages.length > 0 ? criteria.languages : [];

  const searchTokens = Array.from(
    new Set(
      [...rolePhrases, ...skills, ...domains]
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9àâäéèêëïîôöùûüç+#.-]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !ROLE_STOPWORDS.has(t))
    )
  );

  return {
    effectiveKeywords,
    rolePhrases,
    skills,
    domains,
    primaryCity,
    educationLevel,
    languages,
    searchTokens,
  };
};

/**
 * Enriches SearchCriteria dynamically from CandidateProfile without mutating explicit user overrides.
 */
export const enrichCriteriaWithProfile = (criteria: SearchCriteria): SearchCriteria => {
  const signals = deriveProfileContext(criteria, criteria.profile);
  const location =
    criteria.location.trim() ||
    criteria.profile?.location?.trim() ||
    'Paris / Remote';

  return {
    ...criteria,
    location,
    skills: signals.skills,
    educationLevel: signals.educationLevel || undefined,
  };
};

const translateRoleToFrenchAndEnglish = (
  baseRole: string
): { readonly fr: string; readonly en: string } => {
  const clean = stripStageWords(baseRole);
  if (!clean) {
    return { fr: 'développeur informatique', en: 'software developer' };
  }
  const lower = clean.toLowerCase();
  let fr = clean;
  let en = clean;

  if (/software\s*engineer|full[- ]?stack|developer/.test(lower)) {
    fr = clean
      .replace(/software\s*engineer(ing)?/gi, 'développeur logiciel')
      .replace(/developer/gi, 'développeur')
      .trim();
  } else if (/développeur|logiciel|informatique/.test(lower)) {
    en = clean
      .replace(/développeur\s*web/gi, 'web developer')
      .replace(/développeur\s*logiciel/gi, 'software engineer')
      .replace(/développeur/gi, 'developer')
      .replace(/informatique\s*décisionnelle/gi, 'business intelligence')
      .replace(/informatique/gi, 'software')
      .trim();
  }

  return { fr: fr || clean, en: en || clean };
};

/**
 * Generates dynamic, profile-driven bilingual search query permutations
 * (zero hardcoded user-specific constants).
 */
export const buildMultipliedQueries = (
  criteria: SearchCriteria,
  options: { readonly maxQueries?: number } = {}
): readonly PlannedSearchQuery[] => {
  const maxQueries = options.maxQueries ?? 10;
  const signals = deriveProfileContext(criteria, criteria.profile);
  const city = signals.primaryCity;
  const baseRole = signals.rolePhrases[0] || criteria.keywords;
  const { fr: frRole, en: enRole } = translateRoleToFrenchAndEnglish(baseRole);

  const queries: PlannedSearchQuery[] = [];
  const seen = new Set<string>();

  const pushQuery = (q: PlannedSearchQuery) => {
    const norm = q.query.replace(/\s+/g, ' ').trim();
    if (!norm || norm.length < 3) return;
    const key = norm.toLowerCase();
    if (seen.has(key) || queries.length >= maxQueries) return;
    seen.add(key);
    queries.push({ ...q, query: norm });
  };

  // 1. Primary FR & EN queries (always present in top slots)
  pushQuery({
    query: `stage ${frRole} ${city}`.trim(),
    language: 'fr',
    kind: 'primary',
  });
  pushQuery({
    query: `${enRole} intern`,
    language: 'en',
    kind: 'english',
  });

  // 2. Top domain-specific FR permutation
  for (const dom of signals.domains.slice(0, 2)) {
    pushQuery({
      query: `stage ${dom} ${city}`.trim(),
      language: 'fr',
      kind: 'domain',
    });
  }

  // 3. Top CV skill permutations (FR with city + EN)
  for (const skill of signals.skills.slice(0, 3)) {
    pushQuery({
      query: `stage ${skill} ${city}`.trim(),
      language: 'fr',
      kind: 'skill',
      skillHint: skill,
    });
  }
  if (signals.skills[0]) {
    pushQuery({
      query: `${signals.skills[0]} intern`,
      language: 'en',
      kind: 'english',
      skillHint: signals.skills[0],
    });
  }

  // 4. Education level FR query if profile/criteria specifies one (e.g. L3 MIAGE / Bac+5)
  if (signals.educationLevel) {
    const compactEdu = signals.educationLevel.split(/[/,;]/)[0]?.trim() ?? signals.educationLevel;
    pushQuery({
      query: `stage ${compactEdu} ${frRole}`.trim(),
      language: 'fr',
      kind: 'education',
    });
  }

  // 5. National FR fallback, additional EN & remaining skills up to maxQueries
  if (city) {
    pushQuery({
      query: `stage ${frRole}`.trim(),
      language: 'fr',
      kind: 'primary',
    });
  }
  pushQuery({
    query: `${enRole} internship`,
    language: 'en',
    kind: 'english',
  });
  for (const skill of signals.skills.slice(1, 5)) {
    pushQuery({
      query: `${skill} intern`,
      language: 'en',
      kind: 'english',
      skillHint: skill,
    });
    if (city) {
      pushQuery({
        query: `stage développeur ${skill}`.trim(),
        language: 'fr',
        kind: 'skill',
        skillHint: skill,
      });
    }
  }

  return queries.slice(0, maxQueries);
};
