import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile } from '../types/domain';
import { normalizeOffer } from './sourceAggregator';
import {
  buildPreparedDossier,
  composeCoverLetterTemplate,
  computeCvTailoringPoints,
  countWordsAndChars,
  extractMatchingSkills,
} from './dossierComposer';

const candidateProfile: CandidateProfile = {
  id: 'cand_1',
  fullName: 'Yanis Benali',
  email: 'yanis.benali@insa-lyon.fr',
  phone: '+33 6 12 34 56 78',
  location: 'Paris, France',
  school: 'INSA Lyon',
  degree: 'Master 2 Computer Science',
  graduationYear: '2026',
  targetRole: 'Full-Stack Software Engineer Stage',
  availability: 'February 2027 (6 months)',
  portfolioUrl: 'https://yanis.dev',
  linkedinUrl: 'https://linkedin.com/in/yanis',
  skills: ['React', 'TypeScript', 'Python', 'PostgreSQL', 'Node.js'],
  experiences: ['Built an automated SaaS billing engine in TypeScript & React'],
  rawCvText: 'Yanis Benali - INSA Lyon - React TypeScript Python',
  avatarUrl: '',
};

const sampleOffer = normalizeOffer(
  {
    id: 'offer_1',
    title: 'Software Engineer Intern',
    organization: 'OrgA',
    location: 'Paris',
    duration: '6 months',
    source: 'Company Career Page',
    sourceUrl: 'https://example.org/jobs/1',
    applicationEmail: 'campus@orga.example',
    requirements: ['React', 'TypeScript', 'Python'],
  },
  0
);

test('extractMatchingSkills finds overlapping CV and offer skills', () => {
  const matched = extractMatchingSkills(candidateProfile, sampleOffer);
  assert.ok(matched.includes('React'));
  assert.ok(matched.includes('TypeScript'));
  assert.ok(matched.includes('Python'));
});

test('composeCoverLetterTemplate produces personalized French and English letters', () => {
  const frLetter = composeCoverLetterTemplate(sampleOffer, candidateProfile, 'fr', 'professional');
  assert.match(frLetter, /OrgA/);
  assert.match(frLetter, /Yanis Benali/);
  assert.match(frLetter, /Madame, Monsieur/);

  const enLetter = composeCoverLetterTemplate(sampleOffer, candidateProfile, 'en', 'enthusiastic');
  assert.match(enLetter, /Dear Hiring Team at OrgA/);
  assert.match(enLetter, /Yanis Benali/);
});

test('buildPreparedDossier populates subject, letter, CV highlights, and preferred channel', () => {
  const dossier = buildPreparedDossier(sampleOffer, candidateProfile, 'fr', 'concise');

  assert.equal(dossier.offerId, sampleOffer.id);
  assert.ok(dossier.emailSubject.includes('Yanis Benali'));
  assert.ok(dossier.cvTailoringHighlights.length >= 3);
  assert.equal(dossier.selectedChannelId, 'offer_1_ch_1');
});

test('computeCvTailoringPoints and countWordsAndChars compute accurate values', () => {
  const points = computeCvTailoringPoints(candidateProfile, sampleOffer, 'en');
  assert.ok(points.length >= 3);
  assert.deepEqual(countWordsAndChars('  Hello   world  '), { words: 2, chars: 13 });
  assert.deepEqual(countWordsAndChars('   '), { words: 0, chars: 0 });
});
