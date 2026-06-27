import type { MultiplayerLeague } from './multiplayerService';

export type MultiplayerLeagueListFilter = 'open' | 'active' | 'waiting' | 'completed' | 'mine' | 'all';

export const filterMultiplayerLeagues = (
  leagues: MultiplayerLeague[],
  filter: MultiplayerLeagueListFilter,
  userId?: string | null,
) => leagues
  .filter((league) => league.status !== 'deleted' && !league.deletedAt)
  .filter((league) => {
    if (filter === 'open') return league.status === 'active' || league.status === 'waiting';
    if (filter === 'mine') return league.ownerId === userId;
    if (filter === 'all') return true;
    return league.status === filter;
  })
  .sort((a, b) => {
    const rank = (status: MultiplayerLeague['status']) => status === 'active' ? 0 : status === 'waiting' ? 1 : 2;
    return rank(a.status) - rank(b.status) || b.updatedAt.localeCompare(a.updatedAt);
  });

