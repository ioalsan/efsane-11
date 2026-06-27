import type { WeekUserProgress } from './multiplayerService';

export const getCurrentUserWatchProgress = (
  progressEntries: WeekUserProgress[],
  userId: string | null | undefined,
) => {
  if (!userId) return null;
  return progressEntries.find((progress) => (
    progress.userId === userId
    && (progress.status === 'pending' || progress.status === 'watching')
  )) ?? null;
};

export const shouldAutoAdvanceInviteWeek = ({
  autoContinue,
  isOwner,
  currentWeekGenerated,
  currentWeekReadyToAdvance,
  hasLiveFixture,
}: {
  autoContinue: boolean;
  isOwner: boolean;
  currentWeekGenerated: boolean;
  currentWeekReadyToAdvance: boolean;
  hasLiveFixture: boolean;
}) => (
  autoContinue
  && isOwner
  && currentWeekGenerated
  && currentWeekReadyToAdvance
  && !hasLiveFixture
);

