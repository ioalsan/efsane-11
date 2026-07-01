'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import MatchEnginePanel from './MatchEnginePanel';
import { useTeamStore } from '@/store/useTeamStore';
import {
  createLeague,
  createLocalFriendLeague,
  getLeagueHighlights,
  getCurrentWeekProgress,
  getInviteLeagueStartReadiness,
  getPowerLimitCap,
  getRealTeamReplacementPlan,
  getTeamDisplayName,
  isCurrentWeekReadyToAdvance,
  repairCurrentWeekProgress,
  forceAdvanceCurrentWeek,
  softDeleteLeague,
  joinLeague,
  listLeagues,
  consumeMultiplayerMigrationNotice,
  savePlayerSlotToLeague,
  saveTeamToLeague,
  simulateWeek,
  startLocalFriendLeague,
  startLeague,
  buildMultiplayerTeamInput,
  updateWeekUserProgress,
  type MultiplayerLeague as MultiplayerLeagueSave,
  type MultiplayerMaxUsers,
  type MultiplayerPowerLimit,
  type MultiplayerStandingRow,
  type PlayerSlot,
  type PlayerSlotTeamInput,
  type WeekUserProgress,
} from '@/lib/multiplayerService';
import {
  createLeague as createOnlineLeague,
  joinLeague as joinOnlineLeague,
  saveTeamToLeague as saveOnlineTeamToLeague,
  simulateWeek as simulateOnlineWeek,
  startLeague as startOnlineLeague,
  repairCurrentWeekProgress as repairOnlineCurrentWeekProgress,
  forceAdvanceCurrentWeek as forceAdvanceOnlineCurrentWeek,
  softDeleteLeague as softDeleteOnlineLeague,
  subscribeOnlineLeagues,
  updateWeekUserProgress as updateOnlineWeekUserProgress,
} from '@/lib/multiplayerFirestoreService';
import {
  isFirebaseConfigured,
  subscribeAnonymousUser,
} from '@/lib/firebase';
import {
  DEFAULT_COMPETITION_ID,
  getCompetitions,
  getCompetitionSquads,
  getCompetitionTeamStrength,
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
import { getDraftSeenTeamCount, getDraftStrengthTier, pickNextDraftSquad, type DraftStrengthTier } from '@/lib/draftTeamRotation';
import type { ManagerMentality } from '@/lib/teamManagement';
import type { CompetitionFixture } from '@/lib/competitionEngine';
import type { Player, SeasonTeam, Squad } from '@/types';
import Pitch from './Pitch';
import {
  defaultMultiplayerMatchPreferences,
  getMultiplayerMatchPreferenceKeys,
  getNextMultiplayerMatchPreferences,
  writeMultiplayerAutoContinue,
  writeMultiplayerAutoSeason,
  writeMultiplayerMatchSpeed,
  type SimulationSpeed,
} from '@/lib/multiplayerMatchPreferences';
import { getCurrentUserWatchProgress, shouldAutoAdvanceInviteWeek } from '@/lib/multiplayerMatchFlow';
import { clearCanli11MultiplayerStorage } from '@/lib/multiplayerCleanup';
import { filterMultiplayerLeagues, type MultiplayerLeagueListFilter } from '@/lib/multiplayerLeagueList';
import { createMatchSessionId } from '@/lib/matchEngine';

const maxUserOptions: MultiplayerMaxUsers[] = [2, 4, 8, 12, 18];
const friendCountOptions = [2, 3, 4, 5];
const powerLimitOptions: MultiplayerPowerLimit[] = ['balanced', 'max80', 'max85', 'free'];
const tacticOptions: ManagerMentality[] = ['Gegenpress', 'Balanced', 'ParkTheBus'];
const INVITE_DRAFT_STORAGE_PREFIX = 'canli11:draft';
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
  deleted: 'Silindi',
};

const weekProgressLabels: Record<WeekUserProgress['status'], string> = {
  pending: 'Bekliyor',
  watching: 'İzleniyor',
  completed: 'Tamamlandı',
  skipped: 'Sonuca atlandı',
  autoCompleted: 'Otomatik tamamlandı',
};

const isProgressDone = (status: WeekUserProgress['status']) => (
  status === 'completed' || status === 'skipped' || status === 'autoCompleted'
);

type NoticeTone = 'info' | 'success' | 'error';

interface Notice {
  tone: NoticeTone;
  text: string;
}

type StartDebugStep =
  | 'idle'
  | 'clicked'
  | 'validation-start'
  | 'validation-ok'
  | 'service-call-start'
  | 'service-call-success'
  | 'local-state-update'
  | 'waiting-snapshot'
  | 'snapshot-active'
  | 'error';

interface StartDebugState {
  clicked: boolean;
  clickedAt: string | null;
  step: StartDebugStep;
  steps: StartDebugStep[];
  currentUserId: string | null;
  ownerId: string | null;
  isOwner: boolean;
  leagueId: string | null;
  statusBefore: string | null;
  userTeamsCount: number;
  totalTeamsCount: number;
  expectedUserTeams: number;
  expectedTotalTeams: number;
  isStuck: boolean;
  errorCode?: string;
  errorMessage?: string;
  serviceResultStatus?: string;
  serviceResultUpdatedAt?: string;
  serviceResultStartVersion?: number | null;
  lastSnapshotStatus?: string;
  lastSnapshotUpdatedAt?: string;
  lastSnapshotStartVersion?: number | null;
  hydratedTeamsCount?: number;
  hydratedFixturesCount?: number;
  hydratedWeekProgressCount?: number;
}

type RosterTarget = 'startingXI' | 'substitutes';
const draftTargetTotal = 18;
const twoLineClampStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

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
  rolledTeamIds: string[];
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
  rolledTeamIds: string[];
  pickAvailable: boolean;
  autoRoll: boolean;
}

type DraftGuideDraft = {
  teamName: string;
  formation: FormationType | null;
  tactic: ManagerMentality | null;
  captainId: string | null;
  startingXI: string[];
  substitutes: string[];
  rolledSquadId: string | null;
  pickAvailable: boolean;
};

type PlacementSource = 'pool' | 'draft' | RosterTarget;

interface PlacementSelection {
  playerId: string;
  source: PlacementSource;
  slotIndex?: number;
}

const rosterTargetLabels: Record<RosterTarget, string> = {
  startingXI: 'İlk 11',
  substitutes: 'Yedek',
};

const rosterTargetLimits: Record<RosterTarget, number> = {
  startingXI: 11,
  substitutes: 7,
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
  rolledTeamIds: [],
  pickAvailable: false,
  autoRoll: false,
});

const inviteDraftStorageKey = (leagueId: string, userId: string) => `${INVITE_DRAFT_STORAGE_PREFIX}:${leagueId}:${userId}`;

const isFormationType = (value: unknown): value is FormationType => (
  typeof value === 'string' && FORMATIONS.some((item) => item.id === value)
);

const isManagerMentality = (value: unknown): value is ManagerMentality => (
  typeof value === 'string' && tacticOptions.includes(value as ManagerMentality)
);

const isInviteDraftDirty = (draft: InviteDraft) => (
  draft.teamName.trim().length > 0 ||
  Boolean(draft.formation) ||
  Boolean(draft.tactic) ||
  Boolean(draft.captainId) ||
  getRosterCount(draft.startingXI) > 0 ||
  getRosterCount(draft.substitutes) > 0 ||
  draft.rolledTeamIds.length > 0 ||
  Boolean(draft.rolledSquadId) ||
  draft.pickAvailable ||
  draft.autoRoll
);

const getDraftGuideStepIndex = (draft: DraftGuideDraft, pendingPlayer: Player | null) => {
  const startingCount = getRosterCount(draft.startingXI);
  const substituteCount = getRosterCount(draft.substitutes);

  if (!draft.teamName.trim()) return 0;
  if (!draft.formation) return 1;
  if (!draft.tactic) return 2;
  if (!draft.pickAvailable && !pendingPlayer && startingCount < 11 && substituteCount < 7) return 3;
  if (draft.pickAvailable && !pendingPlayer) return 4;
  if (pendingPlayer) return 5;
  if (startingCount < 11) return 6;
  if (substituteCount < 7) return 7;
  if (!draft.captainId) return 8;
  return 9;
};

