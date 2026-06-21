import type { CompetitionFixture, MatchResult } from './competitionEngine';
import type { FootballPosition, Player, PlayerAttributes, Position, SeasonTeam } from '@/types';
import {
  calculateRealisticMarketValue,
  getPlayerDataProfile,
} from './playerDataQuality';

export type CareerTeamPool = 'super-lig' | 'world-cup' | 'europe';
export type CareerCompetitionStatus = 'active' | 'eliminated' | 'won' | 'not-qualified';
export type CareerLoanStatus = 'owned' | 'loanedIn' | 'loanedOut';

export interface CareerClubProfile {
  teamId: string;
  teamName: string;
  pool: CareerTeamPool;
  strength: number;
  prestige: number;
  budget: number;
  transferBudget: number;
  wageBudget: number;
  boardExpectation: string;
  fanExpectation: string;
}

export interface CareerPlayerState {
  playerId: string;
  teamId: string;
  name: string;
  number: number;
  position: Position;
  primaryPosition?: FootballPosition;
  secondaryPositions: FootballPosition[];
  attributes: PlayerAttributes;
  age: number;
  potential: number;
  rating: number;
  form: number;
  marketValue: number;
  wage: number;
  loanStatus: CareerLoanStatus;
}

export interface CareerFacilities {
  training: number;
  youth: number;
  medical: number;
  scouting: number;
}

export interface CareerHistoryEntry {
  season: number;
  teamName: string;
  leaguePosition: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  trophies: string[];
  bestPlayerName: string;
  topScorerName: string;
  topScorerGoals: number;
  careerPointsGained: number;
  boardGrade: string;
  fanGrade: string;
  note: string;
}

export interface CareerOffer {
  id: string;
  teamId: string;
  teamName: string;
  prestige: number;
  transferBudget: number;
  boardExpectation: string;
}

export interface CareerTransferListing {
  player: CareerPlayerState;
  askingPrice: number;
  loanFee: number;
  listedAt: string;
}

export interface CareerSideMatch {
  id: string;
  competition: 'cup' | 'europe';
  roundLabel: string;
  opponentName: string;
  result: MatchResult;
}

export interface CareerSave {
  version: 1;
  userId?: string;
  managerName: string;
  careerPoints: number;
  season: number;
  currentWeek: number;
  club: CareerClubProfile;
  facilities: CareerFacilities;
  fanHappiness: number;
  boardConfidence: number;
  warningLevel: number;
  teamIds: string[];
  roster: CareerPlayerState[];
  youthAcademy: CareerPlayerState[];
  fixtures: CompetitionFixture[][];
  latestFixtureId: string | null;
  latestSideMatches: CareerSideMatch[];
  cupStatus: CareerCompetitionStatus;
  europeStatus: CareerCompetitionStatus;
  trophies: string[];
  totalWins: number;
  totalGoals: number;
  history: CareerHistoryEntry[];
  seasonSummary: CareerHistoryEntry | null;
  offers: CareerOffer[];
  transferMarket: CareerTransferListing[];
  createdAt: string;
  updatedAt: string;
}

export const CAREER_STORAGE_KEY = 'canli11:career-mode:v1';

const now = () => new Date().toISOString();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundMoney = (value: number) => Math.round(value / 50_000) * 50_000;

export const getManagerLevel = (careerPoints: number) => {
  if (careerPoints >= 1600) return 'Efsane Teknik Direktör';
  if (careerPoints >= 900) return 'Elit Teknik Direktör';
  if (careerPoints >= 420) return 'Profesyonel Teknik Direktör';
  if (careerPoints >= 160) return 'Bölgesel Teknik Direktör';
  return 'Acemi Teknik Direktör';
};

export const derivePlayerAge = (playerId: string, rating: number) => {
  const profile = getPlayerDataProfile({
    id: playerId,
    name: playerId,
    rating,
    form: 0,
  });
  return profile.age;
};

export const derivePotential = (playerId: string, rating: number, age: number) => {
  const profile = getPlayerDataProfile({
    id: playerId,
    name: playerId,
    rating,
    form: 0,
  });
  return Math.max(rating, profile.potential - Math.max(0, profile.age - age));
};

