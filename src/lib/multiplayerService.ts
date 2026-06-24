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
export type MultiplayerLeagueMode = 'invite' | 'local-friends';

export interface MultiplayerSquadSelection {
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
}

export interface PlayerSlot {
  id: string;
  displayName: string;
  teamName: string;
  selectedSquad: MultiplayerSquadSelection | null;
  formation: FormationType | null;
  tactic: ManagerMentality | null;
  captainId: string | null;
  ready: boolean;
  teamId: string | null;
  rating: number;
  chemistry: number;
  updatedAt: string;
}

export interface MultiplayerRealTeam {
  id: string;
  sourceTeamId: string;
  teamName: string;
  rating: number;
}

export interface MultiplayerTeam {
  id: string;
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
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
  mode: MultiplayerLeagueMode;
  name: string;
  ownerId: string;
  inviteCode: string;
  maxUsers: MultiplayerMaxUsers;
  powerLimit: MultiplayerPowerLimit;
  friendCount?: number;
  playerSlots: PlayerSlot[];
  teams: MultiplayerTeam[];
  botTeams: MultiplayerTeam[];
  realTeams: MultiplayerRealTeam[];
  replacedTeams: MultiplayerRealTeam[];
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
  reserves?: string[];
  rating: number;
  chemistry: number;
}

export interface CreateLeagueInput {
  name: string;
  ownerId: string;
  maxUsers: MultiplayerMaxUsers;
  powerLimit: MultiplayerPowerLimit;
}

export interface CreateLocalFriendLeagueInput {
  name: string;
  ownerId: string;
  friendCount: number;
  powerLimit: MultiplayerPowerLimit;
}

export interface PlayerSlotTeamInput extends MultiplayerTeamInput {
  displayName: string;
  reserves: string[];
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

const clampFriendCount = (value: number) => Math.min(18, Math.max(2, Math.round(value)));

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

const realTeamSummary = (
  team: SeasonTeam,
  rating: number,
): MultiplayerRealTeam => ({
  id: team.id,
  sourceTeamId: team.id,
  teamName: team.name,
  rating,
});

const buildRealTeamPool = (dataset: SeasonDataset) => (
  getCompetitionTeams(DEFAULT_COMPETITION_ID, dataset)
    .map((team) => {
      const players = getTeamPlayers(team.id, dataset)
        .sort((a, b) => b.rating + b.form - (a.rating + a.form))
        .slice(0, 23);
      return {
        team,
        players,
        rating: getRealTeamRating(team, players),
      };
    })
    .filter((item) => item.players.length >= 18)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 18)
);

export const getRealTeamReplacementPlan = (
  userTeamCount: number,
  dataset = getSeasonDataset(),
) => {
  const pool = buildRealTeamPool(dataset);
  const replacementCount = Math.min(pool.length, Math.max(0, userTeamCount));
  const kept = pool.slice(0, Math.max(0, pool.length - replacementCount));
  const replaced = pool.slice(Math.max(0, pool.length - replacementCount)).sort((a, b) => a.rating - b.rating);

  return {
    realTeams: kept.map((item) => realTeamSummary(item.team, item.rating)),
    replacedTeams: replaced.map((item) => realTeamSummary(item.team, item.rating)),
  };
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
    reserves: item.players.slice(18, 23).map((player) => player.id),
    rating: item.rating,
    chemistry: 72,
    isBot: true,
    sourceTeamId: item.team.id,
    createdAt,
    updatedAt: createdAt,
  }));
};

