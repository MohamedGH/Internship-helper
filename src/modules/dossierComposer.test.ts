import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile } from '../types/domain';
import { normalizeOffer } from './sourceAggregator';
import {
  buildPreparedDossier,
  composeApplicationEmail,
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

const sampleEmailOffer = normalizeOffer(
  {
    id: 'offer_1',
    title: 'Software Engineer Intern',
    organization: 'OrgA',
    location: 'Paris',
    duration: '6 months',
    startDate: '2027-02-01',
    source: 'Company Career Page',
    sourceUrl: 'https://example.org/jobs/1',
    applicationEmail: 'campus@orga.example',
    description:
      'Vous participerez au développement de l’API TypeScript et des interfaces React pour les clients.',
    requirements: ['React', 'TypeScript', 'Python'],
  },
  0
);

const sampleFormOnlyOffer = normalizeOffer(
  {
    id: 'offer_2',
    title: 'Backend Engineering Intern',
    organization: 'OrgForm',
    location: 'Lyon',
    duration: '6 months',
    source: 'Company Career Page',
    sourceUrl: 'https://jobs.lever.co/orgform/backend-1',
    applicationFormUrl: 'https://jobs.lever.co/orgform/backend-1',
    description: 'Build Python & PostgreSQL data pipelines for distributed telemetry.',
    requirements: ['Python', 'PostgreSQL'],
  },
  1
);

test('extractMatchingSkills finds overlapping CV and offer skills', () => {
  const matched = extractMatchingSkills(candidateProfile, sampleEmailOffer);
  assert.ok(matched.includes('React'));
  assert.ok(matched.includes('TypeScript'));
  assert.ok(matched.includes('Python'));
});

test('composeCoverLetterTemplate produces personalized French/English letters without synthetic org boilerplate', () => {
  assert.equal(sampleEmailOffer.organizationSummary, null);

  const frLetter = composeCoverLetterTemplate(sampleEmailOffer, candidateProfile, 'fr', 'professional');
  assert.match(frLetter, /OrgA/);
  assert.match(frLetter, /Yanis Benali/);
  assert.match(frLetter, /Madame, Monsieur/);
  assert.match(frLetter, /API TypeScript/);
  assert.equal(frLetter.includes('engineering and product team'), false);

  const enLetter = composeCoverLetterTemplate(sampleEmailOffer, candidateProfile, 'en', 'enthusiastic');
  assert.match(enLetter, /Dear Hiring Team at OrgA/);
  assert.match(enLetter, /Yanis Benali/);

  // Inaccessible content adds honest verification note instead of fabricating missions
  const inaccessibleOffer = { ...sampleEmailOffer, contentAccessible: false, description: '' };
  const cautiousLetter = composeCoverLetterTemplate(
    inaccessibleOffer,
    candidateProfile,
    'fr',
    'professional'
  );
  assert.match(cautiousLetter, /pas accessible automatiquement/i);
});

test('composeApplicationEmail produces a concise email distinct from cover letter and handles form-only offers', () => {
  const emailDossier = buildPreparedDossier(sampleEmailOffer, candidateProfile, 'fr', 'professional');
  assert.equal(emailDossier.recipientEmail, 'campus@orga.example');
  assert.ok(emailDossier.emailBody.length > 50);
  assert.notEqual(emailDossier.emailBody, emailDossier.coverLetter);
  assert.match(emailDossier.emailBody, /pièces jointes|CV/i);

  const formDossier = buildPreparedDossier(sampleFormOnlyOffer, candidateProfile, 'en', 'concise');
  assert.equal(formDossier.recipientEmail, null);
  assert.ok(formDossier.formCoverNote.length > 40);
  assert.match(formDossier.formCoverNote, /OrgForm/);

  const customEmail = composeApplicationEmail(
    sampleEmailOffer,
    candidateProfile,
    'fr',
    'professional',
    {
      ...sampleEmailOffer.channels[0],
      contactName: 'Claire Dupont',
    }
  );
  assert.match(customEmail.body, /Bonjour Claire Dupont,/);
});

test('buildPreparedDossier populates subject, distinct emailBody, formCoverNote, letter, CV highlights, and preferred channel', () => {
  const dossier = buildPreparedDossier(sampleEmailOffer, candidateProfile, 'fr', 'concise');

  assert.equal(dossier.offerId, sampleEmailOffer.id);
  assert.ok(dossier.emailSubject.includes('Yanis Benali'));
  assert.ok(dossier.cvTailoringHighlights.length >= 3);
  assert.equal(dossier.selectedChannelId, 'offer_1_ch_1');
});

test('computeCvTailoringPoints and countWordsAndChars compute accurate values', () => {
  const points = computeCvTailoringPoints(candidateProfile, sampleEmailOffer, 'en');
  assert.ok(points.length >= 3);
  assert.deepEqual(countWordsAndChars('  Hello   world  '), { words: 2, chars: 13 });
  assert.deepEqual(countWordsAndChars('   '), { words: 0, chars: 0 });
});
