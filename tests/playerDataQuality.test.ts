import assert from 'node:assert/strict';
import test from 'node:test';
import { getSeasonServerSnapshot } from '../src/lib/seasonRepository';
import {
  calculateAgeFromDateOfBirth,
  getPlayerDataProfile,
  validatePlayerData,
} from '../src/lib/playerDataQuality';

const referenceDate = new Date('2026-06-21T00:00:00Z');

test('calculates age from date of birth', () => {
  assert.equal(calculateAgeFromDateOfBirth('1998-12-29', referenceDate), 27);
  assert.equal(calculateAgeFromDateOfBirth('2000-05-23', referenceDate), 26);
});

test('fixes Victor Osimhen age and market value from verified data', () => {
  const dataset = getSeasonServerSnapshot();
  const osimhen = dataset.players.find((player) => player.name === 'Victor Osimhen');
  assert.ok(osimhen);
  const profile = getPlayerDataProfile(osimhen, referenceDate);
  assert.equal(profile.age, 27);
  assert.ok(profile.marketValue >= 75_000_000);
  assert.ok(profile.potential >= profile.age);
});

test('validates season player data with realistic value floors', () => {
  const report = validatePlayerData(getSeasonServerSnapshot(), referenceDate);
  assert.equal(report.invalidPlayers.length, 0);
  assert.ok(report.totalPlayers > 0);
  assert.ok(report.missingDateOfBirth > 0);
  assert.ok(report.missingMarketValue > 0);

  const starChecks = new Map(report.starChecks.map((item) => [item.name, item]));
  assert.ok((starChecks.get('Victor Osimhen')?.marketValue ?? 0) >= 75_000_000);
  assert.ok((starChecks.get('Barış Alper Yılmaz')?.marketValue ?? 0) >= 30_000_000);
  assert.ok((starChecks.get('Arda Güler')?.marketValue ?? 0) >= 50_000_000);
});