const createRealLeagueTeams = (
  realTeams: MultiplayerRealTeam[],
  dataset: SeasonDataset,
  leagueId: string,
): MultiplayerTeam[] => {
  const createdAt = now();
  return realTeams.map((realTeam, index) => {
    const sourceTeam = dataset.teams.find((team) => team.id === realTeam.sourceTeamId);
    const players = getTeamPlayers(realTeam.sourceTeamId, dataset)
      .sort((a, b) => b.rating + b.form - (a.rating + a.form))
      .slice(0, 23);

    return {
      id: `real-${leagueId}-${realTeam.sourceTeamId}-${index + 1}`,
      ownerId: 'real-team',
      teamName: sourceTeam?.name ?? realTeam.teamName,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0]?.id ?? null,
      startingXI: players.slice(0, 11).map((player) => player.id),
      substitutes: players.slice(11, 18).map((player) => player.id),
      reserves: players.slice(18, 23).map((player) => player.id),
      rating: realTeam.rating,
      chemistry: 72,
      isBot: true,
      sourceTeamId: realTeam.sourceTeamId,
      createdAt,
      updatedAt: createdAt,
    };
  });
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
  const reservePlayers = (team.reserves ?? [])
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
    players: [...startingPlayers, ...substitutePlayers, ...reservePlayers].map(toCompetitionPlayer),
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
    mode: 'invite',
    name: name.trim().slice(0, 36) || 'Canli11 Multiplayer Ligi',
    ownerId,
    inviteCode: createInviteCode(new Set(leagues.map((item) => item.inviteCode))),
    maxUsers,
    powerLimit,
    playerSlots: [],
    teams: [],
    botTeams: [],
    realTeams: [],
    replacedTeams: [],
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

const createPlayerSlots = (friendCount: number): PlayerSlot[] => (
  Array.from({ length: clampFriendCount(friendCount) }, (_, index) => ({
    id: `player-slot-${index + 1}`,
    displayName: `Oyuncu ${index + 1}`,
    teamName: '',
    selectedSquad: null,
    formation: null,
    tactic: null,
    captainId: null,
    ready: false,
    teamId: null,
    rating: 0,
    chemistry: 0,
    updatedAt: now(),
  }))
);

