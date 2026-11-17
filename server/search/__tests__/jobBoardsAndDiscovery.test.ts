import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndScoreOffers } from '../filters/criteriaMatcher.ts';
import { deduplicateScrapedOffers } from '../filters/deduplicator.ts';
import {
  JobBoardSourceConfig,
  sanitizeOfferByPolicy,
  toPolicySnapshot,
} from '../jobboards/jobBoardPolicy.ts';
import {
  createFranceTravailApiProvider,
  createLinkOnlyOrDiscoveryProvider,
  createRemotiveApiProvider,
  createRssJobBoardProvider,
  mapDiscoveryHitToRawOffer,
  parseRssOrAtomFeed,
} from '../jobboards/jobBoardProvider.ts';
import {
  BUILTIN_JOB_BOARDS,
  findJobBoardByDomain,
  getJobBoardById,
} from '../jobboards/jobBoardRegistry.ts';
import {
  WebSearchDiscoveryProvider,
  buildDiscoveryQueries,
  createBraveSearchDiscoveryProvider,
  createSearxngDiscoveryProvider,
  resolveActiveDiscoveryProvider,
} from '../jobboards/searchDiscoveryProvider.ts';
import { normalizeScrapedOffer } from '../normalizer.ts';
import { runScrapingSearch } from '../scraperEngine.ts';
import { ScraperConnector, SearchCriteria } from '../types.ts';

const baseCriteria: SearchCriteria = {
  keywords: 'Stage React Node.js',
  domains: ['développement web'],
  skills: ['JS', 'Postgres'],
  location: 'Paris',
  radiusKm: 30,
  minDurationMonths: 4,
  maxDurationMonths: 6,
  startDateFrom: '2027-02-01',
  startDateTo: '2027-06-01',
  workMode: 'all',
  educationLevel: 'Bac+5',
  languages: ['French', 'English'],
  includeExternalDiscovery: true,
  sources: ['Company Career Page', 'France Travail', 'Meteojob', 'HelloWork', 'Remotive'],
};

test('jobBoardRegistry enforces ToS/CGU access policies for Meteojob, HelloWork, WTTJ, Apec, and France Travail', () => {
  const meteojob = getJobBoardById('meteojob');
  const hellowork = getJobBoardById('hellowork');
  const wttj = getJobBoardById('wttj');
  const apec = getJobBoardById('apec');
  const ft = getJobBoardById('france_travail');

  assert.ok(meteojob && hellowork && wttj && apec && ft);
  assert.equal(meteojob.accessMode, 'link_only');
  assert.equal(meteojob.authorizationStatus, 'prohibited_without_agreement');
  assert.equal(hellowork.accessMode, 'link_only');
  assert.equal(wttj.accessMode, 'link_only');
  assert.equal(apec.accessMode, 'link_only');

  // Meteojob stays link_only unless both written auth & token are explicitly present
  assert.equal(toPolicySnapshot(meteojob, {}).accessMode, 'link_only');
  assert.equal(
    toPolicySnapshot(meteojob, { METEOJOB_WRITTEN_AUTH: 'true', METEOJOB_API_TOKEN: 'tok_123' }).accessMode,
    'official_api'
  );

  // France Travail resolves dynamically based on credentials, suspension, and enable flag
  assert.equal(toPolicySnapshot(ft, {}).accessMode, 'link_only');
  assert.equal(toPolicySnapshot(ft, {}).authorizationStatus, 'requires_credentials');
  assert.equal(
    toPolicySnapshot(ft, {
      FRANCE_TRAVAIL_CLIENT_ID: 'id',
      FRANCE_TRAVAIL_CLIENT_SECRET: 'secret',
    }).accessMode,
    'official_api'
  );
  assert.equal(
    toPolicySnapshot(ft, {
      FRANCE_TRAVAIL_CLIENT_ID: 'id',
      FRANCE_TRAVAIL_CLIENT_SECRET: 'secret',
      FRANCE_TRAVAIL_API_SUSPENDED: 'true',
    }).accessMode,
    'link_only'
  );
  assert.equal(
    toPolicySnapshot(ft, { FRANCE_TRAVAIL_API_ENABLED: 'false' }).accessMode,
    'disabled'
  );

  assert.equal(findJobBoardByDomain('https://www.meteojob.com/emploi/123')?.id, 'meteojob');
  assert.ok(BUILTIN_JOB_BOARDS.length >= 10);
});

