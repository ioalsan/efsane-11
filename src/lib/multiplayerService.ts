import {
  calculateStandings,
  generateRoundRobin,
  simulateCompetitionMatch,
  toCompetitionPlayer,
  type CompetitionFixture,
  type CompetitionTeam,
  type MatchResult,
  type StandingRow,
} from './competitionEngine';
import type { FormationType } from './formations';
import {
  DEFAULT_COMPETITION_ID,
  getCompetitionTeams,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from './seasonRepository';
import { getCaptainRole } from './captain';
import {
  getSquadManagementSummary,
  type ManagerMentality,
} from './teamManagement';
import type { Player, SeasonDataset, SeasonTeam } from '@/types';

export type MultiplayerLeagueStatus = 'waiting' | 'active' | 'completed';
export type MultiplayerMaxUsers = 4 | 8 | 12 | 18;
export type MultiplayerPowerLimit = 'free' | 'balanced' | 'max80' | 'max85';

export interface MultiplayerTeam {
  id: string;
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  rating: number;
  chemistry: number;
  isBot: boolean;
  sourceTeamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MultiplayerStandingRow extends StandingRow {
  teamName: string;
  isBot: boolean;
  form: string;
}

export interface MultiplayerMatchReport {
  fixtureId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  result: MatchResult;
  playedAt: string;
}

export interface MultiplayerLeague {
  version: 1;
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  maxUsers: MultiplayerMaxUsers;
  powerLimit: MultiplayerPowerLimit;
  teams: MultiplayerTeam[];
  botTeams: MultiplayerTeam[];
  fixtures: CompetitionFixture[][];
  standings: MultiplayerStandingRow[];
  status: MultiplayerLeagueStatus;
  currentWeek: number;
  latestFixtureId: string | null;
  matchReports: MultiplayerMatchReport[];
  createdAt: string;
  updatedAt: string;
}

export interface MultiplayerTeamInput {
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  rating: number;
  chemistry: number;
}

export interface CreateLeagueInput {
  name: string;
  ownerId: string;
  maxUsers: MultiplayerMaxUsers;
  powerLimit: MultiplayerPowerLimit;
}

export interface SimulateWeekResult {
  league: MultiplayerLeague;
  playedRound: CompetitionFixture[];
}

const STORAGE_KEY = 'canli11:multiplayer-leagues:v1';
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => new Date().toISOString();

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const normalizeInviteCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const isValidMaxUsers = (value: number): value is MultiplayerMaxUsers => (
  value === 4 || value === 8 || value === 12 || value === 18
);

export const getPowerLimitCap = (powerLimit: MultiplayerPowerLimit): number | null => {
  if (powerLimit === 'max80') return 80;
  if (powerLimit === 'max85') return 85;
  if (powerLimit === 'balanced') return 83;
  return null;
};

const readLeagues = (): MultiplayerLeague[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMultiplayerLeague);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

const writeLeagues = (leagues: MultiplayerLeague[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
};

const saveLeague = (league: MultiplayerLeague) => {
  const leagues = readLeagues();
  const nextLeague = {
    ...league,
    updatedAt: now(),
  };
  const exists = leagues.some((item) => item.id === league.id);
  writeLeagues(exists
    ? leagues.map((item) => (item.id === league.id ? nextLeague : item))
    : [nextLeague, ...leagues]);
  return nextLeague;
};

const isMultiplayerLeague = (value: unknown): value is MultiplayerLeague => {
  if (!value || typeof value !== 'object') return false;
  const league = value as Partial<MultiplayerLeague>;
  return (
    league.version === 1 &&
    typeof league.id === 'string' &&
    typeof league.name === 'string' &&
    typeof league.ownerId === 'string' &&
    typeof league.inviteCode === 'string' &&
    typeof league.currentWeek === 'number' &&
    typeof league.latestFixtureId !== 'undefined' &&
    isValidMaxUsers(Number(league.maxUsers)) &&
    Array.isArray(league.teams) &&
    Array.isArray(league.botTeams) &&
    Array.isArray(league.fixtures) &&
    Array.isArray(league.standings) &&
    Array.isArray(league.matchReports) &&
    (league.status === 'waiting' || league.status === 'active' || league.status === 'completed')
  );
};

const createInviteCode = (existingCodes: Set<string>) => {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]).join('');
  } while (existingCodes.has(code));
  return code;
};

const finalScore = (fixture: CompetitionFixture) => fixture.result?.extraTime ?? fixture.result?.normalTime ?? null;

