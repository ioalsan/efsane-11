'use client';

import { Player } from '@/types';
import { useTeamStore } from '@/store/useTeamStore';
import { FORMATIONS, PositionConfig } from '@/lib/formations';
import { Crown } from 'lucide-react';

interface DroppableSlotProps {
  index: number;
  player: Player | null;
  allowedPosition: string;
}

const canPlayAt = (candidate: Player, position?: string) => Boolean(
  position && (candidate.compatiblePositions ?? [
    candidate.position,
    ...(candidate.secondary_position ? [candidate.secondary_position] : []),
  ]).includes(position as Player['position']),
);

export default function DroppableSlot({ index, player, allowedPosition }: DroppableSlotProps) {
  const placePlayer = useTeamStore((state) => state.placePlayer);
  const activePlayerToPlace = useTeamStore((state) => state.activePlayerToPlace);
  const sourceSlotIndex = useTeamStore((state) => state.sourceSlotIndex);
  const setActivePlayerToPlace = useTeamStore((state) => state.setActivePlayerToPlace);
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const formationId = useTeamStore((state) => state.formation);
  const captainId = useTeamStore((state) => state.captainId);
  
  const blindMode = useTeamStore(state => state.blindMode);
  const isTeamFull = selectedPlayers.filter(p => p !== null).length === 11;

  const showRating = !blindMode || isTeamFull;
  const isSlotFull = player !== null;
  const isCaptain = player?.id === captainId;

  const handleSlotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activePlayerToPlace) {
      const canActivePlayHere = canPlayAt(activePlayerToPlace, allowedPosition);
      if (!canActivePlayHere) return;
      if (sourceSlotIndex === null && isSlotFull) return;
      if (sourceSlotIndex !== null && isSlotFull) {
        const currentFormation = FORMATIONS.find(f => f.id === formationId);
        const sourceAllowedPos = currentFormation?.positions.find((p: PositionConfig) => p.index === sourceSlotIndex)?.allowedPosition;
        const canTargetPlayAtSource = canPlayAt(player, sourceAllowedPos);
        if (!canTargetPlayAtSource) return;
      }
      const shouldReturnToDraft = sourceSlotIndex === null;
      placePlayer(activePlayerToPlace, index);
      if (shouldReturnToDraft && window.matchMedia('(max-width: 1023px)').matches) {
        window.setTimeout(() => {
          document.getElementById('player-draft-panel')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 180);
      }
    } else if (isSlotFull) {
      setActivePlayerToPlace(player, index);
    }
  };

  const currentPlayerInHand = activePlayerToPlace;
  let isValidTarget = false;
  if (currentPlayerInHand) {
    const canActivePlayHere = canPlayAt(currentPlayerInHand, allowedPosition);
    if (canActivePlayHere) {
      if (sourceSlotIndex === null) {
        isValidTarget = !isSlotFull;
      } else {
        if (!isSlotFull) {
           isValidTarget = true;
        } else {
           const currentFormation = FORMATIONS.find(f => f.id === formationId);
           const sourceAllowedPos = currentFormation?.positions.find((p: PositionConfig) => p.index === sourceSlotIndex)?.allowedPosition;
           isValidTarget = canPlayAt(player, sourceAllowedPos);
        }
      }
    }
  }

  return (
    <div
      onClick={handleSlotClick}
      className={`relative w-16 h-16 sm:w-18 sm:h-18 transition-all flex items-center justify-center
        ${sourceSlotIndex === index ? 'z-30' : 'z-10'}
        ${isSlotFull ? '' : 'border-2 border-dashed border-white/20'}
      `}
    >
      {player ? (
        <div key={player.id} className={`player-card player-card-pop ${isCaptain ? 'is-captain' : ''} w-full h-full border-2 border-black flex flex-col items-center justify-center shadow-[2px_2px_0px_0px_#000] relative
          ${sourceSlotIndex === index ? 'border-yellow-400 shadow-[4px_4px_0px_0px_#eab308] translate-y-[-2px]' : ''}
          ${isValidTarget ? 'border-yellow-400 bg-yellow-400/20 cursor-pointer scale-110' : ''}
        `}>
          <div className="card-scan-line" />
          {isCaptain && (
            <div className="captain-crown-pulse absolute -top-3 -left-3 grid h-6 w-6 place-items-center border border-black bg-yellow-500 text-black shadow-[1px_1px_0px_0px_#000]">
              <Crown size={13} fill="currentColor" />
            </div>
          )}
          <div className="text-xl font-black text-white">{player.jersey_number}</div>
          <div className="absolute -bottom-7 bg-black text-[9px] font-black uppercase px-2 py-0.5 border border-zinc-700 whitespace-nowrap text-white">
            {player.name}
          </div>
          <div className="card-rating-badge absolute -top-3 -right-3 flex h-6 w-6 items-center justify-center border border-black text-[10px] font-black shadow-[1px_1px_0px_0px_#000]">
            {showRating ? player.overall_rating : '?'}
          </div>
        </div>
      ) : (
        <div className={`w-full h-full flex flex-col items-center justify-center transition-all
          ${isValidTarget ? 'bg-yellow-400/30 border-2 border-yellow-400 scale-110 cursor-pointer shadow-[0_0_15px_#eab308]' : 'hover:bg-white/5'}
          ${currentPlayerInHand && !isValidTarget ? 'opacity-20' : ''}
        `}>
          <span className="text-[10px] font-black text-white/40">{allowedPosition}</span>
        </div>
      )}
    </div>
  );
}
