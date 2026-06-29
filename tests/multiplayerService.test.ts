import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiplayerTeamInput,
  autoCompleteCurrentWeekProgress,
  consumeMultiplayerMigrationNotice,
  createLeague,
  createLocalFriendLeague,
  getInviteLeagueStartReadiness,
  getRealTeamChemistry,
  getRealTeamReplacementPlan,
  isCurrentWeekReadyToAdvance,
  listLeagues,
  repairCurrentWeekProgress,
  savePlayerSlotToLeague,
  saveTeamToLeague,
  simulateWeek,
  startLeague,
  startLocalFriendLeague,
  softDeleteLeague,
  updateWeekUserProgress,
} from '../src/lib/multiplayerService';
import {
  DEFAULT_COMPETITION_ID,
  getCompetitionTeams,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from '../src/lib/seasonRepository';
import { filterMultiplayerLeagues } from '../src/lib/multiplayerLeagueList';

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

test('invite league start readiness uses user teams separately from real teams', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
    .slice(0, 2);
  assert.equal(sourceTeams.length, 2);

  let league = createLeague({
    name: 'Start Debug Ligi',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });

  const missingReadiness = getInviteLeagueStartReadiness(league, 'owner-1');
  assert.equal(missingReadiness.ready, false);
  assert.equal(missingReadiness.userTeamsCount, 0);

  sourceTeams.forEach((sourceTeam, index) => {
    const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `user-${index + 1}`,
      teamName: `Ready ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });

  const ownerReadiness = getInviteLeagueStartReadiness(league, 'owner-1');
  assert.equal(ownerReadiness.ready, true);
  assert.equal(ownerReadiness.userTeamsCount, 2);
  assert.equal(ownerReadiness.totalTeamsCount, 18);

  const nonOwnerReadiness = getInviteLeagueStartReadiness(league, 'user-1');
  assert.equal(nonOwnerReadiness.ready, false);
  assert.match(nonOwnerReadiness.missingReason ?? '', /lig sahibi/);
});

test('invite league can start from a waiting state that already has real teams hydrated', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const storageKey = 'canli11:multiplayer-leagues:v1';
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
    .slice(0, 2);
  assert.equal(sourceTeams.length, 2);

  let league = createLeague({
    name: 'Stale Bot Start',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });

  sourceTeams.forEach((sourceTeam, index) => {
    const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `user-${index + 1}`,
      teamName: `Stale ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });

  const started = startLeague(league.id, 'owner-1', dataset);
  const staleWaitingLeague = {
    ...started,
    status: 'waiting' as const,
    fixtures: [],
    standings: [],
    matchReports: [],
    weekProgress: [],
  };
  window.localStorage.setItem(storageKey, JSON.stringify([staleWaitingLeague]));

  const restored = listLeagues()[0];
  const readiness = getInviteLeagueStartReadiness(restored, 'owner-1');
  assert.equal(readiness.ready, true);
  assert.equal(readiness.userTeamsCount, 2);
  assert.equal(readiness.totalTeamsCount, 18);

  const restarted = startLeague(restored.id, 'owner-1', dataset);
  assert.equal(restarted.teams.length, 2);
  assert.equal(restarted.botTeams.length, 16);
  assert.equal(restarted.fixtures.length, 34);
  assert.equal(restarted.fixtures.flat().length, 306);
});

