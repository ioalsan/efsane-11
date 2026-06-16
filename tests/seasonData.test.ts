import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SeasonDataset } from '../src/types';
import { generateLeaguePhase } from '../src/lib/competitionEngine';
import { getCompetitionSquads } from '../src/lib/seasonRepository';

const dataset = JSON.parse(
  readFileSync(new URL('../src/data/season-2025-26.json', import.meta.url), 'utf8'),
) as SeasonDataset;

test('ships the complete 2025-2026 competition structure', () => {
  const superLig = dataset.competitions.find((competition) => competition.competitionId === 'super-lig');
  const championsLeague = dataset.competitions.find((competition) => competition.competitionId === 'champions-league');
  const europaLeague = dataset.competitions.find((competition) => competition.competitionId === 'europa-league');
  const conferenceLeague = dataset.competitions.find((competition) => competition.competitionId === 'conference-league');
  const worldCup = dataset.competitions.find((competition) => competition.competitionId === 'world-cup-2026');
  assert.equal(dataset.schemaVersion, 4);
  assert.equal(dataset.season, '2025-2026');
  assert.equal(superLig?.teams.length, 18);
  assert.equal(superLig?.leagueMatchCount, 34);
  assert.equal(superLig?.format, 'league');
  assert.equal(championsLeague?.teams.length, 36);
  assert.equal(championsLeague?.leaguePhaseMatchCount, 8);
  assert.equal(europaLeague?.teams.length, 36);
  assert.equal(europaLeague?.leaguePhaseMatchCount, 8);
  assert.equal(conferenceLeague?.teams.length, 36);
  assert.equal(conferenceLeague?.leaguePhaseMatchCount, 6);
  assert.equal(worldCup?.format, 'world_cup_48');
  assert.equal(worldCup?.teams.length, 48);
  assert.equal(worldCup?.groups.length, 12);
  assert.ok(worldCup?.groups.every((group) => group.teamIds.length === 4));
  assert.deepEqual(worldCup?.knockoutRounds, [
    'round-of-32',
    'round-of-16',
    'quarter-final',
    'semi-final',
    'final',
  ]);
});

test('keeps Unicode team and player names intact', () => {
  const teamNames = new Set(dataset.teams.map((team) => team.name));
  for (const name of ['Bodø/Glimt', 'Crvena zvezda', 'København', 'Šahtar Donetsk']) {
    assert.ok(teamNames.has(name), `${name} eksik`);
  }
  assert.equal('Vitória SC'.normalize('NFC'), 'Vitória SC');
  assert.ok(dataset.players.some((player) => player.name === 'Barış Alper Yılmaz'));
  assert.ok(dataset.players.some((player) => /[ÇĞİÖŞÜçğıöşü]/u.test(player.name)));
});

test('stores complete player profiles without mock records', () => {
  const playerIds = new Set<string>();
  const teamNumbers = new Set<string>();
  const teamNames = new Map(dataset.teams.map((team) => [team.id, team.name]));
  const syntheticSuffixes = /^(kaleci|sağ bek|sag bek|sol bek|stoper|defans|orta saha|sağ kanat|sag kanat|sol kanat|forvet|gk|cb|lb|rb|dm|cm|am|lw|rw|st)$/iu;
  assert.ok(dataset.players.length > 3000);
  for (const player of dataset.players) {
    assert.ok(!playerIds.has(player.id), `Tekrarlanan oyuncu: ${player.id}`);
    playerIds.add(player.id);
    const numberKey = `${player.teamId}:${player.number}`;
    assert.ok(!teamNumbers.has(numberKey), `Tekrarlanan forma numarası: ${numberKey}`);
    teamNumbers.add(numberKey);
    assert.ok(player.name);
    assert.ok(player.playerType === 'club' || player.playerType === 'nationalTeam');
    assert.ok(player.number >= 1);
    assert.ok(player.primaryPosition);
    assert.ok(Array.isArray(player.secondaryPositions));
    assert.ok(player.rating >= 1 && player.rating <= 99);
    assert.ok(Number.isFinite(player.form));
    assert.ok(player.nationality);
    assert.deepEqual(
      Object.keys(player.attributes).sort(),
      ['attack', 'defense', 'dribbling', 'goalkeeping', 'pace', 'passing', 'shooting'],
    );
    const teamName = teamNames.get(player.teamId);
    if (teamName && player.name.toLocaleLowerCase('tr-TR').startsWith(`${teamName.toLocaleLowerCase('tr-TR')} `)) {
      const suffix = player.name.slice(teamName.length).trim();
      assert.ok(!syntheticSuffixes.test(suffix), `Takım + mevki oyuncu adı bulundu: ${player.name}`);
    }
  }
});

test('keeps club and national-team player pools separate', () => {
  const worldCup = dataset.competitions.find((competition) => competition.competitionId === 'world-cup-2026');
  assert.ok(worldCup);
  const worldTeamIds = new Set(worldCup.teams);
  const nationalPlayers = dataset.players.filter((player) => worldTeamIds.has(player.teamId));
  assert.ok(nationalPlayers.length >= 48 * 26);
  assert.ok(nationalPlayers.every((player) => player.playerType === 'nationalTeam' && player.id.startsWith('nt-')));
  assert.ok(dataset.teams.filter((team) => worldTeamIds.has(team.id)).every((team) => team.teamType === 'nationalTeam'));
  assert.ok(dataset.players.filter((player) => !worldTeamIds.has(player.teamId)).every((player) => player.playerType === 'club'));
});

test('keeps Galatasaray in every Champions League data path', () => {
  const galatasaray = dataset.teams.find((team) => team.id === 'galatasaray');
  const championsLeague = dataset.competitions.find((competition) => competition.competitionId === 'champions-league');
  assert.ok(galatasaray);
  assert.ok(championsLeague);
  assert.ok(galatasaray.competitionIds.includes('champions-league'));
  assert.ok(championsLeague.teams.includes(galatasaray.id));
  assert.ok(galatasaray.players.every((playerId) => championsLeague.players.includes(playerId)));
  assert.ok(getCompetitionSquads('champions-league', dataset).some((squad) => squad.teamName === 'Galatasaray'));
  const fixtures = generateLeaguePhase(championsLeague.teams, championsLeague.leaguePhaseMatchCount).flat();
  assert.ok(fixtures.some((fixture) => (
    fixture.homeTeamId === galatasaray.id || fixture.awayTeamId === galatasaray.id
  )));
});

test('uses real Bodø/Glimt player names', () => {
  const team = dataset.teams.find((item) => item.name === 'Bodø/Glimt');
  assert.ok(team);
  const names = new Set(dataset.players.filter((player) => player.teamId === team.id).map((player) => player.name));
  for (const name of ['Nikita Haikin', 'Fredrik Bjørkan', 'Patrick Berg', 'Kasper Høgh']) {
    assert.ok(names.has(name), `${name} eksik`);
  }
});
