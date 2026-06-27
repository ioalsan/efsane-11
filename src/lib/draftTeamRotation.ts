export interface DraftSquadOption {
  id: string;
  rating?: number;
}

export type DraftStrengthTier = 'strong' | 'medium' | 'weak';

export interface DraftSquadPick<T extends DraftSquadOption> {
  squad: T | null;
  usedTeamIds: string[];
}

const normalizeUsedTeamIds = <T extends DraftSquadOption>(
  squads: T[],
  usedTeamIds: string[],
) => {
  const availableIds = new Set(squads.map((squad) => squad.id));
  const uniqueIds: string[] = [];
  usedTeamIds.forEach((id) => {
    if (!availableIds.has(id) || uniqueIds.includes(id)) return;
    uniqueIds.push(id);
  });
  return uniqueIds;
};

export const getDraftSeenTeamCount = <T extends DraftSquadOption>(
  squads: T[],
  usedTeamIds: string[],
) => normalizeUsedTeamIds(squads, usedTeamIds).length;

export const getDraftStrengthTier = <T extends DraftSquadOption>(
  squads: T[],
  squad: T,
): DraftStrengthTier => {
  const rated = squads
    .filter((item) => typeof item.rating === 'number')
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const rank = rated.findIndex((item) => item.id === squad.id);
  if (rank < 0 || rated.length < 3) return 'medium';
  const groupSize = Math.ceil(rated.length / 3);
  if (rank < groupSize) return 'strong';
  if (rank >= rated.length - groupSize) return 'weak';
  return 'medium';
};

export const pickNextDraftSquad = <T extends DraftSquadOption>(
  squads: T[],
  usedTeamIds: string[] = [],
  excludedSquadId: string | null = null,
  random = Math.random,
): DraftSquadPick<T> => {
  if (squads.length === 0) return { squad: null, usedTeamIds: [] };

  const normalizedUsedIds = normalizeUsedTeamIds(squads, usedTeamIds);
  const unseenSquads = squads.filter((squad) => !normalizedUsedIds.includes(squad.id));
  const cycleStarted = unseenSquads.length === 0;
  const candidateSquads = cycleStarted ? squads : unseenSquads;
  const nonRepeatedCandidates = candidateSquads.length > 1 && excludedSquadId
    ? candidateSquads.filter((squad) => squad.id !== excludedSquadId)
    : candidateSquads;
  const basePool = nonRepeatedCandidates.length > 0 ? nonRepeatedCandidates : candidateSquads;
  const tierSequence: DraftStrengthTier[] = ['strong', 'weak', 'medium'];
  const targetTier = tierSequence[(cycleStarted ? 0 : normalizedUsedIds.length) % tierSequence.length];
  const tierPool = basePool.filter((squad) => getDraftStrengthTier(squads, squad) === targetTier);
  const pool = tierPool.length > 0 ? tierPool : basePool;
  const pickedSquad = pool[Math.floor(random() * pool.length)] ?? null;

  if (!pickedSquad) return { squad: null, usedTeamIds: normalizedUsedIds };

  return {
    squad: pickedSquad,
    usedTeamIds: cycleStarted
      ? [pickedSquad.id]
      : [...normalizedUsedIds, pickedSquad.id],
  };
};
