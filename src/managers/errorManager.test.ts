import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorSeverity } from '../types/domain';
import {
  createAppError,
  errorReducer,
  getSeverityLabel,
  normalizeUnknownError,
} from './errorManager';

test('createAppError produces immutable structured AppError', () => {
  const fixedDate = new Date('2026-11-16T10:00:00.000Z');
  const err = createAppError({
    code: 'EMPTY_QUERY',
    severity: ErrorSeverity.Validation,
    message: '  Enter a role or keyword to search.  ',
    context: 'search',
    now: fixedDate,
  });

  assert.equal(err.code, 'EMPTY_QUERY');
  assert.equal(err.severity, ErrorSeverity.Validation);
  assert.equal(err.message, 'Enter a role or keyword to search.');
  assert.equal(err.retryable, false);
  assert.equal(err.timestamp, '2026-11-16T10:00:00.000Z');
  assert.equal(err.context, 'search');
});

test('normalizeUnknownError classifies network errors and preserves message', () => {
  const err = normalizeUnknownError(new Error('Failed to fetch from /api/search'), 'search');
  assert.equal(err.severity, ErrorSeverity.Network);
  assert.equal(err.code, 'NETWORK_ERROR');
  assert.equal(err.retryable, true);
  assert.match(err.detail ?? '', /Failed to fetch/);
});

test('errorReducer deduplicates identical code+message errors and caps list length', () => {
  const e1 = createAppError({ code: 'C1', severity: ErrorSeverity.Api, message: 'M1' });
  const e2 = createAppError({ code: 'C1', severity: ErrorSeverity.Api, message: 'M1' });
  const e3 = createAppError({ code: 'C2', severity: ErrorSeverity.Validation, message: 'M2' });

  let list = errorReducer([], { type: 'ADD_ERROR', error: e1 });
  list = errorReducer(list, { type: 'ADD_ERROR', error: e2 });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, e2.id);

  list = errorReducer(list, { type: 'ADD_ERROR', error: e3 });
  assert.equal(list.length, 2);

  list = errorReducer(list, { type: 'DISMISS_ERROR', id: e3.id });
  assert.equal(list.length, 1);

  list = errorReducer(list, { type: 'CLEAR_ERRORS' });
  assert.equal(list.length, 0);
});

test('getSeverityLabel returns accessible explicit text labels', () => {
  assert.equal(getSeverityLabel(ErrorSeverity.Validation), 'Input Required');
  assert.equal(getSeverityLabel(ErrorSeverity.Network), 'Connection Issue');
  assert.equal(getSeverityLabel(ErrorSeverity.Dispatch), 'Dispatch Blocked');
  assert.equal(getSeverityLabel(ErrorSeverity.Api), 'Service Error');
});
