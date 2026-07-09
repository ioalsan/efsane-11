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
import { getCaptainRole } from '@/lib/captain';
import { type FormationType } from '@/lib/formations';
import {
  getSquadManagementSummary,
  getTacticProfile,
  type ManagerMentality,
  type SquadManagementSummary,
} from '@/lib/teamManagement';
import type { CompetitionGroup, KnockoutRound, SeasonCompetition, SeasonTeam } from '@/types';
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
  managerContext: {
    formationId: FormationType | null;
    mentality: ManagerMentality | null;
    captainId: string | null;
  },
): CompetitionTeam[] => {
  const captain = userPlayers.find((player) => player?.id === managerContext.captainId) ?? null;
  const captainRole = getCaptainRole(captain);
  const managementSummary = getSquadManagementSummary({
    selectedPlayers: userPlayers,
    formationId: managerContext.formationId,
    captainId: managerContext.captainId,
    mentality: managerContext.mentality,
  });
  const userTeam: CompetitionTeam = {
    id: USER_TEAM_ID,
    name: userName || 'Efsane 11',
    rating: userRating,
    isUser: true,
    tactic: managerContext.mentality ?? 'Balanced',
    chemistry: managementSummary.chemistry,
    captainImpact: captainRole ? captainRole.bonus * 2 : 0,
    captainRoleTitle: captainRole?.title,
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
  const mentality = useTeamStore((state) => state.mentality);
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
      ? createCompetitionTeams(sourceTeams, userRating, squadName, userPlayers, dataset, {
        formationId,
        mentality,
        captainId,
      })
      : [],
    [captainId, competition, dataset, formationId, mentality, sourceTeams, squadName, userPlayers, userRating],
  );
  const managerSummary = useMemo(() => getSquadManagementSummary({
    selectedPlayers: userPlayers,
    formationId,
    captainId,
    mentality,
  }), [captainId, formationId, mentality, userPlayers]);
  const tacticProfile = getTacticProfile(mentality);
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
  const actionStageLabel = competition.format === 'league' && inOpeningStage
    ? `${Math.min(currentRoundIndex + 1, openingRounds.length)} / ${openingRounds.length}`
    : currentStageLabel;
  const actionStagePrefix = competition.format === 'league' && inOpeningStage ? 'Hafta' : 'Etap';
  const activeFixture = currentFixtures.find(
    (fixture) => fixture.homeTeamId === USER_TEAM_ID || fixture.awayTeamId === USER_TEAM_ID,
  ) ?? currentFixtures[0] ?? null;
  const showMobileActionBar = !liveFixture && Boolean(finishedMessage);
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
    <div className={`flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain border-4 border-black p-3 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-4 xl:overflow-x-hidden xl:overflow-y-auto ${showMobileActionBar ? 'pb-44 sm:pb-44 md:pb-4' : ''} ${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-black'}`}>
      <AutoContinueRunner
        token={autoAdvanceToken}
        enabled={autoContinue}
        canRun={hasPlayableStage}
        onRun={startCurrentStageSimulation}
      />
      <header className="shrink-0 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Takım" value={teams.length} />
          <Stat label="Kadro Gücü" value={managerSummary.power} />
          <Stat label="Kimya" value={`${managerSummary.chemistry}`} />
          <Stat label="Taktik" value={tacticProfile.shortLabel} />
          <Stat label="Kaptan" value={managerSummary.captainImpact ? `+${managerSummary.captainImpact}` : '-'} />
          <Stat label="Format" value={formatLabel(competition)} />
        </div>
        </div>
      </header>

      {liveFixture?.result && (
        <div ref={liveMatchRef} className="mt-4 shrink-0 scroll-mt-4 md:scroll-mt-8">
          <LiveMatchPanel
            fixture={liveFixture}
            result={liveFixture.result}
            homeName={teamName(liveFixture.homeTeamId)}
            awayName={teamName(liveFixture.awayTeamId)}
            onComplete={handleLiveComplete}
          />
        </div>
      )}

      {!liveFixture && hasPlayableStage && (
        <section className="mt-4 border-4 border-black bg-green-600 p-4 text-white shadow-[5px_5px_0px_0px_#000] md:hidden">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
            Sezon aksiyonu
          </p>
          <h3 className="mt-1 text-xl font-black uppercase italic tracking-tighter">
            {currentStageLabel}
          </h3>
          <div className="mt-3 grid gap-2 text-[10px] font-black uppercase">
            <span className="border-2 border-white/25 bg-black/20 px-3 py-2">
              {actionStagePrefix}: {actionStageLabel}
            </span>
            <span className="border-2 border-white/25 bg-black/20 px-3 py-2">
              Aktif maç: {activeFixture ? `${teamName(activeFixture.homeTeamId)} vs ${teamName(activeFixture.awayTeamId)}` : '-'}
            </span>
            <span className="border-2 border-white/25 bg-black/20 px-3 py-2">
              Durum: Maç başlamaya hazır
            </span>
          </div>
          <button
            type="button"
            onClick={startCurrentStageSimulation}
            disabled={!hasPlayableStage}
            className="game-button mt-3 flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase italic text-black shadow-[4px_4px_0px_0px_#000] disabled:opacity-50"
          >
            <Play size={20} fill="currentColor" />
            {primaryActionLabel}
          </button>
        </section>
      )}

      <section className={`mt-4 grid shrink-0 gap-3 border-2 border-black p-3 shadow-[4px_4px_0px_0px_#000] lg:grid-cols-[1.1fr_1fr_1fr] ${isDark ? 'bg-zinc-900' : 'bg-zinc-100 text-black'}`}>
        <ManagerGauge label="Kadro Gücü" value={managerSummary.power} tone="yellow" />
        <ManagerGauge label={`Takım Kimyası / ${managerSummary.chemistryLabel}`} value={managerSummary.chemistry} tone="green" />
        <div className="border-2 border-black bg-black p-3 text-white">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-400">Maç Planı</p>
          <p className="mt-1 text-lg font-black uppercase">{tacticProfile.label}</p>
          <p className="mt-1 text-[10px] font-bold leading-relaxed text-white/60">{tacticProfile.description}</p>
          <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/45">{tacticProfile.riskLabel}</p>
        </div>
      </section>

      <section className={`mt-4 flex shrink-0 flex-col gap-3 border-2 border-black p-3 shadow-[4px_4px_0px_0px_#000] sm:flex-row sm:items-center sm:justify-between ${isDark ? 'bg-zinc-900' : 'bg-zinc-100 text-black'}`}>
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
        <section className="mt-4 hidden shrink-0 border-4 border-black bg-green-600 p-4 text-white shadow-[6px_6px_0px_0px_#000] md:block">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
                Sezon aksiyonu
              </p>
              <h3 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">
                {currentStageLabel}
              </h3>
              <div className="mt-3 grid gap-2 text-[11px] font-black uppercase sm:grid-cols-3">
                <span className="border-2 border-white/25 bg-black/20 px-3 py-2">
                  {actionStagePrefix}: {actionStageLabel}
                </span>
                <span className="min-w-0 border-2 border-white/25 bg-black/20 px-3 py-2">
                  Aktif maç: {activeFixture ? `${teamName(activeFixture.homeTeamId)} vs ${teamName(activeFixture.awayTeamId)}` : '-'}
                </span>
                <span className="border-2 border-white/25 bg-black/20 px-3 py-2">
                  Durum: Maç başlamaya hazır
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={startCurrentStageSimulation}
              disabled={!hasPlayableStage}
              className="game-button flex w-full items-center justify-center gap-3 border-4 border-black bg-yellow-400 px-6 py-5 text-base font-black uppercase italic text-black shadow-[5px_5px_0px_0px_#000] disabled:opacity-50 lg:w-auto lg:min-w-72"
            >
              <Play size={24} fill="currentColor" />
              {primaryActionLabel}
            </button>
          </div>
        </section>
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
        <MatchReportCard
          fixture={latestFixture}
          homeName={latestHome}
          awayName={latestAway}
          managerSummary={managerSummary}
          teamName={teamName}
        />
      )}

      <div className="mt-4 grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-50">Maç Programı</p>
              <h3 className="text-2xl font-black uppercase italic">{currentStageLabel}</h3>
            </div>
            <Activity className="text-yellow-500" size={28} />
          </div>

          <div className="space-y-3 pb-2">
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
        </section>

        <aside className="min-h-0 space-y-4">
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
                      incident.type === 'yellow-card' ? 'Sarı kart' : 'Küçük sakatlık'
                    }: {incident.playerName}
                  </p>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-center">
                <Stat label="Topa Sahip Olma" value={`%${latestResult.stats.possessionHome}`} />
                <Stat label="Şut" value={`${latestResult.stats.shotsHome} / ${latestResult.stats.shotsAway}`} />
                <Stat label="İsabet" value={`${latestResult.stats.shotsOnTargetHome} / ${latestResult.stats.shotsOnTargetAway}`} />
                <Stat label="Pas" value={`${latestResult.stats.passesHome} / ${latestResult.stats.passesAway}`} />
                <Stat label="Faul" value={`${latestResult.stats.foulsHome} / ${latestResult.stats.foulsAway}`} />
                <Stat label="xG" value={`${latestResult.stats.xgHome} / ${latestResult.stats.xgAway}`} />
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

