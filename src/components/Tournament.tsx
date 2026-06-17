'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, AlertTriangle, ClipboardCopy, Crown, ListChecks, Play, Shield, Trophy } from 'lucide-react';
import { useTeamStore } from '@/store/useTeamStore';
import {
  calculateStandings,
  generateKnockoutRound,
  generateLeaguePhase,
  generateRoundRobin,
  generateWorldCupGroupStage,
  getKnockoutWinners,
  simulateCompetitionMatch,
  toCompetitionPlayer,
  type CompetitionFixture,
  type CompetitionTeam,
  type StandingRow,
} from '@/lib/competitionEngine';
import {
  getCompetition,
  getCompetitionTeams,
  getSeasonDataset,
  getSeasonServerSnapshot,
  getTeamPlayers,
  subscribeSeasonDataset,
} from '@/lib/seasonRepository';
import { saveTeamSnapshot } from '@/lib/localStats';
import type { CompetitionGroup, KnockoutRound, SeasonCompetition, SeasonTeam } from '@/types';
import AdSlot from './AdSlot';
import LiveMatchPanel from './LiveMatchPanel';

const USER_TEAM_ID = 'efsane-11-user';
const knockoutParticipantCounts: Record<KnockoutRound, number> = {
  'round-of-32': 32,
  'round-of-16': 16,
  'quarter-final': 8,
  'semi-final': 4,
  final: 2,
};

const roundLabels: Record<KnockoutRound, string> = {
  'round-of-32': 'Son 32',
  'round-of-16': 'Son 16',
  'quarter-final': 'Çeyrek Final',
  'semi-final': 'Yarı Final',
  final: 'Final',
};

interface PendingSimulation {
  mode: 'opening' | 'knockout';
  fixtures: CompetitionFixture[];
}

interface PlayedMatchEntry {
  fixture: CompetitionFixture;
  stageLabel: string;
}

const finalScore = (fixture: CompetitionFixture) => {
  const result = fixture.result;
  if (!result) return null;
  return result.extraTime ?? result.normalTime;
};

const matchHistoryKey = (fixture: CompetitionFixture) => (
  `${fixture.stage}:${fixture.groupId ?? 'all'}:${fixture.id}`
);

const standingSort = (a: StandingRow, b: StandingRow) => (
  b.points - a.points ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor
);

const getTeamRating = (players: ReturnType<typeof getTeamPlayers>, strengthBonus: number) => {
  if (players.length === 0) return 70 + strengthBonus;
  const average = players.reduce((total, player) => total + player.rating + player.form * 0.35, 0) / players.length;
  return Math.max(55, Math.min(96, Math.round(average + strengthBonus)));
};

const createCompetitionTeams = (
  sourceTeams: SeasonTeam[],
  userRating: number,
  userName: string,
  userPlayers: ReturnType<typeof useTeamStore.getState>['selectedPlayers'],
  dataset: ReturnType<typeof getSeasonDataset>,
): CompetitionTeam[] => {
  const userTeam: CompetitionTeam = {
    id: USER_TEAM_ID,
    name: userName || 'Efsane 11',
    rating: userRating,
    isUser: true,
    players: userPlayers
      .filter((player) => player !== null)
      .map(toCompetitionPlayer),
  };
  const bots = sourceTeams.slice(1).map((team) => {
    const players = getTeamPlayers(team.id, dataset)
      .sort((a, b) => b.rating + b.form - (a.rating + a.form))
      .slice(0, 26);
    return {
      id: team.id,
      name: team.name,
      rating: getTeamRating(players, team.strengthBonus),
      players: players.map(toCompetitionPlayer),
    };
  });
  return [userTeam, ...bots];
};

const replaceFirstParticipant = (
  groups: CompetitionGroup[],
  replacedTeamId: string | undefined,
): CompetitionGroup[] => groups.map((group) => ({
  ...group,
  teamIds: group.teamIds.map((teamId) => teamId === replacedTeamId ? USER_TEAM_ID : teamId),
}));

const formatLabel = (competition: SeasonCompetition) => {
  if (competition.format === 'league') return 'Lig';
  if (competition.format === 'world_cup_48') return '48 Takım';
  return 'Kupa';
};

