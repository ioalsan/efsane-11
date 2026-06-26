import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiplayerTeamInput,
  consumeMultiplayerMigrationNotice,
  createLeague,
  createLocalFriendLeague,
  getRealTeamReplacementPlan,
  listLeagues,
  savePlayerSlotToLeague,
  saveTeamToLeague,
  simulateWeek,
  startLeague,
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
  const sessionStorage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => sessionStorage.get(key) ?? null,
        setItem: (key: string, value: string) => sessionStorage.set(key, value),
        removeItem: (key: string) => sessionStorage.delete(key),
      },
    },
  });
};

test('cleans corrupt multiplayer roster saves with empty first eleven and filled bench', () => {
  installLocalStorage();
  const storageKey = 'canli11:multiplayer-leagues:v1';
  const league = createLocalFriendLeague({
    name: 'Bozuk Kadro Ligi',
    ownerId: 'owner-1',
    friendCount: 2,
    powerLimit: 'free',
  });
  const slot = league.playerSlots[0];
  const benchIds = Array.from({ length: 7 }, (_, index) => `bench-player-${index + 1}`);
  const corruptedLeague = {
    ...league,
    playerSlots: league.playerSlots.map((item) => (
      item.id === slot.id
        ? {
          ...item,
          teamName: 'Broken FC',
          selectedSquad: {
            startingXI: [],
            substitutes: benchIds,
            reserves: [],
          },
          formation: '4-2-3-1' as const,
          tactic: 'Balanced' as const,
          captainId: benchIds[0],
          ready: true,
          teamId: 'broken-team',
          rating: 77,
          chemistry: 60,
        }
        : item
    )),
    teams: [{
      id: 'broken-team',
      ownerId: slot.id,
      teamName: 'Broken FC',
      formation: '4-2-3-1' as const,
      tactic: 'Balanced' as const,
      captainId: benchIds[0],
      startingXI: [],
      substitutes: benchIds,
      reserves: [],
      rating: 77,
      chemistry: 60,
      isBot: false,
      createdAt: league.createdAt,
      updatedAt: league.updatedAt,
    }],
  };

  window.localStorage.setItem(storageKey, JSON.stringify([corruptedLeague]));

  const cleanedLeague = listLeagues()[0];
  const cleanedSlot = cleanedLeague.playerSlots[0];

  assert.equal(cleanedLeague.teams.length, 0);
  assert.equal(cleanedSlot.ready, false);
  assert.equal(cleanedSlot.selectedSquad, null);
  assert.equal(cleanedSlot.teamId, null);
  assert.equal(cleanedSlot.rating, 0);
  assert.equal(consumeMultiplayerMigrationNotice(), true);
  assert.equal(consumeMultiplayerMigrationNotice(), false);
});

test('invite league user team count fills the season to 18 teams', () => {
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18);
  assert.ok(sourceTeams.length >= 18);

  [2, 3, 5, 18].forEach((teamCount) => {
    installLocalStorage();
    const league = createLeague({
      name: `Davetli ${teamCount}`,
      ownerId: 'owner-1',
      maxUsers: teamCount,
      powerLimit: 'free',
    });

    let nextLeague = league;
    Array.from({ length: teamCount }, (_, index) => {
      const sourceTeam = sourceTeams[index];
      const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
      const input = buildMultiplayerTeamInput({
        ownerId: `user-${index + 1}`,
        teamName: `Davetli ${index + 1}`,
        formation: '4-2-3-1',
        tactic: 'Balanced',
        captainId: players[0].id,
        startingPlayers: players.slice(0, 11),
        substitutes: players.slice(11, 18),
        reserves: [],
      });
      nextLeague = saveTeamToLeague(nextLeague.id, input);
    });

    const started = startLeague(nextLeague.id, 'owner-1', dataset);
    const replacementPlan = getRealTeamReplacementPlan(teamCount, dataset);

    assert.equal(started.teams.length, teamCount);
    assert.equal(started.botTeams.length, 18 - teamCount);
    assert.equal(started.realTeams.length, 18 - teamCount);
    assert.equal(started.teams.length + started.botTeams.length, 18);
    assert.equal(started.fixtures.length, 34);
    assert.equal(started.fixtures.flat().length, 306);
    assert.deepEqual(
      started.replacedTeams.map((team) => team.sourceTeamId),
      replacementPlan.replacedTeams.map((team) => team.sourceTeamId),
    );
  });
});

test('invite league waits for the selected user team count before starting', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeam = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .find((team) => getTeamPlayers(team.id, dataset).length >= 18);
  assert.ok(sourceTeam);

  const league = createLeague({
    name: 'Iki Kullanici Bekleme',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });
  const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
  const input = buildMultiplayerTeamInput({
    ownerId: 'user-1',
    teamName: 'Tek Takim',
    formation: '4-2-3-1',
    tactic: 'Balanced',
    captainId: players[0].id,
    startingPlayers: players.slice(0, 11),
    substitutes: players.slice(11, 18),
    reserves: [],
  });
  const saved = saveTeamToLeague(league.id, input);

  assert.throws(() => startLeague(saved.id, 'owner-1', dataset), /2 kullanici takimi gerekli/);
});

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

test('local friend league uses the selected competition pool for real teams', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const competitionId = 'world-cup-2026';
  const competitionTeamIds = new Set(getCompetitionTeams(competitionId, dataset).map((team) => team.id));
  const sourceTeams = getCompetitionTeams(competitionId, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 23)
    .slice(0, 2);

  const league = createLocalFriendLeague({
    name: 'Dunya Kupasi Arkadas',
    ownerId: 'owner-1',
    friendCount: 2,
    powerLimit: 'free',
    competitionId,
  });

  let nextLeague = league;
  league.playerSlots.forEach((slot, index) => {
    const players = getTeamPlayers(sourceTeams[index].id, dataset).map(toLegacyPlayer);
    const input = buildMultiplayerTeamInput({
      ownerId: slot.id,
      teamName: `${slot.displayName} WC`,
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
  const replacementPlan = getRealTeamReplacementPlan(2, dataset, competitionId);

  assert.equal(started.competitionId, competitionId);
  assert.deepEqual(
    started.replacedTeams.map((team) => team.sourceTeamId),
    replacementPlan.replacedTeams.map((team) => team.sourceTeamId),
  );
  assert.ok(started.realTeams.every((team) => competitionTeamIds.has(team.sourceTeamId)));
  assert.ok(started.replacedTeams.every((team) => competitionTeamIds.has(team.sourceTeamId)));
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
