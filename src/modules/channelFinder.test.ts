import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from '../types/domain';
import {
  buildMailtoUri,
  classifyAtsPlatform,
  extractEmailsFromText,
  extractUrlsFromText,
  normalizeChannelsFromRaw,
  selectPreferredChannel,
  verifyChannelReadiness,
} from './channelFinder';

test('extractEmailsFromText extracts unique valid emails and ignores image extensions', () => {
  const sample =
    'Contact recrutement@mistral.ai or jobs@mistral.ai (ignore logo@2x.png) and RECruTement@mistral.ai.';
  assert.deepEqual(extractEmailsFromText(sample), ['recrutement@mistral.ai', 'jobs@mistral.ai']);
});

test('extractUrlsFromText strips trailing punctuation', () => {
  const sample = 'Apply via https://jobs.lever.co/alan/12345, or https://tally.so/r/wxyz.';
  assert.deepEqual(extractUrlsFromText(sample), [
    'https://jobs.lever.co/alan/12345',
    'https://tally.so/r/wxyz',
  ]);
});

test('classifyAtsPlatform recognizes major French & global ATS platforms', () => {
  assert.equal(
    classifyAtsPlatform('https://www.welcometothejungle.com/fr/companies/qonto/jobs/stage'),
    'Welcome to the Jungle Form'
  );
  assert.equal(classifyAtsPlatform('https://boards.greenhouse.io/datadog/jobs/12'), 'Greenhouse Application Form');
  assert.equal(classifyAtsPlatform('https://jobs.ashbyhq.com/linear/abc'), 'Ashby Application Form');
});

test('selectPreferredChannel prioritizes verified direct email over form unless explicitly selected', () => {
  const channels = normalizeChannelsFromRaw(
    'off1',
    [
      { id: 'c1', type: ChannelType.Form, target: 'https://jobs.lever.co/acme/1', verified: true },
      { id: 'c2', type: ChannelType.Email, target: 'stages@acme.fr', verified: true },
    ],
    'https://acme.fr/careers'
  );

  assert.equal(selectPreferredChannel(channels)?.id, 'c2');
  assert.equal(selectPreferredChannel(channels, 'c1')?.id, 'c1');
});

test('buildMailtoUri encodes subject and body with %20 spaces', () => {
  const uri = buildMailtoUri('hr@acme.fr', 'Candidature Stage Frontend', 'Bonjour,\nVoici ma lettre.');
  assert.ok(uri.startsWith('mailto:hr%40acme.fr?'));
  assert.ok(uri.includes('subject=Candidature%20Stage%20Frontend'));
  assert.ok(!uri.includes('+'));
});

test('verifyChannelReadiness validates email and URL targets cleanly', () => {
  assert.equal(verifyChannelReadiness(undefined).ready, false);
  assert.equal(
    verifyChannelReadiness({
      id: 'c1',
      type: ChannelType.Email,
      target: 'bad-email',
      label: 'Email',
      verified: false,
    }).ready,
    false
  );
  assert.equal(
    verifyChannelReadiness({
      id: 'c2',
      type: ChannelType.Form,
      target: 'https://company.com/apply',
      label: 'Form',
      verified: true,
    }).ready,
    true
  );
});
