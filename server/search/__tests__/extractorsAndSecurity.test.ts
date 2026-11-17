import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJobPostingsFromJsonLd } from '../extractors/jsonLdExtractor.ts';
import {
  extractOffersHeuristicallyFromHtml,
  extractOffersWithSelectors,
} from '../extractors/htmlExtractor.ts';
import { isPathAllowedByRules, parseRobotsTxt } from '../security/robotsGuard.ts';
import { validateHttpUrl } from '../security/urlGuard.ts';
import {
  isSpecificOfferUrl,
  isValidEmailSyntax,
  verifyScrapedOffer,
} from '../validators/offerVerifier.ts';

test('jsonLdExtractor parses Schema.org JobPosting including @graph and keeps missing fields null', () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "name": "Acme Careers"
              },
              {
                "@type": "JobPosting",
                "title": "Stage Développeur Full-Stack React / Node.js",
                "hiringOrganization": { "@type": "Organization", "name": "Acme Cloud" },
                "jobLocation": {
                  "@type": "Place",
                  "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "Paris",
                    "addressCountry": "FR"
                  }
                },
                "jobLocationType": "TELECOMMUTE",
                "employmentType": "INTERN",
                "datePosted": "2026-11-10T09:00:00Z",
                "url": "/careers/jobs/stage-fullstack-42",
                "skills": ["React", "TypeScript", "Node.js"],
                "description": "<p>Stage de 6 mois à partir du 2027-02-01. Envoyez votre CV à campus@acme-cloud.fr.</p>"
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const offers = extractJobPostingsFromJsonLd(html, 'https://acme-cloud.fr/careers', 'Acme');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].title, 'Stage Développeur Full-Stack React / Node.js');
  assert.equal(offers[0].organization, 'Acme Cloud');
  assert.equal(offers[0].location, 'Paris, FR');
  assert.equal(offers[0].workMode, 'Remote');
  assert.equal(offers[0].postedDate, '2026-11-10');
  assert.equal(offers[0].duration, '6 mois');
  assert.equal(offers[0].startDate, '2027-02-01');
  assert.equal(offers[0].endDate, null);
  assert.equal(offers[0].applicationEmail, 'campus@acme-cloud.fr');
  assert.equal(offers[0].originalUrl, 'https://acme-cloud.fr/careers/jobs/stage-fullstack-42');
});

test('htmlExtractor parses custom CSS selectors and resolves relative links accurately', () => {
  const html = `
    <html>
      <head><title>Kinetik AI | Careers</title></head>
      <body>
        <section class="openings">
          <div class="job-card">
            <h3 class="job-title">Stage Data Engineer (H/F)</h3>
            <span class="job-location">Lyon, Hybride</span>
            <p class="job-desc">Pipeline Python & SQL pendant 4 à 6 mois. Contact: talent@kinetik-ai.fr</p>
            <a class="apply-link" href="/jobs/data-intern-108">Voir l'offre</a>
          </div>
          <div class="job-card">
            <h3 class="job-title">Stage IA / LLM Evaluation</h3>
            <span class="job-location">Paris</span>
            <p class="job-desc">Benchmarking models with PyTorch.</p>
            <a class="apply-link" href="https://jobs.ashbyhq.com/kinetik/llm-intern">Postuler</a>
          </div>
        </section>
      </body>
    </html>
  `;

  const offers = extractOffersWithSelectors(html, 'https://kinetik-ai.fr/careers', 'Kinetik', {
    jobListSelector: '.job-card',
    titleSelector: '.job-title',
    locationSelector: '.job-location',
    descriptionSelector: '.job-desc',
    linkSelector: 'a.apply-link',
  });

  assert.equal(offers.length, 2);
  assert.equal(offers[0].organization, 'Kinetik AI');
  assert.equal(offers[0].location, 'Lyon, Hybride');
  assert.equal(offers[0].originalUrl, 'https://kinetik-ai.fr/jobs/data-intern-108');
  assert.equal(offers[0].applicationEmail, 'talent@kinetik-ai.fr');
  assert.equal(offers[0].duration, '4 à 6 mois');
  assert.equal(offers[0].startDate, null); // Not present -> remains null
  assert.equal(offers[1].originalUrl, 'https://jobs.ashbyhq.com/kinetik/llm-intern');
});

