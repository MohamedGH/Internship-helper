import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, SourceProvider, WorkMode } from '../types/domain';
import {
  ALL_SOURCES,
  deduplicateOffers,
  filterOffers,
  isOfferWithinDateRange,
  isOfferWithinDuration,
  mapRawSourceName,
  normalizeOffer,
  parseDurationMonths,
  validateSearchQuery,
} from './sourceAggregator';

const buildOffersSet = () => [
  normalizeOffer(
    {
      id: 'o_1',
      title: 'Software Engineer Intern',
      organization: 'Company A',
      location: 'Paris',
      workMode: 'Hybrid',
      duration: '6 months',
      startDate: '2027-02-01',
      source: 'WTTJ',
      sourceUrl: 'https://example.org/jobs/1',
      applicationEmail: 'jobs@companya.example',
      requirements: ['React', 'TypeScript'],
    },
    0
  ),
  normalizeOffer(
    {
      id: 'o_2',
      title: 'Data Engineer Intern',
      organization: 'Company B',
      location: 'Lyon',
      workMode: 'On-site',
      duration: '4 months',
      startDate: '2027-06-01',
      source: 'Indeed',
      sourceUrl: 'https://example.org/jobs/2',
      applicationFormUrl: 'https://jobs.lever.co/companyb/2',
      requirements: ['Python', 'SQL'],
    },
    1
  ),
];

test('normalizeOffer maps raw search payload into clean InternshipOffer with channels and duration', () => {
  const offer = normalizeOffer(
    {
      title: 'Stage Data Engineer',
      organization: 'OrgAlpha',
      location: 'Paris',
      workMode: 'Hybride',
      duration: '4 à 6 mois',
      startDate: '2027-03-01',
      endDate: '2027-08-31',
      source: 'WTTJ',
      applicationEmail: 'data-stages@orgalpha.example',
      applicationFormUrl: 'https://jobs.lever.co/orgalpha/1',
      requirements: ['Python', 'SQL', 'Spark'],
    },
    0
  );

  assert.equal(offer.organization, 'OrgAlpha');
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

test('parseDurationMonths correctly parses month and week formats and returns null when missing', () => {
  assert.equal(parseDurationMonths('6 months'), 6);
  assert.equal(parseDurationMonths('6 mois'), 6);
  assert.equal(parseDurationMonths('4 à 6 mois'), 6);
  assert.equal(parseDurationMonths('3-4 mois'), 4);
  assert.equal(parseDurationMonths('3 months'), 3);
  assert.equal(parseDurationMonths('12 weeks'), 3);
  assert.equal(parseDurationMonths(''), null);
  assert.equal(parseDurationMonths(undefined), null);
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
  const existing = buildOffersSet();
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
      organization: 'OrgGamma',
    },
    1
  );

  const merged = deduplicateOffers([duplicate, fresh], existing);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].organization, 'OrgGamma');
});

test('filterOffers filters by source, channel type, text query, duration, and date range', () => {
  const sampleSet = buildOffersSet();

  const bySource = filterOffers(sampleSet, {
    sourceFilter: SourceProvider.WelcomeToTheJungle,
    channelFilter: 'all',
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: '',
  });
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0].organization, 'Company A');

  const byEmailAndText = filterOffers(sampleSet, {
    sourceFilter: 'all',
    channelFilter: ChannelType.Email,
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: 'Company A',
  });
  assert.equal(byEmailAndText.length, 1);
  assert.equal(byEmailAndText[0].organization, 'Company A');

  const byDuration = filterOffers(sampleSet, {
    sourceFilter: 'all',
    channelFilter: 'all',
    minDurationFilter: 4,
    maxDurationFilter: 4,
    dateRangeFrom: '',
    dateRangeTo: '',
    textFilter: '',
  });
  assert.equal(byDuration.length, 1);
  assert.equal(byDuration[0].organization, 'Company B');

  const byDateRange = filterOffers(sampleSet, {
    sourceFilter: 'all',
    channelFilter: 'all',
    minDurationFilter: 0,
    maxDurationFilter: 0,
    dateRangeFrom: '2027-05-01',
    dateRangeTo: '2027-08-31',
    textFilter: '',
  });
  assert.equal(byDateRange.length, 1);
  assert.equal(byDateRange[0].organization, 'Company B');
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
