import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
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
  type MultiplayerLeague,
  type MultiplayerMatchReport,
  type MultiplayerMaxUsers,
  type MultiplayerPowerLimit,
  type MultiplayerStandingRow,
  type MultiplayerTeam,
  type MultiplayerTeamInput,
  type SimulateWeekResult,
} from './multiplayerService';
import type { Player, SeasonDataset } from '@/types';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => new Date().toISOString();

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
      chemistry: 72,
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

const hydrateLeague = async (db: Firestore, leagueId: string, data: Record<string, unknown>): Promise<MultiplayerLeague> => {
  const teams = await readTeams(db, leagueId);
  const userTeams = teams.filter((team) => !team.isBot);
  const botTeams = teams.filter((team) => team.isBot);
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
    fixtures: Array.isArray(data.fixtures) ? data.fixtures as CompetitionFixture[][] : [],
    standings: Array.isArray(data.standings) ? data.standings as MultiplayerStandingRow[] : [],
    status: data.status === 'active' || data.status === 'completed' ? data.status : 'waiting',
    currentWeek: Number(data.currentWeek ?? 0),
    latestFixtureId: typeof data.latestFixtureId === 'string' ? data.latestFixtureId : null,
    matchReports: Array.isArray(data.matchReports) ? data.matchReports as MultiplayerMatchReport[] : [],
    createdAt: String(data.createdAt ?? now()),
    updatedAt: String(data.updatedAt ?? now()),
  };
};

const loadOnlineLeague = async (db: Firestore, leagueId: string) => {
  const snapshot = await getDoc(leagueRef(db, leagueId));
  if (!snapshot.exists()) throw new Error('Lig bulunamadi.');
  return hydrateLeague(db, snapshot.id, snapshot.data());
};

const persistLeagueSubcollections = async (db: Firestore, league: MultiplayerLeague) => {
  const batch = writeBatch(db);
  [...league.teams, ...league.botTeams].forEach((team) => {
    batch.set(doc(db, 'leagues', league.id, 'teams', team.id), clean(team));
  });
  league.fixtures.forEach((round, index) => {
    batch.set(doc(db, 'leagues', league.id, 'fixtures', `week-${index + 1}`), clean({
      week: index + 1,
      fixtures: round,
      updatedAt: league.updatedAt,
    }));
  });
  league.standings.forEach((row) => {
    batch.set(doc(db, 'leagues', league.id, 'standings', row.teamId), clean({
      ...row,
      updatedAt: league.updatedAt,
    }));
  });
  league.matchReports.forEach((report) => {
    batch.set(doc(db, 'leagues', league.id, 'matchReports', report.fixtureId), clean(report));
  });
  await batch.commit();
};

