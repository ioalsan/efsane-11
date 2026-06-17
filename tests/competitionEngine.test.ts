import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateStandings,
  generateLeaguePhase,
  generateRoundRobin,
  generateWorldCupGroupStage,
  simulateCompetitionMatch,
  simulatePenaltyShootout,
} from '../src/lib/competitionEngine';
import type { CompetitionTeam } from '../src/lib/competitionEngine';

test('creates a complete 18-team double round-robin fixture', () => {
  const teamIds = Array.from({ length: 18 }, (_, index) => `team-${index + 1}`);
  const rounds = generateRoundRobin(teamIds, true);
  const fixtures = rounds.flat();
  const appearances = new Map(teamIds.map((id) => [id, 0]));

  fixtures.forEach((fixture) => {
    appearances.set(fixture.homeTeamId, (appearances.get(fixture.homeTeamId) ?? 0) + 1);
    appearances.set(fixture.awayTeamId, (appearances.get(fixture.awayTeamId) ?? 0) + 1);
  });

  assert.equal(rounds.length, 34);
  assert.equal(fixtures.length, 306);
  assert.ok([...appearances.values()].every((count) => count === 34));
});

test('creates configurable European league phases', () => {
  const teamIds = Array.from({ length: 36 }, (_, index) => `team-${index + 1}`);
  assert.equal(generateLeaguePhase(teamIds, 8).flat().length, 144);
  assert.equal(generateLeaguePhase(teamIds, 6).flat().length, 108);
});

test('creates 12 World Cup groups with three matches per team', () => {
  const groups = Array.from({ length: 12 }, (_, groupIndex) => ({
    groupId: String.fromCharCode(65 + groupIndex),
    teamIds: Array.from({ length: 4 }, (_, teamIndex) => `g${groupIndex}-t${teamIndex}`),
  }));
  const rounds = generateWorldCupGroupStage(groups);
  const fixtures = rounds.flat();
  const appearances = new Map(groups.flatMap((group) => group.teamIds.map((teamId) => [teamId, 0])));

  fixtures.forEach((fixture) => {
    appearances.set(fixture.homeTeamId, (appearances.get(fixture.homeTeamId) ?? 0) + 1);
    appearances.set(fixture.awayTeamId, (appearances.get(fixture.awayTeamId) ?? 0) + 1);
  });

  assert.equal(rounds.length, 3);
  assert.equal(fixtures.length, 72);
  assert.ok(fixtures.every((fixture) => fixture.stage === 'group' && fixture.groupId));
  assert.ok([...appearances.values()].every((count) => count === 3));
});

test('keeps league draws and awards one point', () => {
  const fixtures = generateRoundRobin(['home', 'away'], false).flat();
  fixtures[0].result = {
    normalTime: { home: 1, away: 1 },
    winnerId: null,
    incidents: [],
    stats: { possessionHome: 50, shotsHome: 5, shotsAway: 5, xgHome: 1, xgAway: 1 },
  };
  const table = calculateStandings(['home', 'away'], fixtures);
  assert.deepEqual(table.map((row) => row.points), [1, 1]);
});

test('penalty shootouts always produce a winner', () => {
  const attributes = {
    attack: 80,
    defense: 80,
    passing: 80,
    pace: 80,
    shooting: 80,
    dribbling: 80,
    goalkeeping: 80,
  };
  const createTeam = (id: string): CompetitionTeam => ({
    id,
    name: id,
    rating: 80,
    players: [{ id: `${id}-1`, name: id, rating: 80, form: 0, attributes }],
  });
  const originalRandom = Math.random;
  const sequence = [0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9];
  let cursor = 0;
  Math.random = () => sequence[cursor++ % sequence.length];
  try {
    const result = simulatePenaltyShootout(createTeam('home'), createTeam('away'), true);
    assert.notEqual(result.home, result.away);
  } finally {
    Math.random = originalRandom;
  }
});

test('knockout simulation exposes timed events and individual penalties', () => {
  const attributes = {
    attack: 80,
    defense: 80,
    passing: 80,
    pace: 80,
    shooting: 80,
    dribbling: 80,
    goalkeeping: 80,
  };
  const createTeam = (id: string): CompetitionTeam => ({
    id,
    name: id,
    rating: 80,
    players: Array.from({ length: 11 }, (_, index) => ({
      id: `${id}-${index}`,
      name: `${id} Player ${index + 1}`,
      rating: 80,
      form: 0,
      attributes,
    })),
  });
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const result = simulateCompetitionMatch(
      createTeam('home'),
      createTeam('away'),
      true,
      {
        adsEnabled: false,
        chanceFactor: 1,
        penaltiesEnabled: true,
        injuryChance: 0,
        simulateOtherMatches: true,
      },
    );
    assert.ok(result.incidents.every((incident) => incident.minute >= 1 && incident.minute <= 120));
    assert.ok(!result.incidents.some((incident) => (incident as { type: string }).type === 'substitution'));
    if (result.penalties) {
      assert.ok(result.penaltyKicks && result.penaltyKicks.length >= 10);
      assert.notEqual(result.penalties.home, result.penalties.away);
    }
  } finally {
    Math.random = originalRandom;
  }
});
