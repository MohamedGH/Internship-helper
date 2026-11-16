import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDossierRoute,
  getRouteTitle,
  isRouteActive,
  parseHashToRoute,
  routeToHash,
} from './routeManager';

test('parseHashToRoute maps all routes accurately', () => {
  assert.deepEqual(parseHashToRoute(''), { name: 'discover', path: '/' });
  assert.deepEqual(parseHashToRoute('#/'), { name: 'discover', path: '/' });
  assert.deepEqual(parseHashToRoute('#/queue'), { name: 'queue', path: '/queue' });
  assert.deepEqual(parseHashToRoute('#/applications'), {
    name: 'applications',
    path: '/applications',
  });
  assert.deepEqual(parseHashToRoute('#/cv'), { name: 'profile', path: '/cv' });
  assert.deepEqual(parseHashToRoute('#/dossier/offer-123'), {
    name: 'dossier',
    path: '/dossier/offer-123',
    offerId: 'offer-123',
  });
});

test('parseHashToRoute falls back cleanly on unknown or empty dossier paths', () => {
  assert.deepEqual(parseHashToRoute('#/dossier/'), { name: 'discover', path: '/' });
  assert.deepEqual(parseHashToRoute('#/unknown-route'), { name: 'discover', path: '/' });
});

test('buildDossierRoute encodes offer IDs and round-trips through routeToHash', () => {
  const route = buildDossierRoute('stage/offer 42');
  const hash = routeToHash(route);
  const parsed = parseHashToRoute(hash);
  assert.equal(parsed.name, 'dossier');
  if (parsed.name === 'dossier') {
    assert.equal(parsed.offerId, 'stage/offer 42');
  }
});

test('isRouteActive and getRouteTitle return expected values', () => {
  const queueRoute = parseHashToRoute('#/queue');
  assert.equal(isRouteActive(queueRoute, 'queue'), true);
  assert.equal(isRouteActive(queueRoute, 'discover'), false);
  assert.equal(getRouteTitle(queueRoute), 'Ready-to-Send Queue');
});
