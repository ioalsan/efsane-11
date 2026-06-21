import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCareerMarketValue,
  createCareerPlayerState,
  createClubProfile,
  createInitialCareerSave,
  developCareerPlayers,
  getManagerLevel,
} from '../src/lib/careerMode';
import type { CompetitionFixture } from '../src/lib/competitionEngine';
import type { Player, SeasonTeam } from '../src/types';

const attributes = {
  attack: 78,
  defense: 72,
  passing: 80,
  pace: 77,
  shooting: 76,
  dribbling: 79,
  goalkeeping: 20,
};

const player: Player = {
  id: 'career-player-1',
  name: 'Test Oyuncu',
  era: '2025-26',
  position: 'MO',
  overall_rating: 78,
  image_url: '',
  jersey_number: 8,
  teamId: 'team-1',
  form: 2,
  nationality: 'Türkiye',
  isActive: true,
  primaryPosition: 'CM',
  secondaryPositions: ['AM'],
  attributes,
};

const team: SeasonTeam = {
  id: 'team-1',
  name: 'Test SK',
  teamType: 'club',
  country: 'Türkiye',
  league: 'Süper Lig',
  competitionIds: ['super-lig'],
  strengthBonus: 2,
  players: ['career-player-1'],
};

const fixtures: CompetitionFixture[][] = [[{
  id: 'career-1',
  stage: 'league',
  roundNumber: 1,
  homeTeamId: 'team-1',
  awayTeamId: 'team-2',
}]];

test('creates career player state with age, potential and value', () => {
  const state = createCareerPlayerState(player);
  assert.equal(state.name, 'Test Oyuncu');
  assert.ok(state.age >= 16 && state.age <= 36);
  assert.ok(state.potential >= state.rating);
  assert.ok(state.marketValue > 0);
});

test('maps career points to manager levels', () => {
  assert.equal(getManagerLevel(0), 'Acemi Teknik Direktör');
  assert.equal(getManagerLevel(200), 'Bölgesel Teknik Direktör');
  assert.equal(getManagerLevel(500), 'Profesyonel Teknik Direktör');
  assert.equal(getManagerLevel(1000), 'Elit Teknik Direktör');
  assert.equal(getManagerLevel(1700), 'Efsane Teknik Direktör');
});

test('creates a persistent career save with separate club profile', () => {
  const club = createClubProfile(team, 'super-lig', 78);
  const save = createInitialCareerSave({
    managerName: 'Deneme',
    club,
    teamIds: ['team-1', 'team-2'],
    roster: [createCareerPlayerState(player)],
    fixtures,
  });

  assert.equal(save.version, 1);
  assert.equal(save.club.teamName, 'Test SK');
  assert.equal(save.season, 1);
  assert.ok(save.youthAcademy.length >= 2);
});

test('career market value rewards potential', () => {
  const base = calculateCareerMarketValue(75, 29, 78, 0);
  const prospect = calculateCareerMarketValue(75, 19, 92, 0);
  assert.ok(prospect > base);
});

test('season development preserves player identity', () => {
  const state = createCareerPlayerState(player);
  const [developed] = developCareerPlayers([state], {
    training: 3,
    youth: 3,
    medical: 2,
    scouting: 1,
  });
  assert.equal(developed.playerId, state.playerId);
  assert.equal(developed.age, state.age + 1);
});
