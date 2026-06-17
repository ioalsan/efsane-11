import type {
  GameSettings,
  KnockoutRound,
  Player,
  PlayerAttributes,
  SeasonPlayer,
} from '@/types';

export interface CompetitionTeam {
  id: string;
  name: string;
  rating: number;
  players: CompetitionPlayer[];
  isUser?: boolean;
}

export interface CompetitionPlayer {
  id: string;
  name: string;
  rating: number;
  form: number;
  attributes: PlayerAttributes;
}

export interface MatchIncident {
  minute: number;
  teamId: string;
  playerName: string;
  type: 'goal' | 'yellow-card' | 'red-card' | 'injury';
}

export interface PenaltyKick {
  order: number;
  teamId: string;
  playerName: string;
  scored: boolean;
  homeScore: number;
  awayScore: number;
}

export interface MatchResult {
  normalTime: { home: number; away: number };
  extraTime?: { home: number; away: number };
  penalties?: { home: number; away: number };
  penaltyKicks?: PenaltyKick[];
  winnerId: string | null;
  incidents: MatchIncident[];
  stats: {
    possessionHome: number;
    shotsHome: number;
    shotsAway: number;
    xgHome: number;
    xgAway: number;
  };
}

export interface CompetitionFixture {
  id: string;
  stage: 'league' | 'group' | KnockoutRound;
  groupId?: string;
  roundNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  result?: MatchResult;
}

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const samplePoisson = (lambda: number) => {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= Math.random();
  } while (product > limit && count < 12);
  return count - 1;
};