function ManagerGauge({
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/55">{label}</p>
        <p className="text-2xl font-black tabular-nums">{value}</p>
      </div>
      <div className="h-3 overflow-hidden border border-white/20 bg-white/10">
        <div className={`h-full ${fillClass} transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function MatchReportCard({
  fixture,
  homeName,
  awayName,
  managerSummary,
  teamName,
}: {
  fixture: CompetitionFixture;
  homeName: string;
  awayName: string;
  managerSummary: SquadManagementSummary;
  teamName: (teamId: string) => string;
}) {
  const result = fixture.result;
  const score = finalScore(fixture);
  if (!result || !score) return null;

  const userIsHome = fixture.homeTeamId === USER_TEAM_ID;
  const userScore = userIsHome ? score.home : score.away;
  const opponentScore = userIsHome ? score.away : score.home;
  const userWon = userScore > opponentScore || result.winnerId === USER_TEAM_ID;
  const userLost = userScore < opponentScore || Boolean(result.winnerId && result.winnerId !== USER_TEAM_ID);
  const outcomeLabel = userWon ? 'Plan tuttu' : userLost ? 'Plan revizyon istiyor' : 'Denge oyunu';
  const outcomeClass = userWon ? 'bg-green-600' : userLost ? 'bg-red-600' : 'bg-yellow-500 text-black';
  const userPossession = userIsHome ? result.stats.possessionHome : 100 - result.stats.possessionHome;
  const userShots = userIsHome ? result.stats.shotsHome : result.stats.shotsAway;
  const opponentShots = userIsHome ? result.stats.shotsAway : result.stats.shotsHome;
  const tacticalNote = userWon
    ? `Kadro gücü ${managerSummary.power} ve kimya ${managerSummary.chemistry} maç planını taşıdı.`
    : userShots < opponentShots
      ? 'Rakip daha fazla şut üretti; orta saha ve geçiş savunması güçlendirilmeli.'
      : 'Üretim var, final aksiyon kalitesi ve bitiricilik daha belirleyici olmalı.';

  const statRows = [
    { label: 'Topa sahip olma', home: `%${result.stats.possessionHome}`, away: `%${100 - result.stats.possessionHome}` },
    { label: 'Şut', home: result.stats.shotsHome, away: result.stats.shotsAway },
    { label: 'İsabetli şut', home: result.stats.shotsOnTargetHome, away: result.stats.shotsOnTargetAway },
    { label: 'Pas', home: result.stats.passesHome, away: result.stats.passesAway },
    { label: 'Faul', home: result.stats.foulsHome, away: result.stats.foulsAway },
    { label: 'xG', home: result.stats.xgHome, away: result.stats.xgAway },
  ];

  return (
    <section className="mt-7 overflow-hidden border-4 border-black bg-zinc-950 text-white shadow-[6px_6px_0px_0px_#000]">
      <div className={`px-5 py-4 ${outcomeClass}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-75">Maç Sonu Teknik Rapor</p>
        <h3 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">{outcomeLabel}</h3>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-white/15 pb-5">
          <p className="text-right text-base font-black uppercase sm:text-xl">{homeName}</p>
          <div className="text-center">
            <p className="whitespace-nowrap text-5xl font-black tabular-nums">{score.home} - {score.away}</p>
            {result.extraTime && (
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.15em] text-yellow-300">
                90 dk: {result.normalTime.home} - {result.normalTime.away}
              </p>
            )}
            {result.penalties && (
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-purple-300">
                Penaltılar: {result.penalties.home} - {result.penalties.away}
              </p>
            )}
          </div>
          <p className="text-left text-base font-black uppercase sm:text-xl">{awayName}</p>
        </div>

        {fixture.stage !== 'league' && fixture.stage !== 'group' && result.winnerId && (
          <p className="mt-4 border-2 border-white/15 bg-white/5 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.18em]">
            {teamName(result.winnerId)} tur atladı
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <div className="border-2 border-white/15 bg-white/5 p-4">
            <h4 className="mb-3 text-sm font-black uppercase text-yellow-400">Maç İstatistikleri</h4>
            <div className="space-y-2">
              {statRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 text-xs font-black">
                  <span className="text-right tabular-nums">{row.home}</span>
                  <span className="border-x border-white/10 px-2 text-center text-[10px] uppercase tracking-[0.14em] text-white/55">{row.label}</span>
                  <span className="tabular-nums">{row.away}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="border-2 border-white/15 bg-white/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">Teknik Direktör Notu</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-white/75">{tacticalNote}</p>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                Topla oynama: %{userPossession} / Şut dengesi: {userShots}-{opponentShots}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AnalysisList title="Güçlü Yön" items={managerSummary.strengths} tone="green" />
              <AnalysisList title="Zayıf Yön" items={managerSummary.weaknesses} tone="red" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalysisList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'green' | 'red';
}) {
  return (
    <div className={`border-2 border-white/15 p-3 ${tone === 'green' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${tone === 'green' ? 'text-green-300' : 'text-red-300'}`}>{title}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <p key={item} className="text-[11px] font-black uppercase text-white/70">{item}</p>
        ))}
      </div>
    </div>
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
