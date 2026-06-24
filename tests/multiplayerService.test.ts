import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiplayerTeamInput,
  createLocalFriendLeague,
  getRealTeamReplacementPlan,
  savePlayerSlotToLeague,
  simulateWeek,
  startLocalFriendLeague,
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
    },
  });
};

test('local friend league replaces the weakest real teams and creates a full 18-team season', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 23)
    .slice(0, 3);

  const league = createLocalFriendLeague({
    name: 'Arkadas Smoke Ligi',
    ownerId: 'owner-1',
    friendCount: 3,
    powerLimit: 'free',
  });

  let nextLeague = league;
  league.playerSlots.forEach((slot, index) => {
    const players = getTeamPlayers(sourceTeams[index].id, dataset).map(toLegacyPlayer);
    const input = buildMultiplayerTeamInput({
      ownerId: slot.id,
      teamName: `${slot.displayName} FC`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: players.slice(18, 23),
    });
    nextLeague = savePlayerSlotToLeague(nextLeague.id, slot.id, {
      ...input,
      displayName: slot.displayName,
      reserves: input.reserves ?? [],
    });
  });

  const started = startLocalFriendLeague(nextLeague.id, 'owner-1', dataset);
  const replacementPlan = getRealTeamReplacementPlan(3, dataset);

  assert.equal(started.teams.length, 3);
  assert.equal(started.botTeams.length, 15);
  assert.equal(started.realTeams.length, 15);
  assert.equal(started.replacedTeams.length, 3);
  assert.deepEqual(
    started.replacedTeams.map((team) => team.sourceTeamId),
    replacementPlan.replacedTeams.map((team) => team.sourceTeamId),
  );
  assert.equal(started.fixtures.length, 34);
  assert.equal(started.fixtures.flat().length, 306);

  const week = simulateWeek(started.id, dataset);
  const humanIds = new Set(week.league.teams.map((team) => team.id));
  const userFixtures = week.playedRound.filter((fixture) => (
    humanIds.has(fixture.homeTeamId) || humanIds.has(fixture.awayTeamId)
  ));

  assert.equal(week.league.currentWeek, 1);
  assert.equal(week.league.standings.length, 18);
  assert.ok(userFixtures.length >= 2);
  assert.ok(userFixtures.every((fixture) => fixture.result));
});

test('local friend league requires a team name before saving a player slot', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeam = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .find((team) => getTeamPlayers(team.id, dataset).length >= 23);
  assert.ok(sourceTeam);

  const league = createLocalFriendLeague({
    name: 'Takim Adi Kontrol',
    ownerId: 'owner-1',
    friendCount: 2,
    powerLimit: 'free',
  });
  const slot = league.playerSlots[0];
  const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
  const input = buildMultiplayerTeamInput({
    ownerId: slot.id,
    teamName: '',
    formation: '4-2-3-1',
    tactic: 'Balanced',
    captainId: players[0].id,
    startingPlayers: players.slice(0, 11),
    substitutes: players.slice(11, 18),
    reserves: players.slice(18, 23),
  });

  assert.throws(() => savePlayerSlotToLeague(league.id, slot.id, {
    ...input,
    displayName: slot.displayName,
    reserves: input.reserves ?? [],
  }), /Takim adi zorunlu/);
});
