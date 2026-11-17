import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, SourceProvider, WorkMode } from '../types/domain';
import {
  ALL_SOURCES,
  DEFAULT_SEED_OFFERS,
  deduplicateOffers,
  filterOffers,
  isOfferWithinDateRange,
  isOfferWithinDuration,
  mapRawSourceName,
  normalizeOffer,
  parseDurationMonths,
  validateSearchQuery,
} from './sourceAggregator';

test('normalizeOffer maps raw search payload into clean InternshipOffer with channels and duration', () => {
  const offer = normalizeOffer(
    {
      title: 'Stage Data Engineer',
      organization: 'BlaBlaCar',
      location: 'Paris',
      workMode: 'Hybride',
      duration: '4 à 6 mois',
      startDate: '2027-03-01',
      endDate: '2027-08-31',
      source: 'WTTJ',
      applicationEmail: 'data-stages@blablacar.com',
      applicationFormUrl: 'https://jobs.lever.co/blablacar/1',
      requirements: ['Python', 'SQL', 'Spark'],
    },
    0
  );

  assert.equal(offer.organization, 'BlaBlaCar');
  assert.equal(offer.workMode, WorkMode.Hybrid);
  assert.equal(offer.durationMonths, 6);
  assert.equal(offer.startDate, '2027-03-01');
  assert.equal(offer.endDate, '2027-08-31');
  assert.equal(offer.source, SourceProvider.WelcomeToTheJungle);
  assert.equal(offer.channels.length, 2);
  assert.equal(offer.channels[0].type, ChannelType.Email);
});

test('mapRawSourceName accurately matches custom source names', () => {
  const customSources = [
    {
      id: 'cs_station_f',
      name: 'Station F Jobs',
      baseUrl: 'https://jobs.stationf.co',
      enabled: true,
      isDefault: false,
      createdAt: '2026-01-01',
    },
  ];

  assert.equal(mapRawSourceName('Station F Jobs', customSources), 'Station F Jobs');
  assert.equal(mapRawSourceName('station f startup portal', customSources), 'Station F Jobs');
  assert.equal(mapRawSourceName('Indeed France', customSources), SourceProvider.Indeed);
  assert.equal(mapRawSourceName('Unknown Job Portal', customSources), 'Unknown Job Portal');
});

test('parseDurationMonths correctly parses month and week formats', () => {
  assert.equal(parseDurationMonths('6 months'), 6);
  assert.equal(parseDurationMonths('6 mois'), 6);
  assert.equal(parseDurationMonths('4 à 6 mois'), 6);
  assert.equal(parseDurationMonths('3-4 mois'), 4);
  assert.equal(parseDurationMonths('3 months'), 3);
  assert.equal(parseDurationMonths('12 weeks'), 3);
  assert.equal(parseDurationMonths(''), 6);
  assert.equal(parseDurationMonths(undefined), 6);
});

test('isOfferWithinDuration respects minimum and maximum duration constraints', () => {
  assert.equal(isOfferWithinDuration(6, 0, 0), true);
  assert.equal(isOfferWithinDuration(6, 3, 6), true);
  assert.equal(isOfferWithinDuration(4, 3, 6), true);
  assert.equal(isOfferWithinDuration(2, 3, 6), false);
  assert.equal(isOfferWithinDuration(7, 3, 6), false);
  assert.equal(isOfferWithinDuration(3, 4, 0), false);
  assert.equal(isOfferWithinDuration(5, 0, 4), false);
});

test('isOfferWithinDateRange evaluates start date within specified range', () => {
  assert.equal(isOfferWithinDateRange('2027-04-01', '', ''), true);
  assert.equal(isOfferWithinDateRange('2027-04-01', '2027-03-01', '2027-05-01'), true);
  assert.equal(isOfferWithinDateRange('2027-02-01', '2027-03-01', '2027-05-01'), false);
  assert.equal(isOfferWithinDateRange('2027-06-01', '2027-03-01', '2027-05-01'), false);
  assert.equal(isOfferWithinDateRange(undefined, '2027-03-01', '2027-05-01'), true);
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

test('filterOffers filters by source, channel type, text query, duration, and date range', () => {
  const bySource = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: SourceProvider.WelcomeToTheJungle,
    channelFilter: 'all',
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: '',
  });
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0].organization, 'Alan');

  const byEmailAndText = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: 'all',
    channelFilter: ChannelType.Email,
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: 'Qonto',
  });
  assert.equal(byEmailAndText.length, 1);
  assert.equal(byEmailAndText[0].organization, 'Qonto');

  // Filter 4-month offers only (Datadog)
  const byDuration = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: 'all',
    channelFilter: 'all',
    minDurationFilter: 4,
    maxDurationFilter: 4,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: '',
  });
  assert.equal(byDuration.length, 1);
  assert.equal(byDuration[0].organization, 'Datadog');

  // Filter offers starting in June or later (Back Market starts 2027-06-01)
  const byDateRange = filterOffers(DEFAULT_SEED_OFFERS, {
    sourceFilter: 'all',
    channelFilter: 'all',
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '2027-06-01',
    dateRangeTo: '2027-08-31',
    textFilter: '',
  });
  assert.equal(byDateRange.length, 1);
  assert.equal(byDateRange[0].organization, 'Back Market');
});

test('validateSearchQuery rejects empty keywords, zero sources, and invalid duration or date ranges', () => {
  assert.equal(
    validateSearchQuery({
      keywords: ' ',
      location: 'Paris',
      duration: '6 months',
      minDurationMonths: 3,
      maxDurationMonths: 6,
      startDateFrom: '2027-02-01',
      startDateTo: '2027-09-01',
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
      minDurationMonths: 3,
      maxDurationMonths: 6,
      startDateFrom: '2027-02-01',
      startDateTo: '2027-09-01',
      workMode: 'all',
      sources: [],
    }).valid,
    false
  );

  // minDuration > maxDuration should be rejected
  const durationCheck = validateSearchQuery({
    keywords: 'React Stage',
    location: 'Paris',
    duration: '6 months',
    minDurationMonths: 6,
    maxDurationMonths: 3,
    startDateFrom: '2027-02-01',
    startDateTo: '2027-09-01',
    workMode: 'all',
    sources: ALL_SOURCES,
  });
  assert.equal(durationCheck.valid, false);
  assert.match(durationCheck.message ?? '', /duration/i);

  // startDateFrom > startDateTo should be rejected
  const dateCheck = validateSearchQuery({
    keywords: 'React Stage',
    location: 'Paris',
    duration: '6 months',
    minDurationMonths: 3,
    maxDurationMonths: 6,
    startDateFrom: '2027-10-01',
    startDateTo: '2027-02-01',
    workMode: 'all',
    sources: ALL_SOURCES,
  });
  assert.equal(dateCheck.valid, false);
  assert.match(dateCheck.message ?? '', /date/i);

  // Valid search query passes
  assert.equal(
    validateSearchQuery({
      keywords: 'React Stage',
      location: 'Paris',
      duration: '6 months',
      minDurationMonths: 3,
      maxDurationMonths: 6,
      startDateFrom: '2027-02-01',
      startDateTo: '2027-09-01',
      workMode: 'all',
      sources: ALL_SOURCES,
    }).valid,
    true
  );
});
