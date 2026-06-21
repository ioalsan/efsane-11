'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Crown,
  LogIn,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shuffle,
  Trash2,
  Trophy,
  UserRound,
  Users,
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
import { FORMATIONS, type FormationType } from '@/lib/formations';
import {
  createEmptyManagerLeague,
  createManagerUser,
  createTeamSave,
  loadManagerLeague,
  MANAGER_TEAM_ID,
  resetManagerLeague,
  saveManagerLeague,
  type DraftRarity,
  type ManagerLeagueSave,
  type RosterBuildMode,
  type TeamSave,
  type TransferListing,
} from '@/lib/managerLeague';
import {
  getCompetitionTeamStrength,
  getCompetitionTeams,
  getCompetitions,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from '@/lib/seasonRepository';
import {
  getSquadManagementSummary,
  getTacticProfile,
  type ManagerMentality,
} from '@/lib/teamManagement';
import { getCaptainRole } from '@/lib/captain';
import { ensureLocalUser } from '@/lib/authService';
import { upsertSaveGame } from '@/lib/saveGameService';
import type { Player, SeasonDataset, SeasonTeam } from '@/types';
import LiveMatchPanel from './LiveMatchPanel';

const BOT_COMPETITION_ID = 'super-lig';
const DEFAULT_SOURCE_COMPETITION_ID = 'super-lig';
const TOTAL_ROSTER_SIZE = 23;
const DEFAULT_DRAFT_TRANSFER_BUDGET = 55_000_000;
const DEFAULT_DRAFT_BUDGET = 95_000_000;
const tacticOptions: ManagerMentality[] = ['Gegenpress', 'Balanced', 'ParkTheBus'];
const rosterTargets = ['starting', 'substitute', 'reserve'] as const;

type RosterTarget = typeof rosterTargets[number];
type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

const targetLabels: Record<RosterTarget, string> = {
  starting: 'İlk 11',
  substitute: 'Yedek',
  reserve: 'Rezerv',
};

const targetLimits: Record<RosterTarget, number> = {
  starting: 11,
  substitute: 7,
  reserve: 5,
};

const positionTargets: Record<PositionGroup, number> = {
  GK: 2,
  DEF: 7,
  MID: 8,
  ATT: 5,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundMoney = (value: number) => Math.round(value / 50_000) * 50_000;

const formatMoney = (value: number) => (
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
);

const getPlayerLabel = (player: Player | undefined) => (
  player ? `#${player.jersey_number} ${player.name}` : 'Boş'
);

const getPlayerPositionLabel = (player: Player) => {
  const secondary = player.secondaryPositions?.length ? `/${player.secondaryPositions.join('/')}` : '';
  return `${player.primaryPosition ?? player.position}${secondary}`;
};

const finalScore = (fixture: CompetitionFixture) => fixture.result?.extraTime ?? fixture.result?.normalTime ?? null;

const playerScore = (player: Player) => player.overall_rating + (player.form ?? 0) * 0.25;

const getPositionGroup = (player: Player): PositionGroup => {
  const position = player.primaryPosition;
  if (position === 'GK') return 'GK';
  if (position === 'CB' || position === 'LB' || position === 'RB') return 'DEF';
  if (position === 'DM' || position === 'CM' || position === 'AM') return 'MID';
  return 'ATT';
};

const getRarity = (player: Player): DraftRarity => {
  if (player.overall_rating >= 86) return 'elite';
  if (player.overall_rating >= 80) return 'rare';
  return 'common';
};

const rarityLabel: Record<DraftRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  elite: 'Elite',
};

const rarityClass: Record<DraftRarity, string> = {
  common: 'bg-zinc-200 text-black',
  rare: 'bg-blue-600 text-white',
  elite: 'bg-yellow-400 text-black',
};

const calculatePlayerMarketValue = (player: Player) => {
  const ratingBase = Math.max(1, player.overall_rating - 40);
  const formBonus = Math.max(0, player.form ?? 0) * 150_000;
  const rarityBonus = getRarity(player) === 'elite' ? 1.25 : getRarity(player) === 'rare' ? 1.12 : 1;
  return roundMoney(Math.max(500_000, (ratingBase ** 2) * 12_000 * rarityBonus + formBonus));
};

const createTransferListing = (player: Player): TransferListing => {
  const rarity = getRarity(player);
  const marketValue = calculatePlayerMarketValue(player);
  const markup = rarity === 'elite' ? 1.35 : rarity === 'rare' ? 1.18 : 1.07;
  return {
    playerId: player.id,
    marketValue,
    askingPrice: roundMoney(marketValue * markup),
    rarity,
    listedAt: new Date().toISOString(),
  };
};

const getTeamRating = (players: ReturnType<typeof getTeamPlayers>, strengthBonus: number) => {
  if (players.length === 0) return 72 + strengthBonus;
  const average = players.reduce((total, player) => total + player.rating + player.form * 0.3, 0) / players.length;
  return Math.max(55, Math.min(96, Math.round(average + strengthBonus)));
};

const getTeamEconomy = (strength: number) => {
  const prestige = clamp(Math.round(strength + 4), 45, 99);
  const transferBudget = roundMoney(clamp((102 - prestige) * 1_350_000 + 16_000_000, 18_000_000, 92_000_000));
  const budget = roundMoney(transferBudget + prestige * 1_100_000);
  const boardExpectation = prestige >= 88
    ? 'Şampiyonluk yarışı ve Avrupa hedefi'
    : prestige >= 80
      ? 'İlk 4 ve kupa iddiası'
      : prestige >= 72
        ? 'Üst sıra ve istikrarlı sezon'
        : 'Ligde kal, gençleri geliştir';

  return {
    prestige,
    budget,
    transferBudget,
    boardExpectation,
    wageLevel: Math.round(prestige * 1_000_000),
  };
};

const getDraftEconomy = () => ({
  prestige: 70,
  budget: DEFAULT_DRAFT_BUDGET,
  transferBudget: DEFAULT_DRAFT_TRANSFER_BUDGET,
  boardExpectation: 'Dengeli kadro kur, orta sıraları zorla',
  wageLevel: 55_000_000,
});

const getSortedTeamPlayers = (teamId: string, dataset: SeasonDataset) => (
  getTeamPlayers(teamId, dataset)
    .map(toLegacyPlayer)
    .sort((a, b) => playerScore(b) - playerScore(a))
);

const buildBalancedRoster = (players: Player[]) => {
  const available = [...players];
  const picked = new Set<string>();
  const take = (group: PositionGroup, count: number) => {
    const selected: string[] = [];
    available
      .filter((player) => !picked.has(player.id) && getPositionGroup(player) === group)
      .slice(0, count)
      .forEach((player) => {
        picked.add(player.id);
        selected.push(player.id);
      });
    return selected;
  };

  const startingXI = [
    ...take('GK', 1),
    ...take('DEF', 4),
    ...take('MID', 4),
    ...take('ATT', 2),
  ];

  available
    .filter((player) => !picked.has(player.id))
    .slice(0, 11 - startingXI.length)
    .forEach((player) => {
      picked.add(player.id);
      startingXI.push(player.id);
    });

  const remaining = available.filter((player) => !picked.has(player.id));
  const substitutes = remaining.slice(0, 7).map((player) => player.id);
  const reserves = remaining.slice(7, 12).map((player) => player.id);

  return { startingXI, substitutes, reserves };
};

const createBotTeams = (dataset: SeasonDataset, excludedTeamId: string | undefined): CompetitionTeam[] => (
  getCompetitionTeams(BOT_COMPETITION_ID, dataset)
    .filter((team) => team.id !== excludedTeamId)
    .slice(0, 17)
    .map((team) => {
      const players = getTeamPlayers(team.id, dataset)
        .sort((a, b) => b.rating + b.form - (a.rating + a.form))
        .slice(0, 23);
      return {
        id: team.id,
        name: team.name,
        rating: getTeamRating(players, team.strengthBonus),
        tactic: 'Balanced' as const,
        chemistry: 72,
        players: players.map(toCompetitionPlayer),
      };
    })
);

const buildManagerTeam = (
  team: TeamSave,
  playerById: Map<string, Player>,
): CompetitionTeam => {
  const startingPlayers = team.startingXI
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const benchPlayers = team.substitutes
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const captain = playerById.get(team.captainId ?? '');
  const captainRole = getCaptainRole(captain);
  const summary = getSquadManagementSummary({
    selectedPlayers: startingPlayers,
    formationId: team.formation,
    captainId: team.captainId,
    mentality: team.tactic,
  });

  return {
    id: MANAGER_TEAM_ID,
    name: team.teamName,
    rating: summary.power,
    isUser: true,
    tactic: team.tactic,
    chemistry: summary.chemistry,
    captainImpact: captainRole ? captainRole.bonus * 2 : 0,
    captainRoleTitle: captainRole?.title,
    players: [...startingPlayers, ...benchPlayers].map(toCompetitionPlayer),
  };
};

const getLeagueTeams = (
  dataset: SeasonDataset,
  team: TeamSave | null,
  playerById: Map<string, Player>,
) => {
  const bots = createBotTeams(dataset, team?.sourceTeamId);
  if (!team) return bots;
  return [buildManagerTeam(team, playerById), ...bots];
};

const getForm = (teamId: string, fixtures: CompetitionFixture[]) => {
  const played = fixtures
    .filter((fixture) => fixture.result && (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId))
    .slice(-5);
  return played.map((fixture) => {
    const score = finalScore(fixture);
    if (!score) return '-';
    const goalsFor = fixture.homeTeamId === teamId ? score.home : score.away;
    const goalsAgainst = fixture.homeTeamId === teamId ? score.away : score.home;
    if (goalsFor > goalsAgainst) return 'G';
    if (goalsFor < goalsAgainst) return 'M';
    return 'B';
  }).join(' ');
};

const countPositions = (ids: string[], playerById: Map<string, Player>) => {
  const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  ids.forEach((id) => {
    const player = playerById.get(id);
    if (!player) return;
    counts[getPositionGroup(player)] += 1;
  });
  return counts;
};

const getPositionNeeds = (ids: string[], playerById: Map<string, Player>) => {
  const counts = countPositions(ids, playerById);
  return (Object.keys(positionTargets) as PositionGroup[])
    .map((group) => ({
      group,
      current: counts[group],
      target: positionTargets[group],
      missing: Math.max(0, positionTargets[group] - counts[group]),
    }));
};

const pickWeightedTeam = (teams: SeasonTeam[], dataset: SeasonDataset) => {
  const weighted = teams.map((team) => {
    const strength = getCompetitionTeamStrength(team.id, dataset);
    const strengthPenalty = strength >= 88 ? 0.45 : strength >= 82 ? 0.68 : 1;
    return {
      team,
      weight: Math.max(4, 112 - strength) * strengthPenalty,
    };
  });
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.team;
  }
  return weighted[0]?.team ?? null;
};

