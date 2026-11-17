import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfile, ChannelType } from '../types/domain';
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
      description: 'Develop TypeScript and React interfaces for internal product workflows.',
      requirements: ['TypeScript', 'React'],
    },
    0
  );

test('evaluatePreFlightChecks passes when profile, dossier, and verified channel are valid', () => {
  const offer = buildDispatchTestOffer();
  const dossier = buildPreparedDossier(offer, profile, 'fr');
  const report = evaluatePreFlightChecks(offer, profile, dossier);

  assert.equal(report.readyToSend, true);
  assert.equal(report.channelVerified, true);
  assert.equal(report.checks.every((c) => c.passed), true);
  assert.equal(report.selectedChannel?.target, 'stages-tech@orgdispatch.example');
});

test('evaluatePreFlightChecks blocks unverified syntax-only email contact from dispatch', () => {
  const baseOffer = buildDispatchTestOffer();
  const unverifiedChannelOffer = {
    ...baseOffer,
    channels: [
      {
        id: 'ch_unver',
        type: ChannelType.Email,
        target: 'guess@orgdispatch.example',
        label: 'Unverified guess',
        verified: false,
        verificationStatus: 'candidate_syntax_only' as const,
      },
    ],
  };
  const dossier = {
    ...buildPreparedDossier(unverifiedChannelOffer, profile, 'fr'),
    selectedChannelId: 'ch_unver',
  };
  const report = evaluatePreFlightChecks(unverifiedChannelOffer, profile, dossier);
  assert.equal(report.readyToSend, false);
  assert.equal(report.channelVerified, false);
  assert.match(report.blockingReason ?? '', /NOT verified/i);
});

test('evaluatePreFlightChecks blocks when dossier is missing or profile incomplete', () => {
  const offer = buildDispatchTestOffer();
  const incompleteProfile = { ...profile, email: 'invalid' };
  const report = evaluatePreFlightChecks(offer, incompleteProfile, undefined);

  assert.equal(report.readyToSend, false);
  assert.ok(report.blockingReason);
});

test('buildDispatchBundle uses concise emailBody in mailto URI and form URL for ATS channel', () => {
  const offer = buildDispatchTestOffer();
  const emailDossier = buildPreparedDossier(offer, profile, 'fr');
  const emailBundle = buildDispatchBundle(offer, profile, emailDossier);
  assert.equal(emailBundle?.mode, 'mailto');
  assert.ok(emailBundle?.launchUri.startsWith('mailto:stages-tech%40orgdispatch.example?'));
  assert.ok(emailBundle?.launchUri.includes('pi%C3%A8ces%20jointes'));
  // Ensure mailto URI sends the concise email, not the formal cover letter salutation
  assert.equal(emailBundle?.launchUri.includes('salutations%20distingu'), false);

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

test('evaluatePreFlightChecks blocks externally_unverified, inaccessible, and expired offers', () => {
  const baseOffer = buildDispatchTestOffer();
  const dossier = buildPreparedDossier(baseOffer, profile, 'fr');

  const unverifiedOffer = {
    ...baseOffer,
    collectionMode: 'discovered' as const,
    contentAccessible: false,
    verificationLevel: 'externally_unverified' as const,
    verificationStatus: 'externally_unverified' as const,
  };
  const unverifiedReport = evaluatePreFlightChecks(unverifiedOffer, profile, dossier);
  assert.equal(unverifiedReport.readyToSend, false);
  assert.match(unverifiedReport.blockingReason ?? '', /not accessible|unverified/i);

  const expiredOffer = {
    ...baseOffer,
    verificationLevel: 'expired' as const,
    verificationStatus: 'expired' as const,
  };
  const expiredReport = evaluatePreFlightChecks(expiredOffer, profile, dossier);
  assert.equal(expiredReport.readyToSend, false);
  assert.match(expiredReport.blockingReason ?? '', /expired/i);
});
