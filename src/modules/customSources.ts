import { CustomSource, SourceProvider } from '../types/domain';

export const DEFAULT_BUILTIN_SOURCES: readonly CustomSource[] = [
  {
    id: 'src_wttj',
    name: SourceProvider.WelcomeToTheJungle,
    baseUrl: 'https://www.welcometothejungle.com/fr/jobs',
    searchUrlTemplate:
      'https://www.welcometothejungle.com/fr/jobs?query={keywords}&refinementList%5Bcontract_type%5D%5B%5D=internship',
    description: 'French & European tech companies and innovative startups',
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
    description: 'Global professional network & high-volume internship listings',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_indeed',
    name: SourceProvider.Indeed,
    baseUrl: 'https://fr.indeed.com',
    searchUrlTemplate: 'https://fr.indeed.com/jobs?q={keywords}&l={location}&jt=internship',
    description: 'Broad job board aggregator with direct campus opportunities',
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
    description: 'Leading French employment, PFE, and internship portal',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_jobteaser',
    name: SourceProvider.JobTeaser,
    baseUrl: 'https://www.jobteaser.com',
    searchUrlTemplate: 'https://www.jobteaser.com/fr/job-offers?query={keywords}',
    description: 'Direct university recruiting and grandes écoles career network',
    enabled: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'src_company_career',
    name: SourceProvider.CompanyCareer,
    baseUrl: 'https://careers.google.com',
    description: 'Direct enterprise career portals, Lever, Greenhouse, and Ashby',
    enabled: true,
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
    name: 'Station F Jobs',
    baseUrl: 'https://jobs.stationf.co',
    searchUrlTemplate: 'https://jobs.stationf.co/jobs?query={keywords}',
    description: 'Startup campus in Paris — 1,000+ tech startups recruiting interns',
  },
  {
    name: 'Meteojob',
    baseUrl: 'https://www.meteojob.com',
    searchUrlTemplate: 'https://www.meteojob.com/jobs?what={keywords}&where={location}',
    description: 'Matching engine for stages and early career tech positions in France',
  },
  {
    name: 'Laou Tech',
    baseUrl: 'https://www.laou.fr',
    searchUrlTemplate: 'https://www.laou.fr/offres',
    description: 'Tech and developer internships across French regions outside Paris',
  },
  {
    name: 'RemoteOK',
    baseUrl: 'https://remoteok.com',
    searchUrlTemplate: 'https://remoteok.com/remote-{keywords}-jobs',
    description: 'Global remote internships and junior software engineering roles',
  },
  {
    name: 'AFJV Jeux Vidéo',
    baseUrl: 'https://emploi.afjv.com',
    searchUrlTemplate: 'https://emploi.afjv.com/recherche_emploi.php?mot_cle={keywords}',
    description: 'French video game industry, 3D graphics, and game engine internships',
  },
  {
    name: 'LesJeudis Tech',
    baseUrl: 'https://www.lesjeudis.com',
    searchUrlTemplate: 'https://www.lesjeudis.com/recherche?q={keywords}&l={location}',
    description: 'Specialized IT, software engineering, and DevOps job board',
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
      id: s.id, // Immutable ID
      isDefault: s.isDefault, // Immutable default flag
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
