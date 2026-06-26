'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Crown,
  Eye,
  Link2,
  LogIn,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trophy,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import LiveMatchPanel from './LiveMatchPanel';
import { useTeamStore } from '@/store/useTeamStore';
import {
  createLeague,
  createLocalFriendLeague,
  getLeagueHighlights,
  getPowerLimitCap,
  getRealTeamReplacementPlan,
  getTeamDisplayName,
  joinLeague,
  listLeagues,
  consumeMultiplayerMigrationNotice,
  savePlayerSlotToLeague,
  saveTeamToLeague,
  simulateWeek,
  startLocalFriendLeague,
  startLeague,
  buildMultiplayerTeamInput,
  type MultiplayerLeague as MultiplayerLeagueSave,
  type MultiplayerMaxUsers,
  type MultiplayerPowerLimit,
  type MultiplayerStandingRow,
  type PlayerSlot,
  type PlayerSlotTeamInput,
} from '@/lib/multiplayerService';
import {
  createLeague as createOnlineLeague,
  joinLeague as joinOnlineLeague,
  saveTeamToLeague as saveOnlineTeamToLeague,
  simulateWeek as simulateOnlineWeek,
  startLeague as startOnlineLeague,
  subscribeOnlineLeagues,
} from '@/lib/multiplayerFirestoreService';
import {
  isFirebaseConfigured,
  subscribeAnonymousUser,
} from '@/lib/firebase';
import {
  DEFAULT_COMPETITION_ID,
  getCompetitions,
  getCompetitionSquads,
  getCompetitionTeams,
  getSeasonDataset,
  toLegacyPlayer,
} from '@/lib/seasonRepository';
import {
  createLocalUser,
  getCurrentUser,
  saveCurrentUser,
  type LocalAuthUser,
} from '@/lib/authService';
import { FORMATIONS, type FormationType, type PositionConfig } from '@/lib/formations';
import type { ManagerMentality } from '@/lib/teamManagement';
import type { CompetitionFixture } from '@/lib/competitionEngine';
import type { Player, SeasonTeam, Squad } from '@/types';
import Pitch from './Pitch';

const maxUserOptions: MultiplayerMaxUsers[] = [4, 8, 12, 18];
const friendCountOptions = [2, 3, 4, 5];
const powerLimitOptions: MultiplayerPowerLimit[] = ['balanced', 'max80', 'max85', 'free'];
const tacticOptions: ManagerMentality[] = ['Gegenpress', 'Balanced', 'ParkTheBus'];
const friendCompetitionIds = [
  DEFAULT_COMPETITION_ID,
  'champions-league',
  'europa-league',
  'conference-league',
  'world-cup-2026',
];

const powerLimitLabels: Record<MultiplayerPowerLimit, string> = {
  balanced: 'Dengeli',
  max80: 'Maksimum 80',
  max85: 'Maksimum 85',
  free: 'Serbest',
};

const statusLabels: Record<MultiplayerLeagueSave['status'], string> = {
  waiting: 'Bekleme',
  active: 'Aktif',
  completed: 'Tamamlandı',
};

type NoticeTone = 'info' | 'success' | 'error';

interface Notice {
  tone: NoticeTone;
  text: string;
}

type RosterTarget = 'startingXI' | 'substitutes' | 'reserves';

interface SlotDraft {
  displayName: string;
  teamName: string;
  formation: FormationType;
  tactic: ManagerMentality;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
  rolledSquadId: string | null;
  pickAvailable: boolean;
  autoRoll: boolean;
}

interface InviteDraft {
  teamName: string;
  formation: FormationType | null;
  tactic: ManagerMentality | null;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  reserves: string[];
  rolledSquadId: string | null;
  pickAvailable: boolean;
  autoRoll: boolean;
}

type PlacementSource = 'pool' | 'draft' | RosterTarget;

interface PlacementSelection {
  playerId: string;
  source: PlacementSource;
  slotIndex?: number;
}

const rosterTargetLabels: Record<RosterTarget, string> = {
  startingXI: 'İlk 11',
  substitutes: 'Yedek',
  reserves: 'Rezerv',
};

const rosterTargetLimits: Record<RosterTarget, number> = {
  startingXI: 11,
  substitutes: 7,
  reserves: 5,
};

const compactIds = (ids: string[]) => ids.filter((id) => id.trim().length > 0);

const getRosterCount = (ids: string[]) => compactIds(ids).length;

const hasBrokenRosterSave = (roster: { startingXI: string[]; substitutes: string[] }) => (
  getRosterCount(roster.startingXI) === 0 && getRosterCount(roster.substitutes) > 0
);

const normalizeStartingSlots = (ids: string[]) => (
  Array.from({ length: rosterTargetLimits.startingXI }, (_, index) => ids[index] ?? '')
);

const createEmptyInviteDraft = (): InviteDraft => ({
  teamName: '',
  formation: null,
  tactic: null,
  captainId: null,
  startingXI: normalizeStartingSlots([]),
  substitutes: [],
  reserves: [],
  rolledSquadId: null,
  pickAvailable: false,
  autoRoll: false,
});

const modernPositionToLegacy: Record<string, Player['position']> = {
  GK: 'KL',
  CB: 'STP',
  LB: 'SLB',
  RB: 'SÃ„Å¾B' as Player['position'],
  DM: 'MO',
  CM: 'MO',
  AM: 'MO',
  LW: 'SLK',
  RW: 'SÃ„Å¾K' as Player['position'],
  ST: 'SF',
};

const positionLabel = (position: string) => {
  const labels: Record<string, string> = {
    KL: 'KL',
    STP: 'STP',
    SLB: 'SLB',
    'SÄžB': 'SGB',
    MO: 'MO',
    SLK: 'SLK',
    'SÄžK': 'SGK',
    SF: 'SNT',
  };
  return labels[position] ?? position;
};

type ClipboardNavigator = Navigator & {
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
};

const hasClipboardWriter = (value: Navigator): value is ClipboardNavigator => (
  'clipboard' in value
  && typeof (value as ClipboardNavigator).clipboard?.writeText === 'function'
);

const copyText = async (text: string) => {
  if (typeof navigator !== 'undefined' && hasClipboardWriter(navigator)) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard permissions can be blocked; fallback below keeps the action usable.
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

const noticeClasses: Record<NoticeTone, string> = {
  info: 'border-blue-500 bg-blue-500/10 text-blue-100',
  success: 'border-green-500 bg-green-500/10 text-green-100',
  error: 'border-red-500 bg-red-500/10 text-red-100',
};

const finalScore = (fixture: CompetitionFixture) => fixture.result?.extraTime ?? fixture.result?.normalTime ?? null;

const playerScore = (player: Player) => player.overall_rating + (player.form ?? 0) * 0.25;

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'İşlem tamamlanamadı.'
);

const createDraftFromSlot = (slot: PlayerSlot): SlotDraft => ({
  displayName: slot.displayName,
  teamName: slot.teamName,
  formation: slot.formation ?? '4-2-3-1',
  tactic: slot.tactic ?? 'Balanced',
  captainId: slot.captainId,
  startingXI: normalizeStartingSlots(slot.selectedSquad?.startingXI ?? []),
  substitutes: slot.selectedSquad?.substitutes ?? [],
  reserves: slot.selectedSquad?.reserves ?? [],
  rolledSquadId: null,
  pickAvailable: false,
  autoRoll: false,
});

const removeRosterPlayer = <
  T extends {
    startingXI: string[];
    substitutes: string[];
    reserves: string[];
    captainId: string | null;
  },
>(draft: T, playerId: string): T => {
  const nextStartingXI = normalizeStartingSlots(draft.startingXI).map((id) => (id === playerId ? '' : id));
  const captainStillStarts = draft.captainId
    ? nextStartingXI.includes(draft.captainId)
    : false;
  return {
    ...draft,
    startingXI: nextStartingXI,
    substitutes: draft.substitutes.filter((id) => id !== playerId),
    reserves: draft.reserves.filter((id) => id !== playerId),
    captainId: captainStillStarts ? draft.captainId : null,
  };
};

const addRosterPlayer = <
  T extends {
    startingXI: string[];
    substitutes: string[];
    reserves: string[];
  },
>(draft: T, playerId: string, target: RosterTarget, slotIndex?: number): T => {
  if (target === 'startingXI') {
    if (typeof slotIndex !== 'number') return draft;
    const nextStartingXI = normalizeStartingSlots(draft.startingXI);
    if (nextStartingXI[slotIndex]) return draft;
    nextStartingXI[slotIndex] = playerId;
    return { ...draft, startingXI: nextStartingXI };
  }

  const currentIds = compactIds(draft[target]);
  if (currentIds.length >= rosterTargetLimits[target]) return draft;
  return { ...draft, [target]: [...currentIds, playerId] };
};

const draftPlayerIds = (draft: Pick<SlotDraft, 'startingXI' | 'substitutes' | 'reserves'>) => [
  ...draft.startingXI,
  ...draft.substitutes,
  ...draft.reserves,
].filter((id) => id.trim().length > 0);

const getDraftPlayers = (ids: string[], playerById: Map<string, Player>) => (
  ids.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player))
);

const getPositionWarnings = (players: Player[]) => {
  const counts = {
    goalkeeper: players.filter((player) => player.position === 'KL').length,
    defense: players.filter((player) => ['STP', 'SLB', 'SÄžB'].includes(player.position)).length,
    midfield: players.filter((player) => player.position === 'MO').length,
    attack: players.filter((player) => ['SLK', 'SÄžK', 'SF'].includes(player.position)).length,
  };
  const warnings: string[] = [];
  if (counts.goalkeeper < 2) warnings.push('Kaleci eksik');
  if (counts.defense < 7) warnings.push('Defans eksik');
  if (counts.midfield < 6) warnings.push('Orta saha eksik');
  if (counts.attack < 5) warnings.push('Forvet eksik');
  return warnings;
};

const getAverageRating = (players: Player[]) => {
  if (players.length === 0) return 0;
  return Math.round(players.reduce((total, player) => total + player.overall_rating, 0) / players.length);
};

const getPlayerStats = (player: Player) => {
  const attributes = player.attributes;
  return {
    pace: attributes?.pace ?? player.overall_rating,
    shooting: attributes?.shooting ?? player.overall_rating,
    passing: attributes?.passing ?? player.overall_rating,
    dribbling: attributes?.dribbling ?? player.overall_rating,
    defense: attributes?.defense ?? player.overall_rating,
    physical: attributes?.attack ?? player.overall_rating,
  };
};

const getSquadTeamMeta = (squad: Squad | null, teamById: Map<string, SeasonTeam>) => {
  const teamId = squad?.players[0]?.teamId;
  return teamId ? teamById.get(teamId) ?? null : null;
};

const getStarCount = (rating: number) => Math.max(1, Math.min(5, Math.round((rating - 58) / 7)));

const isPositionCompatible = (player: Player, allowedPosition: string) => {
  const positions = new Set([
    player.position,
    player.secondary_position,
    ...(player.compatiblePositions ?? []),
    ...(player.primaryPosition ? [modernPositionToLegacy[player.primaryPosition]] : []),
    ...(player.secondaryPositions ?? []).map((position) => modernPositionToLegacy[position]),
  ].filter(Boolean));
  return positions.has(allowedPosition as Player['position']);
};

