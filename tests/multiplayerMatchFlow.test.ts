import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextMultiplayerMatchPreferences,
  readMultiplayerMatchPreferences,
  writeMultiplayerAutoContinue,
  writeMultiplayerAutoSeason,
  writeMultiplayerMatchSpeed,
} from '../src/lib/multiplayerMatchPreferences';
import { getCurrentUserWatchProgress, shouldAutoAdvanceInviteWeek } from '../src/lib/multiplayerMatchFlow';
import type { WeekUserProgress } from '../src/lib/multiplayerService';
import { clearCanli11MultiplayerStorage } from '../src/lib/multiplayerCleanup';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const progress = (userId: string, status: WeekUserProgress['status']): WeekUserProgress => ({
  id: `week-1-${userId}`,
  leagueId: 'league-1',
  week: 1,
  userId,
  teamId: `team-${userId}`,
  matchId: `match-${userId}`,
  status,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
});

test('multiplayer auto continue and match speed survive week changes', () => {
  const storage = createStorage();
  writeMultiplayerAutoContinue(storage, 'league-1', 'user-1', true);
  writeMultiplayerAutoSeason(storage, 'league-1', 'user-1', true);
  writeMultiplayerMatchSpeed(storage, 'league-1', 'user-1', 'very-fast');

  assert.deepEqual(readMultiplayerMatchPreferences(storage, 'league-1', 'user-1'), {
    autoContinue: true,
    autoSeason: true,
    speed: 'very-fast',
  });
  assert.deepEqual(readMultiplayerMatchPreferences(storage, 'league-1', 'user-1'), {
    autoContinue: true,
    autoSeason: true,
    speed: 'very-fast',
  });
});

test('multiplayer match preferences do not reload or reset without a league/user key', () => {
  const storage = createStorage();
  writeMultiplayerAutoContinue(storage, 'league-1', 'user-1', true);
  const current = getNextMultiplayerMatchPreferences(storage, 'league-1:user-1', 'league-1', 'user-1');
  assert.equal(current, null);
  const missingLeague = getNextMultiplayerMatchPreferences(storage, 'league-1:user-1', null, 'user-1');
  assert.equal(missingLeague, null);
  const next = getNextMultiplayerMatchPreferences(storage, 'league-1:user-1', 'league-2', 'user-1');
  assert.deepEqual(next, {
    key: 'league-2:user-1',
    preferences: {
      autoContinue: true,
      autoSeason: false,
      speed: 'fast',
    },
  });
});

test('multiplayer cleanup removes only Canli11 multiplayer keys and preserves auth data', () => {
  const values = new Map<string, string>([
    ['canli11:draft:league:user', 'draft'],
    ['canli11:autoContinue:league:user', 'true'],
    ['canli11:matchSpeed:league:user', 'fast'],
    ['canli11:autoSeason:league:user', 'true'],
    ['canli11:multiplayer-leagues:v1', '[]'],
    ['firebase:authUser:project', 'keep'],
    ['other-app', 'keep'],
  ]);
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
  };

  const removed = clearCanli11MultiplayerStorage(storage);
  assert.equal(removed.length, 5);
  assert.equal(values.get('firebase:authUser:project'), 'keep');
  assert.equal(values.get('other-app'), 'keep');
});

test('automatic match opening selects only the current user pending or watching progress', () => {
  const entries = [
    progress('user-2', 'pending'),
    progress('user-1', 'watching'),
  ];

  assert.equal(getCurrentUserWatchProgress(entries, 'user-1')?.userId, 'user-1');
  assert.equal(getCurrentUserWatchProgress(entries, 'user-3'), null);
  assert.equal(getCurrentUserWatchProgress([progress('user-1', 'completed')], 'user-1'), null);
});

test('auto advance waits for every user and only runs on the owner without a live match', () => {
  assert.equal(shouldAutoAdvanceInviteWeek({
    autoContinue: true,
    isOwner: true,
    currentWeekGenerated: true,
    currentWeekReadyToAdvance: false,
    hasLiveFixture: false,
  }), false);
  assert.equal(shouldAutoAdvanceInviteWeek({
    autoContinue: true,
    isOwner: false,
    currentWeekGenerated: true,
    currentWeekReadyToAdvance: true,
    hasLiveFixture: false,
  }), false);
  assert.equal(shouldAutoAdvanceInviteWeek({
    autoContinue: true,
    isOwner: true,
    currentWeekGenerated: true,
    currentWeekReadyToAdvance: true,
    hasLiveFixture: false,
  }), true);
});
