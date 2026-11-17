import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationStatus, ChannelType, ErrorSeverity } from '../types/domain';
import { createAppError } from './errorManager';
import {
  appReducer,
  createInitialState,
  hydratePersistedState,
  selectFilteredOffers,
  selectPipelineCounts,
  selectReadyQueue,
  serializePersistedState,
} from './stateManager';
import { buildPreparedDossier } from '../modules/dossierComposer';
import { normalizeOffer } from '../modules/sourceAggregator';

const buildTestOffers = () => [
  normalizeOffer(
    {
      id: 'test_offer_1',
      title: 'Frontend & AI Tooling Intern',
      organization: 'OrgAI',
      location: 'Paris',
      duration: '6 months',
      source: 'Company Career Page',
      sourceUrl: 'https://example.org/jobs/1',
      requirements: ['TypeScript', 'React'],
    },
    0
  ),
  normalizeOffer(
    {
      id: 'test_offer_2',
      title: 'Telemetry Engineering Intern',
      organization: 'OrgTelemetry',
      location: 'Paris',
      duration: '4 months',
      source: 'Company Career Page',
      sourceUrl: 'https://example.org/jobs/2',
      requirements: ['TypeScript'],
    },
    1
  ),
  normalizeOffer(
    {
      id: 'test_offer_3',
      title: 'Marketplace Engineering Intern',
      organization: 'OrgMarket',
      location: 'Remote',
      duration: '3 months',
      source: 'Company Career Page',
      sourceUrl: 'https://example.org/jobs/3',
      requirements: ['React'],
    },
    2
  ),
];

test('createInitialState starts clean without fabricated seed offers or fake profile data', () => {
  const state = createInitialState();
  assert.equal(state.offers.length, 0);
  assert.equal(state.profile.fullName, '');
  assert.equal(selectReadyQueue(state).length, 0);
  const counts = selectPipelineCounts(state);
  assert.equal(counts.discovered, 0);
  assert.equal(counts.ready, 0);
});

test('appReducer handles search results, prepare, custom channel addition, and mark sent transitions', () => {
  const initialOffers = buildTestOffers();
  let state = createInitialState(undefined, initialOffers);
  const targetOffer = state.offers[0];
  const dossier = buildPreparedDossier(targetOffer, state.profile, 'fr', 'professional');

  state = appReducer(state, {
    type: 'PREPARE_SUCCEEDED',
    offerId: targetOffer.id,
    dossier,
  });

  assert.equal(state.offers[0].status, ApplicationStatus.Ready);
  assert.equal(selectReadyQueue(state).length, 1);

  state = appReducer(state, {
    type: 'ADD_CUSTOM_CHANNEL',
    offerId: targetOffer.id,
    channel: {
      id: 'custom_email_1',
      type: ChannelType.Email,
      target: 'talent@orgai.example',
      label: 'Direct Recruiter',
      verified: true,
    },
  });

  assert.equal(state.dossiers[targetOffer.id].selectedChannelId, 'custom_email_1');

  state = appReducer(state, {
    type: 'MARK_SENT',
    offerId: targetOffer.id,
    channelId: 'custom_email_1',
    sentAt: '2026-11-16T12:00:00.000Z',
    notice: 'Sent to talent@orgai.example',
  });

  assert.equal(state.offers[0].status, ApplicationStatus.Sent);
  assert.equal(selectPipelineCounts(state).sent, 1);
});

test('appReducer delegates errors to errorReducer and filters offers cleanly', () => {
  let state = createInitialState(undefined, buildTestOffers());
  const err = createAppError({
    code: 'SEARCH_ERR',
    severity: ErrorSeverity.Api,
    message: 'API unreachable',
  });

  state = appReducer(state, { type: 'SEARCH_FAILED', error: err });
  assert.equal(state.errors.length, 1);
  assert.equal(state.isSearching, false);

  state = appReducer(state, { type: 'SET_FILTERS', filters: { textFilter: 'OrgAI' } });
  let filtered = selectFilteredOffers(state);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].organization, 'OrgAI');

  state = appReducer(state, {
    type: 'SET_FILTERS',
    filters: { textFilter: '', minDurationFilter: 3, maxDurationFilter: 4 },
  });
  filtered = selectFilteredOffers(state);
  assert.equal(filtered.length, 2);
  const orgs = filtered.map((o) => o.organization);
  assert.ok(orgs.includes('OrgTelemetry'));
  assert.ok(orgs.includes('OrgMarket'));

  state = appReducer(state, { type: 'RESET_FILTERS' });
  assert.equal(selectFilteredOffers(state).length, state.offers.length);
  assert.equal(state.filters.minDurationFilter, 0);
  assert.equal(state.filters.maxDurationFilter, 0);
  assert.equal(state.filters.dateRangeFrom, '');
  assert.equal(state.filters.dateRangeTo, '');
});

