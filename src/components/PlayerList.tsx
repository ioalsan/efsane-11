'use client';

import { useCallback, useEffect, useState } from 'react';
import DraggablePlayer from './DraggablePlayer';
import { useTeamStore } from '@/store/useTeamStore';
import { Crown, Dices } from 'lucide-react';
import { FORMATIONS, PositionConfig } from '@/lib/formations';
import { getCompetitionSquads } from '@/lib/seasonRepository';
import AdSlot from './AdSlot';

interface PlayerListProps {
  side?: 'left' | 'right';
}

export default function PlayerList({ side = 'right' }: PlayerListProps) {
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const rolledSquad = useTeamStore((state) => state.rolledSquad);
  const rollSquad = useTeamStore((state) => state.rollSquad);
  const rollTeam = useTeamStore((state) => state.rollTeam);
  const rollYear = useTeamStore((state) => state.rollYear);
  const rerollsLeft = useTeamStore((state) => state.rerollsLeft);
  const formationId = useTeamStore((state) => state.formation);
  const theme = useTeamStore((state) => state.theme);
  const needsNextRoll = useTeamStore((state) => state.needsNextRoll);
  const setNeedsNextRoll = useTeamStore((state) => state.setNeedsNextRoll);
  const autoRoll = useTeamStore((state) => state.autoRoll);
  const toggleAutoRoll = useTeamStore((state) => state.toggleAutoRoll);
  const captainId = useTeamStore((state) => state.captainId);
  const setCaptain = useTeamStore((state) => state.setCaptain);
  const competitionId = useTeamStore((state) => state.competitionId);

  const isDark = theme === 'dark';
  const [rollingName, setRollingName] = useState<string | null>(null);

  const executeRollAnimation = useCallback((action: () => void) => {
    if (rollingName) return;
    const competitionSquads = getCompetitionSquads(competitionId);
    if (competitionSquads.length === 0) return;
    let ticks = 0;
    const interval = setInterval(() => {
      const randomSquad = competitionSquads[Math.floor(Math.random() * competitionSquads.length)];
      setRollingName(`${randomSquad.teamName} ${randomSquad.year.substring(0,4)}`);
      ticks++;
      if (ticks > 12) {
        clearInterval(interval);
        setRollingName(null);
        action();
      }
    }, 100);
  }, [competitionId, rollingName]);

  useEffect(() => {
    if (needsNextRoll) {
      setNeedsNextRoll(false);
      executeRollAnimation(rollSquad);
    }
  }, [executeRollAnimation, needsNextRoll, rollSquad, setNeedsNextRoll]);

  const totalSelected = selectedPlayers.filter(p => p !== null).length;
  const isTeamFull = totalSelected === 11;
  const selectedSquadPlayers = selectedPlayers.filter((player) => player !== null);
  const captain = selectedSquadPlayers.find((player) => player.id === captainId) ?? null;
  const bestCaptain = selectedSquadPlayers
    .slice()
    .sort((a, b) => b.overall_rating - a.overall_rating)[0] ?? null;
  const borderClass = side === 'left' ? 'border-r-2' : 'border-l-2';

  if (isTeamFull) {
    return (
      <div id="player-draft-panel" className={`w-full scroll-mt-24 lg:w-80 xl:w-96 flex flex-col h-full ${borderClass} border-black transition-colors duration-300 ${isDark ? 'bg-zinc-900/50' : 'bg-white'}`}>
        <div className="border-b-2 border-black bg-yellow-500 p-6 text-black">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-65">Son Adim</p>
              <h2 className="mt-1 text-3xl font-black italic uppercase tracking-tighter">Kaptan Sec</h2>
            </div>
            <div className="grid h-14 w-14 place-items-center border-2 border-black bg-black text-yellow-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Crown size={30} fill="currentColor" />
            </div>
          </div>
          <p className="mt-4 text-xs font-black uppercase leading-relaxed opacity-75">
            Kadron tamamlandı. Maça başlamadan önce kaptanını seç. Devam etmek için kaptan seçmelisin.
          </p>
          {!captain && bestCaptain && (
            <button
              type="button"
              onClick={() => setCaptain(bestCaptain.id)}
              className="game-button mt-4 w-full border-2 border-black bg-black px-4 py-3 text-xs font-black uppercase text-yellow-500 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            >
              En yüksek ratingli oyuncuyu kaptan yap
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {selectedSquadPlayers.map((player) => {
              const isCaptain = player.id === captainId;

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setCaptain(player.id)}
                  className={`game-button w-full border-2 border-black p-4 text-left transition-all ${
                    isCaptain
                      ? 'game-button-selected bg-yellow-500 text-black'
                      : isDark
                        ? 'bg-zinc-950 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-800'
                        : 'bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-100'
                  }`}
                  aria-pressed={isCaptain}
                >
                  <span className="flex items-center justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-black uppercase">{player.name}</span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.18em] opacity-55">
                        #{player.jersey_number} / {[player.primaryPosition, ...(player.secondaryPositions ?? [])].filter(Boolean).join('/') || player.position}
                      </span>
                    </span>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center border-2 border-black ${
                      isCaptain ? 'captain-crown-pulse bg-black text-yellow-500' : 'bg-yellow-500 text-black'
                    }`}>
                      <Crown size={20} fill={isCaptain ? 'currentColor' : 'none'} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`border-t-2 border-black p-5 ${captain ? 'bg-green-600 text-white' : 'bg-black text-yellow-500'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
            {captain ? 'Kaptan hazir' : 'Kaptan bekleniyor'}
          </p>
          <p className="mt-1 truncate text-xl font-black uppercase italic">
            {captain ? captain.name : 'Bir oyuncu sec'}
          </p>
        </div>
        <AdSlot placement="left-panel" className="hidden shrink-0 lg:block" />
      </div>
    );
  }

  const currentFormation = FORMATIONS.find(f => f.id === formationId);
  const emptySlotPositions = currentFormation?.positions
    .filter((pos: PositionConfig) => selectedPlayers[pos.index] === null)
    .map((p: PositionConfig) => p.allowedPosition) || [];

  const draftList = rolledSquad?.players.map(player => {
    const isAlreadyOnPitch = selectedPlayers.some(sp => sp?.id === player.id);
    const compatiblePositions = player.compatiblePositions ?? [
      player.position,
      ...(player.secondary_position ? [player.secondary_position] : []),
    ];
    const canBePlaced = compatiblePositions.some((position) => emptySlotPositions.includes(position));
    return { ...player, isAlreadyOnPitch, isLocked: !canBePlaced && !isAlreadyOnPitch };
  }) || [];

  const availablePlayers = draftList.filter(p => !p.isAlreadyOnPitch);

  return (
    <div id="player-draft-panel" className={`w-full scroll-mt-24 lg:w-80 xl:w-96 flex flex-col h-full ${borderClass} border-black transition-colors duration-300 ${isDark ? 'bg-zinc-900/50' : 'bg-white'}`}>
      <div className="p-6 border-b-2 border-black bg-black/10 flex justify-between items-center gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-45">Draft Paneli</p>
          <h2 className="font-black uppercase tracking-widest text-base italic mt-1">Kadro Seçimi</h2>
        </div>
        <span className="text-sm font-black bg-black text-white px-3 py-1.5">{totalSelected}/11</span>
      </div>

      <div className="px-5 py-4 border-b-2 border-black bg-black/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Dices size={16} className="text-yellow-500" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Zar Akışı</p>
            <p className="text-xs font-black opacity-75 mt-0.5">{autoRoll ? 'Otomatik' : 'Manuel'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 border-2 border-black bg-black text-[10px] font-black uppercase tracking-widest">
          <button
            onClick={() => autoRoll && toggleAutoRoll()}
            className={`game-button px-3 py-2 transition-colors ${!autoRoll ? 'bg-yellow-500 text-black' : 'text-white/55 hover:text-white'}`}
            aria-pressed={!autoRoll}
          >
            Manuel
          </button>
          <button
            onClick={() => !autoRoll && toggleAutoRoll()}
            className={`game-button px-3 py-2 transition-colors ${autoRoll ? 'bg-yellow-500 text-black' : 'text-white/55 hover:text-white'}`}
            aria-pressed={autoRoll}
          >
            Oto
          </button>
        </div>
      </div>

      {rolledSquad && !rollingName && !isTeamFull && (
        <div className={`p-5 border-b-2 border-black ${isDark ? 'bg-[#201a08]' : 'bg-yellow-50'}`}>
           <div className="flex gap-3 relative pt-3">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase bg-black text-yellow-500 px-3 py-0.5 border border-yellow-500/40">
                {rerollsLeft} re-roll kaldı
              </div>
              <button onClick={() => executeRollAnimation(rollTeam)} disabled={rerollsLeft <= 0}
                className="game-button flex-1 border-2 border-black bg-zinc-900 text-yellow-400 text-[11px] font-black uppercase py-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:grayscale hover:bg-black">
                Takım
              </button>
              <button onClick={() => executeRollAnimation(rollYear)} disabled={rerollsLeft <= 0}
                className="game-button flex-1 border-2 border-black bg-zinc-900 text-yellow-400 text-[11px] font-black uppercase py-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:grayscale hover:bg-black">
                Sezon
              </button>
           </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {rollingName ? (
           <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <Dices size={48} className="mb-4 animate-spin text-yellow-500" />
              <h3 className="text-2xl font-black italic tracking-tighter uppercase">{rollingName}</h3>
              <p className="text-[10px] font-bold opacity-40 mt-2">SCOUTING...</p>
           </div>
        ) : rolledSquad ? (
          <>
            <div className="mb-3 p-4 border-2 border-black bg-yellow-500 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
               <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-65">Gelen Kadro</p>
               <h3 className="text-2xl font-black italic leading-none my-1.5 tracking-tighter">{rolledSquad.teamName}</h3>
               <p className="text-sm font-black opacity-80">{rolledSquad.year}</p>
            </div>
            <div className="overflow-hidden border-2 border-black bg-black/20 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto_2.4rem] gap-2 border-b-2 border-black bg-zinc-950 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/55">
                <span>#</span>
                <span>Oyuncu Adı</span>
                <span>Mevki</span>
                <span className="text-right">Rating</span>
              </div>
              {availablePlayers.map((player) => (
                <div key={player.id} className={player.isLocked ? 'opacity-35 grayscale pointer-events-none' : ''}>
                   <DraggablePlayer player={player} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col justify-center py-14">
            <div className={`w-full border-2 border-black p-5 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
              <div className="flex items-center gap-3 border-b border-black/15 pb-4">
                <div className="grid h-11 w-11 place-items-center border-2 border-black bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <Dices size={24} />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-55">Yeni Kadro</p>
                  <p className="text-sm font-black uppercase opacity-80">Draft havuzu</p>
                </div>
              </div>
              <button
                onClick={() => executeRollAnimation(rollSquad)}
                className="game-button game-button-major mt-5 w-full py-4 bg-yellow-500 text-black font-black text-2xl italic tracking-tighter border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:bg-yellow-400"
              >
                Kadro Çek
              </button>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45 mt-4">
                {autoRoll ? 'Otomatik akış açık' : 'Manuel akış açık'}
              </p>
            </div>
          </div>
        )}
      </div>
      <AdSlot placement="left-panel" className="hidden shrink-0 lg:block" />
    </div>
  );
}
