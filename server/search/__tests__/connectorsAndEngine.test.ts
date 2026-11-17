import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseAshbyBoardPayload } from '../connectors/ashbyScraper.ts';
import { createGenericHtmlConnector } from '../connectors/genericHtmlScraper.ts';
import { parseGreenhouseJobsPayload } from '../connectors/greenhouseScraper.ts';
import { parseLeverPostingsPayload } from '../connectors/leverScraper.ts';
import { runScrapingSearch } from '../scraperEngine.ts';
import { resolveConnectorsForCriteria } from '../scraperRegistry.ts';
import { ScraperConnector, SearchCriteria } from '../types.ts';

test('ATS connectors parse Greenhouse, Lever, and Ashby payloads cleanly with null missing fields', () => {
  const ghOffers = parseGreenhouseJobsPayload(
    {
      jobs: [
        {
          id: 101,
          title: 'Software Engineer Intern (Paris)',
          absolute_url: 'https://boards.greenhouse.io/org/jobs/101',
          location: { name: 'Paris, France' },
          updated_at: '2026-11-12T10:15:00-05:00',
          content: '<p>6 months internship with TypeScript and Go.</p>',
        },
      ],
    },
    'OrgGH',
    'Company Career Page'
  );
  assert.equal(ghOffers.length, 1);
  assert.equal(ghOffers[0].duration, '6 months');
  assert.equal(ghOffers[0].startDate, null);
  assert.equal(ghOffers[0].postedDate, '2026-11-12');
  assert.equal(ghOffers[0].isAtsApi, true);

  const leverOffers = parseLeverPostingsPayload(
    [
      {
        id: 'lev-1',
        text: 'Stage Développeur Web Full-Stack',
        hostedUrl: 'https://jobs.lever.co/orglever/lev-1',
        applyUrl: 'https://jobs.lever.co/orglever/lev-1/apply',
        workplaceType: 'hybrid',
        createdAt: 1794355200000,
        categories: { location: 'Montpellier, France', commitment: 'Internship' },
        descriptionPlain: 'Stage React & Node.js de 6 mois à partir de 2027-02-01.',
      },
    ],
    'OrgLever',
    'Company Career Page'
  );
  assert.equal(leverOffers.length, 1);
  assert.equal(leverOffers[0].workMode, 'hybrid');
  assert.equal(leverOffers[0].startDate, '2027-02-01');
  assert.equal(leverOffers[0].applicationUrl, 'https://jobs.lever.co/orglever/lev-1/apply');

  const ashbyOffers = parseAshbyBoardPayload(
    {
      jobs: [
        {
          title: 'AI Engineering Intern',
          location: 'Paris, France',
          isRemote: false,
          workplaceType: 'OnSite',
          employmentType: 'Intern',
          jobUrl: 'https://jobs.ashbyhq.com/orgashby/ai-1',
          applyUrl: 'https://jobs.ashbyhq.com/orgashby/ai-1/application',
          publishedAt: '2026-11-15T12:00:00Z',
          descriptionPlain: 'Build LLM tooling in Python and TypeScript.',
        },
      ],
    },
    'OrgAshby',
    'Company Career Page'
  );
  assert.equal(ashbyOffers.length, 1);
  assert.equal(ashbyOffers[0].duration, null);
  assert.equal(ashbyOffers[0].postedDate, '2026-11-15');
});