export default function Tournament({ userRating }: { userRating: number }) {
  const dataset = useSyncExternalStore(
    subscribeSeasonDataset,
    getSeasonDataset,
    getSeasonServerSnapshot,
  );
  const theme = useTeamStore((state) => state.theme);
  const competitionId = useTeamStore((state) => state.competitionId);
  const formationId = useTeamStore((state) => state.formation);
  const captainId = useTeamStore((state) => state.captainId);
  const squadName = useTeamStore((state) => state.squadName);
  const userPlayers = useTeamStore((state) => state.selectedPlayers);
  const competition = getCompetition(competitionId, dataset);
  const sourceTeams = useMemo(
    () => competition ? getCompetitionTeams(competition.competitionId, dataset) : [],
    [competition, dataset],
  );
  const isDark = theme === 'dark';

  const teams = useMemo(
    () => competition
      ? createCompetitionTeams(sourceTeams, userRating, squadName, userPlayers, dataset)
      : [],
    [competition, dataset, sourceTeams, squadName, userPlayers, userRating],
  );
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams]);
  const worldCupGroups = useMemo(
    () => competition?.format === 'world_cup_48'
      ? replaceFirstParticipant(competition.groups, sourceTeams[0]?.id)
      : [],
    [competition, sourceTeams],
  );

  const initialOpeningRounds = useMemo(() => {
    if (!competition || competition.format === 'knockout') return [];
    if (competition.format === 'league') {
      return generateRoundRobin(teamIds, competition.homeAway).slice(0, competition.leagueMatchCount);
    }
    if (competition.format === 'world_cup_48') {
      return generateWorldCupGroupStage(worldCupGroups);
    }
    return generateLeaguePhase(teamIds, competition.leaguePhaseMatchCount);
  }, [competition, teamIds, worldCupGroups]);

  const initialKnockoutStage = competition?.format === 'knockout'
    ? competition.knockoutRounds[0] ?? 'round-of-16'
    : null;
  const initialKnockoutTeams = competition?.format === 'knockout'
    ? teamIds.slice(0, knockoutParticipantCounts[initialKnockoutStage ?? 'round-of-16'])
    : [];

  const [openingRounds, setOpeningRounds] = useState<CompetitionFixture[][]>(initialOpeningRounds);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [knockoutStage, setKnockoutStage] = useState<KnockoutRound | null>(initialKnockoutStage);
  const [knockoutFixtures, setKnockoutFixtures] = useState<CompetitionFixture[]>(
    initialKnockoutStage ? generateKnockoutRound(initialKnockoutTeams, initialKnockoutStage) : [],
  );
  const [latestFixture, setLatestFixture] = useState<CompetitionFixture | null>(null);
  const [playedMatches, setPlayedMatches] = useState<PlayedMatchEntry[]>([]);
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [pendingSimulation, setPendingSimulation] = useState<PendingSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const [champion, setChampion] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const [autoAdvanceToken, setAutoAdvanceToken] = useState(0);
  const liveMatchRef = useRef<HTMLDivElement | null>(null);
  const finalResultRef = useRef<HTMLElement | null>(null);
  const autoContinueRef = useRef(false);

  const scrollToMobileTarget = useCallback((target: HTMLElement | null) => {
    if (!target) return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  useEffect(() => {
    if (!liveFixture) return;
    scrollToMobileTarget(liveMatchRef.current);
  }, [liveFixture, scrollToMobileTarget]);

  if (!competition || teams.length < 2) {
    return <div className="border-4 border-black bg-red-600 p-8 font-black text-white">Turnuva verisi bulunamadı.</div>;
  }

  const flatOpeningFixtures = openingRounds.flat();
  const userGroup = worldCupGroups.find((group) => group.teamIds.includes(USER_TEAM_ID));
  const worldGroupStandings = worldCupGroups.map((group) => ({
    group,
    standings: calculateStandings(
      group.teamIds,
      flatOpeningFixtures.filter((fixture) => fixture.groupId === group.groupId),
    ),
  }));
  const allStandings = calculateStandings(teamIds, flatOpeningFixtures);
  const standings = competition.format === 'world_cup_48'
    ? worldGroupStandings.find((entry) => entry.group.groupId === userGroup?.groupId)?.standings ?? []
    : allStandings;
  const currentOpeningRound = openingRounds[currentRoundIndex] ?? [];
  const inOpeningStage = competition.format !== 'knockout' && knockoutStage === null && !finishedMessage;
  const currentFixtures = inOpeningStage
    ? competition.format === 'world_cup_48'
      ? currentOpeningRound.filter((fixture) => fixture.groupId === userGroup?.groupId)
      : currentOpeningRound
    : knockoutFixtures;
  const currentStageLabel = inOpeningStage
    ? competition.format === 'league'
      ? `Hafta ${Math.min(currentRoundIndex + 1, openingRounds.length)} / ${openingRounds.length}`
      : competition.format === 'world_cup_48'
        ? `${userGroup?.groupName ?? 'Grup A'} / ${Math.min(currentRoundIndex + 1, 3)}. Maç`
        : `Lig Aşaması ${Math.min(currentRoundIndex + 1, openingRounds.length)} / ${openingRounds.length}`
    : knockoutStage
      ? roundLabels[knockoutStage]
      : 'Turnuva Tamamlandı';

  const hasPlayableStage = !finishedMessage && !liveFixture && !isSimulating && (
    inOpeningStage ? currentOpeningRound.length > 0 : knockoutFixtures.length > 0
  );

  const teamName = (teamId: string) => teamMap.get(teamId)?.name ?? teamId;

  const addPlayedMatches = (fixtures: CompetitionFixture[], stageLabel: string) => {
    const completedFixtures = fixtures.filter((fixture) => fixture.result);
    if (completedFixtures.length === 0) return;

    setPlayedMatches((currentMatches) => {
      const existingKeys = new Set(currentMatches.map((entry) => matchHistoryKey(entry.fixture)));
      const additions = completedFixtures
        .filter((fixture) => !existingKeys.has(matchHistoryKey(fixture)))
        .map((fixture) => ({ fixture, stageLabel }));

      if (additions.length === 0) return currentMatches;
      return [...currentMatches, ...additions];
    });
  };

  const formatScoreLabel = (fixture: CompetitionFixture) => {
    const score = finalScore(fixture);
    if (!fixture.result || !score) return 'VS';

    const details = [`${score.home} - ${score.away}`];
    if (fixture.result.extraTime) {
      details.push(`90 dk: ${fixture.result.normalTime.home}-${fixture.result.normalTime.away}`);
    }
    if (fixture.result.penalties) {
      details.push(`Pen: ${fixture.result.penalties.home}-${fixture.result.penalties.away}`);
    }
    return details.join(' / ');
  };

  const formatPlayedMatchLine = (entry: PlayedMatchEntry, index: number) => {
    const winnerLabel = entry.fixture.stage !== 'league' && entry.fixture.stage !== 'group' && entry.fixture.result?.winnerId
      ? ` / Tur: ${teamName(entry.fixture.result.winnerId)}`
      : '';
    return `${index + 1}. [${entry.stageLabel}] ${teamName(entry.fixture.homeTeamId)} ${formatScoreLabel(entry.fixture)} ${teamName(entry.fixture.awayTeamId)}${winnerLabel}`;
  };

  const recordOutcome = (outcome: 'champion' | 'eliminated', headline: string) => {
    if (!formationId) return;
    saveTeamSnapshot({
      formation: formationId,
      competitionId,
      rating: userRating,
      captainId,
      playerIds: userPlayers.map((player) => player?.id ?? null),
      outcome,
      headline,
    });
  };

  const completeOpeningStage = (completedRounds: CompetitionFixture[][]) => {
    if (competition.format === 'league') {
      const finalStandings = calculateStandings(teamIds, completedRounds.flat());
      const userPosition = finalStandings.findIndex((row) => row.teamId === USER_TEAM_ID) + 1;
      const isChampion = userPosition === 1;
      const message = isChampion
        ? `${squadName} ${competition.competitionName} şampiyonu oldu.`
        : `${squadName}, sezonu ${userPosition}. sırada tamamladı.`;
      setChampion(isChampion);
      setFinishedMessage(message);
      recordOutcome(isChampion ? 'champion' : 'eliminated', message);
      return;
    }

    let qualified: string[];
    let userPosition: number;
    let stageName: string;
    if (competition.format === 'world_cup_48') {
      const groupTables = worldCupGroups.map((group) => calculateStandings(
        group.teamIds,
        completedRounds.flat().filter((fixture) => fixture.groupId === group.groupId),
      ));
      const automatic = groupTables.flatMap((table) => table.slice(0, 2).map((row) => row.teamId));
      const bestThirds = groupTables.map((table) => table[2]).sort(standingSort).slice(0, 8);
      qualified = [...automatic, ...bestThirds.map((row) => row.teamId)];
      const ownTable = groupTables.find((table) => table.some((row) => row.teamId === USER_TEAM_ID)) ?? [];
      userPosition = ownTable.findIndex((row) => row.teamId === USER_TEAM_ID) + 1;
      stageName = userGroup?.groupName ?? 'grup';
    } else {
      const finalStandings = calculateStandings(teamIds, completedRounds.flat());
      const firstStage = competition.knockoutRounds[0] ?? 'round-of-16';
      qualified = finalStandings
        .slice(0, knockoutParticipantCounts[firstStage])
        .map((row) => row.teamId);
      userPosition = finalStandings.findIndex((row) => row.teamId === USER_TEAM_ID) + 1;
      stageName = 'lig aşaması';
    }

    if (!qualified.includes(USER_TEAM_ID)) {
      const message = `${squadName}, ${stageName} etabını ${userPosition}. sırada bitirdi ve elendi.`;
      setFinishedMessage(message);
      recordOutcome('eliminated', message);
      return;
    }

    const firstStage = competition.knockoutRounds[0] ?? 'round-of-16';
    setKnockoutStage(firstStage);
    setKnockoutFixtures(generateKnockoutRound(qualified, firstStage));
  };

  const finalizeOpeningRound = (playedRound: CompetitionFixture[]) => {
    const nextRounds = openingRounds.map((round, index) => index === currentRoundIndex ? playedRound : round);
    const userFixture = playedRound.find(
      (fixture) => fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID,
    );
    if (userFixture) setLatestFixture(userFixture);
    addPlayedMatches(playedRound, currentStageLabel);
    setOpeningRounds(nextRounds);
    if (currentRoundIndex >= openingRounds.length - 1) completeOpeningStage(nextRounds);
    else setCurrentRoundIndex((value) => value + 1);
  };

  const finalizeKnockoutRound = (playedFixtures: CompetitionFixture[]) => {
    const userFixture = playedFixtures.find(
      (fixture) => fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID,
    );
    if (userFixture) setLatestFixture(userFixture);
    setKnockoutFixtures(playedFixtures);
    addPlayedMatches(playedFixtures, knockoutStage ? roundLabels[knockoutStage] : 'Eleme');
    const winners = getKnockoutWinners(playedFixtures);

    if (!winners.includes(USER_TEAM_ID) && userFixture) {
      const message = `${squadName}, ${roundLabels[knockoutStage!]} aşamasında elendi.`;
      setFinishedMessage(message);
      recordOutcome('eliminated', message);
      return;
    }

    const currentStageIndex = competition.knockoutRounds.indexOf(knockoutStage!);
    const nextStage = competition.knockoutRounds[currentStageIndex + 1];
    if (!nextStage || knockoutStage === 'final') {
      const message = `${squadName}, ${competition.competitionName} kupasını kazandı.`;
      setChampion(true);
      setFinishedMessage(message);
      recordOutcome('champion', message);
      return;
    }

    setKnockoutStage(nextStage);
    setKnockoutFixtures(generateKnockoutRound(winners, nextStage));
  };

  const startSimulation = (
    fixtures: CompetitionFixture[],
    knockout: boolean,
    mode: PendingSimulation['mode'],
  ) => {
    if (isSimulating || fixtures.length === 0) return;
    const playedFixtures = fixtures.map((fixture) => {
      const home = teamMap.get(fixture.homeTeamId);
      const away = teamMap.get(fixture.awayTeamId);
      if (!home || !away) return fixture;
      return {
        ...fixture,
        result: simulateCompetitionMatch(home, away, knockout, dataset.settings),
      };
    });
    const userFixture = playedFixtures.find(
      (fixture) => fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID,
    );
    setIsSimulating(true);
    setPendingSimulation({ mode, fixtures: playedFixtures });
    if (userFixture?.result) setLiveFixture(userFixture);
    else {
      if (mode === 'opening') finalizeOpeningRound(playedFixtures);
      else finalizeKnockoutRound(playedFixtures);
      setPendingSimulation(null);
      setIsSimulating(false);
    }
  };

  const startCurrentStageSimulation = () => {
    if (!hasPlayableStage) return;
    if (inOpeningStage) startSimulation(currentOpeningRound, false, 'opening');
    else startSimulation(knockoutFixtures, true, 'knockout');
  };

  const scheduleAutoContinue = () => {
    if (!autoContinueRef.current) return;
    setAutoAdvanceToken((value) => value + 1);
  };

  const handleLiveComplete = () => {
    if (!pendingSimulation) return;
    if (pendingSimulation.mode === 'opening') finalizeOpeningRound(pendingSimulation.fixtures);
    else finalizeKnockoutRound(pendingSimulation.fixtures);
    setLiveFixture(null);
    setPendingSimulation(null);
    setIsSimulating(false);
    scheduleAutoContinue();
  };

  const latestResult = latestFixture?.result;

  const toggleAutoContinue = () => {
    const nextValue = !autoContinueRef.current;
    autoContinueRef.current = nextValue;
    setAutoContinue(nextValue);
    if (nextValue && latestResult && hasPlayableStage) scheduleAutoContinue();
  };

  const latestHome = latestFixture ? teamName(latestFixture.homeTeamId) : '';
  const latestAway = latestFixture ? teamName(latestFixture.awayTeamId) : '';
  const primaryActionLabel = latestResult ? 'Sonraki Maç' : `${currentStageLabel} Oyna`;
  const showMobileActionBar = !liveFixture && (hasPlayableStage || Boolean(finishedMessage));
  const showStandingsPanel = competition.format === 'league' || inOpeningStage || standings.some((row) => row.played > 0);
  const visiblePlayedMatches = playedMatches.filter(({ fixture }) => {
    if (competition.format !== 'world_cup_48') return true;
    if (fixture.stage === 'group') return fixture.groupId === userGroup?.groupId;
    return true;
  });
  const tournamentOutput = [
    `${competition.competitionName} - ${competition.season}`,
    `Kadro: ${squadName}`,
    `Sonuç: ${finishedMessage ?? 'Turnuva devam ediyor.'}`,
    '',
    ...(showStandingsPanel
      ? [
        'Puan Durumu:',
        ...standings.map((row, index) => (
          `${index + 1}. ${teamName(row.teamId)} - O:${row.played} G:${row.wins} B:${row.draws} M:${row.losses} AV:${row.goalDifference} P:${row.points}`
        )),
        '',
      ]
      : []),
    'Oynanan Maçlar:',
    ...(visiblePlayedMatches.length > 0
      ? visiblePlayedMatches.map(formatPlayedMatchLine)
      : ['Henüz maç oynanmadı.']),
  ].join('\n');

  const copyTournamentOutput = () => {
    void navigator.clipboard?.writeText(tournamentOutput);
  };

  return (
    <div className={`mx-auto w-full max-w-7xl border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-8 ${showMobileActionBar ? 'pb-44 sm:pb-44 md:pb-8' : ''} ${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-black'}`}>
      <AutoContinueRunner
        token={autoAdvanceToken}
        enabled={autoContinue}
        canRun={hasPlayableStage}
        onRun={startCurrentStageSimulation}
      />
      <AdSlot placement="result" className="mb-7 hidden md:block" />

      <header className="flex flex-col gap-5 border-b-4 border-black pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center border-2 border-black bg-yellow-500 text-black shadow-[4px_4px_0px_0px_#000]">
            <Trophy size={30} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-55">{competition.season}</p>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">{competition.competitionName}</h2>
            <p className="mt-1 text-xs font-black uppercase text-yellow-500">{currentStageLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Takım" value={teams.length} />
          <Stat label="Rating" value={userRating} />
          <Stat label="Format" value={formatLabel(competition)} />
        </div>
      </header>

      <section className={`mt-5 flex flex-col gap-3 border-2 border-black p-4 shadow-[4px_4px_0px_0px_#000] sm:flex-row sm:items-center sm:justify-between ${isDark ? 'bg-zinc-900' : 'bg-zinc-100 text-black'}`}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-500">Otomatik devam et</p>
          <p className="mt-1 text-[11px] font-bold opacity-60">
            Açıkken maç biter, kısa sonuç görünür ve 1.6 saniye sonra sonraki maç başlar.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={autoContinue}
          onClick={toggleAutoContinue}
          className={`game-button flex items-center justify-center gap-3 border-2 border-black px-4 py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000] ${autoContinue ? 'bg-green-500 text-black' : 'bg-white text-black'}`}
        >
          <span className={`relative h-5 w-10 border-2 border-black ${autoContinue ? 'bg-black' : 'bg-zinc-300'}`}>
            <span className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 bg-yellow-400 transition-transform ${autoContinue ? 'translate-x-5' : 'translate-x-1'}`} />
          </span>
          {autoContinue ? 'Açık' : 'Kapalı'}
        </button>
      </section>

      {!liveFixture && hasPlayableStage && (
        <section className="sticky top-2 z-30 mt-4 border-2 border-black bg-green-600 p-3 text-white shadow-[5px_5px_0px_0px_#000] md:hidden">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/75">
            6/7 Maç simülasyonunu izle
          </p>
          <button
            type="button"
            onClick={startCurrentStageSimulation}
            className="game-button flex w-full items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
          >
            <Play size={18} fill="currentColor" />
            {primaryActionLabel}
          </button>
        </section>
      )}

      {liveFixture?.result && (
        <div ref={liveMatchRef} className="scroll-mt-4 md:scroll-mt-8">
          <LiveMatchPanel
            fixture={liveFixture}
            result={liveFixture.result}
            homeName={teamName(liveFixture.homeTeamId)}
            awayName={teamName(liveFixture.awayTeamId)}
            onComplete={handleLiveComplete}
          />
        </div>
      )}

      {finishedMessage && (
        <section ref={finalResultRef} className={`mt-7 scroll-mt-4 border-4 border-black p-7 text-center shadow-[7px_7px_0px_0px_#000] md:scroll-mt-8 ${champion ? 'bg-yellow-500 text-black' : 'bg-red-600 text-white'}`}>
          {champion ? <Crown className="mx-auto mb-3" size={45} fill="currentColor" /> : <Shield className="mx-auto mb-3" size={45} />}
          <h3 className="text-3xl font-black uppercase italic tracking-tighter">{finishedMessage}</h3>
        </section>
      )}

      {finishedMessage && (
        <section className={`mt-7 border-4 border-black p-5 shadow-[6px_6px_0px_0px_#000] ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
          <div className="flex flex-col gap-3 border-b-2 border-black pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-500">Turnuva Çıktısı</p>
              <h3 className="text-xl font-black uppercase italic">Özet ve maç dökümü</h3>
            </div>
            <button
              type="button"
              onClick={copyTournamentOutput}
              className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              <ClipboardCopy size={16} />
              Çıktıyı Kopyala
            </button>
          </div>
          <textarea
            readOnly
            value={tournamentOutput}
            rows={Math.min(16, Math.max(8, tournamentOutput.split('\n').length))}
            className={`mt-4 w-full resize-y border-2 border-black p-4 text-xs font-black leading-relaxed outline-none ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}
          />
        </section>
      )}

      {!liveFixture && latestResult && latestFixture && (
        <section className="mt-7 border-4 border-black bg-zinc-900 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-500">Final Sonucu</p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <p className="text-right text-xl font-black uppercase">{latestHome}</p>
            <p className="whitespace-nowrap text-4xl font-black">
              {(latestResult.extraTime ?? latestResult.normalTime).home} - {(latestResult.extraTime ?? latestResult.normalTime).away}
            </p>
            <p className="text-left text-xl font-black uppercase">{latestAway}</p>
          </div>
          {latestResult.extraTime && (
            <p className="mt-3 text-center text-sm font-black text-yellow-400">
              90 Dakika: {latestResult.normalTime.home} - {latestResult.normalTime.away}
            </p>
          )}
          {latestResult.penalties && (
            <p className="mt-2 text-center text-sm font-black text-red-400">
              Penaltılar: {latestResult.penalties.home} - {latestResult.penalties.away}
            </p>
          )}
          {latestFixture.stage !== 'league' && latestFixture.stage !== 'group' && latestResult.winnerId && (
            <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.18em]">
              {teamName(latestResult.winnerId)} tur atladı
            </p>
          )}
        </section>
      )}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-50">Maç Programı</p>
              <h3 className="text-2xl font-black uppercase italic">{currentStageLabel}</h3>
            </div>
            <Activity className="text-yellow-500" size={28} />
          </div>

          <div className="space-y-3">
            {currentFixtures.map((fixture) => {
              const result = fixture.result;
              const score = finalScore(fixture);
              const isUserMatch = fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID;
              return (
                <div key={fixture.id} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-2 border-black p-4 shadow-[4px_4px_0px_0px_#000] ${isUserMatch ? 'bg-yellow-500 text-black' : isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                  <p className="text-right text-sm font-black uppercase">{teamName(fixture.homeTeamId)}</p>
                  <p className="min-w-20 text-center text-2xl font-black">
                    {result && score ? `${score.home} - ${score.away}` : 'VS'}
                  </p>
                  <p className="text-left text-sm font-black uppercase">{teamName(fixture.awayTeamId)}</p>
                </div>
              );
            })}
          </div>

          {!finishedMessage && (
            <button
              type="button"
              onClick={startCurrentStageSimulation}
              disabled={!hasPlayableStage}
              className="game-button game-button-major mt-6 hidden w-full items-center justify-center gap-3 border-4 border-black bg-green-600 px-6 py-6 text-2xl font-black uppercase italic text-white shadow-[8px_8px_0px_0px_#000] disabled:opacity-50 md:flex"
            >
              <Play size={28} fill="currentColor" />
              {isSimulating ? 'Maç Canlı...' : primaryActionLabel}
            </button>
          )}
        </section>

        <aside className="space-y-6">
          {showStandingsPanel && (
            <section className="border-4 border-black bg-zinc-100 p-4 text-black shadow-[6px_6px_0px_0px_#000]">
              <h3 className="border-b-2 border-black pb-3 text-lg font-black uppercase italic">
                {competition.format === 'world_cup_48' ? `${userGroup?.groupName ?? 'Grup'} Puan Durumu` : 'Puan Durumu'}
              </h3>
              <div className="mt-3 max-h-[520px] overflow-y-auto">
                <div className="grid grid-cols-[2rem_1fr_repeat(5,2.2rem)] gap-1 border-b border-black/20 pb-2 text-center text-[9px] font-black uppercase">
                  <span>#</span><span className="text-left">Takım</span><span>O</span><span>G</span><span>B</span><span>AV</span><span>P</span>
                </div>
                {standings.map((row, index) => (
                  <div key={row.teamId} className={`grid grid-cols-[2rem_1fr_repeat(5,2.2rem)] gap-1 border-b border-black/10 py-2 text-center text-[11px] font-black ${row.teamId === USER_TEAM_ID ? 'bg-yellow-400' : ''}`}>
                    <span>{index + 1}</span>
                    <span className="truncate text-left">{teamName(row.teamId)}</span>
                    <span>{row.played}</span><span>{row.wins}</span><span>{row.draws}</span>
                    <span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span>
                    <span>{row.points}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visiblePlayedMatches.length > 0 && (
            <PlayedMatchesPanel
              entries={visiblePlayedMatches}
              formatScoreLabel={formatScoreLabel}
              teamName={teamName}
            />
          )}

          {!liveFixture && latestResult && (
            <section className="border-4 border-black bg-zinc-900 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
              <h3 className="flex items-center gap-2 border-b border-white/15 pb-3 text-sm font-black uppercase">
                <AlertTriangle size={18} className="text-yellow-500" /> Maç Olayları
              </h3>
              <div className="mt-3 space-y-2">
                {latestResult.incidents.filter((incident) => incident.type !== 'goal').length === 0 && (
                  <p className="text-xs font-bold opacity-45">Önemli olay yok.</p>
                )}
                {latestResult.incidents.filter((incident) => incident.type !== 'goal').map((incident, index) => (
                  <p key={`${incident.minute}-${incident.playerName}-${index}`} className="text-xs font-black">
                    {incident.minute}&apos; {
                      incident.type === 'yellow-card' ? 'Sarı kart' :
                        incident.type === 'red-card' ? 'Kırmızı kart' : 'Küçük sakatlık'
                    }: {incident.playerName}
                  </p>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-center">
                <Stat label="Topa Sahip Olma" value={`%${latestResult.stats.possessionHome}`} />
                <Stat label="xG" value={`${latestResult.stats.xgHome} / ${latestResult.stats.xgAway}`} />
                <Stat label="Şut" value={latestResult.stats.shotsHome} />
                <Stat label="Rakip Şut" value={latestResult.stats.shotsAway} />
              </div>
            </section>
          )}
        </aside>
      </div>

      {showMobileActionBar && (
        <div className="fixed inset-x-0 bottom-16 z-[95] px-3 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="mx-auto max-w-md border-2 border-black bg-zinc-950 p-3 text-white shadow-[5px_5px_0px_0px_#000]">
            {hasPlayableStage && (
              <button
                type="button"
                aria-pressed={autoContinue}
                onClick={toggleAutoContinue}
                className={`mb-2 flex w-full items-center justify-between border-2 border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${autoContinue ? 'bg-green-500 text-black' : 'bg-zinc-900 text-white'}`}
              >
                <span>Otomatik devam et</span>
                <span>{autoContinue ? 'Açık' : 'Kapalı'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={finishedMessage ? () => scrollToMobileTarget(finalResultRef.current) : startCurrentStageSimulation}
              className="game-button flex w-full items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
            >
              <Play size={18} fill="currentColor" />
              {finishedMessage ? 'Turnuva Sonucu' : primaryActionLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoContinueRunner({
  token,
  enabled,
  canRun,
  onRun,
}: {
  token: number;
  enabled: boolean;
  canRun: boolean;
  onRun: () => void;
}) {
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  useEffect(() => {
    if (token === 0 || !enabled || !canRun) return;

    const timer = window.setTimeout(() => {
      onRunRef.current();
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [canRun, enabled, token]);

  return null;
}

function PlayedMatchesPanel({
  entries,
  formatScoreLabel,
  teamName,
}: {
  entries: PlayedMatchEntry[];
  formatScoreLabel: (fixture: CompetitionFixture) => string;
  teamName: (teamId: string) => string;
}) {
  const latestFirstEntries = [...entries].reverse();

  return (
    <section className="border-4 border-black bg-white p-4 text-black shadow-[6px_6px_0px_0px_#000]">
      <h3 className="flex items-center gap-2 border-b-2 border-black pb-3 text-lg font-black uppercase italic">
        <ListChecks size={20} className="text-yellow-600" />
        Oynanan Maçlar
      </h3>
      <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
        {latestFirstEntries.map((entry) => {
          const fixture = entry.fixture;
          const isUserMatch = fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID;

          return (
            <div
              key={matchHistoryKey(fixture)}
              className={`border-2 border-black p-3 text-xs font-black shadow-[3px_3px_0px_0px_#000] ${isUserMatch ? 'bg-yellow-400' : 'bg-zinc-100'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.14em] opacity-60">
                <span className="truncate">{entry.stageLabel}</span>
                <span className="shrink-0">{formatScoreLabel(fixture)}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="truncate text-right uppercase">{teamName(fixture.homeTeamId)}</span>
                <span className="text-[10px] opacity-50">VS</span>
                <span className="truncate text-left uppercase">{teamName(fixture.awayTeamId)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-black bg-black px-3 py-2 text-white">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] opacity-55">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
