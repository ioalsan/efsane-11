import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  calculateStandings,
  generateRoundRobin,
  simulateCompetitionMatch,
  toCompetitionPlayer,
  type CompetitionFixture,
  type CompetitionTeam,
  type MatchResult,
} from './competitionEngine';
import { getCaptainRole } from './captain';
import {
  DEFAULT_COMPETITION_ID,
  getSeasonDataset,
  getTeamPlayers,
  toLegacyPlayer,
} from './seasonRepository';
import { ensureAnonymousUser, getFirebaseClient, isFirebaseConfigured } from './firebase';
import {
  getRealTeamReplacementPlan,
  getPowerLimitCap,
  getInviteUserTeams,
  getRealTeamChemistry,
  createWeekProgressEntries,
  getMissingWeekProgressEntries,
  isWeekReadyToAdvance,
  INVITE_LEAGUE_TOTAL_TEAMS,
  isStartableStatus,
  type MultiplayerLeague,
  type MultiplayerMatchReport,
  type MultiplayerMaxUsers,
  type MultiplayerPowerLimit,
  type MultiplayerStandingRow,
  type MultiplayerTeam,
  type MultiplayerTeamInput,
  type SimulateWeekResult,
  type WeekUserProgress,
  type WeekUserProgressStatus,
} from './multiplayerService';
import type { Player, SeasonDataset } from '@/types';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => new Date().toISOString();

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type FirestoreFixtureDoc = CompetitionFixture & {
  week: number;
  updatedAt?: string;
};

const normalizeInviteCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const clampLeagueTeamCount = (value: number) => Math.min(18, Math.max(2, Math.round(value)));
const finalScore = (fixture: CompetitionFixture) => fixture.result?.extraTime ?? fixture.result?.normalTime ?? null;

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

const createStandingRows = (
  teamIds: string[],
  teams: MultiplayerTeam[],
  fixtures: CompetitionFixture[][],
): MultiplayerStandingRow[] => {
  const flatFixtures = fixtures.flat();
  return calculateStandings(teamIds, flatFixtures).map((row) => {
    const team = teams.find((item) => item.id === row.teamId);
    return {
      ...row,
      teamName: team?.teamName ?? row.teamId,
      isBot: team?.isBot ?? false,
      form: getForm(row.teamId, flatFixtures),
    };
  });
};

const withoutFirestoreMeta = (data: Record<string, unknown>) => {
  const fixture = { ...data };
  delete fixture.week;
  delete fixture.updatedAt;
  delete fixture.fixtures;
  return fixture as unknown as CompetitionFixture;
};

const groupFixtureDocsByWeek = (fixtureDocs: FirestoreFixtureDoc[]) => {
  const grouped = new Map<number, CompetitionFixture[]>();
  fixtureDocs.forEach((fixtureDoc) => {
    const { week, updatedAt, ...fixture } = fixtureDoc;
    void updatedAt;
    const weekNumber = Number.isFinite(week) && week > 0 ? week : fixture.roundNumber;
    const round = grouped.get(weekNumber) ?? [];
    round.push(fixture);
    grouped.set(weekNumber, round);
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, fixtures]) => fixtures.sort((a, b) => a.id.localeCompare(b.id)));
};

const parseFixtureValue = (value: unknown): CompetitionFixture[][] => {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (Array.isArray(value[0])) return value as CompetitionFixture[][];
  const fixtureDocs = (value as Array<CompetitionFixture & { week?: number }>).map((fixture) => ({
    ...fixture,
    week: Number(fixture.week ?? fixture.roundNumber),
  }));
  return groupFixtureDocsByWeek(fixtureDocs);
};

export const toFirestoreFixtureDocs = (
  fixtures: CompetitionFixture[][],
  updatedAt = now(),
): FirestoreFixtureDoc[] => fixtures.flatMap((round, roundIndex) => (
  round.map((fixture) => clean({
    ...fixture,
    week: roundIndex + 1,
    updatedAt,
  }))
));

export const toFirestoreLeagueDoc = (
  league: MultiplayerLeague,
  memberIds?: string[],
) => clean({
  version: league.version,
  id: league.id,
  mode: league.mode,
  name: league.name,
  ownerId: league.ownerId,
  inviteCode: league.inviteCode,
  competitionId: league.competitionId,
  maxUsers: league.maxUsers,
  powerLimit: league.powerLimit,
  playerSlots: league.playerSlots,
  realTeams: league.realTeams,
  replacedTeams: league.replacedTeams,
  status: league.status,
  currentWeek: league.currentWeek,
  latestFixtureId: league.latestFixtureId,
  startedAt: league.startedAt ?? null,
  startVersion: league.startVersion ?? null,
  advancingWeek: league.advancingWeek ?? null,
  advancingBy: league.advancingBy ?? null,
  advanceStartedAt: league.advanceStartedAt ?? null,
  advanceVersion: league.advanceVersion ?? null,
  deletedAt: league.deletedAt ?? null,
  deletedBy: league.deletedBy ?? null,
  teamIds: league.teams.map((team) => team.id),
  botTeamIds: league.botTeams.map((team) => team.id),
  createdAt: league.createdAt,
  updatedAt: league.updatedAt,
  ...(memberIds ? { memberIds } : {}),
});

