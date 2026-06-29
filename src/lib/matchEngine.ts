export type MatchEngineState = 'idle' | 'preparing' | 'running' | 'paused' | 'finished' | 'skipped' | 'completed' | 'error';

export const createMatchSessionId = (
  leagueId: string,
  currentWeek: number,
  matchId: string,
  userId: string,
) => `${leagueId}:${currentWeek}:${matchId}:${userId}`;

export const createMatchCompletionGuard = () => {
  let terminalState: 'completed' | 'skipped' | null = null;
  let duplicateCompletionPrevented = false;
  return {
    complete: () => {
      if (terminalState) {
        duplicateCompletionPrevented = true;
        return false;
      }
      terminalState = 'completed';
      return true;
    },
    skip: () => {
      if (terminalState) return false;
      terminalState = 'skipped';
      return true;
    },
    getState: () => terminalState,
    wasDuplicateCompletionPrevented: () => duplicateCompletionPrevented,
  };
};

