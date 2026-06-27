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

const AUTO_CONTINUE_PREFIX = 'canli11:autoContinue';
const MATCH_SPEED_PREFIX = 'canli11:matchSpeed';
const AUTO_SEASON_PREFIX = 'canli11:autoSeason';

export const defaultMultiplayerMatchPreferences: MultiplayerMatchPreferences = {
  autoContinue: false,
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
  return {
    autoContinue: storage.getItem(keys.autoContinue) === 'true',
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
