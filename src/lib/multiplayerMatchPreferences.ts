export type SimulationSpeed = 'normal' | 'fast' | 'very-fast';

export interface MultiplayerMatchPreferences {
  autoContinue: boolean;
  autoSeason: boolean;
  speed: SimulationSpeed;
}

interface StorageReader {
  getItem: (key: string) => string | null;
}

interface StorageWriter {
  setItem: (key: string, value: string) => void;
}

export interface MultiplayerMatchPreferenceSnapshot {
  key: string;
  preferences: MultiplayerMatchPreferences;
}

const AUTO_CONTINUE_PREFIX = 'canli11:autoContinue';
const MATCH_SPEED_PREFIX = 'canli11:matchSpeed';
const AUTO_SEASON_PREFIX = 'canli11:autoSeason';

export const defaultMultiplayerMatchPreferences: MultiplayerMatchPreferences = {
  autoContinue: true,
  autoSeason: false,
  speed: 'fast',
};

export const getMultiplayerMatchPreferenceKeys = (leagueId: string, userId: string) => ({
  autoContinue: `${AUTO_CONTINUE_PREFIX}:${leagueId}:${userId}`,
  speed: `${MATCH_SPEED_PREFIX}:${leagueId}:${userId}`,
  autoSeason: `${AUTO_SEASON_PREFIX}:${leagueId}:${userId}`,
});

const isSimulationSpeed = (value: string | null): value is SimulationSpeed => (
  value === 'normal' || value === 'fast' || value === 'very-fast'
);

export const readMultiplayerMatchPreferences = (
  storage: StorageReader,
  leagueId: string,
  userId: string,
): MultiplayerMatchPreferences => {
  const keys = getMultiplayerMatchPreferenceKeys(leagueId, userId);
  const speed = storage.getItem(keys.speed);
  const storedAutoContinue = storage.getItem(keys.autoContinue);
  return {
    autoContinue: storedAutoContinue === 'false' ? false : true,
    autoSeason: storage.getItem(keys.autoSeason) === 'true',
    speed: isSimulationSpeed(speed) ? speed : defaultMultiplayerMatchPreferences.speed,
  };
};

export const writeMultiplayerAutoSeason = (
  storage: StorageWriter,
  leagueId: string,
  userId: string,
  value: boolean,
) => {
  storage.setItem(getMultiplayerMatchPreferenceKeys(leagueId, userId).autoSeason, String(value));
};

export const writeMultiplayerAutoContinue = (
  storage: StorageWriter,
  leagueId: string,
  userId: string,
  value: boolean,
) => {
  storage.setItem(getMultiplayerMatchPreferenceKeys(leagueId, userId).autoContinue, String(value));
};

export const writeMultiplayerMatchSpeed = (
  storage: StorageWriter,
  leagueId: string,
  userId: string,
  value: SimulationSpeed,
) => {
  storage.setItem(getMultiplayerMatchPreferenceKeys(leagueId, userId).speed, value);
};

export const getNextMultiplayerMatchPreferences = (
  storage: StorageReader,
  currentKey: string | null,
  leagueId: string | null | undefined,
  userId: string | null | undefined,
): MultiplayerMatchPreferenceSnapshot | null => {
  if (!leagueId || !userId) return null;
  const nextKey = `${leagueId}:${userId}`;
  if (currentKey === nextKey) return null;
  return {
    key: nextKey,
    preferences: readMultiplayerMatchPreferences(storage, leagueId, userId),
  };
};
