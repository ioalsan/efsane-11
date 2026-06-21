import type { CareerHistoryEntry, CareerSave } from './careerMode';
import { getManagerLevel } from './careerMode';

export type AchievementId =
  | 'first-season'
  | 'first-title'
  | 'unbeaten-season'
  | 'hundred-goals'
  | 'derby-king'
  | 'europe-road'
  | 'legend-manager';

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  unlockedAt?: string;
}

export interface ProfileStats {
  userId: string;
  username: string;
  seasonsPlayed: number;
  trophiesWon: number;
  bestLeaguePosition: number | null;
  totalWins: number;
  totalGoals: number;
  careerPoints: number;
  careerLevel: string;
  achievements: Achievement[];
  updatedAt: string;
}

export const ACHIEVEMENT_DEFINITIONS: Record<AchievementId, Omit<Achievement, 'id' | 'unlockedAt'>> = {
  'first-season': {
    title: 'İlk Sezon',
    description: 'İlk kariyer sezonunu tamamla.',
  },
  'first-title': {
    title: 'İlk Şampiyonluk',
    description: 'Lig veya kupa kazan.',
  },
  'unbeaten-season': {
    title: 'Yenilmez Sezon',
    description: 'Ligi mağlubiyet almadan bitir.',
  },
  'hundred-goals': {
    title: '100 Gol',
    description: 'Kariyer toplamında 100 gole ulaş.',
  },
  'derby-king': {
    title: 'Derbi Fatihi',
    description: 'Büyük maçlarda güçlü takımları devir.',
  },
  'europe-road': {
    title: 'Avrupa Yolu',
    description: 'Avrupa kupasında ilerle veya kupa kazan.',
  },
  'legend-manager': {
    title: 'Efsane Teknik Direktör',
    description: 'Efsane menajer seviyesine ulaş.',
  },
};

const PROFILE_STORAGE_KEY = 'canli11:profile:v1';

const now = () => new Date().toISOString();

const buildAchievements = (unlocked: Partial<Record<AchievementId, string>>): Achievement[] => (
  (Object.keys(ACHIEVEMENT_DEFINITIONS) as AchievementId[]).map((id) => ({
    id,
    ...ACHIEVEMENT_DEFINITIONS[id],
    unlockedAt: unlocked[id],
  }))
);

const getUnlockedMap = (profile: ProfileStats | null) => (
  Object.fromEntries(
    (profile?.achievements ?? [])
      .filter((achievement) => achievement.unlockedAt)
      .map((achievement) => [achievement.id, achievement.unlockedAt]),
  ) as Partial<Record<AchievementId, string>>
);

export const createProfile = (userId: string, username: string): ProfileStats => ({
  userId,
  username,
  seasonsPlayed: 0,
  trophiesWon: 0,
  bestLeaguePosition: null,
  totalWins: 0,
  totalGoals: 0,
  careerPoints: 0,
  careerLevel: getManagerLevel(0),
  achievements: buildAchievements({}),
  updatedAt: now(),
});

const isProfileStats = (value: unknown): value is ProfileStats => {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<ProfileStats>;
  return Boolean(profile.userId && profile.username && Array.isArray(profile.achievements));
};

export const loadProfile = (): ProfileStats | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isProfileStats(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveProfile = (profile: ProfileStats) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    ...profile,
    updatedAt: now(),
  }));
};

export const ensureProfile = (userId: string, username: string) => {
  const existing = loadProfile();
  if (existing?.userId === userId) return existing;
  const profile = createProfile(userId, username);
  saveProfile(profile);
  return profile;
};

export const getUnlockedAchievementIds = (profile: ProfileStats) => new Set(
  profile.achievements
    .filter((achievement) => achievement.unlockedAt)
    .map((achievement) => achievement.id),
);

export const updateProfileFromCareerSeason = (
  profile: ProfileStats,
  save: CareerSave,
  summary: CareerHistoryEntry,
) => {
  const unlocked = getUnlockedMap(profile);
  const unlock = (id: AchievementId) => {
    if (!unlocked[id]) unlocked[id] = now();
  };

  unlock('first-season');
  if (summary.trophies.length > 0) unlock('first-title');
  if (summary.losses === 0 && summary.leaguePosition === 1) unlock('unbeaten-season');
  if (profile.totalGoals + summary.goalsFor >= 100) unlock('hundred-goals');
  if (summary.leaguePosition <= 3 && save.club.prestige >= 80) unlock('derby-king');
  if (summary.trophies.includes('Avrupa Kupası') || save.europeStatus === 'won') unlock('europe-road');
  if (getManagerLevel(save.careerPoints) === 'Efsane Teknik Direktör') unlock('legend-manager');

  const nextProfile: ProfileStats = {
    ...profile,
    username: save.managerName,
    seasonsPlayed: profile.seasonsPlayed + 1,
    trophiesWon: profile.trophiesWon + summary.trophies.length,
    bestLeaguePosition: profile.bestLeaguePosition === null
      ? summary.leaguePosition
      : Math.min(profile.bestLeaguePosition, summary.leaguePosition),
    totalWins: profile.totalWins + summary.wins,
    totalGoals: profile.totalGoals + summary.goalsFor,
    careerPoints: save.careerPoints,
    careerLevel: getManagerLevel(save.careerPoints),
    achievements: buildAchievements(unlocked),
    updatedAt: now(),
  };
  saveProfile(nextProfile);
  return nextProfile;
};