const getForm = (teamId: string, fixtures: CompetitionFixture[]) => {
  const played = fixtures
    .filter((fixture) => fixture.result && (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId))
    .slice(-5);

  return played.map((fixture) => {
    const score = finalScore(fixture);
    if (!score) return '-';
    const goalsFor = fixture.homeTeamId === teamId ? score.home : score.away;
    const goalsAgainst = fixture.homeTeamId === teamId ? score.away : score.home;
    if (goalsFor > goalsAgainst) return 'G';
    if (goalsFor < goalsAgainst) return 'M';
    return 'B';
  }).join(' ');
};

const getTeamName = (teamId: string, teams: MultiplayerTeam[]) => (
  teams.find((team) => team.id === teamId)?.teamName ?? teamId
);

const createStandingRows = (
  teamIds: string[],
  teams: MultiplayerTeam[],
  fixtures: CompetitionFixture[][],
): MultiplayerStandingRow[] => {
  const flatFixtures = fixtures.flat();
  return calculateStandings(teamIds, flatFixtures).map((row) => {
    const team = teams.find((item) => item.id === row.teamId);
    return {
      ...row,
      teamName: team?.teamName ?? row.teamId,
      isBot: team?.isBot ?? false,
      form: getForm(row.teamId, flatFixtures),
    };
  });
};

const getPlayerMap = (dataset: SeasonDataset) => new Map(
  dataset.players.map((player) => {
    const legacyPlayer = toLegacyPlayer(player);
    return [legacyPlayer.id, legacyPlayer] as const;
  }),
);

const getRealTeamRating = (team: SeasonTeam, players: ReturnType<typeof getTeamPlayers>) => {
  if (players.length === 0) return 72 + team.strengthBonus;
  const average = players.reduce((total, player) => total + player.rating + player.form * 0.3, 0) / players.length;
  return Math.max(55, Math.min(96, Math.round(average + team.strengthBonus)));
};

const buildBotCandidateList = (
  dataset: SeasonDataset,
  powerLimit: MultiplayerPowerLimit,
) => {
  const cap = getPowerLimitCap(powerLimit);
  const candidates = getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .map((team) => {
      const players = getTeamPlayers(team.id, dataset)
        .sort((a, b) => b.rating + b.form - (a.rating + a.form))
        .slice(0, 18);
      return {
        team,
        players,
        rating: getRealTeamRating(team, players),
      };
    })
    .filter((item) => item.players.length >= 11);

  if (!cap) return candidates.sort((a, b) => b.rating - a.rating);

  const underCap = candidates
    .filter((item) => item.rating <= cap)
    .sort((a, b) => b.rating - a.rating);
  const overCap = candidates
    .filter((item) => item.rating > cap)
    .sort((a, b) => Math.abs(a.rating - cap) - Math.abs(b.rating - cap));

  return [...underCap, ...overCap];
};

const createBotTeams = (
  league: MultiplayerLeague,
  dataset: SeasonDataset,
): MultiplayerTeam[] => {
  const needed = Math.max(0, league.maxUsers - league.teams.length);
  const candidates = buildBotCandidateList(dataset, league.powerLimit);
  const createdAt = now();

  return candidates.slice(0, needed).map((item, index) => ({
    id: `bot-${league.id}-${item.team.id}-${index + 1}`,
    ownerId: 'bot',
    teamName: item.team.name,
    formation: '4-2-3-1',
    tactic: 'Balanced',
    captainId: item.players[0]?.id ?? null,
    startingXI: item.players.slice(0, 11).map((player) => player.id),
    substitutes: item.players.slice(11, 18).map((player) => player.id),
    rating: item.rating,
    chemistry: 72,
    isBot: true,
    sourceTeamId: item.team.id,
    createdAt,
    updatedAt: createdAt,
  }));
};

const toCompetitionTeam = (
  team: MultiplayerTeam,
  playerById: Map<string, Player>,
): CompetitionTeam => {
  const startingPlayers = team.startingXI
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const substitutePlayers = team.substitutes
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const captain = playerById.get(team.captainId ?? '');
  const captainRole = getCaptainRole(captain);

  return {
    id: team.id,
    name: team.teamName,
    rating: team.rating,
    isUser: !team.isBot,
    tactic: team.tactic,
    chemistry: team.chemistry,
    captainImpact: captainRole ? captainRole.bonus * 2 : 0,
    captainRoleTitle: captainRole?.title,
    players: [...startingPlayers, ...substitutePlayers].map(toCompetitionPlayer),
  };
};

