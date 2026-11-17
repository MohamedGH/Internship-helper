import { CustomSource, SourceProvider } from '../types/domain';

export const DEFAULT_BUILTIN_SOURCES: readonly CustomSource[] = [
  {
    id: 'src_company_career',
    name: SourceProvider.CompanyCareer,
    baseUrl: 'https://boards-api.greenhouse.io',
    description: 'Direct enterprise ATS feeds: Greenhouse, Lever, and Ashby public APIs',
    accessMode: 'ats_api',
    policySummary: 'Public ATS JSON APIs',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_france_travail',
    name: SourceProvider.FranceTravail,
    baseUrl: 'https://candidat.francetravail.fr',
    searchUrlTemplate:
      'https://candidat.francetravail.fr/offres/recherche?motsCles={keywords}&typeContrat=STG',
    description: 'Official France Travail Offres d emploi v2 API (or external link when unconfigured/suspended)',
    accessMode: 'official_api',
    policySummary: 'Official OAuth2 API (fallback link_only)',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_afjv',
    name: SourceProvider.AFJV,
    baseUrl: 'https://emploi.afjv.com',
    searchUrlTemplate: 'https://emploi.afjv.com/recherche_emploi.php?mot_cle={keywords}',
    description: 'French IT, 3D, and video game internships via official RSS feed + Schema.org inspection',
    accessMode: 'rss_feed',
    policySummary: 'Official RSS feed (robots.txt verified)',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_meteojob',
    name: SourceProvider.Meteojob,
    baseUrl: 'https://www.meteojob.com',
    searchUrlTemplate: 'https://www.meteojob.com/jobs?what={keywords}&where={location}',
    description: 'General French job board — link_only + multi-query external search index discovery (CGU compliant)',
    accessMode: 'link_only',
    policySummary: 'CGU forbid scraping; link_only / external index',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_apec',
    name: SourceProvider.Apec,
    baseUrl: 'https://www.apec.fr',
    searchUrlTemplate:
      'https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles={keywords}&lieux={location}&typesContrat=143684',
    description: 'Apec (cadres & jeunes diplômés) — external link_only + search index discovery',
    accessMode: 'link_only',
    policySummary: 'Requires written agreement; link_only / external index',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_wttj',
    name: SourceProvider.WelcomeToTheJungle,
    baseUrl: 'https://www.welcometothejungle.com/fr/jobs',
    searchUrlTemplate:
      'https://www.welcometothejungle.com/fr/jobs?query={keywords}&refinementList%5Bcontract_type%5D%5B%5D=internship',
    description: 'French & European tech companies — link_only + external search discovery',
    accessMode: 'link_only',
    policySummary: 'No public API; link_only / external index',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_hellowork',
    name: SourceProvider.HelloWork,
    baseUrl: 'https://www.hellowork.com',
    searchUrlTemplate:
      'https://www.hellowork.com/fr-fr/emploi/recherche.html?k={keywords}&l={location}&c=Stage',
    description: 'French job portal — WAF/CGU protected, link_only + external search discovery',
    accessMode: 'link_only',
    policySummary: 'WAF/CGU restricted; link_only / external index',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_lesjeudis',
    name: SourceProvider.LesJeudis,
    baseUrl: 'https://lesjeudis.com',
    searchUrlTemplate: 'https://lesjeudis.com/offres?q={keywords}&l={location}',
    description: 'French IT engineering portal — CGU prohibit scraping, link_only + search index discovery',
    accessMode: 'link_only',
    policySummary: 'CGU forbid scraping; link_only / external index',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_remotive',
    name: SourceProvider.Remotive,
    baseUrl: 'https://remotive.com',
    searchUrlTemplate: 'https://remotive.com/remote-jobs?query={keywords}',
    description: 'International remote software & tech roles via Remotive public API',
    accessMode: 'official_api',
    policySummary: 'Public documented JSON API',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_remoteok',
    name: SourceProvider.RemoteOK,
    baseUrl: 'https://remoteok.com',
    searchUrlTemplate: 'https://remoteok.com/?search={keywords}',
    description: 'International remote software & tech positions via official Remote OK JSON API',
    accessMode: 'official_api',
    policySummary: 'Public JSON feed (attribution link)',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_weworkremotely',
    name: SourceProvider.WeWorkRemotely,
    baseUrl: 'https://weworkremotely.com',
    searchUrlTemplate: 'https://weworkremotely.com/remote-jobs/search?term={keywords}',
    description: 'International remote programming & tech offers via official RSS feeds',
    accessMode: 'rss_feed',
    policySummary: 'Official RSS feeds (robots.txt verified)',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_arbeitnow',
    name: SourceProvider.Arbeitnow,
    baseUrl: 'https://www.arbeitnow.com',
    searchUrlTemplate: 'https://www.arbeitnow.com/jobs?search={keywords}',
    description: 'European & remote tech positions including internships/Werkstudent via public JSON API',
    accessMode: 'official_api',
    policySummary: 'Public paginated JSON API',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_himalayas',
    name: SourceProvider.Himalayas,
    baseUrl: 'https://himalayas.app',
    searchUrlTemplate: 'https://himalayas.app/jobs?q={keywords}',
    description: 'Global remote engineering & data offers via public Himalayas JSON API',
    accessMode: 'official_api',
    policySummary: 'Public cursor-paginated JSON API',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_jobicy',
    name: SourceProvider.Jobicy,
    baseUrl: 'https://jobicy.com',
    searchUrlTemplate: 'https://jobicy.com/jobs?q={keywords}',
    description: 'International remote software & entry-level offers via public Jobicy v2 JSON API',
    accessMode: 'official_api',
    policySummary: 'Public JSON API v2 (attribution link)',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_linkedin',
    name: SourceProvider.LinkedIn,
    baseUrl: 'https://www.linkedin.com/jobs',
    searchUrlTemplate:
      'https://www.linkedin.com/jobs/search/?keywords={keywords}&location={location}&f_E=1',
    description: 'Global professional network — official external search link only',
    accessMode: 'link_only',
    policySummary: 'Anti-bot/ToS policy; external link only',
    enabled: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_indeed',
    name: SourceProvider.Indeed,
    baseUrl: 'https://fr.indeed.com',
    searchUrlTemplate: 'https://fr.indeed.com/jobs?q={keywords}&l={location}&jt=internship',
    description: 'Broad job aggregator — official external search link only',
    accessMode: 'link_only',
    policySummary: 'Anti-bot/ToS policy; external link only',
    enabled: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_glassdoor',
    name: SourceProvider.Glassdoor,
    baseUrl: 'https://www.glassdoor.fr',
    searchUrlTemplate: 'https://www.glassdoor.fr/Emploi/index.htm',
    description: 'Company reviews & job listings — official external search link only',
    accessMode: 'link_only',
    policySummary: 'Anti-bot/ToS policy; external link only',
    enabled: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_wellfound',
    name: SourceProvider.Wellfound,
    baseUrl: 'https://wellfound.com',
    searchUrlTemplate: 'https://wellfound.com/jobs?q={keywords}',
    description: 'International startup roles — official external search link only',
    accessMode: 'link_only',
    policySummary: 'Auth/robots.txt protected; external link only',
    enabled: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_jobteaser',
    name: SourceProvider.JobTeaser,
    baseUrl: 'https://www.jobteaser.com',
    searchUrlTemplate: 'https://www.jobteaser.com/fr/job-offers?query={keywords}',
    description: 'Authenticated university career portal — official external search link only',
    accessMode: 'link_only',
    policySummary: 'Auth-gated campus intranet; external link only',
    enabled: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export interface SourcePreset {
  readonly name: string;
  readonly baseUrl: string;
  readonly searchUrlTemplate?: string;
  readonly description: string;
}

export const POPULAR_SOURCE_PRESETS: readonly SourcePreset[] = [
  {
    name: 'Laou Tech',
    baseUrl: 'https://www.laou.fr',
    searchUrlTemplate: 'https://www.laou.fr/offres',
    description: 'Tech and developer internships across French regions outside Paris',
  },
  {
    name: 'Hugging Face Ashby',
    baseUrl: 'https://jobs.ashbyhq.com/huggingface',
    description: 'Direct AI & open-source ML career portal',
  },
  {
    name: 'Mistral AI Career',
    baseUrl: 'https://jobs.ashbyhq.com/mistral.ai',
    description: 'Direct LLM & systems engineering portal',
  },
  {
    name: 'Doctolib Career',
    baseUrl: 'https://jobs.ashbyhq.com/doctolib',
    description: 'HealthTech software & data internships in France',
  },
];

export const createCustomSource = (input: {
  readonly name: string;
  readonly baseUrl: string;
  readonly description?: string;
  readonly searchUrlTemplate?: string;
  readonly cssSelectors?: CustomSource['cssSelectors'];
  readonly collectFrequencyMinutes?: number;
  readonly usePlaywright?: boolean;
}): CustomSource => {
  const trimmedName = input.name.trim();
  const trimmedUrl = input.baseUrl.trim();
  const slug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

  const id = `custom_src_${slug}_${Date.now()}`;

  return {
    id,
    name: trimmedName,
    baseUrl: trimmedUrl,
    description: input.description?.trim() || undefined,
    searchUrlTemplate: input.searchUrlTemplate?.trim() || undefined,
    cssSelectors: input.cssSelectors,
    collectFrequencyMinutes: input.collectFrequencyMinutes ?? 15,
    usePlaywright: Boolean(input.usePlaywright),
    enabled: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
};

export const validateCustomSource = (
  source: { readonly name: string; readonly baseUrl: string },
  existing: readonly CustomSource[]
): { readonly valid: boolean; readonly message?: string } => {
  const name = source.name.trim();
  if (name.length < 2) {
    return {
      valid: false,
      message: 'Source name must be at least 2 characters.',
    };
  }

  const isDuplicate = existing.some(
    (existingSource) => existingSource.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (isDuplicate) {
    return {
      valid: false,
      message: `A source named "${name}" already exists.`,
    };
  }

  const url = source.baseUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return {
      valid: false,
      message: 'Base URL must start with http:// or https://',
    };
  }

  try {
    new URL(url);
  } catch {
    return {
      valid: false,
      message: 'Please provide a valid website URL (e.g. https://example.com/jobs).',
    };
  }

  return { valid: true };
};

export const addCustomSource = (
  existing: readonly CustomSource[],
  newSource: CustomSource
): readonly CustomSource[] => {
  const isDuplicate = existing.some(
    (s) => s.id === newSource.id || s.name.toLowerCase().trim() === newSource.name.toLowerCase().trim()
  );
  if (isDuplicate) {
    return existing;
  }
  return [...existing, newSource];
};

export const removeCustomSource = (
  existing: readonly CustomSource[],
  sourceId: string
): readonly CustomSource[] => {
  return existing.filter((s) => s.id !== sourceId || s.isDefault);
};

export const toggleCustomSource = (
  existing: readonly CustomSource[],
  sourceId: string
): readonly CustomSource[] => {
  return existing.map((s) => (s.id === sourceId ? { ...s, enabled: !s.enabled } : s));
};

export const updateCustomSource = (
  existing: readonly CustomSource[],
  sourceId: string,
  patch: Partial<CustomSource>
): readonly CustomSource[] => {
  return existing.map((s) => {
    if (s.id !== sourceId) return s;
    return {
      ...s,
      ...patch,
      id: s.id,
      isDefault: s.isDefault,
    };
  });
};

export const buildSearchUrlForSource = (
  source: CustomSource,
  keywords: string,
  location?: string
): string => {
  const encKw = encodeURIComponent(keywords.trim());
  const encLoc = encodeURIComponent((location || '').trim());

  if (source.searchUrlTemplate) {
    return source.searchUrlTemplate
      .replace(/{keywords}/g, encKw)
      .replace(/{location}/g, encLoc);
  }

  try {
    const parsed = new URL(source.baseUrl);
    parsed.searchParams.set('q', keywords.trim());
    if (location && location.trim().length > 0) {
      parsed.searchParams.set('l', location.trim());
    }
    return parsed.toString();
  } catch {
    return source.baseUrl;
  }
};

export const formatSourceDomain = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
