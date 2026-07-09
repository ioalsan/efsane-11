'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Pitch from '@/components/Pitch';
import PlayerList from '@/components/PlayerList';
import Tournament from '@/components/Tournament';
import ManagerLeague from '@/components/ManagerLeague';
import CareerMode from '@/components/CareerMode';
import MultiplayerLeague from '@/components/MultiplayerLeague';
import SquadPanel from '@/components/SquadPanel';
import AdSlot from '@/components/AdSlot';
import GameShell from '@/components/GameShell';
import { useTeamStore, MentalityType } from '@/store/useTeamStore';
import { Sun, Moon, Settings2, Trophy, Database, Medal, Users } from 'lucide-react';
import { FORMATIONS, FormationType } from '@/lib/formations';
import { decodeShareCode } from '@/lib/shareCode';
import { saveTeamSnapshot } from '@/lib/localStats';
import { getCompetitions } from '@/lib/seasonRepository';
import { loadCareer, getManagerLevel, type CareerSave } from '@/lib/careerMode';
import { loadProfile, type ProfileStats } from '@/lib/profileService';

type MultiplayerFocus = 'friends' | 'invite';
const showLegacyCareerEntry = false;

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
  const [gameMode, setGameMode] = useState<'quick' | 'manager' | 'career' | 'multiplayer'>('quick');
  const [multiplayerFocus, setMultiplayerFocus] = useState<MultiplayerFocus>('friends');
  const [pendingCompetitionId, setPendingCompetitionId] = useState(competitionId);
  const [pendingFormation, setPendingFormation] = useState<FormationType | null>(formationId);
  const [pendingMentality, setPendingMentality] = useState<MentalityType | null>(mentality);
  const [pendingBlindMode, setPendingBlindMode] = useState(blindMode);
  const [careerResume, setCareerResume] = useState<CareerSave | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const loadedShareRef = useRef(false);
  const savedDraftRef = useRef<string | null>(null);
  const captainPanelRef = useRef<HTMLDivElement | null>(null);

  const openMultiplayer = (focus: MultiplayerFocus) => {
    setMultiplayerFocus(focus);
    setGameMode('multiplayer');
  };

  useEffect(() => {
    if (gameMode === 'multiplayer' || (gameMode === 'quick' && appPhase === 'draft')) {
      document.body.dataset.gameShell = gameMode;
    } else {
      delete document.body.dataset.gameShell;
    }
    return () => {
      delete document.body.dataset.gameShell;
    };
  }, [appPhase, gameMode]);

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
    if (!showLegacyCareerEntry) return;
    const loadResume = () => {
      setCareerResume(loadCareer());
      setProfileStats(loadProfile());
    };
    loadResume();
    window.addEventListener('storage', loadResume);
    return () => window.removeEventListener('storage', loadResume);
  }, []);

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
            <button
              type="button"
              onClick={() => setGameMode('multiplayer')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Multiplayer
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
              onClick={() => openMultiplayer('friends')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Arkadaş Ligi
            </button>
            <button
              type="button"
              className="game-button border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Kariyer
            </button>
            <button
              type="button"
              onClick={() => setGameMode('multiplayer')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Multiplayer
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

  if (gameMode === 'multiplayer') {
    return (
      <main className={`min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300 font-mono xl:h-dvh xl:min-h-0 xl:overflow-hidden ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
        <header className="sticky top-0 z-50 flex min-w-0 shrink-0 flex-col gap-4 border-b-2 border-black bg-zinc-900 p-4 text-white sm:flex-row sm:flex-wrap sm:items-center sm:justify-between xl:static">
          <div className="flex min-w-0 items-center gap-3">
            <Users size={24} className="text-green-400" />
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter">CANLI11</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Multiplayer Lig</p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setGameMode('quick')}
              className="game-button border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Hızlı Oyna
            </button>
            <button
              type="button"
              onClick={() => openMultiplayer('friends')}
              className={`game-button border-2 border-black px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] ${multiplayerFocus === 'friends' ? 'bg-yellow-400' : 'bg-white'}`}
            >
              Arkadaş Ligi
            </button>
            <button
              type="button"
              onClick={() => openMultiplayer('invite')}
              className={`game-button border-2 border-black px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] ${multiplayerFocus === 'invite' ? 'bg-yellow-400' : 'bg-white'}`}
            >
              Davetli Lig
            </button>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 xl:overflow-hidden xl:p-4">
          <MultiplayerLeague onBackToQuick={() => setGameMode('quick')} focusMode={multiplayerFocus} />
        </div>
        <AdSlot placement="mobile-sticky" />
      </main>
    );
  }

  if (appPhase === 'tournament') {
    return (
      <main className={`min-h-screen overflow-x-hidden transition-colors duration-300 font-mono ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
        <header className={`sticky top-0 z-50 flex shrink-0 flex-col gap-3 border-b-2 border-black p-4 transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between xl:static ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Trophy size={24} className="shrink-0 text-yellow-500" />
            <div className="min-w-0">
              <h1 className="text-3xl font-black italic leading-none tracking-tighter">CANLI11</h1>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Turnuva Modu</p>
            </div>
          </div>
          <nav className="grid min-w-0 grid-cols-3 gap-2" aria-label="Oyun modu">
            <button
              type="button"
              onClick={() => {
                setAppPhase('draft');
                setGameMode('quick');
              }}
              className="game-button border-2 border-black bg-yellow-400 px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Hızlı Oyna
            </button>
            <button
              type="button"
              onClick={() => {
                setAppPhase('draft');
                openMultiplayer('friends');
              }}
              className="game-button border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Arkadaş Ligi
            </button>
            <button
              type="button"
              onClick={() => {
                setAppPhase('draft');
                openMultiplayer('invite');
              }}
              className="game-button border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              Davetli Lig
            </button>
          </nav>
        </header>
        <div className="w-full min-w-0 p-3">
          <Tournament userRating={teamRating} />
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300 font-mono xl:h-dvh xl:min-h-0 xl:overflow-hidden ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      
      {/* HEADER */}
      <header className={`sticky top-0 z-50 flex shrink-0 flex-col gap-3 border-b-2 border-black p-4 transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between xl:static ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
        <div className="flex min-w-0 flex-col">
           <h1 className="text-4xl font-black italic tracking-tighter leading-none">CANLI11</h1>
           <div className="text-xs uppercase font-bold tracking-[0.2em] opacity-40 mt-1">Kadro Kur • Simüle Et • Paylaş</div>
        </div>

        <div className="grid min-w-0 grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => setGameMode('quick')}
            className="game-button border-2 border-black bg-yellow-400 px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:px-4 sm:py-3 sm:text-xs"
          >
            Hızlı Oyna
          </button>
          <button
            type="button"
            onClick={() => openMultiplayer('friends')}
            className="game-button border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:px-4 sm:py-3 sm:text-xs"
          >
            Arkadaş
          </button>
          <button
            type="button"
            onClick={() => openMultiplayer('invite')}
            className="game-button border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:px-4 sm:py-3 sm:text-xs"
          >
            Davetli
          </button>
          <Link
            href="/admin"
            className={`hidden game-button h-12 w-12 place-items-center border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-white text-black'}`}
            aria-label="Admin paneli"
            title="Admin paneli"
          >
            <Database size={22} />
          </Link>
          <button onClick={toggleTheme} className={`game-button border-2 border-black p-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none sm:p-3 ${isDark ? 'bg-zinc-800 text-yellow-500' : 'bg-yellow-400 text-black'}`}>
            {isDark ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
      </header>

      {showLegacyCareerEntry && careerResume && (
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

      <div className="min-h-0 min-w-0 flex-1 p-3 xl:overflow-hidden">
        <GameShell
          leftLabel={setupComplete ? 'Oyuncular' : 'Kurulum'}
          centerLabel="Saha"
          rightLabel="Kadro"
          initialPanel={setupComplete ? 'left' : 'center'}
          topActionBar={(
            <section className={`border-4 border-black px-4 py-3 shadow-[4px_4px_0px_0px_#000] ${isDark ? 'bg-zinc-950 text-white' : 'bg-yellow-50 text-black'}`}>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500">Sıradaki adım</p>
                  <p className="mt-1 text-xs font-black uppercase">{flowMessage}</p>
                  <p className="mt-1 text-[9px] font-black uppercase opacity-55">
                    İlk 11: {selectedCount}/11 | Güç: {teamRating || '-'} | Kaptan: {hasCaptain ? 'Seçildi' : 'Yok'}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase opacity-55">
                    Yedek: 0/7 | Hızlı Oyna ana hedefi: ilk 11 + kaptan
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {setupComplete && isTeamFull && !hasCaptain && bestCaptain && (
                    <button type="button" onClick={() => setCaptain(bestCaptain.id)} className="game-button border-2 border-black bg-yellow-400 px-3 py-2 text-[10px] font-black uppercase text-black">
                      Kaptanı Otomatik Seç
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => canStartTournament && setAppPhase('tournament')}
                    disabled={!canStartTournament}
                    className="game-button border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-35"
                  >
                    {canStartTournament ? 'Turnuvaya Geç' : `Takımı Tamamla ${selectedCount}/11`}
                  </button>
                </div>
              </div>
            </section>
          )}
          leftPanel={!setupComplete ? (
            <section className={`h-full space-y-5 border-4 border-black p-4 ${isDark ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-black'}`}>
              <div>
                <div className="mb-3 flex items-center gap-2"><Medal size={16} className="text-yellow-500" /><h3 className="text-xs font-black uppercase">Turnuva</h3></div>
                <div className="grid gap-2">
                  {competitions.map((competition) => (
                    <button key={competition.competitionId} type="button" onClick={() => setPendingCompetitionId(competition.competitionId)} className={`game-button border-2 border-black px-3 py-2 text-left text-[10px] font-black uppercase ${pendingCompetitionId === competition.competitionId ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}>
                      {competition.competitionName} <span className="block text-[8px] opacity-55">{competition.teams.length} takım</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-[10px] font-black uppercase">Kadro Adı
                <input value={squadName} onChange={(event) => setSquadName(event.target.value)} maxLength={32} className="mt-2 w-full border-2 border-black bg-white px-3 py-3 text-xs font-black uppercase text-black" placeholder="Efsane 11" />
              </label>
              <div>
                <p className="mb-2 text-[10px] font-black uppercase">Diziliş</p>
                <div className="grid grid-cols-2 gap-2">{FORMATIONS.map((formation) => <button key={formation.id} type="button" onClick={() => handleFormationSelect(formation.id)} className={`game-button border-2 border-black px-2 py-2 text-[10px] font-black ${pendingFormation === formation.id ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}>{formation.id}</button>)}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['Gegenpress', 'Balanced', 'ParkTheBus'] as MentalityType[]).map((item) => <button key={item} type="button" onClick={() => handleMentalitySelect(item)} className={`game-button border-2 border-black px-2 py-2 text-[9px] font-black uppercase ${pendingMentality === item ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}>{item === 'Gegenpress' ? 'Hücum' : item === 'ParkTheBus' ? 'Savunma' : 'Dengeli'}</button>)}
              </div>
              <button type="button" onClick={() => setPendingBlindMode(!pendingBlindMode)} className="game-button w-full border-2 border-black bg-zinc-800 px-3 py-3 text-[10px] font-black uppercase text-white">{pendingBlindMode ? 'Gizlilik Modu' : 'Klasik Mod'}</button>
              <button type="button" onClick={handleSetupStart} disabled={!pendingFormation || !pendingMentality} className="game-button w-full border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-35">Kadro Seçimine Geç</button>
            </section>
          ) : (
            <div ref={captainPanelRef} className="h-full min-h-0 w-full"><PlayerList side="left" /></div>
          )}
          centerPanel={(
            <section className="flex min-h-full min-w-0 flex-col items-center bg-black/5 p-2 sm:p-3">
              <Pitch className="quick-shell-pitch" previewFormationId={setupComplete ? null : pendingFormation} />
            </section>
          )}
          rightPanel={setupComplete ? <SquadPanel /> : (
            <section className={`h-full overflow-y-auto border-4 border-black p-5 ${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-black'}`}>
              <Settings2 className="text-yellow-500" />
              <h2 className="mt-3 text-xl font-black uppercase italic">Hızlı Oyna Kurulumu</h2>
              <p className="mt-3 text-xs font-black uppercase leading-relaxed opacity-60">Turnuva, diziliş ve zihniyet seç. Saha önizlemesi orta panelde sabit kalır.</p>
              <div className="mt-5 grid gap-2 text-[10px] font-black uppercase">
                <span className="border-2 border-black p-3">Turnuva: {competitions.find((item) => item.competitionId === pendingCompetitionId)?.competitionName ?? '-'}</span>
                <span className="border-2 border-black p-3">Diziliş: {pendingFormation ?? '-'}</span>
                <span className="border-2 border-black p-3">Zihniyet: {pendingMentality ?? '-'}</span>
              </div>
              <section className="mt-6 border-2 border-black bg-yellow-400 p-4 text-black">
                <h2 className="text-sm font-black uppercase italic">Sıradaki Adım</h2>
                <p className="mt-3 text-xs font-bold leading-relaxed">
                  Önce turnuva, diziliş ve taktik seç. Sonra sol panelden takım çevirip oyuncu
                  seç, orta sahadaki uygun slota yerleştir ve kaptanını belirle.
                </p>
              </section>
            </section>
          )}
        />
      </div>
    </main>
  );
}
