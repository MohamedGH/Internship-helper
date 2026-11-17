import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRelevanceScore,
  filterAndScoreOffers,
  matchesMandatoryCriteria,
} from '../filters/criteriaMatcher.ts';
import { canonicalizeOfferUrl, deduplicateScrapedOffers } from '../filters/deduplicator.ts';
import { normalizeScrapedOffer } from '../normalizer.ts';
import { SearchCriteria } from '../types.ts';

test('normalizeScrapedOffer preserves null for missing dates/duration and extracts skills accurately', () => {
  const normalized = normalizeScrapedOffer({
    title: 'Stage Développement Web React & TypeScript',
    organization: 'Alan',
    location: 'Paris, France',
    description: 'Join our frontend team building React, TypeScript, and GraphQL workflows.',
    originalUrl: 'https://jobs.ashbyhq.com/alan/12345',
    source: 'Company Career Page',
    isAtsApi: true,
  });

  assert.ok(normalized);
  assert.equal(normalized.duration, null);
  assert.equal(normalized.durationMonths, null);
  assert.equal(normalized.startDate, null);
  assert.equal(normalized.endDate, null);
  assert.equal(normalized.postedDate, null);
  assert.equal(normalized.applicationEmail, null);
  assert.equal(normalized.verificationStatus, 'verified_ats_api');
  assert.ok(normalized.requirements.includes('React'));
  assert.ok(normalized.requirements.includes('TypeScript'));
  assert.ok(normalized.requirements.includes('GraphQL'));
});

test('criteriaMatcher strictly filters non-internships, mismatched locations/durations/dates, and supports domain matching', () => {
  const internshipAi = normalizeScrapedOffer({
    title: 'Machine Learning & LLM Research Intern (Stage)',
    organization: 'Mistral AI',
    location: 'Paris, France',
    workMode: 'On-site',
    duration: '6 months',
    startDate: '2027-03-01',
    description: 'Research internship working with PyTorch, Python, and NLP pipelines.',
    originalUrl: 'https://jobs.ashbyhq.com/mistral.ai/abc',
    applicationEmail: 'campus@mistral.ai',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const seniorFullTime = normalizeScrapedOffer({
    title: 'Senior Staff Machine Learning Engineer (CDI)',
    organization: 'Mistral AI',
    location: 'Paris, France',
    description: 'Permanent full-time senior leadership role in PyTorch.',
    originalUrl: 'https://jobs.ashbyhq.com/mistral.ai/senior-cdi',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const wrongDuration = normalizeScrapedOffer({
    title: 'Stage Data & AI Analytics',
    organization: 'Qonto',
    location: 'Paris, France',
    duration: '2 months',
    startDate: '2027-03-01',
    description: 'Short 2-month data internship using SQL and Python.',
    originalUrl: 'https://jobs.ashbyhq.com/qonto/short',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const wrongCity = normalizeScrapedOffer({
    title: 'Stage Intelligence Artificielle',
    organization: 'Marseille Lab',
    location: 'Marseille, France',
    workMode: 'On-site',
    duration: '6 months',
    description: 'PyTorch AI internship on-site in Marseille.',
    originalUrl: 'https://marseille-lab.fr/jobs/ia-intern',
    source: 'Custom Board',
  })!;

  const criteria: SearchCriteria = {
    keywords: 'Stage',
    domains: ['IA'],
    skills: ['PyTorch', 'Python'],
    location: 'Paris',
    minDurationMonths: 4,
    maxDurationMonths: 6,
    startDateFrom: '2027-02-01',
    startDateTo: '2027-06-01',
    workMode: 'all',
    sources: ['Company Career Page', 'Custom Board'],
  };

  assert.equal(matchesMandatoryCriteria(internshipAi, criteria), true);
  assert.equal(matchesMandatoryCriteria(seniorFullTime, criteria), false);
  assert.equal(matchesMandatoryCriteria(wrongDuration, criteria), false);
  assert.equal(matchesMandatoryCriteria(wrongCity, criteria), false);

  const scored = filterAndScoreOffers(
    [wrongCity, seniorFullTime, wrongDuration, internshipAi],
    criteria
  );
  assert.equal(scored.length, 1);
  assert.equal(scored[0].organization, 'Mistral AI');
  assert.ok(computeRelevanceScore(scored[0], criteria) >= 50);
});

test('deduplicator canonicalizes tracking query params and merges richer cross-source metadata', () => {
  assert.equal(
    canonicalizeOfferUrl('https://jobs.lever.co/swile/123/?utm_source=linkedin&gh_src=abc#apply'),
    'https://jobs.lever.co/swile/123'
  );

  const fromCareerLanding = normalizeScrapedOffer({
    title: 'Stage Data Analyst BI',
    organization: 'Swile',
    location: 'Paris',
    originalUrl: 'https://swile.co/careers',
    description: 'Stage BI.',
    source: 'Swile Portal',
  })!;

  const fromLeverAts = normalizeScrapedOffer({
    title: 'Stage Data Analyst BI',
    organization: 'Swile',
    location: 'Paris, France',
    duration: '6 months',
    originalUrl: 'https://jobs.lever.co/swile/bi-intern-123?utm_source=wttj',
    applicationUrl: 'https://jobs.lever.co/swile/bi-intern-123/apply',
    applicationEmail: 'campus@swile.co',
    description: 'Detailed BI stage working with SQL, Power BI, and dbt.',
    source: 'Company Career Page',
    isAtsApi: true,
  })!;

  const merged = deduplicateScrapedOffers([fromCareerLanding, fromLeverAts]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].verificationStatus, 'verified_ats_api');
  assert.equal(merged[0].durationMonths, 6);
  assert.equal(merged[0].applicationEmail, 'campus@swile.co');
  assert.ok(merged[0].requirements.includes('SQL'));
});