test('invite league start normalizes legacy lobby and ready statuses but rejects completed', () => {
  const dataset = getSeasonDataset();
  const storageKey = 'canli11:multiplayer-leagues:v1';

  (['lobby', 'ready'] as const).forEach((legacyStatus) => {
    installLocalStorage();
    const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
      .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
      .slice(0, 2);
    let league = createLeague({
      name: `Legacy ${legacyStatus}`,
      ownerId: 'owner-1',
      maxUsers: 2,
      powerLimit: 'free',
    });

    sourceTeams.forEach((sourceTeam, index) => {
      const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
      league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
        ownerId: `legacy-user-${index + 1}`,
        teamName: `Legacy ${index + 1}`,
        formation: '4-2-3-1',
        tactic: 'Balanced',
        captainId: players[0].id,
        startingPlayers: players.slice(0, 11),
        substitutes: players.slice(11, 18),
        reserves: [],
      }));
    });

    window.localStorage.setItem(storageKey, JSON.stringify([{ ...league, status: legacyStatus }]));
    const restored = listLeagues()[0];
    assert.equal(restored.status, 'waiting');
    const started = startLeague(restored.id, 'owner-1', dataset);
    assert.equal(started.status, 'active');
    assert.equal(started.fixtures.flat().length, 306);
  });

  installLocalStorage();
  const completed = createLeague({
    name: 'Completed Reject',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });
  window.localStorage.setItem(storageKey, JSON.stringify([{ ...completed, status: 'completed' }]));
  assert.throws(() => startLeague(completed.id, 'owner-1', dataset), /zaten baslatildi/);
});

test('invite league waits for every user match progress before advancing the week', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
    .slice(0, 2);
  assert.equal(sourceTeams.length, 2);

  let league = createLeague({
    name: 'Progress Ligi',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });

  sourceTeams.forEach((sourceTeam, index) => {
    const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `user-${index + 1}`,
      teamName: `Progress ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });

  const started = startLeague(league.id, 'owner-1', dataset);
  const generated = simulateWeek(started.id, dataset).league;

  assert.equal(generated.currentWeek, 0);
  assert.equal(generated.weekProgress.length, 2);
  assert.ok(generated.fixtures[0].every((fixture) => fixture.result));
  assert.equal(generated.standings.every((row) => row.played === 0), true);

  updateWeekUserProgress(generated.id, 'user-1', 'skipped');
  assert.throws(() => simulateWeek(generated.id, dataset), /kullanici maclari tamamlanmadi/);

  updateWeekUserProgress(generated.id, 'user-2', 'completed');
  const advanced = simulateWeek(generated.id, dataset).league;

  assert.equal(advanced.currentWeek, 1);
  assert.equal(advanced.matchReports.length, generated.fixtures[0].length);
  assert.equal(advanced.standings.some((row) => row.played > 0), true);
});

test('invite league completes all 34 weeks without getting stuck at week 19', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
    .slice(0, 2);
  assert.equal(sourceTeams.length, 2);

  let league = createLeague({
    name: 'Otuz Dort Hafta Ligi',
    ownerId: 'owner-1',
    maxUsers: 2,
    powerLimit: 'free',
  });

  sourceTeams.forEach((sourceTeam, index) => {
    const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `user-${index + 1}`,
      teamName: `Akis ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });

  league = startLeague(league.id, 'owner-1', dataset);

  for (let week = 0; week < 34; week += 1) {
    league = simulateWeek(league.id, dataset).league;
    assert.equal(league.currentWeek, week);
    const progress = league.weekProgress.filter((item) => item.week === week + 1);
    assert.equal(progress.length, 2);
    assert.equal(progress.every((item) => item.status === 'pending'), true);

    if (week === 18) {
      const storageKey = 'canli11:multiplayer-leagues:v1';
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as typeof league[];
      window.localStorage.setItem(storageKey, JSON.stringify(stored.map((item) => ({
        ...item,
        weekProgress: item.weekProgress.map((entry) => entry.week === 1 ? { ...entry, status: 'pending' } : entry),
      }))));
    }

    updateWeekUserProgress(league.id, 'user-1', 'completed');
    assert.throws(
      () => updateWeekUserProgress(league.id, 'user-2', 'autoCompleted'),
      /sadece lig sahibi/,
    );
    league = autoCompleteCurrentWeekProgress(league.id, 'owner-1');
    assert.equal(
      league.weekProgress.find((item) => item.week === week + 1 && item.userId === 'user-2')?.status,
      'autoCompleted',
    );
    league = simulateWeek(league.id, dataset).league;
    assert.equal(league.currentWeek, week + 1);
  }

  assert.equal(league.status, 'completed');
  assert.equal(league.currentWeek, 34);
  assert.equal(league.matchReports.length, 306);
  assert.equal(new Set(league.matchReports.map((report) => report.fixtureId)).size, 306);
  assert.equal(league.standings.every((row) => Number.isFinite(row.points) && row.played === 34), true);
});

