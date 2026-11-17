import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUILTIN_SOURCES,
  addCustomSource,
  buildSearchUrlForSource,
  createCustomSource,
  formatSourceDomain,
  removeCustomSource,
  toggleCustomSource,
  updateCustomSource,
  validateCustomSource,
} from './customSources';

test('createCustomSource returns normalized CustomSource with scraper config and false isDefault', () => {
  const source = createCustomSource({
    name: '  Station F Jobs  ',
    baseUrl: ' https://jobs.stationf.co ',
    description: '  Startup campus jobs ',
    searchUrlTemplate: 'https://jobs.stationf.co/jobs?query={keywords}',
    cssSelectors: {
      jobListSelector: '.job-card',
      titleSelector: 'h3.title',
    },
    collectFrequencyMinutes: 30,
    usePlaywright: true,
  });

  assert.equal(source.name, 'Station F Jobs');
  assert.equal(source.baseUrl, 'https://jobs.stationf.co');
  assert.equal(source.description, 'Startup campus jobs');
  assert.equal(source.cssSelectors?.jobListSelector, '.job-card');
  assert.equal(source.cssSelectors?.titleSelector, 'h3.title');
  assert.equal(source.collectFrequencyMinutes, 30);
  assert.equal(source.usePlaywright, true);
  assert.equal(source.enabled, true);
  assert.equal(source.isDefault, false);
  assert.ok(source.id.startsWith('custom_src_station_f_jobs_'));
});

test('validateCustomSource rejects short names, duplicate names, and invalid URLs', () => {
  const existing = DEFAULT_BUILTIN_SOURCES;

  // Short name
  const shortCheck = validateCustomSource(
    { name: 'A', baseUrl: 'https://example.com' },
    existing
  );
  assert.equal(shortCheck.valid, false);
  assert.match(shortCheck.message ?? '', /at least 2 characters/i);

  // Duplicate name (case-insensitive)
  const dupCheck = validateCustomSource(
    { name: 'linkedin', baseUrl: 'https://example.com' },
    existing
  );
  assert.equal(dupCheck.valid, false);
  assert.match(dupCheck.message ?? '', /already exists/i);

  // Missing protocol
  const protocolCheck = validateCustomSource(
    { name: 'StageFrance Portal', baseUrl: 'stagefrance.example/stages' },
    existing
  );
  assert.equal(protocolCheck.valid, false);
  assert.match(protocolCheck.message ?? '', /http:\/\/ or https:\/\//i);

  // Valid
  const validCheck = validateCustomSource(
    { name: 'StageFrance Portal', baseUrl: 'https://www.stagefrance.example/stages' },
    existing
  );
  assert.equal(validCheck.valid, true);
});

test('addCustomSource appends unique source and avoids duplicate entries', () => {
  const custom = createCustomSource({
    name: 'StageFrance Portal',
    baseUrl: 'https://www.stagefrance.example',
  });

  const updated = addCustomSource(DEFAULT_BUILTIN_SOURCES, custom);
  assert.equal(updated.length, DEFAULT_BUILTIN_SOURCES.length + 1);
  assert.equal(updated[updated.length - 1].name, 'StageFrance Portal');

  // Attempting duplicate addition produces unchanged list
  const again = addCustomSource(updated, custom);
  assert.equal(again.length, updated.length);
});

test('removeCustomSource deletes user custom source but prevents removing built-in default sources', () => {
  const custom = createCustomSource({
    name: 'Laou Tech',
    baseUrl: 'https://www.laou.fr',
  });

  const withCustom = addCustomSource(DEFAULT_BUILTIN_SOURCES, custom);
  const withoutCustom = removeCustomSource(withCustom, custom.id);
  assert.equal(withoutCustom.length, DEFAULT_BUILTIN_SOURCES.length);
  assert.ok(!withoutCustom.some((s) => s.id === custom.id));

  // Trying to remove a built-in default source (e.g. src_linkedin) should be prevented
  const withoutLinkedin = removeCustomSource(DEFAULT_BUILTIN_SOURCES, 'src_linkedin');
  assert.equal(withoutLinkedin.length, DEFAULT_BUILTIN_SOURCES.length);
  assert.ok(withoutLinkedin.some((s) => s.id === 'src_linkedin'));
});

test('toggleCustomSource and updateCustomSource perform immutable updates', () => {
  const list = toggleCustomSource(DEFAULT_BUILTIN_SOURCES, 'src_wttj');
  const wttj = list.find((s) => s.id === 'src_wttj');
  assert.equal(wttj?.enabled, false);

  const updated = updateCustomSource(DEFAULT_BUILTIN_SOURCES, 'src_wttj', {
    description: 'Updated description',
  });
  const updatedWttj = updated.find((s) => s.id === 'src_wttj');
  assert.equal(updatedWttj?.description, 'Updated description');
  assert.equal(updatedWttj?.isDefault, true); // Still default
});

test('buildSearchUrlForSource substitutes template placeholders or sets query params', () => {
  const withTemplate = createCustomSource({
    name: 'Station F',
    baseUrl: 'https://jobs.stationf.co',
    searchUrlTemplate: 'https://jobs.stationf.co/search?q={keywords}&city={location}',
  });

  const url1 = buildSearchUrlForSource(withTemplate, 'React Developer', 'Paris');
  assert.equal(url1, 'https://jobs.stationf.co/search?q=React%20Developer&city=Paris');

  const withoutTemplate = createCustomSource({
    name: 'Direct Portal',
    baseUrl: 'https://careers.example.com/jobs',
  });

  const url2 = buildSearchUrlForSource(withoutTemplate, 'Full-Stack Intern', 'Remote');
  assert.ok(url2.includes('q=Full-Stack+Intern') || url2.includes('q=Full-Stack%20Intern'));
  assert.ok(url2.includes('l=Remote'));
});

test('formatSourceDomain extracts clean hostname without www.', () => {
  assert.equal(formatSourceDomain('https://www.welcometothejungle.com/fr/jobs'), 'welcometothejungle.com');
  assert.equal(formatSourceDomain('https://jobs.stationf.co'), 'jobs.stationf.co');
  assert.equal(formatSourceDomain('not-a-valid-url'), 'not-a-valid-url');
});
