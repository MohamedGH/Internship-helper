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

test('createInitialState seeds offers and prepares first ready dossier', () => {
  const state = createInitialState();
  assert.ok(state.offers.length >= 5);
  assert.ok(selectReadyQueue(state).length >= 1);
  const counts = selectPipelineCounts(state);
  assert.equal(counts.discovered, state.offers.length);
  assert.equal(counts.ready, 1);
});

test('appReducer handles prepare, custom channel addition, and mark sent transitions', () => {
  let state = createInitialState();
  const targetOffer = state.offers[1];
  const dossier = buildPreparedDossier(targetOffer, state.profile, 'fr', 'professional');

  state = appReducer(state, {
    type: 'PREPARE_SUCCEEDED',
    offerId: targetOffer.id,
    dossier,
  });

  assert.equal(state.offers[1].status, ApplicationStatus.Ready);
  assert.equal(selectReadyQueue(state).length, 2);

  state = appReducer(state, {
    type: 'ADD_CUSTOM_CHANNEL',
    offerId: targetOffer.id,
    channel: {
      id: 'custom_email_1',
      type: ChannelType.Email,
      target: 'talent@mistral.ai',
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
    notice: 'Sent to talent@mistral.ai',
  });

  assert.equal(state.offers[1].status, ApplicationStatus.Sent);
  assert.equal(selectPipelineCounts(state).sent, 1);
});

test('appReducer delegates errors to errorReducer and filters offers cleanly', () => {
  let state = createInitialState();
  const err = createAppError({
    code: 'SEARCH_ERR',
    severity: ErrorSeverity.Api,
    message: 'API unreachable',
  });

  state = appReducer(state, { type: 'SEARCH_FAILED', error: err });
  assert.equal(state.errors.length, 1);
  assert.equal(state.isSearching, false);

  state = appReducer(state, { type: 'SET_FILTERS', filters: { textFilter: 'Mistral' } });
  const filtered = selectFilteredOffers(state);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].organization, 'Mistral AI');
});

test('serializePersistedState and hydratePersistedState round-trip cleanly', () => {
  let state = createInitialState();
  state = appReducer(state, {
    type: 'SET_PROFILE',
    profile: { ...state.profile, fullName: 'Nadia Mansouri' },
  });

  const serialized = serializePersistedState(state);
  const hydrated = hydratePersistedState(serialized);
  assert.equal(hydrated.profile.fullName, 'Nadia Mansouri');
  assert.equal(hydrated.offers.length, state.offers.length);

  // Corrupt JSON safely falls back to initial state
  const fallback = hydratePersistedState('{not valid json');
  assert.equal(fallback.offers.length, createInitialState().offers.length);
});