test('sanitizeOfferByPolicy strips disallowed fields on snippet-only sources', () => {
  const meteojob = getJobBoardById('meteojob')!;
  const sanitized = sanitizeOfferByPolicy(
    {
      title: 'Stage Développeur Web',
      organization: 'Acme',
      location: 'Paris',
      duration: '6 months',
      durationMonths: 6,
      description: 'A'.repeat(500),
      originalUrl: 'https://www.meteojob.com/jobs/1',
      source: 'Meteojob',
    },
    meteojob
  );
  assert.equal(sanitized.duration, null);
  assert.equal(sanitized.durationMonths, null);
  assert.ok((sanitized.description?.length ?? 0) <= 320);
});

test('searchDiscoveryProvider builds bilingual FR/EN and site: queries and parses SearXNG/Brave JSON offline', async () => {
  const meteojob = getJobBoardById('meteojob')!;
  const apec = getJobBoardById('apec')!;
  const queries = buildDiscoveryQueries(baseCriteria, [meteojob, apec], 4);

  assert.ok(queries.some((q) => q.query.includes('site:meteojob.com')));
  assert.ok(queries.some((q) => q.query.includes('site:apec.fr')));
  assert.ok(queries.some((q) => q.language === 'fr'));
  assert.ok(queries.some((q) => q.language === 'en'));

  assert.equal(resolveActiveDiscoveryProvider({}), null);

  const mockSearxFetch = (async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            url: 'https://www.meteojob.com/offres/stage-react-123',
            title: 'Stage Développeur ReactJS chez NovaWeb - Meteojob',
            content: 'Rejoignez NovaWeb à Paris pour un stage TypeScript et PostgreSQL.',
            publishedDate: '2026-11-10',
          },
          {
            url: 'https://other-site.example/ignore-me',
            title: 'Should be filtered by targetDomains',
            content: 'Ignore',
          },
        ],
      }),
      { status: 200 }
    )) as unknown as typeof fetch;

  const searx = createSearxngDiscoveryProvider('https://searx.example.org', mockSearxFetch, {
    skipDnsCheck: true,
  });
  const hits = await searx.search({
    query: 'site:meteojob.com Stage React Paris',
    language: 'fr',
    targetDomains: ['meteojob.com'],
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].matchedBoardName, 'Meteojob');
  assert.equal(hits[0].discoveryProvider, 'searxng_api');

  const errorFetch = (async () => new Response('Unavailable', { status: 503 })) as unknown as typeof fetch;
  const failingBrave = createBraveSearchDiscoveryProvider('key_123', errorFetch, {
    skipDnsCheck: true,
  });
  await assert.rejects(() => failingBrave.search({ query: 'stage react' }), /HTTP 503/);
});

test('Meteojob link_only provider never scrapes HTML and keeps discovered offers unverified with null dates/duration', async () => {
  const meteojob = getJobBoardById('meteojob')!;

  const noDiscovery = createLinkOnlyOrDiscoveryProvider(meteojob, { discoveryProvider: null });
  const linkOnlyRes = await noDiscovery.collect(baseCriteria);
  assert.equal(linkOnlyRes.status, 'link_only');
  assert.equal(linkOnlyRes.offers.length, 0);
  assert.ok(linkOnlyRes.externalSearchLinks[0].url.includes('meteojob.com'));

  const mockDiscovery: WebSearchDiscoveryProvider = {
    id: 'mock_search',
    name: 'Mock Search',
    isConfigured: () => true,
    search: async () => [
      {
        url: 'https://www.meteojob.com/emploi/stage-dev-web-999',
        title: 'Stage Développeur Web JS chez AtelierCloud - Meteojob',
        snippet: 'Stage développement web sur React et Node.',
        domain: 'meteojob.com',
        discoveryProvider: 'mock_search',
        searchQuery: 'site:meteojob.com stage react',
        matchedBoardName: 'Meteojob',
      },
    ],
  };

  const withDiscovery = createLinkOnlyOrDiscoveryProvider(meteojob, {
    discoveryProvider: mockDiscovery,
  });
  const discRes = await withDiscovery.collect(baseCriteria);
  assert.equal(discRes.status, 'ok');
  assert.equal(discRes.accessMode, 'search_index');
  assert.equal(discRes.offers.length, 1);

  const normalized = normalizeScrapedOffer(discRes.offers[0]);
  assert.ok(normalized);
  assert.equal(normalized.collectionMode, 'discovered');
  assert.equal(normalized.verificationLevel, 'externally_unverified');
  assert.equal(normalized.verificationStatus, 'externally_unverified');
  assert.equal(normalized.duration, null);
  assert.equal(normalized.durationMonths, null);
  assert.equal(normalized.startDate, null);
  assert.equal(normalized.applicationUrl, null);
});

