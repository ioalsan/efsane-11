'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { FORMATIONS, type FormationType } from '@/lib/formations';
import type { ManagerMentality } from '@/lib/teamManagement';
import type { CompetitionFixture } from '@/lib/competitionEngine';
import type { Player } from '@/types';

const maxUserOptions: MultiplayerMaxUsers[] = [4, 8, 12, 18];
const friendCountOptions = [2, 3, 4, 5];
const powerLimitOptions: MultiplayerPowerLimit[] = ['balanced', 'max80', 'max85', 'free'];
const tacticOptions: ManagerMentality[] = ['Gegenpress', 'Balanced', 'ParkTheBus'];

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
  startingXI: slot.selectedSquad?.startingXI ?? [],
  substitutes: slot.selectedSquad?.substitutes ?? [],
  reserves: slot.selectedSquad?.reserves ?? [],
});

const draftPlayerIds = (draft: SlotDraft) => [
  ...draft.startingXI,
  ...draft.substitutes,
  ...draft.reserves,
];

const getDraftPlayers = (ids: string[], playerById: Map<string, Player>) => (
  ids.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player))
);

export default function MultiplayerLeague({ onBackToQuick }: { onBackToQuick: () => void }) {
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
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState('Hafta Sonu Ligi');
  const [maxUsers, setMaxUsers] = useState<MultiplayerMaxUsers>(8);
  const [friendCount, setFriendCount] = useState(3);
  const [powerLimit, setPowerLimit] = useState<MultiplayerPowerLimit>('balanced');
  const [inviteCode, setInviteCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [liveFixture, setLiveFixture] = useState<CompetitionFixture | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [playerQuery, setPlayerQuery] = useState('');
  const [userMatchQueue, setUserMatchQueue] = useState<CompetitionFixture[]>([]);

  const refreshLeagues = (selectedId = activeLeagueId) => {
    const nextLeagues = listLeagues();
    setLeagues(nextLeagues);
    if (selectedId && nextLeagues.some((league) => league.id === selectedId)) {
      setActiveLeagueId(selectedId);
      return;
    }
    setActiveLeagueId(nextLeagues[0]?.id ?? null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const existingUser = getCurrentUser();
      const currentUser = existingUser ?? createLocalUser();
      if (!existingUser) saveCurrentUser(currentUser);
      setUser(currentUser);
      setManagerName(currentUser.username);
      setLeagues(listLeagues());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const activeLeague = useMemo(
    () => leagues.find((league) => league.id === activeLeagueId) ?? leagues[0] ?? null,
    [activeLeagueId, leagues],
  );
  const isLocalFriendLeague = activeLeague?.mode === 'local-friends';
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
  const humanTeamIds = useMemo(
    () => activeLeague?.teams.map((team) => team.id) ?? [],
    [activeLeague?.teams],
  );
  const realTeamPlan = useMemo(() => (
    getRealTeamReplacementPlan(isLocalFriendLeague ? playerSlots.length : activeLeague?.teams.length ?? 0, dataset)
  ), [activeLeague?.teams.length, dataset, isLocalFriendLeague, playerSlots.length]);
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

  const startingPlayers = useMemo(
    () => selectedPlayers.filter((player): player is Player => Boolean(player)),
    [selectedPlayers],
  );
  const draftReady = Boolean(formation && tactic && captainId && startingPlayers.length === 11);
  const selectedIds = useMemo(() => new Set(startingPlayers.map((player) => player.id)), [startingPlayers]);
  const substitutePlayers = useMemo(() => {
    const competitionTeamIds = new Set(getCompetitionTeams(competitionId, dataset).map((team) => team.id));
    return dataset.players
      .filter((player) => player.isActive && competitionTeamIds.has(player.teamId) && !selectedIds.has(player.id))
      .map(toLegacyPlayer)
      .sort((a, b) => playerScore(b) - playerScore(a))
      .slice(0, 7);
  }, [competitionId, dataset, selectedIds]);

  const teamPreview = useMemo(() => {
    if (!user || !formation || !tactic || !captainId || startingPlayers.length !== 11) return null;
    return buildMultiplayerTeamInput({
      ownerId: user.id,
      teamName: squadName,
      formation,
      tactic,
      captainId,
      startingPlayers,
      substitutes: substitutePlayers,
    });
  }, [captainId, formation, squadName, startingPlayers, substitutePlayers, tactic, user]);
  const powerCap = activeLeague ? getPowerLimitCap(activeLeague.powerLimit) : null;
  const exceedsPowerLimit = Boolean(teamPreview && powerCap && teamPreview.rating > powerCap);
  const activeDraftSelectedIds = useMemo(
    () => new Set(activeDraft ? draftPlayerIds(activeDraft) : []),
    [activeDraft],
  );
  const activeDraftStartingPlayers = useMemo(
    () => activeDraft ? getDraftPlayers(activeDraft.startingXI, playerById) : [],
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
    activeDraft.startingXI.length === 11 &&
    activeDraft.substitutes.length === 7 &&
    activeDraft.reserves.length === 5 &&
    activeDraft.captainId,
  );
  const activeSlotExceedsPowerLimit = Boolean(activeSlotPreview && powerCap && activeSlotPreview.rating > powerCap);
  const filteredPlayers = useMemo(() => {
    const query = playerQuery.trim().toLocaleLowerCase('tr-TR');
    const filtered = query
      ? allPlayers.filter((player) => (
        player.name.toLocaleLowerCase('tr-TR').includes(query) ||
        (player.nationality ?? '').toLocaleLowerCase('tr-TR').includes(query)
      ))
      : allPlayers;
    return filtered.slice(0, 80);
  }, [allPlayers, playerQuery]);

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

  const addPlayerToDraft = (playerId: string, target: RosterTarget) => {
    if (!activeDraft || activeDraftSelectedIds.has(playerId)) return;
    const currentIds = activeDraft[target];
    if (currentIds.length >= rosterTargetLimits[target]) return;
    updateActiveDraft({
      [target]: [...currentIds, playerId],
    });
  };

  const removePlayerFromDraft = (playerId: string) => {
    if (!activeDraft) return;
    updateActiveDraft({
      startingXI: activeDraft.startingXI.filter((id) => id !== playerId),
      substitutes: activeDraft.substitutes.filter((id) => id !== playerId),
      reserves: activeDraft.reserves.filter((id) => id !== playerId),
      captainId: activeDraft.captainId === playerId ? null : activeDraft.captainId,
    });
  };

  const handleSaveActiveSlot = () => {
    if (!activeLeague || !activeSlot || !activeDraft || !activeSlotPreview) return;
    try {
      const input: PlayerSlotTeamInput = {
        ...activeSlotPreview,
        displayName: activeDraft.displayName,
        reserves: activeDraft.reserves,
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

  const handleCreateLeague = () => {
    try {
      const owner = requireUser();
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

  const handleJoinLeague = () => {
    try {
      const owner = requireUser();
      const league = joinLeague(inviteCode, owner.id);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setResultNotice('success', `${league.name} bekleme odası açıldı.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleSaveTeam = () => {
    if (!activeLeague || !teamPreview) return;
    try {
      const league = saveTeamToLeague(activeLeague.id, teamPreview);
      refreshLeagues(league.id);
      setActiveLeagueId(league.id);
      setResultNotice('success', `${teamPreview.teamName} lige kaydedildi.`);
    } catch (error) {
      setResultNotice('error', getErrorMessage(error));
    }
  };

  const handleStartLeague = () => {
    if (!activeLeague || !user) return;
    try {
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

  const handleSimulateWeek = () => {
    if (!activeLeague || liveFixture) return;
    try {
      const result = simulateWeek(activeLeague.id, dataset);
      const resultHumanIds = new Set(result.league.teams.map((team) => team.id));
      const userFixtures = result.playedRound.filter((fixture) => (
        resultHumanIds.has(fixture.homeTeamId) || resultHumanIds.has(fixture.awayTeamId)
      ));
      const userFixture = ownedTeam
        ? userFixtures.find((fixture) => fixture.homeTeamId === ownedTeam.id || fixture.awayTeamId === ownedTeam.id)
        : userFixtures[0] ?? null;
      refreshLeagues(result.league.id);
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
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">Multiplayer Lig</h2>
            <div className="mt-3 grid gap-2 text-xs font-black uppercase text-white/60 sm:grid-cols-3">
              <span>Lig odası</span>
              <span>Hafta hafta simülasyon</span>
              <span>LocalStorage MVP</span>
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
        <aside className="space-y-5">
          <section className="border-4 border-black bg-green-700 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
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

          <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
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

          <section className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
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

          <section className="border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000]">
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
                      {statusLabels[activeLeague.status]} / {powerLimitLabels[activeLeague.powerLimit]} / {activeLeague.maxUsers} takım
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

              {activeLeague.status === 'waiting' && isLocalFriendLeague && (
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

                          <div className="mt-4 grid gap-3 md:grid-cols-4">
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
                              <input
                                value={playerQuery}
                                onChange={(event) => setPlayerQuery(event.target.value)}
                                className="mb-3 w-full border-2 border-white/20 bg-black px-3 py-3 text-xs font-black uppercase text-white outline-none"
                                placeholder="Oyuncu ara"
                              />
                              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                                {filteredPlayers.map((player) => {
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
                <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
                  <div className="border-4 border-black bg-zinc-950 p-5 text-white shadow-[6px_6px_0px_0px_#000]">
                    <div className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400">Takımını Kaydet</p>
                        <h3 className="text-2xl font-black uppercase italic">{teamPreview?.teamName ?? squadName}</h3>
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
                          onClick={handleSaveTeam}
                          disabled={!draftReady || !teamPreview || exceedsPowerLimit}
                          className="game-button flex items-center gap-2 border-2 border-black bg-green-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-35"
                        >
                          <Save size={16} /> Takımı Kaydet
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <MiniStat dark label="İlk 11" value={`${startingPlayers.length}/11`} />
                      <MiniStat dark label="Yedek" value={`${substitutePlayers.length}/7`} />
                      <MiniStat dark label="Güç" value={teamPreview?.rating ?? '-'} />
                      <MiniStat dark label="Kimya" value={teamPreview?.chemistry ?? '-'} />
                    </div>

                    {exceedsPowerLimit && (
                      <div className="mt-4 border-2 border-red-500 bg-red-500/15 p-3 text-xs font-black uppercase text-red-100">
                        Takım ortalaması {powerCap} limitini aşıyor.
                      </div>
                    )}
                    {!draftReady && (
                      <div className="mt-4 border-2 border-yellow-400 bg-yellow-400/10 p-3 text-xs font-black uppercase text-yellow-100">
                        Hızlı Oyna kadrosunda diziliş, taktik, 11 oyuncu ve kaptan gerekli.
                      </div>
                    )}

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <RosterList title="İlk 11" players={startingPlayers} captainId={captainId} />
                      <RosterList title="Yedekler" players={substitutePlayers} captainId={null} />
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
                          disabled={activeLeague.status !== 'active' || Boolean(liveFixture)}
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

function RosterList({
  title,
  players,
  captainId,
}: {
  title: string;
  players: Player[];
  captainId: string | null;
}) {
  return (
    <div className="border-2 border-white/15 bg-white/5 p-3">
      <h4 className="mb-3 text-sm font-black uppercase text-yellow-400">{title}</h4>
      <div className="space-y-2">
        {players.length === 0 && <p className="text-xs font-black uppercase text-white/45">Boş</p>}
        {players.map((player) => (
          <div key={player.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border border-white/10 bg-black/25 p-2 text-[10px] font-black uppercase">
            <span className="truncate">#{player.jersey_number} {player.name}</span>
            <span className={`border px-2 py-1 ${captainId === player.id ? 'border-yellow-400 bg-yellow-400 text-black' : 'border-white/20 text-white/70'}`}>
              {captainId === player.id ? 'K' : player.overall_rating}
            </span>
          </div>
        ))}
      </div>
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
            disabled={selected || draft[target].length >= rosterTargetLimits[target]}
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