test('appReducer prevents externally_unverified offers from entering Ready queue', () => {
  const unverifiedOffer = normalizeOffer(
    {
      id: 'ext_unverified_1',
      title: 'Stage Fullstack Node',
      organization: 'Meteojob Org',
      location: 'Paris',
      source: 'Meteojob',
      sourceUrl: 'https://www.meteojob.com/jobs/123',
      collectionMode: 'discovered',
      verificationLevel: 'externally_unverified',
      verificationStatus: 'externally_unverified',
    },
    0
  );
  let state = createInitialState(undefined, [unverifiedOffer]);
  const dossier = buildPreparedDossier(unverifiedOffer, state.profile, 'fr', 'professional');

  state = appReducer(state, {
    type: 'PREPARE_SUCCEEDED',
    offerId: unverifiedOffer.id,
    dossier,
  });

  assert.equal(state.offers[0].status, ApplicationStatus.Drafting);
  assert.equal(selectReadyQueue(state).length, 0);
});

test('serializePersistedState and hydratePersistedState round-trip cleanly including custom sources', () => {
  let state = createInitialState(undefined, buildTestOffers());
  const baseSourceCount = state.customSources.length;
  state = appReducer(state, {
    type: 'SET_PROFILE',
    profile: { ...state.profile, fullName: 'Nadia Mansouri' },
  });

  const customSource = {
    id: 'custom_src_test_1',
    name: 'Polytech Career Portal',
    baseUrl: 'https://carrieres.polytech.fr',
    description: 'Engineering school internship board',
    enabled: true,
    isDefault: false,
    createdAt: '2026-11-16T12:00:00.000Z',
  };

  state = appReducer(state, { type: 'ADD_CUSTOM_SOURCE', source: customSource });
  assert.equal(state.customSources.length, baseSourceCount + 1);
  assert.ok(state.searchQuery.sources.includes('Polytech Career Portal'));

  const serialized = serializePersistedState(state);
  const hydrated = hydratePersistedState(serialized);
  assert.equal(hydrated.profile.fullName, 'Nadia Mansouri');
  assert.equal(hydrated.offers.length, state.offers.length);
  assert.equal(hydrated.customSources.length, baseSourceCount + 1);
  assert.ok(hydrated.customSources.some((s) => s.name === 'Polytech Career Portal'));

  state = appReducer(state, { type: 'TOGGLE_CUSTOM_SOURCE', sourceId: 'custom_src_test_1' });
  const toggled = state.customSources.find((s) => s.id === 'custom_src_test_1');
  assert.equal(toggled?.enabled, false);
  assert.ok(!state.searchQuery.sources.includes('Polytech Career Portal'));

  state = appReducer(state, {
    type: 'UPDATE_CUSTOM_SOURCE',
    sourceId: 'custom_src_test_1',
    patch: { description: 'Updated portal description' },
  });
  const updated = state.customSources.find((s) => s.id === 'custom_src_test_1');
  assert.equal(updated?.description, 'Updated portal description');

  state = appReducer(state, { type: 'REMOVE_CUSTOM_SOURCE', sourceId: 'custom_src_test_1' });
  assert.equal(state.customSources.length, baseSourceCount);
  assert.ok(!state.customSources.some((s) => s.id === 'custom_src_test_1'));

  const fallback = hydratePersistedState('{not valid json');
  assert.equal(fallback.offers.length, createInitialState().offers.length);
  assert.equal(fallback.customSources.length, createInitialState().customSources.length);
});

