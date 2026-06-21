'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Pitch from '@/components/Pitch';
import PlayerList from '@/components/PlayerList';
import Tournament from '@/components/Tournament';
import ManagerLeague from '@/components/ManagerLeague';
import CareerMode from '@/components/CareerMode';
import SquadPanel from '@/components/SquadPanel';
import ShareExportPanel from '@/components/ShareExportPanel';
import AdSlot from '@/components/AdSlot';
import { useTeamStore, MentalityType } from '@/store/useTeamStore';
import { Sun, Moon, Shield, Flame, Activity, Settings2, Trophy, PencilLine, Database, Medal } from 'lucide-react';
import { FORMATIONS, FormationType } from '@/lib/formations';
import { decodeShareCode } from '@/lib/shareCode';
import { saveTeamSnapshot } from '@/lib/localStats';
import { getCompetitions } from '@/lib/seasonRepository';
import { getTacticProfile } from '@/lib/teamManagement';
import { loadCareer, getManagerLevel, type CareerSave } from '@/lib/careerMode';
import { loadProfile, type ProfileStats } from '@/lib/profileService';

export default function Home() {
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const teamRating = useTeamStore((state) => state.teamRating);
  const formationId = useTeamStore((state) => state.formation);
  const mentality = useTeamStore((state) => state.mentality);
  const blindMode = useTeamStore((state) => state.blindMode);
  const setSetup = useTeamStore((state) => state.setSetup);
  const loadSharedTeam = useTeamStore((state) => state.loadSharedTeam);
  const captainId = useTeamStore((state) => state.captainId);
  const setCaptain = useTeamStore((state) => state.setCaptain);
  const theme = useTeamStore((state) => state.theme);
  const toggleTheme = useTeamStore((state) => state.toggleTheme);
  const squadName = useTeamStore((state) => state.squadName);
  const setSquadName = useTeamStore((state) => state.setSquadName);
  const competitionId = useTeamStore((state) => state.competitionId);

  const isDark = theme === 'dark';
  const setupComplete = formationId !== null && mentality !== null;
  const competitions = getCompetitions();

  const [appPhase, setAppPhase] = useState<'draft' | 'tournament'>('draft');
  const [gameMode, setGameMode] = useState<'quick' | 'manager' | 'career'>('quick');
  const [pendingCompetitionId, setPendingCompetitionId] = useState(competitionId);
  const [pendingFormation, setPendingFormation] = useState<FormationType | null>(formationId);
  const [pendingMentality, setPendingMentality] = useState<MentalityType | null>(mentality);
  const [pendingBlindMode, setPendingBlindMode] = useState(blindMode);
  const [careerResume, setCareerResume] = useState<CareerSave | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const loadedShareRef = useRef(false);
  const savedDraftRef = useRef<string | null>(null);
  const captainPanelRef = useRef<HTMLDivElement | null>(null);

  const handleFormationSelect = (nextFormation: FormationType) => {
    setPendingFormation(nextFormation);
  };

  const handleMentalitySelect = (nextMentality: MentalityType) => {
    setPendingMentality(nextMentality);
  };

  const handleSetupStart = () => {
    if (!pendingFormation || !pendingMentality) return;
    setSetup(pendingFormation, pendingMentality, pendingBlindMode, pendingCompetitionId);
  };

  const selectedCount = selectedPlayers.filter((p) => p !== null).length;
  const isTeamFull = selectedCount === 11;
  const hasCaptain = Boolean(captainId && selectedPlayers.some((player) => player?.id === captainId));
  const canStartTournament = isTeamFull && hasCaptain;
  const bestCaptain = selectedPlayers
    .filter((player) => player !== null)
    .sort((a, b) => b.overall_rating - a.overall_rating)[0] ?? null;
  const flowMessage = !setupComplete
    ? '1/7 Turnuva, diziliş ve zihniyet seç.'
    : !isTeamFull
      ? `3/7 11 oyuncu seç. Şu an ${selectedCount}/11.`
      : !hasCaptain
        ? '4/7 Kadron tamamlandı. Maça başlamadan önce kaptanını seç.'
        : '5/7 Hazırsın. Turnuvayı başlat.';

  useEffect(() => {
    if (loadedShareRef.current) return;
    loadedShareRef.current = true;

    const code = new URLSearchParams(window.location.search).get('team');
    if (!code) return;

    const sharedTeam = decodeShareCode(code);
    if (!sharedTeam) return;

    loadSharedTeam(sharedTeam);
  }, [loadSharedTeam]);

  useEffect(() => {
    if (!isTeamFull || !formationId || !hasCaptain) return;

    const playerIds = selectedPlayers.map((player) => player?.id ?? null);
    const draftKey = [competitionId, formationId, captainId, playerIds.join('|')].join(':');
    if (savedDraftRef.current === draftKey) return;

    savedDraftRef.current = draftKey;
    saveTeamSnapshot({
      formation: formationId,
      rating: teamRating,
      captainId,
      playerIds,
      outcome: 'draft',
      headline: 'Kadro tamamlandı',
      competitionId,
    });
  }, [captainId, competitionId, formationId, hasCaptain, isTeamFull, selectedPlayers, teamRating]);

  useEffect(() => {
    if (!setupComplete || !isTeamFull || hasCaptain) return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    const timer = window.setTimeout(() => {
      captainPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [hasCaptain, isTeamFull, setupComplete]);

  useEffect(() => {
    const loadResume = () => {
      setCareerResume(loadCareer());
      setProfileStats(loadProfile());
    };
    loadResume();
    window.addEventListener('storage', loadResume);
    return () => window.removeEventListener('storage', loadResume);
  }, [gameMode]);

  if (gameMode === 'manager') {
    return (
      <main className={`min-h-screen flex flex-col transition-colors duration-300 font-mono ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
        <header className="flex flex-col gap-4 border-b-2 border-black bg-zinc-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-yellow-500" />
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter">CANLI11</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Menajer Ligi</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setGameMode('quick')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Hızlı Oyna
            </button>
            <button
              type="button"
              className="game-button border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Menajer Ligi
            </button>
            <button
              type="button"
              onClick={() => setGameMode('career')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Kariyer
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <ManagerLeague onBackToQuick={() => setGameMode('quick')} />
        </div>
        <AdSlot placement="mobile-sticky" />
      </main>
    );
  }

  if (gameMode === 'career') {
    return (
      <main className={`min-h-screen flex flex-col transition-colors duration-300 font-mono ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
        <header className="flex flex-col gap-4 border-b-2 border-black bg-zinc-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-yellow-500" />
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter">CANLI11</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Kariyer Modu</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setGameMode('quick')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Hızlı Oyna
            </button>
            <button
              type="button"
              onClick={() => setGameMode('manager')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Menajer
            </button>
            <button
              type="button"
              className="game-button border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Kariyer
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <CareerMode onBackToQuick={() => setGameMode('quick')} onGoManager={() => setGameMode('manager')} />
        </div>
        <AdSlot placement="mobile-sticky" />
      </main>
    );
  }

  if (appPhase === 'tournament') {
    return (
      <main className={`min-h-screen flex flex-col transition-colors duration-300 font-mono ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
        <header className="p-5 flex justify-between items-center border-b-2 border-black bg-zinc-900 text-white">
           <div className="flex items-center gap-3">
              <Trophy size={24} className="text-yellow-500" />
              <h1 className="text-2xl font-black italic tracking-tighter uppercase">TURNUVA MODU</h1>
           </div>
           <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setGameMode('manager')}
              className="game-button border border-white/20 px-3 py-3 text-[10px] font-black uppercase hover:bg-white/10"
            >
              Menajer Ligi
            </button>
            <button
              type="button"
              onClick={() => setGameMode('career')}
              className="game-button border border-white/20 px-3 py-3 text-[10px] font-black uppercase hover:bg-white/10"
            >
              Kariyer
            </button>
            <button onClick={toggleTheme} className="game-button p-3 border border-white/20 hover:bg-white/10 transition-colors rounded-none">
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
           </div>
        </header>
        <div className="flex-1 p-4 lg:p-10 overflow-y-auto">
          <Tournament userRating={teamRating} />
        </div>
        <AdSlot placement="mobile-sticky" />
      </main>
    );
  }

  return (
    <main className={`min-h-screen flex flex-col transition-colors duration-300 font-mono ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      
      {/* HEADER */}
      <header className={`p-6 flex justify-between items-center border-b-2 border-black transition-colors duration-300 ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
        <div className="flex flex-col">
           <h1 className="text-4xl font-black italic tracking-tighter leading-none">EFSANE-11</h1>
           <div className="text-xs uppercase font-bold tracking-[0.2em] opacity-40 mt-1">Kadro Kur • Simüle Et • Kazan</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setGameMode('quick')}
            className="game-button hidden border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:block"
          >
            Hızlı Oyna
          </button>
          <button
            type="button"
            onClick={() => setGameMode('manager')}
            className={`game-button border-2 border-black px-4 py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-white text-black'}`}
          >
            Menajer Ligi
          </button>
          <button
            type="button"
            onClick={() => setGameMode('career')}
            className={`game-button border-2 border-black px-4 py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-white text-black'}`}
          >
            Kariyer Modu
          </button>
          <Link
            href="/admin"
            className={`game-button grid h-12 w-12 place-items-center border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-white text-black'}`}
            aria-label="Admin paneli"
            title="Admin paneli"
          >
            <Database size={22} />
          </Link>
          <button onClick={toggleTheme} className={`game-button p-3 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-yellow-400 text-black'}`}>
            {isDark ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
      </header>

      {careerResume && (
        <section className={`border-b-4 border-black px-4 py-4 ${isDark ? 'bg-yellow-400 text-black' : 'bg-yellow-300 text-black'}`}>
          <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-65">Kariyerine devam et</p>
              <h2 className="mt-1 text-xl font-black uppercase italic">
                {careerResume.club.teamName} / Hafta {Math.min(careerResume.currentWeek + 1, 34)} seni bekliyor
              </h2>
              <p className="mt-1 text-xs font-black uppercase">
                Yönetim güveni %{careerResume.boardConfidence} · Taraftar %{careerResume.fanHappiness}
                {careerResume.transferMarket.length > 0 ? ' · Transfer dönemi açık' : ''}
                {careerResume.offers.length > 0 ? ' · Yeni kulüp teklifi var' : ''}
                {profileStats ? ` · ${getManagerLevel(profileStats.careerPoints)}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGameMode('career')}
              className="game-button border-4 border-black bg-green-600 px-5 py-4 text-sm font-black uppercase text-white shadow-[4px_4px_0px_0px_#000]"
            >
              Kariyere Devam Et
            </button>
          </div>
        </section>
      )}

      <section className={`sticky top-0 z-40 border-b-2 border-black px-4 py-3 font-mono shadow-[0_4px_0px_0px_rgba(0,0,0,0.25)] lg:static lg:shadow-none ${isDark ? 'bg-zinc-950 text-white' : 'bg-yellow-50 text-black'}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-500">Sıradaki adım</p>
            <p className="mt-1 text-xs font-black uppercase sm:text-sm">{flowMessage}</p>
            {isTeamFull && !hasCaptain && (
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
                Devam etmek için kaptan seçmelisin.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {setupComplete && isTeamFull && !hasCaptain && bestCaptain && (
              <button
                type="button"
                onClick={() => setCaptain(bestCaptain.id)}
                className="game-button border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                En yüksek ratingli oyuncuyu kaptan yap
              </button>
            )}
            {canStartTournament && (
              <button
                type="button"
                onClick={() => setAppPhase('tournament')}
                className="game-button border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                Turnuvayı Başlat
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
           {!setupComplete ? (
           <div className={`w-full lg:w-80 p-8 border-r-2 border-black flex flex-col gap-6 overflow-y-auto transition-colors duration-300 ${isDark ? 'bg-zinc-900/80' : 'bg-zinc-50'}`}>
              <div>
                 <div className="flex items-center gap-2 mb-4 opacity-60">
                    <Medal size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic text-yellow-500">TURNUVA</h3>
                 </div>
                 <div className="grid gap-2">
                   {competitions.map((competition) => (
                     <button
                       key={competition.competitionId}
                       type="button"
                       onClick={() => setPendingCompetitionId(competition.competitionId)}
                       className={`game-button border-2 border-black px-4 py-3 text-left transition-all ${
                         pendingCompetitionId === competition.competitionId
                           ? 'game-button-selected bg-yellow-500 text-black'
                           : 'bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-100'
                       }`}
                     >
                       <span className="block text-xs font-black uppercase">{competition.competitionName}</span>
                       <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.16em] opacity-55">
                         {competition.season} / {competition.teams.length} takim
                       </span>
                     </button>
                   ))}
                 </div>
              </div>

              <div>
                 <div className="flex items-center gap-2 mb-4 opacity-60">
                    <PencilLine size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic text-yellow-500">KADRO ADI</h3>
                 </div>
                 <input
                   value={squadName}
                   onChange={(event) => setSquadName(event.target.value)}
                   maxLength={32}
                   className={`w-full border-2 border-black px-4 py-4 text-sm font-black uppercase outline-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-black'}`}
                   placeholder="Efsane 11"
                 />
              </div>

              <div>
                 <div className="flex items-center gap-2 mb-5 opacity-60">
                    <Settings2 size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic text-yellow-500">DİZİLİŞ</h3>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    {FORMATIONS.map(f => (
                      <button key={f.id} onClick={() => handleFormationSelect(f.id)} 
                        className={`game-button p-3 text-xs font-black border-2 border-black transition-all ${pendingFormation === f.id ? 'game-button-selected bg-black text-white' : 'bg-white text-black hover:bg-zinc-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none'}`}>
                        {f.id}
                      </button>
                    ))}
                </div>
             </div>

             <div>
                 <div className="flex items-center gap-2 mb-5 opacity-60">
                    <Activity size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic text-yellow-500">ZİHNİYET</h3>
                 </div>
                 <div className="flex flex-col gap-2">
                    {(['Gegenpress', 'Balanced', 'ParkTheBus'] as MentalityType[]).map((m) => {
                      const tactic = getTacticProfile(m);
                      return (
                        <button key={m} onClick={() => handleMentalitySelect(m)}
                          className={`game-button border-2 border-black px-5 py-3 text-left text-xs font-black transition-all ${pendingMentality === m ? 'game-button-selected bg-black text-white' : 'bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-100 active:shadow-none'}`}>
                          <span className="flex items-center gap-2">
                            {m === 'Gegenpress' ? 'HÜCUM' : m === 'ParkTheBus' ? 'SAVUNMA' : 'DENGELİ'}
                            {m === 'Gegenpress' && <Flame size={12} className="text-red-500" />}
                            {m === 'ParkTheBus' && <Shield size={12} className="text-blue-500" />}
                          </span>
                          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.12em] opacity-55">
                            {tactic.description}
                          </span>
                          <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.12em] text-yellow-500">
                            {tactic.riskLabel}
                          </span>
                        </button>
                      );
                    })}
                </div>
             </div>

             <div>
                <div className="flex items-center gap-2 mb-5 opacity-60">
                    <Shield size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic text-yellow-500">ZORLUK</h3>
                 </div>
                 <button onClick={() => setPendingBlindMode(!pendingBlindMode)} 
                   className={`game-button w-full p-4 text-xs font-black border-2 border-black transition-all ${pendingBlindMode ? 'game-button-selected bg-purple-700 text-white' : 'bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-100'}`}>
                   {pendingBlindMode ? 'GİZLİLİK MODU (??)' : 'KLASİK MOD (REYTING)'}
                 </button>
              </div>

              <div className="mt-auto pt-8 border-t border-black/10 space-y-4">
                 <button
                   onClick={handleSetupStart}
                   disabled={!pendingFormation || !pendingMentality}
                   className={`game-button game-button-major w-full py-5 border-4 border-black font-black text-2xl italic tracking-tighter transition-all ${
                     pendingFormation && pendingMentality
                       ? 'bg-yellow-500 text-black shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none'
                       : 'bg-zinc-300 text-zinc-500 cursor-not-allowed opacity-60'
                   }`}
                 >
                   KADRO SEÇİMİNE GEÇ
                 </button>
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45 leading-relaxed">
                   Diziliş, zihniyet ve zorluk hazırsa draft panelini aç.
                 </p>
                 <AdSlot placement="left-panel" className="hidden lg:block" />
              </div>
           </div>
           ) : (
             <div ref={captainPanelRef} className="w-full lg:h-full lg:w-auto">
               <PlayerList side="left" />
             </div>
           )}
           
          {/* CENTER: PITCH */}
          <div className="flex-1 p-4 lg:p-12 flex flex-col items-center justify-center overflow-y-auto bg-black/5">
            <div className="w-full max-w-[728px] relative">
              <AdSlot placement="pitch-top" className="mb-6 hidden md:block" />
              <button 
                onClick={() => canStartTournament && setAppPhase('tournament')}
                disabled={!canStartTournament}
                className={`game-button game-button-major mb-6 w-full py-6 font-black text-3xl italic tracking-tighter transition-all border-4 border-black sm:text-4xl
                  ${!canStartTournament
                    ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed opacity-50' 
                    : 'bg-green-600 text-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0 active:translate-y-0'}
                `}
              >
                {!isTeamFull ? `KADROYU TAMAMLA (${selectedCount}/11)` : !hasCaptain ? 'KAPTAN SEÇ' : 'TURNUVAYI BAŞLAT ⚔️'}
              </button>
              <Pitch previewFormationId={setupComplete ? null : pendingFormation} />
              {setupComplete && <ShareExportPanel isTeamFull={isTeamFull} hasCaptain={hasCaptain} />}
            </div>
          </div>

           {setupComplete && <SquadPanel />}

      </div>
      <AdSlot placement="mobile-sticky" />
    </main>
  );
}