export default function MultiplayerLeague({
  onBackToQuick,
  focusMode = 'friends',
}: {
  onBackToQuick: () => void;
  focusMode?: 'friends' | 'invite';
}) {
  const dataset = useMemo(() => getSeasonDataset(), []);
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const formation = useTeamStore((state) => state.formation);
  const tactic = useTeamStore((state) => state.mentality);
  const captainId = useTeamStore((state) => state.captainId);
  const squadName = useTeamStore((state) => state.squadName);
  const competitionId = useTeamStore((state) => state.competitionId);

  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const [managerName, setManagerName] = useState('Canlı11 Menajeri');
  const [leagues, setLeagues] = useState<MultiplayerLeagueSave[]>([]);
  const [onlineInviteLeagues, setOnlineInviteLeagues] = useState<MultiplayerLeagueSave[]>([]);
  const [onlineReady, setOnlineReady] = useState(false);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState('Hafta Sonu Ligi');
  const [maxUsers, setMaxUsers] = useState<MultiplayerMaxUsers>(8);
  const [friendCount, setFriendCount] = useState(3);
  const [friendCompetitionId, setFriendCompetitionId] = useState(DEFAULT_COMPETITION_ID);
  const [powerLimit, setPowerLimit] = useState<MultiplayerPowerLimit>('balanced');
  const [inviteCode, setInviteCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [userMatchQueue, setUserMatchQueue] = useState<CompetitionFixture[]>([]);
  const [pendingPlacementPlayerId, setPendingPlacementPlayerId] = useState<string | null>(null);
  const [pendingPlacementSource, setPendingPlacementSource] = useState<PlacementSelection | null>(null);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(() => createEmptyInviteDraft());
  const [invitePlacement, setInvitePlacement] = useState<PlacementSelection | null>(null);

  const onlineConfigured = isFirebaseConfigured();

  const showRosterMigrationNotice = useCallback(() => {
    if (!consumeMultiplayerMigrationNotice()) return;
    setNotice({ tone: 'info', text: 'Eski bozuk kadro kaydı temizlendi. Takımını yeniden kur.' });
  }, []);

  const getVisibleLeagues = (onlineItems = onlineInviteLeagues) => {
    const localLeagues = listLeagues();
    showRosterMigrationNotice();
    if (!onlineConfigured) return localLeagues;
    return [
      ...localLeagues.filter((league) => league.mode === 'local-friends'),
      ...onlineItems,
    ];
  };

  const refreshLeagues = (selectedId = activeLeagueId, onlineItems = onlineInviteLeagues) => {
    const nextLeagues = getVisibleLeagues(onlineItems);
    setLeagues(nextLeagues);
    if (selectedId && nextLeagues.some((league) => league.id === selectedId)) {
      setActiveLeagueId(selectedId);
      return;
    }
    setActiveLeagueId(nextLeagues[0]?.id ?? null);
  };

  const refreshOnlineLeague = (league: MultiplayerLeagueSave) => {
    const nextOnlineLeagues = [
      league,
      ...onlineInviteLeagues.filter((item) => item.id !== league.id),
    ];
    setOnlineInviteLeagues(nextOnlineLeagues);
    refreshLeagues(league.id, nextOnlineLeagues);
  };

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;
    let unsubscribeLeagues: (() => void) | null = null;
    const selectLeagueList = (nextLeagues: MultiplayerLeagueSave[]) => {
      setLeagues(nextLeagues);
      setActiveLeagueId((selectedId) => (
        selectedId && nextLeagues.some((league) => league.id === selectedId)
          ? selectedId
          : nextLeagues[0]?.id ?? null
      ));
    };
    const listLocalLeagues = () => {
      const localLeagues = listLeagues();
      showRosterMigrationNotice();
      return localLeagues;
    };
    const timer = window.setTimeout(() => {
      const existingUser = getCurrentUser();
      const currentUser = existingUser ?? createLocalUser();
      if (!existingUser) saveCurrentUser(currentUser);
      setManagerName(currentUser.username);

      if (!isFirebaseConfigured()) {
        setUser(currentUser);
        setOnlineReady(false);
        selectLeagueList(listLocalLeagues());
        return;
      }

      unsubscribeAuth = subscribeAnonymousUser((firebaseUser) => {
        if (!firebaseUser) {
          setUser(currentUser);
          setOnlineReady(false);
          selectLeagueList(listLocalLeagues().filter((league) => league.mode === 'local-friends'));
          return;
        }

        const onlineUser = {
          ...currentUser,
          id: firebaseUser.uid,
        };
        setUser(onlineUser);
        setOnlineReady(true);
        unsubscribeLeagues?.();
        unsubscribeLeagues = subscribeOnlineLeagues(firebaseUser.uid, (items) => {
          setOnlineInviteLeagues(items);
          selectLeagueList([
            ...listLocalLeagues().filter((league) => league.mode === 'local-friends'),
            ...items,
          ]);
        }, (error) => {
          setNotice({ tone: 'error', text: getErrorMessage(error) });
        });
      }, (error) => {
        setOnlineReady(false);
        setNotice({ tone: 'error', text: getErrorMessage(error) });
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      unsubscribeAuth?.();
      unsubscribeLeagues?.();
    };
  }, [showRosterMigrationNotice]);

  const activeLeague = useMemo(
    () => leagues.find((league) => league.id === activeLeagueId) ?? leagues[0] ?? null,
    [activeLeagueId, leagues],
  );
  const friendCompetitionOptions = useMemo(
    () => getCompetitions(dataset).filter((competition) => friendCompetitionIds.includes(competition.competitionId)),
    [dataset],
  );
  const activeCompetitionId = activeLeague?.competitionId ?? DEFAULT_COMPETITION_ID;
  const activeCompetition = useMemo(
    () => friendCompetitionOptions.find((competition) => competition.competitionId === activeCompetitionId) ?? null,
    [activeCompetitionId, friendCompetitionOptions],
  );
  const isLocalFriendLeague = activeLeague?.mode === 'local-friends';
  const isOnlineInviteLeague = Boolean(onlineConfigured && onlineReady && activeLeague?.mode === 'invite');
  const playerSlots = useMemo(() => activeLeague?.playerSlots ?? [], [activeLeague]);
  const activeSlot = useMemo(() => {
    if (!isLocalFriendLeague) return null;
    return playerSlots.find((slot) => slot.id === activeSlotId)
      ?? playerSlots.find((slot) => !slot.ready)
      ?? playerSlots[0]
      ?? null;
  }, [activeSlotId, isLocalFriendLeague, playerSlots]);
  const activeDraft = activeSlot ? slotDrafts[activeSlot.id] ?? createDraftFromSlot(activeSlot) : null;
  const allLeagueTeams = useMemo(
    () => activeLeague ? [...activeLeague.teams, ...activeLeague.botTeams] : [],
    [activeLeague],
  );
  const ownedTeam = useMemo(
    () => activeLeague?.teams.find((team) => team.ownerId === user?.id) ?? null,
    [activeLeague, user?.id],
  );
  const isOwner = Boolean(activeLeague && user && activeLeague.ownerId === user.id);
  const currentRound = activeLeague?.fixtures[activeLeague.currentWeek] ?? [];
  const flatFixtures = activeLeague?.fixtures.flat() ?? [];
  const latestFixture = activeLeague?.latestFixtureId
    ? flatFixtures.find((fixture) => fixture.id === activeLeague.latestFixtureId) ?? null
    : null;
  const highlights = activeLeague ? getLeagueHighlights(activeLeague) : null;
  const seasonWeekCount = activeLeague?.fixtures.length ?? 0;
  const botSlots = activeLeague
    ? Math.max(0, activeLeague.maxUsers - (isLocalFriendLeague ? playerSlots.length : activeLeague.teams.length))
    : 0;
  const showLegacyFriendDraft = Boolean(false);
  const humanTeamIds = useMemo(
    () => activeLeague?.teams.map((team) => team.id) ?? [],
    [activeLeague?.teams],
  );
  const realTeamPlan = useMemo(() => (
    getRealTeamReplacementPlan(
      isLocalFriendLeague ? playerSlots.length : activeLeague?.teams.length ?? 0,
      dataset,
      activeCompetitionId,
    )
  ), [activeCompetitionId, activeLeague?.teams.length, dataset, isLocalFriendLeague, playerSlots.length]);
  const includedRealTeams = activeLeague?.realTeams?.length ? activeLeague.realTeams : realTeamPlan.realTeams;
  const replacedRealTeams = activeLeague?.replacedTeams?.length ? activeLeague.replacedTeams : realTeamPlan.replacedTeams;

  const allPlayers = useMemo(
    () => dataset.players.map(toLegacyPlayer).sort((a, b) => playerScore(b) - playerScore(a)),
    [dataset],
  );
  const playerById = useMemo(
    () => new Map(allPlayers.map((player) => [player.id, player] as const)),
    [allPlayers],
  );
  const competitionTeams = useMemo(
    () => getCompetitionTeams(activeCompetitionId, dataset),
    [activeCompetitionId, dataset],
  );
  const teamById = useMemo(
    () => new Map(competitionTeams.map((team) => [team.id, team] as const)),
    [competitionTeams],
  );
  const draftSquads = useMemo(
    () => getCompetitionSquads(activeCompetitionId, dataset).filter((squad) => squad.players.length > 0),
    [activeCompetitionId, dataset],
  );
  const activeRolledSquad = useMemo(
    () => draftSquads.find((squad) => squad.id === activeDraft?.rolledSquadId) ?? null,
    [activeDraft?.rolledSquadId, draftSquads],
  );
  const activeRolledTeam = useMemo(
    () => getSquadTeamMeta(activeRolledSquad, teamById),
    [activeRolledSquad, teamById],
  );
  const activeRolledTeamRating = useMemo(
    () => activeRolledSquad ? getAverageRating(activeRolledSquad.players) : 0,
    [activeRolledSquad],
  );

  const startingPlayers = useMemo(
    () => selectedPlayers.filter((player): player is Player => Boolean(player)),
    [selectedPlayers],
  );
  const draftReady = Boolean(formation && tactic && captainId && startingPlayers.length === 11);
  const selectedIds = useMemo(() => new Set(startingPlayers.map((player) => player.id)), [startingPlayers]);
  const quickBenchPool = useMemo(() => {
    const competitionTeamIds = new Set(getCompetitionTeams(competitionId, dataset).map((team) => team.id));
    return dataset.players
      .filter((player) => player.isActive && competitionTeamIds.has(player.teamId) && !selectedIds.has(player.id))
      .map(toLegacyPlayer)
      .sort((a, b) => playerScore(b) - playerScore(a));
  }, [competitionId, dataset, selectedIds]);
  const substitutePlayers = useMemo(() => quickBenchPool.slice(0, 7), [quickBenchPool]);
  const quickReservePlayers = useMemo(() => quickBenchPool.slice(7, 12), [quickBenchPool]);

  const inviteStartingPlayers = useMemo(
    () => getDraftPlayers(compactIds(inviteDraft.startingXI), playerById),
    [inviteDraft.startingXI, playerById],
  );
  const inviteSubstitutePlayers = useMemo(
    () => getDraftPlayers(inviteDraft.substitutes, playerById),
    [inviteDraft.substitutes, playerById],
  );
  const inviteReservePlayers = useMemo(
    () => getDraftPlayers(inviteDraft.reserves, playerById),
    [inviteDraft.reserves, playerById],
  );

  const teamPreview = useMemo(() => {
    if (
      !user ||
      !inviteDraft.formation ||
      !inviteDraft.tactic ||
      !inviteDraft.captainId ||
      !inviteDraft.teamName.trim() ||
      inviteStartingPlayers.length !== 11 ||
      inviteSubstitutePlayers.length !== 7 ||
      !compactIds(inviteDraft.startingXI).includes(inviteDraft.captainId)
    ) return null;
    return buildMultiplayerTeamInput({
      ownerId: user.id,
      teamName: inviteDraft.teamName,
      formation: inviteDraft.formation,
      tactic: inviteDraft.tactic,
      captainId: inviteDraft.captainId,
      startingPlayers: inviteStartingPlayers,
      substitutes: inviteSubstitutePlayers,
      reserves: inviteReservePlayers,
    });
  }, [inviteDraft, inviteReservePlayers, inviteStartingPlayers, inviteSubstitutePlayers, user]);
  const powerCap = activeLeague ? getPowerLimitCap(activeLeague.powerLimit) : null;
  const exceedsPowerLimit = Boolean(teamPreview && powerCap && teamPreview.rating > powerCap);
  const inviteDraftTotal = useMemo(() => draftPlayerIds(inviteDraft).length, [inviteDraft]);
  const inviteDraftSelectedIds = useMemo(
    () => new Set(draftPlayerIds(inviteDraft)),
    [inviteDraft],
  );
  const inviteRolledSquad = useMemo(
    () => draftSquads.find((squad) => squad.id === inviteDraft.rolledSquadId) ?? null,
    [draftSquads, inviteDraft.rolledSquadId],
  );
  const inviteRolledTeam = useMemo(
    () => getSquadTeamMeta(inviteRolledSquad, teamById),
    [inviteRolledSquad, teamById],
  );
  const inviteRolledTeamRating = useMemo(
    () => inviteRolledSquad ? getAverageRating(inviteRolledSquad.players) : 0,
    [inviteRolledSquad],
  );
  const invitePlacementPlayer = invitePlacement ? playerById.get(invitePlacement.playerId) ?? null : null;
  const inviteSaveIssues = useMemo(() => {
    const issues: string[] = [];
    if (!inviteDraft.teamName.trim()) issues.push('Takim adi yok');
    if (!inviteDraft.formation) issues.push('Dizilis secilmedi');
    if (!inviteDraft.tactic) issues.push('Taktik secilmedi');
    if (getRosterCount(inviteDraft.startingXI) !== 11) issues.push(`Ilk 11 eksik: ${getRosterCount(inviteDraft.startingXI)}/11`);
    if (getRosterCount(inviteDraft.substitutes) !== 7) issues.push(`Yedekler eksik: ${getRosterCount(inviteDraft.substitutes)}/7`);
    if (!inviteDraft.captainId) issues.push('Kaptan secilmedi');
    if (inviteDraft.captainId && !compactIds(inviteDraft.startingXI).includes(inviteDraft.captainId)) {
      issues.push('Kaptan ilk 11 icinden secilmeli');
    }
    return issues;
  }, [inviteDraft]);
  const invitePositionWarnings = useMemo(
    () => getPositionWarnings([...inviteStartingPlayers, ...inviteSubstitutePlayers, ...inviteReservePlayers]),
    [inviteReservePlayers, inviteStartingPlayers, inviteSubstitutePlayers],
  );
  const invitePitchDraft = useMemo(() => ({
    teamName: inviteDraft.teamName,
    formation: inviteDraft.formation ?? '4-2-3-1' as FormationType,
    startingXI: inviteDraft.startingXI,
    substitutes: inviteDraft.substitutes,
    reserves: inviteDraft.reserves,
  }), [inviteDraft]);
  const inviteRollDraft = useMemo<SlotDraft>(() => ({
    displayName: managerName,
    teamName: inviteDraft.teamName,
    formation: inviteDraft.formation ?? '4-2-3-1',
    tactic: inviteDraft.tactic ?? 'Balanced',
    captainId: inviteDraft.captainId,
    startingXI: inviteDraft.startingXI,
    substitutes: inviteDraft.substitutes,
    reserves: inviteDraft.reserves,
    rolledSquadId: inviteDraft.rolledSquadId,
    pickAvailable: inviteDraft.pickAvailable,
    autoRoll: inviteDraft.autoRoll,
  }), [inviteDraft, managerName]);
  const quickInviteDraft = useMemo<InviteDraft>(() => {
    const quickStartingIds = selectedPlayers.map((player) => player?.id ?? '');
    const hasQuickStartingXI = startingPlayers.length === 11;
    const validCaptainId = captainId && quickStartingIds.includes(captainId) ? captainId : null;
    return {
      teamName: squadName,
      formation,
      tactic,
      captainId: validCaptainId,
      startingXI: normalizeStartingSlots(hasQuickStartingXI ? quickStartingIds : []),
      substitutes: hasQuickStartingXI ? substitutePlayers.map((player) => player.id) : [],
      reserves: hasQuickStartingXI ? quickReservePlayers.map((player) => player.id) : [],
      rolledSquadId: null,
      pickAvailable: false,
      autoRoll: false,
    };
  }, [captainId, formation, quickReservePlayers, selectedPlayers, squadName, startingPlayers.length, substitutePlayers, tactic]);
  const savedInviteDraft = useMemo<InviteDraft | null>(() => {
    if (!ownedTeam) return null;
    if (hasBrokenRosterSave(ownedTeam)) return null;
    return {
      teamName: ownedTeam.teamName,
      formation: ownedTeam.formation,
      tactic: ownedTeam.tactic,
      captainId: ownedTeam.captainId,
      startingXI: normalizeStartingSlots(ownedTeam.startingXI),
      substitutes: ownedTeam.substitutes,
      reserves: ownedTeam.reserves ?? [],
      rolledSquadId: null,
      pickAvailable: false,
      autoRoll: false,
    };
  }, [ownedTeam]);

  useEffect(() => {
    if (!activeLeague || activeLeague.mode !== 'invite' || !ownedTeam || !hasBrokenRosterSave(ownedTeam)) return;
    const timer = window.setTimeout(() => {
      setInviteDraft(createEmptyInviteDraft());
      setInvitePlacement(null);
      setNotice({ tone: 'info', text: 'Eski bozuk kadro kaydı temizlendi. Takımını yeniden kur.' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLeague, ownedTeam]);

  useEffect(() => {
    if (!activeLeague || activeLeague.mode !== 'invite' || activeLeague.status !== 'waiting') return;
    const timer = window.setTimeout(() => {
      setInviteDraft(savedInviteDraft ?? quickInviteDraft);
      setInvitePlacement(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLeague, quickInviteDraft, savedInviteDraft]);
  const activeDraftSelectedIds = useMemo(
    () => new Set(activeDraft ? draftPlayerIds(activeDraft) : []),
    [activeDraft],
  );
  const activeDraftStartingPlayers = useMemo(
    () => activeDraft ? getDraftPlayers(compactIds(activeDraft.startingXI), playerById) : [],
    [activeDraft, playerById],
  );
  const activeDraftSubstitutes = useMemo(
    () => activeDraft ? getDraftPlayers(activeDraft.substitutes, playerById) : [],
    [activeDraft, playerById],
  );
  const activeDraftReserves = useMemo(
    () => activeDraft ? getDraftPlayers(activeDraft.reserves, playerById) : [],
    [activeDraft, playerById],
  );
  const activeSlotPreview = useMemo(() => {
    if (!activeSlot || !activeDraft || activeDraftStartingPlayers.length !== 11) return null;
    return buildMultiplayerTeamInput({
      ownerId: activeSlot.id,
      teamName: activeDraft.teamName,
      formation: activeDraft.formation,
      tactic: activeDraft.tactic,
      captainId: activeDraft.captainId,
      startingPlayers: activeDraftStartingPlayers,
      substitutes: activeDraftSubstitutes,
      reserves: activeDraftReserves,
    });
  }, [activeDraft, activeDraftReserves, activeDraftStartingPlayers, activeDraftSubstitutes, activeSlot]);
  const activeSlotReadyToSave = Boolean(
    activeSlotPreview &&
    activeDraft &&
    activeDraft.teamName.trim().length > 0 &&
    getRosterCount(activeDraft.startingXI) === 11 &&
    getRosterCount(activeDraft.substitutes) === 7 &&
    getRosterCount(activeDraft.reserves) === 5 &&
    activeDraft.captainId,
  );
  const activeSlotExceedsPowerLimit = Boolean(activeSlotPreview && powerCap && activeSlotPreview.rating > powerCap);
  const activeDraftTotal = activeDraft ? draftPlayerIds(activeDraft).length : 0;
  const activeFormation = useMemo(
    () => FORMATIONS.find((item) => item.id === activeDraft?.formation) ?? FORMATIONS[0],
    [activeDraft?.formation],
  );
  const pendingPlacementPlayer = (() => {
    if (!pendingPlacementPlayerId || !pendingPlacementSource || pendingPlacementSource.playerId !== pendingPlacementPlayerId) {
      return null;
    }
    if (pendingPlacementSource.source === 'draft') {
      if (!activeDraft?.pickAvailable || !activeRolledSquad?.players.some((player) => player.id === pendingPlacementPlayerId)) {
        return null;
      }
      return playerById.get(pendingPlacementPlayerId) ?? null;
    }
    return activeDraftSelectedIds.has(pendingPlacementPlayerId)
      ? playerById.get(pendingPlacementPlayerId) ?? null
      : null;
  })();
  const positionWarnings = useMemo(
    () => activeDraft ? getPositionWarnings(getDraftPlayers(draftPlayerIds(activeDraft), playerById)) : [],
    [activeDraft, playerById],
  );

  const setResultNotice = (tone: NoticeTone, text: string) => {
    setNotice({ tone, text });
  };

  const activateManager = () => {
    const trimmed = managerName.trim() || 'Canlı11 Menajeri';
    if (user && user.username === trimmed) return user;
    const nextUser = createLocalUser(trimmed);
    saveCurrentUser(nextUser);
    setUser(nextUser);
    setManagerName(nextUser.username);
    setLiveFixture(null);
    refreshLeagues();
    setResultNotice('success', `${nextUser.username} aktif menajer oldu.`);
    return nextUser;
  };

  const requireUser = () => user ?? activateManager();

  const handleCreateFriendLeague = () => {
    try {
      const owner = requireUser();
      const league = createLocalFriendLeague({
        name: leagueName,
        ownerId: owner.id,
        friendCount,
        powerLimit,
        competitionId: friendCompetitionId,
      });
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setActiveSlotId(league.playerSlots[0]?.id ?? null);
      setUserMatchQueue([]);
      setSlotDrafts({});
      setResultNotice('success', `${league.name} için ${league.playerSlots.length} oyunculu arkadaş ligi oluşturuldu.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const updateActiveDraft = (patch: Partial<SlotDraft>) => {
    if (!activeSlot || !activeDraft) return;
    setSlotDrafts((items) => ({
      ...items,
      [activeSlot.id]: {
        ...activeDraft,
        ...patch,
      },
    }));
  };

  const getRandomDraftSquad = (excludedSquadId: string | null = null) => {
    if (draftSquads.length === 0) return null;
    const availableSquads = draftSquads.length > 1
      ? draftSquads.filter((squad) => squad.id !== excludedSquadId)
      : draftSquads;
    return availableSquads[Math.floor(Math.random() * availableSquads.length)] ?? null;
  };

  const getPickCompletionPatch = (nextTotal: number): Partial<SlotDraft> => {
    if (!activeDraft?.autoRoll || nextTotal >= 23) return { pickAvailable: false };
    const nextSquad = getRandomDraftSquad(activeDraft.rolledSquadId);
    return nextSquad
      ? { rolledSquadId: nextSquad.id, pickAvailable: true }
      : { pickAvailable: false };
  };

  const getInvitePickCompletionPatch = (nextTotal: number): Partial<InviteDraft> => {
    if (!inviteDraft.autoRoll || nextTotal >= 23) return { pickAvailable: false };
    const nextSquad = getRandomDraftSquad(inviteDraft.rolledSquadId);
    return nextSquad
      ? { rolledSquadId: nextSquad.id, pickAvailable: true }
      : { pickAvailable: false };
  };

  const rollActiveSquad = () => {
    if (!activeDraft) return;
    if (!activeDraft.teamName.trim()) {
      setResultNotice('error', 'Kadro kurmak için önce takım adı gir.');
      return;
    }
    if (activeDraftTotal >= 23) return;
    if (activeDraft.pickAvailable) return;
    if (draftSquads.length === 0) return;

    const randomSquad = getRandomDraftSquad(activeDraft.rolledSquadId);
    if (!randomSquad) return;
    updateActiveDraft({
      rolledSquadId: randomSquad.id,
      pickAvailable: true,
    });
    setPendingPlacementPlayerId(null);
    setPendingPlacementSource(null);
  };

  const rollInviteSquad = () => {
    if (!inviteDraft.teamName.trim()) {
      setResultNotice('error', 'Kadro kurmak için önce takım adı gir.');
      return;
    }
    if (inviteDraftTotal >= 23) return;
    if (inviteDraft.pickAvailable) return;
    if (draftSquads.length === 0) return;

    const randomSquad = getRandomDraftSquad(inviteDraft.rolledSquadId);
    if (!randomSquad) return;
    updateInviteDraft({
      rolledSquadId: randomSquad.id,
      pickAvailable: true,
    });
    setInvitePlacement(null);
  };

  const selectDraftPlayer = (playerId: string) => {
    if (!activeDraft || !activeDraft.pickAvailable) return;
    if (!activeDraft.teamName.trim()) {
      setResultNotice('error', 'Kadro kurmak icin once takim adi gir.');
      return;
    }
    if (activeDraftSelectedIds.has(playerId)) return;
    if (!activeRolledSquad?.players.some((player) => player.id === playerId)) return;
    setPendingPlacementPlayerId(playerId);
    setPendingPlacementSource({ playerId, source: 'draft' });
  };

  const placePendingPlayer = (target: RosterTarget, slotIndex?: number) => {
    if (!activeDraft || !pendingPlacementPlayer || !pendingPlacementSource) return;
    if (!activeDraft.teamName.trim()) {
      setResultNotice('error', 'Kadro kurmak icin once takim adi gir.');
      return;
    }

    const fromDraftPool = pendingPlacementSource.source === 'draft';
    if (fromDraftPool) {
      if (!activeDraft.pickAvailable) return;
      if (activeDraftSelectedIds.has(pendingPlacementPlayer.id)) return;
      if (!activeRolledSquad?.players.some((player) => player.id === pendingPlacementPlayer.id)) return;
    } else if (!activeDraftSelectedIds.has(pendingPlacementPlayer.id)) {
      return;
    }

    if (target === 'startingXI') {
      if (typeof slotIndex !== 'number') return;
      const nextStartingXI = normalizeStartingSlots(activeDraft.startingXI);
      if (nextStartingXI[slotIndex]) {
        setResultNotice('error', 'Bu mevki slotu dolu. Once oyuncuyu cikar.');
        return;
      }
      const slot = activeFormation.positions.find((item) => item.index === slotIndex);
      if (!slot || !isPositionCompatible(pendingPlacementPlayer, slot.allowedPosition)) {
        setResultNotice('error', 'Bu oyuncu bu mevkide oynayamaz.');
        return;
      }
      const baseDraft = fromDraftPool
        ? activeDraft
        : removeRosterPlayer(activeDraft, pendingPlacementPlayer.id);
      const nextDraft = addRosterPlayer(baseDraft, pendingPlacementPlayer.id, target, slotIndex);
      updateActiveDraft(fromDraftPool
        ? {
          ...nextDraft,
          captainId: nextDraft.captainId ?? pendingPlacementPlayer.id,
          ...getPickCompletionPatch(activeDraftTotal + 1),
        }
        : {
          ...nextDraft,
          captainId: nextDraft.captainId ?? pendingPlacementPlayer.id,
        });
      setPendingPlacementPlayerId(null);
      setPendingPlacementSource(null);
      return;
    }

    const baseDraft = fromDraftPool
      ? activeDraft
      : removeRosterPlayer(activeDraft, pendingPlacementPlayer.id);
    const currentIds = compactIds(baseDraft[target]);
    if (currentIds.length >= rosterTargetLimits[target]) {
      setResultNotice('error', `${target === 'substitutes' ? 'Yedek' : 'Rezerv'} slotlari dolu.`);
      return;
    }
    const nextDraft = addRosterPlayer(baseDraft, pendingPlacementPlayer.id, target, slotIndex);
    updateActiveDraft(fromDraftPool
      ? {
        ...nextDraft,
        ...getPickCompletionPatch(activeDraftTotal + 1),
      }
      : nextDraft);
    setPendingPlacementPlayerId(null);
    setPendingPlacementSource(null);
  };

  const addPlayerToDraft = (playerId: string, target: RosterTarget) => {
    if (!activeDraft || !activeDraft.pickAvailable || activeDraftSelectedIds.has(playerId)) return;
    if (!activeDraft.teamName.trim()) return;
    if (!activeRolledSquad?.players.some((player) => player.id === playerId)) return;
    const currentIds = compactIds(activeDraft[target]);
    if (currentIds.length >= rosterTargetLimits[target]) return;
    updateActiveDraft({
      [target]: [...currentIds, playerId],
      ...getPickCompletionPatch(activeDraftTotal + 1),
    });
    setPendingPlacementPlayerId(null);
    setPendingPlacementSource(null);
  };

  const selectRosterPlayerForPlacement = (playerId: string, source: RosterTarget, slotIndex?: number) => {
    if (!activeDraft || !activeDraftSelectedIds.has(playerId)) return;
    setPendingPlacementPlayerId(playerId);
    setPendingPlacementSource({ playerId, source, slotIndex });
  };

  const removePlayerFromDraft = (playerId: string) => {
    if (!activeDraft) return;
    updateActiveDraft(removeRosterPlayer(activeDraft, playerId));
    if (pendingPlacementPlayerId === playerId) setPendingPlacementPlayerId(null);
    if (pendingPlacementSource?.playerId === playerId) setPendingPlacementSource(null);
  };

  const importQuickTeamToActiveSlot = () => {
    if (!activeDraft || !formation || !tactic || !captainId || startingPlayers.length !== 11) {
      setResultNotice('error', 'Aktarmak icin Hızlı Oyna kadrosunda 11 oyuncu, dizilis, taktik ve kaptan gerekli.');
      return;
    }

    const importedIds = selectedPlayers.map((player) => player?.id ?? '');
    const importedSet = new Set(importedIds.filter((id) => id.trim().length > 0));
    const importedSubstitutes = substitutePlayers
      .map((player) => player.id)
      .filter((id) => !importedSet.has(id))
      .slice(0, 7);
    const quickReserveIds = quickReservePlayers
      .map((player) => player.id)
      .filter((id) => !importedSet.has(id) && !importedSubstitutes.includes(id))
      .slice(0, 5);
    updateActiveDraft({
      teamName: activeDraft.teamName.trim() || squadName,
      formation,
      tactic,
      captainId,
      startingXI: normalizeStartingSlots(importedIds),
      substitutes: importedSubstitutes,
      reserves: quickReserveIds,
      pickAvailable: false,
      rolledSquadId: null,
    });
    setPendingPlacementPlayerId(null);
    setPendingPlacementSource(null);
    setResultNotice('success', 'Hızlı Oyna ilk 11 Arkadaş Ligi slotuna aktarıldı. Yedek ve rezervleri draft ile tamamla.');
  };

  const handleSaveActiveSlot = () => {
    if (!activeLeague || !activeSlot || !activeDraft || !activeSlotPreview) return;
    try {
      const input: PlayerSlotTeamInput = {
        ...activeSlotPreview,
        displayName: activeDraft.displayName,
        reserves: compactIds(activeDraft.reserves),
      };
      const league = savePlayerSlotToLeague(activeLeague.id, activeSlot.id, input);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      const nextSlot = league.playerSlots.find((slot) => !slot.ready && slot.id !== activeSlot.id)
        ?? league.playerSlots.find((slot) => slot.id === activeSlot.id)
        ?? null;
      setActiveSlotId(nextSlot?.id ?? null);
      setResultNotice('success', `${activeDraft.displayName} hazır.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const updateInviteDraft = (patch: Partial<InviteDraft>) => {
    setInviteDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const selectInvitePlayerForPlacement = (playerId: string, source: PlacementSource = 'pool', slotIndex?: number) => {
    if (source === 'draft') {
      if (!inviteDraft.teamName.trim()) {
        setResultNotice('error', 'Kadro kurmak için önce takım adı gir.');
        return;
      }
      if (!inviteDraft.pickAvailable) return;
      if (inviteDraftSelectedIds.has(playerId)) return;
      if (!inviteRolledSquad?.players.some((player) => player.id === playerId)) return;
    }
    const fromRoster = source !== 'pool' && source !== 'draft';
    if (fromRoster && !inviteDraftSelectedIds.has(playerId)) return;
    setInvitePlacement({ playerId, source, slotIndex });
  };

  const placeInvitePlayer = (target: RosterTarget, slotIndex?: number) => {
    if (!invitePlacementPlayer || !invitePlacement) return;
    const fromPool = invitePlacement.source === 'pool';
    const fromDraft = invitePlacement.source === 'draft';
    if (fromPool && inviteDraftSelectedIds.has(invitePlacementPlayer.id)) return;
    if (fromDraft) {
      if (!inviteDraft.pickAvailable) return;
      if (inviteDraftSelectedIds.has(invitePlacementPlayer.id)) return;
      if (!inviteRolledSquad?.players.some((player) => player.id === invitePlacementPlayer.id)) return;
    }

    if (target === 'startingXI') {
      if (typeof slotIndex !== 'number') return;
      const nextStartingXI = normalizeStartingSlots(inviteDraft.startingXI);
      if (nextStartingXI[slotIndex]) {
        setResultNotice('error', 'Bu mevki slotu dolu. Once oyuncuyu cikar veya baska slota tasi.');
        return;
      }
      const currentFormation = FORMATIONS.find((item) => item.id === inviteDraft.formation);
      const slot = currentFormation?.positions.find((item) => item.index === slotIndex);
      if (!slot || !isPositionCompatible(invitePlacementPlayer, slot.allowedPosition)) {
        setResultNotice('error', 'Bu oyuncu bu mevkide oynayamaz.');
        return;
      }
    }

    const baseDraft = fromPool || fromDraft
      ? inviteDraft
      : removeRosterPlayer(inviteDraft, invitePlacementPlayer.id);
    const currentIds = target === 'startingXI'
      ? []
      : compactIds(baseDraft[target]);
    if (target !== 'startingXI' && currentIds.length >= rosterTargetLimits[target]) {
      setResultNotice('error', `${target === 'substitutes' ? 'Yedek' : 'Rezerv'} slotlari dolu.`);
      return;
    }

    const nextDraft = addRosterPlayer(baseDraft, invitePlacementPlayer.id, target, slotIndex);
    const nextTotal = inviteDraftTotal + (fromPool || fromDraft ? 1 : 0);
    setInviteDraft({
      ...nextDraft,
      ...(fromDraft ? getInvitePickCompletionPatch(nextTotal) : {}),
      captainId: nextDraft.captainId ?? (target === 'startingXI' ? invitePlacementPlayer.id : null),
    });
    setInvitePlacement(null);
  };

  const removePlayerFromInviteDraft = (playerId: string) => {
    setInviteDraft((current) => removeRosterPlayer(current, playerId));
    if (invitePlacement?.playerId === playerId) setInvitePlacement(null);
  };

  const importQuickTeamToInviteDraft = () => {
    const quickStartingIds = selectedPlayers.map((player) => player?.id ?? '');
    if (!formation || !tactic || !captainId || startingPlayers.length !== 11 || !quickStartingIds.includes(captainId)) {
      setResultNotice('error', 'Hızlı Oyna kadron geçerli değil. Önce Hızlı Oyna’da 11 oyuncu, diziliş, taktik ve kaptan seç.');
      return;
    }
    setInviteDraft({
      ...quickInviteDraft,
      teamName: inviteDraft.teamName.trim() || quickInviteDraft.teamName,
    });
    setInvitePlacement(null);
    setResultNotice('success', 'Hizli Oyna kadrosu sahaya ve yedeklere aktarildi.');
  };

  const handleCreateLeague = async () => {
    try {
      const owner = requireUser();
      if (onlineConfigured) {
        const league = await createOnlineLeague({
          name: leagueName,
          ownerId: owner.id,
          maxUsers,
          powerLimit,
        });
        refreshOnlineLeague(league);
        setActiveLeagueId(league.id);
        setResultNotice('success', `${league.name} olusturuldu. Kod: ${league.inviteCode}`);
        return;
      }
      const league = createLeague({
        name: leagueName,
        ownerId: owner.id,
        maxUsers,
        powerLimit,
      });
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setResultNotice('success', `${league.name} oluşturuldu. Kod: ${league.inviteCode}`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleJoinLeague = async () => {
    try {
      const owner = requireUser();
      if (onlineConfigured) {
        const league = await joinOnlineLeague(inviteCode);
        refreshOnlineLeague(league);
        setActiveLeagueId(league.id);
        setResultNotice('success', `${league.name} bekleme odasi acildi.`);
        return;
      }
      const league = joinLeague(inviteCode, owner.id);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setResultNotice('success', `${league.name} bekleme odası açıldı.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleSaveTeam = async () => {
    if (!activeLeague || !teamPreview) return;
    try {
      if (isOnlineInviteLeague) {
        const league = await saveOnlineTeamToLeague(activeLeague.id, teamPreview);
        refreshOnlineLeague(league);
        setActiveLeagueId(league.id);
        setResultNotice('success', `${teamPreview.teamName} lige kaydedildi.`);
        return;
      }
      const league = saveTeamToLeague(activeLeague.id, teamPreview);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setResultNotice('success', `${teamPreview.teamName} lige kaydedildi.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleStartLeague = async () => {
    if (!activeLeague || !user) return;
    try {
      if (isOnlineInviteLeague) {
        const league = await startOnlineLeague(activeLeague.id, dataset);
        refreshOnlineLeague(league);
        setActiveLeagueId(league.id);
        setUserMatchQueue([]);
        setResultNotice('success', `Sezon basladi. ${league.botTeams.length} gercek takim lige dahil edildi.`);
        return;
      }
      const league = isLocalFriendLeague
        ? startLocalFriendLeague(activeLeague.id, user.id, dataset)
        : startLeague(activeLeague.id, user.id, dataset);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setUserMatchQueue([]);
      setResultNotice('success', `Sezon başladı. ${league.botTeams.length} gerçek takım lige dahil edildi.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleSimulateWeek = async () => {
    if (!activeLeague || liveFixture) return;
    try {
      const result = isOnlineInviteLeague
        ? await simulateOnlineWeek(activeLeague.id, dataset)
        : simulateWeek(activeLeague.id, dataset);
      const resultHumanIds = new Set(result.league.teams.map((team) => team.id));
      const userFixtures = result.playedRound.filter((fixture) => (
        resultHumanIds.has(fixture.homeTeamId) || resultHumanIds.has(fixture.awayTeamId)
      ));
      const userFixture = ownedTeam
        ? userFixtures.find((fixture) => fixture.homeTeamId === ownedTeam.id || fixture.awayTeamId === ownedTeam.id)
        : userFixtures[0] ?? null;
      if (isOnlineInviteLeague) {
        refreshOnlineLeague(result.league);
      } else {
        refreshLeagues(result.league.id);
      }
      setActiveLeagueId(result.league.id);
      setUserMatchQueue(userFixtures);
      if (!isLocalFriendLeague && userFixture?.result) {
        setLiveFixture(userFixture);
      } else {
        setResultNotice('success', `${result.league.currentWeek}. hafta simüle edildi. ${userFixtures.length} kullanıcı maçı izlenebilir.`);
      }
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleCopyInvite = async () => {
    if (!activeLeague) return;
    const copied = await copyText(activeLeague.inviteCode);
    setResultNotice(copied ? 'success' : 'error', copied ? 'Davet kodu kopyalandı.' : 'Davet kodu kopyalanamadı.');
  };

  const teamNameOf = (teamId: string) => (
    activeLeague ? getTeamDisplayName(activeLeague, teamId) : teamId
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-400">Asenkron Multiplayer</p>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">
              {focusMode === 'invite' ? 'Davetli Lig' : 'Arkadaş Ligi'}
            </h2>
            <div className="mt-3 grid gap-2 text-xs font-black uppercase text-white/60 sm:grid-cols-3">
              <span>Lig odası</span>
              <span>Hafta hafta simülasyon</span>
              <span>{onlineConfigured ? (onlineReady ? 'Firebase online' : 'Firebase baglaniyor') : 'Offline Demo'}</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={managerName}
              onChange={(event) => setManagerName(event.target.value)}
              maxLength={24}
              className="border-2 border-white/20 bg-black px-4 py-3 text-xs font-black uppercase text-white outline-none"
              placeholder="Menajer adı"
            />
            <button
              type="button"
              onClick={activateManager}
              className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black"
            >
              <UserRound size={16} /> Kimlik
            </button>
          </div>
        </div>
        {notice && (
          <div className={`mt-4 border-2 p-3 text-xs font-black uppercase ${noticeClasses[notice.tone]}`}>
            {notice.text}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="flex flex-col gap-5">
          <section className={`border-4 border-black bg-green-700 p-5 text-white shadow-[6px_6px_0px_0px_#000] ${focusMode === 'invite' ? 'order-2' : 'order-1'}`}>
            <div className="mb-4 flex items-center gap-2 border-b border-white/20 pb-3">
              <Users className="text-yellow-300" size={18} />
              <h3 className="text-xl font-black uppercase italic">Arkadaş Ligi Oluştur</h3>
            </div>
            <div className="grid gap-3">
              <input
                value={leagueName}
                onChange={(event) => setLeagueName(event.target.value)}
                maxLength={36}
                className="border-2 border-black bg-white px-3 py-3 text-xs font-black uppercase text-black outline-none"
                placeholder="Lig adı"
              />
              <div className="border-2 border-white/20 bg-black/20 p-3 text-xs font-black uppercase">
                Lig boyutu: 18 takım / 34 hafta / çift devre
              </div>
              <div className="grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Oyuncu Havuzu</p>
                {friendCompetitionOptions.map((competition) => (
                  <button
                    key={competition.competitionId}
                    type="button"
                    onClick={() => setFriendCompetitionId(competition.competitionId)}
                    className={`game-button border-2 border-black px-3 py-3 text-left text-xs font-black uppercase ${friendCompetitionId === competition.competitionId ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}
                  >
                    <span className="block">{competition.competitionName}</span>
                    <span className="mt-1 block text-[9px] opacity-60">{competition.teams.length} takimlik havuz</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {friendCountOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFriendCount(option)}
                    className={`game-button border-2 border-black px-3 py-3 text-xs font-black uppercase ${friendCount === option ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                {powerLimitOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPowerLimit(option)}
                    className={`game-button border-2 border-black px-3 py-3 text-left text-xs font-black uppercase ${powerLimit === option ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}
                  >
                    {powerLimitLabels[option]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreateFriendLeague}
                className="game-button flex items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black"
              >
                <Plus size={18} /> 18 Takımlı Lig
              </button>
            </div>
          </section>

          <section className={`border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000] ${focusMode === 'invite' ? 'order-1' : 'order-2'}`}>
            <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
              <Plus className="text-green-700" size={18} />
              <h3 className="text-xl font-black uppercase italic">Davetli Lig Oluştur</h3>
            </div>
            <div className="grid gap-3">
              <input
                value={leagueName}
                onChange={(event) => setLeagueName(event.target.value)}
                maxLength={36}
                className="border-2 border-black bg-zinc-100 px-3 py-3 text-xs font-black uppercase outline-none"
                placeholder="Lig adı"
              />
              <div className="grid grid-cols-2 gap-2">
                {maxUserOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMaxUsers(option)}
                    className={`game-button border-2 border-black px-3 py-3 text-xs font-black uppercase ${maxUsers === option ? 'bg-black text-white' : 'bg-zinc-100 text-black'}`}
                  >
                    {option} Takım
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                {powerLimitOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPowerLimit(option)}
                    className={`game-button border-2 border-black px-3 py-3 text-left text-xs font-black uppercase ${powerLimit === option ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}
                  >
                    {powerLimitLabels[option]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreateLeague}
                className="game-button flex items-center justify-center gap-2 border-4 border-black bg-green-600 px-4 py-4 text-sm font-black uppercase text-white"
              >
                <Plus size={18} /> Yeni Lig
              </button>
            </div>
          </section>

          <section className="order-3 border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
            <div className="mb-4 flex items-center gap-2 border-b border-white/15 pb-3">
              <LogIn className="text-yellow-400" size={18} />
              <h3 className="text-xl font-black uppercase italic">Davet Kodu</h3>
            </div>
            <div className="grid gap-3">
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                maxLength={8}
                className="border-2 border-white/20 bg-black px-3 py-3 text-center text-lg font-black uppercase tracking-[0.24em] text-white outline-none"
                placeholder="ABC123"
              />
              <button
                type="button"
                onClick={handleJoinLeague}
                className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black"
              >
                <Link2 size={16} /> Lige Katıl
              </button>
            </div>
          </section>

          <section className="order-4 border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3">
              <h3 className="text-xl font-black uppercase italic">Ligler</h3>
              <button
                type="button"
                onClick={() => refreshLeagues()}
                className="game-button grid h-9 w-9 place-items-center border-2 border-black bg-zinc-100"
                aria-label="Ligleri yenile"
                title="Ligleri yenile"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="grid gap-2">
              {leagues.length === 0 && (
                <p className="border-2 border-dashed border-black/25 p-4 text-xs font-black uppercase opacity-55">Kayıtlı lig yok</p>
              )}
              {leagues.map((league) => (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => {
                    setActiveLeagueId(league.id);
                    setLiveFixture(null);
                    setUserMatchQueue([]);
                    setActiveSlotId(league.playerSlots?.find((slot) => !slot.ready)?.id ?? league.playerSlots?.[0]?.id ?? null);
                  }}
                  className={`game-button border-2 border-black p-3 text-left text-xs font-black uppercase ${activeLeague?.id === league.id ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}
                >
                  <span className="block truncate">{league.name}</span>
                  <span className="mt-1 block text-[9px] opacity-60">
                    {league.mode === 'local-friends' ? 'Arkadaş' : 'Davetli'} / {statusLabels[league.status]} / {league.teams.length}+{league.botTeams.length}/{league.maxUsers}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-5">
          {!activeLeague ? (
            <section className="grid min-h-[420px] place-items-center border-4 border-black bg-white p-8 text-center text-black shadow-[6px_6px_0px_0px_#000]">
              <div>
                <Users className="mx-auto text-green-700" size={34} />
                <h3 className="mt-3 text-2xl font-black uppercase italic">Multiplayer lobi hazır</h3>
                <p className="mt-2 text-xs font-black uppercase opacity-55">Lig oluştur veya davet kodu gir.</p>
              </div>
            </section>
          ) : (
            <>
              <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                <div className="flex flex-col gap-4 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Bekleme Odası</p>
                    <h3 className="text-3xl font-black uppercase italic">{activeLeague.name}</h3>
                    <p className="mt-1 text-xs font-black uppercase text-yellow-700">
                      {statusLabels[activeLeague.status]} / {activeCompetition?.competitionName ?? 'Süper Lig'} / {powerLimitLabels[activeLeague.powerLimit]} / {activeLeague.maxUsers} takım
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="border-2 border-black bg-zinc-950 px-5 py-3 text-center text-white">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Kod</p>
                      <p className="text-2xl font-black tracking-[0.22em]">{activeLeague.inviteCode}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyInvite}
                      className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black"
                    >
                      <Copy size={16} /> Kopyala
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <MiniStat label="Kullanıcı" value={activeLeague.teams.length} />
                  <MiniStat label="Bot Slot" value={botSlots} />
                  <MiniStat label="Hafta" value={seasonWeekCount ? `${Math.min(activeLeague.currentWeek + 1, seasonWeekCount)}/${seasonWeekCount}` : '-'} />
                  <MiniStat label="Lider" value={highlights?.leader?.teamName ?? '-'} />
                </div>
              </section>

              {activeLeague.status === 'waiting' && isLocalFriendLeague && activeDraft && (
                <section className="space-y-5">
                  <section className="border-4 border-black bg-[radial-gradient(circle_at_top,#1f2937_0%,#09090b_48%,#020617_100%)] p-4 text-white shadow-[6px_6px_0px_0px_#000] md:p-5">
                    <div className="grid gap-4 xl:grid-cols-[280px_1fr_auto] xl:items-center">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-400">Arkadas Ligi</p>
                        <h3 className="mt-1 text-2xl font-black uppercase italic">{activeDraft.teamName.trim() || 'Takim Adi Gerekli'}</h3>
                        <p className="mt-1 text-xs font-black uppercase text-white/55">{activeSlot?.displayName ?? 'Oyuncu'} kadro kuruyor</p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                          <span>Kadro ilerlemesi</span>
                          <span>{activeDraftTotal}/23</span>
                        </div>
                        <div className="h-3 border-2 border-black bg-black/55">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-400 to-green-500"
                            style={{ width: `${Math.min(100, (activeDraftTotal / 23) * 100)}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <DraftCounter label="Ilk 11" value={`${getRosterCount(activeDraft.startingXI)}/11`} />
                          <DraftCounter label="Yedek" value={`${getRosterCount(activeDraft.substitutes)}/7`} />
                          <DraftCounter label="Rezerv" value={`${getRosterCount(activeDraft.reserves)}/5`} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_160px] xl:grid-cols-1">
                        <DraftCounter label="Takim gucu" value={activeSlotPreview?.rating ?? '-'} strong />
                        <button
                          type="button"
                          onClick={importQuickTeamToActiveSlot}
                          disabled={!draftReady}
                          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-4 text-xs font-black uppercase text-black disabled:opacity-35"
                        >
                          Hızlı Oyna İlk 11 Aktar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveActiveSlot}
                          disabled={!activeSlotReadyToSave || activeSlotExceedsPowerLimit}
                          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-green-600 px-4 py-4 text-xs font-black uppercase text-white disabled:opacity-35"
                        >
                          <Save size={16} /> Hazir
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
                      <input
                        value={activeDraft.displayName}
                        onChange={(event) => updateActiveDraft({ displayName: event.target.value })}
                        maxLength={24}
                        className="border-2 border-white/20 bg-black/70 px-3 py-3 text-xs font-black uppercase text-white outline-none"
                        placeholder="Oyuncu adi"
                      />
                      <input
                        value={activeDraft.teamName}
                        onChange={(event) => updateActiveDraft({ teamName: event.target.value })}
                        maxLength={32}
                        className="border-2 border-yellow-400/60 bg-black/70 px-3 py-3 text-xs font-black uppercase text-white outline-none"
                        placeholder="Takim adi zorunlu"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                        {FORMATIONS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateActiveDraft({ formation: item.id })}
                            className={`game-button border-2 border-black px-3 py-2 text-[10px] font-black uppercase ${activeDraft.formation === item.id ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'}`}
                          >
                            {item.id}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {tacticOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => updateActiveDraft({ tactic: item })}
                          className={`game-button border-2 border-black px-3 py-2 text-[10px] font-black uppercase ${activeDraft.tactic === item ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'}`}
                        >
                          {item === 'Gegenpress' ? 'Hucum' : item === 'ParkTheBus' ? 'Savunma' : 'Dengeli'}
                        </button>
                      ))}
                    </div>

                    {activeSlotExceedsPowerLimit && (
                      <div className="mt-4 border-2 border-red-500 bg-red-500/15 p-3 text-xs font-black uppercase text-red-100">
                        Takim ortalamasi {powerCap} limitini asiyor.
                      </div>
                    )}
                  </section>

                  <div className="grid gap-5 xl:grid-cols-[360px_minmax(320px,420px)_minmax(430px,1fr)]">
                    <FriendPitchBoard
                      draft={activeDraft}
                      playerById={playerById}
                      pendingPlayer={pendingPlacementPlayer}
                      selectedPlayerId={pendingPlacementPlayer?.id ?? null}
                      captainId={activeDraft.captainId}
                      teamRating={activeSlotPreview?.rating ?? '-'}
                      onCaptain={(playerId) => updateActiveDraft({ captainId: playerId })}
                      onSelect={selectRosterPlayerForPlacement}
                      onPlace={placePendingPlayer}
                      onRemove={removePlayerFromDraft}
                    />

                    <DraftRollPanel
                      draft={activeDraft}
                      rolledSquad={activeRolledSquad}
                      rolledTeam={activeRolledTeam}
                      rolledRating={activeRolledTeamRating}
                      selectedIds={activeDraftSelectedIds}
                      pendingPlayerId={pendingPlacementPlayer?.id ?? null}
                      activeTotal={activeDraftTotal}
                      teamById={teamById}
                      onRoll={rollActiveSquad}
                      onSelect={selectDraftPlayer}
                      onToggleAutoRoll={() => updateActiveDraft({ autoRoll: !activeDraft.autoRoll })}
                    />

                    <SelectedPlacementPanel
                      player={pendingPlacementPlayer}
                      team={pendingPlacementPlayer?.teamId ? teamById.get(pendingPlacementPlayer.teamId) ?? null : null}
                      warnings={positionWarnings}
                      canPlace={Boolean(pendingPlacementPlayer)}
                    />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[360px_1fr_1fr]">
                    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                      <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                        <ShieldCheck className="text-green-700" size={18} />
                        <h3 className="text-xl font-black uppercase italic">Oyuncu Slotlari</h3>
                      </div>
                      <div className="mt-4 space-y-3">
                        {playerSlots.map((slot, index) => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setActiveSlotId(slot.id)}
                            className={`game-button w-full border-2 border-black p-3 text-left text-xs font-black uppercase ${activeSlot?.id === slot.id ? 'bg-yellow-400 text-black' : slot.ready ? 'bg-green-100 text-black' : 'bg-zinc-100 text-black'}`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span>{index + 1}. {slot.displayName}</span>
                              <span>{slot.ready ? 'Hazir' : 'Sirada'}</span>
                            </span>
                            <span className="mt-1 block text-[10px] opacity-65">{slot.teamName || 'Takim bekliyor'} / RAT {slot.rating || '-'}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleStartLeague}
                        disabled={!isOwner || playerSlots.some((slot) => !slot.ready)}
                        className="game-button mt-5 flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-35"
                      >
                        <Play size={18} fill="currentColor" /> Ligi Baslat
                      </button>
                    </section>

                    <RealTeamPanel title="Lige Dahil Edilecek Gercek Takimlar" teams={includedRealTeams} />
                    <RealTeamPanel title="Cikarilacak En Zayif Takimlar" teams={replacedRealTeams} warning />
                  </div>
                </section>
              )}

              {activeLeague.status === 'waiting' && isLocalFriendLeague && showLegacyFriendDraft && (
                <section className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                      <div className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Sıradaki oyuncu takım kuruyor</p>
                          <h3 className="text-2xl font-black uppercase italic">{activeSlot?.displayName ?? 'Oyuncu'}</h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveActiveSlot}
                          disabled={!activeSlotReadyToSave || activeSlotExceedsPowerLimit}
                          className="game-button flex items-center gap-2 border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-35"
                        >
                          <Save size={16} /> Hazır
                        </button>
                      </div>

                      {activeDraft && (
                        <>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <input
                              value={activeDraft.displayName}
                              onChange={(event) => updateActiveDraft({ displayName: event.target.value })}
                              maxLength={24}
                              className="border-2 border-white/20 bg-black px-3 py-3 text-xs font-black uppercase text-white outline-none"
                              placeholder="Oyuncu adı"
                            />
                            <input
                              value={activeDraft.teamName}
                              onChange={(event) => updateActiveDraft({ teamName: event.target.value })}
                              maxLength={32}
                              className="border-2 border-white/20 bg-black px-3 py-3 text-xs font-black uppercase text-white outline-none"
                              placeholder="Takım adı"
                            />
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">Diziliş</p>
                              <div className="grid grid-cols-2 gap-2">
                                {FORMATIONS.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => updateActiveDraft({ formation: item.id })}
                                    className={`game-button border-2 border-black px-3 py-2 text-xs font-black uppercase ${activeDraft.formation === item.id ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}
                                  >
                                    {item.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">Taktik</p>
                              <div className="grid gap-2">
                                {tacticOptions.map((item) => (
                                  <button
                                    key={item}
                                    type="button"
                                    onClick={() => updateActiveDraft({ tactic: item })}
                                    className={`game-button border-2 border-black px-3 py-2 text-xs font-black uppercase ${activeDraft.tactic === item ? 'bg-yellow-400 text-black' : 'bg-white text-black'}`}
                                  >
                                    {item === 'Gegenpress' ? 'Hücum' : item === 'ParkTheBus' ? 'Savunma' : 'Dengeli'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-5">
                            <MiniStat dark label="Toplam" value={`${activeDraftTotal}/23`} />
                            <MiniStat dark label="İlk 11" value={`${activeDraft.startingXI.length}/11`} />
                            <MiniStat dark label="Yedek" value={`${activeDraft.substitutes.length}/7`} />
                            <MiniStat dark label="Rezerv" value={`${activeDraft.reserves.length}/5`} />
                            <MiniStat dark label="Güç" value={activeSlotPreview?.rating ?? '-'} />
                          </div>

                          {activeSlotExceedsPowerLimit && (
                            <div className="mt-4 border-2 border-red-500 bg-red-500/15 p-3 text-xs font-black uppercase text-red-100">
                              Takım ortalaması {powerCap} limitini aşıyor.
                            </div>
                          )}

                          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
                            <div className="grid gap-4 md:grid-cols-3">
                              <DraftRosterList
                                title="İlk 11"
                                ids={activeDraft.startingXI}
                                playerById={playerById}
                                captainId={activeDraft.captainId}
                                onCaptain={(playerId) => updateActiveDraft({ captainId: playerId })}
                                onRemove={removePlayerFromDraft}
                              />
                              <DraftRosterList
                                title="Yedekler"
                                ids={activeDraft.substitutes}
                                playerById={playerById}
                                captainId={null}
                                onCaptain={() => undefined}
                                onRemove={removePlayerFromDraft}
                              />
                              <DraftRosterList
                                title="Rezerv"
                                ids={activeDraft.reserves}
                                playerById={playerById}
                                captainId={null}
                                onCaptain={() => undefined}
                                onRemove={removePlayerFromDraft}
                              />
                            </div>

                            <div className="border-2 border-white/15 bg-white/5 p-3">
                              <div className="mb-3 border-2 border-white/15 bg-black/30 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-400">Takım Çevir</p>
                                    <h4 className="mt-1 text-xl font-black uppercase italic">
                                      {activeRolledSquad?.teamName ?? 'Takım bekleniyor'}
                                    </h4>
                                    <p className="mt-1 text-[10px] font-black uppercase text-white/45">
                                      {activeDraft.pickAvailable ? '1 oyuncu seç' : activeDraftTotal >= 23 ? 'Kadro tamamlandı' : 'Yeni takım çevrilebilir'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={rollActiveSquad}
                                    disabled={!activeDraft.teamName.trim() || activeDraft.pickAvailable || activeDraftTotal >= 23}
                                    className="game-button flex items-center gap-2 border-2 border-black bg-yellow-400 px-3 py-3 text-[10px] font-black uppercase text-black disabled:opacity-35"
                                  >
                                    <RefreshCw size={15} /> Takım Çevir
                                  </button>
                                </div>
                                {!activeDraft.teamName.trim() && (
                                  <p className="mt-3 border border-yellow-400 bg-yellow-400/10 p-2 text-[10px] font-black uppercase text-yellow-100">
                                    Takım adı girilmeden kadro kurulamaz.
                                  </p>
                                )}
                                {positionWarnings.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {positionWarnings.map((warning) => (
                                      <span key={warning} className="border border-red-400 bg-red-500/15 px-2 py-1 text-[9px] font-black uppercase text-red-100">
                                        {warning}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {activeRolledSquad ? (
                                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                                  {activeRolledSquad.players.map((player) => {
                                    const selected = activeDraftSelectedIds.has(player.id);
                                    return (
                                      <PlayerDraftRow
                                        key={player.id}
                                        player={player}
                                        selected={selected}
                                        draft={activeDraft}
                                        onAdd={addPlayerToDraft}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="grid min-h-52 place-items-center border-2 border-dashed border-white/15 text-center">
                                  <div>
                                    <RefreshCw className="mx-auto text-yellow-400" />
                                    <p className="mt-3 text-xs font-black uppercase">Takım çevirmek için butona bas</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase text-white/45">Her takımdan sadece 1 oyuncu seçilebilir.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </section>

                    <aside className="space-y-5">
                      <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                        <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                          <ShieldCheck className="text-green-700" size={18} />
                          <h3 className="text-xl font-black uppercase italic">Oyuncu Slotları</h3>
                        </div>
                        <div className="mt-4 space-y-3">
                          {playerSlots.map((slot, index) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setActiveSlotId(slot.id)}
                              className={`game-button w-full border-2 border-black p-3 text-left text-xs font-black uppercase ${activeSlot?.id === slot.id ? 'bg-yellow-400 text-black' : slot.ready ? 'bg-green-100 text-black' : 'bg-zinc-100 text-black'}`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span>{index + 1}. {slot.displayName}</span>
                                <span>{slot.ready ? 'Hazır' : 'Sırada'}</span>
                              </span>
                              <span className="mt-1 block text-[10px] opacity-65">{slot.teamName} / RAT {slot.rating || '-'}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleStartLeague}
                          disabled={!isOwner || playerSlots.some((slot) => !slot.ready)}
                          className="game-button mt-5 flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-35"
                        >
                          <Play size={18} fill="currentColor" /> Ligi Başlat
                        </button>
                      </section>

                      <RealTeamPanel title="Lige Dahil Edilecek Gerçek Takımlar" teams={includedRealTeams} />
                      <RealTeamPanel title="Çıkarılacak En Zayıf Takımlar" teams={replacedRealTeams} warning />
                    </aside>
                  </div>
                </section>
              )}

              {activeLeague.status === 'waiting' && !isLocalFriendLeague && (
                <section className="space-y-5">
                  <div className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                    <div className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Takımını Kaydet</p>
                        <h3 className="text-2xl font-black uppercase italic">{inviteDraft.teamName.trim() || squadName}</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={onBackToQuick}
                          className="game-button border-2 border-white/20 bg-black px-4 py-3 text-xs font-black uppercase text-white"
                        >
                          Hızlı Oyna
                        </button>
                        <button
                          type="button"
                          onClick={importQuickTeamToInviteDraft}
                          className="game-button border-2 border-white/20 bg-white/10 px-4 py-3 text-xs font-black uppercase text-white"
                        >
                          HÄ±zlÄ± Oyna Kadrosunu Aktar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveTeam}
                          disabled={inviteSaveIssues.length > 0 || !teamPreview || exceedsPowerLimit}
                          className="game-button flex items-center gap-2 border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-35"
                        >
                          <Save size={16} /> Takımı Kaydet
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <MiniStat dark label="İlk 11" value={`${getRosterCount(inviteDraft.startingXI)}/11`} />
                      <MiniStat dark label="Yedek" value={`${getRosterCount(inviteDraft.substitutes)}/7`} />
                      <MiniStat dark label="Rezerv" value={`${getRosterCount(inviteDraft.reserves)}/5`} />
                      <MiniStat dark label="Güç" value={teamPreview?.rating ?? '-'} />
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
                      <input
                        value={inviteDraft.teamName}
                        onChange={(event) => updateInviteDraft({ teamName: event.target.value })}
                        maxLength={32}
                        className="border-2 border-yellow-400/60 bg-black/70 px-3 py-3 text-xs font-black uppercase text-white outline-none"
                        placeholder="Takım adı"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                        {FORMATIONS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateInviteDraft({ formation: item.id })}
                            className={`game-button border-2 border-black px-3 py-2 text-[10px] font-black uppercase ${inviteDraft.formation === item.id ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'}`}
                          >
                            {item.id}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {tacticOptions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => updateInviteDraft({ tactic: item })}
                            className={`game-button border-2 border-black px-3 py-2 text-[10px] font-black uppercase ${inviteDraft.tactic === item ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'}`}
                          >
                            {item === 'Gegenpress' ? 'Hücum' : item === 'ParkTheBus' ? 'Savunma' : 'Dengeli'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {exceedsPowerLimit && (
                      <div className="mt-4 border-2 border-red-500 bg-red-500/15 p-3 text-xs font-black uppercase text-red-100">
                        Takım ortalaması {powerCap} limitini aşıyor.
                      </div>
                    )}
                    {inviteSaveIssues.length > 0 && (
                      <div className="mt-4 border-2 border-yellow-400 bg-yellow-400/10 p-3 text-xs font-black uppercase text-yellow-100">
                        <div className="flex flex-wrap gap-2">
                          {inviteSaveIssues.map((issue) => (
                            <span key={issue} className="border border-yellow-400/60 bg-black/35 px-2 py-1">{issue}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(280px,360px)_minmax(420px,1fr)]">
                      <DraftRollPanel
                        draft={inviteRollDraft}
                        rolledSquad={inviteRolledSquad}
                        rolledTeam={inviteRolledTeam}
                        rolledRating={inviteRolledTeamRating}
                        selectedIds={inviteDraftSelectedIds}
                        pendingPlayerId={invitePlacementPlayer?.id ?? null}
                        activeTotal={inviteDraftTotal}
                        teamById={teamById}
                        onRoll={rollInviteSquad}
                        onSelect={(playerId) => selectInvitePlayerForPlacement(playerId, 'draft')}
                        onToggleAutoRoll={() => updateInviteDraft({ autoRoll: !inviteDraft.autoRoll })}
                      />
                      <section className="hidden">
                        <div className="border-b border-white/15 pb-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">Oyuncu Havuzu</p>
                          <h4 className="text-lg font-black uppercase italic">Hızlı Oyna Kadrosu</h4>
                        </div>
                        <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                          {([] as Player[]).length === 0 && (
                            <p className="border-2 border-dashed border-white/15 p-4 text-xs font-black uppercase text-white/55">
                              Oyuncu havuzu için Hızlı Oyna kadrosu oluştur.
                            </p>
                          )}
                          {([] as Player[]).map((player) => (
                            <PremiumPlayerCard
                              key={player.id}
                              player={player}
                              team={player.teamId ? teamById.get(player.teamId) ?? null : null}
                              selected={inviteDraftSelectedIds.has(player.id)}
                              active={invitePlacementPlayer?.id === player.id}
                              disabled={inviteDraftSelectedIds.has(player.id)}
                              onClick={() => selectInvitePlayerForPlacement(player.id, 'pool')}
                            />
                          ))}
                        </div>
                      </section>

                      <SelectedPlacementPanel
                        player={invitePlacementPlayer}
                        team={invitePlacementPlayer?.teamId ? teamById.get(invitePlacementPlayer.teamId) ?? null : null}
                        warnings={invitePositionWarnings}
                        canPlace={Boolean(invitePlacementPlayer)}
                      />

                      <FriendPitchBoard
                        draft={invitePitchDraft}
                        playerById={playerById}
                        pendingPlayer={invitePlacementPlayer}
                        selectedPlayerId={invitePlacementPlayer?.id ?? null}
                        captainId={inviteDraft.captainId}
                        teamRating={teamPreview?.rating ?? getAverageRating(inviteStartingPlayers) ?? '-'}
                        onCaptain={(playerId) => updateInviteDraft({ captainId: playerId })}
                        onSelect={selectInvitePlayerForPlacement}
                        onPlace={placeInvitePlayer}
                        onRemove={removePlayerFromInviteDraft}
                      />
                    </div>
                  </div>

                  <div className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                    <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                      <ShieldCheck className="text-green-700" size={18} />
                      <h3 className="text-xl font-black uppercase italic">Sezon</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                      {allLeagueTeams.length === 0 && (
                        <p className="border-2 border-dashed border-black/20 p-4 text-xs font-black uppercase opacity-55">Takım bekleniyor</p>
                      )}
                      {allLeagueTeams.map((team) => (
                        <TeamCard key={team.id} team={team} active={team.ownerId === user?.id} />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleStartLeague}
                      disabled={!isOwner || activeLeague.teams.length === 0}
                      className="game-button mt-5 flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-35"
                    >
                      <Play size={18} fill="currentColor" /> Sezonu Başlat
                    </button>
                  </div>
                </section>
              )}

              {activeLeague.status !== 'waiting' && (
                <section className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                      <div className="flex flex-col gap-3 border-b-2 border-black pb-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Haftalık Fikstür</p>
                          <h3 className="text-2xl font-black uppercase italic">
                            {activeLeague.status === 'completed' ? 'Lig Sonucu' : `Hafta ${activeLeague.currentWeek + 1}`}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleSimulateWeek}
                          disabled={activeLeague.status !== 'active' || Boolean(liveFixture) || (isOnlineInviteLeague && !isOwner)}
                          className="game-button flex items-center gap-2 border-4 border-black bg-green-600 px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-35"
                        >
                          <Play size={18} fill="currentColor" /> Haftayı Simüle Et
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {activeLeague.status === 'completed' && (
                          <div className="border-2 border-black bg-yellow-400 p-4 text-black">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">Şampiyon</p>
                            <h4 className="mt-1 text-2xl font-black uppercase italic">{highlights?.leader?.teamName ?? '-'}</h4>
                          </div>
                        )}
                        {currentRound.length === 0 && activeLeague.status !== 'completed' && (
                          <p className="border-2 border-dashed border-black/25 p-5 text-center text-xs font-black uppercase opacity-55">Fikstür bekleniyor</p>
                        )}
                        {(currentRound.length > 0 ? currentRound : activeLeague.fixtures.at(-1) ?? []).map((fixture) => (
                          <FixtureRow
                            key={fixture.id}
                            fixture={fixture}
                            teamNameOf={teamNameOf}
                            highlightTeamIds={humanTeamIds}
                          />
                        ))}
                      </div>
                    </section>

                    <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                      <div className="mb-4 flex items-center gap-2 border-b border-white/15 pb-3">
                        <Trophy className="text-yellow-400" size={18} />
                        <h3 className="text-xl font-black uppercase italic">Özet</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <MiniStat dark label="Lider" value={highlights?.leader?.teamName ?? '-'} />
                        <MiniStat dark label="En Golcü" value={highlights?.topScoring?.teamName ?? '-'} />
                        <MiniStat dark label="Gol" value={highlights?.topScoring?.goalsFor ?? '-'} />
                        <MiniStat dark label="Savunma" value={highlights?.bestDefense?.teamName ?? '-'} />
                      </div>
                      {latestFixture?.result && (
                        <div className="mt-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Son Maç Raporu</p>
                          <FixtureRow fixture={latestFixture} teamNameOf={teamNameOf} highlightTeamIds={humanTeamIds} dark />
                        </div>
                      )}
                    </section>
                  </div>

                  {userMatchQueue.length > 0 && (
                    <section className="border-4 border-black bg-yellow-300 p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                      <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
                        <Eye size={18} />
                        <h3 className="text-xl font-black uppercase italic">Kullanıcı Maçını İzle</h3>
                      </div>
                      <div className="grid gap-3">
                        {userMatchQueue.map((fixture) => (
                          <button
                            key={fixture.id}
                            type="button"
                            onClick={() => setLiveFixture(fixture)}
                            className="game-button grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 border-2 border-black bg-white p-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000]"
                          >
                            <span className="truncate text-right">{teamNameOf(fixture.homeTeamId)}</span>
                            <span className="text-xl tabular-nums">{finalScore(fixture) ? `${finalScore(fixture)?.home} - ${finalScore(fixture)?.away}` : 'VS'}</span>
                            <span className="truncate text-left">{teamNameOf(fixture.awayTeamId)}</span>
                            <Eye size={16} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {liveFixture?.result && (
                    <LiveMatchPanel
                      fixture={liveFixture}
                      result={liveFixture.result}
                      homeName={teamNameOf(liveFixture.homeTeamId)}
                      awayName={teamNameOf(liveFixture.awayTeamId)}
                      onComplete={() => setLiveFixture(null)}
                      simulationMode="manager"
                    />
                  )}

                  <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                    <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
                      <Users className="text-green-700" size={18} />
                      <h3 className="text-2xl font-black uppercase italic">Puan Tablosu</h3>
                    </div>
                    <LeagueTable rows={activeLeague.standings} highlightTeamIds={humanTeamIds} />
                  </section>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string | number;
  dark?: boolean;
}) {
  return (
    <div className={`border-2 px-3 py-2 text-center ${dark ? 'border-white/15 bg-black text-white' : 'border-black bg-zinc-100 text-black'}`}>
      <p className="text-[8px] font-black uppercase tracking-[0.16em] opacity-55">{label}</p>
      <p className="mt-1 truncate text-sm font-black uppercase">{value}</p>
    </div>
  );
}

function TeamCard({
  team,
  active,
}: {
  team: MultiplayerLeagueSave['teams'][number];
  active: boolean;
}) {
  return (
    <div className={`border-2 border-black p-3 text-xs font-black uppercase ${active ? 'bg-yellow-400 text-black' : team.isBot ? 'bg-zinc-200 text-black' : 'bg-white text-black'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate">{team.teamName}</span>
        <span className="shrink-0 border border-black bg-black px-2 py-1 text-[9px] text-white">{team.isBot ? 'BOT' : 'USER'}</span>
      </div>
      <p className="mt-2 text-[10px] opacity-65">RAT {team.rating} / KIMYA {team.chemistry} / {team.tactic}</p>
    </div>
  );
}

function DraftCounter({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div className={`border-2 border-black bg-black/55 px-3 py-2 text-center ${strong ? 'min-h-[64px]' : ''}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className={`mt-1 font-black tabular-nums ${strong ? 'text-2xl text-yellow-400' : 'text-sm text-white'}`}>{value}</p>
    </div>
  );
}

function PlayerPortrait({
  player,
  compact = false,
}: {
  player: Player;
  compact?: boolean;
}) {
  const showPhoto = player.image_url.trim().length > 0;
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden border-2 border-yellow-400/45 bg-gradient-to-br from-zinc-900 via-zinc-800 to-yellow-900/60 bg-cover bg-center ${compact ? 'h-12 w-12' : 'h-20 w-20'}`}
      style={showPhoto ? { backgroundImage: `url("${player.image_url}")` } : undefined}
    >
      <UserRound className="text-yellow-300/70" size={compact ? 22 : 34} />
      <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-black uppercase text-yellow-300">
        {positionLabel(player.position)}
      </span>
    </div>
  );
}

function PlayerRatingBadge({ rating }: { rating: number }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center border-2 border-yellow-400 bg-black text-xl font-black text-yellow-300 shadow-[2px_2px_0px_0px_#000]">
      {rating}
    </span>
  );
}

function PremiumPlayerCard({
  player,
  team,
  selected = false,
  active = false,
  disabled = false,
  onClick,
}: {
  player: Player;
  team: SeasonTeam | null | undefined;
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const stats = getPlayerStats(player);
  const content = (
    <>
      <div className="flex items-start gap-3">
        <PlayerPortrait player={player} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black uppercase text-white">{player.name}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase text-yellow-300">{positionLabel(player.position)} / {team?.name ?? 'Takim'}</p>
              <p className="mt-1 truncate text-[9px] font-bold uppercase text-white/45">{player.nationality ?? '-'}</p>
            </div>
            <PlayerRatingBadge rating={player.overall_rating} />
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[9px] font-black uppercase">
        <PlayerStat label="Hiz" value={stats.pace} />
        <PlayerStat label="Sut" value={stats.shooting} />
        <PlayerStat label="Pas" value={stats.passing} />
        <PlayerStat label="Dri" value={stats.dribbling} />
        <PlayerStat label="Def" value={stats.defense} />
        <PlayerStat label="Fiz" value={stats.physical} />
      </div>
    </>
  );

  const className = `w-full border-2 p-3 text-left shadow-[3px_3px_0px_0px_#000] transition ${
    active
      ? 'border-yellow-400 bg-yellow-400/15'
      : selected
        ? 'border-white/10 bg-black/30 opacity-40'
        : 'border-white/15 bg-[linear-gradient(135deg,rgba(250,204,21,0.14),rgba(24,24,27,0.92)_42%,rgba(0,0,0,0.96))] hover:border-yellow-400/70'
  }`;

  if (!onClick) return <div className={className}>{content}</div>;

  return (
    <button type="button" onClick={onClick} disabled={disabled || selected} className={`${className} disabled:cursor-not-allowed`}>
      {content}
    </button>
  );
}

function PlayerStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="border border-white/10 bg-black/45 px-1 py-1 text-white/80">
      <span className="block text-white/35">{label}</span>
      {value}
    </span>
  );
}

function DraftRollPanel({
  draft,
  rolledSquad,
  rolledTeam,
  rolledRating,
  selectedIds,
  pendingPlayerId,
  activeTotal,
  teamById,
  onRoll,
  onSelect,
  onToggleAutoRoll,
}: {
  draft: SlotDraft;
  rolledSquad: Squad | null;
  rolledTeam: SeasonTeam | null;
  rolledRating: number;
  selectedIds: Set<string>;
  pendingPlayerId: string | null;
  activeTotal: number;
  teamById: Map<string, SeasonTeam>;
  onRoll: () => void;
  onSelect: (playerId: string) => void;
  onToggleAutoRoll: () => void;
}) {
  const stars = getStarCount(rolledRating);
  return (
    <section className="order-2 border-4 border-black bg-zinc-950 p-4 text-white shadow-[6px_6px_0px_0px_#000] xl:order-1">
      <div className="border-2 border-white/15 bg-black/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">Takim Cevir</p>
            <h4 className="mt-1 text-2xl font-black uppercase italic">{rolledSquad?.teamName ?? 'Takim bekleniyor'}</h4>
            <p className="mt-1 text-[10px] font-black uppercase text-white/50">
              {rolledTeam ? `${rolledTeam.league} / ${rolledTeam.country}` : 'Bu turdan 1 oyuncu sec'}
            </p>
          </div>
          <div className="shrink-0 border-2 border-yellow-400 bg-black px-3 py-2 text-center">
            <p className="text-[8px] font-black uppercase text-white/45">Guc</p>
            <p className="text-xl font-black text-yellow-300">{rolledRating || '-'}</p>
          </div>
        </div>
        {rolledSquad && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-lg tracking-[0.12em] text-yellow-300">{'\u2605'.repeat(stars)}<span className="text-white/20">{'\u2605'.repeat(5 - stars)}</span></span>
            <span className="text-[10px] font-black uppercase text-white/55">Bu takimdan 1 oyuncu sec</span>
          </div>
        )}
        <button
          type="button"
          onClick={onRoll}
          disabled={!draft.teamName.trim() || draft.pickAvailable || activeTotal >= 23}
          className="game-button mt-4 flex w-full items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-4 text-xs font-black uppercase text-black disabled:opacity-35"
        >
          <RefreshCw size={16} /> {rolledSquad ? 'Baska Takim Getir' : 'Takim Cevir'}
        </button>
        <button
          type="button"
          onClick={onToggleAutoRoll}
          className={`game-button mt-2 flex w-full items-center justify-between gap-3 border-2 border-black px-4 py-3 text-xs font-black uppercase ${draft.autoRoll ? 'bg-green-500 text-black' : 'bg-white/10 text-white'}`}
          aria-pressed={draft.autoRoll}
        >
          <span>Otomatik takim cevir</span>
          <span className="border border-black bg-black px-2 py-1 text-[10px] text-white">{draft.autoRoll ? 'Acik' : 'Kapali'}</span>
        </button>
        {!draft.teamName.trim() && (
          <p className="mt-3 border border-yellow-400 bg-yellow-400/10 p-2 text-[10px] font-black uppercase text-yellow-100">
            Takim adi girilmeden kadro kurulamaz.
          </p>
        )}
        {draft.pickAvailable && !pendingPlayerId && (
          <p className="mt-3 border border-blue-400 bg-blue-500/10 p-2 text-[10px] font-black uppercase text-blue-100">
            Once bu listeden 1 oyuncu sec.
          </p>
        )}
      </div>

      {rolledSquad ? (
        <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
          {rolledSquad.players.map((player) => {
            const team = player.teamId ? teamById.get(player.teamId) ?? null : null;
            const selected = selectedIds.has(player.id);
            return (
              <PremiumPlayerCard
                key={player.id}
                player={player}
                team={team}
                selected={selected}
                active={pendingPlayerId === player.id}
                disabled={!draft.pickAvailable || !draft.teamName.trim()}
                onClick={() => onSelect(player.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid min-h-64 place-items-center border-2 border-dashed border-white/15 text-center">
          <div>
            <RefreshCw className="mx-auto text-yellow-400" />
            <p className="mt-3 text-xs font-black uppercase">Takim cevirmek icin butona bas</p>
            <p className="mt-1 text-[10px] font-bold uppercase text-white/45">Her turda sadece 1 futbolcu secilebilir.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function SelectedPlacementPanel({
  player,
  team,
  warnings,
  canPlace,
}: {
  player: Player | null;
  team: SeasonTeam | null;
  warnings: string[];
  canPlace: boolean;
}) {
  return (
    <section className="order-3 space-y-4 border-4 border-black bg-zinc-950 p-4 text-white shadow-[6px_6px_0px_0px_#000] xl:order-2">
      <div className="border-2 border-white/15 bg-black/40 p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">Sectigin Oyuncu</p>
        {player ? (
          <div className="mt-3">
            <PremiumPlayerCard player={player} team={team} active />
            <p className="mt-3 border border-yellow-400 bg-yellow-400/10 p-3 text-xs font-black uppercase text-yellow-100">
              Hangi mevkiye yerlestirmek istiyorsun? Sagdaki saha, yedek veya rezerv slotuna dokun.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid min-h-44 place-items-center border-2 border-dashed border-white/15 text-center">
            <div>
              <UserRound className="mx-auto text-white/35" />
              <p className="mt-3 text-xs font-black uppercase text-white/70">Oyuncu secimi bekleniyor</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-white/40">Takim cevir ve listedeki futbolculardan birini sec.</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-2 border-white/15 bg-black/40 p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">Kadro Dengesi</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {warnings.length === 0 ? (
            <span className="border border-green-400 bg-green-500/15 px-2 py-1 text-[10px] font-black uppercase text-green-100">Denge iyi</span>
          ) : warnings.map((warning) => (
            <span key={warning} className="border border-red-400 bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase text-red-100">
              {warning}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase text-white/45">
          {canPlace ? 'Sadece oyuncunun oynayabildigi mevkiler aktif olur.' : 'Slotlar, oyuncu secildikten sonra aktif olur.'}
        </p>
      </div>
    </section>
  );
}

function FriendPitchBoard({
  draft,
  playerById,
  pendingPlayer,
  selectedPlayerId,
  captainId,
  teamRating,
  onCaptain,
  onSelect,
  onPlace,
  onRemove,
}: {
  draft: {
    teamName: string;
    formation: FormationType;
    startingXI: string[];
    substitutes: string[];
    reserves: string[];
  };
  playerById: Map<string, Player>;
  pendingPlayer: Player | null;
  selectedPlayerId?: string | null;
  captainId: string | null;
  teamRating: number | string;
  onCaptain: (playerId: string) => void;
  onSelect: (playerId: string, source: RosterTarget, slotIndex?: number) => void;
  onPlace: (target: RosterTarget, slotIndex?: number) => void;
  onRemove: (playerId: string) => void;
}) {
  const selectedPlayers = normalizeStartingSlots(draft.startingXI).map((id) => (
    id ? playerById.get(id) ?? null : null
  ));
  return (
    <section className="order-1 space-y-4 border-4 border-black bg-zinc-950 p-4 text-white shadow-[6px_6px_0px_0px_#000] xl:order-3">
      <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">Saha Yerlesimi</p>
          <h4 className="text-xl font-black uppercase italic">{draft.formation}</h4>
        </div>
        <p className="text-right text-[10px] font-black uppercase text-white/45">Kaptan: {captainId ? playerById.get(captainId)?.name ?? '-' : '-'}</p>
      </div>

      <Pitch
        elementId="friend-league-pitch"
        controlled={{
          selectedPlayers,
          teamRating,
          formationId: draft.formation,
          squadName: draft.teamName || 'Arkadas Ligi',
          blindMode: false,
          renderSlot: (slot, player) => (
            <PitchSlotButton
              key={`${slot.index}-${slot.allowedPosition}`}
              slot={slot}
              player={player}
              pendingPlayer={pendingPlayer}
              selectedPlayerId={selectedPlayerId}
              captainId={captainId}
              onCaptain={onCaptain}
              onSelect={onSelect}
              onPlace={onPlace}
              onRemove={onRemove}
            />
          ),
        }}
      />

      <BenchSlotGrid
        title="Yedek"
        target="substitutes"
        limit={rosterTargetLimits.substitutes}
        ids={draft.substitutes}
        playerById={playerById}
        pendingPlayer={pendingPlayer}
        selectedPlayerId={selectedPlayerId}
        onSelect={onSelect}
        onPlace={onPlace}
        onRemove={onRemove}
      />
      <BenchSlotGrid
        title="Rezerv"
        target="reserves"
        limit={rosterTargetLimits.reserves}
        ids={draft.reserves}
        playerById={playerById}
        pendingPlayer={pendingPlayer}
        selectedPlayerId={selectedPlayerId}
        onSelect={onSelect}
        onPlace={onPlace}
        onRemove={onRemove}
      />
    </section>
  );
}

function PitchSlotButton({
  slot,
  player,
  pendingPlayer,
  selectedPlayerId,
  captainId,
  onCaptain,
  onSelect,
  onPlace,
  onRemove,
}: {
  slot: PositionConfig;
  player: Player | null;
  pendingPlayer: Player | null;
  selectedPlayerId?: string | null;
  captainId: string | null;
  onCaptain: (playerId: string) => void;
  onSelect: (playerId: string, source: RosterTarget, slotIndex?: number) => void;
  onPlace: (target: RosterTarget, slotIndex?: number) => void;
  onRemove: (playerId: string) => void;
}) {
  const compatible = pendingPlayer ? isPositionCompatible(pendingPlayer, slot.allowedPosition) : true;
  const isSelected = Boolean(player && selectedPlayerId === player.id);
  return (
    <div className="relative flex h-16 w-16 items-center justify-center text-center transition-all sm:h-18 sm:w-18">
      {player ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(player.id, 'startingXI', slot.index)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect(player.id, 'startingXI', slot.index);
          }}
          className={`player-card player-card-pop flex h-full w-full flex-col items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_#000] ${captainId === player.id ? 'is-captain' : ''} ${isSelected ? 'scale-110 border-yellow-400 shadow-[0_0_18px_#eab308]' : ''}`}
        >
          <div className="card-scan-line" />
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCaptain(player.id);
              }}
              className={`absolute -left-3 -top-3 grid h-6 w-6 place-items-center border border-black shadow-[1px_1px_0px_0px_#000] ${captainId === player.id ? 'captain-crown-pulse bg-yellow-500 text-black' : 'bg-black text-yellow-500'}`}
              aria-label="Kaptan sec"
              title="Kaptan sec"
            >
              <Crown size={12} fill={captainId === player.id ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(player.id);
              }}
              className="absolute -right-3 -top-3 grid h-6 w-6 place-items-center border border-black bg-red-600 text-white shadow-[1px_1px_0px_0px_#000]"
              aria-label="Oyuncuyu cikar"
              title="Oyuncuyu cikar"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="text-xl font-black text-white">{player.jersey_number}</div>
          <div className="absolute -bottom-7 max-w-28 truncate border border-zinc-700 bg-black px-2 py-0.5 text-[9px] font-black uppercase text-white">
            {player.name}
          </div>
          <div className="card-rating-badge absolute -right-3 top-5 flex h-6 w-6 items-center justify-center border border-black text-[10px] font-black shadow-[1px_1px_0px_0px_#000]">
            {player.overall_rating}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPlace('startingXI', slot.index)}
          disabled={!pendingPlayer || !compatible}
          className={`game-button flex h-full w-full flex-col items-center justify-center border-2 border-dashed text-[10px] font-black uppercase transition-all disabled:cursor-not-allowed ${
            pendingPlayer && compatible
              ? 'border-yellow-400 bg-yellow-400/30 text-white shadow-[0_0_15px_#eab308]'
              : pendingPlayer && !compatible
                ? 'border-red-400/40 bg-red-500/10 text-red-100 opacity-25'
                : 'border-white/20 text-white/40 hover:bg-white/5'
          }`}
          title={pendingPlayer && !compatible ? 'Bu oyuncu bu mevkide oynayamaz.' : positionLabel(slot.allowedPosition)}
        >
          <span>{positionLabel(slot.allowedPosition)}</span>
        </button>
      )}
    </div>
  );
}

function BenchSlotGrid({
  title,
  target,
  limit,
  ids,
  playerById,
  pendingPlayer,
  selectedPlayerId,
  onSelect,
  onPlace,
  onRemove,
}: {
  title: string;
  target: RosterTarget;
  limit: number;
  ids: string[];
  playerById: Map<string, Player>;
  pendingPlayer: Player | null;
  selectedPlayerId?: string | null;
  onSelect: (playerId: string, source: RosterTarget, slotIndex?: number) => void;
  onPlace: (target: RosterTarget, slotIndex?: number) => void;
  onRemove: (playerId: string) => void;
}) {
  const slots = Array.from({ length: limit }, (_, index) => compactIds(ids)[index] ?? '');
  return (
    <div className="border-2 border-white/15 bg-black/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-black uppercase text-yellow-400">{title}</h4>
        <span className="text-[10px] font-black uppercase text-white/55">{getRosterCount(ids)}/{limit}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 xl:grid-cols-4 2xl:grid-cols-7">
        {slots.map((id, index) => {
          const player = id ? playerById.get(id) ?? null : null;
          return (
            <div key={`${target}-${index}`} className="min-h-20 border border-white/15 bg-zinc-950/80 p-2">
              {player ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(player.id, target, index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelect(player.id, target, index);
                  }}
                  className={`game-button w-full text-left text-[9px] font-black uppercase ${selectedPlayerId === player.id ? 'text-yellow-300' : 'text-white'}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="min-w-0 truncate text-white">{player.name}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(player.id);
                      }}
                      className="grid h-5 w-5 shrink-0 place-items-center border border-red-500 bg-red-600 text-white"
                      aria-label="Oyuncuyu cikar"
                      title="Oyuncuyu cikar"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <p className="mt-2 text-yellow-300">{player.overall_rating} / {positionLabel(player.position)}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPlace(target, index)}
                  disabled={!pendingPlayer}
                  className="game-button grid h-full min-h-16 w-full place-items-center border border-white/20 bg-black/55 text-[10px] font-black uppercase text-white disabled:opacity-35"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>{title}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraftRosterList({
  title,
  ids,
  playerById,
  captainId,
  onCaptain,
  onRemove,
}: {
  title: string;
  ids: string[];
  playerById: Map<string, Player>;
  captainId: string | null;
  onCaptain: (playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  return (
    <div className="border-2 border-white/15 bg-white/5 p-3">
      <h4 className="mb-3 text-sm font-black uppercase text-yellow-400">{title} ({ids.length})</h4>
      <div className="space-y-2">
        {ids.length === 0 && <p className="text-xs font-black uppercase text-white/45">Boş</p>}
        {ids.map((id) => {
          const player = playerById.get(id);
          return (
            <div key={id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border border-white/10 bg-black/25 p-2 text-[10px] font-black uppercase">
              <span className="min-w-0 truncate">{player ? `#${player.jersey_number} ${player.name}` : id}</span>
              <button
                type="button"
                onClick={() => onCaptain(id)}
                disabled={title !== 'İlk 11'}
                className={`grid h-7 w-7 place-items-center border ${captainId === id ? 'border-yellow-400 bg-yellow-400 text-black' : 'border-white/20 text-yellow-400'} disabled:opacity-25`}
                aria-label="Kaptan seç"
                title="Kaptan seç"
              >
                <Crown size={13} fill={captainId === id ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(id)}
                className="grid h-7 w-7 place-items-center border border-red-500 bg-red-600 text-white"
                aria-label="Oyuncuyu çıkar"
                title="Oyuncuyu çıkar"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerDraftRow({
  player,
  selected,
  draft,
  onAdd,
}: {
  player: Player;
  selected: boolean;
  draft: SlotDraft;
  onAdd: (playerId: string, target: RosterTarget) => void;
}) {
  return (
    <div className={`border border-white/10 bg-black/25 p-2 text-[10px] font-black uppercase ${selected ? 'opacity-35' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">#{player.jersey_number} {player.name}</span>
        <span className="shrink-0 border border-white/20 px-2 py-1">{player.overall_rating}</span>
      </div>
      <p className="mt-1 truncate text-[9px] text-white/45">{player.position} / {player.nationality ?? '-'}</p>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(Object.keys(rosterTargetLabels) as RosterTarget[]).map((target) => (
          <button
            key={target}
            type="button"
            disabled={!draft.pickAvailable || !draft.teamName.trim() || selected || draft[target].length >= rosterTargetLimits[target]}
            onClick={() => onAdd(player.id, target)}
            className="game-button border border-black bg-yellow-400 px-2 py-2 text-[9px] font-black uppercase text-black disabled:opacity-25"
          >
            {rosterTargetLabels[target]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RealTeamPanel({
  title,
  teams,
  warning = false,
}: {
  title: string;
  teams: { id: string; teamName: string; rating: number }[];
  warning?: boolean;
}) {
  return (
    <section className={`border-4 border-black p-5 shadow-[6px_6px_0px_0px_#000] ${warning ? 'bg-red-50 text-black' : 'bg-white text-black'}`}>
      <h3 className="border-b-2 border-black pb-3 text-lg font-black uppercase italic">{title}</h3>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {teams.length === 0 && <p className="text-xs font-black uppercase opacity-45">Takım yok</p>}
        {teams.map((team) => (
          <div key={team.id} className={`grid grid-cols-[1fr_auto] gap-2 border-2 border-black p-2 text-[10px] font-black uppercase ${warning ? 'bg-red-100' : 'bg-zinc-100'}`}>
            <span className="truncate">{team.teamName}</span>
            <span>RAT {team.rating}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FixtureRow({
  fixture,
  teamNameOf,
  highlightTeamIds,
  dark = false,
}: {
  fixture: CompetitionFixture;
  teamNameOf: (teamId: string) => string;
  highlightTeamIds: string[];
  dark?: boolean;
}) {
  const score = finalScore(fixture);
  const owned = highlightTeamIds.includes(fixture.homeTeamId) || highlightTeamIds.includes(fixture.awayTeamId);
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 border-2 border-black p-3 text-xs font-black shadow-[3px_3px_0px_0px_#000] ${owned ? 'bg-yellow-400 text-black' : dark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      <span className="truncate text-right uppercase">{teamNameOf(fixture.homeTeamId)}</span>
      <span className="min-w-20 text-center text-xl tabular-nums">{score ? `${score.home} - ${score.away}` : 'VS'}</span>
      <span className="truncate text-left uppercase">{teamNameOf(fixture.awayTeamId)}</span>
      <Eye size={15} className={owned ? 'opacity-100' : 'opacity-20'} />
    </div>
  );
}

function LeagueTable({
  rows,
  highlightTeamIds,
}: {
  rows: MultiplayerStandingRow[];
  highlightTeamIds: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[2.5rem_1fr_repeat(8,3rem)_5rem] gap-1 border-b-2 border-black pb-2 text-center text-[9px] font-black uppercase">
          <span>#</span><span className="text-left">Takım</span><span>O</span><span>G</span><span>B</span><span>M</span><span>A</span><span>Y</span><span>AV</span><span>P</span><span>Form</span>
        </div>
        {rows.length === 0 && (
          <div className="border-b border-black/10 py-4 text-center text-xs font-black uppercase opacity-50">Henüz maç oynanmadı</div>
        )}
        {rows.map((row, index) => (
          <div key={row.teamId} className={`grid grid-cols-[2.5rem_1fr_repeat(8,3rem)_5rem] gap-1 border-b border-black/10 py-2 text-center text-[11px] font-black ${highlightTeamIds.includes(row.teamId) ? 'bg-yellow-400' : ''}`}>
            <span>{index + 1}</span>
            <span className="truncate text-left uppercase">{row.teamName}{row.isBot ? ' BOT' : ''}</span>
            <span>{row.played}</span>
            <span>{row.wins}</span>
            <span>{row.draws}</span>
            <span>{row.losses}</span>
            <span>{row.goalsFor}</span>
            <span>{row.goalsAgainst}</span>
            <span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span>
            <span>{row.points}</span>
            <span>{row.form || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
