import { SearchCriteria } from '../types.ts';
import { AuthorizationStatus, JobBoardSourceConfig } from './jobBoardPolicy.ts';

const encode = (val: string): string => encodeURIComponent(val.trim());

export const BUILTIN_JOB_BOARDS: readonly JobBoardSourceConfig[] = [
  {
    id: 'meteojob',
    name: 'Meteojob',
    siteUrl: 'https://www.meteojob.com',
    tosUrl: 'https://www.meteojob.com/cgu',
    robotsTxtUrl: 'https://www.meteojob.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'snippet', 'publishedDate'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: true,
    envCredentialVars: ['METEOJOB_API_TOKEN', 'METEOJOB_WRITTEN_AUTH'],
    domains: ['meteojob.com'],
    countryScope: 'FR',
    supportsSearchIndexDiscovery: true,
    policySummary:
      'CGU prohibit automated content extraction without written authorization. Strict link_only + multi-query external search index discovery (results flagged externally_unverified).',
    buildExternalSearchUrl: (criteria) =>
      `https://www.meteojob.com/jobs?what=${encode(criteria.keywords)}&where=${encode(criteria.location)}&contract=INTERNSHIP`,
    resolveEffectiveAccessMode: (env = process.env) => {
      if (env.METEOJOB_WRITTEN_AUTH === 'true' && env.METEOJOB_API_TOKEN?.trim()) {
        return {
          accessMode: 'official_api',
          authorizationStatus: 'authorized',
          reason: 'Written Meteojob API authorization configured',
        };
      }
      return {
        accessMode: 'link_only',
        authorizationStatus: 'prohibited_without_agreement',
        reason: 'CGU forbid scraping without written agreement; link discovery only',
      };
    },
  },
  {
    id: 'hellowork',
    name: 'HelloWork',
    siteUrl: 'https://www.hellowork.com',
    tosUrl: 'https://www.hellowork.com/fr-fr/cgu.html',
    robotsTxtUrl: 'https://www.hellowork.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'snippet', 'publishedDate'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: false,
    domains: ['hellowork.com', 'regionsjob.com'],
    countryScope: 'FR',
    supportsSearchIndexDiscovery: true,
    policySummary:
      'WAF-protected and CGU-restricted portal. Uses link_only + authorized web search index discovery without scraping target pages.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${encode(criteria.keywords)}&l=${encode(criteria.location)}&c=Stage`,
  },
  {
    id: 'wttj',
    name: 'Welcome to the Jungle',
    siteUrl: 'https://www.welcometothejungle.com',
    tosUrl: 'https://www.welcometothejungle.com/fr/pages/terms',
    robotsTxtUrl: 'https://www.welcometothejungle.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'snippet', 'publishedDate'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: false,
    domains: ['welcometothejungle.com'],
    countryScope: 'EU',
    supportsSearchIndexDiscovery: true,
    policySummary:
      'No open unauthenticated API; Terms restrict automated scraping. Uses link_only + external search discovery.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.welcometothejungle.com/fr/jobs?query=${encode(criteria.keywords)}&refinementList%5Bcontract_type%5D%5B%5D=internship`,
  },
  {
    id: 'france_travail',
    name: 'France Travail',
    siteUrl: 'https://candidat.francetravail.fr',
    tosUrl: 'https://francetravail.io/data/api/offres-emploi/documentation',
    robotsTxtUrl: 'https://candidat.francetravail.fr/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'requires_credentials',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
      'duration',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: true,
    envCredentialVars: [
      'FRANCE_TRAVAIL_CLIENT_ID',
      'FRANCE_TRAVAIL_CLIENT_SECRET',
      'FRANCE_TRAVAIL_API_ENABLED',
      'FRANCE_TRAVAIL_API_SUSPENDED',
    ],
    domains: ['francetravail.fr', 'pole-emploi.fr'],
    countryScope: 'FR',
    supportsSearchIndexDiscovery: false,
    apiEndpoint: 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
    policySummary:
      'Official Offres d emploi v2 API via OAuth2 client credentials; subject to access terms and suspension checks. Never falls back to HTML scraping.',
    buildExternalSearchUrl: (criteria) =>
      `https://candidat.francetravail.fr/offres/recherche?motsCles=${encode(criteria.keywords)}&typeContrat=STG&offresPartenaires=true`,
    resolveEffectiveAccessMode: (env = process.env) => {
      if (env.FRANCE_TRAVAIL_API_SUSPENDED === 'true') {
        return {
          accessMode: 'link_only',
          authorizationStatus: 'suspended' as AuthorizationStatus,
          reason: 'France Travail API marked suspended; official search link only (no scraping)',
        };
      }
      if (env.FRANCE_TRAVAIL_API_ENABLED === 'false') {
        return {
          accessMode: 'disabled',
          authorizationStatus: 'unavailable',
          reason: 'France Travail API disabled by configuration',
        };
      }
      const hasCreds = Boolean(
        env.FRANCE_TRAVAIL_CLIENT_ID?.trim() && env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim()
      );
      if (!hasCreds) {
        return {
          accessMode: 'link_only',
          authorizationStatus: 'requires_credentials',
          reason:
            'FRANCE_TRAVAIL_CLIENT_ID / SECRET not configured; official external search link only',
        };
      }
      return {
        accessMode: 'official_api',
        authorizationStatus: 'authorized',
        reason: 'Official France Travail API v2 credentials active',
      };
    },
  },
  {
    id: 'apec',
    name: 'Apec',
    siteUrl: 'https://www.apec.fr',
    tosUrl: 'https://www.apec.fr/tous-nos-services/conditions-generales-dutilisation.html',
    robotsTxtUrl: 'https://www.apec.fr/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'requires_written_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'snippet', 'publishedDate'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: false,
    domains: ['apec.fr'],
    countryScope: 'FR',
    supportsSearchIndexDiscovery: true,
    policySummary:
      'Public visibility does not authorize automated extraction; Apec CGU require partnership/agreement. Configured as link_only + external search discovery.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${encode(criteria.keywords)}&lieux=${encode(criteria.location)}&typesContrat=143684`,
  },
  {
    id: 'lesjeudis',
    name: 'LesJeudis',
    siteUrl: 'https://lesjeudis.com',
    tosUrl: 'https://lesjeudis.com/cgu',
    robotsTxtUrl: 'https://lesjeudis.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'snippet', 'publishedDate'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: false,
    domains: ['lesjeudis.com'],
    countryScope: 'FR',
    supportsSearchIndexDiscovery: true,
    policySummary:
      'Specialized French IT board whose CGU forbid automated scraping. Uses link_only + external search index discovery.',
    buildExternalSearchUrl: (criteria) =>
      `https://lesjeudis.com/offres?q=${encode(criteria.keywords)}&l=${encode(criteria.location)}`,
  },
  {
    id: 'afjv',
    name: 'AFJV',
    siteUrl: 'https://emploi.afjv.com',
    tosUrl: 'https://afjv.com/a_propos.php#mentions_legales',
    robotsTxtUrl: 'https://emploi.afjv.com/robots.txt',
    accessMode: 'rss_feed',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['emploi.afjv.com', 'afjv.com'],
    countryScope: 'FR',
    rssFeedUrls: ['https://emploi.afjv.com/rss.xml'],
    policySummary:
      'Official AFJV RSS feed + robots.txt-allowed Schema.org JobPosting detail inspection for IT, 3D, and game engineering internships in France.',
    buildExternalSearchUrl: (criteria) =>
      `https://emploi.afjv.com/recherche_emploi.php?mot_cle=${encode(criteria.keywords)}`,
  },
  {
    id: 'remotive',
    name: 'Remotive',
    siteUrl: 'https://remotive.com',
    tosUrl: 'https://remotive.com/api-documentation',
    robotsTxtUrl: 'https://remotive.com/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['remotive.com'],
    countryScope: 'GLOBAL',
    apiEndpoint: 'https://remotive.com/api/remote-jobs',
    policySummary:
      'Official public Remotive Jobs JSON API (rate-limited, requires linking back to original Remotive URL).',
    buildExternalSearchUrl: (criteria) =>
      `https://remotive.com/remote-jobs?query=${encode(criteria.keywords)}`,
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    siteUrl: 'https://remoteok.com',
    tosUrl: 'https://remoteok.com/api',
    robotsTxtUrl: 'https://remoteok.com/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
      'duration',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['remoteok.com'],
    countryScope: 'GLOBAL',
    apiEndpoint: 'https://remoteok.com/api',
    policySummary:
      'Official public Remote OK JSON feed with explicit attribution & direct URL link-back requirement.',
    buildExternalSearchUrl: (criteria) =>
      `https://remoteok.com/?search=${encode(criteria.keywords)}`,
  },
  {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    siteUrl: 'https://weworkremotely.com',
    tosUrl: 'https://weworkremotely.com/terms',
    robotsTxtUrl: 'https://weworkremotely.com/robots.txt',
    accessMode: 'rss_feed',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['title', 'organization', 'location', 'url', 'description', 'publishedDate'],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['weworkremotely.com'],
    countryScope: 'GLOBAL',
    rssFeedUrls: [
      'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
      'https://weworkremotely.com/remote-jobs.rss',
    ],
    policySummary:
      'Official public RSS feeds checked against robots.txt before consumption.',
    buildExternalSearchUrl: (criteria) =>
      `https://weworkremotely.com/remote-jobs/search?term=${encode(criteria.keywords)}`,
  },
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    siteUrl: 'https://www.arbeitnow.com',
    tosUrl: 'https://www.arbeitnow.com/api/job-board-api',
    robotsTxtUrl: 'https://www.arbeitnow.com/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
      'duration',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['arbeitnow.com'],
    countryScope: 'EU',
    apiEndpoint: 'https://www.arbeitnow.com/api/job-board-api',
    policySummary:
      'Public paginated European & remote tech jobs JSON API including internship and working-student offers.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.arbeitnow.com/jobs?search=${encode(criteria.keywords)}`,
  },
  {
    id: 'himalayas',
    name: 'Himalayas',
    siteUrl: 'https://himalayas.app',
    tosUrl: 'https://himalayas.app/jobs/api',
    robotsTxtUrl: 'https://himalayas.app/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
      'duration',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['himalayas.app'],
    countryScope: 'GLOBAL',
    apiEndpoint: 'https://himalayas.app/jobs/api',
    policySummary:
      'Public cursor-paginated Himalayas JSON API providing structured remote/global tech positions.',
    buildExternalSearchUrl: (criteria) =>
      `https://himalayas.app/jobs?q=${encode(criteria.keywords)}`,
  },
  {
    id: 'jobicy',
    name: 'Jobicy',
    siteUrl: 'https://jobicy.com',
    tosUrl: 'https://jobicy.com/api/v2/remote-jobs',
    robotsTxtUrl: 'https://jobicy.com/robots.txt',
    accessMode: 'official_api',
    authorizationStatus: 'authorized',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: [
      'title',
      'organization',
      'location',
      'url',
      'description',
      'publishedDate',
      'contractType',
      'duration',
    ],
    requiresWrittenAgreement: false,
    requiresApiCredentials: false,
    domains: ['jobicy.com'],
    countryScope: 'GLOBAL',
    apiEndpoint: 'https://jobicy.com/api/v2/remote-jobs',
    policySummary:
      'Public Jobicy v2 JSON API with direct credit & original URL redirect compliance.',
    buildExternalSearchUrl: (criteria) =>
      `https://jobicy.com/jobs?q=${encode(criteria.keywords)}`,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    siteUrl: 'https://www.linkedin.com/jobs',
    tosUrl: 'https://www.linkedin.com/legal/user-agreement',
    robotsTxtUrl: 'https://www.linkedin.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['url'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: true,
    domains: ['linkedin.com'],
    countryScope: 'GLOBAL',
    supportsSearchIndexDiscovery: false,
    policySummary:
      'User Agreement strictly forbids automated scraping. Official external search URL only.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encode(criteria.keywords)}&location=${encode(criteria.location)}&f_E=1`,
  },
  {
    id: 'indeed',
    name: 'Indeed',
    siteUrl: 'https://fr.indeed.com',
    tosUrl: 'https://fr.indeed.com/legal',
    robotsTxtUrl: 'https://fr.indeed.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['url'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: true,
    domains: ['indeed.com', 'fr.indeed.com'],
    countryScope: 'GLOBAL',
    supportsSearchIndexDiscovery: false,
    policySummary:
      'Anti-bot / ToS protected portal. Official external search URL only.',
    buildExternalSearchUrl: (criteria) =>
      `https://fr.indeed.com/jobs?q=${encode(criteria.keywords)}&l=${encode(criteria.location)}&jt=internship`,
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    siteUrl: 'https://www.glassdoor.fr',
    tosUrl: 'https://www.glassdoor.fr/about/terms.htm',
    robotsTxtUrl: 'https://www.glassdoor.fr/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['url'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: true,
    domains: ['glassdoor.fr', 'glassdoor.com'],
    countryScope: 'GLOBAL',
    supportsSearchIndexDiscovery: false,
    policySummary:
      'Anti-bot / ToS protected portal. Official external search URL only.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.glassdoor.fr/Emploi/france-${encode(criteria.keywords.replace(/\s+/g, '-'))}-emplois-SRCH_IL.0,6_IN86.htm`,
  },
  {
    id: 'wellfound',
    name: 'Wellfound',
    siteUrl: 'https://wellfound.com',
    tosUrl: 'https://wellfound.com/terms',
    robotsTxtUrl: 'https://wellfound.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['url'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: false,
    domains: ['wellfound.com', 'angel.co'],
    countryScope: 'GLOBAL',
    supportsSearchIndexDiscovery: false,
    policySummary:
      'Auth / anti-bot protected startup network (robots.txt disallows /_jobs/). Official external search URL only.',
    buildExternalSearchUrl: (criteria) =>
      `https://wellfound.com/jobs?q=${encode(criteria.keywords)}`,
  },
  {
    id: 'jobteaser',
    name: 'JobTeaser',
    siteUrl: 'https://www.jobteaser.com',
    tosUrl: 'https://www.jobteaser.com/fr/terms',
    robotsTxtUrl: 'https://www.jobteaser.com/robots.txt',
    accessMode: 'link_only',
    authorizationStatus: 'prohibited_without_agreement',
    lastTosCheckedAt: '2026-11-17',
    allowedFields: ['url'],
    requiresWrittenAgreement: true,
    requiresApiCredentials: true,
    domains: ['jobteaser.com'],
    countryScope: 'EU',
    supportsSearchIndexDiscovery: false,
    policySummary:
      'Authenticated campus career network; auth bypass prohibited. Official external search URL only.',
    buildExternalSearchUrl: (criteria) =>
      `https://www.jobteaser.com/fr/job-offers?query=${encode(criteria.keywords)}`,
  },
];

