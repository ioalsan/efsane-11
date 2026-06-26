export interface DraftSquadOption {
  id: string;
}

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
  const pool = nonRepeatedCandidates.length > 0 ? nonRepeatedCandidates : candidateSquads;
  const pickedSquad = pool[Math.floor(random() * pool.length)] ?? null;

  if (!pickedSquad) return { squad: null, usedTeamIds: normalizedUsedIds };

  return {
    squad: pickedSquad,
    usedTeamIds: cycleStarted
      ? [pickedSquad.id]
      : [...normalizedUsedIds, pickedSquad.id],
  };
};