export const createLocalFriendLeague = ({
  name,
  ownerId,
  friendCount,
  powerLimit,
}: CreateLocalFriendLeagueInput) => {
  const leagues = readLeagues();
  const createdAt = now();
  const league: MultiplayerLeague = {
    version: 1,
    id: createId('mpl-local'),
    mode: 'local-friends',
    name: name.trim().slice(0, 36) || 'Canli11 Arkadas Ligi',
    ownerId,
    inviteCode: createInviteCode(new Set(leagues.map((item) => item.inviteCode))),
    maxUsers: 18,
    powerLimit,
    friendCount: clampFriendCount(friendCount),
    playerSlots: createPlayerSlots(friendCount),
    teams: [],
    botTeams: [],
    realTeams: [],
    replacedTeams: [],
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

const teamFromPlayerSlot = (
  slot: PlayerSlot,
  input: PlayerSlotTeamInput,
): MultiplayerTeam => {
  const createdAt = now();
  return {
    id: slot.teamId ?? createId('local-team'),
    ownerId: slot.id,
    teamName: input.teamName.trim().slice(0, 32) || slot.teamName,
    formation: input.formation,
    tactic: input.tactic,
    captainId: input.captainId,
    startingXI: input.startingXI.slice(0, 11),
    substitutes: input.substitutes.slice(0, 7),
    reserves: input.reserves.slice(0, 5),
    rating: Math.round(input.rating),
    chemistry: Math.round(input.chemistry),
    isBot: false,
    createdAt,
    updatedAt: createdAt,
  };
};

export const savePlayerSlotToLeague = (
  leagueId: string,
  slotId: string,
  input: PlayerSlotTeamInput,
) => {
  const league = loadLeague(leagueId);
  if (!league) throw new Error('Lig bulunamadi.');
  if ((league.mode ?? 'invite') !== 'local-friends') throw new Error('Bu lig arkadas ligi degil.');
  if (league.status !== 'waiting') throw new Error('Sezon basladiktan sonra takim degistirilemez.');

  const slot = (league.playerSlots ?? []).find((item) => item.id === slotId);
  if (!slot) throw new Error('Oyuncu slotu bulunamadi.');

  const cap = getPowerLimitCap(league.powerLimit);
  if (cap && input.rating > cap) throw new Error(`Takim ortalamasi ${cap} limitini asiyor.`);
  if (!input.teamName.trim()) throw new Error('Takim adi zorunlu.');
  if (input.startingXI.length !== 11) throw new Error('Ilk 11 tamamlanmadi.');
  if (input.substitutes.length !== 7) throw new Error('7 yedek secilmeli.');
  if (input.reserves.length !== 5) throw new Error('5 rezerv secilmeli.');
  if (!input.captainId || !input.startingXI.includes(input.captainId)) {
    throw new Error('Kaptan ilk 11 icinden secilmeli.');
  }

  const team = teamFromPlayerSlot(slot, input);
  const playerSlots = (league.playerSlots ?? []).map((item) => (
    item.id === slotId
      ? {
        ...item,
        displayName: input.displayName.trim().slice(0, 24) || item.displayName,
        teamName: team.teamName,
        selectedSquad: {
          startingXI: team.startingXI,
          substitutes: team.substitutes,
          reserves: team.reserves,
        },
        formation: team.formation,
        tactic: team.tactic,
        captainId: team.captainId,
        ready: true,
        teamId: team.id,
        rating: team.rating,
        chemistry: team.chemistry,
        updatedAt: now(),
      }
      : item
  ));
  const existingTeam = league.teams.find((item) => item.ownerId === slotId);
  const teams = existingTeam
    ? league.teams.map((item) => (item.ownerId === slotId ? { ...team, createdAt: item.createdAt } : item))
    : [...league.teams, team];

  return saveLeague({
    ...league,
    playerSlots,
    teams,
    standings: createStandingRows(teams.map((item) => item.id), teams, league.fixtures),
  });
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
    reserves: input.reserves?.slice(0, 5) ?? [],
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

export const startLocalFriendLeague = (
  leagueId: string,
  ownerId: string,
  dataset = getSeasonDataset(),
) => {
  const league = loadLeague(leagueId);
  if (!league) throw new Error('Lig bulunamadi.');
  if ((league.mode ?? 'invite') !== 'local-friends') throw new Error('Bu lig arkadas ligi degil.');
  if (league.ownerId !== ownerId) throw new Error('Sezonu sadece lig sahibi baslatabilir.');
  if (league.status !== 'waiting') throw new Error('Lig zaten baslatildi.');

  const playerSlots = league.playerSlots ?? [];
  const readySlots = playerSlots.filter((slot) => slot.ready);
  if (playerSlots.length < 2) throw new Error('Arkadas ligi icin en az 2 oyuncu gerekli.');
  if (readySlots.length !== playerSlots.length) throw new Error('Tum oyuncular hazir olmali.');

  const userTeams = readySlots
    .map((slot) => league.teams.find((team) => team.ownerId === slot.id))
    .filter((team): team is MultiplayerTeam => Boolean(team));
  if (userTeams.length !== playerSlots.length) throw new Error('Hazir oyuncu takimlari eksik.');
  if (userTeams.length > 18) throw new Error('18 takimdan fazla kullanici takimi olamaz.');

  const plan = getRealTeamReplacementPlan(userTeams.length, dataset);
  const realLeagueTeams = createRealLeagueTeams(plan.realTeams, dataset, league.id);
  const allTeams = [...userTeams, ...realLeagueTeams];
  if (allTeams.length !== 18) throw new Error('18 takimlik lig havuzu olusturulamadi.');

  const teamIds = allTeams.map((team) => team.id);
  const fixtures = generateRoundRobin(teamIds, true);

  return saveLeague({
    ...league,
    maxUsers: 18,
    teams: userTeams,
    botTeams: realLeagueTeams,
    realTeams: plan.realTeams,
    replacedTeams: plan.replacedTeams,
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
  reserves = [],
}: {
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingPlayers: Player[];
  substitutes: Player[];
  reserves?: Player[];
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
    reserves: reserves.slice(0, 5).map((player) => player.id),
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