function DraftStepGuide({
  draft,
  pendingPlayer,
  canSave,
}: {
  draft: DraftGuideDraft;
  pendingPlayer: Player | null;
  canSave: boolean;
}) {
  const steps = [
    { label: 'Takım adı gir' },
    { label: 'Diziliş seç' },
    { label: 'Taktik seç' },
    { label: 'Takım çevir' },
    { label: 'Oyuncu seç' },
    { label: 'Uygun mevkiye yerleştir' },
    { label: 'İlk 11 tamamla' },
    { label: 'Yedekleri doldur' },
    { label: 'Kaptan seç' },
    { label: 'Takımı kaydet' },
  ];
  const currentStepIndex = getDraftGuideStepIndex(draft, pendingPlayer);
  const startingCount = getRosterCount(draft.startingXI);
  const substituteCount = getRosterCount(draft.substitutes);
  const summary = !draft.teamName.trim()
    ? 'Önce takım adını gir.'
    : !draft.formation
      ? 'Sonra dizilişi seç.'
      : !draft.tactic
        ? 'Ardından taktiği belirle.'
        : draft.pickAvailable && !pendingPlayer
          ? 'Şimdi gelen takımdan 1 oyuncu seç.'
          : pendingPlayer
            ? 'Oyuncuyu uygun saha slotuna yerleştir.'
            : startingCount < 11
              ? 'Yeni takım çevir ve ilk 11’i tamamla.'
              : substituteCount < 7
                ? 'Yedekleri doldur.'
                : !draft.captainId
                  ? 'Kaptanı seç.'
                  : canSave
                    ? 'Takımı kaydetmeye hazırsın.'
                    : 'Eksik alanları tamamla.';

  return (
    <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-600">Yeni kullanıcı rehberi</p>
          <h3 className="mt-1 text-lg font-black uppercase italic">Sıradaki Adım</h3>
        </div>
        <span className="shrink-0 border-2 border-black bg-black px-3 py-1 text-[10px] font-black uppercase text-yellow-400">
          {currentStepIndex + 1}/10
        </span>
      </div>
      <p className="mt-3 text-sm font-black uppercase leading-relaxed">
        {summary}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => {
          const state = index < currentStepIndex ? 'done' : index === currentStepIndex ? 'current' : 'next';
          return (
            <div
              key={step.label}
              className={`min-h-16 border-2 border-black px-3 py-2 text-[10px] font-black uppercase leading-tight ${
                state === 'done'
                  ? 'bg-green-100 text-green-900'
                  : state === 'current'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-zinc-100 text-black/55'
              }`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="block text-[9px] opacity-60">{index + 1}</span>
              <span
                className="mt-1 block"
                style={twoLineClampStyle}
                title={step.label}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const parseStoredInviteDraft = (value: unknown): InviteDraft | null => {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<InviteDraft>;
  return {
    teamName: typeof draft.teamName === 'string' ? draft.teamName : '',
    formation: isFormationType(draft.formation) ? draft.formation : null,
    tactic: isManagerMentality(draft.tactic) ? draft.tactic : null,
    captainId: typeof draft.captainId === 'string' ? draft.captainId : null,
    startingXI: normalizeStartingSlots(Array.isArray(draft.startingXI) ? draft.startingXI.filter((id): id is string => typeof id === 'string') : []),
    substitutes: Array.isArray(draft.substitutes) ? draft.substitutes.filter((id): id is string => typeof id === 'string').slice(0, 7) : [],
    reserves: [],
    rolledSquadId: typeof draft.rolledSquadId === 'string' ? draft.rolledSquadId : null,
    rolledTeamIds: Array.isArray(draft.rolledTeamIds) ? draft.rolledTeamIds.filter((id): id is string => typeof id === 'string') : [],
    pickAvailable: Boolean(draft.pickAvailable),
    autoRoll: Boolean(draft.autoRoll),
  };
};

const readStoredInviteDraft = (key: string): InviteDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? parseStoredInviteDraft(JSON.parse(raw) as unknown) : null;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
};

const writeStoredInviteDraft = (key: string, draft: InviteDraft) => {
  if (typeof window === 'undefined') return;
  if (!isInviteDraftDirty(draft)) {
    window.sessionStorage.removeItem(key);
    return;
  }
  window.sessionStorage.setItem(key, JSON.stringify(draft));
};

const removeStoredInviteDraft = (key: string | null) => {
  if (typeof window === 'undefined' || !key) return;
  window.sessionStorage.removeItem(key);
};

const rightBackPosition = 'SĞB' as Player['position'];
const rightWingPosition = 'SĞK' as Player['position'];

const positionAliases: Record<string, Player['position']> = {
  GK: 'KL',
  KL: 'KL',
  CB: 'STP',
  STP: 'STP',
  LB: 'SLB',
  SLB: 'SLB',
  RB: rightBackPosition,
  SGB: rightBackPosition,
  'SĞB': rightBackPosition,
  DM: 'MO',
  MDO: 'MO',
  CM: 'MO',
  MO: 'MO',
  AM: 'MO',
  MOO: 'MO',
  LW: 'SLK',
  SLK: 'SLK',
  RW: rightWingPosition,
  SGK: rightWingPosition,
  'SĞK': rightWingPosition,
  ST: 'SF',
  SNT: 'SF',
  SF: 'SF',
};

const normalizePositionCode = (position?: string | null) => (
  position ? positionAliases[position] ?? null : null
);

const positionLabel = (position: string) => {
  const labels: Record<string, string> = {
    KL: 'KL',
    STP: 'STP',
    SLB: 'SLB',
    [rightBackPosition]: 'SGB',
    MO: 'MO',
    SLK: 'SLK',
    [rightWingPosition]: 'SGK',
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

const getErrorCode = (error: unknown) => (
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
);

const createDraftFromSlot = (slot: PlayerSlot): SlotDraft => ({
  displayName: slot.displayName,
  teamName: slot.teamName,
  formation: slot.formation ?? '4-2-3-1',
  tactic: slot.tactic ?? 'Balanced',
  captainId: slot.captainId,
  startingXI: normalizeStartingSlots(slot.selectedSquad?.startingXI ?? []),
  substitutes: slot.selectedSquad?.substitutes ?? [],
  reserves: [],
  rolledSquadId: null,
  rolledTeamIds: [],
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
].filter((id) => id.trim().length > 0);

const getDraftPlayers = (ids: string[], playerById: Map<string, Player>) => (
  ids.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player))
);

const getPositionWarnings = (players: Player[]) => {
  const counts = {
    goalkeeper: players.filter((player) => player.position === 'KL').length,
    defense: players.filter((player) => ['STP', 'SLB', rightBackPosition].includes(normalizePositionCode(player.position) ?? player.position)).length,
    midfield: players.filter((player) => player.position === 'MO').length,
    attack: players.filter((player) => ['SLK', rightWingPosition, 'SF'].includes(normalizePositionCode(player.position) ?? player.position)).length,
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
    normalizePositionCode(player.position),
    normalizePositionCode(player.secondary_position),
    ...(player.compatiblePositions ?? []).map((position) => normalizePositionCode(position)),
    normalizePositionCode(player.primaryPosition),
    ...(player.secondaryPositions ?? []).map((position) => normalizePositionCode(position)),
  ].filter(Boolean));
  const normalizedAllowedPosition = normalizePositionCode(allowedPosition);
  return Boolean(normalizedAllowedPosition && positions.has(normalizedAllowedPosition));
};

const hasOpenCompatibleStartingSlot = (
  draft: Pick<SlotDraft, 'startingXI'> | Pick<InviteDraft, 'startingXI'>,
  player: Player,
  formationId: FormationType,
) => {
  const slots = normalizeStartingSlots(draft.startingXI);
  const formationConfig = FORMATIONS.find((item) => item.id === formationId) ?? FORMATIONS[0];
  return formationConfig.positions.some((slot) => (
    !slots[slot.index] && isPositionCompatible(player, slot.allowedPosition)
  ));
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
  const activeDraftPanelRef = useRef<HTMLDivElement | null>(null);
  const activePitchRef = useRef<HTMLDivElement | null>(null);
  const activeSaveRef = useRef<HTMLDivElement | null>(null);
  const inviteDraftPanelRef = useRef<HTMLDivElement | null>(null);
  const invitePitchRef = useRef<HTMLDivElement | null>(null);
  const inviteSaveRef = useRef<HTMLDivElement | null>(null);
  const liveMatchRef = useRef<HTMLDivElement | null>(null);
  const weekFlowRef = useRef<HTMLElement | null>(null);
  const inviteDraftKeyRef = useRef<string | null>(null);
  const liveSkippedRef = useRef(false);
  const autoOpenedProgressRef = useRef<string | null>(null);
  const autoGeneratedWeekRef = useRef<string | null>(null);
  const autoAdvancedWeekRef = useRef<string | null>(null);
  const autoSeasonWeekRef = useRef<string | null>(null);
  const simulateWeekActionRef = useRef<() => Promise<void>>(async () => {});
  const watchMatchActionRef = useRef<(progress: WeekUserProgress) => Promise<void>>(async () => {});
  const forceAdvanceActionRef = useRef<() => Promise<void>>(async () => {});

  const scrollToElement = useCallback((element: HTMLElement | null) => {
    element?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }, []);

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
  const [isStartingLeague, setIsStartingLeague] = useState(false);
  const [startDebug, setStartDebug] = useState<StartDebugState | null>(null);
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [liveProgressId, setLiveProgressId] = useState<string | null>(null);
  const [liveSkipped, setLiveSkipped] = useState(false);
  const [shouldScrollToLive, setShouldScrollToLive] = useState(false);
  const [autoContinue, setAutoContinue] = useState(defaultMultiplayerMatchPreferences.autoContinue);
  const [autoSeason, setAutoSeason] = useState(defaultMultiplayerMatchPreferences.autoSeason);
  const [matchSpeed, setMatchSpeed] = useState<SimulationSpeed>(defaultMultiplayerMatchPreferences.speed);
  const [matchPreferencesKey, setMatchPreferencesKey] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [lastAutoContinueSetter, setLastAutoContinueSetter] = useState<'user-toggle' | 'initial-load' | 'cleanup' | 'unknown'>('unknown');
  const [lastAutoContinueChangeAt, setLastAutoContinueChangeAt] = useState<string | null>(null);
  const [matchFlowLastAction, setMatchFlowLastAction] = useState('idle');
  const [lastFirestoreError, setLastFirestoreError] = useState<string | null>(null);
  const [advanceInProgress, setAdvanceInProgress] = useState(false);
  const [showSeasonDebug, setShowSeasonDebug] = useState(false);
  const [leagueListFilter, setLeagueListFilter] = useState<MultiplayerLeagueListFilter>('open');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [pendingPlacementPlayerId, setPendingPlacementPlayerId] = useState<string | null>(null);
  const [pendingPlacementSource, setPendingPlacementSource] = useState<PlacementSelection | null>(null);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(() => createEmptyInviteDraft());
  const [invitePlacement, setInvitePlacement] = useState<PlacementSelection | null>(null);

  const effectiveAutoContinue = autoSeason ? true : autoContinue;
  const setAutoContinueTracked = useCallback((value: boolean, source: 'user-toggle' | 'initial-load' | 'cleanup' | 'unknown' = 'unknown') => {
    setLastAutoContinueSetter(source);
    setLastAutoContinueChangeAt(new Date().toISOString());
    setAutoContinue(value);
  }, []);

  const onlineConfigured = isFirebaseConfigured();

  const showRosterMigrationNotice = useCallback(() => {
    if (!consumeMultiplayerMigrationNotice()) return;
    setNotice({ tone: 'info', text: 'Eski kadro kaydı temizlendi. Takımını yeniden kur.' });
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
  const filteredLeagues = useMemo(
    () => filterMultiplayerLeagues(leagues, leagueListFilter, user?.id),
    [leagueListFilter, leagues, user?.id],
  );
  const activeLeagueIdValue = activeLeague?.id ?? null;
  const activeLeagueMode = activeLeague?.mode ?? null;
  const activeLeagueStatus = activeLeague?.status ?? null;
  const activeLeagueWeek = activeLeague?.currentWeek ?? -1;
  const friendCompetitionOptions = useMemo(
    () => getCompetitions(dataset).filter((competition) => friendCompetitionIds.includes(competition.competitionId)),
    [dataset],
  );
  const activeCompetitionId = activeLeague?.competitionId ?? DEFAULT_COMPETITION_ID;
  const activeCompetition = useMemo(
    () => friendCompetitionOptions.find((competition) => competition.competitionId === activeCompetitionId) ?? null,
    [activeCompetitionId, friendCompetitionOptions],
  );
  const currentInviteDraftStorageKey = activeLeagueMode === 'invite' && activeLeagueIdValue && user
    ? inviteDraftStorageKey(activeLeagueIdValue, user.id)
    : null;
  const isLocalFriendLeague = activeLeagueMode === 'local-friends';
  const isOnlineInviteLeague = Boolean(onlineConfigured && onlineReady && activeLeagueMode === 'invite');
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
  const currentRound = useMemo(
    () => activeLeague?.fixtures[activeLeague.currentWeek] ?? [],
    [activeLeague],
  );
  const currentWeekProgress = useMemo(
    () => activeLeague ? getCurrentWeekProgress(activeLeague) : [],
    [activeLeague],
  );
  const myWeekProgress = currentWeekProgress.find((progress) => progress.userId === user?.id) ?? null;
  const myCurrentProgress = getCurrentUserWatchProgress(currentWeekProgress, user?.id);
  const currentWeekGenerated = currentRound.some((fixture) => Boolean(fixture.result));
  const currentWeekReadyToAdvance = activeLeague ? isCurrentWeekReadyToAdvance(activeLeague) : false;
  const hideCurrentWeekResults = activeLeague?.mode === 'invite' && currentWeekGenerated && !currentWeekReadyToAdvance;
  const flatFixtures = activeLeague?.fixtures.flat() ?? [];
  const snapshotLeagueId = activeLeague?.id ?? null;
  const snapshotStatus = activeLeague?.status ?? null;
  const snapshotUpdatedAt = activeLeague?.updatedAt ?? null;
  const snapshotStartVersion = activeLeague?.startVersion ?? null;
  const snapshotFixturesCount = flatFixtures.length;
  const snapshotWeekProgressCount = activeLeague?.weekProgress.length ?? 0;
  const latestFixture = activeLeague?.latestFixtureId
    ? flatFixtures.find((fixture) => fixture.id === activeLeague.latestFixtureId) ?? null
    : null;
  const highlights = activeLeague ? getLeagueHighlights(activeLeague) : null;
  const seasonWeekCount = activeLeague?.fixtures.length ?? 0;
  const inviteStartReadiness = activeLeague?.mode === 'invite'
    ? getInviteLeagueStartReadiness(activeLeague, user?.id)
    : null;
  const matchSessionId = activeLeague && user && liveFixture
    ? createMatchSessionId(activeLeague.id, activeLeague.currentWeek, liveFixture.id, user.id)
    : null;
  const waitingForUsers = activeLeague
    ? currentWeekProgress
      .filter((progress) => !isProgressDone(progress.status))
      .map((progress) => getTeamDisplayName(activeLeague, progress.teamId))
    : [];
  const activeUserTeamsCount = inviteStartReadiness?.userTeamsCount ?? activeLeague?.teams.length ?? 0;
  const botSlots = activeLeague
    ? Math.max(0, 18 - (isLocalFriendLeague ? playerSlots.length : activeUserTeamsCount))
    : 0;
  const inviteUserTeamSlotsRemaining = activeLeague && activeLeague.mode === 'invite'
    ? Math.max(0, activeLeague.maxUsers - (inviteStartReadiness?.userTeamsCount ?? activeLeague.teams.length))
    : 0;
  const activeUserTeamTarget = activeLeague
    ? (isLocalFriendLeague ? playerSlots.length : activeLeague.maxUsers)
    : 0;
  const canStartActiveLeague = Boolean(
    activeLeague
    && activeLeague.status === 'waiting'
    && (activeLeague.mode === 'local-friends'
      ? isOwner && activeLeague.teams.length > 0
      : inviteStartReadiness?.ready),
  );
  const buildStartDebug = (step: StartDebugStep): StartDebugState | null => {
    if (!activeLeague) return null;
    const userTeamsCount = inviteStartReadiness?.userTeamsCount ?? activeLeague.teams.length;
    const totalTeamsCount = inviteStartReadiness?.totalTeamsCount ?? allLeagueTeams.length;
    const expectedUserTeams = activeLeague.mode === 'invite' ? activeLeague.maxUsers : playerSlots.length;
    const expectedTotalTeams = inviteStartReadiness?.expectedTotalTeams ?? 18;
    return {
      clicked: true,
      clickedAt: new Date().toISOString(),
      step,
      steps: [step],
      currentUserId: user?.id ?? null,
      ownerId: activeLeague.ownerId,
      isOwner,
      leagueId: activeLeague.id,
      statusBefore: activeLeague.status,
      userTeamsCount,
      totalTeamsCount,
      expectedUserTeams,
      expectedTotalTeams,
      isStuck: false,
      lastSnapshotStatus: activeLeague.status,
      lastSnapshotUpdatedAt: activeLeague.updatedAt,
      lastSnapshotStartVersion: activeLeague.startVersion ?? null,
      hydratedTeamsCount: allLeagueTeams.length,
      hydratedFixturesCount: activeLeague.fixtures.flat().length,
      hydratedWeekProgressCount: activeLeague.weekProgress.length,
    };
  };
  const pushStartDebugStep = (step: StartDebugStep, patch: Partial<StartDebugState> = {}) => {
    setStartDebug((current) => {
      const base = current ?? buildStartDebug(step);
      if (!base) return current;
      return {
        ...base,
        ...patch,
        step,
        steps: [...base.steps, step],
      };
    });
  };
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
    () => getCompetitionSquads(activeCompetitionId, dataset)
      .filter((squad) => squad.players.length > 0)
      .map((squad) => ({
        ...squad,
        rating: getCompetitionTeamStrength(squad.players[0]?.teamId ?? '', dataset),
      })),
    [activeCompetitionId, dataset],
  );
  const activeDraftSeenTeamCount = activeDraft
    ? getDraftSeenTeamCount(draftSquads, activeDraft.rolledTeamIds)
    : 0;
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

  const inviteStartingPlayers = useMemo(
    () => getDraftPlayers(compactIds(inviteDraft.startingXI), playerById),
    [inviteDraft.startingXI, playerById],
  );
  const inviteSubstitutePlayers = useMemo(
    () => getDraftPlayers(inviteDraft.substitutes, playerById),
    [inviteDraft.substitutes, playerById],
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
      reserves: [],
    });
  }, [inviteDraft, inviteStartingPlayers, inviteSubstitutePlayers, user]);
  const powerCap = activeLeague ? getPowerLimitCap(activeLeague.powerLimit) : null;
  const exceedsPowerLimit = Boolean(teamPreview && powerCap && teamPreview.rating > powerCap);
  const inviteDraftTotal = useMemo(() => draftPlayerIds(inviteDraft).length, [inviteDraft]);
  const inviteDraftSelectedIds = useMemo(
    () => new Set(draftPlayerIds(inviteDraft)),
    [inviteDraft],
  );
  const activeRolledTeamTier = activeRolledSquad ? getDraftStrengthTier(draftSquads, activeRolledSquad) : null;
  const inviteDraftSeenTeamCount = getDraftSeenTeamCount(draftSquads, inviteDraft.rolledTeamIds);
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
    () => getPositionWarnings([...inviteStartingPlayers, ...inviteSubstitutePlayers]),
    [inviteStartingPlayers, inviteSubstitutePlayers],
  );
  const invitePitchDraft = useMemo(() => ({
    teamName: inviteDraft.teamName,
    formation: inviteDraft.formation ?? '4-2-3-1' as FormationType,
    startingXI: inviteDraft.startingXI,
    substitutes: inviteDraft.substitutes,
    reserves: [],
  }), [inviteDraft]);
  const canSelectInviteDraftPlayer = (player: Player) => (
    getRosterCount(inviteDraft.startingXI) === 11 ||
    hasOpenCompatibleStartingSlot(invitePitchDraft, player, invitePitchDraft.formation)
  );
  const inviteRolledTeamTier = inviteRolledSquad ? getDraftStrengthTier(draftSquads, inviteRolledSquad) : null;
  const inviteRollDraft = useMemo<SlotDraft>(() => ({
    displayName: managerName,
    teamName: inviteDraft.teamName,
    formation: inviteDraft.formation ?? '4-2-3-1',
    tactic: inviteDraft.tactic ?? 'Balanced',
    captainId: inviteDraft.captainId,
    startingXI: inviteDraft.startingXI,
    substitutes: inviteDraft.substitutes,
    reserves: [],
    rolledSquadId: inviteDraft.rolledSquadId,
    rolledTeamIds: inviteDraft.rolledTeamIds,
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
      reserves: [],
      rolledSquadId: null,
      rolledTeamIds: [],
      pickAvailable: false,
      autoRoll: false,
    };
  }, [captainId, formation, selectedPlayers, squadName, startingPlayers.length, substitutePlayers, tactic]);
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
      reserves: [],
      rolledSquadId: null,
      rolledTeamIds: [],
      pickAvailable: false,
      autoRoll: false,
    };
  }, [ownedTeam]);

  useEffect(() => {
    if (!activeLeague || activeLeague.mode !== 'invite' || !ownedTeam || !hasBrokenRosterSave(ownedTeam)) return;
    const timer = window.setTimeout(() => {
      setInviteDraft(createEmptyInviteDraft());
      setInvitePlacement(null);
      setNotice({ tone: 'info', text: 'Eski kadro kaydı temizlendi. Takımını yeniden kur.' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLeague, ownedTeam]);

  useEffect(() => {
    if (activeLeagueMode !== 'invite' || activeLeagueStatus !== 'waiting' || !currentInviteDraftStorageKey) return;
    const timer = window.setTimeout(() => {
      const sameDraftKey = inviteDraftKeyRef.current === currentInviteDraftStorageKey;
      if (sameDraftKey) return;
      inviteDraftKeyRef.current = currentInviteDraftStorageKey;
      const storedDraft = readStoredInviteDraft(currentInviteDraftStorageKey);
      setInviteDraft(savedInviteDraft ?? storedDraft ?? createEmptyInviteDraft());
      setInvitePlacement(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLeagueIdValue, activeLeagueMode, activeLeagueStatus, currentInviteDraftStorageKey, savedInviteDraft]);

  useEffect(() => {
    if (!currentInviteDraftStorageKey || activeLeagueMode !== 'invite' || activeLeagueStatus !== 'waiting') return;
    if (savedInviteDraft) return;
    writeStoredInviteDraft(currentInviteDraftStorageKey, inviteDraft);
  }, [activeLeagueMode, activeLeagueStatus, currentInviteDraftStorageKey, inviteDraft, savedInviteDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextPreferences = getNextMultiplayerMatchPreferences(
        window.localStorage,
        matchPreferencesKey,
        activeLeagueIdValue,
        user?.id,
      );
      if (!nextPreferences) return;
      setMatchPreferencesKey(nextPreferences.key);
      setAutoContinueTracked(nextPreferences.preferences.autoContinue, 'initial-load');
      setPreferencesLoaded(true);
      setAutoSeason(nextPreferences.preferences.autoSeason);
      setMatchSpeed(nextPreferences.preferences.speed);
      autoOpenedProgressRef.current = null;
      autoGeneratedWeekRef.current = null;
      autoAdvancedWeekRef.current = null;
      autoSeasonWeekRef.current = null;
      setMatchFlowLastAction('preferences-restored');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLeagueIdValue, matchPreferencesKey, setAutoContinueTracked, user?.id]);

  useEffect(() => {
    if (!shouldScrollToLive || !liveFixture?.result) return;
    const timer = window.setTimeout(() => {
      scrollToElement(liveMatchRef.current);
      setShouldScrollToLive(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [liveFixture?.id, liveFixture?.result, scrollToElement, shouldScrollToLive]);

  useEffect(() => {
    if (!liveProgressId || currentWeekProgress.some((progress) => progress.id === liveProgressId)) return;
    const timer = window.setTimeout(() => {
      setLiveFixture(null);
      setLiveProgressId(null);
      setLiveSkipped(false);
      liveSkippedRef.current = false;
      setMatchFlowLastAction('stale-live-match-closed');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentWeekProgress, liveProgressId]);

  useEffect(() => {
    if (!isStartingLeague) return;
    const timer = window.setTimeout(() => {
      setStartDebug((current) => (
        current
          ? {
            ...current,
            isStuck: true,
            errorMessage: `Baslatma islemi takildi. Son adim: ${current.step}`,
          }
          : current
      ));
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isStartingLeague]);

  useEffect(() => {
    if (!snapshotLeagueId || startDebug?.leagueId !== snapshotLeagueId || !snapshotStatus) return;
    const timer = window.setTimeout(() => {
      setStartDebug((current) => {
        if (!current || current.leagueId !== snapshotLeagueId) return current;
        const snapshotStep: StartDebugStep = snapshotStatus === 'active' ? 'snapshot-active' : 'waiting-snapshot';
        const sameSnapshot = current.lastSnapshotStatus === snapshotStatus
          && current.lastSnapshotUpdatedAt === snapshotUpdatedAt
          && current.lastSnapshotStartVersion === snapshotStartVersion
          && current.hydratedTeamsCount === allLeagueTeams.length
          && current.hydratedFixturesCount === snapshotFixturesCount
          && current.hydratedWeekProgressCount === snapshotWeekProgressCount;
        if (sameSnapshot && current.step === snapshotStep) return current;
        return {
          ...current,
          step: current.step === 'error' ? current.step : snapshotStep,
          steps: current.step === 'error' || current.steps.at(-1) === snapshotStep ? current.steps : [...current.steps, snapshotStep],
          lastSnapshotStatus: snapshotStatus,
          lastSnapshotUpdatedAt: snapshotUpdatedAt ?? undefined,
          lastSnapshotStartVersion: snapshotStartVersion,
          hydratedTeamsCount: allLeagueTeams.length,
          hydratedFixturesCount: snapshotFixturesCount,
          hydratedWeekProgressCount: snapshotWeekProgressCount,
        };
      });
      if (snapshotStatus === 'active') setIsStartingLeague(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    allLeagueTeams.length,
    snapshotFixturesCount,
    snapshotLeagueId,
    snapshotStartVersion,
    snapshotStatus,
    snapshotUpdatedAt,
    snapshotWeekProgressCount,
    startDebug?.leagueId,
  ]);

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
      reserves: [],
    });
  }, [activeDraft, activeDraftStartingPlayers, activeDraftSubstitutes, activeSlot]);
  const activeSlotReadyToSave = Boolean(
    activeSlotPreview &&
    activeDraft &&
    activeDraft.teamName.trim().length > 0 &&
    getRosterCount(activeDraft.startingXI) === 11 &&
    getRosterCount(activeDraft.substitutes) === 7 &&
    activeDraft.captainId,
  );
  const activeSlotExceedsPowerLimit = Boolean(activeSlotPreview && powerCap && activeSlotPreview.rating > powerCap);
  const activeDraftTotal = activeDraft ? draftPlayerIds(activeDraft).length : 0;
  const activeFormation = useMemo(
    () => FORMATIONS.find((item) => item.id === activeDraft?.formation) ?? FORMATIONS[0],
    [activeDraft?.formation],
  );
  const canSelectActiveDraftPlayer = (player: Player) => (
    !activeDraft ||
    getRosterCount(activeDraft.startingXI) === 11 ||
    hasOpenCompatibleStartingSlot(activeDraft, player, activeDraft.formation)
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

  useEffect(() => {
    if (activeSlotReadyToSave) scrollToElement(activeSaveRef.current);
  }, [activeSlotReadyToSave, scrollToElement]);

  useEffect(() => {
    if (teamPreview) scrollToElement(inviteSaveRef.current);
  }, [scrollToElement, teamPreview]);

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

  const getPickCompletionPatch = (nextTotal: number): Partial<SlotDraft> => {
    if (!activeDraft?.autoRoll || nextTotal >= draftTargetTotal) return { pickAvailable: false };
    const pick = pickNextDraftSquad(draftSquads, activeDraft.rolledTeamIds, activeDraft.rolledSquadId);
    return pick.squad
      ? { rolledSquadId: pick.squad.id, rolledTeamIds: pick.usedTeamIds, pickAvailable: true }
      : { pickAvailable: false };
  };

  const getInvitePickCompletionPatch = (nextTotal: number): Partial<InviteDraft> => {
    if (!inviteDraft.autoRoll || nextTotal >= draftTargetTotal) return { pickAvailable: false };
    const pick = pickNextDraftSquad(draftSquads, inviteDraft.rolledTeamIds, inviteDraft.rolledSquadId);
    return pick.squad
      ? { rolledSquadId: pick.squad.id, rolledTeamIds: pick.usedTeamIds, pickAvailable: true }
      : { pickAvailable: false };
  };

  const rollActiveSquad = () => {
    if (!activeDraft) return;
    if (!activeDraft.teamName.trim()) {
      setResultNotice('error', 'Kadro kurmak için önce takım adı gir.');
      return;
    }
    if (activeDraftTotal >= draftTargetTotal) return;
    if (activeDraft.pickAvailable) return;
    if (draftSquads.length === 0) return;

    const pick = pickNextDraftSquad(draftSquads, activeDraft.rolledTeamIds, activeDraft.rolledSquadId);
    if (!pick.squad) return;
    updateActiveDraft({
      rolledSquadId: pick.squad.id,
      rolledTeamIds: pick.usedTeamIds,
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
    if (inviteDraftTotal >= draftTargetTotal) return;
    if (inviteDraft.pickAvailable) return;
    if (draftSquads.length === 0) return;

    const pick = pickNextDraftSquad(draftSquads, inviteDraft.rolledTeamIds, inviteDraft.rolledSquadId);
    if (!pick.squad) return;
    updateInviteDraft({
      rolledSquadId: pick.squad.id,
      rolledTeamIds: pick.usedTeamIds,
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
    const player = playerById.get(playerId);
    if (player && !canSelectActiveDraftPlayer(player)) {
      setResultNotice('error', 'Bu mevki dolu. Once eksik ilk 11 mevkilerini tamamla.');
      return;
    }
    setPendingPlacementPlayerId(playerId);
    setPendingPlacementSource({ playerId, source: 'draft' });
    scrollToElement(activePitchRef.current);
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
      scrollToElement(activeDraftPanelRef.current);
      return;
    }

    if (target === 'substitutes' && getRosterCount(activeDraft.startingXI) < 11) {
      setResultNotice('error', 'Once ilk 11 tamamlanmali.');
      return;
    }

    const baseDraft = fromDraftPool
      ? activeDraft
      : removeRosterPlayer(activeDraft, pendingPlacementPlayer.id);
    const currentIds = compactIds(baseDraft[target]);
    if (currentIds.length >= rosterTargetLimits[target]) {
      setResultNotice('error', 'Yedek slotlari dolu.');
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
    scrollToElement(activeDraftPanelRef.current);
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
    const quickStartingIds = selectedPlayers.map((player) => player?.id ?? '');
    if (!activeDraft || !formation || !tactic || !captainId || startingPlayers.length !== 11 || !quickStartingIds.includes(captainId)) {
      setResultNotice('error', 'Hizli Oyna kadron gecerli degil. Once 11 oyuncu, 7 yedek, dizilis, taktik ve kaptan sec.');
      return;
    }

    const importedSet = new Set(quickStartingIds.filter((id) => id.trim().length > 0));
    const importedSubstitutes = substitutePlayers
      .map((player) => player.id)
      .filter((id) => !importedSet.has(id))
      .slice(0, 7);
    if (importedSubstitutes.length !== 7) {
      setResultNotice('error', 'Hizli Oyna kadron gecerli degil. 7 yedek olusturulamadi.');
      return;
    }
    updateActiveDraft({
      teamName: activeDraft.teamName.trim() || squadName,
      formation,
      tactic,
      captainId,
      startingXI: normalizeStartingSlots(quickStartingIds),
      substitutes: importedSubstitutes,
      reserves: [],
      pickAvailable: false,
      rolledSquadId: null,
      rolledTeamIds: [],
    });
    setPendingPlacementPlayerId(null);
    setPendingPlacementSource(null);
    setResultNotice('success', 'Hizli Oyna kadrosu ilk 11 ve yedeklere aktarildi.');
  };

  const handleSaveActiveSlot = () => {
    if (!activeLeague || !activeSlot || !activeDraft || !activeSlotPreview) return;
    try {
      const input: PlayerSlotTeamInput = {
        ...activeSlotPreview,
        displayName: activeDraft.displayName,
        reserves: [],
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

  const resetInviteDraft = () => {
    removeStoredInviteDraft(currentInviteDraftStorageKey);
    setInviteDraft(createEmptyInviteDraft());
    setInvitePlacement(null);
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
      const player = playerById.get(playerId);
      if (player && !canSelectInviteDraftPlayer(player)) {
        setResultNotice('error', 'Bu mevki dolu. Once eksik ilk 11 mevkilerini tamamla.');
        return;
      }
    }
    const fromRoster = source !== 'pool' && source !== 'draft';
    if (fromRoster && !inviteDraftSelectedIds.has(playerId)) return;
    setInvitePlacement({ playerId, source, slotIndex });
    if (source === 'draft') scrollToElement(invitePitchRef.current);
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
      const currentFormationId = inviteDraft.formation ?? '4-2-3-1';
      const currentFormation = FORMATIONS.find((item) => item.id === currentFormationId);
      const slot = currentFormation?.positions.find((item) => item.index === slotIndex);
      if (!slot || !isPositionCompatible(invitePlacementPlayer, slot.allowedPosition)) {
        setResultNotice('error', 'Bu oyuncu bu mevkide oynayamaz.');
        return;
      }
    }

    if (target === 'substitutes' && getRosterCount(inviteDraft.startingXI) < 11) {
      setResultNotice('error', 'Once ilk 11 tamamlanmali.');
      return;
    }

    const baseDraft = fromPool || fromDraft
      ? inviteDraft
      : removeRosterPlayer(inviteDraft, invitePlacementPlayer.id);
    const currentIds = target === 'startingXI'
      ? []
      : compactIds(baseDraft[target]);
    if (target !== 'startingXI' && currentIds.length >= rosterTargetLimits[target]) {
      setResultNotice('error', 'Yedek slotlari dolu.');
      return;
    }

    const nextDraft = addRosterPlayer(baseDraft, invitePlacementPlayer.id, target, slotIndex);
    const nextTotal = inviteDraftTotal + (fromPool || fromDraft ? 1 : 0);
    setInviteDraft({
      ...nextDraft,
      formation: nextDraft.formation ?? '4-2-3-1',
      ...(fromDraft ? getInvitePickCompletionPatch(nextTotal) : {}),
      captainId: nextDraft.captainId ?? (target === 'startingXI' ? invitePlacementPlayer.id : null),
    });
    setInvitePlacement(null);
    scrollToElement(inviteDraftPanelRef.current);
  };

  const removePlayerFromInviteDraft = (playerId: string) => {
    setInviteDraft((current) => removeRosterPlayer(current, playerId));
    if (invitePlacement?.playerId === playerId) setInvitePlacement(null);
  };

  const importQuickTeamToInviteDraft = () => {
    const quickStartingIds = selectedPlayers.map((player) => player?.id ?? '');
    if (!formation || !tactic || !captainId || startingPlayers.length !== 11 || substitutePlayers.length < 7 || !quickStartingIds.includes(captainId)) {
      setResultNotice('error', 'Hizli Oyna kadron gecerli degil. Once 11 oyuncu, 7 yedek, dizilis, taktik ve kaptan sec.');
      return;
    }
    setInviteDraft({
      ...quickInviteDraft,
      teamName: inviteDraft.teamName.trim() || quickInviteDraft.teamName,
    });
    setInvitePlacement(null);
    setResultNotice('success', 'Hizli Oyna kadrosu ilk 11 ve yedeklere aktarildi.');
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
          competitionId: friendCompetitionId,
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
        competitionId: friendCompetitionId,
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
        removeStoredInviteDraft(currentInviteDraftStorageKey);
        setResultNotice('success', `${teamPreview.teamName} lige kaydedildi.`);
        return;
      }
      const league = saveTeamToLeague(activeLeague.id, teamPreview);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      removeStoredInviteDraft(currentInviteDraftStorageKey);
      setResultNotice('success', `${teamPreview.teamName} lige kaydedildi.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleStartLeague = async () => {
    if (!activeLeague || !user) return;
    const clickedDebug = buildStartDebug('clicked');
    setStartDebug(clickedDebug);
    setIsStartingLeague(true);
    pushStartDebugStep('validation-start');
    if (!canStartActiveLeague) {
      const message = inviteStartReadiness?.missingReason ?? 'Sezonu baslatma kosullari tamamlanmadi.';
      pushStartDebugStep('error', { errorMessage: message });
      setIsStartingLeague(false);
      setResultNotice('error', message);
      return;
    }
    pushStartDebugStep('validation-ok');
    try {
      pushStartDebugStep('service-call-start');
      if (isOnlineInviteLeague) {
        const league = await startOnlineLeague(activeLeague.id, dataset);
        pushStartDebugStep('service-call-success', {
          serviceResultStatus: league.status,
          serviceResultUpdatedAt: league.updatedAt,
          serviceResultStartVersion: league.startVersion ?? null,
        });
        refreshOnlineLeague(league);
        setActiveLeagueId(league.id);
        pushStartDebugStep('local-state-update');
        setResultNotice('success', `Sezon basladi. ${league.botTeams.length} gercek takim lige dahil edildi.`);
        return;
      }
      const league = isLocalFriendLeague
        ? startLocalFriendLeague(activeLeague.id, user.id, dataset)
        : startLeague(activeLeague.id, user.id, dataset);
      pushStartDebugStep('service-call-success', {
        serviceResultStatus: league.status,
        serviceResultUpdatedAt: league.updatedAt,
        serviceResultStartVersion: league.startVersion ?? null,
      });
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      pushStartDebugStep('local-state-update');
      setResultNotice('success', `Sezon başladı. ${league.botTeams.length} gerçek takım lige dahil edildi.`);
    } catch (error) {
      const message = getErrorMessage(error);
      const code = getErrorCode(error);
      console.error('START_LEAGUE_FAILED', error);
      pushStartDebugStep('error', {
        errorCode: code,
        errorMessage: message,
      });
      setIsStartingLeague(false);
      setResultNotice('error', message);
    }
  };

  const handleSimulateWeek = async () => {
    if (!activeLeague || liveFixture) return;
    setAdvanceInProgress(true);
    setLastFirestoreError(null);
    try {
      const result = isOnlineInviteLeague
        ? await simulateOnlineWeek(activeLeague.id, dataset, activeLeague.currentWeek)
        : simulateWeek(activeLeague.id, dataset);
      if (isOnlineInviteLeague) {
        refreshOnlineLeague(result.league);
      } else {
        refreshLeagues(result.league.id);
      }
      setActiveLeagueId(result.league.id);
      setLiveFixture(null);
      setLiveProgressId(null);
      const generatedOnly = result.league.currentWeek === activeLeague.currentWeek;
      setResultNotice('success', generatedOnly
        ? `${activeLeague.currentWeek + 1}. hafta basladi. Kullanici maclari izlenebilir.`
        : `${result.league.currentWeek}. hafta tamamlandi.`);
      if (generatedOnly) await openOwnGeneratedMatch(result.league);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('SIMULATE_WEEK_FAILED', error);
      setLastFirestoreError(message);
      setShowSeasonDebug(true);
      setResultNotice('error', message);
    } finally {
      setAdvanceInProgress(false);
    }
  };

  const updateCurrentUserWeekProgress = async (status: WeekUserProgress['status']) => {
    if (!activeLeague || !user) return null;
    try {
      const league = isOnlineInviteLeague
        ? await updateOnlineWeekUserProgress(activeLeague.id, status)
        : updateWeekUserProgress(activeLeague.id, user.id, status);
      if (isOnlineInviteLeague) {
        refreshOnlineLeague(league);
      } else {
        refreshLeagues(league.id);
      }
      setActiveLeagueId(league.id);
      setLastFirestoreError(null);
      return league;
    } catch (error) {
      const message = getErrorMessage(error);
      setLastFirestoreError(message);
      setShowSeasonDebug(true);
      throw error;
    }
  };

  const openOwnGeneratedMatch = async (league: MultiplayerLeagueSave) => {
    if (!user || liveFixture) return;
    const progress = getCurrentWeekProgress(league).find((item) => item.userId === user.id);
    if (!progress || isProgressDone(progress.status)) return;
    const fixture = league.fixtures[league.currentWeek]?.find((item) => item.id === progress.matchId);
    if (!fixture?.result) return;
    if (progress.status === 'pending') await updateCurrentUserWeekProgress('watching');
    setLiveProgressId(progress.id);
    setLiveSkipped(false);
    liveSkippedRef.current = false;
    setLiveFixture(fixture);
    setShouldScrollToLive(true);
    setMatchFlowLastAction('own-match-opened');
  };

  const handleWatchMyMatch = async (progress: WeekUserProgress) => {
    if (!activeLeague) return;
    const fixture = currentRound.find((item) => item.id === progress.matchId);
    if (!fixture?.result) return;
    try {
      if (progress.status === 'pending') await updateCurrentUserWeekProgress('watching');
      setLiveProgressId(progress.id);
      setLiveSkipped(false);
      liveSkippedRef.current = false;
      setLiveFixture(fixture);
      setShouldScrollToLive(true);
      setMatchFlowLastAction('own-match-opened');
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
      autoOpenedProgressRef.current = null;
      setMatchFlowLastAction('auto-open-error');
    }
  };

  const skipLiveMatch = async () => {
    if (liveSkippedRef.current) return;
    try {
      liveSkippedRef.current = true;
      setLiveSkipped(true);
      await updateCurrentUserWeekProgress('skipped');
      setMatchFlowLastAction('result-skipped');
    } catch (error) {
      liveSkippedRef.current = false;
      setLiveSkipped(false);
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const completeLiveMatch = async () => {
    try {
      if (!liveSkippedRef.current && !liveSkipped) await updateCurrentUserWeekProgress('completed');
      setLiveFixture(null);
      setLiveProgressId(null);
      setLiveSkipped(false);
      liveSkippedRef.current = false;
      setMatchFlowLastAction(effectiveAutoContinue ? 'auto-match-completed' : 'manual-match-completed');
      window.setTimeout(() => scrollToElement(weekFlowRef.current), 150);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleAutoContinueChange = (value: boolean) => {
    setAutoContinueTracked(value, 'user-toggle');
    if (activeLeagueIdValue && user?.id) {
      writeMultiplayerAutoContinue(window.localStorage, activeLeagueIdValue, user.id, value);
    }
    setMatchFlowLastAction(value ? 'auto-continue-enabled' : 'auto-continue-disabled');
  };

  const handleAutoSeasonChange = (value: boolean) => {
    setAutoSeason(value);
    if (value && !autoContinue) handleAutoContinueChange(true);
    if (activeLeagueIdValue && user?.id) {
      writeMultiplayerAutoSeason(window.localStorage, activeLeagueIdValue, user.id, value);
    }
    setMatchFlowLastAction(value ? 'auto-season-enabled' : 'auto-season-disabled');
  };

  const handleMatchSpeedChange = (value: SimulationSpeed) => {
    setMatchSpeed(value);
    if (activeLeagueIdValue && user?.id) {
      writeMultiplayerMatchSpeed(window.localStorage, activeLeagueIdValue, user.id, value);
    }
    setMatchFlowLastAction(`speed-${value}`);
  };

  const handleRepairWeek = async () => {
    if (!activeLeague || !user || !isOwner) return;
    setAdvanceInProgress(true);
    setLastFirestoreError(null);
    try {
      const league = isOnlineInviteLeague
        ? await repairOnlineCurrentWeekProgress(activeLeague.id)
        : repairCurrentWeekProgress(activeLeague.id, user.id);
      if (isOnlineInviteLeague) refreshOnlineLeague(league);
      else refreshLeagues(league.id);
      setMatchFlowLastAction('week-progress-repaired');
      setResultNotice('success', 'Eksik hafta progress kayitlari onarildi.');
    } catch (error) {
      const message = getErrorMessage(error);
      setLastFirestoreError(message);
      setShowSeasonDebug(true);
      setResultNotice('error', message);
    } finally {
      setAdvanceInProgress(false);
    }
  };

  const handleForceAdvanceWeek = async () => {
    if (!activeLeague || !user || !isOwner) return;
    setAdvanceInProgress(true);
    setLastFirestoreError(null);
    try {
      const result = isOnlineInviteLeague
        ? await forceAdvanceOnlineCurrentWeek(activeLeague.id, dataset, activeLeague.currentWeek)
        : forceAdvanceCurrentWeek(activeLeague.id, user.id, dataset);
      if (isOnlineInviteLeague) refreshOnlineLeague(result.league);
      else refreshLeagues(result.league.id);
      setLiveFixture(null);
      setLiveProgressId(null);
      setMatchFlowLastAction('week-force-advanced');
      setResultNotice('success', result.league.status === 'completed' ? 'Sezon tamamlandi.' : 'Hafta onarildi ve ilerletildi.');
    } catch (error) {
      const message = getErrorMessage(error);
      setLastFirestoreError(message);
      setShowSeasonDebug(true);
      setResultNotice('error', message);
    } finally {
      setAdvanceInProgress(false);
    }
  };

  const handleDeleteLeague = async (league: MultiplayerLeagueSave) => {
    if (!user || league.ownerId !== user.id) return;
    if (!window.confirm('Bu ligi silmek istiyor musun?')) return;
    try {
      if (onlineConfigured && onlineReady && league.mode === 'invite') {
        await softDeleteOnlineLeague(league.id);
        const nextOnline = onlineInviteLeagues.filter((item) => item.id !== league.id);
        setOnlineInviteLeagues(nextOnline);
        refreshLeagues(undefined, nextOnline);
      } else {
        softDeleteLeague(league.id, user.id);
        refreshLeagues();
      }
      setResultNotice('success', 'Lig listeden silindi.');
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleClearLocalMultiplayerData = () => {
    if (!window.confirm('Bu tarayicidaki Canli11 multiplayer taslaklari ve yerel ligler temizlensin mi?')) return;
    const removedKeys = clearCanli11MultiplayerStorage(window.localStorage);
    const removedSessionKeys = clearCanli11MultiplayerStorage(window.sessionStorage);
    setInviteDraft(createEmptyInviteDraft());
    setAutoContinueTracked(false, 'cleanup');
    setAutoSeason(false);
    setMatchSpeed(defaultMultiplayerMatchPreferences.speed);
    refreshLeagues(undefined);
    setResultNotice('success', `${removedKeys.length + removedSessionKeys.length} yerel multiplayer kaydi temizlendi. Firebase oturumu korundu.`);
  };

  const handleCleanTestLeagues = async () => {
    if (!user) return;
    const candidates = leagues.filter((league) => (
      league.ownerId === user.id
      && league.status !== 'active'
      && (league.status === 'completed' || league.teams.length === 0)
    ));
    if (candidates.length === 0) {
      setResultNotice('info', 'Temizlenecek tamamlanmis veya bos owner ligi yok.');
      return;
    }
    if (!window.confirm(`${candidates.length} tamamlanmis/bos lig listeden silinsin mi?`)) return;
    try {
      for (const league of candidates) {
        if (onlineConfigured && onlineReady && league.mode === 'invite') await softDeleteOnlineLeague(league.id);
        else softDeleteLeague(league.id, user.id);
      }
      const removedIds = new Set(candidates.map((league) => league.id));
      const nextOnline = onlineInviteLeagues.filter((league) => !removedIds.has(league.id));
      setOnlineInviteLeagues(nextOnline);
      refreshLeagues(undefined, nextOnline);
      setResultNotice('success', `${candidates.length} eski/test lig temizlendi.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  useEffect(() => {
    simulateWeekActionRef.current = handleSimulateWeek;
    watchMatchActionRef.current = handleWatchMyMatch;
    forceAdvanceActionRef.current = handleForceAdvanceWeek;
  });

  useEffect(() => {
    if (
      activeLeagueMode !== 'invite'
      || activeLeagueStatus !== 'active'
      || !isOwner
      || currentRound.length === 0
      || currentWeekGenerated
      || liveFixture
      || !activeLeagueIdValue
    ) return;
    const actionKey = `${activeLeagueIdValue}:${activeLeagueWeek}:generate`;
    if (autoGeneratedWeekRef.current === actionKey) return;
    autoGeneratedWeekRef.current = actionKey;
    setMatchFlowLastAction('auto-generating-week');
    void simulateWeekActionRef.current();
  }, [
    activeLeagueIdValue,
    activeLeagueMode,
    activeLeagueStatus,
    activeLeagueWeek,
    currentRound.length,
    currentWeekGenerated,
    isOwner,
    liveFixture,
  ]);

  useEffect(() => {
    if (
      activeLeagueMode !== 'invite'
      || activeLeagueStatus !== 'active'
      || !activeLeagueIdValue
      || !autoSeason
      || !isOwner
      || !currentWeekGenerated
      || liveFixture
      || (myWeekProgress && !isProgressDone(myWeekProgress.status))
    ) return;
    const actionKey = `${activeLeagueIdValue}:${activeLeagueWeek}:auto-season`;
    if (autoSeasonWeekRef.current === actionKey || advanceInProgress) return;
    const timer = window.setTimeout(() => {
      autoSeasonWeekRef.current = actionKey;
      setMatchFlowLastAction('auto-season-advancing');
      void forceAdvanceActionRef.current();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [
    activeLeagueIdValue,
    activeLeagueMode,
    activeLeagueStatus,
    activeLeagueWeek,
    advanceInProgress,
    autoSeason,
    currentWeekGenerated,
    isOwner,
    liveFixture,
    myWeekProgress,
  ]);

  useEffect(() => {
    if (
      activeLeagueMode !== 'invite'
      || activeLeagueStatus !== 'active'
      || !myCurrentProgress
      || !activeLeagueIdValue
      || liveFixture
      || (myCurrentProgress.status !== 'pending' && myCurrentProgress.status !== 'watching')
    ) return;
    const fixture = currentRound.find((item) => item.id === myCurrentProgress.matchId);
    if (!fixture?.result) return;
    const actionKey = `${activeLeagueIdValue}:${activeLeagueWeek}:${myCurrentProgress.id}`;
    if (autoOpenedProgressRef.current === actionKey) return;
    autoOpenedProgressRef.current = actionKey;
    setMatchFlowLastAction('auto-opening-own-match');
    void watchMatchActionRef.current(myCurrentProgress);
  }, [activeLeagueIdValue, activeLeagueMode, activeLeagueStatus, activeLeagueWeek, currentRound, liveFixture, myCurrentProgress]);

  useEffect(() => {
    if (
      activeLeagueMode !== 'invite'
      || activeLeagueStatus !== 'active'
      || !activeLeagueIdValue
      || autoSeason
      || !shouldAutoAdvanceInviteWeek({
        autoContinue,
        isOwner,
        currentWeekGenerated,
        currentWeekReadyToAdvance,
        hasLiveFixture: Boolean(liveFixture),
      })
    ) return;
    const actionKey = `${activeLeagueIdValue}:${activeLeagueWeek}:advance`;
    if (autoAdvancedWeekRef.current === actionKey) return;
    autoAdvancedWeekRef.current = actionKey;
    setMatchFlowLastAction('auto-advance-waiting');
    const timer = window.setTimeout(() => {
      setMatchFlowLastAction('auto-advancing-week');
      void simulateWeekActionRef.current();
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [
    activeLeagueIdValue,
    activeLeagueMode,
    activeLeagueStatus,
    activeLeagueWeek,
    autoContinue,
    autoSeason,
    currentWeekGenerated,
    currentWeekReadyToAdvance,
    isOwner,
    liveFixture,
  ]);

  const handleCopyInvite = async () => {
    if (!activeLeague) return;
    const copied = await copyText(activeLeague.inviteCode);
    setResultNotice(copied ? 'success' : 'error', copied ? 'Davet kodu kopyalandı.' : 'Davet kodu kopyalanamadı.');
  };

  const teamNameOf = (teamId: string) => (
    activeLeague ? getTeamDisplayName(activeLeague, teamId) : teamId
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-6 pb-2">
      <section className="min-w-0 border-4 border-black bg-zinc-950 p-5 text-white shadow-[8px_8px_0px_0px_#000]">
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="min-w-0">
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
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-5">
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
              <label className="grid gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-black/60">
                Kullanici takimi sayisi
                <input
                  type="number"
                  min={2}
                  max={18}
                  value={maxUsers}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setMaxUsers(Math.min(18, Math.max(2, Math.round(Number.isFinite(nextValue) ? nextValue : 2))));
                  }}
                  className="border-2 border-black bg-zinc-100 px-3 py-3 text-sm font-black uppercase text-black outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {maxUserOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMaxUsers(option)}
                    className={`game-button border-2 border-black px-3 py-3 text-xs font-black uppercase ${maxUsers === option ? 'bg-black text-white' : 'bg-zinc-100 text-black'}`}
                  >
                    {option} Kullanici
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/60">Oyuncu havuzu</p>
                {friendCompetitionOptions.map((competition) => (
                  <button
                    key={competition.competitionId}
                    type="button"
                    onClick={() => setFriendCompetitionId(competition.competitionId)}
                    className={`game-button border-2 border-black px-3 py-3 text-left text-xs font-black uppercase ${friendCompetitionId === competition.competitionId ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}
                  >
                    <span className="block">{competition.competitionName}</span>
                    <span className="mt-1 block text-[9px] opacity-60">{competition.teams.length} takimlik havuz</span>
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
            <div className="mb-4 flex items-center justify-between gap-2 border-b-2 border-black pb-3">
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
            <div className="mb-3 grid grid-cols-2 gap-2">
              <select
                value={leagueListFilter}
                onChange={(event) => setLeagueListFilter(event.target.value as MultiplayerLeagueListFilter)}
                className="min-w-0 border-2 border-black bg-zinc-100 px-2 py-2 text-[9px] font-black uppercase"
                aria-label="Lig listesi filtresi"
              >
                <option value="open">Aktif + Bekleme</option>
                <option value="active">Aktif</option>
                <option value="waiting">Bekleme</option>
                <option value="completed">Tamamlandi</option>
                <option value="mine">Benim Liglerim</option>
                <option value="all">Tumu</option>
              </select>
              <button
                type="button"
                onClick={handleClearLocalMultiplayerData}
                className="game-button border-2 border-black bg-zinc-950 px-2 py-2 text-[9px] font-black uppercase text-white"
              >
                Yerel Veriyi Temizle
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleCleanTestLeagues()}
              className="game-button mb-3 w-full border-2 border-black bg-red-100 px-2 py-2 text-[9px] font-black uppercase text-red-800"
            >
              Tamamlanmis / Bos Test Liglerini Temizle
            </button>
            <div className="grid gap-2">
              {filteredLeagues.length === 0 && (
                <p className="border-2 border-dashed border-black/25 p-4 text-xs font-black uppercase opacity-55">Kayıtlı lig yok</p>
              )}
              {filteredLeagues.map((league) => (
                <div
                  key={league.id}
                  className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] border-2 border-black ${activeLeague?.id === league.id ? 'bg-yellow-400 text-black' : 'bg-zinc-100 text-black'}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLeagueId(league.id);
                      setLiveFixture(null);
                      setActiveSlotId(league.playerSlots?.find((slot) => !slot.ready)?.id ?? league.playerSlots?.[0]?.id ?? null);
                    }}
                    className="game-button min-w-0 p-3 text-left text-xs font-black uppercase"
                  >
                    <span className="block truncate">{league.name}</span>
                    <span className="mt-1 block text-[9px] opacity-60">
                      Kullanici: {league.teams.filter((team) => !team.isBot).length}/{league.maxUsers} / Gercek: {league.botTeams.length}
                    </span>
                    <span className="mt-1 block text-[9px] opacity-60">
                      Toplam: {league.teams.length + league.botTeams.length}/18 / {statusLabels[league.status]}
                    </span>
                  </button>
                  {league.ownerId === user?.id && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteLeague(league)}
                      className="game-button grid w-11 place-items-center border-l-2 border-black bg-red-600 text-white"
                      aria-label={`${league.name} ligini sil`}
                      title="Ligi sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
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
              <section className="min-w-0 border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                <div className="flex min-w-0 flex-col gap-4 border-b-2 border-black pb-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Bekleme Odası</p>
                    <h3 className="text-3xl font-black uppercase italic">{activeLeague.name}</h3>
                    <p className="mt-1 text-xs font-black uppercase text-yellow-700">
                    {statusLabels[activeLeague.status]} / {activeCompetition?.competitionName ?? 'Süper Lig'} / {powerLimitLabels[activeLeague.powerLimit]} / {activeLeague.mode === 'invite' ? `${activeLeague.maxUsers} kullanici takimi` : '18 takim'}
                    </p>
                  </div>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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

                <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 2xl:grid-cols-4">
                  <MiniStat label="Kullanıcı" value={`${inviteStartReadiness?.userTeamsCount ?? activeLeague.teams.length}/${activeUserTeamTarget}`} />
                  <MiniStat label="Gercek Takim" value={botSlots} />
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
                          <span>{activeDraftTotal}/{draftTargetTotal}</span>
                        </div>
                        <div className="h-3 border-2 border-black bg-black/55">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-400 to-green-500"
                            style={{ width: `${Math.min(100, (activeDraftTotal / draftTargetTotal) * 100)}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <DraftCounter label="Ilk 11" value={`${getRosterCount(activeDraft.startingXI)}/11`} />
                          <DraftCounter label="Yedek" value={`${getRosterCount(activeDraft.substitutes)}/7`} />
                          <DraftCounter label="Guc" value={activeSlotPreview?.rating ?? '-'} />
                          <DraftCounter label="Kimya" value={activeSlotPreview?.chemistry ?? '-'} />
                        </div>
                      </div>
                      <div ref={activeSaveRef} className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_160px] xl:grid-cols-1">
                        <DraftCounter label="Takim gucu" value={activeSlotPreview?.rating ?? '-'} strong />
                        <button
                          type="button"
                          onClick={importQuickTeamToActiveSlot}
                          disabled={!draftReady}
                          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-400 px-4 py-4 text-xs font-black uppercase text-black disabled:opacity-35"
                        >
                          HIZLI OYNA KADROSUNU AKTAR
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

                    <div className="mt-4 grid min-w-0 gap-3 2xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(0,1.8fr)]">
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
                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-5">
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

                    <div className="mt-4">
                      <DraftStepGuide
                        draft={activeDraft}
                        pendingPlayer={pendingPlacementPlayer}
                        canSave={activeSlotReadyToSave && !activeSlotExceedsPowerLimit}
                      />
                    </div>
                  </section>

                  <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(240px,280px)_minmax(460px,1fr)_minmax(240px,280px)]">
                    <div ref={activePitchRef} className="min-w-0 2xl:order-2">
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
                    </div>

                    <div ref={activeDraftPanelRef} className="min-w-0 2xl:order-1">
                      <DraftRollPanel
                        draft={activeDraft}
                        rolledSquad={activeRolledSquad}
                        rolledTeam={activeRolledTeam}
                        rolledRating={activeRolledTeamRating}
                        strengthTier={activeRolledTeamTier}
                        selectedIds={activeDraftSelectedIds}
                        pendingPlayerId={pendingPlacementPlayer?.id ?? null}
                        activeTotal={activeDraftTotal}
                        seenTeamCount={activeDraftSeenTeamCount}
                        teamPoolCount={draftSquads.length}
                        teamById={teamById}
                        isPlayerDisabled={(player) => !canSelectActiveDraftPlayer(player)}
                        onRoll={rollActiveSquad}
                        onSelect={selectDraftPlayer}
                        onToggleAutoRoll={() => updateActiveDraft({ autoRoll: !activeDraft.autoRoll })}
                      />
                    </div>

                    <div className="min-w-0 2xl:order-3">
                      <SelectedPlacementPanel
                        player={pendingPlacementPlayer}
                        team={pendingPlacementPlayer?.teamId ? teamById.get(pendingPlacementPlayer.teamId) ?? null : null}
                        warnings={positionWarnings}
                        canPlace={Boolean(pendingPlacementPlayer)}
                      />
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)]">
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
                            <MiniStat dark label="Toplam" value={`${activeDraftTotal}/${draftTargetTotal}`} />
                            <MiniStat dark label="İlk 11" value={`${activeDraft.startingXI.length}/11`} />
                            <MiniStat dark label="Yedek" value={`${activeDraft.substitutes.length}/7`} />
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
                                      {activeDraft.pickAvailable ? '1 oyuncu seç' : activeDraftTotal >= draftTargetTotal ? 'Kadro tamamlandı' : 'Yeni takım çevrilebilir'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={rollActiveSquad}
                                    disabled={!activeDraft.teamName.trim() || activeDraft.pickAvailable || activeDraftTotal >= draftTargetTotal}
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
                          disabled={!canStartActiveLeague || playerSlots.some((slot) => !slot.ready)}
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
                <section className="min-w-0 space-y-5">
                  <div className="min-w-0 border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                    <div className="flex min-w-0 flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Takımını Kaydet</p>
                        <h3 className="text-2xl font-black uppercase italic">{inviteDraft.teamName.trim() || squadName}</h3>
                      </div>
                      <div ref={inviteSaveRef} className="flex min-w-0 max-w-full flex-wrap gap-2 md:justify-end">
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
                          className="game-button max-w-full whitespace-normal border-2 border-white/20 bg-white/10 px-4 py-3 text-center text-xs font-black uppercase text-white"
                        >
                          HIZLI OYNA KADROSUNU AKTAR
                        </button>
                        <button
                          type="button"
                          onClick={resetInviteDraft}
                          className="game-button border-2 border-white/20 bg-black px-4 py-3 text-xs font-black uppercase text-white"
                        >
                          KADROYU SIFIRLA
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

                    <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 2xl:grid-cols-4">
                      <MiniStat dark label="İlk 11" value={`${getRosterCount(inviteDraft.startingXI)}/11`} />
                      <MiniStat dark label="Yedek" value={`${getRosterCount(inviteDraft.substitutes)}/7`} />
                      <MiniStat dark label="Guc" value={teamPreview?.rating ?? '-'} />
                      <MiniStat dark label="Kimya" value={teamPreview?.chemistry ?? '-'} />
                    </div>

                    <div className="mt-4 grid min-w-0 gap-3 2xl:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_minmax(220px,1.2fr)]">
                      <input
                        value={inviteDraft.teamName}
                        onChange={(event) => updateInviteDraft({ teamName: event.target.value })}
                        maxLength={32}
                        className="border-2 border-yellow-400/60 bg-black/70 px-3 py-3 text-xs font-black uppercase text-white outline-none"
                        placeholder="Takım adı"
                      />
                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-5">
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

                    <div className="mt-4">
                      <DraftStepGuide
                        draft={inviteDraft}
                        pendingPlayer={invitePlacementPlayer}
                        canSave={Boolean(teamPreview) && inviteSaveIssues.length === 0 && !exceedsPowerLimit}
                      />
                    </div>

                    <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(240px,280px)_minmax(460px,1fr)_minmax(240px,280px)]">
                      <div ref={inviteDraftPanelRef} className="min-w-0 2xl:order-1">
                        <DraftRollPanel
                          draft={inviteRollDraft}
                          rolledSquad={inviteRolledSquad}
                          rolledTeam={inviteRolledTeam}
                          rolledRating={inviteRolledTeamRating}
                          strengthTier={inviteRolledTeamTier}
                          selectedIds={inviteDraftSelectedIds}
                          pendingPlayerId={invitePlacementPlayer?.id ?? null}
                          activeTotal={inviteDraftTotal}
                          seenTeamCount={inviteDraftSeenTeamCount}
                          teamPoolCount={draftSquads.length}
                          teamById={teamById}
                          isPlayerDisabled={(player) => !canSelectInviteDraftPlayer(player)}
                          onRoll={rollInviteSquad}
                          onSelect={(playerId) => selectInvitePlayerForPlacement(playerId, 'draft')}
                          onToggleAutoRoll={() => updateInviteDraft({ autoRoll: !inviteDraft.autoRoll })}
                        />
                      </div>
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

                      <div className="min-w-0 2xl:order-3">
                        <SelectedPlacementPanel
                          player={invitePlacementPlayer}
                          team={invitePlacementPlayer?.teamId ? teamById.get(invitePlacementPlayer.teamId) ?? null : null}
                          warnings={invitePositionWarnings}
                          canPlace={Boolean(invitePlacementPlayer)}
                        />
                      </div>

                      <div ref={invitePitchRef} className="min-w-0 2xl:order-2">
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
                      {inviteUserTeamSlotsRemaining > 0 && (
                        <p className="border-2 border-dashed border-yellow-500 bg-yellow-50 p-4 text-xs font-black uppercase text-yellow-800">
                          Sezonu baslatmak icin {inviteUserTeamSlotsRemaining} kullanici takimi daha gerekli.
                        </p>
                      )}
                      {allLeagueTeams.map((team) => (
                        <TeamCard key={team.id} team={team} active={team.ownerId === user?.id} />
                      ))}
                    </div>
                    {inviteStartReadiness && (
                      <div className={`mt-4 border-2 p-3 text-[10px] font-black uppercase ${
                        inviteStartReadiness.ready
                          ? 'border-green-600 bg-green-50 text-green-800'
                          : 'border-yellow-500 bg-yellow-50 text-yellow-800'
                      }`}
                      >
                        <p>{inviteStartReadiness.missingReason ?? 'Sezon baslatmaya hazir.'}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <span>Owner: {inviteStartReadiness.isOwner ? 'Evet' : 'Hayir'}</span>
                          <span>Status: {inviteStartReadiness.leagueStatus}</span>
                          <span>Kullanici: {inviteStartReadiness.userTeamsCount}/{inviteStartReadiness.selectedUserTeamCount}</span>
                          <span>Lig: {inviteStartReadiness.totalTeamsCount}/{inviteStartReadiness.expectedTotalTeams}</span>
                        </div>
                      </div>
                    )}
                    {startDebug && startDebug.leagueId === activeLeague.id && (
                      <div className={`mt-4 border-2 p-3 text-[10px] font-black uppercase ${
                        startDebug.step === 'error' || startDebug.isStuck
                          ? 'border-red-500 bg-red-50 text-red-800'
                          : 'border-blue-500 bg-blue-50 text-blue-900'
                      }`}
                      >
                        <p>Baslatma adimi: {startDebug.step}</p>
                        {startDebug.isStuck && (
                          <p className="mt-1">Baslatma islemi takildi. Son adim: {startDebug.step}</p>
                        )}
                        {startDebug.errorMessage && (
                          <p className="mt-1">Hata: {startDebug.errorCode ? `${startDebug.errorCode} / ` : ''}{startDebug.errorMessage}</p>
                        )}
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <span>Clicked: {startDebug.clicked ? 'true' : 'false'}</span>
                          <span>ClickedAt: {startDebug.clickedAt ?? '-'}</span>
                          <span>User: {startDebug.currentUserId ?? '-'}</span>
                          <span>Owner: {startDebug.ownerId ?? '-'}</span>
                          <span>IsOwner: {startDebug.isOwner ? 'true' : 'false'}</span>
                          <span>League: {startDebug.leagueId ?? '-'}</span>
                          <span>StatusBefore: {startDebug.statusBefore ?? '-'}</span>
                          <span>UserTeams: {startDebug.userTeamsCount}/{startDebug.expectedUserTeams}</span>
                          <span>TotalTeams: {startDebug.totalTeamsCount}/{startDebug.expectedTotalTeams}</span>
                          <span>ServiceStatus: {startDebug.serviceResultStatus ?? '-'}</span>
                          <span>SnapshotStatus: {startDebug.lastSnapshotStatus ?? '-'}</span>
                          <span>SnapshotUpdated: {startDebug.lastSnapshotUpdatedAt ?? '-'}</span>
                          <span>StartVersion: {startDebug.lastSnapshotStartVersion ?? startDebug.serviceResultStartVersion ?? '-'}</span>
                          <span>HydratedTeams: {startDebug.hydratedTeamsCount ?? '-'}</span>
                          <span>HydratedFixtures: {startDebug.hydratedFixturesCount ?? '-'}</span>
                          <span>HydratedProgress: {startDebug.hydratedWeekProgressCount ?? '-'}</span>
                        </div>
                        <p className="mt-2 break-words">Steps: {startDebug.steps.join(' -> ')}</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleStartLeague}
                      disabled={isStartingLeague || !canStartActiveLeague}
                      className="game-button mt-5 flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-400 px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-35"
                    >
                      <Play size={18} fill="currentColor" /> {isStartingLeague ? 'Sezon Baslatiliyor...' : 'Sezonu Başlat'}
                    </button>
                  </div>
                </section>
              )}

              {activeLeague.status !== 'waiting' && (
                <section ref={weekFlowRef} className="min-w-0 space-y-5 scroll-mt-24">
                  <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                    <section className="min-w-0 border-4 border-black bg-white p-3 text-black shadow-[4px_4px_0px_0px_#000] sm:p-5 sm:shadow-[6px_6px_0px_0px_#000]">
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
                          disabled={
                            activeLeague.status !== 'active'
                            || Boolean(liveFixture)
                            || (isOnlineInviteLeague && !isOwner)
                            || (currentWeekGenerated && !currentWeekReadyToAdvance)
                          }
                          className="game-button flex items-center gap-2 border-4 border-black bg-green-600 px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-35"
                        >
                          <Play size={18} fill="currentColor" /> {currentWeekGenerated ? 'Sonraki Haftaya Geç' : 'Haftayı Başlat'}
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
                            hideResult={hideCurrentWeekResults}
                          />
                        ))}
                        {hideCurrentWeekResults && (
                          <p className="border-2 border-dashed border-yellow-500 bg-yellow-50 p-4 text-xs font-black uppercase text-yellow-800">
                            Hafta sonuclari, kullanici maclari tamamlaninca puan tablosuna yansiyacak.
                          </p>
                        )}
                      </div>
                      {activeLeague.mode === 'invite' && (
                        <div className="mt-3 border-2 border-black/20 bg-zinc-100 p-3 text-[9px] font-black uppercase">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => handleAutoContinueChange(!autoContinue)}
                              className={`game-button border-2 border-black px-3 py-2 ${effectiveAutoContinue ? 'bg-green-500' : 'bg-white'}`}
                            >
                              Auto Devam: {effectiveAutoContinue ? 'Acik' : 'Kapali'}
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleAutoSeasonChange(!autoSeason)}
                                className={`game-button border-2 border-black px-3 py-2 ${autoSeason ? 'bg-yellow-400' : 'bg-white'}`}
                              >
                                Sezonu Auto Tamamla: {autoSeason ? 'Acik' : 'Kapali'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowSeasonDebug((value) => !value)}
                              className="game-button border-2 border-black bg-zinc-950 px-3 py-2 text-white"
                            >
                              Debug {showSeasonDebug ? 'Kapat' : 'Ac'}
                            </button>
                          </div>
                          {showSeasonDebug && (
                            <div className="mt-3 grid gap-1 border-2 border-black bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                              <span>League: {activeLeague.id}</span>
                              <span>User: {user?.id ?? '-'}</span>
                              <span>OwnerId: {activeLeague.ownerId}</span>
                              <span>IsOwner: {isOwner ? 'evet' : 'hayir'}</span>
                              <span>Status: {activeLeague.status}</span>
                              <span>Hafta: {Math.min(activeLeague.currentWeek + 1, seasonWeekCount)}/{seasonWeekCount}</span>
                              <span>AutoContinue: {effectiveAutoContinue ? 'true' : 'false'}</span>
                              <span>PreferencesLoaded: {preferencesLoaded ? 'true' : 'false'}</span>
                              <span>PrefsKey: {matchPreferencesKey ?? '-'}</span>
                              <span>RawAutoContinue: {
                                typeof window !== 'undefined' && activeLeagueIdValue && user?.id
                                  ? window.localStorage.getItem(getMultiplayerMatchPreferenceKeys(activeLeagueIdValue, user.id).autoContinue) ?? '-'
                                  : '-'
                              }</span>
                              <span>LastAutoContinueSetter: {lastAutoContinueSetter}</span>
                              <span>LastAutoContinueChangeAt: {lastAutoContinueChangeAt ?? '-'}</span>
                              <span>AutoSeason: {autoSeason ? 'true' : 'false'}</span>
                              <span>Progress: {myWeekProgress?.status ?? '-'}</span>
                              <span>ProgressCount: {currentWeekProgress.length}</span>
                              <span className="break-words">Waiting: {waitingForUsers.join(', ') || '-'}</span>
                              <span className="break-all sm:col-span-2">MatchSession: {matchSessionId ?? '-'}</span>
                              <span>ActiveMatch: {liveFixture?.id ?? '-'}</span>
                              <span>Advancing: {advanceInProgress || activeLeague.advancingWeek !== null && activeLeague.advancingWeek !== undefined ? 'true' : 'false'}</span>
                              <span>StartVersion: {activeLeague.startVersion ?? '-'}</span>
                              <span>AdvanceVersion: {activeLeague.advanceVersion ?? '-'}</span>
                              <span className="break-words sm:col-span-2">LastAction: {matchFlowLastAction}</span>
                              {lastFirestoreError && <span className="break-words text-red-700 sm:col-span-2 lg:col-span-4">FirestoreError: {lastFirestoreError}</span>}
                              {isOwner && activeLeague.status === 'active' && (
                                <div className="mt-2 grid gap-2 sm:col-span-2 lg:col-span-4 sm:grid-cols-2">
                                  <button type="button" onClick={() => void handleRepairWeek()} disabled={advanceInProgress} className="game-button border-2 border-black bg-blue-600 px-3 py-3 text-white disabled:opacity-40">
                                    Bu Haftayi Onar
                                  </button>
                                  <button type="button" onClick={() => void handleForceAdvanceWeek()} disabled={advanceInProgress} className="game-button border-2 border-black bg-red-600 px-3 py-3 text-white disabled:opacity-40">
                                    Haftayi Tamamla ve Ilerle
                                  </button>
                                </div>
                              )}
                              {myCurrentProgress && !liveFixture && (
                                <button
                                  type="button"
                                  onClick={() => void handleWatchMyMatch(myCurrentProgress)}
                                  className="game-button border-2 border-black bg-zinc-800 px-3 py-3 text-white sm:col-span-2 lg:col-span-4"
                                >
                                  Maci Yeniden Goster (Debug)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
                      {latestFixture?.result && !hideCurrentWeekResults && (
                        <div className="mt-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Son Maç Raporu</p>
                          <FixtureRow fixture={latestFixture} teamNameOf={teamNameOf} highlightTeamIds={humanTeamIds} dark />
                        </div>
                      )}
                    </section>
                  </div>

                  {currentWeekProgress.length > 0 && activeLeague.status === 'active' && (
                    <section className="border-4 border-black bg-yellow-300 p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                      <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
                        <Eye size={18} />
                        <h3 className="text-xl font-black uppercase italic">Haftanın Kullanıcı Maçları</h3>
                      </div>
                      <div className="grid gap-3">
                        {currentWeekProgress.map((progress) => {
                          const fixture = currentRound.find((item) => item.id === progress.matchId) ?? null;
                          const isMine = progress.userId === user?.id;
                          const done = isProgressDone(progress.status);
                          return (
                            <div
                              key={progress.id}
                              className={`grid gap-3 border-2 border-black p-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000] md:grid-cols-[1fr_auto] md:items-center ${isMine ? 'bg-white' : 'bg-yellow-100'}`}
                            >
                              <div>
                                <p className="text-[10px] opacity-60">{teamNameOf(progress.teamId)} / {weekProgressLabels[progress.status]}</p>
                                <p className="mt-1 text-sm">
                                  {fixture ? `${teamNameOf(fixture.homeTeamId)} vs ${teamNameOf(fixture.awayTeamId)}` : 'Mac bekleniyor'}
                                </p>
                                {done && fixture && !hideCurrentWeekResults && (
                                  <p className="mt-1 text-lg tabular-nums">{finalScore(fixture)?.home} - {finalScore(fixture)?.away}</p>
                                )}
                              </div>
                              <span className="border border-black/25 bg-white/50 px-3 py-2 text-center text-[10px] opacity-70">
                                {isMine
                                  ? done ? 'Sonuc goruldu' : liveFixture ? 'Mac otomatik oynaniyor' : 'Otomatik baslatiliyor'
                                  : done ? 'Tamamlandi' : 'Bekleniyor'}
                              </span>
                            </div>
                          );
                        })}
                        {!currentWeekReadyToAdvance && (
                          <p className="border-2 border-dashed border-black/30 bg-white/45 p-3 text-[10px] font-black uppercase">
                            {currentWeekProgress
                              .filter((progress) => !isProgressDone(progress.status))
                              .map((progress) => teamNameOf(progress.teamId))
                              .join(', ')} macini tamamlamasi bekleniyor.
                          </p>
                        )}
                      </div>
                    </section>
                  )}

                  {liveFixture?.result && (
                    <div ref={liveMatchRef} className="scroll-mt-24">
                      <MatchEnginePanel
                        key={matchSessionId ?? liveFixture.id}
                        matchSessionId={matchSessionId ?? `${activeLeague.id}:${activeLeague.currentWeek}:${liveFixture.id}`}
                        fixture={liveFixture}
                        result={liveFixture.result}
                        homeName={teamNameOf(liveFixture.homeTeamId)}
                        awayName={teamNameOf(liveFixture.awayTeamId)}
                        onCompleted={() => {
                          if (liveProgressId) void completeLiveMatch();
                          else setLiveFixture(null);
                        }}
                        onSkipped={() => {
                          if (liveProgressId) void skipLiveMatch();
                        }}
                        onDismissSkipped={() => void completeLiveMatch()}
                        autoContinue={effectiveAutoContinue}
                        speed={matchSpeed}
                        onAutoContinueChange={handleAutoContinueChange}
                        onSpeedChange={handleMatchSpeedChange}
                      />
                    </div>
                  )}

                  <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
                    <div className="mb-4 flex items-center gap-2 border-b-2 border-black pb-3">
                      <Users className="text-green-700" size={18} />
                      <h3 className="text-2xl font-black uppercase italic">Puan Tablosu</h3>
                    </div>
                    {hideCurrentWeekResults && (
                      <p className="mb-4 border-2 border-dashed border-black/25 bg-yellow-50 p-4 text-xs font-black uppercase text-yellow-800">
                        Hafta sonuclari tamamlaninca puan tablosu guncellenecek.
                      </p>
                    )}
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
    <div className="space-y-3">
      <div className="min-w-0 border-b border-white/10 pb-2">
        <PlayerNameText
          text={player.name}
          className="text-[15px] font-black uppercase text-white sm:text-[17px]"
        />
      </div>
      <div className="flex items-start gap-3">
        <PlayerPortrait player={player} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase text-yellow-300">
            {positionLabel(player.position)}
          </p>
          <p
            className="mt-1 text-[10px] font-black uppercase text-white"
            style={{ overflowWrap: 'anywhere' }}
          >
            {team?.name ?? 'Takim'}
          </p>
          <p className="mt-1 text-[9px] font-bold uppercase text-white/45">
            {player.nationality ?? '-'}
          </p>
        </div>
        <PlayerRatingBadge rating={player.overall_rating} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[9px] font-black uppercase">
        <PlayerStat label="Hiz" value={stats.pace} />
        <PlayerStat label="Sut" value={stats.shooting} />
        <PlayerStat label="Pas" value={stats.passing} />
        <PlayerStat label="Dri" value={stats.dribbling} />
        <PlayerStat label="Def" value={stats.defense} />
        <PlayerStat label="Fiz" value={stats.physical} />
      </div>
    </div>
  );

  const className = `w-full border-2 p-4 text-left shadow-[3px_3px_0px_0px_#000] transition ${
    active
      ? 'border-yellow-400 bg-yellow-400/15'
      : selected
        ? 'border-white/10 bg-black/30 opacity-40'
        : disabled
          ? 'border-white/10 bg-black/30 opacity-35'
          : 'border-white/15 bg-[linear-gradient(135deg,rgba(250,204,21,0.14),rgba(24,24,27,0.92)_42%,rgba(0,0,0,0.96))] hover:border-yellow-400/70'
  }`;

  if (!onClick) return <div className={className} title={player.name}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || selected}
      className={`${className} disabled:cursor-not-allowed`}
      title={player.name}
      aria-label={player.name}
    >
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

function PlayerNameText({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      title={text}
      className={`block min-w-0 w-full whitespace-normal break-words leading-tight ${className}`}
      style={{ overflowWrap: 'anywhere' }}
    >
      {text}
    </span>
  );
}

function DraftRollPanel({
  draft,
  rolledSquad,
  rolledTeam,
  rolledRating,
  strengthTier,
  selectedIds,
  pendingPlayerId,
  activeTotal,
  seenTeamCount,
  teamPoolCount,
  teamById,
  isPlayerDisabled,
  onRoll,
  onSelect,
  onToggleAutoRoll,
}: {
  draft: SlotDraft;
  rolledSquad: Squad | null;
  rolledTeam: SeasonTeam | null;
  rolledRating: number;
  strengthTier: DraftStrengthTier | null;
  selectedIds: Set<string>;
  pendingPlayerId: string | null;
  activeTotal: number;
  seenTeamCount: number;
  teamPoolCount: number;
  teamById: Map<string, SeasonTeam>;
  isPlayerDisabled: (player: Player) => boolean;
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
        {teamPoolCount > 0 && (
          <div className="mt-3 border border-white/10 bg-white/5 p-2 text-[10px] font-black uppercase text-white/55">
            Bu draftta gorulen takim: {seenTeamCount}/{teamPoolCount}
            <span className="mt-1 block text-white/55">Draft dengesi: {strengthTier === 'strong' ? 'Guclu' : strengthTier === 'weak' ? 'Zayif' : strengthTier === 'medium' ? 'Orta' : '-'}</span>
            <span className="mt-1 block text-white/35">Guclu / zayif / orta sirasi. Tum takimlar gorulmeden tekrar yok.</span>
          </div>
        )}
        <button
          type="button"
          onClick={onRoll}
          disabled={!draft.teamName.trim() || draft.pickAvailable || activeTotal >= draftTargetTotal}
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
            const disabledByRosterNeed = isPlayerDisabled(player);
            return (
              <PremiumPlayerCard
                key={player.id}
                player={player}
                team={team}
                selected={selected}
                active={pendingPlayerId === player.id}
                disabled={!draft.pickAvailable || !draft.teamName.trim() || disabledByRosterNeed}
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
              Hangi mevkiye yerlestirmek istiyorsun? Saha slotuna dokun veya yedek slotuna ekle.
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
    <div className="relative flex h-12 w-12 items-center justify-center text-center transition-all sm:h-18 sm:w-18" title={player?.name ?? positionLabel(slot.allowedPosition)}>
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
          <div className="text-base font-black text-white sm:text-xl">{player.jersey_number}</div>
          <div className="absolute -bottom-8 left-1/2 w-28 -translate-x-1/2 border border-zinc-700 bg-black px-1.5 py-1 text-center text-[7px] font-black uppercase text-white sm:-bottom-10 sm:w-36 sm:px-2 sm:text-[8px]">
            <PlayerNameText
              text={player.name}
              className="text-[7px] uppercase sm:text-[8px]"
            />
          </div>
          <div className="card-rating-badge absolute -right-3 top-5 flex h-6 w-6 items-center justify-center border border-black text-[10px] font-black shadow-[1px_1px_0px_0px_#000]">
            {player.overall_rating}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPlace('startingXI', slot.index)}
          disabled={!pendingPlayer}
          aria-disabled={Boolean(pendingPlayer && !compatible)}
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
                    <span className="min-w-0 flex-1 text-white">
                      <span className="block whitespace-normal break-words leading-tight" style={{ overflowWrap: 'anywhere' }} title={player.name}>
                        {player.name}
                      </span>
                    </span>
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
            <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 border border-white/10 bg-black/25 p-2 text-[10px] font-black uppercase">
              <span className="min-w-0">
                <span className="block whitespace-normal break-words text-white leading-tight" style={{ overflowWrap: 'anywhere' }} title={player ? `#${player.jersey_number} ${player.name}` : id}>
                  {player ? `#${player.jersey_number} ${player.name}` : id}
                </span>
              </span>
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
    <div className={`border border-white/10 bg-black/25 p-2 text-[10px] font-black uppercase ${selected ? 'opacity-35' : ''}`} title={player.name}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block whitespace-normal break-words text-white leading-tight" style={{ overflowWrap: 'anywhere' }} title={`#${player.jersey_number} ${player.name}`}>
            #{player.jersey_number} {player.name}
          </span>
        </span>
        <span className="shrink-0 border border-white/20 px-2 py-1">{player.overall_rating}</span>
      </div>
      <p className="mt-1 text-[9px] text-white/45">{player.position} / {player.nationality ?? '-'}</p>
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
  hideResult = false,
}: {
  fixture: CompetitionFixture;
  teamNameOf: (teamId: string) => string;
  highlightTeamIds: string[];
  dark?: boolean;
  hideResult?: boolean;
}) {
  const score = hideResult ? null : finalScore(fixture);
  const owned = highlightTeamIds.includes(fixture.homeTeamId) || highlightTeamIds.includes(fixture.awayTeamId);
  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-2 border-black p-2 text-[10px] font-black shadow-[3px_3px_0px_0px_#000] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:gap-3 sm:p-3 sm:text-xs ${owned ? 'bg-yellow-400 text-black' : dark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-black'}`}>
      <span className="min-w-0 truncate text-right uppercase">{teamNameOf(fixture.homeTeamId)}</span>
      <span className="min-w-14 text-center text-base tabular-nums sm:min-w-20 sm:text-xl">{score ? `${score.home} - ${score.away}` : 'VS'}</span>
      <span className="min-w-0 truncate text-left uppercase">{teamNameOf(fixture.awayTeamId)}</span>
      <Eye size={15} className={`hidden sm:block ${owned ? 'opacity-100' : 'opacity-20'}`} />
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
