'use client';

import type { ReactNode } from 'react';
import DroppableSlot from './DroppableSlot';
import { useTeamStore } from '@/store/useTeamStore';
import { FORMATIONS, FormationType, PositionConfig } from '@/lib/formations';
import type { Player } from '@/types';

interface PitchProps {
  elementId?: string;
  previewFormationId?: FormationType | null;
  controlled?: {
    selectedPlayers: (Player | null)[];
    teamRating: number | string;
    formationId: FormationType;
    squadName: string;
    blindMode?: boolean;
    renderSlot: (position: PositionConfig, player: Player | null) => ReactNode;
  };
}

export default function Pitch({ elementId = 'pitch-container', previewFormationId = null, controlled }: PitchProps) {
  const storeSelectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const storeTeamRating = useTeamStore((state) => state.teamRating);
  const storedFormationId = useTeamStore((state) => state.formation);
  const storeBlindMode = useTeamStore(state => state.blindMode);
  const theme = useTeamStore(state => state.theme);
  const storeSquadName = useTeamStore(state => state.squadName);
  
  const isDark = theme === 'dark';
  const selectedPlayers = controlled?.selectedPlayers ?? storeSelectedPlayers;
  const teamRating = controlled?.teamRating ?? storeTeamRating;
  const blindMode = controlled?.blindMode ?? storeBlindMode;
  const squadName = controlled?.squadName ?? storeSquadName;
  const currentFormationId = controlled?.formationId ?? previewFormationId ?? storedFormationId ?? '4-3-3';
  const currentFormation = FORMATIONS.find(f => f.id === currentFormationId) || FORMATIONS[1];

  const totalSelected = selectedPlayers.filter(p => p !== null).length;

  return (
    <div id={elementId} className={`relative w-full max-w-[720px] min-h-[460px] scroll-mt-24 aspect-[3/4] sm:min-h-[560px] sm:aspect-[4/5] xl:min-h-[640px] mx-auto border-2 border-zinc-800 transition-colors duration-300 ${isDark ? 'bg-[#2d4d3a]' : 'bg-[#4a8a5e]'}`}>
      
      {/* Basitleştirilmiş Saha Çizgileri (7a0 Stili) */}
      <div className="absolute top-0 left-0 w-full h-full p-4">
        <div className="w-full h-full border border-white/30 relative">
           {/* Ceza Sahaları */}
           <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-x border-b border-white/30"></div>
           <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-x border-t border-white/30"></div>
           
           {/* Orta Yuvarlak */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-white/30 rounded-full"></div>
           <div className="absolute top-1/2 left-0 w-full h-px bg-white/30 -translate-y-1/2"></div>
        </div>
      </div>

      {/* Info Panelleri (Neo-Brutalist minimalist) */}
      <div className="absolute top-6 left-6 z-10 text-white font-mono flex flex-col gap-1">
        <div className="max-w-44 truncate text-sm font-black uppercase tracking-tight">{squadName || 'Efsane 11'}</div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">Team Rating</div>
        <div className="text-4xl font-black">{blindMode && totalSelected < 11 ? '??' : teamRating}</div>
      </div>

      <div className="absolute top-6 right-6 z-10 text-white font-mono text-right flex flex-col gap-1">
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">Squad</div>
        <div className="text-xl font-black">{totalSelected}/11</div>
      </div>

      {/* Taktik Tahtası (Dinamik Render) */}
      <div className="relative z-10 w-full h-full">
        {currentFormation.positions.map((pos: PositionConfig) => (
          <div key={pos.index} style={pos.style}>
            {controlled ? (
              controlled.renderSlot(pos, selectedPlayers[pos.index] ?? null)
            ) : (
              <DroppableSlot
                index={pos.index}
                player={selectedPlayers[pos.index]}
                allowedPosition={pos.allowedPosition}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
