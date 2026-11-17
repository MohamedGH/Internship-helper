import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndScoreOffers, stripAccents } from '../filters/criteriaMatcher.ts';
import { deduplicateScrapedOffers } from '../filters/deduplicator.ts';
import { getJobBoardById } from '../jobboards/jobBoardRegistry.ts';
import { WebSearchDiscoveryProvider } from '../jobboards/searchDiscoveryProvider.ts';
import { normalizeScrapedOffer } from '../normalizer.ts';
import { createAfjvProvider, parseAfjvRssFeed } from '../platforms/afjvProvider.ts';
import { createArbeitnowProvider, parseArbeitnowPayload } from '../platforms/arbeitnowProvider.ts';
import { createFranceTravailPlatformProvider } from '../platforms/franceTravailProvider.ts';
import {
  buildMultipliedSiteQueries,
  createDiscoveryOrLinkPlatformAdapter,
  createGenericWebDiscoveryAdapter,
} from '../platforms/genericSearchProvider.ts';
import { createHimalayasProvider, parseHimalayasPayload } from '../platforms/himalayasProvider.ts';
import { createJobicyProvider, parseJobicyPayload } from '../platforms/jobicyProvider.ts';
import {
  buildMultipliedQueries,
  deriveProfileContext,
  enrichCriteriaWithProfile,
} from '../platforms/queryPlanner.ts';
import { createRemoteOkProvider, parseRemoteOkPayload } from '../platforms/remoteOkProvider.ts';
import { createRemotivePlatformProvider } from '../platforms/remotiveProvider.ts';
import { createWeWorkRemotelyProvider } from '../platforms/weWorkRemotelyProvider.ts';
import { SearchCriteria } from '../types.ts';

const baseCriteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({
  keywords: 'Stage Développement Web React',
  location: 'Lille',
  workMode: 'all',
  sources: [],
  ...overrides,
});

const mockResponse = (body: unknown, status = 200, contentType = 'application/json'): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });

test('queryPlanner derives dynamic bilingual FR/EN queries and skills from any candidate profile', () => {
  const criteria: SearchCriteria = {
    keywords: 'Stage Développement Web',
    location: '',
    workMode: 'all',
    sources: [],
    domains: ['Développement web'],
    profile: {
      location: 'Lille',
      degree: 'L3 MIAGE',
      targetRole: 'Développeur Full-Stack / Web',
      skills: ['React', 'PHP', 'SQL'],
      experiences: ['Built REST APIs in Laravel and React'],
      rawCvText: 'Bac+3 Informatique TypeScript Tailwind',
    },
  };

  const enriched = enrichCriteriaWithProfile(criteria);
  assert.equal(enriched.location, 'Lille');
  assert.equal(enriched.educationLevel, 'L3 MIAGE');
  assert.ok(enriched.skills?.includes('React'));
  assert.ok(enriched.skills?.includes('PHP'));
  assert.ok(enriched.skills?.includes('Laravel'));
  assert.ok(enriched.skills?.includes('TypeScript'));

  const signals = deriveProfileContext(enriched);
  assert.equal(signals.primaryCity, 'Lille');
  assert.ok(signals.searchTokens.includes('react'));

  const queries = buildMultipliedQueries(enriched, { maxQueries: 10 });
  assert.ok(queries.length >= 6);
  assert.ok(queries.some((q) => q.language === 'fr' && /Lille/i.test(q.query)));
  assert.ok(queries.some((q) => q.language === 'fr' && /L3 MIAGE/i.test(q.query)));
  assert.ok(queries.some((q) => q.language === 'en' && /\bintern\b/i.test(q.query)));
});