test('France Travail official API handles OAuth2, pagination, quota 429, and suspension 503 without HTML scraping', async () => {
  const ftConfig = getJobBoardById('france_travail')!;
  const ftEnv = {
    FRANCE_TRAVAIL_CLIENT_ID: 'client_id_test',
    FRANCE_TRAVAIL_CLIENT_SECRET: 'client_secret_test',
  };

  // 1. Multi-page pagination test (2 offers returned, simulates page boundary)
  let callCount = 0;
  const paginatedFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('oauth2')) {
      return new Response(JSON.stringify({ access_token: 'ft_tok_abc' }), { status: 200 });
    }
    callCount += 1;
    if (callCount === 1) {
      const page1Items = Array.from({ length: 50 }, (_, idx) => ({
        id: `FT_${idx}`,
        intitule: `Stage Développeur Web Fullstack #${idx}`,
        description: 'Stage 6 mois en React, TypeScript et PostgreSQL à Paris.',
        dateCreation: '2026-11-12T10:00:00Z',
        lieuTravail: { libelle: '75 - Paris' },
        entreprise: { nom: 'TechFrance' },
        typeContrat: 'STG',
        typeContratLibelle: 'Stage',
        dureeTravailLibelle: '6 mois',
        contact: { urlPostulation: `https://candidat.francetravail.fr/apply/${idx}` },
        origineOffre: { urlOrigine: `https://candidat.francetravail.fr/offres/${idx}` },
      }));
      return new Response(JSON.stringify({ resultats: page1Items }), { status: 206 });
    }
    return new Response(
      JSON.stringify({
        resultats: [
          {
            id: 'FT_50',
            intitule: 'Stage Data & BI Engineer',
            description: 'Stage 6 mois Python et SQL à Paris.',
            lieuTravail: { libelle: '75 - Paris' },
            entreprise: { nom: 'DataFrance' },
            typeContrat: 'STG',
            origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/50' },
          },
        ],
      }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;

  const ftProvider = createFranceTravailApiProvider(ftConfig, {
    fetchFn: paginatedFetch,
    env: ftEnv,
    maxPages: 2,
  });
  const res = await ftProvider.collect(baseCriteria);
  assert.equal(res.status, 'ok');
  assert.equal(res.accessMode, 'official_api');
  assert.equal(res.offers.length, 51);
  assert.equal(callCount, 2);

  // 2. HTTP 429 quota reached
  const quotaFetch = (async (input: string | URL) => {
    if (String(input).includes('oauth2')) {
      return new Response(JSON.stringify({ access_token: 'ft_tok_abc' }), { status: 200 });
    }
    return new Response('Too Many Requests', { status: 429 });
  }) as unknown as typeof fetch;

  const ftQuota = createFranceTravailApiProvider(ftConfig, { fetchFn: quotaFetch, env: ftEnv });
  const quotaRes = await ftQuota.collect(baseCriteria);
  assert.equal(quotaRes.status, 'error');
  assert.match(quotaRes.message ?? '', /429|quota/i);

  // 3. HTTP 503 suspended / unavailable -> never falls back to HTML scraping
  const suspendedFetch = (async (input: string | URL) => {
    if (String(input).includes('oauth2')) {
      return new Response(JSON.stringify({ access_token: 'ft_tok_abc' }), { status: 200 });
    }
    return new Response('Service Unavailable', { status: 503 });
  }) as unknown as typeof fetch;

  const ftSuspended = createFranceTravailApiProvider(ftConfig, {
    fetchFn: suspendedFetch,
    env: ftEnv,
  });
  const suspRes = await ftSuspended.collect(baseCriteria);
  assert.equal(suspRes.status, 'error');
  assert.equal(suspRes.accessMode, 'link_only');
  assert.equal(suspRes.offers.length, 0);
  assert.match(suspRes.message ?? '', /no scraping fallback/i);
});

test('RSS feed provider and Remotive official API provider parse feeds offline cleanly', async () => {
  const sampleRss = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0"><channel><title>WWR</title>
    <item>
      <title>AcmeLabs: Software Engineering Intern (React / Node)</title>
      <link>https://weworkremotely.com/remote-jobs/acmelabs-intern</link>
      <pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate>
      <region>Europe / Remote</region>
      <description><![CDATA[<p>6 months paid remote internship working on TypeScript and PostgreSQL.</p>]]></description>
    </item>
  </channel></rss>`;

  const parsedRss = parseRssOrAtomFeed(sampleRss, 'We Work Remotely');
  assert.equal(parsedRss.length, 1);
  assert.equal(parsedRss[0].organization, 'AcmeLabs');
  assert.equal(parsedRss[0].isRssFeed, true);
  assert.equal(parsedRss[0].collectionMode, 'collected');

  const wwrConfig: JobBoardSourceConfig = {
    ...getJobBoardById('weworkremotely')!,
    rssFeedUrls: ['https://weworkremotely.com/test-offline.rss'],
  };
  const rssProvider = createRssJobBoardProvider(wwrConfig, {
    skipRobotsOrDns: true,
    fetchFn: (async () => new Response(sampleRss, { status: 200 })) as unknown as typeof fetch,
  });
  const rssResult = await rssProvider.collect(baseCriteria);
  assert.equal(rssResult.status, 'ok');
  assert.equal(rssResult.offers.length, 1);

  const remotiveConfig = getJobBoardById('remotive')!;
  const remotiveProvider = createRemotiveApiProvider(remotiveConfig, {
    skipDnsCheck: true,
    fetchFn: (async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 777,
              url: 'https://remotive.com/remote-jobs/software-dev/intern-777',
              title: 'Backend Engineering Intern (NodeJS / Postgres)',
              company_name: 'CloudScale',
              job_type: 'internship',
              publication_date: '2026-11-11T09:00:00',
              candidate_required_location: 'Europe / Remote',
              description: '<p>Join CloudScale as a remote backend intern.</p>',
              tags: ['node.js', 'postgresql'],
            },
          ],
        }),
        { status: 200 }
      )) as unknown as typeof fetch,
  });
  const remotiveRes = await remotiveProvider.collect(baseCriteria);
  assert.equal(remotiveRes.status, 'ok');
  assert.equal(remotiveRes.offers.length, 1);
  assert.equal(remotiveRes.offers[0].organization, 'CloudScale');
});

test('criteriaMatcher handles technical synonyms, study level, expired exclusion, and deduplicator prioritizes verified over unverified links', () => {
  const verifiedAts = normalizeScrapedOffer({
    externalId: 'gh_42',
    title: 'Stage Développeur Web JavaScript / PostgreSQL',
    organization: 'FinTechParis',
    location: 'Paris, France',
    workMode: 'Hybrid',
    duration: '6 months',
    startDate: '2027-03-01',
    educationLevel: 'Bac+5 / Master',
    languages: ['French', 'English'],
    description: 'Stage 6 mois en ReactJS, JavaScript, NodeJS et PostgreSQL.',
    originalUrl: 'https://boards.greenhouse.io/fintechparis/jobs/42?gh_src=abc',
    applicationUrl: 'https://boards.greenhouse.io/fintechparis/jobs/42#app',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const duplicateMeteojob = normalizeScrapedOffer(
    mapDiscoveryHitToRawOffer(
      {
        url: 'https://www.meteojob.com/emploi/stage-dev-web-fintechparis',
        title: 'Stage Développeur Web JavaScript / PostgreSQL chez FinTechParis - Meteojob',
        snippet: 'Poste basé à Paris.',
        domain: 'meteojob.com',
        discoveryProvider: 'searxng_api',
        searchQuery: 'site:meteojob.com',
        matchedBoardName: 'Meteojob',
      },
      getJobBoardById('meteojob')
    )
  )!;

  const expiredOffer = normalizeScrapedOffer({
    title: 'Stage React Ancien',
    organization: 'OldCorp',
    location: 'Paris',
    duration: '6 months',
    startDate: '2027-03-01',
    expiresAt: '2020-01-01',
    description: 'Offre expirée',
    originalUrl: 'https://oldcorp.example/jobs/1',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const wrongEduOffer = normalizeScrapedOffer({
    title: 'Stage Développeur JavaScript',
    organization: 'JuniorCorp',
    location: 'Paris',
    duration: '6 months',
    startDate: '2027-03-01',
    educationLevel: 'BTS Bac+2',
    description: 'Stage développement web JavaScript.',
    originalUrl: 'https://juniorcorp.example/jobs/2',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  // Deduplication keeps verified offer as primary and tracks both sources + alternateUrls
  const deduped = deduplicateScrapedOffers([duplicateMeteojob, verifiedAts, expiredOffer, wrongEduOffer]);
  assert.equal(deduped.length, 3);
  const mergedFinTech = deduped.find((o) => o.organization === 'FinTechParis')!;
  assert.equal(mergedFinTech.verificationLevel, 'verified');
  assert.deepEqual(mergedFinTech.sources, ['Company Career Page', 'Meteojob']);
  assert.ok(mergedFinTech.alternateUrls.some((u) => u.includes('meteojob.com')));

  // Filtering via synonyms (JS -> JavaScript, Postgres -> PostgreSQL) keeps FinTechParis, rejects expired & Bac+2
  const matched = filterAndScoreOffers(deduped, baseCriteria);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].organization, 'FinTechParis');
  assert.ok(matched[0].matchScore >= 60);
});

test('runScrapingSearch orchestrates ATS + JobBoards + failing provider isolation offline', async () => {
  const connectors: ScraperConnector[] = [
    {
      id: 'ats_mock',
      sourceName: 'Company Career Page',
      collect: async () => ({
        source: 'Company Career Page',
        connector: 'ats_mock',
        accessMode: 'ats_api',
        status: 'ok',
        durationMs: 5,
        externalSearchLinks: [],
        offers: [
          {
            externalId: 'ats_1',
            title: 'Stage Développeur React & Node.js',
            organization: 'Alan',
            location: 'Paris / Remote',
            duration: '6 months',
            startDate: '2027-03-01',
            description: 'Stage 6 mois en TypeScript, React, JavaScript et PostgreSQL.',
            originalUrl: 'https://jobs.ashbyhq.com/alan/123',
            applicationUrl: 'https://jobs.ashbyhq.com/alan/123/application',
            source: 'Company Career Page',
            isAtsApi: true,
          },
        ],
      }),
    },
    {
      id: 'meteojob_mock',
      sourceName: 'Meteojob',
      collect: async () => ({
        source: 'Meteojob',
        connector: 'meteojob_search_index',
        accessMode: 'search_index',
        status: 'ok',
        durationMs: 4,
        externalSearchLinks: [
          {
            source: 'Meteojob',
            label: 'Search on Meteojob',
            url: 'https://www.meteojob.com/jobs?what=React',
            reason: 'link_only',
            accessMode: 'link_only',
          },
        ],
        offers: [
          mapDiscoveryHitToRawOffer(
            {
              url: 'https://www.meteojob.com/jobs/stage-node-paris-88',
              title: 'Stage Développeur NodeJS / React chez StudioParis - Meteojob',
              snippet: 'Stage développement web JavaScript PostgreSQL à Paris.',
              domain: 'meteojob.com',
              discoveryProvider: 'searxng_api',
              searchQuery: 'site:meteojob.com stage react',
              matchedBoardName: 'Meteojob',
            },
            getJobBoardById('meteojob')
          ),
        ],
      }),
    },
    {
      id: 'failing_mock',
      sourceName: 'Apec',
      collect: async () => {
        throw new Error('Simulated timeout');
      },
    },
  ];

  const response = await runScrapingSearch(baseCriteria, {
    connectorsOverride: connectors,
  });

  assert.equal(response.offers.length, 2);
  assert.equal(response.stats.collectedCount, 1);
  assert.equal(response.stats.discoveredCount, 1);
  assert.equal(response.offers[0].organization, 'Alan');
  assert.equal(response.offers[0].verificationLevel, 'verified');
  assert.equal(response.offers[1].verificationLevel, 'externally_unverified');
  assert.equal(response.sourceLogs.length, 3);
  assert.equal(response.sourceLogs.find((l) => l.source === 'Apec')?.status, 'error');
  assert.ok((response.jobBoardPolicies?.length ?? 0) >= 10);
});
