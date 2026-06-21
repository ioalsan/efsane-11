export type Position = 'KL' | 'STP' | 'SLB' | 'SĞB' | 'MO' | 'SLK' | 'SĞK' | 'SF';
export type FootballPosition = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';
export type CompetitionFormat = 'league' | 'group_knockout' | 'knockout' | 'world_cup_48';
export type KnockoutRound = 'round-of-32' | 'round-of-16' | 'quarter-final' | 'semi-final' | 'final';
export type TeamType = 'club' | 'nationalTeam';
export type PlayerType = 'club' | 'nationalTeam';

export interface Player {
  id: string;
  name: string;
  era: string;
  position: Position;
  secondary_position?: Position;
  compatiblePositions?: Position[];
  overall_rating: number;
  image_url: string;
  jersey_number: number;
  teamId?: string;
  form?: number;
  nationality?: string;
  isActive?: boolean;
  primaryPosition?: FootballPosition;
  secondaryPositions?: FootballPosition[];
  attributes?: PlayerAttributes;
  dateOfBirth?: string;
  age?: number;
  potential?: number;
  marketValue?: number;
}

export interface Squad {
  id: string;
  teamName: string;
  year: string;
  players: Player[];
}

export interface SeasonCompetition {
  competitionId: string;
  competitionName: string;
  season: string;
  format: CompetitionFormat;
  leagueMatchCount: number;
  leaguePhaseMatchCount: number;
  homeAway: boolean;
  groupCount: number;
  groupSize: number;
  groups: CompetitionGroup[];
  knockoutRounds: KnockoutRound[];
  teams: string[];
  players: string[];
}

export interface CompetitionGroup {
  groupId: string;
  groupName: string;
  teamIds: string[];
}

export interface SeasonTeam {
  id: string;
  sourceClubId?: number;
  name: string;
  teamType: TeamType;
  country: string;
  league: string;
  competitionIds: string[];
  strengthBonus: number;
  players: string[];
}

export interface SeasonPlayer {
  id: string;
  teamId: string;
  name: string;
  playerType: PlayerType;
  number: number;
  primaryPosition: FootballPosition;
  secondaryPositions: FootballPosition[];
  rating: number;
  form: number;
  nationality: string;
  isActive: boolean;
  attributes: PlayerAttributes;
  sourcePlayerId?: number;
  dateOfBirth?: string;
  potential?: number;
  marketValue?: number;
}

export interface PlayerAttributes {
  attack: number;
  defense: number;
  passing: number;
  pace: number;
  shooting: number;
  dribbling: number;
  goalkeeping: number;
}

export interface GameSettings {
  adsEnabled: boolean;
  chanceFactor: number;
  penaltiesEnabled: boolean;
  injuryChance: number;
  simulateOtherMatches: boolean;
}

export interface SeasonDataset {
  schemaVersion: 4;
  season: string;
  generatedAt: string;
  sources: string[];
  settings: GameSettings;
  competitions: SeasonCompetition[];
  teams: SeasonTeam[];
  players: SeasonPlayer[];
}
