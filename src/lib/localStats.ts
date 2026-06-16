import { Player } from '@/types';
import { FormationType } from './formations';
import { findAnyPlayerById } from './seasonRepository';

export type SavedRunOutcome = 'draft' | 'shared' | 'champion' | 'eliminated';

export interface SavedRun {
  id: string;
  createdAt: string;
  formation: FormationType;
  competitionId?: string;
  rating: number;
  captainId: string | null;
  playerIds: (string | null)[];
  outcome: SavedRunOutcome;
  headline?: string;
}

export interface LeaderboardEntry {
  player: Player;
  count: number;
}

export const STATS_UPDATED_EVENT = 'efsane11:stats-updated';

const STORAGE_KEY = 'efsane11:runs';
const getPlayerById = (id: string) => findAnyPlayerById(id);

const hash = (value: string) => {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = ((result << 5) - result + value.charCodeAt(i)) | 0;
  }
  return Math.abs(result).toString(36);
};

const readRawRuns = (): SavedRun[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedRun[]) : [];
  } catch {
    return [];
  }
};

const writeRawRuns = (runs: SavedRun[]) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, 40)));
    window.dispatchEvent(new Event(STATS_UPDATED_EVENT));
  } catch {
    // Statistics are optional; storage restrictions should not break the game.
  }
};

export const saveTeamSnapshot = (input: Omit<SavedRun, 'id' | 'createdAt'>) => {
  const fingerprint = [
    input.outcome,
    input.formation,
    input.competitionId ?? 'legacy',
    input.captainId ?? 'no-captain',
    input.playerIds.join('|'),
  ].join(':');

  const nextRun: SavedRun = {
    ...input,
    id: hash(fingerprint),
    createdAt: new Date().toISOString(),
  };

  const existing = readRawRuns().filter((run) => run.id !== nextRun.id);
  writeRawRuns([nextRun, ...existing]);
};

export const readSavedRuns = () => readRawRuns();

export const readMostSelectedPlayers = (limit = 5): LeaderboardEntry[] => {
  const counts = new Map<string, number>();

  readRawRuns().forEach((run) => {
    run.playerIds.forEach((id) => {
      if (!id) return;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([id, count]) => {
      const player = getPlayerById(id);
      return player ? { player, count } : null;
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort((a, b) => b.count - a.count || b.player.overall_rating - a.player.overall_rating)
    .slice(0, limit);
};