const saveLeagueDoc = async (db: Firestore, league: MultiplayerLeague, memberIds?: string[]) => {
  const nextLeague = {
    ...league,
    updatedAt: now(),
  };
  await setDoc(leagueRef(db, league.id), clean({
    ...nextLeague,
    ...(memberIds ? { memberIds } : {}),
  }), { merge: true });
  await persistLeagueSubcollections(db, nextLeague);
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
    createdAt,
    updatedAt: createdAt,
  };

  await setDoc(ref, clean({
    ...league,
    memberIds: [user.uid],
  }));
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
  const teams = Array.isArray(data.teams) ? data.teams as MultiplayerTeam[] : [];
  const maxUsers = Number(data.maxUsers ?? 8) as MultiplayerMaxUsers;
  if (teams.length >= maxUsers && !teams.some((team) => team.ownerId === user.uid)) {
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
  await setDoc(leagueRef(db, league.id), clean(nextLeague), { merge: true });
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
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Sezonu sadece lig sahibi baslatabilir.');
  if (league.status !== 'waiting') throw new Error('Lig zaten baslatildi.');
  if (league.teams.length === 0) throw new Error('En az bir kullanici takimi gerekli.');

  const neededRealTeams = Math.max(0, league.maxUsers - league.teams.length);
  const plan = getRealTeamReplacementPlan(league.teams.length, dataset, league.competitionId ?? DEFAULT_COMPETITION_ID);
  const botTeams = createRealLeagueTeams(plan.realTeams.slice(0, neededRealTeams), dataset, league.id);
  const allTeams = [...league.teams, ...botTeams].slice(0, league.maxUsers);
  const teamIds = allTeams.map((team) => team.id);
  const fixtures = generateRoundRobin(teamIds, true);
  const nextLeague: MultiplayerLeague = {
    ...league,
    botTeams,
    realTeams: plan.realTeams.slice(0, neededRealTeams),
    replacedTeams: plan.replacedTeams,
    fixtures,
    standings: createStandingRows(teamIds, allTeams, fixtures),
    status: 'active',
    currentWeek: 0,
    latestFixtureId: null,
    matchReports: [],
  };

  const saved = await saveLeagueDoc(db, nextLeague, [user.uid, ...league.teams.map((team) => team.ownerId)]);
  await updateDoc(leagueRef(db, league.id), {
    memberIds: arrayUnion(...league.teams.map((team) => team.ownerId), user.uid),
  });
  return saved;
};

export const simulateWeek = async (
  leagueId: string,
  dataset = getSeasonDataset(),
): Promise<SimulateWeekResult> => {
  const { db, user } = await getFirebaseOrThrow();
  const league = await loadOnlineLeague(db, leagueId);
  if (league.ownerId !== user.uid) throw new Error('Haftayi sadece lig sahibi simule edebilir.');
  if (league.status !== 'active') throw new Error('Lig aktif degil.');

  const currentRound = league.fixtures[league.currentWeek] ?? [];
  if (currentRound.length === 0) {
    const completed = await saveLeagueDoc(db, { ...league, status: 'completed' });
    return { league: completed, playedRound: [] };
  }

  const playerById = getPlayerMap(dataset);
  const matchTeams = new Map(
    [...league.teams, ...league.botTeams].map((team) => [team.id, toCompetitionTeam(team, playerById)] as const),
  );
  const playedAt = now();
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
  const allTeams = [...league.teams, ...league.botTeams];
  const nextWeek = league.currentWeek + 1;
  const matchReports = [
    ...league.matchReports.filter((report) => !playedRound.some((fixture) => fixture.id === report.fixtureId)),
    ...playedRound
      .filter((fixture): fixture is CompetitionFixture & { result: MatchResult } => Boolean(fixture.result))
      .map((fixture) => ({
        fixtureId: fixture.id,
        week: league.currentWeek + 1,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        result: fixture.result,
        playedAt,
      })),
  ];

  const nextLeague: MultiplayerLeague = {
    ...league,
    fixtures: nextFixtures,
    currentWeek: nextWeek,
    latestFixtureId: playedRound.find((fixture) => fixture.result)?.id ?? league.latestFixtureId,
    matchReports,
    standings: createStandingRows(allTeams.map((team) => team.id), allTeams, nextFixtures),
    status: nextWeek >= league.fixtures.length ? 'completed' : league.status,
  };

  const saved = await saveLeagueDoc(db, nextLeague);
  return { league: saved, playedRound };
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

export const subscribeOnlineLeagues = (
  userId: string,
  callback: (leagues: MultiplayerLeague[]) => void,
  onError?: (error: unknown) => void,
) => {
  const client = getFirebaseClient();
  if (!client || !isFirebaseConfigured()) return () => undefined;

  const q = query(collection(client.db, 'leagues'), where('memberIds', 'array-contains', userId));
  return onSnapshot(q, async (snapshot) => {
    try {
      const leagues = await Promise.all(
        snapshot.docs.map((item) => hydrateLeague(client.db, item.id, item.data())),
      );
      callback(leagues.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (error) {
      onError?.(error);
    }
  }, onError);
};
