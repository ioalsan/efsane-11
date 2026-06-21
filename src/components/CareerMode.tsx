'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Star,
  Trophy,
  WalletCards,
} from 'lucide-react';
import {
  calculateStandings,
  generateRoundRobin,
  simulateCompetitionMatch,
  toCompetitionPlayer,
  type CompetitionFixture,
  type CompetitionTeam,
  type StandingRow,
} from '@/lib/competitionEngine';
import {
  calculateCareerMarketValue,
  createCareerPlayerState,
  createClubProfile,
  createInitialCareerSave,
  createYouthProspects,
  developCareerPlayers,
  getManagerLevel,
  loadCareer,
  resetCareer,
  saveCareer,
  type CareerOffer,
  type CareerPlayerState,
  type CareerSave,
  type CareerSideMatch,
  type CareerTeamPool,
  type CareerTransferListing,
} from '@/lib/careerMode';
import { ensureLocalUser } from '@/lib/authService';
import {
  ensureProfile,
  getUnlockedAchievementIds,
  updateProfileFromCareerSeason,
  type ProfileStats,
} from '@/lib/profileService';
import { upsertSaveGame } from '@/lib/saveGameService';
import { validatePlayerData } from '@/lib/playerDataQuality';
import {
  getCompetitionTeamStrength,
  getCompetitionTeams,
  getCompetitions,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from '@/lib/seasonRepository';
import type { SeasonDataset, SeasonTeam } from '@/types';
import LiveMatchPanel from './LiveMatchPanel';

const SUPER_LIG_ID = 'super-lig';
const WORLD_CUP_ID = 'world-cup-2026';
const EUROPE_IDS = ['champions-league', 'europa-league', 'conference-league'];
const careerTeamPoolLabels: Record<CareerTeamPool, string> = {
  'super-lig': 'Süper Lig',
  'world-cup': 'Dünya Kupası Milli Takımları',
  europe: 'Avrupa Kulüpleri',
};

const formatMoney = (value: number) => (
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
);

const average = (values: number[], fallback: number) => (
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const playerToCompetitionPlayer = (player: CareerPlayerState) => ({
  id: player.playerId,
  name: player.name,
  rating: player.rating,
  form: player.form,
  attributes: player.attributes,
});

const finalScore = (fixture: CompetitionFixture) => fixture.result?.extraTime ?? fixture.result?.normalTime ?? null;

const getPoolTeams = (pool: CareerTeamPool, dataset: SeasonDataset) => {
  if (pool === 'super-lig') return getCompetitionTeams(SUPER_LIG_ID, dataset);
  if (pool === 'world-cup') return getCompetitionTeams(WORLD_CUP_ID, dataset);

  const teams = new Map<string, SeasonTeam>();
  EUROPE_IDS.flatMap((competitionId) => getCompetitionTeams(competitionId, dataset))
    .filter((team) => team.teamType === 'club')
    .forEach((team) => teams.set(team.id, team));
  return [...teams.values()];
};

const getPoolForTeam = (team: SeasonTeam): CareerTeamPool => {
  if (team.competitionIds.includes(WORLD_CUP_ID) || team.teamType === 'nationalTeam') return 'world-cup';
  if (team.competitionIds.includes(SUPER_LIG_ID)) return 'super-lig';
  return 'europe';
};

const createCareerLeagueTeamIds = (selectedTeamId: string, pool: CareerTeamPool, dataset: SeasonDataset) => {
  const teams = getPoolTeams(pool, dataset);
  const fallback = getCompetitionTeams(SUPER_LIG_ID, dataset);
  const source = teams.length >= 18 ? teams : fallback;
  const others = source.filter((team) => team.id !== selectedTeamId).slice(0, 17).map((team) => team.id);
  return [selectedTeamId, ...others].slice(0, 18);
};

const buildInitialRoster = (teamId: string, dataset: SeasonDataset) => (
  getTeamPlayers(teamId, dataset)
    .map(toLegacyPlayer)
    .sort((a, b) => b.overall_rating + (b.form ?? 0) - (a.overall_rating + (a.form ?? 0)))
    .slice(0, 25)
    .map((player) => createCareerPlayerState(player, teamId))
);

const buildCareerTeam = (save: CareerSave): CompetitionTeam => {
  const activeRoster = save.roster
    .filter((player) => player.loanStatus !== 'loanedOut')
    .sort((a, b) => b.rating + b.form - (a.rating + a.form))
    .slice(0, 18);
  const rating = Math.round(average(activeRoster.slice(0, 11).map((player) => player.rating + player.form * 0.25), save.club.strength));

  return {
    id: save.club.teamId,
    name: save.club.teamName,
    rating,
    isUser: true,
    tactic: 'Balanced',
    chemistry: clamp(62 + save.fanHappiness * 0.12 + save.boardConfidence * 0.08, 55, 92),
    players: activeRoster.map(playerToCompetitionPlayer),
  };
};

const buildBotTeam = (teamId: string, dataset: SeasonDataset): CompetitionTeam | null => {
  const team = dataset.teams.find((item) => item.id === teamId);
  if (!team) return null;
  const players = getTeamPlayers(team.id, dataset)
    .sort((a, b) => b.rating + b.form - (a.rating + a.form))
    .slice(0, 18);
  return {
    id: team.id,
    name: team.name,
    rating: getCompetitionTeamStrength(team.id, dataset),
    tactic: 'Balanced',
    chemistry: 70,
    players: players.map(toCompetitionPlayer),
  };
};

const buildCareerTeams = (save: CareerSave, dataset: SeasonDataset) => {
  const userTeam = buildCareerTeam(save);
  const bots = save.teamIds
    .filter((teamId) => teamId !== save.club.teamId)
    .map((teamId) => buildBotTeam(teamId, dataset))
    .filter((team): team is CompetitionTeam => Boolean(team));
  return [userTeam, ...bots];
};

const updateRosterFormAfterMatch = (
  roster: CareerPlayerState[],
  fixture: CompetitionFixture | undefined,
  teamId: string,
) => {
  if (!fixture?.result) return roster;
  const score = fixture.result.normalTime;
  const isHome = fixture.homeTeamId === teamId;
  const goalsFor = isHome ? score.home : score.away;
  const goalsAgainst = isHome ? score.away : score.home;
  const outcomeBoost = goalsFor > goalsAgainst ? 2 : goalsFor === goalsAgainst ? 0 : -2;

  return roster.map((player) => {
    if (player.loanStatus === 'loanedOut') return player;
    const involvement = Math.random() > 0.48 ? 1 : 0;
    const form = clamp(player.form + outcomeBoost + involvement + Math.floor(Math.random() * 3) - 1, -10, 10);
    return {
      ...player,
      form,
      marketValue: calculateCareerMarketValue(player.rating, player.age, player.potential, form),
    };
  });
};

const getRoundLabel = (index: number) => ['Ön Eleme', 'Son 16', 'Çeyrek Final', 'Yarı Final', 'Final'][index] ?? 'Final';

const simulateSideMatches = (
  save: CareerSave,
  teams: Map<string, CompetitionTeam>,
  dataset: SeasonDataset,
) => {
  const week = save.currentWeek + 1;
  const matches: CareerSideMatch[] = [];
  let cupStatus = save.cupStatus;
  let europeStatus = save.europeStatus;
  const userTeam = teams.get(save.club.teamId);
  if (!userTeam) return { matches, cupStatus, europeStatus };

  const simulateSide = (competition: 'cup' | 'europe', roundIndex: number) => {
    const candidates = save.teamIds
      .filter((teamId) => teamId !== save.club.teamId)
      .map((teamId) => teams.get(teamId) ?? buildBotTeam(teamId, dataset))
      .filter((team): team is CompetitionTeam => Boolean(team));
    const opponent = candidates[Math.floor(Math.random() * candidates.length)];
    if (!opponent) return null;
    const result = simulateCompetitionMatch(userTeam, opponent, true, dataset.settings, {
      allowSubstitutions: true,
      longSimulation: false,
    });
    return {
      id: `${competition}-${save.season}-${week}`,
      competition,
      roundLabel: getRoundLabel(roundIndex),
      opponentName: opponent.name,
      result,
    } satisfies CareerSideMatch;
  };

  const cupWeeks = [4, 10, 16, 22, 29];
  const cupRoundIndex = cupWeeks.indexOf(week);
  if (cupStatus === 'active' && cupRoundIndex >= 0) {
    const match = simulateSide('cup', cupRoundIndex);
    if (match) {
      matches.push(match);
      cupStatus = match.result.winnerId === save.club.teamId
        ? cupRoundIndex === cupWeeks.length - 1 ? 'won' : 'active'
        : 'eliminated';
    }
  }

  const europeWeeks = [6, 12, 18, 24, 31];
  const europeRoundIndex = europeWeeks.indexOf(week);
  if (europeStatus === 'active' && europeRoundIndex >= 0) {
    const match = simulateSide('europe', europeRoundIndex);
    if (match) {
      matches.push(match);
      europeStatus = match.result.winnerId === save.club.teamId
        ? europeRoundIndex === europeWeeks.length - 1 ? 'won' : 'active'
        : 'eliminated';
    }
  }

  return { matches, cupStatus, europeStatus };
};

const buildTransferMarket = (
  dataset: SeasonDataset,
  save: CareerSave,
) => {
  const ownedIds = new Set(save.roster.map((player) => player.playerId));
  const pool = dataset.players
    .map(toLegacyPlayer)
    .filter((player) => !ownedIds.has(player.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 16 + Math.min(6, save.facilities.scouting * 2));

  return pool.map((player) => {
    const state = createCareerPlayerState(player, player.teamId ?? save.club.teamId);
    const scoutingDiscount = 1.28 - save.facilities.scouting * 0.035;
    return {
      player: state,
      askingPrice: Math.round(state.marketValue * scoutingDiscount),
      loanFee: Math.round(state.marketValue * 0.18),
      listedAt: new Date().toISOString(),
    } satisfies CareerTransferListing;
  });
};

const createOffers = (save: CareerSave, dataset: SeasonDataset, leaguePosition: number) => {
  const pointsGate = save.careerPoints + Math.max(0, 120 - leaguePosition * 7);
  const allTeams = [
    ...getCompetitionTeams(SUPER_LIG_ID, dataset),
    ...EUROPE_IDS.flatMap((competitionId) => getCompetitionTeams(competitionId, dataset)),
  ];
  const unique = new Map<string, SeasonTeam>();
  allTeams.forEach((team) => {
    if (team.id !== save.club.teamId) unique.set(team.id, team);
  });
  const offers = [...unique.values()]
    .map((team) => {
      const strength = getCompetitionTeamStrength(team.id, dataset);
      const profile = createClubProfile(team, getPoolForTeam(team), strength);
      return {
        id: `offer-${team.id}-${save.season}`,
        teamId: team.id,
        teamName: team.name,
        prestige: profile.prestige,
        transferBudget: profile.transferBudget,
        boardExpectation: profile.boardExpectation,
      } satisfies CareerOffer;
    })
    .filter((offer) => offer.prestige <= save.club.prestige + 12 || pointsGate >= 350)
    .sort((a, b) => {
      const target = save.club.prestige + Math.min(18, Math.round(pointsGate / 70));
      return Math.abs(a.prestige - target) - Math.abs(b.prestige - target);
    })
    .slice(0, 5);

  return offers;
};

const getSeasonTargets = (save: CareerSave) => {
  const leagueTarget = save.club.prestige >= 88 ? 1 : save.club.prestige >= 80 ? 4 : save.club.prestige >= 72 ? 8 : 14;
  return {
    leagueTarget,
    reward: leagueTarget === 1
      ? 'Şampiyonluk: +150 kariyer puanı, yüksek prestijli teklifler'
      : leagueTarget <= 4
        ? 'İlk 4: +100 kariyer puanı, Avrupa yolu'
        : leagueTarget <= 8
          ? 'Üst sıra: +70 kariyer puanı'
          : 'Ligde kalma: +45 kariyer puanı',
    failure: leagueTarget === 1
      ? 'İlk 4 dışı: yönetim güveni sert düşer'
      : leagueTarget <= 4
        ? 'Orta sıra: yönetim uyarısı riski'
        : 'Düşme hattı: görevden alınma riski',
  };
};

const gradeFromScore = (score: number) => {
  if (score >= 88) return 'A';
  if (score >= 74) return 'B';
  if (score >= 58) return 'C';
  if (score >= 42) return 'D';
  return 'E';
};

const getSeasonGoalMap = (save: CareerSave) => {
  const goals = new Map<string, number>();
  save.fixtures.flat().forEach((fixture) => {
    fixture.result?.incidents
      .filter((incident) => incident.type === 'goal' && incident.teamId === save.club.teamId)
      .forEach((incident) => goals.set(incident.playerName, (goals.get(incident.playerName) ?? 0) + 1));
  });
  return goals;
};

const getTopScorer = (save: CareerSave) => {
  const goalMap = getSeasonGoalMap(save);
  const [name, goals] = [...goalMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  return { name, goals, goalMap };
};

const getBestPlayer = (save: CareerSave, goalMap: Map<string, number>) => (
  [...save.roster]
    .filter((player) => player.loanStatus !== 'loanedOut')
    .sort((a, b) => (
      b.rating + b.form * 0.8 + (goalMap.get(b.name) ?? 0) * 0.65
    ) - (
      a.rating + a.form * 0.8 + (goalMap.get(a.name) ?? 0) * 0.65
    ))[0]?.name ?? '-'
);

const buildShareText = (save: CareerSave, summary = save.seasonSummary) => {
  if (!summary) {
    return `Canlı11'de ${save.club.teamName} kariyerimde ${save.currentWeek + 1}. haftaya geldim. Yönetim güveni %${save.boardConfidence}, taraftar mutluluğu %${save.fanHappiness}.`;
  }
  return `Canlı11'de ${summary.teamName} ile ligi ${summary.points} puanla ${summary.leaguePosition}. bitirdim. ${summary.wins} galibiyet, ${summary.draws} beraberlik, ${summary.losses} mağlubiyet ve ${summary.goalsFor} gol. Kariyer puanı +${summary.careerPointsGained}.`;
};

type ClipboardNavigator = Navigator & {
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
};

type ShareNavigator = Navigator & {
  share: (data: ShareData) => Promise<void>;
};

const hasClipboardWriter = (value: Navigator): value is ClipboardNavigator => (
  'clipboard' in value
  && typeof (value as ClipboardNavigator).clipboard?.writeText === 'function'
);

const hasNativeShare = (value: Navigator): value is ShareNavigator => (
  'share' in value
  && typeof (value as ShareNavigator).share === 'function'
);

const copyTextToClipboard = async (text: string) => {
  if (typeof navigator !== 'undefined' && hasClipboardWriter(navigator)) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back when clipboard permissions or browser policy block direct access.
    }
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

const finishSeason = (save: CareerSave, dataset: SeasonDataset): CareerSave => {
  const standings = calculateStandings(save.teamIds, save.fixtures.flat());
  const rowIndex = standings.findIndex((row) => row.teamId === save.club.teamId);
  const row = standings[rowIndex];
  const leaguePosition = rowIndex >= 0 ? rowIndex + 1 : 18;
  const targets = getSeasonTargets(save);
  const trophies = [
    ...(leaguePosition === 1 ? ['Lig Şampiyonluğu'] : []),
    ...(save.cupStatus === 'won' ? ['Kupa'] : []),
    ...(save.europeStatus === 'won' ? ['Avrupa Kupası'] : []),
  ];
  const successDelta = targets.leagueTarget - leaguePosition;
  const fanHappiness = clamp(save.fanHappiness + successDelta * 4 + trophies.length * 8, 0, 100);
  const boardConfidence = clamp(save.boardConfidence + successDelta * 5 + trophies.length * 10, 0, 100);
  const warningLevel = boardConfidence < 35 ? save.warningLevel + 1 : Math.max(0, save.warningLevel - 1);
  const careerGain = Math.max(24, (row?.wins ?? 0) * 8 + Math.max(0, 20 - leaguePosition) * 6 + trophies.length * 100);
  const topScorer = getTopScorer(save);
  const bestPlayerName = getBestPlayer(save, topScorer.goalMap);
  const historyEntry = {
    season: save.season,
    teamName: save.club.teamName,
    leaguePosition,
    points: row?.points ?? 0,
    wins: row?.wins ?? 0,
    draws: row?.draws ?? 0,
    losses: row?.losses ?? 0,
    goalsFor: row?.goalsFor ?? 0,
    goalsAgainst: row?.goalsAgainst ?? 0,
    trophies,
    bestPlayerName,
    topScorerName: topScorer.name,
    topScorerGoals: topScorer.goals,
    careerPointsGained: careerGain,
    boardGrade: gradeFromScore(boardConfidence),
    fanGrade: gradeFromScore(fanHappiness),
    note: warningLevel >= 2 ? 'Yönetim baskısı yükseldi' : trophies.length ? 'Başarılı sezon' : 'Sezon tamamlandı',
  };
  const developedRoster = developCareerPlayers(save.roster, save.facilities);
  const newYouth = createYouthProspects(save.club.teamId, save.season + 1, save.facilities.youth);
  const nextSave = {
    ...save,
    careerPoints: save.careerPoints + careerGain,
    fanHappiness,
    boardConfidence,
    warningLevel,
    roster: developedRoster,
    youthAcademy: [...save.youthAcademy, ...newYouth].slice(-12),
    trophies: [...save.trophies, ...trophies],
    totalGoals: save.totalGoals + (row?.goalsFor ?? 0),
    history: [historyEntry, ...save.history].slice(0, 5),
    seasonSummary: historyEntry,
    offers: [],
    updatedAt: new Date().toISOString(),
  };

  return {
    ...nextSave,
    offers: createOffers(nextSave, dataset, leaguePosition),
  };
};

export default function CareerMode({ onBackToQuick, onGoManager }: { onBackToQuick: () => void; onGoManager: () => void }) {
  const dataset = useMemo(() => getSeasonDataset(), []);
  const competitions = useMemo(() => getCompetitions(dataset), [dataset]);
  const [save, setSave] = useState<CareerSave | null>(null);
  const [managerName, setManagerName] = useState('Canlı11 Menajeri');
  const [pool, setPool] = useState<CareerTeamPool>('super-lig');
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [pendingSave, setPendingSave] = useState<CareerSave | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  const poolTeams = useMemo(() => getPoolTeams(pool, dataset), [dataset, pool]);
  const careerTeams = useMemo(() => save ? buildCareerTeams(save, dataset) : [], [dataset, save]);
  const careerTeamMap = useMemo(() => new Map(careerTeams.map((team) => [team.id, team])), [careerTeams]);
  const standings = save ? calculateStandings(save.teamIds, save.fixtures.flat()) : [];
  const currentRound = save?.fixtures[save.currentWeek] ?? [];
  const latestFixture = save?.fixtures.flat().find((fixture) => fixture.id === save.latestFixtureId) ?? null;
  const seasonFinished = Boolean(save && save.currentWeek >= 34);
  const dataQualityReport = useMemo(() => validatePlayerData(dataset), [dataset]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const user = ensureLocalUser('Canlı11 Menajeri');
      setProfile(ensureProfile(user.id, user.username));
      const loaded = loadCareer();
      if (loaded) {
        setSave(loaded);
        upsertSaveGame({
          userId: user.id,
          activeMode: 'career',
          careerSave: loaded,
          profileStats: ensureProfile(user.id, user.username),
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!liveFixture || !window.matchMedia('(max-width: 767px)').matches) return;
    window.setTimeout(() => liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [liveFixture]);

  const persist = (nextSave: CareerSave) => {
    const user = ensureLocalUser(nextSave.managerName);
    setSave(nextSave);
    saveCareer(nextSave);
    const currentProfile = ensureProfile(user.id, user.username);
    setProfile(currentProfile);
    upsertSaveGame({
      userId: user.id,
      activeMode: 'career',
      careerSave: nextSave,
      profileStats: currentProfile,
    });
  };

  const startCareer = (team: SeasonTeam) => {
    const selectedPool = getPoolForTeam(team);
    const strength = getCompetitionTeamStrength(team.id, dataset);
    const club = createClubProfile(team, selectedPool, strength);
    const teamIds = createCareerLeagueTeamIds(team.id, selectedPool, dataset);
    const fixtures = generateRoundRobin(teamIds, true).slice(0, 34);
    const roster = buildInitialRoster(team.id, dataset);
    const user = ensureLocalUser(managerName);
    const nextSave = {
      ...createInitialCareerSave({
      managerName,
      club,
      teamIds,
      roster,
      fixtures,
      }),
      userId: user.id,
    };
    setProfile(ensureProfile(user.id, managerName));
    persist(nextSave);
    setMessage(`${team.name} ile kariyer başladı. İlk sezon fikstürü oluşturuldu.`);
  };

  const resetAll = () => {
    resetCareer();
    setSave(null);
    setLiveFixture(null);
    setPendingSave(null);
    setMessage('Kariyer kaydı sıfırlandı.');
  };

  const playWeek = () => {
    if (!save || liveFixture || seasonFinished) return;
    const round = save.fixtures[save.currentWeek] ?? [];
    if (!round.length) return;
    const teams = new Map(buildCareerTeams(save, dataset).map((team) => [team.id, team]));
    const playedRound = round.map((fixture) => {
      const home = teams.get(fixture.homeTeamId);
      const away = teams.get(fixture.awayTeamId);
      if (!home || !away) return fixture;
      return {
        ...fixture,
        result: simulateCompetitionMatch(home, away, false, dataset.settings, {
          allowSubstitutions: true,
          longSimulation: true,
        }),
      };
    });
    const userFixture = playedRound.find((fixture) => fixture.homeTeamId === save.club.teamId || fixture.awayTeamId === save.club.teamId);
    const userWon = Boolean(userFixture?.result?.winnerId === save.club.teamId);
    const side = simulateSideMatches(save, teams, dataset);
    const nextFixtures = save.fixtures.map((item, index) => index === save.currentWeek ? playedRound : item);
    const roster = updateRosterFormAfterMatch(save.roster, userFixture, save.club.teamId);
    let nextSave: CareerSave = {
      ...save,
      fixtures: nextFixtures,
      roster,
      currentWeek: save.currentWeek + 1,
      latestFixtureId: userFixture?.id ?? save.latestFixtureId,
      latestSideMatches: side.matches,
      cupStatus: side.cupStatus,
      europeStatus: side.europeStatus,
      totalWins: save.totalWins + (userWon ? 1 : 0),
      transferMarket: [],
      updatedAt: new Date().toISOString(),
    };
    if (nextSave.currentWeek >= 34) {
      nextSave = finishSeason(nextSave, dataset);
      if (nextSave.seasonSummary) {
        const user = ensureLocalUser(nextSave.managerName);
        const baseProfile = ensureProfile(user.id, user.username);
        const updatedProfile = updateProfileFromCareerSeason(baseProfile, nextSave, nextSave.seasonSummary);
        setProfile(updatedProfile);
        upsertSaveGame({
          userId: user.id,
          activeMode: 'career',
          careerSave: nextSave,
          profileStats: updatedProfile,
        });
      }
    }
    setPendingSave(nextSave);
    if (userFixture?.result) {
      setLiveFixture(userFixture);
    } else {
      persist(nextSave);
    }
  };

  const completeLiveMatch = () => {
    if (!pendingSave) return;
    persist(pendingSave);
    setPendingSave(null);
    setLiveFixture(null);
  };

  const startNewSeason = (teamId: string) => {
    if (!save) return;
    const team = dataset.teams.find((item) => item.id === teamId);
    if (!team) return;
    const selectedPool = getPoolForTeam(team);
    const strength = getCompetitionTeamStrength(team.id, dataset);
    const club = createClubProfile(team, selectedPool, strength);
    const teamIds = createCareerLeagueTeamIds(team.id, selectedPool, dataset);
    const fixtures = generateRoundRobin(teamIds, true).slice(0, 34);
    const sameTeam = teamId === save.club.teamId;
    const roster = sameTeam
      ? save.roster.filter((player) => player.loanStatus !== 'loanedIn')
      : buildInitialRoster(team.id, dataset);
    const nextSave: CareerSave = {
      ...save,
      season: save.season + 1,
      currentWeek: 0,
      club,
      teamIds,
      roster,
      fixtures,
      latestFixtureId: null,
      latestSideMatches: [],
      cupStatus: 'active',
      europeStatus: club.prestige >= 76 ? 'active' : 'not-qualified',
      offers: [],
      transferMarket: [],
      fanHappiness: sameTeam ? save.fanHappiness : 72,
      boardConfidence: sameTeam ? save.boardConfidence : 74,
      warningLevel: sameTeam ? save.warningLevel : 0,
      updatedAt: new Date().toISOString(),
    };
    persist(nextSave);
    setMessage(`${club.teamName} ile yeni sezon başladı.`);
  };

  const refreshMarket = () => {
    if (!save) return;
    const market = buildTransferMarket(dataset, save);
    persist({
      ...save,
      transferMarket: market,
      updatedAt: new Date().toISOString(),
    });
    setMessage(`${market.length} oyunculuk transfer pazarı yenilendi.`);
  };

  const buyPlayer = (listing: CareerTransferListing, loan = false) => {
    if (!save) return;
    const price = loan ? listing.loanFee : listing.askingPrice;
    if (save.club.transferBudget < price) {
      setMessage('Transfer bütçesi yetersiz.');
      return;
    }
    const player = {
      ...listing.player,
      teamId: save.club.teamId,
      loanStatus: loan ? 'loanedIn' as const : 'owned' as const,
    };
    persist({
      ...save,
      club: {
        ...save.club,
        transferBudget: save.club.transferBudget - price,
      },
      roster: [...save.roster, player],
      transferMarket: save.transferMarket.filter((item) => item.player.playerId !== listing.player.playerId),
      updatedAt: new Date().toISOString(),
    });
    setMessage(`${player.name} ${loan ? 'kiralandı' : 'transfer edildi'}.`);
  };

  const sellPlayer = (player: CareerPlayerState, loanOut = false) => {
    if (!save) return;
    const income = loanOut ? Math.round(player.marketValue * 0.14) : Math.round(player.marketValue * 0.78);
    persist({
      ...save,
      club: {
        ...save.club,
        transferBudget: save.club.transferBudget + income,
      },
      roster: loanOut
        ? save.roster.map((item) => item.playerId === player.playerId ? { ...item, loanStatus: 'loanedOut' } : item)
        : save.roster.filter((item) => item.playerId !== player.playerId),
      updatedAt: new Date().toISOString(),
    });
    setMessage(`${player.name} ${loanOut ? 'kiralık gönderildi' : 'satıldı'}.`);
  };

  const promoteYouth = (player: CareerPlayerState) => {
    if (!save) return;
    persist({
      ...save,
      roster: [...save.roster, { ...player, teamId: save.club.teamId }],
      youthAcademy: save.youthAcademy.filter((item) => item.playerId !== player.playerId),
      updatedAt: new Date().toISOString(),
    });
    setMessage(`${player.name} A takıma alındı.`);
  };

  const upgradeFacility = (facility: keyof CareerSave['facilities']) => {
    if (!save) return;
    const level = save.facilities[facility];
    if (level >= 5) return;
    const cost = level * 7_500_000;
    if (save.club.budget < cost) {
      setMessage('Kulüp bütçesi tesis geliştirme için yetersiz.');
      return;
    }
    persist({
      ...save,
      club: {
        ...save.club,
        budget: save.club.budget - cost,
      },
      facilities: {
        ...save.facilities,
        [facility]: level + 1,
      },
      updatedAt: new Date().toISOString(),
    });
    setMessage('Tesis seviyesi yükseltildi.');
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-500">Uzun Oyun</p>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">Kariyer Modu</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/60">
              Çok sezonlu kulüp kariyeri, tesis geliştirme, oyuncu gelişimi, transfer pazarı, yönetim güveni ve sezon sonu teklifler.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={onBackToQuick} className="game-button border-2 border-black bg-white px-5 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]">
              Hızlı Oyna
            </button>
            <button type="button" onClick={onGoManager} className="game-button border-2 border-black bg-yellow-400 px-5 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]">
              Menajer Ligi
            </button>
          </div>
        </div>
      </section>

      {message && (
        <section className="border-4 border-black bg-yellow-300 p-4 text-sm font-black uppercase text-black shadow-[5px_5px_0px_0px_#000]">
          {message}
        </section>
      )}

      {!save && (
        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4 border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="border-b-2 border-black pb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">1/4 Teknik direktör</p>
              <h3 className="text-2xl font-black uppercase italic">Kariyer başlat</h3>
            </div>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] opacity-55">Menajer adı</span>
              <input value={managerName} onChange={(event) => setManagerName(event.target.value)} className="w-full border-2 border-black px-3 py-3 text-sm font-black uppercase outline-none" />
            </label>
            <div className="grid gap-2">
              {(Object.keys(careerTeamPoolLabels) as CareerTeamPool[]).map((item) => (
                <button key={item} type="button" onClick={() => setPool(item)} className={`game-button border-2 border-black px-4 py-3 text-left text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000] ${pool === item ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}>
                  {careerTeamPoolLabels[item]}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold uppercase leading-relaxed opacity-55">
              Takım seçildiğinde lig fikstürü, bütçeler, yönetim beklentisi ve kariyer kaydı otomatik oluşturulur.
            </p>
          </aside>

          <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
            <div className="border-b border-white/15 pb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">2/4 Kulüple başla</p>
              <h3 className="text-2xl font-black uppercase italic">{careerTeamPoolLabels[pool]}</h3>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {poolTeams.map((team) => {
                const profile = createClubProfile(team, getPoolForTeam(team), getCompetitionTeamStrength(team.id, dataset));
                return (
                  <button key={team.id} type="button" onClick={() => startCareer(team)} className="game-button border-2 border-black bg-white p-4 text-left text-black shadow-[4px_4px_0px_0px_#000]">
                    <span className="block text-sm font-black uppercase">{team.name}</span>
                    <span className="mt-1 block text-[10px] font-black uppercase opacity-55">{team.country} / {team.league}</span>
                    <span className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] font-black uppercase">
                      <span className="border border-black bg-zinc-100 p-2">Güç {profile.strength}</span>
                      <span className="border border-black bg-zinc-100 p-2">Prestij {profile.prestige}</span>
                      <span className="border border-black bg-zinc-100 p-2">{formatMoney(profile.transferBudget)}</span>
                      <span className="border border-black bg-zinc-100 p-2">Maaş {formatMoney(profile.wageBudget)}</span>
                    </span>
                    <span className="mt-2 block text-[10px] font-bold uppercase opacity-60">{profile.boardExpectation}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase text-yellow-700">{profile.fanExpectation}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </section>
      )}

      {save && (
        <section className="space-y-6">
          <CareerDashboard save={save} standings={standings} competitionsCount={competitions.length} onReset={resetAll} />
          <SeasonTargetsPanel save={save} />

          {save.seasonSummary && (
            <SeasonSummaryPanel save={save} />
          )}

          {seasonFinished && (
            <SeasonEndPanel save={save} onStay={() => startNewSeason(save.club.teamId)} onAccept={startNewSeason} />
          )}

          {!seasonFinished && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Maç günü</p>
                    <h3 className="text-3xl font-black uppercase italic">Hafta {save.currentWeek + 1} / 34</h3>
                  </div>
                  <button type="button" onClick={playWeek} disabled={Boolean(liveFixture)} className="game-button flex items-center justify-center gap-2 border-4 border-black bg-green-600 px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-40">
                    <Play size={18} fill="currentColor" /> Haftayı Oyna
                  </button>
                </div>
                <div className="mt-5 grid gap-3">
                  {currentRound.map((fixture) => (
                    <FixtureRow key={fixture.id} fixture={fixture} teamNameOf={(teamId) => careerTeamMap.get(teamId)?.name ?? teamId} userTeamId={save.club.teamId} />
                  ))}
                </div>
              </section>

              <SideCompetitionPanel save={save} />
            </div>
          )}

          {liveFixture?.result && (
            <div ref={liveRef} className="scroll-mt-4 md:scroll-mt-8">
              <LiveMatchPanel
                fixture={liveFixture}
                result={liveFixture.result}
                homeName={careerTeamMap.get(liveFixture.homeTeamId)?.name ?? liveFixture.homeTeamId}
                awayName={careerTeamMap.get(liveFixture.awayTeamId)?.name ?? liveFixture.awayTeamId}
                onComplete={completeLiveMatch}
                simulationMode="manager"
              />
            </div>
          )}

          {latestFixture?.result && !liveFixture && (
            <section className="border-4 border-black bg-zinc-900 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Son Maç</p>
              <FixtureRow fixture={latestFixture} teamNameOf={(teamId) => careerTeamMap.get(teamId)?.name ?? teamId} userTeamId={save.club.teamId} dark />
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="space-y-5">
              <LeagueTable rows={standings} teamNameOf={(teamId) => careerTeamMap.get(teamId)?.name ?? teamId} userTeamId={save.club.teamId} />
              <RosterPanel save={save} onSell={sellPlayer} />
              <YouthPanel save={save} onPromote={promoteYouth} />
            </section>

            <aside className="space-y-5">
              {profile && <ProfilePanel profile={profile} />}
              <TransferPanel save={save} onRefresh={refreshMarket} onBuy={buyPlayer} />
              <FacilitiesPanel save={save} onUpgrade={upgradeFacility} />
              <DataQualityPanel report={dataQualityReport} />
              <HistoryPanel save={save} />
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function CareerDashboard({
  save,
  standings,
  competitionsCount,
  onReset,
}: {
  save: CareerSave;
  standings: StandingRow[];
  competitionsCount: number;
  onReset: () => void;
}) {
  const position = standings.findIndex((row) => row.teamId === save.club.teamId) + 1;
  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">{save.managerName} / {getManagerLevel(save.careerPoints)}</p>
          <h3 className="text-3xl font-black uppercase italic">{save.club.teamName}</h3>
          <p className="mt-1 text-xs font-black uppercase text-yellow-700">Sezon {save.season} / {careerTeamPoolLabels[save.club.pool]} / {competitionsCount} veri turnuvası</p>
        </div>
        <button type="button" onClick={onReset} className="game-button flex items-center justify-center gap-2 border-2 border-black bg-red-600 px-4 py-3 text-xs font-black uppercase text-white">
          <RotateCcw size={16} /> Kariyeri Sıfırla
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CareerMiniStat label="Lig Sırası" value={position || '-'} />
        <CareerMiniStat label="Kariyer Puanı" value={save.careerPoints} />
        <CareerMiniStat label="Taraftar" value={save.fanHappiness} />
        <CareerMiniStat label="Yönetim" value={save.boardConfidence} />
        <CareerMiniStat label="Transfer" value={formatMoney(save.club.transferBudget)} />
      </div>
      {save.warningLevel > 0 && (
        <div className="mt-4 border-2 border-black bg-red-600 p-3 text-xs font-black uppercase text-white">
          Yönetim uyarısı aktif. Kötü seri devam ederse görevden alınma riski artar.
        </div>
      )}
    </section>
  );
}

function SeasonTargetsPanel({ save }: { save: CareerSave }) {
  const targets = getSeasonTargets(save);
  const risk = save.warningLevel >= 2
    ? 'Yüksek'
    : save.boardConfidence < 45
      ? 'Orta'
      : 'Düşük';
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <div className="border-4 border-black bg-yellow-300 p-4 text-black shadow-[4px_4px_0px_0px_#000]">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60">Sezon hedefi</p>
        <h3 className="mt-1 text-xl font-black uppercase italic">Ligi ilk {targets.leagueTarget} içinde bitir</h3>
      </div>
      <div className="border-4 border-black bg-white p-4 text-black shadow-[4px_4px_0px_0px_#000]">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60">Ödül</p>
        <p className="mt-1 text-xs font-black uppercase leading-relaxed">{targets.reward}</p>
      </div>
      <div className="border-4 border-black bg-zinc-950 p-4 text-white shadow-[4px_4px_0px_0px_#000]">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-500">Başarısızlık</p>
        <p className="mt-1 text-xs font-black uppercase leading-relaxed">{targets.failure}</p>
        <p className="mt-2 text-[10px] font-black uppercase text-red-300">Görevden alınma riski: {risk}</p>
      </div>
    </section>
  );
}

function SeasonSummaryPanel({ save }: { save: CareerSave }) {
  const summary = save.seasonSummary;
  if (!summary) return null;
  return (
    <section className="border-4 border-black bg-yellow-300 p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Sezon özeti</p>
          <h3 className="text-3xl font-black uppercase italic">Sezon {summary.season}: {summary.teamName}</h3>
        </div>
        <ShareButton text={buildShareText(save, summary)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CareerMiniStat label="Lig Sırası" value={`${summary.leaguePosition}.`} />
        <CareerMiniStat label="Puan" value={summary.points} />
        <CareerMiniStat label="Kariyer +" value={summary.careerPointsGained} />
        <CareerMiniStat label="Karnesi" value={`${summary.boardGrade}/${summary.fanGrade}`} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="border-2 border-black bg-white p-3 text-xs font-black uppercase">
          <p>Lig: {summary.wins}G {summary.draws}B {summary.losses}M / {summary.goalsFor}-{summary.goalsAgainst}</p>
          <p className="mt-1">Kupalar: {summary.trophies.length ? summary.trophies.join(', ') : 'Yok'}</p>
          <p className="mt-1">Yönetim notu: {summary.boardGrade} / Taraftar notu: {summary.fanGrade}</p>
        </div>
        <div className="border-2 border-black bg-white p-3 text-xs font-black uppercase">
          <p>En iyi oyuncu: {summary.bestPlayerName}</p>
          <p className="mt-1">Gol kralı: {summary.topScorerName} ({summary.topScorerGoals})</p>
          <p className="mt-1">Durum: {summary.note}</p>
        </div>
      </div>
    </section>
  );
}

function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator;
    if (hasNativeShare(nav)) {
      try {
        await nav.share({ title: 'Canlı11 Kariyer', text });
        return;
      } catch {
        // Continue with clipboard copy if native sharing is blocked or unavailable.
      }
    }
    const didCopy = await copyTextToClipboard(text);
    if (!didCopy) return;

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" onClick={share} className="game-button border-2 border-black bg-zinc-950 px-4 py-3 text-xs font-black uppercase text-white">
      {copied ? 'Kopyalandı' : 'Paylaş'}
    </button>
  );
}

function ProfilePanel({ profile }: { profile: ProfileStats }) {
  const unlockedIds = getUnlockedAchievementIds(profile);
  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Profil</p>
      <h3 className="text-xl font-black uppercase italic">{profile.username}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CareerMiniStat label="Sezon" value={profile.seasonsPlayed} />
        <CareerMiniStat label="Kupa" value={profile.trophiesWon} />
        <CareerMiniStat label="En İyi Sıra" value={profile.bestLeaguePosition ?? '-'} />
        <CareerMiniStat label="Gol" value={profile.totalGoals} />
      </div>
      <p className="mt-3 text-xs font-black uppercase">Seviye: {profile.careerLevel}</p>
      <div className="mt-3 grid gap-2">
        {profile.achievements.map((achievement) => (
          <div key={achievement.id} className={`border-2 border-black p-2 text-[10px] font-black uppercase ${unlockedIds.has(achievement.id) ? 'bg-yellow-300' : 'bg-zinc-100 opacity-55'}`}>
            {achievement.title}
            <span className="mt-1 block font-bold opacity-70">{achievement.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataQualityPanel({ report }: { report: ReturnType<typeof validatePlayerData> }) {
  const osimhen = report.starChecks.find((item) => item.name.toLocaleLowerCase('tr-TR').includes('osimhen'));
  return (
    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Veri raporu</p>
      <h3 className="text-xl font-black uppercase italic">Oyuncu doğrulama</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CareerMiniStat label="Oyuncu" value={report.totalPlayers} />
        <CareerMiniStat label="Düzeltilen" value={report.correctedPlayers} />
        <CareerMiniStat label="DOB Eksik" value={report.missingDateOfBirth} />
        <CareerMiniStat label="Değer Eksik" value={report.missingMarketValue} />
      </div>
      {osimhen && (
        <p className="mt-3 border border-white/15 bg-white/5 p-3 text-[10px] font-black uppercase text-white/70">
          Victor Osimhen kontrolü: yaş {osimhen.age}, değer {formatMoney(osimhen.marketValue)}.
        </p>
      )}
      {report.invalidPlayers.length > 0 && (
        <p className="mt-3 text-[10px] font-black uppercase text-red-300">
          Hatalı kayıt: {report.invalidPlayers.slice(0, 4).join(', ')}
        </p>
      )}
    </section>
  );
}

function SeasonEndPanel({
  save,
  onStay,
  onAccept,
}: {
  save: CareerSave;
  onStay: () => void;
  onAccept: (teamId: string) => void;
}) {
  return (
    <section className="border-4 border-black bg-yellow-300 p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="border-b-2 border-black pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Sezon sonu</p>
        <h3 className="text-3xl font-black uppercase italic">Teklif ekranı</h3>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <button type="button" onClick={onStay} className="game-button border-4 border-black bg-zinc-950 p-5 text-left text-white shadow-[4px_4px_0px_0px_#000]">
          <span className="block text-lg font-black uppercase">Kulüpte Kal</span>
          <span className="mt-1 block text-xs font-bold uppercase text-white/55">{save.club.teamName} ile yeni sezona başla.</span>
        </button>
        <div className="grid gap-2 md:grid-cols-2">
          {save.offers.map((offer) => (
            <button key={offer.id} type="button" onClick={() => onAccept(offer.teamId)} className="game-button border-2 border-black bg-white p-4 text-left shadow-[3px_3px_0px_0px_#000]">
              <span className="block text-sm font-black uppercase">{offer.teamName}</span>
              <span className="mt-1 block text-[10px] font-black uppercase opacity-55">Prestij {offer.prestige} / {formatMoney(offer.transferBudget)}</span>
              <span className="mt-2 block text-[10px] font-bold uppercase opacity-60">{offer.boardExpectation}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SideCompetitionPanel({ save }: { save: CareerSave }) {
  return (
    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Kupa / Avrupa</p>
      <div className="mt-4 grid gap-3">
        <StatusCard icon={<Trophy size={18} />} label="Kupa" value={save.cupStatus} />
        <StatusCard icon={<Star size={18} />} label="Avrupa" value={save.europeStatus} />
      </div>
      <div className="mt-4 space-y-2">
        {save.latestSideMatches.length === 0 && <p className="text-xs font-bold uppercase text-white/45">Bu hafta yan turnuva maçı yok.</p>}
        {save.latestSideMatches.map((match) => (
          <div key={match.id} className="border border-white/15 bg-white/5 p-3 text-xs font-black uppercase">
            {match.competition === 'cup' ? 'Kupa' : 'Avrupa'} / {match.roundLabel}: {match.opponentName}
            <span className="ml-2 text-yellow-400">
              {match.result.normalTime.home}-{match.result.normalTime.away}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const text = value === 'active' ? 'Devam' : value === 'won' ? 'Kazanıldı' : value === 'not-qualified' ? 'Katılım yok' : 'Elendi';
  return (
    <div className="flex items-center justify-between border-2 border-black bg-white p-3 text-black">
      <span className="flex items-center gap-2 text-xs font-black uppercase">{icon}{label}</span>
      <span className="text-xs font-black uppercase">{text}</span>
    </div>
  );
}

function TransferPanel({
  save,
  onRefresh,
  onBuy,
}: {
  save: CareerSave;
  onRefresh: () => void;
  onBuy: (listing: CareerTransferListing, loan?: boolean) => void;
}) {
  return (
    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
      <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Transfer</p>
          <h3 className="text-xl font-black uppercase italic">Pazar</h3>
        </div>
        <button type="button" onClick={onRefresh} className="game-button flex items-center gap-2 border-2 border-black bg-yellow-400 px-3 py-2 text-[10px] font-black uppercase text-black">
          <RefreshCw size={14} /> Yenile
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs font-black uppercase text-white/70">
        <WalletCards size={16} /> {formatMoney(save.club.transferBudget)}
      </p>
      <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto pr-1">
        {save.transferMarket.length === 0 && <p className="border border-white/15 p-4 text-xs font-bold uppercase text-white/45">Pazar boş. Yenile butonuna bas.</p>}
        {save.transferMarket.map((listing) => (
          <div key={listing.player.playerId} className="border border-white/15 bg-white/5 p-3 text-xs font-black">
            <p className="truncate uppercase">{listing.player.name}</p>
            <p className="mt-1 text-[10px] uppercase text-white/45">Yaş {listing.player.age} / Pot {listing.player.potential} / RAT {listing.player.rating}</p>
            <p className="mt-1 text-[10px] uppercase text-yellow-400">{formatMoney(listing.askingPrice)} / Kiralama {formatMoney(listing.loanFee)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onBuy(listing)} className="game-button border border-black bg-green-600 px-2 py-2 text-[9px] uppercase text-white">Oyuncu Al</button>
              <button type="button" onClick={() => onBuy(listing, true)} className="game-button border border-black bg-blue-600 px-2 py-2 text-[9px] uppercase text-white">Kirala</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FacilitiesPanel({
  save,
  onUpgrade,
}: {
  save: CareerSave;
  onUpgrade: (facility: keyof CareerSave['facilities']) => void;
}) {
  const items: Array<{ key: keyof CareerSave['facilities']; label: string; icon: React.ReactNode; effect: string }> = [
    { key: 'training', label: 'Antrenman Tesisi', icon: <Dumbbell size={18} />, effect: 'Oyuncu gelişimi' },
    { key: 'youth', label: 'Altyapı Tesisi', icon: <GraduationCap size={18} />, effect: 'Genç kalitesi' },
    { key: 'medical', label: 'Sağlık Merkezi', icon: <HeartPulse size={18} />, effect: 'Yaş düşüşü ve sakatlık riski' },
    { key: 'scouting', label: 'Scouting Merkezi', icon: <ShieldCheck size={18} />, effect: 'Transfer pazarı kalitesi' },
  ];

  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Kulüp tesisleri</p>
      <h3 className="text-xl font-black uppercase italic">Seviye 1-5</h3>
      <p className="mt-2 text-xs font-black uppercase opacity-60">Kulüp bütçesi: {formatMoney(save.club.budget)}</p>
      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const level = save.facilities[item.key];
          return (
            <div key={item.key} className="grid gap-2 border-2 border-black bg-zinc-100 p-3 text-xs font-black sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="flex items-center gap-2 uppercase">{item.icon}{item.label} / {level}/5</p>
                <p className="mt-1 text-[10px] uppercase opacity-55">{item.effect}</p>
              </div>
              <button type="button" disabled={level >= 5} onClick={() => onUpgrade(item.key)} className="game-button border-2 border-black bg-yellow-400 px-3 py-2 text-[10px] font-black uppercase disabled:opacity-40">
                Geliştir
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RosterPanel({
  save,
  onSell,
}: {
  save: CareerSave;
  onSell: (player: CareerPlayerState, loanOut?: boolean) => void;
}) {
  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="border-b-2 border-black pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Kadro</p>
        <h3 className="text-2xl font-black uppercase italic">Oyuncu gelişimi ve satış</h3>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {save.roster
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 24)
          .map((player) => (
            <div key={player.playerId} className={`grid gap-2 border-2 border-black p-3 text-xs font-black sm:grid-cols-[1fr_auto] sm:items-center ${player.loanStatus === 'loanedOut' ? 'bg-zinc-200 opacity-60' : 'bg-zinc-100'}`}>
              <div className="min-w-0">
                <p className="truncate uppercase">#{player.number} {player.name}</p>
                <p className="mt-1 text-[10px] uppercase opacity-55">Yaş {player.age} / Pot {player.potential} / RAT {player.rating} / Form {player.form}</p>
                <p className="mt-1 text-[10px] uppercase text-yellow-700">{formatMoney(player.marketValue)} {player.loanStatus !== 'owned' ? `/ ${player.loanStatus}` : ''}</p>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={() => onSell(player)} className="game-button border border-black bg-red-600 px-2 py-2 text-[9px] uppercase text-white">Sat</button>
                <button type="button" onClick={() => onSell(player, true)} className="game-button border border-black bg-blue-600 px-2 py-2 text-[9px] uppercase text-white">Kiralık</button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

function YouthPanel({
  save,
  onPromote,
}: {
  save: CareerSave;
  onPromote: (player: CareerPlayerState) => void;
}) {
  return (
    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Genç Oyuncular</p>
      <h3 className="text-2xl font-black uppercase italic">Altyapı havuzu</h3>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {save.youthAcademy.map((player) => (
          <div key={player.playerId} className="grid gap-2 border border-white/15 bg-white/5 p-3 text-xs font-black sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="uppercase">{player.name}</p>
              <p className="mt-1 text-[10px] uppercase text-white/45">Yaş {player.age} / Potansiyel {player.potential} / RAT {player.rating}</p>
            </div>
            <button type="button" onClick={() => onPromote(player)} className="game-button border border-black bg-yellow-400 px-3 py-2 text-[9px] uppercase text-black">A Takım</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryPanel({ save }: { save: CareerSave }) {
  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Kariyer geçmişi</p>
      <h3 className="text-xl font-black uppercase italic">Profil</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CareerMiniStat label="Toplam G" value={save.totalWins} />
        <CareerMiniStat label="Kupa" value={save.trophies.length} />
      </div>
      <div className="mt-4 space-y-2">
        {save.history.length === 0 && <p className="text-xs font-bold uppercase opacity-45">Henüz sezon tamamlanmadı.</p>}
        {save.history.map((entry) => (
          <div key={`${entry.season}-${entry.teamName}`} className="border-2 border-black bg-zinc-100 p-3 text-[10px] font-black uppercase">
            S{entry.season} / {entry.teamName} / {entry.leaguePosition}. sıra / {entry.points} puan / {entry.note}
          </div>
        ))}
      </div>
    </section>
  );
}

function LeagueTable({
  rows,
  teamNameOf,
  userTeamId,
}: {
  rows: StandingRow[];
  teamNameOf: (teamId: string) => string;
  userTeamId: string;
}) {
  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
        <CalendarDays className="text-yellow-600" />
        <h3 className="text-2xl font-black uppercase italic">Lig Tablosu</h3>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[2.5rem_1fr_repeat(8,3rem)] gap-1 border-b-2 border-black pb-2 text-center text-[9px] font-black uppercase">
            <span>#</span><span className="text-left">Takım</span><span>O</span><span>G</span><span>B</span><span>M</span><span>A</span><span>Y</span><span>AV</span><span>P</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.teamId} className={`grid grid-cols-[2.5rem_1fr_repeat(8,3rem)] gap-1 border-b border-black/10 py-2 text-center text-[11px] font-black ${row.teamId === userTeamId ? 'bg-yellow-400' : ''}`}>
              <span>{index + 1}</span>
              <span className="truncate text-left uppercase">{teamNameOf(row.teamId)}</span>
              <span>{row.played}</span><span>{row.wins}</span><span>{row.draws}</span><span>{row.losses}</span>
              <span>{row.goalsFor}</span><span>{row.goalsAgainst}</span>
              <span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span>
              <span>{row.points}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FixtureRow({
  fixture,
  teamNameOf,
  userTeamId,
  dark = false,
}: {
  fixture: CompetitionFixture;
  teamNameOf: (teamId: string) => string;
  userTeamId: string;
  dark?: boolean;
}) {
  const score = finalScore(fixture);
  const isUser = fixture.homeTeamId === userTeamId || fixture.awayTeamId === userTeamId;
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-2 border-black p-3 text-xs font-black shadow-[3px_3px_0px_0px_#000] ${isUser ? 'bg-yellow-400 text-black' : dark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      <span className="truncate text-right uppercase">{teamNameOf(fixture.homeTeamId)}</span>
      <span className="min-w-20 text-center text-xl tabular-nums">{score ? `${score.home} - ${score.away}` : 'VS'}</span>
      <span className="truncate text-left uppercase">{teamNameOf(fixture.awayTeamId)}</span>
    </div>
  );
}

function CareerMiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-black bg-black px-3 py-2 text-center text-white">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] opacity-55">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
