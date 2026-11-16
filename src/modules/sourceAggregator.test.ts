import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, SourceProvider, WorkMode } from '../types/domain';
import {
  ALL_SOURCES,
  DEFAULT_SEED_OFFERS,
  deduplicateOffers,
  filterOffers,
  normalizeOffer,
  validateSearchQuery,
} from './sourceAggregator';

test('normalizeOffer maps raw search payload into clean InternshipOffer with channels', () => {
  const offer = normalizeOffer(
    {
      title: 'Stage Data Engineer',
      organization: 'BlaBlaCar',
      location: 'Paris',
      workMode: 'Hybride',
      source: 'WTTJ',
      applicationEmail: 'data-stages@blablacar.com',
      applicationFormUrl: 'https://jobs.lever.co/blablacar/1',
      requirements: ['Python', 'SQL', 'Spark'],
    },
    0
  );

  assert.equal(offer.organization, 'BlaBlaCar');
  assert.equal(offer.workMode, WorkMode.Hybrid);
  assert.equal(offer.source, SourceProvider.WelcomeToTheJungle);
  assert.equal(offer.channels.length, 2);
  assert.equal(offer.channels[0].type, ChannelType.Email);
});

test('deduplicateOffers preserves existing offers and prepends only unique new offers', () => {
  const existing = DEFAULT_SEED_OFFERS.slice(0, 2);
  const duplicate = normalizeOffer(
    {
      title: existing[0].title,
      organization: existing[0].organization,
    },
    0
  );
  const fresh = normalizeOffer(
    {
      title: 'Stage ML Ops',
      organization: 'Hugging Face',
    },
    1
  );

  const merged = deduplicateOffers([duplicate, fresh], existing);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].organization, 'Hugging Face');
});

test('filterOffers filters by source, channel type, and text query', () => {
  const bySource = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: SourceProvider.WelcomeToTheJungle,
    channelFilter: 'all',
    textFilter: '',
  });
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0].organization, 'Alan');

  const byEmailAndText = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: 'all',
    channelFilter: ChannelType.Email,
    textFilter: 'Qonto',
  });
  assert.equal(byEmailAndText.length, 1);
  assert.equal(byEmailAndText[0].organization, 'Qonto');
});

test('validateSearchQuery rejects empty keywords or zero selected sources', () => {
  assert.equal(
    validateSearchQuery({
      keywords: ' ',
      location: 'Paris',
      duration: '6 months',
      workMode: 'all',
      sources: ALL_SOURCES,
    }).valid,
    false
  );

  assert.equal(
    validateSearchQuery({
      keywords: 'React Stage',
      location: 'Paris',
      duration: '6 months',
      workMode: 'all',
      sources: [],
    }).valid,
    false
  );

  assert.equal(
    validateSearchQuery({
      keywords: 'React Stage',
      location: 'Paris',
      duration: '6 months',
      workMode: 'all',
      sources: ALL_SOURCES,
    }).valid,
    true
  );
});
