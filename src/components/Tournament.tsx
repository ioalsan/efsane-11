'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Activity, AlertTriangle, Crown, Play, Shield, Trophy } from 'lucide-react';
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

const finalScore = (fixture: CompetitionFixture) => {
  const result = fixture.result;
  if (!result) return null;
  return result.extraTime ?? result.normalTime;
};

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
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [pendingSimulation, setPendingSimulation] = useState<PendingSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const [champion, setChampion] = useState(false);

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

  const teamName = (teamId: string) => teamMap.get(teamId)?.name ?? teamId;

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

  const handleLiveComplete = () => {
    if (!pendingSimulation) return;
    if (pendingSimulation.mode === 'opening') finalizeOpeningRound(pendingSimulation.fixtures);
    else finalizeKnockoutRound(pendingSimulation.fixtures);
    setLiveFixture(null);
    setPendingSimulation(null);
    setIsSimulating(false);
  };

  const latestResult = latestFixture?.result;
  const latestHome = latestFixture ? teamName(latestFixture.homeTeamId) : '';
  const latestAway = latestFixture ? teamName(latestFixture.awayTeamId) : '';

  return (
    <div className={`mx-auto w-full max-w-7xl border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-8 ${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-black'}`}>
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

      {liveFixture?.result && (
        <LiveMatchPanel
          fixture={liveFixture}
          result={liveFixture.result}
          homeName={teamName(liveFixture.homeTeamId)}
          awayName={teamName(liveFixture.awayTeamId)}
          onComplete={handleLiveComplete}
        />
      )}

      {finishedMessage && (
        <section className={`mt-7 border-4 border-black p-7 text-center shadow-[7px_7px_0px_0px_#000] ${champion ? 'bg-yellow-500 text-black' : 'bg-red-600 text-white'}`}>
          {champion ? <Crown className="mx-auto mb-3" size={45} fill="currentColor" /> : <Shield className="mx-auto mb-3" size={45} />}
          <h3 className="text-3xl font-black uppercase italic tracking-tighter">{finishedMessage}</h3>
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
              onClick={() => inOpeningStage
                ? startSimulation(currentOpeningRound, false, 'opening')
                : startSimulation(knockoutFixtures, true, 'knockout')}
              disabled={isSimulating}
              className="game-button game-button-major mt-6 flex w-full items-center justify-center gap-3 border-4 border-black bg-green-600 px-6 py-6 text-2xl font-black uppercase italic text-white shadow-[8px_8px_0px_0px_#000] disabled:opacity-50"
            >
              <Play size={28} fill="currentColor" />
              {isSimulating ? 'Maç Canlı...' : `${currentStageLabel} Oyna`}
            </button>
          )}
        </section>

        <aside className="space-y-6">
          {(competition.format === 'league' || inOpeningStage || standings.some((row) => row.played > 0)) && (
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
                        incident.type === 'red-card' ? 'Kırmızı kart' :
                          incident.type === 'injury' ? 'Küçük sakatlık' : 'Oyuncu değişikliği'
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