test('genericHtmlScraper scrapes real local HTTP career page and isolates HTTP 503 errors', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/broken') {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body>
          <ul class="jobs">
            <li class="job-row">
              <span class="title">Stage Data & BI Engineer</span>
              <span class="loc">Paris, France</span>
              <p class="desc">6 mois · SQL, dbt, Power BI · Email: stage@startup-bi.fr</p>
              <a class="link" href="/postings/bi-intern-7">Apply</a>
            </li>
          </ul>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseHttpUrl = `http://127.0.0.1:${port}`;

  try {
    const customConn = createGenericHtmlConnector(
      {
        id: 'custom_bi',
        name: 'Startup BI Portal',
        baseUrl: `${baseHttpUrl}/careers`,
        cssSelectors: {
          jobListSelector: '.job-row',
          titleSelector: '.title',
          locationSelector: '.loc',
          descriptionSelector: '.desc',
          linkSelector: 'a.link',
        },
        collectFrequencyMinutes: 0,
        enabled: true,
      },
      { skipRobotsOrDns: true }
    );

    const res = await customConn.collect({
      keywords: 'BI Data',
      location: 'Paris',
      workMode: 'all',
      sources: ['Startup BI Portal'],
    });

    assert.equal(res.status, 'ok');
    assert.equal(res.offers.length, 1);
    assert.equal(res.offers[0].applicationEmail, 'stage@startup-bi.fr');
    assert.equal(res.offers[0].originalUrl, `${baseHttpUrl}/postings/bi-intern-7`);

    const failingConn = createGenericHtmlConnector(
      {
        id: 'custom_fail',
        name: 'Broken Portal',
        baseUrl: `${baseHttpUrl}/broken`,
        collectFrequencyMinutes: 0,
        enabled: true,
      },
      { skipRobotsOrDns: true }
    );

    const failRes = await failingConn.collect({
      keywords: 'Stage',
      location: 'Paris',
      workMode: 'all',
      sources: ['Broken Portal'],
    });
    assert.equal(failRes.status, 'error');
    assert.equal(failRes.offers.length, 0);
    assert.equal(failRes.externalSearchLinks.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('scraperRegistry keeps LinkedIn and Indeed disabled by policy with official external links', async () => {
  const criteria: SearchCriteria = {
    keywords: 'React Stage',
    location: 'Paris',
    workMode: 'all',
    sources: ['LinkedIn', 'Indeed'],
  };

  const connectors = resolveConnectorsForCriteria(criteria);
  assert.equal(connectors.length, 2);
  assert.equal(connectors[0].policyDisabled, true);
  assert.equal(connectors[1].policyDisabled, true);

  const results = await Promise.all(connectors.map((c) => c.collect(criteria)));
  assert.equal(results[0].status, 'link_only');
  assert.equal(results[0].accessMode, 'link_only');
  assert.ok(results[0].externalSearchLinks[0].url.includes('linkedin.com/jobs/search'));
  assert.equal(results[1].status, 'link_only');
  assert.equal(results[1].accessMode, 'link_only');
  assert.ok(results[1].externalSearchLinks[0].url.includes('indeed.com/jobs'));
});

test('runScrapingSearch isolates connector failures, deduplicates, filters, and scores offers', async () => {
  const primaryConnector: ScraperConnector = {
    id: 'ats_primary',
    sourceName: 'Company Career Page',
    collect: async () => ({
      source: 'Company Career Page',
      connector: 'ashbyScraper',
      status: 'ok',
      durationMs: 12,
      externalSearchLinks: [],
      offers: [
        {
          title: 'Stage Développeur Web Full-Stack React',
          organization: 'OrgPrimary',
          location: 'Paris, France',
          workMode: 'Hybrid',
          duration: '6 months',
          description: 'Build React and TypeScript web applications.',
          originalUrl: 'https://jobs.ashbyhq.com/orgprimary/1?utm_source=test',
          applicationEmail: 'interns@orgprimary.example',
          source: 'Company Career Page',
          isAtsApi: true,
        },
        {
          title: 'Senior Accounting Director (CDI)',
          organization: 'OrgPrimary',
          location: 'Paris, France',
          description: 'Permanent finance leadership.',
          originalUrl: 'https://jobs.ashbyhq.com/orgprimary/finance-dir',
          source: 'Company Career Page',
          isAtsApi: true,
        },
      ],
    }),
  };

  const crashingConnector: ScraperConnector = {
    id: 'crashing_custom',
    sourceName: 'Unstable Portal',
    collect: async () => {
      throw new Error('Network ETIMEDOUT');
    },
  };

  const duplicateCustomConnector: ScraperConnector = {
    id: 'dup_custom',
    sourceName: 'Tech Hub',
    collect: async () => ({
      source: 'Tech Hub',
      connector: 'genericHtml',
      status: 'ok',
      durationMs: 25,
      externalSearchLinks: [],
      offers: [
        {
          title: 'Stage Développeur Web Full-Stack React',
          organization: 'OrgPrimary',
          location: 'Paris',
          originalUrl: 'https://techhub.example/careers',
          source: 'Tech Hub',
        },
      ],
    }),
  };

  const engineResult = await runScrapingSearch(
    {
      keywords: 'React Full-Stack Stage',
      domains: ['Développement web'],
      skills: ['TypeScript', 'React'],
      location: 'Paris',
      minDurationMonths: 4,
      maxDurationMonths: 6,
      workMode: 'all',
      sources: ['Company Career Page', 'Unstable Portal', 'Tech Hub'],
    },
    {
      connectorsOverride: [primaryConnector, crashingConnector, duplicateCustomConnector],
      concurrency: 2,
    }
  );

  assert.equal(engineResult.offers.length, 1);
  assert.equal(engineResult.offers[0].organization, 'OrgPrimary');
  assert.ok(engineResult.offers[0].matchScore > 40);
  assert.equal(engineResult.stats.totalCollected, 3);
  assert.equal(engineResult.stats.afterDeduplication, 2);
  assert.equal(engineResult.stats.afterFiltering, 1);

  const errorLog = engineResult.sourceLogs.find((l) => l.source === 'Unstable Portal');
  assert.equal(errorLog?.status, 'error');
  assert.match(errorLog?.message ?? '', /ETIMEDOUT/);
});
