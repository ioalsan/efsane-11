import type { FootballPosition, SeasonDataset } from '@/types';

export interface PlayerDataProfile {
  dateOfBirth?: string;
  age: number;
  potential: number;
  marketValue: number;
  usedDateFallback: boolean;
  usedMarketFallback: boolean;
  source: 'dataset' | 'verified' | 'fallback';
}

export interface PlayerDataQualityReport {
  totalPlayers: number;
  correctedPlayers: number;
  missingDateOfBirth: number;
  missingMarketValue: number;
  fallbackPlayers: string[];
  invalidPlayers: string[];
  starChecks: Array<{
    name: string;
    age: number;
    marketValue: number;
    status: 'ok' | 'fixed' | 'invalid';
  }>;
}

interface PlayerDataInput {
  id: string;
  name: string;
  rating?: number;
  overall_rating?: number;
  form?: number;
  primaryPosition?: FootballPosition;
  dateOfBirth?: string;
  potential?: number;
  marketValue?: number;
}

const VERIFIED_PLAYER_DATA: Record<string, { dateOfBirth: string; marketValue?: number; potential?: number }> = {
  'victor osimhen': { dateOfBirth: '1998-12-29', marketValue: 75_000_000, potential: 92 },
  'barış alper yılmaz': { dateOfBirth: '2000-05-23', marketValue: 30_000_000, potential: 86 },
  'hakan çalhanoğlu': { dateOfBirth: '1994-02-08', marketValue: 30_000_000, potential: 88 },
  'arda güler': { dateOfBirth: '2005-02-25', marketValue: 60_000_000, potential: 94 },
  'kenan yıldız': { dateOfBirth: '2005-05-04', marketValue: 50_000_000, potential: 91 },
  'uğurcan çakır': { dateOfBirth: '1996-04-05', marketValue: 12_000_000, potential: 83 },
  talisca: { dateOfBirth: '1994-02-01', marketValue: 15_000_000, potential: 84 },
  'edin dzeko': { dateOfBirth: '1986-03-17', marketValue: 2_000_000, potential: 82 },
};

const STAR_NAMES = new Set(Object.keys(VERIFIED_PLAYER_DATA));

const normalizeName = (name: string) => name.trim().toLocaleLowerCase('tr-TR');

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundMoney = (value: number) => Math.round(value / 50_000) * 50_000;

export const calculateAgeFromDateOfBirth = (dateOfBirth: string, referenceDate = new Date()) => {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = referenceDate.getUTCMonth() - birthDate.getUTCMonth();
  const dayDelta = referenceDate.getUTCDate() - birthDate.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) age -= 1;
  return age;
};

const deriveFallbackAge = (id: string, rating: number, primaryPosition?: FootballPosition) => {
  const hash = hashString(`${id}:age`);
  if (rating >= 88) return 25 + (hash % 4);
  if (rating >= 84) return 23 + (hash % 6);
  if (rating >= 80) return 22 + (hash % 8);
  if (primaryPosition === 'GK') return 23 + (hash % 13);
  return 18 + (hash % 15);
};

export const derivePotentialFromProfile = (
  id: string,
  rating: number,
  age: number,
  verifiedPotential?: number,
) => {
  if (verifiedPotential) return clamp(Math.max(rating, verifiedPotential), rating, 96);
  const hash = hashString(`${id}:potential`);
  const ageBonus = age <= 19 ? 14 : age <= 21 ? 11 : age <= 24 ? 8 : age <= 27 ? 4 : age <= 30 ? 2 : 0;
  const ratingBonus = rating >= 86 ? 2 : rating >= 80 ? 4 : 6;
  return clamp(rating + ageBonus + ratingBonus + (hash % 4), rating, 96);
};