const getPlayerMap = (dataset: SeasonDataset) => new Map(
  dataset.players.map((player) => {
    const legacyPlayer = toLegacyPlayer(player);
    return [legacyPlayer.id, legacyPlayer] as const;
  }),
);

const createRealLeagueTeams = (
  realTeams: MultiplayerLeague['realTeams'],
  dataset: SeasonDataset,
  leagueId: string,
): MultiplayerTeam[] => {
  const createdAt = now();
  return realTeams.map((realTeam, index) => {
    const sourceTeam = dataset.teams.find((team) => team.id === realTeam.sourceTeamId);
    const players = getTeamPlayers(realTeam.sourceTeamId, dataset)
      .sort((a, b) => b.rating + b.form - (a.rating + a.form))
      .slice(0, 23);

    return {
      id: `real-${leagueId}-${realTeam.sourceTeamId}-${index + 1}`,
      ownerId: 'real-team',
      teamName: sourceTeam?.name ?? realTeam.teamName,
      formation: '4-2-3-1',
      tactic: 'Balanced',
      captainId: players[0]?.id ?? null,
      startingXI: players.slice(0, 11).map((player) => player.id),
      substitutes: players.slice(11, 18).map((player) => player.id),
      reserves: players.slice(18, 23).map((player) => player.id),
      rating: realTeam.rating,
      chemistry: getRealTeamChemistry(realTeam.rating, realTeam.sourceTeamId),
      isBot: true,
      sourceTeamId: realTeam.sourceTeamId,
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const toCompetitionTeam = (
  team: MultiplayerTeam,
  playerById: Map<string, Player>,
): CompetitionTeam => {
  const startingPlayers = team.startingXI
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const substitutePlayers = team.substitutes
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const reservePlayers = (team.reserves ?? [])
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const captain = playerById.get(team.captainId ?? '');
  const captainRole = getCaptainRole(captain);

  return {
    id: team.id,
    name: team.teamName,
    rating: team.rating,
    isUser: !team.isBot,
    tactic: team.tactic,
    chemistry: team.chemistry,
    captainImpact: captainRole ? captainRole.bonus * 2 : 0,
    captainRoleTitle: captainRole?.title,
    players: [...startingPlayers, ...substitutePlayers, ...reservePlayers].map(toCompetitionPlayer),
  };
};

const getFirebaseOrThrow = async () => {
  const client = getFirebaseClient();
  if (!client || !isFirebaseConfigured()) throw new Error('Firebase yapılandırması eksik. Davetli Lig offline demo modunda çalışır.');
  const user = await ensureAnonymousUser();
  if (!user) throw new Error('Anonim giriş başlatılamadı.');
  return { ...client, user };
};

const leagueRef = (db: Firestore, leagueId: string) => doc(db, 'leagues', leagueId);

const createInviteCode = () => (
  Array.from({ length: 8 }, () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]).join('')
);

const readTeams = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
  return snapshot.docs
    .map((item) => item.data() as MultiplayerTeam)
    .sort((a, b) => Number(a.isBot) - Number(b.isBot) || a.teamName.localeCompare(b.teamName));
};

const readFixtures = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'fixtures'));
  const flatFixtureDocs: FirestoreFixtureDoc[] = [];
  const legacyRounds: Array<{ week: number; fixtures: CompetitionFixture[] }> = [];

  snapshot.docs.forEach((item) => {
    const data = item.data();
    if (Array.isArray(data.fixtures)) {
      legacyRounds.push({
        week: Number(data.week ?? data.roundNumber ?? legacyRounds.length + 1),
        fixtures: data.fixtures as CompetitionFixture[],
      });
      return;
    }

    if (typeof data.homeTeamId === 'string' && typeof data.awayTeamId === 'string') {
      const fixture = withoutFirestoreMeta(data);
      flatFixtureDocs.push({
        ...fixture,
        week: Number(data.week ?? fixture.roundNumber),
      });
    }
  });

  if (flatFixtureDocs.length > 0) return groupFixtureDocsByWeek(flatFixtureDocs);

  return legacyRounds
    .sort((a, b) => a.week - b.week)
    .map((round) => round.fixtures);
};

