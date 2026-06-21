export type MatchVisualEvent =
  | 'kickoff'
  | 'pass'
  | 'attack'
  | 'shot'
  | 'save'
  | 'goal'
  | 'foul'
  | 'yellowCard'
  | 'injury'
  | 'halftime'
  | 'fulltime'
  | 'extraTime'
  | 'penaltyShootout'
  | 'penaltyGoal'
  | 'penaltyMiss';

export type MatchSide = 'home' | 'away' | 'neutral';

export type PitchZone =
  | 'center'
  | 'midfield'
  | 'left-wing'
  | 'right-wing'
  | 'final-third'
  | 'box'
  | 'goal'
  | 'penalty'
  | 'stoppage';

export interface PitchPoint {
  x: number;
  y: number;
}

export interface PitchTrail {
  from: PitchPoint;
  to: PitchPoint;
  type: 'pass' | 'attack' | 'shot' | 'save' | 'goal' | 'penalty' | 'stoppage';
}

export interface PlayerMarkerPosition extends PitchPoint {
  number: number;
  role: 'GK' | 'DF' | 'MF' | 'FW';
}

export interface MomentumSample {
  event: MatchVisualEvent;
  side: MatchSide;
}

export interface MatchAnimationState {
  event: MatchVisualEvent;
  side: MatchSide;
  activeSide: MatchSide;
  minuteLabel: string;
  label: string;
  sequence: number;
  ball: PitchPoint;
  focus: PitchPoint;
  origin: PitchPoint;
  target: PitchPoint;
  path?: PitchTrail;
  zone: PitchZone;
  intensity: number;
  activePlayerIndex: number;
  targetPlayerIndex: number;
  momentum: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const eventLabels: Record<MatchVisualEvent, string> = {
  kickoff: 'Başlama vuruşu',
  pass: 'Pas akışı',
  attack: 'Atak gelişiyor',
  shot: 'Şut',
  save: 'Kurtarış',
  goal: 'Gol',
  foul: 'Faul',
  yellowCard: 'Sarı kart',
  injury: 'Sakatlık',
  halftime: 'Devre arası',
  fulltime: 'Maç bitti',
  extraTime: 'Uzatma',
  penaltyShootout: 'Penaltılar',
  penaltyGoal: 'Penaltı gol',
  penaltyMiss: 'Penaltı kaçtı',
};

const homeFormation: PlayerMarkerPosition[] = [
  { number: 1, role: 'GK', x: 50, y: 91 },
  { number: 2, role: 'DF', x: 78, y: 78 },
  { number: 4, role: 'DF', x: 60, y: 80 },
  { number: 5, role: 'DF', x: 40, y: 80 },
  { number: 3, role: 'DF', x: 22, y: 78 },
  { number: 6, role: 'MF', x: 38, y: 63 },
  { number: 8, role: 'MF', x: 62, y: 63 },
  { number: 10, role: 'MF', x: 50, y: 53 },
  { number: 7, role: 'FW', x: 76, y: 38 },
  { number: 9, role: 'FW', x: 50, y: 32 },
  { number: 11, role: 'FW', x: 24, y: 38 },
];

const home442Formation: PlayerMarkerPosition[] = [
  { number: 1, role: 'GK', x: 50, y: 91 },
  { number: 2, role: 'DF', x: 78, y: 78 },
  { number: 4, role: 'DF', x: 60, y: 80 },
  { number: 5, role: 'DF', x: 40, y: 80 },
  { number: 3, role: 'DF', x: 22, y: 78 },
  { number: 7, role: 'MF', x: 76, y: 58 },
  { number: 6, role: 'MF', x: 58, y: 62 },
  { number: 8, role: 'MF', x: 42, y: 62 },
  { number: 11, role: 'MF', x: 24, y: 58 },
  { number: 9, role: 'FW', x: 42, y: 34 },
  { number: 10, role: 'FW', x: 58, y: 34 },
];

const mirrorMarker = (marker: PlayerMarkerPosition): PlayerMarkerPosition => ({
  ...marker,
  x: 100 - marker.x,
  y: 100 - marker.y,
});

export const getPlayerMarkerPositions = (
  formation: string,
  teamSide: Exclude<MatchSide, 'neutral'>,
) => {
  const base = formation === '4-4-2' ? home442Formation : homeFormation;
  return teamSide === 'home' ? base : base.map(mirrorMarker);
};

const directionForSide = (side: MatchSide) => side === 'away' ? 1 : -1;

const point = (x: number, y: number): PitchPoint => ({
  x: clamp(x, 6, 94),
  y: clamp(y, 2, 98),
});

export const eventToPitchZone = (
  event: MatchVisualEvent,
  side: MatchSide,
  sequence: number,
): PitchZone => {
  if (side === 'neutral') {
    if (event === 'penaltyShootout') return 'penalty';
    return 'center';
  }
  if (event === 'pass') return sequence % 3 === 0 ? 'midfield' : sequence % 2 === 0 ? 'right-wing' : 'left-wing';
  if (event === 'attack') return sequence % 2 === 0 ? 'right-wing' : 'left-wing';
  if (event === 'shot' || event === 'save') return 'box';
  if (event === 'goal') return 'goal';
  if (event === 'penaltyGoal' || event === 'penaltyMiss') return 'penalty';
  if (event === 'yellowCard' || event === 'foul' || event === 'injury') return 'stoppage';
  return 'center';
};

const attackingGoalY = (side: MatchSide) => side === 'home' ? 2 : 98;

const activeSideForEvent = (event: MatchVisualEvent, side: MatchSide): MatchSide => {
  if (side === 'neutral') return 'neutral';
  if (event === 'save') return side === 'home' ? 'away' : 'home';
  return side;
};

const activePlayerForEvent = (event: MatchVisualEvent, sequence: number) => {
  if (event === 'save') return { active: 0, target: 5 };
  if (event === 'shot' || event === 'goal' || event === 'penaltyGoal' || event === 'penaltyMiss') {
    const attacker = sequence % 2 === 0 ? 9 : 7;
    return { active: attacker, target: attacker };
  }
  if (event === 'attack') return { active: sequence % 2 === 0 ? 8 : 10, target: sequence % 2 === 0 ? 7 : 11 };
  if (event === 'pass') return { active: 5 + (sequence % 3), target: 7 + (sequence % 4) };
  if (event === 'yellowCard' || event === 'foul' || event === 'injury') return { active: 4 + (sequence % 5), target: 4 + (sequence % 5) };
  return { active: 7, target: 9 };
};

const movementForEvent = (
  event: MatchVisualEvent,
  side: MatchSide,
  sequence: number,
): {
  ball: PitchPoint;
  focus: PitchPoint;
  origin: PitchPoint;
  target: PitchPoint;
  path?: PitchTrail;
} => {
  if (side === 'neutral') {
    const center = point(50, 50);
    return {
      ball: event === 'penaltyShootout' ? point(50, 18) : center,
      focus: center,
      origin: center,
      target: center,
    };
  }

  const direction = directionForSide(side);
  const goalY = attackingGoalY(side);
  const penaltySpot = point(50, side === 'home' ? 18 : 82);
  const flankX = sequence % 2 === 0 ? 72 : 28;
  const oppositeFlankX = 100 - flankX;
  const midfieldY = 50 + direction * 8;
  const attackY = 50 + direction * 24;
  const boxY = 50 + direction * 37;
  const stoppageY = 50 + direction * 13;

  if (event === 'pass') {
    const origin = point(oppositeFlankX, midfieldY - direction * 5);
    const target = point(flankX, midfieldY + direction * 10);
    return {
      ball: target,
      focus: point((origin.x + target.x) / 2, (origin.y + target.y) / 2),
      origin,
      target,
      path: { from: origin, to: target, type: 'pass' },
    };
  }

  if (event === 'attack') {
    const origin = point(50, midfieldY);
    const target = point(flankX, attackY);
    return {
      ball: target,
      focus: point((target.x + 50) / 2, target.y),
      origin,
      target,
      path: { from: origin, to: target, type: 'attack' },
    };
  }

  if (event === 'shot') {
    const origin = point(sequence % 2 === 0 ? 44 : 56, boxY);
    const target = point(50, goalY + (side === 'home' ? 4 : -4));
    return {
      ball: target,
      focus: point(50, boxY + direction * 7),
      origin,
      target,
      path: { from: origin, to: target, type: 'shot' },
    };
  }

  if (event === 'save') {
    const origin = point(50, boxY);
    const target = point(sequence % 2 === 0 ? 46 : 54, goalY + (side === 'home' ? 12 : -12));
    return {
      ball: target,
      focus: target,
      origin,
      target,
      path: { from: origin, to: target, type: 'save' },
    };
  }

  if (event === 'goal') {
    const origin = point(sequence % 2 === 0 ? 45 : 55, boxY);
    const target = point(50, goalY);
    return {
      ball: target,
      focus: target,
      origin,
      target,
      path: { from: origin, to: target, type: 'goal' },
    };
  }

  if (event === 'penaltyGoal' || event === 'penaltyMiss') {
    const target = event === 'penaltyGoal'
      ? point(50, goalY)
      : point(sequence % 2 === 0 ? 37 : 63, goalY + (side === 'home' ? 9 : -9));
    return {
      ball: target,
      focus: point(50, goalY + (side === 'home' ? 7 : -7)),
      origin: penaltySpot,
      target,
      path: { from: penaltySpot, to: target, type: 'penalty' },
    };
  }

  if (event === 'yellowCard' || event === 'foul' || event === 'injury') {
    const stop = point(flankX, stoppageY);
    return {
      ball: stop,
      focus: stop,
      origin: stop,
      target: stop,
      path: { from: stop, to: stop, type: 'stoppage' },
    };
  }

  const center = point(50, 50);
  return { ball: center, focus: center, origin: center, target: center };
};

const eventIntensity = (event: MatchVisualEvent) => {
  if (event === 'goal' || event === 'penaltyGoal') return 0.9;
  if (event === 'shot' || event === 'save' || event === 'penaltyMiss') return 0.72;
  if (event === 'attack') return 0.58;
  if (event === 'yellowCard' || event === 'injury' || event === 'foul') return 0.48;
  return 0.36;
};

const momentumWeight = (event: MatchVisualEvent) => {
  if (event === 'goal' || event === 'penaltyGoal') return 2;
  if (event === 'shot') return 1.1;
  if (event === 'attack') return 0.75;
  if (event === 'pass') return 0.28;
  if (event === 'save') return -0.35;
  if (event === 'foul' || event === 'yellowCard' || event === 'injury' || event === 'penaltyMiss') return -0.55;
  return 0;
};

export const calculateMomentum = (samples: MomentumSample[]) => {
  const total = samples.slice(-8).reduce((score, sample) => {
    if (sample.side === 'neutral') return score;
    const sideSign = sample.side === 'home' ? 1 : -1;
    return score + sideSign * momentumWeight(sample.event);
  }, 0);
  return clamp(total / 4, -1, 1);
};

export const createMatchAnimationState = (): MatchAnimationState => {
  const center = point(50, 50);
  return {
    event: 'kickoff',
    side: 'neutral',
    activeSide: 'neutral',
    minuteLabel: "0'",
    label: eventLabels.kickoff,
    sequence: 0,
    ball: center,
    focus: center,
    origin: center,
    target: center,
    zone: 'center',
    intensity: 0.35,
    activePlayerIndex: 7,
    targetPlayerIndex: 9,
    momentum: 0,
  };
};

export const eventToAnimationState = ({
  event,
  side = 'neutral',
  minuteLabel,
  sequence,
  momentum = 0,
}: {
  event: MatchVisualEvent;
  side?: MatchSide;
  minuteLabel: string;
  sequence: number;
  momentum?: number;
}): MatchAnimationState => {
  const movement = movementForEvent(event, side, sequence);
  const players = activePlayerForEvent(event, sequence);

  return {
    event,
    side,
    activeSide: activeSideForEvent(event, side),
    minuteLabel,
    label: eventLabels[event],
    sequence,
    ball: movement.ball,
    focus: movement.focus,
    origin: movement.origin,
    target: movement.target,
    path: movement.path,
    zone: eventToPitchZone(event, side, sequence),
    intensity: eventIntensity(event),
    activePlayerIndex: players.active,
    targetPlayerIndex: players.target,
    momentum,
  };
};

export const flowEventForMinute = (minute: number): MatchVisualEvent => {
  const flow: MatchVisualEvent[] = ['pass', 'attack', 'pass', 'shot', 'save', 'foul', 'attack'];
  return flow[Math.abs(minute) % flow.length];
};
