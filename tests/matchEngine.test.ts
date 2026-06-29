import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchCompletionGuard, createMatchSessionId } from '../src/lib/matchEngine';

test('match session remains stable for parent snapshots and changes only with match identity', () => {
  const session = createMatchSessionId('league-1', 18, 'match-19-1', 'user-1');
  assert.equal(createMatchSessionId('league-1', 18, 'match-19-1', 'user-1'), session);
  assert.notEqual(createMatchSessionId('league-1', 19, 'match-19-1', 'user-1'), session);
  assert.notEqual(createMatchSessionId('league-1', 18, 'match-19-2', 'user-1'), session);
  assert.notEqual(createMatchSessionId('league-1', 18, 'match-19-1', 'user-2'), session);
});

test('match completion guard invokes a terminal action only once', () => {
  const guard = createMatchCompletionGuard();
  assert.equal(guard.complete(), true);
  assert.equal(guard.complete(), false);
  assert.equal(guard.getState(), 'completed');
  assert.equal(guard.wasDuplicateCompletionPrevented(), true);
});

test('skipped match cannot complete again', () => {
  const guard = createMatchCompletionGuard();
  assert.equal(guard.skip(), true);
  assert.equal(guard.complete(), false);
  assert.equal(guard.getState(), 'skipped');
});