const readStandings = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'standings'));
  return snapshot.docs
    .map((item) => item.data() as MultiplayerStandingRow)
    .sort((a, b) => (
      b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || a.teamName.localeCompare(b.teamName)
    ));
};

const readMatchReports = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'matchReports'));
  return snapshot.docs
    .map((item) => item.data() as MultiplayerMatchReport)
    .sort((a, b) => a.week - b.week || a.fixtureId.localeCompare(b.fixtureId));
};

const readWeekProgress = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'weekProgress'));
  return snapshot.docs
    .map((item) => item.data() as WeekUserProgress)
    .sort((a, b) => a.week - b.week || a.teamId.localeCompare(b.teamId));
};

const hydrateLeague = async (db: Firestore, leagueId: string, data: Record<string, unknown>): Promise<MultiplayerLeague> => {
  const [teams, fixtureRounds, standingRows, matchReports, weekProgress] = await Promise.all([
    readTeams(db, leagueId),
    readFixtures(db, leagueId),
    readStandings(db, leagueId),
    readMatchReports(db, leagueId),
    readWeekProgress(db, leagueId),
  ]);
  const userTeams = teams.filter((team) => !team.isBot);
  const botTeams = teams.filter((team) => team.isBot);
  const fallbackFixtures = parseFixtureValue(data.fixtures);
  return {
    version: 1,
    id: leagueId,
    mode: 'invite',
    name: String(data.name ?? 'Canli11 Davetli Lig'),
    ownerId: String(data.ownerId ?? ''),
    inviteCode: String(data.inviteCode ?? ''),
    competitionId: typeof data.competitionId === 'string' ? data.competitionId : DEFAULT_COMPETITION_ID,
    maxUsers: Number(data.maxUsers ?? 8) as MultiplayerMaxUsers,
    powerLimit: (data.powerLimit ?? 'balanced') as MultiplayerPowerLimit,
    playerSlots: [],
    teams: userTeams.length > 0 ? userTeams : (Array.isArray(data.teams) ? data.teams as MultiplayerTeam[] : []),
    botTeams: botTeams.length > 0 ? botTeams : (Array.isArray(data.botTeams) ? data.botTeams as MultiplayerTeam[] : []),
    realTeams: Array.isArray(data.realTeams) ? data.realTeams as MultiplayerLeague['realTeams'] : [],
    replacedTeams: Array.isArray(data.replacedTeams) ? data.replacedTeams as MultiplayerLeague['replacedTeams'] : [],
    fixtures: fixtureRounds.length > 0 ? fixtureRounds : fallbackFixtures,
    standings: standingRows.length > 0 ? standingRows : (Array.isArray(data.standings) ? data.standings as MultiplayerStandingRow[] : []),
    status: data.status === 'active' || data.status === 'completed' || data.status === 'deleted' ? data.status : 'waiting',
    currentWeek: Number(data.currentWeek ?? 0),
    latestFixtureId: typeof data.latestFixtureId === 'string' ? data.latestFixtureId : null,
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : null,
    startVersion: typeof data.startVersion === 'number' ? data.startVersion : null,
    advancingWeek: typeof data.advancingWeek === 'number' ? data.advancingWeek : null,
    advancingBy: typeof data.advancingBy === 'string' ? data.advancingBy : null,
    advanceStartedAt: typeof data.advanceStartedAt === 'string' ? data.advanceStartedAt : null,
    advanceVersion: typeof data.advanceVersion === 'number' ? data.advanceVersion : null,
    deletedAt: typeof data.deletedAt === 'string' ? data.deletedAt : null,
    deletedBy: typeof data.deletedBy === 'string' ? data.deletedBy : null,
    matchReports: matchReports.length > 0 ? matchReports : (Array.isArray(data.matchReports) ? data.matchReports as MultiplayerMatchReport[] : []),
    weekProgress,
    createdAt: String(data.createdAt ?? now()),
    updatedAt: String(data.updatedAt ?? now()),
  };
};

const loadOnlineLeague = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDoc(leagueRef(db, leagueId));
  if (!snapshot.exists()) throw new Error('Lig bulunamadi.');
  return hydrateLeague(db, snapshot.id, snapshot.data());
};

const commitBatchedWrites = async (
  db: Firestore,
  writes: ((batch: ReturnType<typeof writeBatch>) => void)[],
) => {
  const chunkSize = 450;
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = writeBatch(db);
    writes.slice(index, index + chunkSize).forEach((write) => write(batch));
    await batch.commit();
  }
};