const average = (values: number[], fallback: number) => {
  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

const teamMetric = (team: CompetitionTeam, key: keyof PlayerAttributes) => {
  const values = team.players.map((player) => player.attributes[key] + player.form * 0.5);
  if (key === 'goalkeeping') return values.length > 0 ? Math.max(...values) : team.rating;
  return average(values, team.rating);
};

const pickAttacker = (team: CompetitionTeam) => {
  const candidates = team.players.filter((player) => player.attributes.shooting >= team.rating - 8);
  const pool = candidates.length > 0 ? candidates : team.players;
  const totalWeight = pool.reduce((total, player) => total + Math.max(1, player.attributes.shooting - 45), 0);
  let cursor = Math.random() * totalWeight;
  for (const player of pool) {
    cursor -= Math.max(1, player.attributes.shooting - 45);
    if (cursor <= 0) return player;
  }
  return pool[0];
};

const randomPlayer = (team: CompetitionTeam) => team.players[Math.floor(Math.random() * team.players.length)];

export const simulatePenaltyShootout = (
  home: CompetitionTeam,
  away: CompetitionTeam,
  usePlayerAttributes: boolean,
) => {
  const details = simulatePenaltyShootoutDetails(home, away, usePlayerAttributes);
  return details.score;
};

export const simulatePenaltyShootoutDetails = (
  home: CompetitionTeam,
  away: CompetitionTeam,
  usePlayerAttributes: boolean,
) => {
  const homeChance = usePlayerAttributes
    ? clamp(0.74 + (teamMetric(home, 'shooting') - teamMetric(away, 'goalkeeping')) / 220, 0.58, 0.9)
    : 0.75;
  const awayChance = usePlayerAttributes
    ? clamp(0.74 + (teamMetric(away, 'shooting') - teamMetric(home, 'goalkeeping')) / 220, 0.58, 0.9)
    : 0.75;
  let homePenalties = 0;
  let awayPenalties = 0;
  const kicks: PenaltyKick[] = [];
  let order = 0;

  const takeKick = (team: CompetitionTeam, chance: number, isHome: boolean) => {
    const scored = Math.random() < chance;
    if (scored && isHome) homePenalties += 1;
    if (scored && !isHome) awayPenalties += 1;
    const player = team.players[order % Math.max(1, team.players.length)];
    order += 1;
    kicks.push({
      order,
      teamId: team.id,
      playerName: player?.name ?? `Player ${order}`,
      scored,
      homeScore: homePenalties,
      awayScore: awayPenalties,
    });
  };

  for (let kick = 0; kick < 5; kick += 1) {
    takeKick(home, homeChance, true);
    takeKick(away, awayChance, false);
  }
  let suddenDeathRounds = 0;
  while (homePenalties === awayPenalties && suddenDeathRounds < 12) {
    takeKick(home, homeChance, true);
    takeKick(away, awayChance, false);
    suddenDeathRounds += 1;
  }
  if (homePenalties === awayPenalties) {
    const forceHomeWinner = home.rating >= away.rating;
    takeKick(forceHomeWinner ? home : away, 1, forceHomeWinner);
  }

  return {
    score: { home: homePenalties, away: awayPenalties },
    kicks,
  };
};

const buildIncidents = (
  home: CompetitionTeam,
  away: CompetitionTeam,
  normalHomeGoals: number,
  normalAwayGoals: number,
  extraHomeGoals: number,
  extraAwayGoals: number,
  settings: GameSettings,
): MatchIncident[] => {
  const incidents: MatchIncident[] = [];
  const addGoals = (team: CompetitionTeam, count: number, firstMinute: number, lastMinute: number) => {
    for (let index = 0; index < count; index += 1) {
      const scorer = pickAttacker(team);
      if (!scorer) continue;
      incidents.push({
        minute: firstMinute + Math.floor(Math.random() * (lastMinute - firstMinute + 1)),
        teamId: team.id,
        playerName: scorer.name,
        type: 'goal',
      });
    }
  };
  addGoals(home, normalHomeGoals, 1, 90);
  addGoals(away, normalAwayGoals, 1, 90);
  addGoals(home, extraHomeGoals, 91, 120);
  addGoals(away, extraAwayGoals, 91, 120);

  for (const team of [home, away]) {
    const yellowCount = Math.floor(Math.random() * 4);
    for (let index = 0; index < yellowCount; index += 1) {
      const player = randomPlayer(team);
      if (player) incidents.push({
        minute: 10 + Math.floor(Math.random() * 80),
        teamId: team.id,
        playerName: player.name,
        type: 'yellow-card',
      });
    }
    if (Math.random() < 0.07 * settings.chanceFactor) {
      const player = randomPlayer(team);
      if (player) incidents.push({
        minute: 20 + Math.floor(Math.random() * 70),
        teamId: team.id,
        playerName: player.name,
        type: 'red-card',
      });
    }
    if (Math.random() < settings.injuryChance * settings.chanceFactor) {
      const player = randomPlayer(team);
      if (player) incidents.push({
        minute: 5 + Math.floor(Math.random() * 80),
        teamId: team.id,
        playerName: player.name,
        type: 'injury',
      });
    }
  }

  return incidents.sort((a, b) => a.minute - b.minute);
};

export const simulateCompetitionMatch = (
  home: CompetitionTeam,
  away: CompetitionTeam,
  knockout: boolean,
  settings: GameSettings,
): MatchResult => {
  const homeAttack = average([
    teamMetric(home, 'attack'),
    teamMetric(home, 'passing'),
    teamMetric(home, 'shooting'),
    teamMetric(home, 'dribbling'),
    teamMetric(home, 'pace'),
  ], home.rating);
  const awayAttack = average([
    teamMetric(away, 'attack'),
    teamMetric(away, 'passing'),
    teamMetric(away, 'shooting'),
    teamMetric(away, 'dribbling'),
    teamMetric(away, 'pace'),
  ], away.rating);
  const homeResistance = average([teamMetric(home, 'defense'), teamMetric(home, 'goalkeeping')], home.rating);
  const awayResistance = average([teamMetric(away, 'defense'), teamMetric(away, 'goalkeeping')], away.rating);
  const chanceFactor = clamp(settings.chanceFactor, 0.2, 2);
  const homeXg = clamp((1.35 + (homeAttack - awayResistance) / 19 + 0.16) * chanceFactor, 0.15, 4.2);
  const awayXg = clamp((1.2 + (awayAttack - homeResistance) / 19) * chanceFactor, 0.15, 4.2);
  let homeGoals = samplePoisson(homeXg);
  let awayGoals = samplePoisson(awayXg);
  const normalTime = { home: homeGoals, away: awayGoals };
  let extraTime: MatchResult['extraTime'];
  let penalties: MatchResult['penalties'];
  let penaltyKicks: MatchResult['penaltyKicks'];
  let extraHomeGoals = 0;
  let extraAwayGoals = 0;
  let winnerId = homeGoals === awayGoals ? null : homeGoals > awayGoals ? home.id : away.id;

  if (knockout && homeGoals === awayGoals) {
    extraHomeGoals = samplePoisson(homeXg * 0.32);
    extraAwayGoals = samplePoisson(awayXg * 0.32);
    homeGoals += extraHomeGoals;
    awayGoals += extraAwayGoals;
    extraTime = { home: homeGoals, away: awayGoals };
    winnerId = homeGoals === awayGoals ? null : homeGoals > awayGoals ? home.id : away.id;

    if (!winnerId) {
      const shootout = simulatePenaltyShootoutDetails(home, away, settings.penaltiesEnabled);
      penalties = shootout.score;
      penaltyKicks = shootout.kicks;
      winnerId = penalties.home > penalties.away ? home.id : away.id;
    }
  }

  const possessionHome = Math.round(clamp(50 + (teamMetric(home, 'passing') - teamMetric(away, 'passing')) * 0.45, 28, 72));
  return {
    normalTime,
    extraTime,
    penalties,
    penaltyKicks,
    winnerId,
    incidents: buildIncidents(
      home,
      away,
      normalTime.home,
      normalTime.away,
      extraHomeGoals,
      extraAwayGoals,
      settings,
    ),
    stats: {
      possessionHome,
      shotsHome: Math.max(homeGoals, Math.round(homeXg * 4 + Math.random() * 5)),
      shotsAway: Math.max(awayGoals, Math.round(awayXg * 4 + Math.random() * 5)),
      xgHome: Math.round(homeXg * 100) / 100,
      xgAway: Math.round(awayXg * 100) / 100,
    },
  };
};

export const generateRoundRobin = (
  teamIds: string[],
  doubleRound = true,
): CompetitionFixture[][] => {
  const participants = [...teamIds];
  if (participants.length % 2 !== 0) participants.push('__bye__');
  const rounds: CompetitionFixture[][] = [];
  const fixed = participants[0];
  let rotating = participants.slice(1);
  const singleRoundCount = participants.length - 1;

  for (let round = 0; round < singleRoundCount; round += 1) {
    const lineup = [fixed, ...rotating];
    const fixtures: CompetitionFixture[] = [];
    for (let index = 0; index < lineup.length / 2; index += 1) {
      const left = lineup[index];
      const right = lineup[lineup.length - 1 - index];
      if (left === '__bye__' || right === '__bye__') continue;
      const swap = (round + index) % 2 === 1;
      fixtures.push({
        id: `league-${round + 1}-${index + 1}`,
        stage: 'league',
        roundNumber: round + 1,
        homeTeamId: swap ? right : left,
        awayTeamId: swap ? left : right,
      });
    }
    rounds.push(fixtures);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  if (!doubleRound) return rounds;
  return [
    ...rounds,
    ...rounds.map((fixtures, roundIndex) => fixtures.map((fixture, fixtureIndex) => ({
      ...fixture,
      id: `league-${singleRoundCount + roundIndex + 1}-${fixtureIndex + 1}`,
      roundNumber: singleRoundCount + roundIndex + 1,
      homeTeamId: fixture.awayTeamId,
      awayTeamId: fixture.homeTeamId,
    }))),
  ];
};

export const generateLeaguePhase = (teamIds: string[], matchCount: number) => (
  generateRoundRobin(teamIds, false).slice(0, matchCount)
);

export const generateWorldCupGroupStage = (
  groups: { groupId: string; teamIds: string[] }[],
): CompetitionFixture[][] => {
  const rounds: CompetitionFixture[][] = [[], [], []];
  groups.forEach((group) => {
    const groupRounds = generateRoundRobin(group.teamIds, false);
    groupRounds.slice(0, 3).forEach((fixtures, roundIndex) => {
      rounds[roundIndex].push(...fixtures.map((fixture, fixtureIndex) => ({
        ...fixture,
        id: `${group.groupId}-${roundIndex + 1}-${fixtureIndex + 1}`,
        stage: 'group' as const,
        groupId: group.groupId,
        roundNumber: roundIndex + 1,
      })));
    });
  });
  return rounds;
};

export const calculateStandings = (
  teamIds: string[],
  fixtures: CompetitionFixture[],
): StandingRow[] => {
  const rows = new Map<string, StandingRow>(teamIds.map((teamId) => [teamId, {
    teamId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }]));

  fixtures.forEach((fixture) => {
    if (!fixture.result) return;
    const home = rows.get(fixture.homeTeamId);
    const away = rows.get(fixture.awayTeamId);
    if (!home || !away) return;
    const homeScore = fixture.result.normalTime.home;
    const awayScore = fixture.result.normalTime.away;
    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  });

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
  );
};

export const generateKnockoutRound = (
  seededTeamIds: string[],
  stage: KnockoutRound,
): CompetitionFixture[] => {
  const fixtures: CompetitionFixture[] = [];
  for (let index = 0; index < seededTeamIds.length / 2; index += 1) {
    fixtures.push({
      id: `${stage}-${index + 1}`,
      stage,
      roundNumber: index + 1,
      homeTeamId: seededTeamIds[index],
      awayTeamId: seededTeamIds[seededTeamIds.length - 1 - index],
    });
  }
  return fixtures;
};

export const getKnockoutWinners = (fixtures: CompetitionFixture[]) => fixtures
  .map((fixture) => fixture.result?.winnerId)
  .filter((teamId): teamId is string => Boolean(teamId));

export const toCompetitionPlayer = (player: SeasonPlayer | Player): CompetitionPlayer => {
  const isSeasonPlayer = 'rating' in player;
  const rating = isSeasonPlayer ? player.rating : player.overall_rating;
  return {
    id: player.id,
    name: player.name,
    rating,
    form: player.form ?? 0,
    attributes: player.attributes ?? {
      attack: rating,
      defense: rating,
      passing: rating,
      pace: rating,
      shooting: rating,
      dribbling: rating,
      goalkeeping: !isSeasonPlayer && player.position === 'KL' ? rating : 25,
    },
  };
};
