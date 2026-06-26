import assert from 'node:assert/strict';
import test from 'node:test';
import {
  toFirestoreFixtureDocs,
  toFirestoreLeagueDoc,
} from '../src/lib/multiplayerFirestoreService';
import {
  buildMultiplayerTeamInput,
  createLeague,
  saveTeamToLeague,
  startLeague,
} from '../src/lib/multiplayerService';
import {
  DEFAULT_COMPETITION_ID,
  getCompetitionTeams,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from '../src/lib/seasonRepository';

const installLocalStorage = () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  });
};

const hasDirectNestedArray = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => Array.isArray(item) || hasDirectNestedArray(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasDirectNestedArray);
  }
  return false;
};

const createStartedInviteLeague = (teamCount: number) => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18);
  assert.ok(sourceTeams.length >= teamCount);

  let league = createLeague({
    name: `Firestore ${teamCount}`,
    ownerId: 'owner-1',
    maxUsers: teamCount,
    powerLimit: 'free',
  });

  Array.from({ length: teamCount }, (_, index) => {
    const players = getTeamPlayers(sourceTeams[index].id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `user-${index + 1}`,
      teamName: `Firestore ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });

  return startLeague(league.id, 'owner-1', dataset);
};

test('Firestore league serializer does not write nested fixture arrays for 2-team seasons', () => {
  const league = createStartedInviteLeague(2);
  const leagueDoc = toFirestoreLeagueDoc(league, ['owner-1']);
  const fixtureDocs = toFirestoreFixtureDocs(league.fixtures, league.updatedAt);

  assert.equal('fixtures' in leagueDoc, false);
  assert.equal(fixtureDocs.length, league.fixtures.flat().length);
  assert.equal(hasDirectNestedArray(leagueDoc), false);
  assert.equal(hasDirectNestedArray(fixtureDocs), false);
});

test('Firestore league serializer does not write nested fixture arrays for 18-team seasons', () => {
  const league = createStartedInviteLeague(18);
  const leagueDoc = toFirestoreLeagueDoc(league, ['owner-1']);
  const fixtureDocs = toFirestoreFixtureDocs(league.fixtures, league.updatedAt);

  assert.equal('fixtures' in leagueDoc, false);
  assert.equal(fixtureDocs.length, 306);
  assert.equal(hasDirectNestedArray(leagueDoc), false);
  assert.equal(hasDirectNestedArray(fixtureDocs), false);
});
