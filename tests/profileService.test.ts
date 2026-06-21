import assert from 'node:assert/strict';
import test from 'node:test';
import type { CareerHistoryEntry, CareerSave } from '../src/lib/careerMode';
import { createProfile, getUnlockedAchievementIds, updateProfileFromCareerSeason } from '../src/lib/profileService';

const summary: CareerHistoryEntry = {
  season: 1,
  teamName: 'Reis FK',
  leaguePosition: 1,
  points: 78,
  wins: 24,
  draws: 6,
  losses: 0,
  goalsFor: 101,
  goalsAgainst: 28,
  trophies: ['Lig Şampiyonluğu'],
  bestPlayerName: 'Victor Osimhen',
  topScorerName: 'Victor Osimhen',
  topScorerGoals: 29,
  careerPointsGained: 310,
  boardGrade: 'A',
  fanGrade: 'A',
  note: 'Hedef tamamlandı',
};

const save = {
  managerName: 'Reis',
  careerPoints: 1800,
  club: {
    prestige: 90,
  },
  europeStatus: 'won',
} as CareerSave;

test('updates profile stats and unlocks career achievements', () => {
  const profile = createProfile('user-1', 'Reis');
  const updated = updateProfileFromCareerSeason(profile, save, summary);
  const unlocked = getUnlockedAchievementIds(updated);

  assert.equal(updated.seasonsPlayed, 1);
  assert.equal(updated.trophiesWon, 1);
  assert.equal(updated.bestLeaguePosition, 1);
  assert.equal(updated.totalWins, 24);
  assert.equal(updated.totalGoals, 101);
  assert.ok(unlocked.has('first-season'));
  assert.ok(unlocked.has('first-title'));
  assert.ok(unlocked.has('unbeaten-season'));
  assert.ok(unlocked.has('hundred-goals'));
  assert.ok(unlocked.has('legend-manager'));
});