const persistLeagueSubcollections = async (db: Firestore, league: MultiplayerLeague) => {
  const fixtureDocs = toFirestoreFixtureDocs(league.fixtures, league.updatedAt);
  const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  [...league.teams, ...league.botTeams].forEach((team) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'teams', team.id), clean(team)));
  });
  fixtureDocs.forEach((fixture) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'fixtures', fixture.id), clean(fixture)));
  });
  league.standings.forEach((row) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'standings', row.teamId), clean({
      ...row,
      updatedAt: league.updatedAt,
    })));
  });
  league.matchReports.forEach((report) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'matchReports', report.fixtureId), clean(report)));
  });
  (league.weekProgress ?? []).forEach((progress) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'weekProgress', progress.id), clean(progress)));
  });
  await commitBatchedWrites(db, writes);
};

const saveLeagueDoc = async (db: Firestore, league: MultiplayerLeague, memberIds?: string[]) => {
  const nextLeague = {
    ...league,
    updatedAt: now(),
  };
  await persistLeagueSubcollections(db, nextLeague);
  await setDoc(leagueRef(db, league.id), toFirestoreLeagueDoc(nextLeague, memberIds), { merge: true });
  return nextLeague;
};

export const createLeague = async ({
  name,
  maxUsers,
  powerLimit,
  competitionId = DEFAULT_COMPETITION_ID,
}: {
  name: string;
  ownerId: string;
  maxUsers: MultiplayerMaxUsers;
  powerLimit: MultiplayerPowerLimit;
  competitionId?: string;
}) => {
  const { db, user } = await getFirebaseOrThrow();
  const createdAt = now();
  const ref = doc(collection(db, 'leagues'));
  const league: MultiplayerLeague = {
    version: 1,
    id: ref.id,
    mode: 'invite',
    name: name.trim().slice(0, 36) || 'Canli11 Davetli Lig',
    ownerId: user.uid,
    inviteCode: createInviteCode(),
    competitionId,
    maxUsers: clampLeagueTeamCount(maxUsers),
    powerLimit,
    playerSlots: [],
    teams: [],
    botTeams: [],
    realTeams: [],
    replacedTeams: [],
    fixtures: [],
    standings: [],
    status: 'waiting',
    currentWeek: 0,
    latestFixtureId: null,
    matchReports: [],
    weekProgress: [],
    createdAt,
    updatedAt: createdAt,
  };

  await setDoc(ref, toFirestoreLeagueDoc(league, [user.uid]));
  await setDoc(doc(db, 'users', user.uid), clean({
    id: user.uid,
    anonymous: true,
    updatedAt: createdAt,
  }), { merge: true });
  return league;
};

export const joinLeague = async (inviteCode: string) => {
  const { db, user } = await getFirebaseOrThrow();
  const code = normalizeInviteCode(inviteCode);
  const snapshot = await getDocs(query(
    collection(db, 'leagues'),
    where('inviteCode', '==', code),
    where('status', '==', 'waiting'),
    limit(1),
  ));
  if (snapshot.empty) throw new Error('Lig bulunamadi.');

  const target = snapshot.docs[0];
  const data = target.data();
  const league = await hydrateLeague(db, target.id, data);
  if (league.teams.length >= league.maxUsers && !league.teams.some((team) => team.ownerId === user.uid)) {
    throw new Error('Lig dolu.');
  }

  await updateDoc(target.ref, {
    memberIds: arrayUnion(user.uid),
    updatedAt: now(),
  });
  return loadOnlineLeague(db, target.id);
};

export const saveTeamToLeague = async (
  leagueId: string,
  input: MultiplayerTeamInput,
) => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.status !== 'waiting') throw new Error('Sezon basladiktan sonra takim degistirilemez.');

  const cap = getPowerLimitCap(league.powerLimit);
  if (cap && input.rating > cap) throw new Error(`Takim ortalamasi ${cap} limitini asiyor.`);
  const otherUserTeams = league.teams.filter((team) => team.ownerId !== user.uid);
  if (otherUserTeams.length >= league.maxUsers) throw new Error('Lig dolu.');
  if (input.startingXI.length !== 11) throw new Error('Ilk 11 tamamlanmadi.');
  if (input.substitutes.length !== 7) throw new Error('7 yedek secilmeli.');
  if (!input.captainId || !input.startingXI.includes(input.captainId)) {
    throw new Error('Kaptan ilk 11 icinden secilmeli.');
  }

  const createdAt = league.teams.find((team) => team.ownerId === user.uid)?.createdAt ?? now();
  const team: MultiplayerTeam = {
    id: `team-${user.uid}`,
    ownerId: user.uid,
    teamName: input.teamName.trim().slice(0, 32) || 'Canli11 FC',
    formation: input.formation,
    tactic: input.tactic,
    captainId: input.captainId,
    startingXI: input.startingXI.slice(0, 11),
    substitutes: input.substitutes.slice(0, 7),
    reserves: input.reserves?.slice(0, 5) ?? [],
    rating: Math.round(input.rating),
    chemistry: Math.round(input.chemistry),
    isBot: false,
    createdAt,
    updatedAt: now(),
  };

  await setDoc(doc(db, 'leagues', league.id, 'teams', team.id), clean(team));
  const nextTeams = (await readTeams(db, league.id))
    .filter((item) => item.ownerId !== user.uid)
    .concat(team)
    .filter((item) => !item.isBot);
  const nextLeague = {
    ...league,
    teams: nextTeams,
    standings: createStandingRows(nextTeams.map((item) => item.id), nextTeams, league.fixtures),
    updatedAt: now(),
  };
  await setDoc(leagueRef(db, league.id), toFirestoreLeagueDoc(nextLeague), { merge: true });
  await updateDoc(leagueRef(db, league.id), {
    memberIds: arrayUnion(user.uid),
    updatedAt: nextLeague.updatedAt,
  });
  return nextLeague;
};