const getCompetitionTeamMap = (
  league: MultiplayerLeague,
  dataset: SeasonDataset,
) => {
  const playerById = getPlayerMap(dataset);
  return new Map(
    [...league.teams, ...league.botTeams].map((team) => [team.id, toCompetitionTeam(team, playerById)] as const),
  );
};

export const listLeagues = () => readLeagues();

export const loadLeague = (leagueId: string) => (
  readLeagues().find((league) => league.id === leagueId) ?? null
);

export const findLeagueByInviteCode = (inviteCode: string) => {
  const code = normalizeInviteCode(inviteCode);
  return readLeagues().find((league) => league.inviteCode === code) ?? null;
};

export const createLeague = ({
  name,
  ownerId,
  maxUsers,
  powerLimit,
}: CreateLeagueInput) => {
  const leagues = readLeagues();
  const createdAt = now();
  const league: MultiplayerLeague = {
    version: 1,
    id: createId('mpl'),
    name: name.trim().slice(0, 36) || 'Canli11 Multiplayer Ligi',
    ownerId,
    inviteCode: createInviteCode(new Set(leagues.map((item) => item.inviteCode))),
    maxUsers,
    powerLimit,
    teams: [],
    botTeams: [],
    fixtures: [],
    standings: [],
    status: 'waiting',
    currentWeek: 0,
    latestFixtureId: null,
    matchReports: [],
    createdAt,
    updatedAt: createdAt,
  };

  writeLeagues([league, ...leagues]);
  return league;
};

export const joinLeague = (inviteCode: string, ownerId: string) => {
  const league = findLeagueByInviteCode(inviteCode);
  if (!league) throw new Error('Lig bulunamadi.');
  if (league.status !== 'waiting') throw new Error('Bu lig artik katilima kapali.');
  if (league.teams.length >= league.maxUsers && !league.teams.some((team) => team.ownerId === ownerId)) {
    throw new Error('Lig dolu.');
  }
  return saveLeague(league);
};

export const saveTeamToLeague = (
  leagueId: string,
  input: MultiplayerTeamInput,
) => {
  const league = loadLeague(leagueId);
  if (!league) throw new Error('Lig bulunamadi.');
  if (league.status !== 'waiting') throw new Error('Sezon basladiktan sonra takim degistirilemez.');

  const cap = getPowerLimitCap(league.powerLimit);
  if (cap && input.rating > cap) {
    throw new Error(`Takim ortalamasi ${cap} limitini asiyor.`);
  }
  if (input.startingXI.length !== 11) throw new Error('Ilk 11 tamamlanmadi.');
  if (!input.captainId || !input.startingXI.includes(input.captainId)) throw new Error('Kaptan ilk 11 icinden secilmeli.');

  const existingIndex = league.teams.findIndex((team) => team.ownerId === input.ownerId);
  if (existingIndex === -1 && league.teams.length >= league.maxUsers) {
    throw new Error('Lig dolu.');
  }

  const createdAt = existingIndex >= 0 ? league.teams[existingIndex].createdAt : now();
  const team: MultiplayerTeam = {
    id: existingIndex >= 0 ? league.teams[existingIndex].id : createId('mpt'),
    ownerId: input.ownerId,
    teamName: input.teamName.trim().slice(0, 32) || 'Canli11 FC',
    formation: input.formation,
    tactic: input.tactic,
    captainId: input.captainId,
    startingXI: input.startingXI.slice(0, 11),
    substitutes: input.substitutes.slice(0, 7),
    rating: Math.round(input.rating),
    chemistry: Math.round(input.chemistry),
    isBot: false,
    createdAt,
    updatedAt: now(),
  };

  const teams = existingIndex >= 0
    ? league.teams.map((item, index) => (index === existingIndex ? team : item))
    : [...league.teams, team];

  return saveLeague({
    ...league,
    teams,
    standings: createStandingRows(teams.map((item) => item.id), teams, league.fixtures),
  });
};