test('repairs missing current-week progress and ignores older pending progress', () => {
  installLocalStorage();
  const dataset = getSeasonDataset();
  const sourceTeams = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .filter((team) => getTeamPlayers(team.id, dataset).length >= 18)
    .slice(0, 2);
  let league = createLeague({ name: 'Repair Ligi', ownerId: 'owner-1', maxUsers: 2, powerLimit: 'free' });
  sourceTeams.forEach((sourceTeam, index) => {
    const players = getTeamPlayers(sourceTeam.id, dataset).map(toLegacyPlayer);
    league = saveTeamToLeague(league.id, buildMultiplayerTeamInput({
      ownerId: `repair-user-${index + 1}`,
      teamName: `Repair ${index + 1}`,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0].id,
      startingPlayers: players.slice(0, 11),
      substitutes: players.slice(11, 18),
      reserves: [],
    }));
  });
  league = startLeague(league.id, 'owner-1', dataset);
  league = simulateWeek(league.id, dataset).league;
  const storageKey = 'canli11:multiplayer-leagues:v1';
  const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as typeof league[];
  window.localStorage.setItem(storageKey, JSON.stringify(stored.map((item) => (
    item.id === league.id ? { ...item, weekProgress: item.weekProgress.slice(0, 1) } : item
  ))));

  assert.equal(isCurrentWeekReadyToAdvance(listLeagues()[0]), false);
  league = repairCurrentWeekProgress(league.id, 'owner-1');
  assert.equal(league.weekProgress.filter((entry) => entry.week === 1).length, 2);
});

test('only the owner can soft delete a local league and deleted leagues stay hidden', () => {
  installLocalStorage();
  const league = createLeague({ name: 'Silinecek Lig', ownerId: 'owner-1', maxUsers: 2, powerLimit: 'free' });
  assert.throws(() => softDeleteLeague(league.id, 'other-user'), /sadece sahibi/);
  softDeleteLeague(league.id, 'owner-1');
  assert.equal(listLeagues().some((item) => item.id === league.id), false);
});

test('league filters keep open leagues first and exclude deleted records', () => {
  installLocalStorage();
  const base = createLeague({ name: 'Base', ownerId: 'owner-1', maxUsers: 2, powerLimit: 'free' });
  const waiting = { ...base, id: 'waiting', status: 'waiting' as const, updatedAt: '2026-01-01T00:00:00.000Z' };
  const active = { ...base, id: 'active', status: 'active' as const, updatedAt: '2026-01-02T00:00:00.000Z' };
  const completed = { ...base, id: 'completed', ownerId: 'owner-2', status: 'completed' as const };
  const deleted = { ...base, id: 'deleted', status: 'deleted' as const, deletedAt: '2026-01-03T00:00:00.000Z' };

  assert.deepEqual(filterMultiplayerLeagues([waiting, completed, deleted, active], 'open').map((item) => item.id), ['active', 'waiting']);
  assert.deepEqual(filterMultiplayerLeagues([waiting, completed, deleted, active], 'completed').map((item) => item.id), ['completed']);
  assert.deepEqual(filterMultiplayerLeagues([waiting, completed, deleted, active], 'mine', 'owner-1').map((item) => item.id), ['active', 'waiting']);
});

test('real team chemistry varies by rating while staying in a safe range', () => {
  const values = [
    getRealTeamChemistry(68, 'weak-team'),
    getRealTeamChemistry(76, 'medium-team'),
    getRealTeamChemistry(84, 'strong-team'),
  ];
  assert.equal(values.every((value) => value >= 68 && value <= 88), true);
  assert.equal(new Set(values).size > 1, true);
  assert.equal(values[2] > values[0], true);
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