export const calculateRealisticMarketValue = ({
  rating,
  age,
  potential,
  form,
  primaryPosition,
  verifiedMarketValue,
}: {
  rating: number;
  age: number;
  potential: number;
  form: number;
  primaryPosition?: FootballPosition;
  verifiedMarketValue?: number;
}) => {
  if (verifiedMarketValue && verifiedMarketValue > 0) return roundMoney(verifiedMarketValue);

  const ratingBase = Math.max(1, rating - 45) ** 2 * 46_000;
  const potentialPremium = Math.max(0, potential - rating) * (rating >= 80 ? 1_150_000 : 720_000);
  const formPremium = form * 420_000;
  const ageMultiplier = age <= 19
    ? 1.42
    : age <= 22
      ? 1.28
      : age <= 26
        ? 1.12
        : age <= 30
          ? 1
          : age <= 33
            ? 0.72
            : 0.42;
  const positionMultiplier = ['ST', 'LW', 'RW', 'AM'].includes(primaryPosition ?? '')
    ? 1.16
    : primaryPosition === 'GK'
      ? 0.82
      : 1;
  const raw = (ratingBase + potentialPremium + formPremium) * ageMultiplier * positionMultiplier;
  const floor = rating >= 90
    ? 60_000_000
    : rating >= 88
      ? 42_000_000
      : rating >= 85
        ? 25_000_000
        : rating >= 82
          ? 14_000_000
          : rating >= 80
            ? 8_000_000
            : 500_000;

  return roundMoney(Math.max(floor, raw));
};

export const getPlayerDataProfile = (
  player: PlayerDataInput,
  referenceDate = new Date(),
): PlayerDataProfile => {
  const rating = player.overall_rating ?? player.rating ?? 70;
  const form = player.form ?? 0;
  const verified = VERIFIED_PLAYER_DATA[normalizeName(player.name)];
  const dateOfBirth = player.dateOfBirth ?? verified?.dateOfBirth;
  const ageFromDate = dateOfBirth ? calculateAgeFromDateOfBirth(dateOfBirth, referenceDate) : null;
  const usedDateFallback = ageFromDate === null;
  const age = clamp(ageFromDate ?? deriveFallbackAge(player.id, rating, player.primaryPosition), 15, 45);
  const potential = derivePotentialFromProfile(player.id, rating, age, player.potential ?? verified?.potential);
  const marketValue = calculateRealisticMarketValue({
    rating,
    age,
    potential,
    form,
    primaryPosition: player.primaryPosition,
    verifiedMarketValue: player.marketValue ?? verified?.marketValue,
  });

  return {
    dateOfBirth,
    age,
    potential,
    marketValue,
    usedDateFallback,
    usedMarketFallback: !(player.marketValue ?? verified?.marketValue),
    source: verified ? 'verified' : dateOfBirth || player.marketValue ? 'dataset' : 'fallback',
  };
};

export const validatePlayerData = (
  dataset: SeasonDataset,
  referenceDate = new Date(),
): PlayerDataQualityReport => {
  const fallbackPlayers: string[] = [];
  const invalidPlayers: string[] = [];
  const starChecks: PlayerDataQualityReport['starChecks'] = [];
  let correctedPlayers = 0;
  let missingDateOfBirth = 0;
  let missingMarketValue = 0;

  dataset.players.forEach((player) => {
    const profile = getPlayerDataProfile(player, referenceDate);
    if (!player.dateOfBirth) missingDateOfBirth += 1;
    if (!player.marketValue) missingMarketValue += 1;
    if (profile.usedDateFallback || profile.usedMarketFallback) {
      correctedPlayers += 1;
      if (fallbackPlayers.length < 80) fallbackPlayers.push(player.name);
    }
    if (
      !player.name.trim() ||
      /^player\s+\d+$/i.test(player.name.trim()) ||
      profile.age < 15 ||
      profile.age > 45 ||
      profile.marketValue <= 0 ||
      player.rating < 40 ||
      player.rating > 99 ||
      profile.potential < player.rating - 2
    ) {
      invalidPlayers.push(player.name || player.id);
    }
    const normalized = normalizeName(player.name);
    if (STAR_NAMES.has(normalized)) {
      starChecks.push({
        name: player.name,
        age: profile.age,
        marketValue: profile.marketValue,
        status: player.dateOfBirth && player.marketValue ? 'ok' : 'fixed',
      });
    }
  });

  return {
    totalPlayers: dataset.players.length,
    correctedPlayers,
    missingDateOfBirth,
    missingMarketValue,
    fallbackPlayers,
    invalidPlayers,
    starChecks,
  };
};