export const startLeague = async (
  leagueId: string,
  dataset = getSeasonDataset(),
) => {
  try {
    const { db, user } = await getFirebaseOrThrow();
    const league = await loadOnlineLeague(db, leagueId);
    if (league.ownerId !== user.uid) throw new Error('Sezonu sadece lig sahibi baslatabilir.');
    if (!isStartableStatus(league.status)) throw new Error('Lig zaten baslatildi.');
    const userTeams = getInviteUserTeams(league);
    if (userTeams.length === 0) throw new Error('En az bir kullanici takimi gerekli.');
    if (userTeams.length < league.maxUsers) {
      throw new Error(`Sezonu baslatmak icin ${league.maxUsers} kullanici takimi gerekli.`);
    }
    if (userTeams.length > INVITE_LEAGUE_TOTAL_TEAMS) throw new Error('18 takimdan fazla kullanici takimi olamaz.');

    const neededRealTeams = Math.max(0, INVITE_LEAGUE_TOTAL_TEAMS - userTeams.length);
    const plan = getRealTeamReplacementPlan(userTeams.length, dataset, league.competitionId ?? DEFAULT_COMPETITION_ID);
    const botTeams = createRealLeagueTeams(plan.realTeams.slice(0, neededRealTeams), dataset, league.id);
    const allTeams = [...userTeams, ...botTeams].slice(0, INVITE_LEAGUE_TOTAL_TEAMS);
    if (allTeams.length !== INVITE_LEAGUE_TOTAL_TEAMS) throw new Error('18 takimlik lig havuzu olusturulamadi.');
    const teamIds = allTeams.map((team) => team.id);
    const fixtures = generateRoundRobin(teamIds, true);
    const startedAt = now();
    const nextLeague: MultiplayerLeague = {
      ...league,
      teams: userTeams,
      botTeams,
      realTeams: plan.realTeams.slice(0, neededRealTeams),
      replacedTeams: plan.replacedTeams,
      fixtures,
      standings: createStandingRows(teamIds, allTeams, fixtures),
      status: 'active',
      currentWeek: 0,
      latestFixtureId: null,
      matchReports: [],
      weekProgress: [],
      startedAt,
      startVersion: Date.now(),
    };

    const saved = await saveLeagueDoc(db, nextLeague, [user.uid, ...userTeams.map((team) => team.ownerId)]);
    await updateDoc(leagueRef(db, league.id), {
      memberIds: arrayUnion(...userTeams.map((team) => team.ownerId), user.uid),
    });
    return saved;
  } catch (error) {
    console.error('START_LEAGUE_FAILED', error);
    throw error;
  }
};

const buildWeekReports = (
  week: number,
  playedRound: CompetitionFixture[],
  playedAt: string,
): MultiplayerMatchReport[] => playedRound
  .filter((fixture): fixture is CompetitionFixture & { result: MatchResult } => Boolean(fixture.result))
  .map((fixture) => ({
    fixtureId: fixture.id,
    week,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    result: fixture.result,
    playedAt,
  }));

