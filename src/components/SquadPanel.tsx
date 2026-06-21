'use client';

import { Crown, PencilLine, X } from 'lucide-react';
import { FORMATIONS } from '@/lib/formations';
import { useTeamStore } from '@/store/useTeamStore';
import { getCaptainRole } from '@/lib/captain';
import { getSquadManagementSummary, getTacticProfile } from '@/lib/teamManagement';
import LeaderboardPanel from './LeaderboardPanel';
import AdSlot from './AdSlot';

export default function SquadPanel() {
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const formationId = useTeamStore((state) => state.formation) || '4-3-3';
  const teamRating = useTeamStore((state) => state.teamRating);
  const blindMode = useTeamStore((state) => state.blindMode);
  const theme = useTeamStore((state) => state.theme);
  const removePlayer = useTeamStore((state) => state.removePlayer);
  const setActivePlayerToPlace = useTeamStore((state) => state.setActivePlayerToPlace);
  const captainId = useTeamStore((state) => state.captainId);
  const mentality = useTeamStore((state) => state.mentality);
  const setCaptain = useTeamStore((state) => state.setCaptain);
  const squadName = useTeamStore((state) => state.squadName);
  const setSquadName = useTeamStore((state) => state.setSquadName);

  const isDark = theme === 'dark';
  const totalSelected = selectedPlayers.filter((player) => player !== null).length;
  const currentFormation = FORMATIONS.find((formation) => formation.id === formationId) || FORMATIONS[1];
  const showRating = !blindMode || totalSelected === 11;
  const captain = selectedPlayers.find((player) => player?.id === captainId) ?? null;
  const captainRole = getCaptainRole(captain);
  const managementSummary = getSquadManagementSummary({
    selectedPlayers,
    formationId,
    captainId,
    mentality,
  });
  const tacticProfile = getTacticProfile(mentality);

  return (
    <aside className={`w-full lg:w-80 xl:w-96 flex flex-col h-full border-l-2 border-black transition-colors duration-300 ${isDark ? 'bg-zinc-950/80' : 'bg-zinc-50'}`}>
      <div className="relative p-6 border-b-2 border-black bg-black/10 flex items-start justify-between gap-4">
        {captain && captainRole && (
          <div key={captain.id} className="captain-bonus-toast pointer-events-none absolute left-5 right-5 top-3 z-20 border-2 border-black bg-yellow-500 px-4 py-3 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase">{captain.name}</p>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{captainRole.title}</p>
              </div>
              <div className="text-3xl font-black leading-none">+{captainRole.bonus}</div>
            </div>
          </div>
        )}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-50">Mevcut Kadro</p>
          <h2 className="text-xl font-black italic uppercase tracking-tighter mt-1">{squadName || 'Efsane 11'}</h2>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-45">{formationId}</p>
          {captain ? (
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-500">
              Kaptan: {captain.name} / {captainRole?.title}
            </p>
          ) : (
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
              Kaptan secimi zorunlu
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-black uppercase tracking-widest opacity-50">{totalSelected}/11</div>
          <div className="text-4xl font-black leading-none">{blindMode && totalSelected < 11 ? '??' : teamRating}</div>
        </div>
      </div>

      <div className="space-y-4 border-b-2 border-black/20 p-5">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
            <PencilLine size={14} className="text-yellow-500" />
            Kadro Adi
          </span>
          <input
            value={squadName}
            onChange={(event) => setSquadName(event.target.value)}
            maxLength={32}
            className={`w-full border-2 border-black px-3 py-3 text-sm font-black uppercase outline-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}
            placeholder="Efsane 11"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <MiniGauge label="Kadro Gücü" value={managementSummary.power} tone="yellow" />
          <MiniGauge label="Kimya" value={managementSummary.chemistry} tone="green" />
        </div>

        <div className={`border-2 border-black p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-500">Teknik Plan</p>
              <p className="mt-1 text-sm font-black uppercase">{tacticProfile.label}</p>
            </div>
            <span className="border border-black bg-yellow-400 px-2 py-1 text-[9px] font-black uppercase text-black">
              {managementSummary.chemistryLabel}
            </span>
          </div>
          <p className="mt-2 text-[10px] font-bold leading-relaxed opacity-60">{managementSummary.tacticalAdvice}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <SquadAnalysis title="Güçlü" items={managementSummary.strengths} tone="green" />
          <SquadAnalysis title="Gelişecek" items={managementSummary.weaknesses} tone="red" />
        </div>
      </div>

      <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
        <span>Slot</span>
        <span>Oyuncu</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3">
        {currentFormation.positions.map((slot) => {
          const player = selectedPlayers[slot.index];

          return (
            <div
              key={slot.index}
              onClick={() => player && setActivePlayerToPlace(player, slot.index)}
              onKeyDown={(event) => {
                if (player && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  setActivePlayerToPlace(player, slot.index);
                }
              }}
              role={player ? 'button' : undefined}
              tabIndex={player ? 0 : undefined}
              className={`group w-full min-h-14 grid grid-cols-[3.25rem_1fr_5rem] items-center gap-3 border-b border-black/10 text-left transition-colors ${player ? 'cursor-pointer hover:bg-yellow-500/10' : 'cursor-default opacity-50'}`}
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">{slot.allowedPosition}</span>
              {player ? (
                <span className="min-w-0">
                  <span className="block text-sm font-black uppercase truncate">{player.name}</span>
                  <span className="block text-[10px] font-bold opacity-45">
                    #{player.jersey_number} / {[player.primaryPosition, ...(player.secondaryPositions ?? [])].filter(Boolean).join('/') || [player.position, player.secondary_position].filter(Boolean).join('/')}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-black uppercase opacity-40">Bos</span>
              )}

              {player ? (
                <span className="flex items-center justify-end gap-1.5">
                  <span className="text-sm font-black text-red-500">{showRating ? player.overall_rating : '??'}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCaptain(player.id);
                    }}
                    className={`grid h-6 w-6 place-items-center border border-black transition-colors ${
                      captainId === player.id ? 'captain-crown-pulse bg-yellow-500 text-black' : 'bg-black text-yellow-500 opacity-0 group-hover:opacity-100'
                    }`}
                    aria-label={captainId === player.id ? `${player.name} kaptan secildi` : `${player.name} kaptan yap`}
                    title={captainId === player.id ? 'Kaptan secildi' : 'Kaptan yap'}
                  >
                    <Crown size={13} fill={captainId === player.id ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removePlayer(slot.index);
                    }}
                    className="grid h-6 w-6 place-items-center border border-black bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`${player.name} kaldir`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ) : (
                <span className="text-right text-xs font-black opacity-30">-</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-6 border-t-2 border-black bg-black/5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45 leading-relaxed">
          Oyuncuya tıkla, sahada uygun başka bir slota taşıyabilir ya da değiştirebilirsin. {captain ? 'Kaptanı değiştirmek için taç ikonuna bas.' : 'Kadron tamamlandıysa devam etmek için kaptan seçmelisin.'}
        </p>
      </div>
      <LeaderboardPanel />
      <AdSlot placement="right-panel" className="hidden shrink-0 lg:block" />
    </aside>
  );
}

function MiniGauge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'yellow' | 'green';
}) {
  const fillClass = tone === 'green' ? 'bg-green-500' : 'bg-yellow-400';
  return (
    <div className="border-2 border-black bg-black p-3 text-white">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/50">{label}</span>
        <span className="text-lg font-black">{value}</span>
      </div>
      <div className="h-2 overflow-hidden border border-white/15 bg-white/10">
        <div className={`h-full ${fillClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function SquadAnalysis({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'green' | 'red';
}) {
  return (
    <div className={`border-2 border-black p-3 ${tone === 'green' ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
      <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${tone === 'green' ? 'text-green-500' : 'text-red-500'}`}>{title}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <p key={item} className="text-[10px] font-black uppercase opacity-70">{item}</p>
        ))}
      </div>
    </div>
  );
}
