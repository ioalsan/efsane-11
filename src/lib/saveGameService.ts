import type { CareerSave } from './careerMode';
import type { ManagerLeagueSave } from './managerLeague';
import type { Achievement, ProfileStats } from './profileService';

export interface SaveGame {
  userId: string;
  activeMode: 'quick' | 'manager' | 'career';
  careerSave: CareerSave | null;
  managerLeagueSave: ManagerLeagueSave | null;
  achievements: Achievement[];
  profileStats: ProfileStats | null;
  updatedAt: string;
}

const SAVE_GAME_STORAGE_KEY = 'canli11:save-game:v1';

const now = () => new Date().toISOString();

const isSaveGame = (value: unknown): value is SaveGame => {
  if (!value || typeof value !== 'object') return false;
  const save = value as Partial<SaveGame>;
  return Boolean(save.userId && save.activeMode && Array.isArray(save.achievements));
};

export const loadSaveGame = (): SaveGame | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_GAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSaveGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveSaveGame = (save: SaveGame) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVE_GAME_STORAGE_KEY, JSON.stringify({
    ...save,
    updatedAt: now(),
  }));
};

export const upsertSaveGame = ({
  userId,
  activeMode,
  careerSave,
  managerLeagueSave,
  profileStats,
}: {
  userId: string;
  activeMode: SaveGame['activeMode'];
  careerSave?: CareerSave | null;
  managerLeagueSave?: ManagerLeagueSave | null;
  profileStats?: ProfileStats | null;
}) => {
  const current = loadSaveGame();
  const next: SaveGame = {
    userId,
    activeMode,
    careerSave: careerSave === undefined ? current?.careerSave ?? null : careerSave,
    managerLeagueSave: managerLeagueSave === undefined ? current?.managerLeagueSave ?? null : managerLeagueSave,
    profileStats: profileStats === undefined ? current?.profileStats ?? null : profileStats,
    achievements: profileStats?.achievements ?? current?.achievements ?? [],
    updatedAt: now(),
  };
  saveSaveGame(next);
  return next;
};