test('htmlExtractor heuristic extraction detects internship cards and ATS form links', () => {
  const html = `
    <html>
      <body>
        <a href="https://boards.greenhouse.io/nebula/jobs/991">Apply on Greenhouse</a>
        <article>
          <h2>Software Engineering Intern — Frontend</h2>
          <p>Remote internship in TypeScript & React.</p>
          <a href="/jobs/frontend-intern-991">Details</a>
        </article>
      </body>
    </html>
  `;

  const offers = extractOffersHeuristicallyFromHtml(
    html,
    'https://nebula-tech.io/careers',
    'Nebula'
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].title, 'Software Engineering Intern — Frontend');
  assert.equal(offers[0].workMode, 'Remote');
  assert.equal(offers[0].originalUrl, 'https://nebula-tech.io/jobs/frontend-intern-991');
});

test('urlGuard blocks localhost, cloud metadata IPs, private ranges, and non-HTTP protocols', () => {
  assert.equal(validateHttpUrl('http://localhost:3000/api').safe, false);
  assert.equal(validateHttpUrl('http://127.0.0.1:8080/admin').safe, false);
  assert.equal(validateHttpUrl('http://10.0.0.1/secret').safe, false);
  assert.equal(validateHttpUrl('http://172.16.5.4/internal').safe, false);
  assert.equal(validateHttpUrl('http://192.168.1.1/router').safe, false);
  assert.equal(validateHttpUrl('http://169.254.169.254/latest/meta-data').safe, false);
  assert.equal(validateHttpUrl('file:///etc/passwd').safe, false);
  assert.equal(validateHttpUrl('https://boards-api.greenhouse.io/v1/boards/datadog/jobs').safe, true);
});

test('robotsGuard parses rules accurately and applies longest-match Allow/Disallow precedence', () => {
  const robotsTxt = `
    User-agent: *
    Disallow: /private/
    Disallow: /admin
    Allow: /private/careers

    User-agent: StagePilotBot
    Crawl-delay: 2
    Disallow: /secret-board
  `;

  const genericRules = parseRobotsTxt(robotsTxt, 'OtherBot');
  assert.equal(isPathAllowedByRules('/private/data', genericRules), false);
  assert.equal(isPathAllowedByRules('/private/careers', genericRules), true);
  assert.equal(isPathAllowedByRules('/jobs/stage', genericRules), true);

  const botRules = parseRobotsTxt(robotsTxt, 'StagePilotBot/1.0');
  assert.equal(isPathAllowedByRules('/secret-board/123', botRules), false);
  assert.equal(botRules.crawlDelayMs, 2000);
});

test('offerVerifier distinguishes specific offer URLs from generic career landing pages', () => {
  assert.equal(isSpecificOfferUrl('https://acme.com/careers'), false);
  assert.equal(isSpecificOfferUrl('https://acme.com/jobs/'), false);
  assert.equal(isSpecificOfferUrl('https://acme.com/jobs/stage-backend-442'), true);
  assert.equal(isSpecificOfferUrl('https://boards.greenhouse.io/datadog/jobs/12345'), true);

  assert.equal(isValidEmailSyntax('stages@entreprise.fr'), true);
  assert.equal(isValidEmailSyntax('not-an-email'), false);

  const genericCheck = verifyScrapedOffer({
    title: 'Stage Cloud',
    organization: 'Acme',
    originalUrl: 'https://acme.com/careers',
    source: 'Custom',
  });
  assert.equal(genericCheck.valid, true);
  assert.equal(genericCheck.status, 'generic_career_page');

  const atsCheck = verifyScrapedOffer({
    title: 'Stage Cloud',
    organization: 'Datadog',
    originalUrl: 'https://boards.greenhouse.io/datadog/jobs/12345',
    source: 'Company Career Page',
    isAtsApi: true,
  });
  assert.equal(atsCheck.valid, true);
  assert.equal(atsCheck.status, 'verified_ats_api');
});