const claimWeekAction = async (
  db: Firestore,
  league: MultiplayerLeague,
  userId: string,
) => runTransaction(db, async (transaction) => {
  const ref = leagueRef(db, league.id);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists()) throw new Error('Lig bulunamadi.');
  const data = snapshot.data();
  if (data.ownerId !== userId) throw new Error('Haftayi sadece lig sahibi ilerletebilir.');
  if (data.status !== 'active') throw new Error('Lig aktif degil.');
  const firestoreWeek = Number(data.currentWeek ?? 0);
  if (firestoreWeek !== league.currentWeek) throw new Error('Hafta baska bir cihazda zaten ilerletildi.');
  const claimedWeek = typeof data.advancingWeek === 'number' ? data.advancingWeek : null;
  const claimStartedAt = typeof data.advanceStartedAt === 'string' ? Date.parse(data.advanceStartedAt) : 0;
  const claimIsFresh = claimedWeek === firestoreWeek && Date.now() - claimStartedAt < 60_000;
  if (claimIsFresh) throw new Error('Hafta ilerletme islemi zaten devam ediyor.');
  const advanceVersion = Number(data.advanceVersion ?? 0) + 1;
  transaction.update(ref, {
    advancingWeek: firestoreWeek,
    advancingBy: userId,
    advanceStartedAt: now(),
    advanceVersion,
    updatedAt: now(),
  });
  return advanceVersion;
});

const releaseWeekAction = async (db: Firestore, leagueId: string) => {
  await updateDoc(leagueRef(db, leagueId), {
    advancingWeek: null,
    advancingBy: null,
    advanceStartedAt: null,
    updatedAt: now(),
  });
};

const persistGeneratedWeek = async (
  db: Firestore,
  league: MultiplayerLeague,
  playedRound: CompetitionFixture[],
  progressEntries: WeekUserProgress[],
) => {
  const updatedAt = now();
  const week = league.currentWeek + 1;
  const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
  playedRound.forEach((fixture) => {
    writes.push((batch) => batch.set(
      doc(db, 'leagues', league.id, 'fixtures', fixture.id),
      clean({ ...fixture, week, updatedAt }),
    ));
  });
  progressEntries.forEach((progress) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'weekProgress', progress.id), clean(progress)));
  });
  await commitBatchedWrites(db, writes);
  const nextLeague = {
    ...league,
    updatedAt,
    advancingWeek: null,
    advancingBy: null,
    advanceStartedAt: null,
  };
  await setDoc(leagueRef(db, league.id), toFirestoreLeagueDoc(nextLeague), { merge: true });
  return nextLeague;
};

const persistAdvancedWeek = async (
  db: Firestore,
  league: MultiplayerLeague,
  currentRound: CompetitionFixture[],
) => {
  const updatedAt = now();
  const currentFixtureIds = new Set(currentRound.map((fixture) => fixture.id));
  const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
  league.standings.forEach((row) => {
    writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'standings', row.teamId), clean({ ...row, updatedAt })));
  });
  league.matchReports
    .filter((report) => currentFixtureIds.has(report.fixtureId))
    .forEach((report) => {
      writes.push((batch) => batch.set(doc(db, 'leagues', league.id, 'matchReports', report.fixtureId), clean(report)));
    });
  await commitBatchedWrites(db, writes);
  const nextLeague = {
    ...league,
    updatedAt,
    advancingWeek: null,
    advancingBy: null,
    advanceStartedAt: null,
  };
  await setDoc(leagueRef(db, league.id), toFirestoreLeagueDoc(nextLeague), { merge: true });
  return nextLeague;
};