test('Remote OK parser ignores legal notice element 0 and provider collects offline', async () => {
  const payload = [
    { legal: 'Notice: Remote OK API requires attribution' },
    {
      id: 901,
      position: 'Frontend React Intern',
      company: 'EuroCloud',
      tags: ['react', 'typescript', 'intern'],
      location: 'Worldwide',
      description: '<p>3 months remote internship building React interfaces.</p>',
      date: '2026-11-15T10:00:00Z',
      url: 'https://remoteok.com/remote-jobs/901-frontend-react-intern',
      apply_url: 'https://remoteok.com/l/901',
    },
  ];

  const parsed = parseRemoteOkPayload(payload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].organization, 'EuroCloud');
  assert.equal(parsed[0].workMode, 'Remote');
  assert.equal(parsed[0].duration, '3 months');

  const config = getJobBoardById('remoteok');
  assert.ok(config);
  const provider = createRemoteOkProvider(config, {
    skipSecurityForTest: true,
    fetchFn: async () => mockResponse(payload),
  });
  const res = await provider.collect(baseCriteria());
  assert.ok(res.status === 'ok' || res.status === 'cached');
  assert.equal(res.offers.length, 1);
  assert.equal(res.offers[0].collectionMode, 'collected');
});

test('Arbeitnow paginated provider collects across multiple pages cleanly', async () => {
  const page1 = {
    data: [
      {
        slug: 'php-laravel-intern-1',
        company_name: 'NordTech',
        title: 'PHP Laravel Web Developer Intern',
        description: '<p>4 mois internship starting 2027-03-01 in Lille or remote.</p>',
        remote: true,
        url: 'https://www.arbeitnow.com/jobs/php-laravel-intern-1',
        tags: ['PHP', 'Laravel'],
        job_types: ['Internship'],
        location: 'Lille',
        created_at: 1794700800,
      },
    ],
    links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' },
  };
  const page2 = {
    data: [
      {
        slug: 'react-intern-2',
        company_name: 'WebCraft',
        title: 'React Developer Stage',
        description: '<p>6 months stage building dashboards.</p>',
        remote: true,
        url: 'https://www.arbeitnow.com/jobs/react-intern-2',
        tags: ['React'],
        job_types: ['Internship'],
        location: 'Remote',
        created_at: 1794700800,
      },
    ],
    links: { next: null },
  };

  assert.equal(parseArbeitnowPayload(page1).length, 1);

  const config = getJobBoardById('arbeitnow');
  assert.ok(config);
  const requestedUrls: string[] = [];
  const provider = createArbeitnowProvider(config, {
    maxPages: 2,
    skipSecurityForTest: true,
    fetchFn: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      return url.includes('page=2') ? mockResponse(page2) : mockResponse(page1);
    },
  });

  const res = await provider.collect(baseCriteria());
  assert.equal(requestedUrls.length, 2);
  assert.equal(res.offers.length, 2);
});

test('Himalayas cursor-paginated provider collects across cursor pages', async () => {
  const page1 = {
    jobs: [
      {
        title: 'Junior Software Intern',
        companyName: 'CloudScale',
        employmentType: 'Internship',
        locationRestrictions: ['France', 'Europe'],
        categories: ['TypeScript', 'Node.js'],
        description: '<p>6 month remote internship in Europe.</p>',
        pubDate: 1794700800,
        guid: 'https://himalayas.app/companies/cloudscale/jobs/junior-software-intern',
        applicationLink: 'https://himalayas.app/companies/cloudscale/jobs/junior-software-intern',
      },
    ],
    nextCursor: 'cursor_2',
  };
  const page2 = {
    jobs: [
      {
        title: 'Data Analyst Intern',
        companyName: 'MetricHub',
        employmentType: 'Internship',
        locationRestrictions: ['Worldwide'],
        categories: ['SQL', 'Python'],
        description: '<p>4 month remote SQL internship.</p>',
        pubDate: 1794700800,
        guid: 'https://himalayas.app/companies/metrichub/jobs/data-analyst-intern',
      },
    ],
    nextCursor: null,
  };

  assert.equal(parseHimalayasPayload(page1).length, 1);

  const config = getJobBoardById('himalayas');
  assert.ok(config);
  const provider = createHimalayasProvider(config, {
    maxPages: 2,
    skipSecurityForTest: true,
    fetchFn: async (input) =>
      String(input).includes('cursor=cursor_2') ? mockResponse(page2) : mockResponse(page1),
  });
  const res = await provider.collect(baseCriteria());
  assert.equal(res.offers.length, 2);
});

