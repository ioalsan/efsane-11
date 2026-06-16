import baseDataset from '@/data/season-2025-26.json';
import type {
  FootballPosition,
  Player,
  SeasonCompetition,
  SeasonDataset,
  SeasonPlayer,
  SeasonTeam,
  Squad,
} from '@/types';

export const DEFAULT_COMPETITION_ID = 'super-lig';
export const SEASON_DATA_UPDATED_EVENT = 'efsane11:season-data-updated';

const STORAGE_KEY = 'efsane11:season-data:2025-2026:v4';
const LEGACY_STORAGE_KEYS = [
  'efsane11:season-data:2025-2026',
  'efsane11:season-data:2025-2026:v3',
];
const SYNTHETIC_POSITION_SUFFIXES = new Set([
  'kaleci', 'sağ bek', 'sag bek', 'sol bek', 'stoper', 'defans',
  'orta saha', 'sağ kanat', 'sag kanat', 'sol kanat', 'forvet',
  'gk', 'cb', 'lb', 'rb', 'dm', 'cm', 'am', 'lw', 'rw', 'st',
]);

const cloneBaseDataset = (): SeasonDataset => JSON.parse(JSON.stringify(baseDataset)) as SeasonDataset;
const serverSnapshot = cloneBaseDataset();
let cachedRaw: string | null | undefined;
let cachedDataset: SeasonDataset = serverSnapshot;

export const isSyntheticPlayerName = (
  name: string,
  teamId: string,
  teams: Pick<SeasonTeam, 'id' | 'name'>[],
) => {
  const teamName = teams.find((team) => team.id === teamId)?.name.trim();
  if (!teamName) return false;
  const prefix = `${teamName} `.toLocaleLowerCase('tr-TR');
  const normalizedName = name.trim().toLocaleLowerCase('tr-TR');
  return normalizedName.startsWith(prefix) &&
    SYNTHETIC_POSITION_SUFFIXES.has(normalizedName.slice(prefix.length).trim());
};

const isSeasonDataset = (value: unknown): value is SeasonDataset => {
  if (!value || typeof value !== 'object') return false;
  const dataset = value as Partial<SeasonDataset>;
  if (!(
    dataset.schemaVersion === 4 &&
    typeof dataset.season === 'string' &&
    Array.isArray(dataset.competitions) &&
    Array.isArray(dataset.teams) &&
    Array.isArray(dataset.players) &&
    dataset.teams.every((team) => team.teamType === 'club' || team.teamType === 'nationalTeam') &&
    dataset.competitions.every((competition) => (
      Array.isArray(competition.groups) &&
      Array.isArray(competition.knockoutRounds)
    ))
  )) return false;

  const teams = dataset.teams;
  const players = dataset.players;
  return players.every((player) => {
    const name = player.name?.trim();
    if (
      !name ||
      typeof player.number !== 'number' ||
      (player.playerType !== 'club' && player.playerType !== 'nationalTeam') ||
      typeof player.primaryPosition !== 'string' ||
      !Array.isArray(player.secondaryPositions)
    ) return false;

    return !isSyntheticPlayerName(name, player.teamId, teams);
  });
};

export const getSeasonDataset = (): SeasonDataset => {
  if (typeof window === 'undefined') return serverSnapshot;

  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedDataset;
    cachedRaw = raw;
    if (!raw) {
      cachedDataset = serverSnapshot;
      return cachedDataset;
    }
    const parsed = JSON.parse(raw) as unknown;
    cachedDataset = isSeasonDataset(parsed) ? parsed : serverSnapshot;
    return cachedDataset;
  } catch {
    cachedDataset = serverSnapshot;
    return cachedDataset;
  }
};

export const getSeasonServerSnapshot = () => serverSnapshot;