export const getJobBoardById = (id: string): JobBoardSourceConfig | undefined =>
  BUILTIN_JOB_BOARDS.find((b) => b.id.toLowerCase() === id.trim().toLowerCase());

export const getJobBoardByName = (name: string): JobBoardSourceConfig | undefined =>
  BUILTIN_JOB_BOARDS.find((b) => b.name.toLowerCase() === name.trim().toLowerCase());

export const findJobBoardByDomain = (hostnameOrUrl: string): JobBoardSourceConfig | undefined => {
  let host = hostnameOrUrl.toLowerCase().trim();
  try {
    if (host.startsWith('http://') || host.startsWith('https://')) {
      host = new URL(host).hostname.toLowerCase();
    }
  } catch {
    // Keep raw token
  }
  const cleanHost = host.replace(/^www\./, '');
  return BUILTIN_JOB_BOARDS.find((board) =>
    board.domains.some((dom) => cleanHost === dom || cleanHost.endsWith(`.${dom}`))
  );
};

export const listJobBoardConfigs = (): readonly JobBoardSourceConfig[] => BUILTIN_JOB_BOARDS;

export const resolveJobBoardsForCriteria = (
  criteria: SearchCriteria
): readonly JobBoardSourceConfig[] => {
  if (!criteria.sources || criteria.sources.length === 0) {
    return BUILTIN_JOB_BOARDS;
  }
  const selected = new Set(criteria.sources.map((s) => s.trim().toLowerCase()));
  return BUILTIN_JOB_BOARDS.filter((board) => selected.has(board.name.toLowerCase()));
};
