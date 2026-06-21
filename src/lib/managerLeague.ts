import type { CompetitionFixture } from './competitionEngine';
import type { FormationType } from './formations';
import type { ManagerMentality } from './teamManagement';

export type ManagerUserRole = 'guest' | 'user' | 'premium' | 'admin';
export type RosterBuildMode = 'team' | 'draft';
export type DraftRarity = 'common' | 'rare' | 'elite';

export interface ManagerUser {
  id: string;
  username: string;
  email?: string;
  role: ManagerUserRole;
  createdAt: string;
}

export interface TeamSave {
  id: string;
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
  buildMode: RosterBuildMode;
  sourceTeamId?: string;
  prestige: number;
  budget: number;
  boardExpectation: string;
  transferBudget: number;
  wageLevel?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransferListing {
  playerId: string;
  marketValue: number;
  wage?: number;
  askingPrice: number;
  rarity: DraftRarity;
  listedAt: string;
}

export interface ManagerLeagueSave {
  version: 2;
  user: ManagerUser;
  team: TeamSave | null;
  fixtures: CompetitionFixture[][];
  currentWeek: number;
  seasonStarted: boolean;
  latestFixtureId: string | null;
  transferMarket: TransferListing[];
  createdAt: string;
  updatedAt: string;
}

export interface ManagerLeagueLoadResult {
  save: ManagerLeagueSave | null;
  migrated: boolean;
}

export const MANAGER_TEAM_ID = 'canli11-manager-team';
export const MANAGER_LEAGUE_STORAGE_KEY = 'canli11:manager-league:v2';

const LEGACY_MANAGER_LEAGUE_STORAGE_KEYS = [
  'canli11:manager-league:v1',
];

const now = () => new Date().toISOString();

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clearLegacySaves = () => {
  if (typeof window === 'undefined') return false;
  let hadLegacy = false;
  LEGACY_MANAGER_LEAGUE_STORAGE_KEYS.forEach((key) => {
    if (window.localStorage.getItem(key)) {
      hadLegacy = true;
      window.localStorage.removeItem(key);
    }
  });
  return hadLegacy;
};

export const createManagerUser = (
  username: string,
  role: ManagerUserRole = 'guest',
): ManagerUser => ({
  id: createId(role),
  username: username.trim().slice(0, 24) || (role === 'guest' ? 'Misafir Menajer' : 'Demo Menajer'),
  role,
  createdAt: now(),
});

export const createEmptyManagerLeague = (user: ManagerUser): ManagerLeagueSave => ({
  version: 2,
  user,
  team: null,
  fixtures: [],
  currentWeek: 0,
  seasonStarted: false,
  latestFixtureId: null,
  transferMarket: [],
  createdAt: now(),
  updatedAt: now(),
});

export const createTeamSave = ({
  ownerId,
  teamName,
  formation,
  tactic,
  captainId,
  startingXI,
  substitutes,
  reserves,
  buildMode,
  sourceTeamId,
  prestige,
  budget,
  boardExpectation,
  transferBudget,
  wageLevel,
}: {
  ownerId: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
  buildMode: RosterBuildMode;
  sourceTeamId?: string;
  prestige: number;
  budget: number;
  boardExpectation: string;
  transferBudget: number;
  wageLevel?: number;
}): TeamSave => ({
  id: createId('team'),
  ownerId,
  teamName: teamName.trim().slice(0, 32) || 'Canlı11 FC',
  formation,
  tactic,
  captainId,
  startingXI: startingXI.slice(0, 11),
  substitutes: substitutes.slice(0, 7),
  reserves: reserves.slice(0, 5),
  buildMode,
  sourceTeamId,
  prestige: clampNumber(Math.round(prestige), 1, 100),
  budget: Math.max(0, Math.round(budget)),
  boardExpectation: boardExpectation.trim() || 'Orta sıra hedefi',
  transferBudget: Math.max(0, Math.round(transferBudget)),
  wageLevel: wageLevel === undefined ? undefined : Math.max(0, Math.round(wageLevel)),
  createdAt: now(),
  updatedAt: now(),
});

const isManagerLeagueSave = (value: unknown): value is ManagerLeagueSave => {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Partial<ManagerLeagueSave>;
  return (
    parsed.version === 2 &&
    Boolean(parsed.user) &&
    typeof parsed.currentWeek === 'number' &&
    Array.isArray(parsed.fixtures) &&
    Array.isArray(parsed.transferMarket)
  );
};

export const saveManagerLeague = (save: ManagerLeagueSave) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MANAGER_LEAGUE_STORAGE_KEY, JSON.stringify({
    ...save,
    updatedAt: now(),
  }));
};

export const loadManagerLeague = (): ManagerLeagueLoadResult => {
  if (typeof window === 'undefined') return { save: null, migrated: false };
  const migrated = clearLegacySaves();

  try {
    const raw = window.localStorage.getItem(MANAGER_LEAGUE_STORAGE_KEY);
    if (!raw) return { save: null, migrated };
    const parsed = JSON.parse(raw) as unknown;
    if (!isManagerLeagueSave(parsed)) {
      window.localStorage.removeItem(MANAGER_LEAGUE_STORAGE_KEY);
      return { save: null, migrated: true };
    }
    return { save: parsed, migrated };
  } catch {
    window.localStorage.removeItem(MANAGER_LEAGUE_STORAGE_KEY);
    return { save: null, migrated: true };
  }
};

export const resetManagerLeague = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MANAGER_LEAGUE_STORAGE_KEY);
  LEGACY_MANAGER_LEAGUE_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
};
