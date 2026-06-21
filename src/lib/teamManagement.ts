import type { Player, Position } from '@/types';
import { getCaptainRole } from './captain';
import { FORMATIONS, type FormationType } from './formations';

export type ManagerMentality = 'Gegenpress' | 'Balanced' | 'ParkTheBus';

export interface TacticProfile {
  id: ManagerMentality;
  label: string;
  shortLabel: string;
  description: string;
  attackModifier: number;
  defenseModifier: number;
  possessionModifier: number;
  shotModifier: number;
  foulModifier: number;
  riskLabel: string;
}

export interface SquadManagementSummary {
  power: number;
  chemistry: number;
  chemistryLabel: string;
  attack: number;
  midfield: number;
  defense: number;
  goalkeeping: number;
  pace: number;
  passing: number;
  positionFit: number;
  captainImpact: number;
  strengths: string[];
  weaknesses: string[];
  tacticalAdvice: string;
}

const tacticProfiles: Record<ManagerMentality, TacticProfile> = {
  Gegenpress: {
    id: 'Gegenpress',
    label: 'Hücum',
    shortLabel: 'Hücum',
    description: 'Önde baskı, daha fazla şut ve daha yüksek tempo.',
    attackModifier: 5.5,
    defenseModifier: -2.4,
    possessionModifier: 1.6,
    shotModifier: 1.18,
    foulModifier: 1.2,
    riskLabel: 'Yüksek risk / yüksek tempo',
  },
  Balanced: {
    id: 'Balanced',
    label: 'Dengeli',
    shortLabel: 'Dengeli',
    description: 'Top kontrolü ve savunma güvenliği arasında dengeli plan.',
    attackModifier: 1.2,
    defenseModifier: 1.2,
    possessionModifier: 0.8,
    shotModifier: 1,
    foulModifier: 1,
    riskLabel: 'Kontrollü risk',
  },
  ParkTheBus: {
    id: 'ParkTheBus',
    label: 'Savunma',
    shortLabel: 'Savunma',
    description: 'Düşük blok, daha az pozisyon verip geçiş hücumu arar.',
    attackModifier: -2.8,
    defenseModifier: 5.4,
    possessionModifier: -2,
    shotModifier: 0.78,
    foulModifier: 0.86,
    riskLabel: 'Düşük risk / sağlam blok',
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const positionMap: Record<string, Position> = {
  GK: 'KL',
  CB: 'STP',
  LB: 'SLB',
  RB: 'SĞB',
  DM: 'MO',
  CM: 'MO',
  AM: 'MO',
  LW: 'SLK',
  RW: 'SĞK',
  ST: 'SF',
};

const getLegacyPositions = (player: Player) => {
  const positions = new Set<Position>();
  positions.add(player.position);
  if (player.secondary_position) positions.add(player.secondary_position);
  player.compatiblePositions?.forEach((position) => positions.add(position));
  if (player.primaryPosition && positionMap[player.primaryPosition]) positions.add(positionMap[player.primaryPosition]);
  player.secondaryPositions?.forEach((position) => {
    const legacyPosition = positionMap[position];
    if (legacyPosition) positions.add(legacyPosition);
  });
  return positions;
};

const lineOf = (position: Position | string) => {
  if (position === 'KL') return 'goalkeeping';
  if (['STP', 'SLB', 'SĞB'].includes(position)) return 'defense';
  if (['MO', 'SLK', 'SĞK'].includes(position)) return 'midfield';
  return 'attack';
};

const getPositionFit = (player: Player, requiredPosition: string) => {
  const positions = getLegacyPositions(player);
  if (positions.has(requiredPosition as Position)) return 100;
  if (lineOf(player.position) === lineOf(requiredPosition)) return 78;
  if (lineOf(requiredPosition) === 'midfield' && ['SLB', 'SĞB', 'SF'].includes(player.position)) return 62;
  return 42;
};

const average = (values: number[], fallback = 0) => {
  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

const playerRating = (player: Player) => player.overall_rating + (player.form ?? 0) * 0.25;

const groupAverage = (players: Player[], positions: Position[], fallback: number) => {
  const values = players
    .filter((player) => positions.includes(player.position))
    .map(playerRating);
  return Math.round(average(values, fallback));
};

const commonRatio = (values: string[]) => {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Math.max(...counts.values()) / values.length;
};

export const getTacticProfile = (mentality: ManagerMentality | null | undefined) => (
  tacticProfiles[mentality ?? 'Balanced']
);

export const calculateSquadPower = (
  selectedPlayers: (Player | null)[],
  captainId: string | null,
) => {
  const players = selectedPlayers.filter((player): player is Player => Boolean(player));
  if (players.length === 0) return 0;
  const captain = players.find((player) => player.id === captainId);
  const captainRole = getCaptainRole(captain);
  const base = average(players.map(playerRating), 0);
  const depthPenalty = players.length < 11 ? (11 - players.length) * 2.2 : 0;
  return Math.round(clamp(base + (captainRole?.bonus ?? 0) * 1.8 - depthPenalty, 0, 99));
};

export const calculateSquadChemistry = (
  selectedPlayers: (Player | null)[],
  formationId: FormationType | null,
  captainId: string | null,
) => {
  const players = selectedPlayers.filter((player): player is Player => Boolean(player));
  if (players.length === 0) return 0;

  const formation = FORMATIONS.find((item) => item.id === formationId);
  const positionFits = formation
    ? formation.positions.map((slot) => {
      const player = selectedPlayers[slot.index];
      return player ? getPositionFit(player, slot.allowedPosition) : 35;
    })
    : players.map(() => 72);

  const positionFit = average(positionFits, 35);
  const nationalityBond = commonRatio(players.map((player) => player.nationality ?? '').filter(Boolean)) * 10;
  const teamBond = commonRatio(players.map((player) => player.teamId ?? '').filter(Boolean)) * 8;
  const captain = players.find((player) => player.id === captainId);
  const captainBonus = getCaptainRole(captain)?.bonus ?? 0;
  const fullSquadBonus = players.length === 11 ? 6 : players.length * 0.25;

  return Math.round(clamp(positionFit * 0.72 + nationalityBond + teamBond + captainBonus * 2.4 + fullSquadBonus, 0, 100));
};

export const chemistryLabel = (chemistry: number) => {
  if (chemistry >= 86) return 'Elit uyum';
  if (chemistry >= 74) return 'Güçlü uyum';
  if (chemistry >= 62) return 'Oturuyor';
  if (chemistry >= 45) return 'Kırılgan';
  return 'Dağınık';
};

export const getSquadManagementSummary = ({
  selectedPlayers,
  formationId,
  captainId,
  mentality,
}: {
  selectedPlayers: (Player | null)[];
  formationId: FormationType | null;
  captainId: string | null;
  mentality: ManagerMentality | null;
}): SquadManagementSummary => {
  const players = selectedPlayers.filter((player): player is Player => Boolean(player));
  const fallback = Math.round(average(players.map(playerRating), 0));
  const chemistry = calculateSquadChemistry(selectedPlayers, formationId, captainId);
  const power = calculateSquadPower(selectedPlayers, captainId);
  const attack = groupAverage(players, ['SF', 'SLK', 'SĞK'], fallback);
  const midfield = groupAverage(players, ['MO', 'SLK', 'SĞK'], fallback);
  const defense = groupAverage(players, ['STP', 'SLB', 'SĞB'], fallback);
  const goalkeeping = groupAverage(players, ['KL'], fallback);
  const pace = Math.round(average(players.map((player) => player.attributes?.pace ?? player.overall_rating), fallback));
  const passing = Math.round(average(players.map((player) => player.attributes?.passing ?? player.overall_rating), fallback));
  const formation = FORMATIONS.find((item) => item.id === formationId);
  const positionFit = formation
    ? Math.round(average(formation.positions.map((slot) => {
      const player = selectedPlayers[slot.index];
      return player ? getPositionFit(player, slot.allowedPosition) : 35;
    }), 35))
    : 0;
  const captain = players.find((player) => player.id === captainId);
  const captainRole = getCaptainRole(captain);
  const tactic = getTacticProfile(mentality);

  const units = [
    { label: 'Hücum gücü', value: attack },
    { label: 'Orta saha kontrolü', value: midfield },
    { label: 'Savunma direnci', value: defense },
    { label: 'Kaleci güveni', value: goalkeeping },
    { label: 'Pas kalitesi', value: passing },
    { label: 'Tempo', value: pace },
    { label: 'Pozisyon uyumu', value: positionFit },
  ];
  const sortedUnits = [...units].sort((a, b) => b.value - a.value);
  const strengths = sortedUnits.slice(0, 2).map((unit) => `${unit.label} (${unit.value})`);
  const weaknesses = sortedUnits.slice(-2).reverse().map((unit) => `${unit.label} (${unit.value})`);
  const tacticalAdvice = tactic.id === 'Gegenpress'
    ? `${tactic.shortLabel} planı şut hacmini artırır; savunma arkası riskine dikkat.`
    : tactic.id === 'ParkTheBus'
      ? `${tactic.shortLabel} planı savunma güvenliğini yükseltir; hücum üretimi daha seçici olur.`
      : `${tactic.shortLabel} planı top kontrolü ve savunma dengesini korur.`;

  return {
    power,
    chemistry,
    chemistryLabel: chemistryLabel(chemistry),
    attack,
    midfield,
    defense,
    goalkeeping,
    pace,
    passing,
    positionFit,
    captainImpact: captainRole ? captainRole.bonus * 2 : 0,
    strengths,
    weaknesses,
    tacticalAdvice,
  };
};