export const simulateWeek = async (
  leagueId: string,
  dataset = getSeasonDataset(),
  expectedCurrentWeek?: number,
): Promise<SimulateWeekResult> => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Haftayi sadece lig sahibi simule edebilir.');
  if (league.status !== 'active') throw new Error('Lig aktif degil.');
  if (typeof expectedCurrentWeek === 'number' && league.currentWeek !== expectedCurrentWeek) {
    throw new Error('Bu hafta baska bir cihazda zaten ilerletildi.');
  }
  const advanceVersion = await claimWeekAction(db, league, user.uid);

  try {
    const currentRound = league.fixtures[league.currentWeek] ?? [];
    if (currentRound.length === 0) {
      const completed = await saveLeagueDoc(db, {
        ...league,
        status: 'completed',
        currentWeek: Math.min(league.currentWeek, league.fixtures.length),
        advanceVersion,
        advancingWeek: null,
        advancingBy: null,
        advanceStartedAt: null,
      });
      return { league: completed, playedRound: [] };
    }

    const inviteWeekGenerated = currentRound.some((fixture) => Boolean(fixture.result));
    if (inviteWeekGenerated) {
      const missingProgress = getMissingWeekProgressEntries(league);
      if (missingProgress.length > 0) {
        const repairWrites = missingProgress.map((progress) => (
          (batch: ReturnType<typeof writeBatch>) => batch.set(
            doc(db, 'leagues', league.id, 'weekProgress', progress.id),
            clean(progress),
          )
        ));
        await commitBatchedWrites(db, repairWrites);
      }
      const repairedLeague = missingProgress.length > 0
        ? { ...league, weekProgress: [...(league.weekProgress ?? []), ...missingProgress] }
        : league;
      if (!isWeekReadyToAdvance(repairedLeague, repairedLeague.currentWeek)) {
        throw new Error('Bu haftadaki kullanici maclari tamamlanmadi veya progress kaydi eksik.');
      }
      const allTeams = [...repairedLeague.teams, ...repairedLeague.botTeams];
      const nextWeek = repairedLeague.currentWeek + 1;
      const playedAt = now();
      const nextLeague: MultiplayerLeague = {
        ...repairedLeague,
        currentWeek: nextWeek,
        latestFixtureId: currentRound.find((fixture) => fixture.result)?.id ?? league.latestFixtureId,
        matchReports: [
          ...repairedLeague.matchReports.filter((report) => !currentRound.some((fixture) => fixture.id === report.fixtureId)),
          ...buildWeekReports(repairedLeague.currentWeek + 1, currentRound, playedAt),
        ],
        standings: createStandingRows(allTeams.map((team) => team.id), allTeams, repairedLeague.fixtures),
        status: nextWeek >= repairedLeague.fixtures.length ? 'completed' : repairedLeague.status,
      };
      const saved = await persistAdvancedWeek(db, {
        ...nextLeague,
        advanceVersion,
      }, currentRound);
      return { league: saved, playedRound: currentRound };
    }

    const playerById = getPlayerMap(dataset);
    const matchTeams = new Map(
      [...league.teams, ...league.botTeams].map((team) => [team.id, toCompetitionTeam(team, playerById)] as const),
    );
    const playedRound = currentRound.map((fixture) => {
      if (fixture.result) return fixture;
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

    const nextFixtures = league.fixtures.map((round, index) => (
      index === league.currentWeek ? playedRound : round
    ));

    const progressEntries = createWeekProgressEntries(league, playedRound);
    const generatedLeague: MultiplayerLeague = {
      ...league,
      fixtures: nextFixtures,
      latestFixtureId: null,
      weekProgress: [
        ...(league.weekProgress ?? []).filter((progress) => progress.week !== league.currentWeek + 1),
        ...progressEntries,
      ],
      advanceVersion,
    };
    const generated = await persistGeneratedWeek(db, generatedLeague, playedRound, progressEntries);
    return { league: generated, playedRound };
  } catch (error) {
    await releaseWeekAction(db, leagueId).catch(() => undefined);
    throw error;
  }
};

export const getStandings = async (leagueId: string) => {
  const { db } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  return league.standings.length > 0 ? league.standings : createStandingRows(
    [...league.teams, ...league.botTeams].map((team) => team.id),
    [...league.teams, ...league.botTeams],
    league.fixtures,
  );
};

export const updateWeekUserProgress = async (
  leagueId: string,
  status: WeekUserProgressStatus,
) => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  const progress = (league.weekProgress ?? [])
    .filter((item) => item.week === league.currentWeek + 1)
    .find((item) => item.userId === user.uid);
  if (!progress) throw new Error('Bu hafta icin kullanici maci bulunamadi.');
  const timestamp = now();
  const nextProgress: WeekUserProgress = {
    ...progress,
    status,
    startedAt: progress.startedAt ?? timestamp,
    completedAt: status === 'completed' || status === 'skipped' ? timestamp : progress.completedAt,
    skippedAt: status === 'skipped' ? timestamp : progress.skippedAt ?? null,
  };
  await setDoc(doc(db, 'leagues', leagueId, 'weekProgress', progress.id), clean(nextProgress), { merge: true });
  await updateDoc(leagueRef(db, leagueId), { updatedAt: timestamp });
  return {
    ...league,
    weekProgress: (league.weekProgress ?? []).map((item) => (item.id === progress.id ? nextProgress : item)),
    updatedAt: timestamp,
  };
};

export const repairCurrentWeekProgress = async (leagueId: string) => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Haftayi sadece lig sahibi onarabilir.');
  if (league.status !== 'active') throw new Error('Lig aktif degil.');
  const missing = getMissingWeekProgressEntries(league);
  if (missing.length === 0) return league;
  const writes = missing.map((progress) => (
    (batch: ReturnType<typeof writeBatch>) => batch.set(
      doc(db, 'leagues', leagueId, 'weekProgress', progress.id),
      clean(progress),
    )
  ));
  await commitBatchedWrites(db, writes);
  const updatedAt = now();
  await updateDoc(leagueRef(db, leagueId), { updatedAt });
  return {
    ...league,
    weekProgress: [...(league.weekProgress ?? []), ...missing],
    updatedAt,
  };
};

