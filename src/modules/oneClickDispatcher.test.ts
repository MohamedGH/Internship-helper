import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile } from '../types/domain';
import { normalizeOffer } from './sourceAggregator';
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

const buildDispatchTestOffer = () =>
  normalizeOffer(
    {
      id: 'offer_disp_1',
      title: 'Product Engineering Intern',
      organization: 'OrgDispatch',
      location: 'Paris',
      duration: '6 months',
      source: 'Company Career Page',
      sourceUrl: 'https://jobs.lever.co/orgdispatch',
      applicationEmail: 'stages-tech@orgdispatch.example',
      applicationFormUrl: 'https://jobs.lever.co/orgdispatch/apply',
      requirements: ['TypeScript', 'React'],
    },
    0
  );

test('evaluatePreFlightChecks passes when profile, dossier, and channel are valid', () => {
  const offer = buildDispatchTestOffer();
  const dossier = buildPreparedDossier(offer, profile, 'fr');
  const report = evaluatePreFlightChecks(offer, profile, dossier);

  assert.equal(report.readyToSend, true);
  assert.equal(report.checks.every((c) => c.passed), true);
  assert.equal(report.selectedChannel?.target, 'stages-tech@orgdispatch.example');
});

test('evaluatePreFlightChecks blocks when dossier is missing or profile incomplete', () => {
  const offer = buildDispatchTestOffer();
  const incompleteProfile = { ...profile, email: 'invalid' };
  const report = evaluatePreFlightChecks(offer, incompleteProfile, undefined);

  assert.equal(report.readyToSend, false);
  assert.ok(report.blockingReason);
});

test('buildDispatchBundle produces mailto URI for email channel and form URL for ATS channel', () => {
  const offer = buildDispatchTestOffer();
  const emailDossier = buildPreparedDossier(offer, profile, 'fr');
  const emailBundle = buildDispatchBundle(offer, profile, emailDossier);
  assert.equal(emailBundle?.mode, 'mailto');
  assert.ok(emailBundle?.launchUri.startsWith('mailto:stages-tech%40orgdispatch.example?'));

  const formChannel = offer.channels.find((ch) => ch.target.includes('lever.co'));
  assert.ok(formChannel);
  const formDossier = { ...emailDossier, selectedChannelId: formChannel.id };
  const formBundle = buildDispatchBundle(offer, profile, formDossier);
  assert.equal(formBundle?.mode, 'form');
  assert.equal(formBundle?.launchUri, 'https://jobs.lever.co/orgdispatch/apply');

  const clip = formatDossierForClipboard(offer, emailDossier, profile);
  assert.ok(clip.includes('Camille Laurent'));
  assert.ok(clip.includes('Subject:'));
});
