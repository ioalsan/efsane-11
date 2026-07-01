import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMatchSummary,
  buildMatchTimeline,
} from '../src/lib/matchPresentation';
import type { CompetitionFixture, MatchResult } from '../src/lib/competitionEngine';

const fixture: CompetitionFixture = {
  id: 'match-1',
  stage: 'league',
  roundNumber: 1,
  homeTeamId: 'home-team',
  awayTeamId: 'away-team',
};

const result: MatchResult = {
  normalTime: { home: 2, away: 1 },
  winnerId: 'home-team',
  incidents: [
    { minute: 12, teamId: 'home-team', playerName: 'Leandro Trossard', type: 'goal' },
    { minute: 24, teamId: 'away-team', playerName: 'Mauro Icardi', type: 'yellow-card' },
    { minute: 55, teamId: 'away-team', playerName: 'Nicolo Zaniolo', type: 'goal' },
    { minute: 77, teamId: 'home-team', playerName: 'Bukayo Saka', type: 'goal' },
  ],
  stats: {
    possessionHome: 57,
    shotsHome: 14,
    shotsAway: 9,
    shotsOnTargetHome: 7,
    shotsOnTargetAway: 4,
    passesHome: 512,
    passesAway: 441,
    foulsHome: 8,
    foulsAway: 11,
    xgHome: 2.1,
    xgAway: 1.2,
  },
};

test('builds a readable match timeline with kickoff, goals and fulltime', () => {
  const timeline = buildMatchTimeline(fixture, result, 'Arsenal', 'Galatasaray');
  assert.equal(timeline[0].minute, "0'");
  assert.match(timeline[0].text, /Başlama düdüğü/);
  assert.ok(timeline.some((entry) => entry.tone === 'goal' && entry.text.includes('Leandro Trossard')));
  assert.ok(timeline.some((entry) => entry.minute === "45'"));
  assert.equal(timeline.at(-1)?.minute, 'FT');
});

test('builds a consistent match summary from the final result', () => {
  const summary = buildMatchSummary(fixture, result, 'Arsenal', 'Galatasaray');
  assert.equal(summary.scoreLine, '2 - 1');
  assert.equal(summary.goalMinutes, "12', 55', 77'");
  assert.equal(summary.totalShots, '23');
  assert.equal(summary.shotsOnTarget, '11');
  assert.equal(summary.possession, '%57');
  assert.ok(summary.manOfTheMatch.includes('Leandro Trossard') || summary.manOfTheMatch.includes('Bukayo Saka'));
  assert.ok(summary.keyMoments.length > 0);
});