export const calculateCareerMarketValue = (rating: number, age: number, potential: number, form: number) => {
  return calculateRealisticMarketValue({ rating, age, potential, form });
};

export const createCareerPlayerState = (player: Player, teamId = player.teamId ?? 'career-team'): CareerPlayerState => {
  const rating = clamp(player.overall_rating, 45, 99);
  const dataProfile = getPlayerDataProfile(player);
  const age = dataProfile.age;
  const potential = dataProfile.potential;
  const form = clamp(player.form ?? 0, -10, 10);
  const attributes = player.attributes ?? {
    attack: rating,
    defense: rating,
    passing: rating,
    pace: rating,
    shooting: rating,
    dribbling: rating,
    goalkeeping: player.position === 'KL' ? rating : 25,
  };

  return {
    playerId: player.id,
    teamId,
    name: player.name,
    number: player.jersey_number,
    position: player.position,
    primaryPosition: player.primaryPosition,
    secondaryPositions: player.secondaryPositions ?? [],
    attributes,
    age,
    potential,
    rating,
    form,
    marketValue: dataProfile.marketValue,
    wage: roundMoney(Math.max(250_000, rating ** 2 * 2_100)),
    loanStatus: 'owned',
  };
};

export const createClubProfile = (
  team: Pick<SeasonTeam, 'id' | 'name'>,
  pool: CareerTeamPool,
  strength: number,
): CareerClubProfile => {
  const prestige = clamp(Math.round(strength + 4), 45, 99);
  const transferBudget = roundMoney(clamp((104 - prestige) * 1_450_000 + 18_000_000, 20_000_000, 105_000_000));
  const budget = roundMoney(transferBudget + prestige * 1_350_000);
  const wageBudget = roundMoney(prestige * 1_050_000);
  const boardExpectation = prestige >= 88
    ? 'Şampiyonluk yarışı ve Avrupa başarısı'
    : prestige >= 80
      ? 'İlk 4, kupa iddiası'
      : prestige >= 72
        ? 'Üst sıra ve istikrarlı gelişim'
        : 'Ligde kal, genç oyuncu geliştir';
  const fanExpectation = prestige >= 86
    ? 'Her maçta baskın futbol ve kupa'
    : prestige >= 76
      ? 'Avrupa yarışı ve derbi galibiyetleri'
      : 'Mücadeleci futbol ve güvenli sezon';

  return {
    teamId: team.id,
    teamName: team.name,
    pool,
    strength,
    prestige,
    budget,
    transferBudget,
    wageBudget,
    boardExpectation,
    fanExpectation,
  };
};

export const createInitialCareerSave = ({
  managerName,
  club,
  teamIds,
  roster,
  fixtures,
}: {
  managerName: string;
  club: CareerClubProfile;
  teamIds: string[];
  roster: CareerPlayerState[];
  fixtures: CompetitionFixture[][];
}): CareerSave => ({
  version: 1,
  managerName: managerName.trim().slice(0, 24) || 'Canlı11 Menajeri',
  careerPoints: 0,
  season: 1,
  currentWeek: 0,
  club,
  facilities: {
    training: 1,
    youth: 1,
    medical: 1,
    scouting: 1,
  },
  fanHappiness: 72,
  boardConfidence: 74,
  warningLevel: 0,
  teamIds,
  roster,
  youthAcademy: createYouthProspects(club.teamId, 1, 1),
  fixtures,
  latestFixtureId: null,
  latestSideMatches: [],
  cupStatus: 'active',
  europeStatus: club.prestige >= 76 ? 'active' : 'not-qualified',
  trophies: [],
  totalWins: 0,
  totalGoals: 0,
  history: [],
  seasonSummary: null,
  offers: [],
  transferMarket: [],
  createdAt: now(),
  updatedAt: now(),
});