export const startLeague = (
  leagueId: string,
  ownerId: string,
  dataset = getSeasonDataset(),
) => {
  const league = loadLeague(leagueId);
  if (!league) throw new Error('Lig bulunamadi.');
  if (league.ownerId !== ownerId) throw new Error('Sezonu sadece lig sahibi baslatabilir.');
  if (league.status !== 'waiting') throw new Error('Lig zaten baslatildi.');
  if (league.teams.length === 0) throw new Error('En az bir kullanici takimi gerekli.');

  const botTeams = createBotTeams(league, dataset);
  const allTeams = [...league.teams, ...botTeams].slice(0, league.maxUsers);
  const teamIds = allTeams.map((team) => team.id);
  const fixtures = generateRoundRobin(teamIds, true);

  return saveLeague({
    ...league,
    botTeams,
    fixtures,
    standings: createStandingRows(teamIds, allTeams, fixtures),
    status: 'active',
    currentWeek: 0,
    latestFixtureId: null,
    matchReports: [],
  });
};

export const simulateWeek = (
  leagueId: string,
  dataset = getSeasonDataset(),
): SimulateWeekResult => {
  const league = loadLeague(leagueId);
  if (!league) throw new Error('Lig bulunamadi.');
  if (league.status !== 'active') throw new Error('Lig aktif degil.');

  const currentRound = league.fixtures[league.currentWeek] ?? [];
  if (currentRound.length === 0) {
    const completed = saveLeague({ ...league, status: 'completed' });
    return { league: completed, playedRound: [] };
  }

  const matchTeams = getCompetitionTeamMap(league, dataset);
  const playedAt = now();
  const playedRound = currentRound.map((fixture) => {
    if (fixture.result) return fixture;
    const home = matchTeams.get(fixture.homeTeamId);
    const away = matchTeams.get(fixture.awayTeamId);
    if (!home || !away) return fixture;
    return {
      ...fixture,
      result: simulateCompetitionMatch(home, away, false, dataset.settings, {
        allowSubstitutions: true,
        longSimulation: true,
      }),
    };
  });

  const nextFixtures = league.fixtures.map((round, index) => (
    index === league.currentWeek ? playedRound : round
  ));
  const allTeams = [...league.teams, ...league.botTeams];
  const nextWeek = league.currentWeek + 1;
  const latestFixture = playedRound.find((fixture) => Boolean(fixture.result)) ?? null;
  const matchReports: MultiplayerMatchReport[] = [
    ...league.matchReports,
    ...playedRound
      .filter((fixture): fixture is CompetitionFixture & { result: MatchResult } => Boolean(fixture.result))
      .map((fixture) => ({
        fixtureId: fixture.id,
        week: league.currentWeek + 1,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        result: fixture.result,
        playedAt,
      })),
  ];

  const nextLeague = saveLeague({
    ...league,
    fixtures: nextFixtures,
    currentWeek: nextWeek,
    standings: createStandingRows(allTeams.map((team) => team.id), allTeams, nextFixtures),
    status: nextWeek >= league.fixtures.length ? 'completed' : 'active',
    latestFixtureId: latestFixture?.id ?? league.latestFixtureId,
    matchReports,
  });

  return { league: nextLeague, playedRound };
};

export const getStandings = (league: MultiplayerLeague) => (
  createStandingRows(
    [...league.teams, ...league.botTeams].map((team) => team.id),
    [...league.teams, ...league.botTeams],
    league.fixtures,
  )
);

export const getLeagueHighlights = (league: MultiplayerLeague) => {
  const rows = league.standings.length > 0 ? league.standings : getStandings(league);
  const topScoring = [...rows].sort((a, b) => b.goalsFor - a.goalsFor)[0] ?? null;
  const bestDefense = [...rows]
    .filter((row) => row.played > 0)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.points - a.points)[0] ?? null;

  return {
    leader: rows[0] ?? null,
    topScoring,
    bestDefense,
  };
};

export const buildMultiplayerTeamInput = ({
  ownerId,
  teamName,
  formation,
  tactic,
  captainId,
  startingPlayers,
  substitutes,
}: {
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingPlayers: Player[];
  substitutes: Player[];
}): MultiplayerTeamInput => {
  const summary = getSquadManagementSummary({
    selectedPlayers: startingPlayers,
    formationId: formation,
    captainId,
    mentality: tactic,
  });

  return {
    ownerId,
    teamName,
    formation,
    tactic,
    captainId,
    startingXI: startingPlayers.map((player) => player.id),
    substitutes: substitutes.slice(0, 7).map((player) => player.id),
    rating: summary.power,
    chemistry: summary.chemistry,
  };
};

export const resetMultiplayerLeagues = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const getTeamDisplayName = (league: MultiplayerLeague, teamId: string) => (
  getTeamName(teamId, [...league.teams, ...league.botTeams])
);