test('Jobicy API v2 parser and provider execute base + skill tag query', async () => {
  const payload = {
    jobs: [
      {
        id: 551,
        url: 'https://jobicy.com/jobs/551-react-intern',
        jobTitle: 'React Engineering Intern',
        companyName: 'StudioRemote',
        jobIndustry: ['React', 'JavaScript'],
        jobType: ['Internship'],
        jobGeo: 'Europe',
        jobLevel: 'Junior',
        jobDescription: '<p>Remote internship building web apps in React and TypeScript.</p>',
        pubDate: '2026-11-16 09:00:00',
      },
    ],
  };

  assert.equal(parseJobicyPayload(payload).length, 1);

  const config = getJobBoardById('jobicy');
  assert.ok(config);
  const urls: string[] = [];
  const provider = createJobicyProvider(config, {
    skipSecurityForTest: true,
    fetchFn: async (input) => {
      urls.push(String(input));
      return mockResponse(payload);
    },
  });

  const res = await provider.collect(baseCriteria({ skills: ['React'] }));
  assert.ok(urls.some((u) => u.includes('tag=react')));
  assert.equal(res.offers.length, 1);
});

test('AFJV RSS parser extracts stage offers and provider skips network when cached or mocked', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <item>
      <title>Stage Développeur Web React / PHP - Studio Nord (Lille)</title>
      <link>https://emploi.afjv.com/emploi-jeux-video/2026-stage-web-99999.htm</link>
      <description><![CDATA[<p>Stage de 4 mois en développement web React et PHP à Lille.</p>]]></description>
      <pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate>
      <category>Programmation</category>
    </item>
  </channel></rss>`;

  const parsed = parseAfjvRssFeed(xml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].organization, 'Studio Nord');
  assert.equal(parsed[0].location, 'Lille');
  assert.equal(parsed[0].contractType, 'Stage / Internship');

  const config = getJobBoardById('afjv');
  assert.ok(config);
  const provider = createAfjvProvider(config, {
    skipSecurityForTest: true,
    enrichDetailPages: false,
    fetchFn: async () => mockResponse(xml, 200, 'application/xml'),
  });
  const res = await provider.collect(baseCriteria());
  assert.equal(res.offers.length, 1);
  assert.equal(res.offers[0].accessMode, 'rss_feed');
});

test('Remotive and We Work Remotely providers use English/skill queries and RSS parsing cleanly', async () => {
  const remotiveConfig = getJobBoardById('remotive');
  assert.ok(remotiveConfig);
  const remotiveUrls: string[] = [];
  const remotiveProvider = createRemotivePlatformProvider(remotiveConfig, {
    skipSecurityForTest: true,
    maxQueries: 2,
    fetchFn: async (input) => {
      remotiveUrls.push(String(input));
      return mockResponse({
        jobs: [
          {
            id: 77,
            url: 'https://remotive.com/remote-jobs/software-dev/react-intern-77',
            title: 'React Web Developer Intern',
            company_name: 'RemoteFirst',
            candidate_required_location: 'Europe',
            job_type: 'internship',
            publication_date: '2026-11-14T12:00:00',
            tags: ['React', 'TypeScript'],
            description: '<p>Remote 4 month React internship.</p>',
          },
        ],
      });
    },
  });

  const remotiveRes = await remotiveProvider.collect(
    baseCriteria({ keywords: 'Stage Développement Web', skills: ['React'] })
  );
  assert.ok(remotiveUrls.some((u) => u.includes('search=intern')));
  assert.ok(!remotiveUrls.some((u) => u.includes('Développement')));
  assert.equal(remotiveRes.offers.length, 1);

  const wwrConfig = getJobBoardById('weworkremotely');
  assert.ok(wwrConfig);
  const wwrXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <item>
      <title>AcmeLabs: Full-Stack Web Developer Intern</title>
      <link>https://weworkremotely.com/remote-jobs/acmelabs-fullstack-intern</link>
      <description><![CDATA[<p>Remote React and Node internship.</p>]]></description>
      <pubDate>Mon, 16 Nov 2026 08:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;

  const wwrProvider = createWeWorkRemotelyProvider(wwrConfig, {
    skipSecurityForTest: true,
    fetchFn: async () => mockResponse(wwrXml, 200, 'application/xml'),
  });
  const wwrRes = await wwrProvider.collect(baseCriteria());
  assert.equal(wwrRes.offers.length, 1);
  assert.equal(wwrRes.offers[0].organization, 'AcmeLabs');
});

test('France Travail platform provider handles OAuth2 pagination and never scrapes HTML on 503', async () => {
  const ftConfig = getJobBoardById('france_travail');
  assert.ok(ftConfig);

  const calls: string[] = [];
  const ftOkProvider = createFranceTravailPlatformProvider(ftConfig, {
    env: {
      FRANCE_TRAVAIL_CLIENT_ID: 'id_123',
      FRANCE_TRAVAIL_CLIENT_SECRET: 'sec_456',
    },
    maxPages: 1,
    maxQueries: 2,
    tokenEndpoint: 'https://auth.ft.example/token',
    searchEndpoint: 'https://api.ft.example/search',
    fetchFn: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('auth.ft.example')) {
        return mockResponse({ access_token: 'tok_abc' });
      }
      return mockResponse({
        resultats: [
          {
            id: 'FT_101',
            intitule: 'Stage Développeur Web PHP / React (H/F)',
            description: 'Stage de 4 mois à Lille en développement web PHP et React.',
            dateCreation: '2026-11-15T09:00:00Z',
            typeContrat: 'STG',
            entreprise: { nom: 'NordWeb' },
            lieuTravail: { libelle: '59 - Lille' },
            origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/FT_101' },
          },
        ],
      });
    },
  });

  const okRes = await ftOkProvider.collect(baseCriteria({ skills: ['PHP', 'React'] }));
  assert.equal(okRes.status, 'ok');
  assert.equal(okRes.offers.length, 1);
  assert.ok(calls.filter((c) => c.includes('api.ft.example')).length >= 1);

  const ft503Provider = createFranceTravailPlatformProvider(ftConfig, {
    env: {
      FRANCE_TRAVAIL_CLIENT_ID: 'id_123',
      FRANCE_TRAVAIL_CLIENT_SECRET: 'sec_456',
    },
    tokenEndpoint: 'https://auth.ft.example/token',
    searchEndpoint: 'https://api.ft.example/search',
    fetchFn: async (input) => {
      const url = String(input);
      if (url.includes('auth.ft.example')) {
        return mockResponse({ access_token: 'tok_abc' });
      }
      return mockResponse({ error: 'service suspended' }, 503);
    },
  });
  const suspendedRes = await ft503Provider.collect(baseCriteria());
  assert.equal(suspendedRes.status, 'error');
  assert.equal(suspendedRes.accessMode, 'link_only');
  assert.equal(suspendedRes.externalSearchLinks.length, 1);
});

test('multi-query site discovery flags results as externally_unverified and generic discovery covers FR/EN', async () => {
  const lesjeudis = getJobBoardById('lesjeudis');
  assert.ok(lesjeudis);

  const siteQueries = buildMultipliedSiteQueries(baseCriteria({ skills: ['React', 'PHP'] }), lesjeudis, 3);
  assert.equal(siteQueries.length, 3);
  assert.ok(siteQueries.every((q) => q.query.startsWith('site:lesjeudis.com ')));

  const stubDiscovery: WebSearchDiscoveryProvider = {
    id: 'stub_searxng',
    name: 'StubSearXNG',
    isConfigured: () => true,
    search: async (q) => [
      {
        title: 'Stage Développeur React - WebStudio | LesJeudis',
        url: 'https://lesjeudis.com/offres/stage-react-123',
        snippet: `Indexed hit for ${q.query}`,
        domain: 'lesjeudis.com',
        discoveryProvider: 'StubSearXNG',
        searchQuery: q.query,
      },
    ],
  };

  const boardAdapter = createDiscoveryOrLinkPlatformAdapter(lesjeudis, {
    discoveryProvider: stubDiscovery,
    maxQueriesPerBoard: 2,
  });
  const boardRes = await boardAdapter.collect(baseCriteria());
  assert.equal(boardRes.accessMode, 'search_index');
  assert.equal(boardRes.offers.length, 1);
  assert.equal(boardRes.offers[0].collectionMode, 'discovered');

  const genericAdapter = createGenericWebDiscoveryAdapter(stubDiscovery, { maxQueries: 2 });
  const genRes = await genericAdapter.collect(baseCriteria());
  assert.equal(genRes.status, 'ok');
  assert.equal(genRes.offers.length, 1);
});

test('accent-insensitive deduplicator, criteriaMatcher reasons, metro suburbs, and null preservation', () => {
  assert.equal(stripAccents('Développement Économique'), 'developpement economique');

  const apecDiscovered = normalizeScrapedOffer({
    title: 'Stage Développeur Web PHP React',
    organization: 'Nord Studio',
    location: 'Unspecified',
    description: 'Stage web PHP React',
    originalUrl: 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/123',
    source: 'Apec',
    isExternalDiscovery: true,
    collectionMode: 'discovered',
    accessMode: 'search_index',
  });

  const directCareer = normalizeScrapedOffer({
    title: 'Stage Developpeur Web PHP React',
    organization: 'Nord Studio',
    location: "Villeneuve-d'Ascq",
    workMode: 'Hybrid',
    duration: null,
    startDate: null,
    description: '• Développer des interfaces React et API Laravel/PHP\n• Concevoir les requêtes SQL',
    originalUrl: 'https://boards.greenhouse.io/nordstudio/jobs/456?utm_source=test',
    applicationUrl: 'https://boards.greenhouse.io/nordstudio/jobs/456',
    source: 'Company Career Page',
    isAtsApi: true,
    collectionMode: 'collected',
    accessMode: 'ats_api',
  });

  assert.ok(apecDiscovered);
  assert.ok(directCareer);
  assert.equal(directCareer.durationMonths, null);
  assert.equal(directCareer.startDate, null);
  assert.ok((directCareer.missions?.length ?? 0) >= 2);

  const deduped = deduplicateScrapedOffers([apecDiscovered, directCareer]);
  assert.equal(deduped.length, 1);
  assert.deepEqual(deduped[0].sources, ['Company Career Page', 'Apec']);
  assert.equal(deduped[0].alternateUrls.length, 1);

  const scored = filterAndScoreOffers(deduped, {
    keywords: 'Stage Développement Web',
    location: 'Lille',
    workMode: 'all',
    minDurationMonths: 3,
    maxDurationMonths: 6,
    startDateFrom: '2027-01-01',
    startDateTo: '2027-09-01',
    domains: ['Développement web'],
    skills: ['PHP', 'React'],
    sources: ['Company Career Page', 'Apec'],
  });

  assert.equal(scored.length, 1);
  assert.ok((scored[0].matchReasons?.length ?? 0) >= 3);
  assert.ok(scored[0].matchReasons?.some((r) => r.includes('Nearby metro')));
  assert.ok(scored[0].matchReasons?.some((r) => r.includes('PHP')));
});
