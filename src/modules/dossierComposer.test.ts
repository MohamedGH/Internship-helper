import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile } from '../types/domain';
import { DEFAULT_SEED_OFFERS } from './sourceAggregator';
import {
  buildPreparedDossier,
  composeCoverLetterTemplate,
  computeCvTailoringPoints,
  countWordsAndChars,
  extractMatchingSkills,
} from './dossierComposer';

const mockProfile: CandidateProfile = {
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
  avatarUrl: '/avatar.jpg',
};

test('extractMatchingSkills finds overlapping CV and offer skills', () => {
  const alanOffer = DEFAULT_SEED_OFFERS[0];
  const matched = extractMatchingSkills(mockProfile, alanOffer);
  assert.ok(matched.includes('React'));
  assert.ok(matched.includes('TypeScript'));
  assert.ok(matched.includes('Python'));
});

test('composeCoverLetterTemplate produces personalized French and English letters', () => {
  const alanOffer = DEFAULT_SEED_OFFERS[0];
  const frLetter = composeCoverLetterTemplate(alanOffer, mockProfile, 'fr', 'professional');
  assert.match(frLetter, /Alan/);
  assert.match(frLetter, /Yanis Benali/);
  assert.match(frLetter, /Madame, Monsieur/);

  const enLetter = composeCoverLetterTemplate(alanOffer, mockProfile, 'en', 'enthusiastic');
  assert.match(enLetter, /Dear Hiring Team at Alan/);
  assert.match(enLetter, /Yanis Benali/);
});

test('buildPreparedDossier populates subject, letter, CV highlights, and preferred channel', () => {
  const qontoOffer = DEFAULT_SEED_OFFERS[2];
  const dossier = buildPreparedDossier(qontoOffer, mockProfile, 'fr', 'concise');

  assert.equal(dossier.offerId, qontoOffer.id);
  assert.ok(dossier.emailSubject.includes('Yanis Benali'));
  assert.ok(dossier.cvTailoringHighlights.length >= 3);
  assert.equal(dossier.selectedChannelId, 'ch_qonto_email');
});

test('computeCvTailoringPoints and countWordsAndChars compute accurate values', () => {
  const points = computeCvTailoringPoints(mockProfile, DEFAULT_SEED_OFFERS[0], 'en');
  assert.ok(points.length >= 3);
  assert.deepEqual(countWordsAndChars('  Hello   world  '), { words: 2, chars: 13 });
  assert.deepEqual(countWordsAndChars('   '), { words: 0, chars: 0 });
});
