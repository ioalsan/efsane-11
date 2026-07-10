'use client';

import { Player } from '@/types';
import { useTeamStore } from '@/store/useTeamStore';
import { showGameShellPanel } from './GameShell';
import { getPlayerDisplayStats } from './PlayerStatBars';

interface DraggablePlayerProps {
  player: Player;
}

export default function DraggablePlayer({ player }: DraggablePlayerProps) {
  const activePlayerToPlace = useTeamStore(state => state.activePlayerToPlace);
  const setActivePlayerToPlace = useTeamStore(state => state.setActivePlayerToPlace);
  const blindMode = useTeamStore(state => state.blindMode);
  const isTeamFull = useTeamStore(state => state.selectedPlayers.filter(p => p !== null).length === 11);
  const theme = useTeamStore(state => state.theme);

  const isDark = theme === 'dark';
  const isSelectedForClickPlace = activePlayerToPlace?.id === player.id;
  const showRating = !blindMode || isTeamFull;
  const positionLabel = [
    player.primaryPosition,
    ...(player.secondaryPositions ?? []),
  ].filter(Boolean).join('/') || [
    player.position,
    player.secondary_position,
  ].filter(Boolean).join('/');
  const compactStats = getPlayerDisplayStats(player).filter((stat) => ['HIZ', 'PAS', 'DEF'].includes(stat.shortLabel));

  const handleClick = () => {
    if (isSelectedForClickPlace) {
      setActivePlayerToPlace(null);
    } else {
      setActivePlayerToPlace(player);
      if (window.matchMedia('(max-width: 1023px)').matches) {
        showGameShellPanel('center');
      }
    }
  };

  const positionTone =
    player.position === 'KL' ? 'text-yellow-500' :
    ['STP', 'SLB', 'SĞB', 'DOS'].includes(player.position) ? 'text-blue-400' :
    ['MO', 'OOS'].includes(player.position) ? 'text-green-400' :
    'text-red-400';

  return (
    <div
      onClick={handleClick}
      className={`player-card relative grid min-h-14 grid-cols-[2.4rem_minmax(0,1fr)_auto_2.2rem] items-start gap-2 border-b border-black/25 px-2 py-2 transition-all cursor-pointer select-none
        ${isSelectedForClickPlace
          ? 'player-card-selected text-yellow-100 outline outline-2 outline-yellow-500 -outline-offset-2'
          : (isDark ? 'hover:brightness-110' : 'hover:brightness-105')
        }
      `}
      title={player.name}
    >
      <div className="card-scan-line" />
      <div className="text-sm font-black tabular-nums text-white/65">
        #{player.jersey_number}
      </div>
      <div className="min-w-0">
        <h3
          className="min-w-0 whitespace-normal break-words text-[13px] font-black leading-tight text-white"
          style={{ overflowWrap: 'anywhere' }}
        >
          {player.name}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[8px] font-black uppercase text-white/45">
          {compactStats.map((stat) => <span key={stat.shortLabel}>{stat.shortLabel} {stat.value}</span>)}
        </p>
      </div>
      <div className={`text-[10px] font-black uppercase tracking-tight whitespace-nowrap ${positionTone}`}>
        {positionLabel}
      </div>
      <div className="text-right text-2xl font-black leading-none text-yellow-500 tabular-nums">
        {showRating ? player.overall_rating : '??'}
      </div>
    </div>
  );
}