export const subscribeSeasonDataset = (callback: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener(SEASON_DATA_UPDATED_EVENT, callback);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(SEASON_DATA_UPDATED_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
};

export const saveSeasonDataset = (dataset: SeasonDataset) => {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(dataset);
  cachedRaw = raw;
  cachedDataset = dataset;
  window.localStorage.setItem(STORAGE_KEY, raw);
  window.dispatchEvent(new Event(SEASON_DATA_UPDATED_EVENT));
};

export const resetSeasonDataset = () => {
  if (typeof window === 'undefined') return;
  cachedRaw = null;
  cachedDataset = serverSnapshot;
  window.localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new Event(SEASON_DATA_UPDATED_EVENT));
};

export const getCompetitions = (dataset = getSeasonDataset()): SeasonCompetition[] => dataset.competitions;

export const getCompetition = (
  competitionId: string,
  dataset = getSeasonDataset(),
): SeasonCompetition | undefined => dataset.competitions.find(
  (competition) => competition.competitionId === competitionId,
);

export const getCompetitionTeams = (
  competitionId: string,
  dataset = getSeasonDataset(),
): SeasonTeam[] => {
  const competition = getCompetition(competitionId, dataset);
  if (!competition) return [];
  const teamIds = new Set(competition.teams);
  return dataset.teams.filter((team) => teamIds.has(team.id));
};

export const getTeamPlayers = (
  teamId: string,
  dataset = getSeasonDataset(),
): SeasonPlayer[] => dataset.players
  .filter((player) => player.teamId === teamId && player.isActive)
  .map((player, index) => ({
    ...player,
    name: player.name.trim() || `Player ${index + 1}`,
  }));

const LEGACY_POSITION_MAP: Record<FootballPosition, Player['position']> = {
  GK: 'KL',
  CB: 'STP',
  LB: 'SLB',
  RB: 'SĞB',
  DM: 'MO',
  CM: 'MO',
  AM: 'MO',
  LW: 'SLK',
  RW: 'SĞK',
  ST: 'SF',
};

export const toLegacyPlayer = (player: SeasonPlayer): Player => {
  const compatiblePositions = Array.from(new Set([
    LEGACY_POSITION_MAP[player.primaryPosition],
    ...player.secondaryPositions.map((position) => LEGACY_POSITION_MAP[position]),
  ]));
  return {
    id: player.id,
    name: player.name,
    era: '2025-26',
    position: compatiblePositions[0],
    secondary_position: compatiblePositions[1],
    compatiblePositions,
    overall_rating: Math.max(1, Math.min(99, player.rating + Math.round(player.form / 2))),
    image_url: '',
    jersey_number: player.number,
    teamId: player.teamId,
    form: player.form,
    nationality: player.nationality,
    isActive: player.isActive,
    primaryPosition: player.primaryPosition,
    secondaryPositions: player.secondaryPositions,
    attributes: player.attributes,
  };
};

export const getCompetitionSquads = (
  competitionId: string,
  dataset = getSeasonDataset(),
): Squad[] => getCompetitionTeams(competitionId, dataset).map((team) => ({
  id: `${competitionId}-${team.id}-2025-26`,
  teamName: team.name,
  year: dataset.season,
  players: getTeamPlayers(team.id, dataset).map(toLegacyPlayer),
}));

export const getCompetitionTeamStrength = (
  teamId: string,
  dataset = getSeasonDataset(),
): number => {
  const team = dataset.teams.find((item) => item.id === teamId);
  const players = getTeamPlayers(teamId, dataset);
  if (!team || players.length === 0) return 75;
  const average = players.reduce((total, player) => total + player.rating + player.form / 2, 0) / players.length;
  return Math.max(55, Math.min(96, Math.round(average + team.strengthBonus)));
};

export const findAnyPlayerById = (id: string): Player | undefined => {
  const modernPlayer = getSeasonDataset().players.find((player) => player.id === id);
  return modernPlayer ? toLegacyPlayer(modernPlayer) : undefined;
};

export const getAllKnownPlayers = (): Player[] => getSeasonDataset().players.map(toLegacyPlayer);