const createMarket = (players: Player[], selectedIds: Set<string>) => {
  const pool = players
    .filter((player) => !selectedIds.has(player.id))
    .sort(() => Math.random() - 0.5);
  const count = 12 + Math.floor(Math.random() * 9);
  return pool.slice(0, count).map(createTransferListing);
};

export default function ManagerLeague({ onBackToQuick }: { onBackToQuick: () => void }) {
  const dataset = useMemo(() => getSeasonDataset(), []);
  const competitions = useMemo(() => getCompetitions(dataset), [dataset]);
  const allPlayers = useMemo(() => dataset.players.map(toLegacyPlayer), [dataset]);
  const playerById = useMemo(() => new Map(allPlayers.map((player) => [player.id, player])), [allPlayers]);
  const [save, setSave] = useState<ManagerLeagueSave | null>(null);
  const [migrationNotice, setMigrationNotice] = useState('');
  const [username, setUsername] = useState('');
  const [teamName, setTeamName] = useState('Canlı11 FC');
  const [formation, setFormation] = useState<FormationType>('4-2-3-1');
  const [tactic, setTactic] = useState<ManagerMentality>('Balanced');
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [startingXI, setStartingXI] = useState<string[]>([]);
  const [substitutes, setSubstitutes] = useState<string[]>([]);
  const [reserves, setReserves] = useState<string[]>([]);
  const [buildMode, setBuildMode] = useState<RosterBuildMode | null>(null);
  const [sourceCompetitionId, setSourceCompetitionId] = useState(DEFAULT_SOURCE_COMPETITION_ID);
  const [sourceTeamId, setSourceTeamId] = useState<string | null>(null);
  const draftEconomy = getDraftEconomy();
  const [prestige, setPrestige] = useState(draftEconomy.prestige);
  const [budget, setBudget] = useState(draftEconomy.budget);
  const [boardExpectation, setBoardExpectation] = useState(draftEconomy.boardExpectation);
  const [transferBudget, setTransferBudget] = useState(draftEconomy.transferBudget);
  const [rolledTeamId, setRolledTeamId] = useState<string | null>(null);
  const [draftPickAvailable, setDraftPickAvailable] = useState(false);
  const [draftMessage, setDraftMessage] = useState('Takım çevir, gelen takımdan sadece 1 oyuncu seç.');
  const [transferMarket, setTransferMarket] = useState<TransferListing[]>([]);
  const [marketMessage, setMarketMessage] = useState('');
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [pendingRound, setPendingRound] = useState<CompetitionFixture[] | null>(null);
  const authRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef<HTMLDivElement | null>(null);
  const leagueRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  const selectedIds = useMemo(() => new Set([...startingXI, ...substitutes, ...reserves]), [reserves, startingXI, substitutes]);
  const selectedAllIds = useMemo(() => [...startingXI, ...substitutes, ...reserves], [reserves, startingXI, substitutes]);
  const selectedPlayers = startingXI.map((id) => playerById.get(id) ?? null);
  const selectedTotal = selectedAllIds.length;
  const sourceTeams = useMemo(() => getCompetitionTeams(sourceCompetitionId, dataset), [dataset, sourceCompetitionId]);
  const rolledTeam = rolledTeamId ? dataset.teams.find((team) => team.id === rolledTeamId) ?? null : null;
  const rolledPlayers = useMemo(
    () => (rolledTeamId ? getSortedTeamPlayers(rolledTeamId, dataset) : []),
    [dataset, rolledTeamId],
  );
  const positionNeeds = useMemo(() => getPositionNeeds(selectedAllIds, playerById), [playerById, selectedAllIds]);

  const summary = getSquadManagementSummary({
    selectedPlayers,
    formationId: formation,
    captainId,
    mentality: tactic,
  });
  const tacticProfile = getTacticProfile(tactic);
  const canSaveTeam = Boolean(save?.user) &&
    Boolean(buildMode) &&
    startingXI.length === 11 &&
    substitutes.length === 7 &&
    reserves.length === 5 &&
    Boolean(captainId);
  const canStartLeague = canSaveTeam && Boolean(save?.user);
  const fixtures = save?.fixtures ?? [];
  const flatFixtures = fixtures.flat();
  const teams = useMemo(() => getLeagueTeams(dataset, save?.team ?? null, playerById), [dataset, playerById, save?.team]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const standings = calculateStandings(teams.map((team) => team.id), flatFixtures);
  const currentWeek = save?.currentWeek ?? 0;
  const currentRound = fixtures[currentWeek] ?? [];
  const seasonOver = Boolean(save?.seasonStarted && currentWeek >= 34);
  const latestFixture = flatFixtures.find((fixture) => fixture.id === save?.latestFixtureId) ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loaded = loadManagerLeague();
      if (loaded.migrated) {
        setMigrationNotice('Menajer Ligi sistemi güncellendi. Eski kayıt sıfırlandı; yeni sezon başlatman gerekiyor.');
      }
      if (!loaded.save) return;
      setSave(loaded.save);
      setTransferMarket(loaded.save.transferMarket);
      if (loaded.save.team) {
        setTeamName(loaded.save.team.teamName);
        setFormation(loaded.save.team.formation);
        setTactic(loaded.save.team.tactic);
        setCaptainId(loaded.save.team.captainId);
        setStartingXI(loaded.save.team.startingXI);
        setSubstitutes(loaded.save.team.substitutes);
        setReserves(loaded.save.team.reserves);
        setBuildMode(loaded.save.team.buildMode);
        setSourceTeamId(loaded.save.team.sourceTeamId ?? null);
        setPrestige(loaded.save.team.prestige);
        setBudget(loaded.save.team.budget);
        setBoardExpectation(loaded.save.team.boardExpectation);
        setTransferBudget(loaded.save.team.transferBudget);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const persist = (nextSave: ManagerLeagueSave) => {
    setSave(nextSave);
    saveManagerLeague(nextSave);
    const user = ensureLocalUser(nextSave.user.username);
    upsertSaveGame({
      userId: user.id,
      activeMode: 'manager',
      managerLeagueSave: nextSave,
    });
  };

  useEffect(() => {
    const target = !save?.user ? authRef.current : save.seasonStarted ? leagueRef.current : setupRef.current;
    if (!target || !window.matchMedia('(max-width: 767px)').matches) return;
    window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [save?.seasonStarted, save?.user]);

  useEffect(() => {
    if (!liveFixture || !window.matchMedia('(max-width: 767px)').matches) return;
    window.setTimeout(() => liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [liveFixture]);

  const createSession = (mode: 'guest' | 'demo' | 'named') => {
    const user = createManagerUser(
      mode === 'guest' ? 'Misafir Menajer' : mode === 'demo' ? 'Demo Menajer' : username,
      mode === 'guest' ? 'guest' : 'user',
    );
    persist(createEmptyManagerLeague(user));
  };

  const resetRoster = () => {
    setStartingXI([]);
    setSubstitutes([]);
    setReserves([]);
    setCaptainId(null);
    setSourceTeamId(null);
    setRolledTeamId(null);
    setDraftPickAvailable(false);
    setTransferMarket([]);
    setMarketMessage('');
  };

  const selectBuildMode = (mode: RosterBuildMode) => {
    resetRoster();
    setBuildMode(mode);
    if (mode === 'draft') {
      const economy = getDraftEconomy();
      setTeamName('Canlı11 Draft FC');
      setPrestige(economy.prestige);
      setBudget(economy.budget);
      setBoardExpectation(economy.boardExpectation);
      setTransferBudget(economy.transferBudget);
      setDraftMessage('Takım çevir, gelen takımdan sadece 1 oyuncu seç.');
    }
  };

  const addPlayer = (playerId: string, target: RosterTarget) => {
    if (selectedIds.has(playerId)) return false;
    if (target === 'starting' && startingXI.length < targetLimits.starting) {
      setStartingXI((items) => [...items, playerId]);
      return true;
    }
    if (target === 'substitute' && substitutes.length < targetLimits.substitute) {
      setSubstitutes((items) => [...items, playerId]);
      return true;
    }
    if (target === 'reserve' && reserves.length < targetLimits.reserve) {
      setReserves((items) => [...items, playerId]);
      return true;
    }
    return false;
  };

  const removePlayer = (playerId: string) => {
    setStartingXI((items) => items.filter((id) => id !== playerId));
    setSubstitutes((items) => items.filter((id) => id !== playerId));
    setReserves((items) => items.filter((id) => id !== playerId));
    if (captainId === playerId) setCaptainId(null);
  };

  const sellPlayer = (playerId: string) => {
    const player = playerById.get(playerId);
    if (!player) return;
    const sellValue = roundMoney(calculatePlayerMarketValue(player) * 0.72);
    removePlayer(playerId);
    setTransferBudget((value) => value + sellValue);
    setMarketMessage(`${player.name} satıldı. Bütçeye ${formatMoney(sellValue)} eklendi.`);
  };

  const chooseSourceTeam = (teamId: string) => {
    const team = dataset.teams.find((item) => item.id === teamId);
    if (!team) return;
    const players = getSortedTeamPlayers(teamId, dataset);
    const roster = buildBalancedRoster(players);
    const strength = getCompetitionTeamStrength(teamId, dataset);
    const economy = getTeamEconomy(strength);
    const captain = roster.startingXI
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player))
      .sort((a, b) => b.overall_rating - a.overall_rating)[0];

    setBuildMode('team');
    setSourceTeamId(teamId);
    setTeamName(team.name);
    setStartingXI(roster.startingXI);
    setSubstitutes(roster.substitutes);
    setReserves(roster.reserves);
    setCaptainId(captain?.id ?? null);
    setPrestige(economy.prestige);
    setBudget(economy.budget);
    setBoardExpectation(economy.boardExpectation);
    setTransferBudget(economy.transferBudget);
    setTransferMarket([]);
    setMarketMessage(`${team.name} kadrosu yüklendi. Güçlü takım seçtiysen transfer bütçesi daha sınırlı.`);
  };

  const rollDraftTeam = () => {
    if (buildMode !== 'draft') return;
    if (selectedTotal >= TOTAL_ROSTER_SIZE) {
      setDraftMessage('23 kişilik kadro tamamlandı. Artık kaptan seçip lige başlayabilirsin.');
      return;
    }
    if (draftPickAvailable && rolledTeamId) {
      setDraftMessage('Oyuncu seçmeden yeniden takım çeviremezsin.');
      return;
    }
    const pool = sourceTeams.length > 0 ? sourceTeams : dataset.teams;
    const team = pickWeightedTeam(pool, dataset);
    if (!team) return;
    setRolledTeamId(team.id);
    setDraftPickAvailable(true);
    setDraftMessage(`${team.name} geldi. Bu kadrodan yalnızca 1 futbolcu seç.`);
  };

  const draftPick = (playerId: string, target: RosterTarget) => {
    if (buildMode !== 'draft' || !draftPickAvailable || !rolledTeamId) return;
    const player = playerById.get(playerId);
    if (!player || player.teamId !== rolledTeamId) return;
    if (!addPlayer(playerId, target)) {
      setDraftMessage(`${targetLabels[target]} alanı dolu veya oyuncu daha önce seçildi.`);
      return;
    }
    setDraftPickAvailable(false);
    setDraftMessage(`${player.name} seçildi. Yeni takım çevirebilirsin.`);
    if (!captainId && target === 'starting') setCaptainId(playerId);
  };

  const refreshMarket = () => {
    const nextMarket = createMarket(allPlayers, selectedIds);
    setTransferMarket(nextMarket);
    setMarketMessage(`${nextMarket.length} oyunculuk transfer pazarı yenilendi.`);
  };

  const buyPlayer = (listing: TransferListing, target: RosterTarget) => {
    const player = playerById.get(listing.playerId);
    if (!player) return;
    if (transferBudget < listing.askingPrice) {
      setMarketMessage(`${player.name} için bütçe yetersiz.`);
      return;
    }
    if (!addPlayer(player.id, target)) {
      setMarketMessage(`${targetLabels[target]} alanı dolu veya oyuncu zaten kadroda.`);
      return;
    }
    const nextBudget = transferBudget - listing.askingPrice;
    setTransferBudget(nextBudget);
    setTransferMarket((items) => items.filter((item) => item.playerId !== listing.playerId));
    setMarketMessage(`${player.name} transfer edildi. Kalan bütçe: ${formatMoney(nextBudget)}.`);
  };

  const buildCurrentTeamSave = () => {
    if (!save?.user || !canSaveTeam || !buildMode) return null;
    return createTeamSave({
      ownerId: save.user.id,
      teamName,
      formation,
      tactic,
      captainId,
      startingXI,
      substitutes,
      reserves,
      buildMode,
      sourceTeamId: sourceTeamId ?? undefined,
      prestige,
      budget,
      boardExpectation,
      transferBudget,
    });
  };

  const saveTeam = () => {
    if (!save?.user) return null;
    const team = buildCurrentTeamSave();
    if (!team) return null;
    const nextSave = {
      ...save,
      team,
      transferMarket,
      latestFixtureId: null,
      updatedAt: new Date().toISOString(),
    };
    persist(nextSave);
    return team;
  };

  const startLeague = () => {
    if (!save?.user) return;
    const team = buildCurrentTeamSave();
    if (!team) return;
    const botTeamIds = createBotTeams(dataset, team.sourceTeamId).map((item) => item.id);
    const rounds = generateRoundRobin([MANAGER_TEAM_ID, ...botTeamIds], true).slice(0, 34);
    persist({
      ...save,
      team,
      transferMarket,
      fixtures: rounds,
      currentWeek: 0,
      seasonStarted: true,
      latestFixtureId: null,
      updatedAt: new Date().toISOString(),
    });
  };

  const resetAll = () => {
    resetManagerLeague();
    setSave(null);
    setBuildMode(null);
    setStartingXI([]);
    setSubstitutes([]);
    setReserves([]);
    setCaptainId(null);
    setLiveFixture(null);
    setPendingRound(null);
    setTransferMarket([]);
    setMigrationNotice('');
  };

  const simulateWeek = () => {
    if (!save?.team || !save.seasonStarted || currentRound.length === 0 || liveFixture) return;
    const matchTeams = new Map(getLeagueTeams(dataset, save.team, playerById).map((team) => [team.id, team]));
    const playedRound = currentRound.map((fixture) => {
      const home = matchTeams.get(fixture.homeTeamId);
      const away = matchTeams.get(fixture.awayTeamId);
      if (!home || !away) return fixture;
      return {
        ...fixture,
        result: simulateCompetitionMatch(home, away, false, dataset.settings, {
          allowSubstitutions: true,
          longSimulation: true,
        }),
      };
    });
    const userFixture = playedRound.find((fixture) => fixture.homeTeamId === MANAGER_TEAM_ID || fixture.awayTeamId === MANAGER_TEAM_ID);
    setPendingRound(playedRound);
    if (userFixture?.result) setLiveFixture(userFixture);
  };

  const completeWeek = () => {
    if (!save || !pendingRound) return;
    const userFixture = pendingRound.find((fixture) => fixture.homeTeamId === MANAGER_TEAM_ID || fixture.awayTeamId === MANAGER_TEAM_ID);
    const nextFixtures = fixtures.map((round, index) => index === currentWeek ? pendingRound : round);
    persist({
      ...save,
      fixtures: nextFixtures,
      currentWeek: currentWeek + 1,
      latestFixtureId: userFixture?.id ?? save.latestFixtureId,
      updatedAt: new Date().toISOString(),
    });
    setLiveFixture(null);
    setPendingRound(null);
  };

  const teamNameOf = (teamId: string) => teamMap.get(teamId)?.name ?? teamId;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-500">Kalıcı Mod</p>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">Menajer Ligi</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/60">
              Serbest tüm futbolcu seçimi kapalı. Takım seçerek başla veya 23 kişilik kadroyu kontrollü draft ile kur.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToQuick}
            className="game-button border-2 border-black bg-yellow-400 px-5 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
          >
            Hızlı Oyna Moduna Dön
          </button>
        </div>
      </section>

      {migrationNotice && (
        <section className="border-4 border-black bg-yellow-300 p-4 text-sm font-black uppercase text-black shadow-[5px_5px_0px_0px_#000]">
          {migrationNotice}
        </section>
      )}

      {!save?.user && (
        <section ref={authRef} className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
          <div className="flex items-center gap-3 border-b-2 border-black pb-4">
            <UserRound className="text-yellow-600" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Üyelik Hazırlığı</p>
              <h3 className="text-2xl font-black uppercase italic">Demo giriş</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <button type="button" onClick={() => createSession('guest')} className="game-button border-2 border-black bg-zinc-900 p-4 text-left text-white shadow-[4px_4px_0px_0px_#000]">
              <span className="block text-sm font-black uppercase">Misafir olarak devam et</span>
              <span className="mt-1 block text-[10px] font-bold uppercase opacity-60">Local demo profil</span>
            </button>
            <button type="button" onClick={() => createSession('demo')} className="game-button border-2 border-black bg-yellow-400 p-4 text-left text-black shadow-[4px_4px_0px_0px_#000]">
              <span className="block text-sm font-black uppercase">Demo kullanıcı oluştur</span>
              <span className="mt-1 block text-[10px] font-bold uppercase opacity-60">İleride auth servisine taşınır</span>
            </button>
            <div className="border-2 border-black bg-zinc-100 p-4 shadow-[4px_4px_0px_0px_#000]">
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full border-2 border-black px-3 py-3 text-sm font-black uppercase outline-none"
                placeholder="Kullanıcı adı"
              />
              <button type="button" onClick={() => createSession('named')} className="game-button mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white">
                <LogIn size={16} /> Giriş Yap
              </button>
            </div>
          </div>
        </section>
      )}

      {save?.user && !save.seasonStarted && (
        <section ref={setupRef} className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4 border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
            <div className="border-b border-white/15 pb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">1/7 Kulüp oluştur</p>
              <h3 className="text-2xl font-black uppercase italic">{save.user.username}</h3>
              <p className="mt-1 text-xs font-bold text-white/50">Rol: {save.user.role}</p>
            </div>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Takım adı</span>
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="w-full border-2 border-black px-3 py-3 text-sm font-black uppercase text-black outline-none" />
            </label>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Diziliş</p>
              <div className="grid grid-cols-2 gap-2">
                {FORMATIONS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setFormation(item.id)} className={`game-button border-2 border-black px-3 py-2 text-xs font-black ${formation === item.id ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}>
                    {item.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Taktik</p>
              <div className="space-y-2">
                {tacticOptions.map((option) => {
                  const profile = getTacticProfile(option);
                  return (
                    <button key={option} type="button" onClick={() => setTactic(option)} className={`game-button w-full border-2 border-black px-3 py-3 text-left text-xs font-black ${tactic === option ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}>
                      {profile.label}
                      <span className="mt-1 block text-[9px] font-bold opacity-60">{profile.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ManagerMiniStat label="Güç" value={summary.power} />
              <ManagerMiniStat label="Kimya" value={summary.chemistry} />
              <ManagerMiniStat label="Prestij" value={prestige} />
              <ManagerMiniStat label="Bütçe" value={formatMoney(transferBudget)} />
            </div>
            <div className="border-2 border-white/15 bg-white/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-500">Yönetim beklentisi</p>
              <p className="mt-1 text-xs font-black uppercase text-white/70">{boardExpectation}</p>
            </div>
            <p className="text-[10px] font-bold uppercase leading-relaxed text-white/50">
              Kadro: {selectedTotal}/23. İlk 11: {startingXI.length}/11, Yedek: {substitutes.length}/7, Rezerv: {reserves.length}/5. Lige başlamak için kaptan ve tam 23 kişilik kadro zorunlu.
            </p>
            <button type="button" onClick={saveTeam} disabled={!canSaveTeam} className="game-button flex w-full items-center justify-center gap-2 border-2 border-black bg-green-600 px-4 py-4 text-xs font-black uppercase text-white disabled:opacity-40">
              <Save size={16} /> Takımı Kaydet
            </button>
            <button type="button" onClick={startLeague} disabled={!canStartLeague} className="game-button flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-5 text-lg font-black uppercase text-black disabled:opacity-40">
              <Trophy size={20} /> Lige Başla
            </button>
          </aside>

          <div className="space-y-5">
            {!buildMode && (
              <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                <div className="border-b-2 border-black pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">2/7 Başlangıç yöntemi</p>
                  <h3 className="text-2xl font-black uppercase italic">Kadro kurma biçimini seç</h3>
                </div>
                <div className="mt-4 border-2 border-black bg-yellow-200 p-3 text-xs font-black uppercase">
                  Kulüp kadrosuyla hızlı başlamak isteyenler için önerilen seçenek: Takım Seçerek Başla.
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button type="button" onClick={() => selectBuildMode('team')} className="game-button border-4 border-black bg-yellow-400 p-5 text-left text-black shadow-[5px_5px_0px_0px_#000]">
                    <span className="mb-2 inline-block border-2 border-black bg-black px-2 py-1 text-[9px] font-black uppercase text-yellow-400">Önerilen</span>
                    <span className="block text-xl font-black uppercase italic">Takım Seçerek Başla</span>
                    <span className="mt-2 block text-xs font-bold uppercase opacity-70">Gerçek takım kadrosu gelir. Güçlü takımda bütçe düşük, beklenti yüksek olur.</span>
                  </button>
                  <button type="button" onClick={() => selectBuildMode('draft')} className="game-button border-4 border-black bg-zinc-950 p-5 text-left text-white shadow-[5px_5px_0px_0px_#000]">
                    <span className="block text-xl font-black uppercase italic">Draft ile Sıfırdan Kur</span>
                    <span className="mt-2 block text-xs font-bold uppercase text-white/60">Takım çevir, gelen kadrodan 1 futbolcu seç. 23 kişi tamamlanana kadar devam et.</span>
                  </button>
                </div>
              </section>
            )}

            {buildMode === 'team' && (
              <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">2/7 Takım seç</p>
                    <h3 className="text-2xl font-black uppercase italic">Gerçek kadroyla başla</h3>
                  </div>
                  <CompetitionSelect competitions={competitions} value={sourceCompetitionId} onChange={setSourceCompetitionId} />
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sourceTeams.map((team) => {
                    const strength = getCompetitionTeamStrength(team.id, dataset);
                    const economy = getTeamEconomy(strength);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => chooseSourceTeam(team.id)}
                        className={`game-button border-2 border-black p-4 text-left shadow-[4px_4px_0px_0px_#000] ${sourceTeamId === team.id ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}
                      >
                        <span className="block text-sm font-black uppercase">{team.name}</span>
                        <span className="mt-1 block text-[10px] font-black uppercase opacity-55">{team.country} / {team.league}</span>
                        <span className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase">
                          <span className="border border-black bg-white p-2">Güç {strength}</span>
                          <span className="border border-black bg-white p-2">Prestij {economy.prestige}</span>
                          <span className="border border-black bg-white p-2">{formatMoney(economy.transferBudget)}</span>
                        </span>
                        <span className="mt-2 block text-[10px] font-bold uppercase opacity-60">{economy.boardExpectation}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {buildMode === 'draft' && (
              <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                <div className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">2/7 Draft</p>
                    <h3 className="text-2xl font-black uppercase italic">Takım çevir, 1 oyuncu seç</h3>
                    <p className="mt-1 text-xs font-bold uppercase text-white/55">{draftMessage}</p>
                  </div>
                  <CompetitionSelect competitions={competitions} value={sourceCompetitionId} onChange={setSourceCompetitionId} dark />
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={rollDraftTeam}
                      disabled={draftPickAvailable || selectedTotal >= TOTAL_ROSTER_SIZE}
                      className="game-button flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-5 text-sm font-black uppercase text-black disabled:opacity-40"
                    >
                      <Shuffle size={18} /> Takım Çevir
                    </button>
                    <div className="border-2 border-white/15 bg-white/5 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-500">İlerleme</p>
                      <div className="mt-2 h-3 border border-white/20 bg-black">
                        <div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, (selectedTotal / TOTAL_ROSTER_SIZE) * 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs font-black uppercase">{selectedTotal} / {TOTAL_ROSTER_SIZE}</p>
                    </div>
                    <PositionNeeds needs={positionNeeds} />
                  </div>
                  <div className="min-h-[260px] border-2 border-white/15 bg-white/5 p-4">
                    {rolledTeam ? (
                      <>
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-500">Gelen takım</p>
                            <h4 className="text-xl font-black uppercase italic">{rolledTeam.name}</h4>
                          </div>
                          <span className="border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black">
                            {draftPickAvailable ? '1 seçim hakkı var' : 'Seçim yapıldı'}
                          </span>
                        </div>
                        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                          {rolledPlayers.map((player) => {
                            const selected = selectedIds.has(player.id);
                            return (
                              <PlayerPickRow
                                key={player.id}
                                player={player}
                                disabled={!draftPickAvailable || selected}
                                selected={selected}
                                onPick={(target) => draftPick(player.id, target)}
                              />
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="grid min-h-[240px] place-items-center border-2 border-dashed border-white/20 text-center">
                        <div>
                          <Users className="mx-auto text-yellow-500" />
                          <p className="mt-3 text-sm font-black uppercase">Takım çevirmek için butona bas</p>
                          <p className="mt-1 text-xs font-bold uppercase text-white/45">Güçlü takımlar daha nadir gelir.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
              <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">3/7 Kadro yönetimi</p>
                  <h3 className="text-2xl font-black uppercase italic">İlk 11 + Yedek + Rezerv</h3>
                </div>
                <div className="border-2 border-black bg-yellow-400 px-3 py-2 text-xs font-black uppercase">
                  {selectedTotal} / 23
                </div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <RosterBlock title="İlk 11" ids={startingXI} playerById={playerById} captainId={captainId} onCaptain={setCaptainId} onRemove={removePlayer} onSell={sellPlayer} />
                <RosterBlock title="Yedek Kulübesi" ids={substitutes} playerById={playerById} captainId={captainId} onCaptain={setCaptainId} onRemove={removePlayer} onSell={sellPlayer} />
                <RosterBlock title="Rezerv" ids={reserves} playerById={playerById} captainId={captainId} onCaptain={setCaptainId} onRemove={removePlayer} onSell={sellPlayer} />
              </div>
            </section>

            {buildMode && (
              <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                <div className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Transfer modu</p>
                    <h3 className="text-2xl font-black uppercase italic">Bütçeli transfer pazarı</h3>
                    <p className="mt-1 text-xs font-bold uppercase text-white/50">{marketMessage || 'Serbest tüm futbolcu listesi yok. Pazar rastgele 12-20 oyuncu sunar.'}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <span className="flex items-center justify-center gap-2 border-2 border-black bg-white px-3 py-3 text-xs font-black uppercase text-black">
                      <WalletCards size={16} /> {formatMoney(transferBudget)}
                    </span>
                    <button type="button" onClick={refreshMarket} className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black">
                      <RefreshCw size={16} /> Pazarı Yenile
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {transferMarket.length === 0 && (
                    <div className="border-2 border-dashed border-white/20 p-6 text-center text-xs font-black uppercase text-white/45">
                      Transfer pazarı boş. Rastgele liste almak için pazarı yenile.
                    </div>
                  )}
                  {transferMarket.map((listing) => {
                    const player = playerById.get(listing.playerId);
                    if (!player) return null;
                    const selected = selectedIds.has(player.id);
                    return (
                      <div key={listing.playerId} className={`grid gap-3 border-2 border-white/15 bg-white/5 p-3 text-xs font-black sm:grid-cols-[1fr_auto] sm:items-center ${selected ? 'opacity-45' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate uppercase">{getPlayerLabel(player)}</span>
                            <span className={`px-2 py-1 text-[8px] font-black uppercase ${rarityClass[listing.rarity]}`}>{rarityLabel[listing.rarity]}</span>
                          </div>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
                            {getPlayerPositionLabel(player)} / RAT {player.overall_rating} / Değer {formatMoney(listing.marketValue)} / İstenen {formatMoney(listing.askingPrice)}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {rosterTargets.map((target) => (
                            <button
                              key={target}
                              type="button"
                              disabled={selected || transferBudget < listing.askingPrice || (target === 'starting' && startingXI.length >= 11) || (target === 'substitute' && substitutes.length >= 7) || (target === 'reserve' && reserves.length >= 5)}
                              onClick={() => buyPlayer(listing, target)}
                              className="game-button border border-black bg-green-600 px-2 py-2 text-[9px] uppercase text-white disabled:opacity-30"
                            >
                              {targetLabels[target]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {save?.team && save.seasonStarted && (
        <section ref={leagueRef} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
              <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Maç günü</p>
                  <h3 className="text-3xl font-black uppercase italic">{save.team.teamName}</h3>
                  <p className="mt-1 text-xs font-black uppercase text-yellow-600">Hafta {Math.min(currentWeek + 1, 34)} / 34</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={simulateWeek} disabled={Boolean(liveFixture) || seasonOver} className="game-button flex items-center gap-2 border-4 border-black bg-green-600 px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-40">
                    <Play size={18} fill="currentColor" /> Haftayı Oyna
                  </button>
                  <button type="button" onClick={resetAll} className="game-button border-2 border-black bg-red-600 px-3 py-3 text-white">
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
              {seasonOver ? (
                <div className="mt-5 border-2 border-black bg-yellow-400 p-5 text-black">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">Sezon Özeti</p>
                  <h4 className="mt-1 text-2xl font-black uppercase italic">34 haftalık lig tamamlandı</h4>
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {currentRound.map((fixture) => (
                    <FixtureRow key={fixture.id} fixture={fixture} teamNameOf={teamNameOf} />
                  ))}
                </div>
              )}
            </section>

            <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Kadro Durumu</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ManagerMiniStat label="Güç" value={summary.power} />
                <ManagerMiniStat label="Kimya" value={summary.chemistry} />
                <ManagerMiniStat label="İlk 11" value={save.team.startingXI.length} />
                <ManagerMiniStat label="Yedek" value={save.team.substitutes.length} />
              </div>
              <p className="mt-4 text-xs font-bold leading-relaxed text-white/55">
                {tacticProfile.description} Oyuncu değişiklikleri bu modda aktif; hızlı draft maçlarında kapalı kalır.
              </p>
            </section>
          </div>

          {liveFixture?.result && (
            <div ref={liveRef} className="scroll-mt-4 md:scroll-mt-8">
              <LiveMatchPanel
                fixture={liveFixture}
                result={liveFixture.result}
                homeName={teamNameOf(liveFixture.homeTeamId)}
                awayName={teamNameOf(liveFixture.awayTeamId)}
                onComplete={completeWeek}
                simulationMode="manager"
              />
            </div>
          )}

          {latestFixture?.result && !liveFixture && (
            <section className="border-4 border-black bg-zinc-900 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Son Maç Raporu</p>
              <FixtureRow fixture={latestFixture} teamNameOf={teamNameOf} dark />
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                <ManagerMiniStat label="Şut" value={`${latestFixture.result.stats.shotsHome}-${latestFixture.result.stats.shotsAway}`} />
                <ManagerMiniStat label="İsabet" value={`${latestFixture.result.stats.shotsOnTargetHome}-${latestFixture.result.stats.shotsOnTargetAway}`} />
                <ManagerMiniStat label="Pas" value={`${latestFixture.result.stats.passesHome}-${latestFixture.result.stats.passesAway}`} />
                <ManagerMiniStat label="Faul" value={`${latestFixture.result.stats.foulsHome}-${latestFixture.result.stats.foulsAway}`} />
                <ManagerMiniStat label="Top" value={`%${latestFixture.result.stats.possessionHome}`} />
              </div>
            </section>
          )}

          <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
              <CalendarDays className="text-yellow-600" />
              <h3 className="text-2xl font-black uppercase italic">Puan Durumu</h3>
            </div>
            <LeagueTable rows={standings} fixtures={flatFixtures} teamNameOf={teamNameOf} />
          </section>
        </section>
      )}
    </div>
  );
}

function CompetitionSelect({
  competitions,
  value,
  onChange,
  dark = false,
}: {
  competitions: ReturnType<typeof getCompetitions>;
  value: string;
  onChange: (value: string) => void;
  dark?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`border-2 border-black px-3 py-3 text-xs font-black uppercase outline-none ${dark ? 'bg-white text-black' : 'bg-zinc-100 text-black'}`}
    >
      {competitions.map((competition) => (
        <option key={competition.competitionId} value={competition.competitionId}>
          {competition.competitionName}
        </option>
      ))}
    </select>
  );
}

function PositionNeeds({ needs }: { needs: ReturnType<typeof getPositionNeeds> }) {
  const labels: Record<PositionGroup, string> = {
    GK: 'Kaleci',
    DEF: 'Defans',
    MID: 'Orta saha',
    ATT: 'Hücum',
  };
  return (
    <div className="border-2 border-white/15 bg-white/5 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-500">Pozisyon dengesi</p>
      <div className="mt-2 grid gap-1">
        {needs.map((need) => (
          <div key={need.group} className="flex justify-between text-[10px] font-black uppercase text-white/70">
            <span>{labels[need.group]}</span>
            <span className={need.missing > 0 ? 'text-yellow-400' : 'text-green-400'}>{need.current}/{need.target}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerPickRow({
  player,
  selected,
  disabled,
  onPick,
}: {
  player: Player;
  selected: boolean;
  disabled: boolean;
  onPick: (target: RosterTarget) => void;
}) {
  const rarity = getRarity(player);
  return (
    <div className={`grid gap-2 border-2 border-white/15 bg-white/5 p-3 text-xs font-black sm:grid-cols-[1fr_auto] sm:items-center ${selected ? 'opacity-45' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate uppercase">{getPlayerLabel(player)}</p>
          <span className={`px-2 py-1 text-[8px] font-black uppercase ${rarityClass[rarity]}`}>{rarityLabel[rarity]}</span>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
          {getPlayerPositionLabel(player)} / {player.nationality ?? 'N/A'} / RAT {player.overall_rating}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {rosterTargets.map((target) => (
          <button
            key={target}
            type="button"
            disabled={disabled}
            onClick={() => onPick(target)}
            className="game-button border border-black bg-yellow-400 px-2 py-2 text-[9px] uppercase text-black disabled:opacity-30"
          >
            {targetLabels[target]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RosterBlock({
  title,
  ids,
  playerById,
  captainId,
  onCaptain,
  onRemove,
  onSell,
}: {
  title: string;
  ids: string[];
  playerById: Map<string, Player>;
  captainId: string | null;
  onCaptain: (playerId: string) => void;
  onRemove: (playerId: string) => void;
  onSell: (playerId: string) => void;
}) {
  return (
    <div className="border-2 border-black bg-zinc-100 p-3">
      <h4 className="mb-3 text-sm font-black uppercase">{title} ({ids.length})</h4>
      <div className="space-y-2">
        {ids.length === 0 && <p className="text-xs font-black uppercase opacity-40">Boş</p>}
        {ids.map((id) => {
          const player = playerById.get(id);
          return (
            <div key={id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border border-black bg-white p-2 text-xs font-black">
              <span className="min-w-0 truncate uppercase">{getPlayerLabel(player)}</span>
              <button type="button" onClick={() => onCaptain(id)} className={`grid h-7 w-7 place-items-center border border-black ${captainId === id ? 'bg-yellow-400 text-black' : 'bg-black text-yellow-400'}`}>
                <Crown size={13} fill={captainId === id ? 'currentColor' : 'none'} />
              </button>
              <button type="button" onClick={() => onSell(id)} className="grid h-7 w-10 place-items-center border border-black bg-green-600 text-[9px] font-black uppercase text-white">
                Sat
              </button>
              <button type="button" onClick={() => onRemove(id)} className="grid h-7 w-7 place-items-center border border-black bg-red-600 text-white">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FixtureRow({
  fixture,
  teamNameOf,
  dark = false,
}: {
  fixture: CompetitionFixture;
  teamNameOf: (teamId: string) => string;
  dark?: boolean;
}) {
  const score = finalScore(fixture);
  const isUser = fixture.homeTeamId === MANAGER_TEAM_ID || fixture.awayTeamId === MANAGER_TEAM_ID;
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-2 border-black p-3 text-xs font-black shadow-[3px_3px_0px_0px_#000] ${isUser ? 'bg-yellow-400 text-black' : dark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      <span className="truncate text-right uppercase">{teamNameOf(fixture.homeTeamId)}</span>
      <span className="min-w-20 text-center text-xl tabular-nums">{score ? `${score.home} - ${score.away}` : 'VS'}</span>
      <span className="truncate text-left uppercase">{teamNameOf(fixture.awayTeamId)}</span>
    </div>
  );
}

function LeagueTable({
  rows,
  fixtures,
  teamNameOf,
}: {
  rows: StandingRow[];
  fixtures: CompetitionFixture[];
  teamNameOf: (teamId: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[2.5rem_1fr_repeat(8,3rem)_5rem] gap-1 border-b-2 border-black pb-2 text-center text-[9px] font-black uppercase">
          <span>#</span><span className="text-left">Takım</span><span>O</span><span>G</span><span>B</span><span>M</span><span>A</span><span>Y</span><span>AV</span><span>P</span><span>Form</span>
        </div>
        {rows.map((row, index) => (
          <div key={row.teamId} className={`grid grid-cols-[2.5rem_1fr_repeat(8,3rem)_5rem] gap-1 border-b border-black/10 py-2 text-center text-[11px] font-black ${row.teamId === MANAGER_TEAM_ID ? 'bg-yellow-400' : ''}`}>
            <span>{index + 1}</span>
            <span className="truncate text-left uppercase">{teamNameOf(row.teamId)}</span>
            <span>{row.played}</span>
            <span>{row.wins}</span>
            <span>{row.draws}</span>
            <span>{row.losses}</span>
            <span>{row.goalsFor}</span>
            <span>{row.goalsAgainst}</span>
            <span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span>
            <span>{row.points}</span>
            <span>{getForm(row.teamId, fixtures) || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagerMiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-black bg-black px-3 py-2 text-center text-white">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] opacity-55">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