export const createYouthProspects = (teamId: string, season: number, youthLevel: number): CareerPlayerState[] => {
  const positions: Array<{ position: Position; primaryPosition: FootballPosition }> = [
    { position: 'KL', primaryPosition: 'GK' },
    { position: 'STP', primaryPosition: 'CB' },
    { position: 'MO', primaryPosition: 'CM' },
    { position: 'SF', primaryPosition: 'ST' },
  ];
  const count = 2 + Math.min(3, youthLevel);

  return Array.from({ length: count }, (_, index) => {
    const slot = positions[(season + index) % positions.length];
    const rating = clamp(54 + youthLevel * 3 + Math.floor(Math.random() * 9), 52, 76);
    const potential = clamp(rating + 15 + youthLevel * 3 + Math.floor(Math.random() * 12), rating + 5, 96);
    const age = 16 + Math.floor(Math.random() * 3);
    const id = `youth-${teamId}-${season}-${index}-${Date.now().toString(36)}`;
    const attributes: PlayerAttributes = {
      attack: slot.primaryPosition === 'ST' ? rating : rating - 2,
      defense: ['GK', 'CB', 'LB', 'RB'].includes(slot.primaryPosition) ? rating : rating - 3,
      passing: rating,
      pace: rating + 2,
      shooting: slot.primaryPosition === 'ST' ? rating + 3 : rating - 2,
      dribbling: rating,
      goalkeeping: slot.primaryPosition === 'GK' ? rating + 4 : 20,
    };

    return {
      playerId: id,
      teamId,
      name: `Altyapı Oyuncusu ${season}-${index + 1}`,
      number: 60 + index,
      position: slot.position,
      primaryPosition: slot.primaryPosition,
      secondaryPositions: [],
      attributes,
      age,
      potential,
      rating,
      form: 0,
      marketValue: calculateCareerMarketValue(rating, age, potential, 0),
      wage: roundMoney(Math.max(100_000, rating ** 2 * 900)),
      loanStatus: 'owned',
    };
  });
};

export const developCareerPlayers = (
  players: CareerPlayerState[],
  facilities: CareerFacilities,
) => players.map((player) => {
  const nextAge = player.age + 1;
  const growthRoom = Math.max(0, player.potential - player.rating);
  const trainingBoost = facilities.training * 0.35;
  const youthBoost = nextAge <= 21 ? facilities.youth * 0.28 : 0;
  const randomSwing = Math.random() * 1.4;
  const change = nextAge <= 24
    ? Math.min(growthRoom, 1 + trainingBoost + youthBoost + randomSwing)
    : nextAge <= 30
      ? Math.min(growthRoom, Math.random() * 0.8 + trainingBoost * 0.25)
      : -(0.4 + Math.random() * 0.9 - facilities.medical * 0.08);
  const rating = clamp(Math.round(player.rating + change), 45, player.potential);
  const form = clamp(Math.round(player.form * 0.35 + (Math.random() * 6 - 3)), -10, 10);

  return {
    ...player,
    age: nextAge,
    rating,
    form,
    marketValue: calculateCareerMarketValue(rating, nextAge, player.potential, form),
  };
});

export const saveCareer = (save: CareerSave) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({
    ...save,
    updatedAt: now(),
  }));
};

const isCareerSave = (value: unknown): value is CareerSave => {
  if (!value || typeof value !== 'object') return false;
  const save = value as Partial<CareerSave>;
  return (
    save.version === 1 &&
    Boolean(save.club) &&
    Array.isArray(save.roster) &&
    Array.isArray(save.fixtures) &&
    Array.isArray(save.history)
  );
};

const migrateCareerSave = (save: CareerSave): CareerSave => ({
  ...save,
  totalGoals: save.totalGoals ?? 0,
  seasonSummary: save.seasonSummary ?? null,
  history: save.history.map((entry) => ({
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    bestPlayerName: '-',
    topScorerName: '-',
    topScorerGoals: 0,
    careerPointsGained: 0,
    boardGrade: '-',
    fanGrade: '-',
    ...entry,
  })),
  roster: save.roster.map((player) => ({
    ...player,
    marketValue: calculateCareerMarketValue(player.rating, player.age, player.potential, player.form),
  })),
});

export const loadCareer = (): CareerSave | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CAREER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCareerSave(parsed)) {
      window.localStorage.removeItem(CAREER_STORAGE_KEY);
      return null;
    }
    return migrateCareerSave(parsed);
  } catch {
    window.localStorage.removeItem(CAREER_STORAGE_KEY);
    return null;
  }
};

export const resetCareer = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CAREER_STORAGE_KEY);
};
