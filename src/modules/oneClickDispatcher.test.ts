import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile } from '../types/domain';
import { DEFAULT_SEED_OFFERS } from './sourceAggregator';
import { buildPreparedDossier } from './dossierComposer';
import {
  buildDispatchBundle,
  evaluatePreFlightChecks,
  formatDossierForClipboard,
} from './oneClickDispatcher';

const profile: CandidateProfile = {
  id: 'p1',
  fullName: 'Camille Laurent',
  email: 'camille.laurent@telecom-paris.fr',
  phone: '+33 6 00 11 22 33',
  location: 'Paris',
  school: 'Télécom Paris',
  degree: 'Engineering Cycle',
  graduationYear: '2027',
  targetRole: 'Software Engineer Stage',
  availability: 'March 2027',
  portfolioUrl: 'https://camille.dev',
  linkedinUrl: '',
  skills: ['TypeScript', 'React', 'Node.js'],
  experiences: ['Built full-stack analytics tools'],
  rawCvText: 'CV',
  avatarUrl: '',
};

test('evaluatePreFlightChecks passes when profile, dossier, and channel are valid', () => {
  const offer = DEFAULT_SEED_OFFERS[2]; // Qonto has email + form
  const dossier = buildPreparedDossier(offer, profile, 'fr');
  const report = evaluatePreFlightChecks(offer, profile, dossier);

  assert.equal(report.readyToSend, true);
  assert.equal(report.checks.every((c) => c.passed), true);
  assert.equal(report.selectedChannel?.target, 'stages-tech@qonto.com');
});

test('evaluatePreFlightChecks blocks when dossier is missing or profile incomplete', () => {
  const offer = DEFAULT_SEED_OFFERS[0];
  const incompleteProfile = { ...profile, email: 'invalid' };
  const report = evaluatePreFlightChecks(offer, incompleteProfile, undefined);

  assert.equal(report.readyToSend, false);
  assert.ok(report.blockingReason);
});

test('buildDispatchBundle produces mailto URI for email channel and form URL for ATS channel', () => {
  const qontoOffer = DEFAULT_SEED_OFFERS[2];
  const emailDossier = buildPreparedDossier(qontoOffer, profile, 'fr');
  const emailBundle = buildDispatchBundle(qontoOffer, profile, emailDossier);
  assert.equal(emailBundle?.mode, 'mailto');
  assert.ok(emailBundle?.launchUri.startsWith('mailto:stages-tech%40qonto.com?'));

  const formDossier = { ...emailDossier, selectedChannelId: 'ch_qonto_form' };
  const formBundle = buildDispatchBundle(qontoOffer, profile, formDossier);
  assert.equal(formBundle?.mode, 'form');
  assert.equal(formBundle?.launchUri, 'https://jobs.lever.co/qonto');

  const clip = formatDossierForClipboard(qontoOffer, emailDossier, profile);
  assert.ok(clip.includes('Camille Laurent'));
  assert.ok(clip.includes('Subject:'));
});