export const forceAdvanceCurrentWeek = async (
  leagueId: string,
  dataset = getSeasonDataset(),
  expectedCurrentWeek?: number,
) => {
  const { db, user } = await getFirebaseOrThrow();
  let league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Haftayi sadece lig sahibi ilerletebilir.');
  if (league.status !== 'active') throw new Error('Lig aktif degil.');
  if (typeof expectedCurrentWeek === 'number' && league.currentWeek !== expectedCurrentWeek) {
    throw new Error('Bu hafta baska bir cihazda zaten ilerletildi.');
  }
  const currentRound = league.fixtures[league.currentWeek] ?? [];
  if (!currentRound.some((fixture) => Boolean(fixture.result))) {
    league = (await simulateWeek(leagueId, dataset, league.currentWeek)).league;
  }
  league = await repairCurrentWeekProgress(leagueId);
  const week = league.currentWeek + 1;
  const timestamp = now();
  const currentProgress = (league.weekProgress ?? []).filter((progress) => progress.week === week);
  const nextProgress = currentProgress.map((progress): WeekUserProgress => (
    progress.status === 'completed' || progress.status === 'skipped'
      ? progress
      : {
        ...progress,
        status: 'skipped',
        startedAt: progress.startedAt ?? timestamp,
        completedAt: timestamp,
        skippedAt: timestamp,
      }
  ));
  const writes = nextProgress.map((progress) => (
    (batch: ReturnType<typeof writeBatch>) => batch.set(
      doc(db, 'leagues', leagueId, 'weekProgress', progress.id),
      clean(progress),
    )
  ));
  await commitBatchedWrites(db, writes);
  await updateDoc(leagueRef(db, leagueId), { updatedAt: timestamp });
  return simulateWeek(leagueId, dataset, league.currentWeek);
};

export const softDeleteLeague = async (leagueId: string) => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Ligi sadece sahibi silebilir.');
  const deletedAt = now();
  await updateDoc(leagueRef(db, leagueId), {
    status: 'deleted',
    deletedAt,
    deletedBy: user.uid,
    updatedAt: deletedAt,
  });
  return {
    ...league,
    status: 'deleted' as const,
    deletedAt,
    deletedBy: user.uid,
    updatedAt: deletedAt,
  };
};

export const subscribeOnlineLeagues = (
  userId: string,
  callback: (leagues: MultiplayerLeague[]) => void,
  onError?: (error: unknown) => void,
) => {
  const client = getFirebaseClient();
  if (!client || !isFirebaseConfigured()) return () => undefined;

  const q = query(collection(client.db, 'leagues'), where('memberIds', 'array-contains', userId));
  const leagueDocs = new Map<string, Record<string, unknown>>();
  const subcollectionUnsubscribers = new Map<string, Unsubscribe[]>();
  let disposed = false;
  let emitVersion = 0;

  const emitLeagues = async () => {
    const version = emitVersion + 1;
    emitVersion = version;
    try {
      const leagues = await Promise.all(
        [...leagueDocs.entries()].map(([leagueId, data]) => hydrateLeague(client.db, leagueId, data)),
      );
      if (!disposed && version === emitVersion) {
        callback(leagues
          .filter((league) => league.status !== 'deleted' && !league.deletedAt)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      }
    } catch (error) {
      onError?.(error);
    }
  };

  const watchLeagueSubcollections = (leagueId: string) => {
    if (subcollectionUnsubscribers.has(leagueId)) return;
    const subcollections = ['teams', 'fixtures', 'standings', 'matchReports', 'weekProgress'];
    const unsubscribers = subcollections.map((name) => onSnapshot(
      collection(client.db, 'leagues', leagueId, name),
      () => {
        void emitLeagues();
      },
      onError,
    ));
    subcollectionUnsubscribers.set(leagueId, unsubscribers);
  };

  const unsubscribeMain = onSnapshot(q, (snapshot) => {
    const visibleDocs = snapshot.docs.filter((item) => item.data().status !== 'deleted' && !item.data().deletedAt);
    const activeLeagueIds = new Set(visibleDocs.map((item) => item.id));

    [...subcollectionUnsubscribers.entries()].forEach(([leagueId, unsubscribers]) => {
      if (activeLeagueIds.has(leagueId)) return;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      subcollectionUnsubscribers.delete(leagueId);
      leagueDocs.delete(leagueId);
    });

    visibleDocs.forEach((item) => {
      leagueDocs.set(item.id, item.data());
      watchLeagueSubcollections(item.id);
    });

    void emitLeagues();
  }, onError);

  return () => {
    disposed = true;
    unsubscribeMain();
    subcollectionUnsubscribers.forEach((unsubscribers) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
    subcollectionUnsubscribers.clear();
    leagueDocs.clear();
  };
};
