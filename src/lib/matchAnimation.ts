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

export interface MatchAnimationState {
  event: MatchVisualEvent;
  side: MatchSide;
  minuteLabel: string;
  label: string;
  sequence: number;
  ball: { x: number; y: number };
  focus: { x: number; y: number };
  intensity: number;
}

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

const sideDirection = (side: MatchSide) => side === 'away' ? 1 : -1;

const eventPosition = (event: MatchVisualEvent, side: MatchSide, sequence: number) => {
  if (side === 'neutral') return { ball: { x: 50, y: 50 }, focus: { x: 50, y: 50 } };

  const direction = sideDirection(side);
  const attackingY = 50 + direction * 26;
  const boxY = 50 + direction * 37;
  const goalY = side === 'home' ? 4 : 96;
  const flankX = sequence % 2 === 0 ? 32 : 68;

  if (event === 'pass') return { ball: { x: flankX, y: 50 + direction * 8 }, focus: { x: flankX, y: 50 + direction * 8 } };
  if (event === 'attack') return { ball: { x: flankX, y: attackingY }, focus: { x: 50, y: attackingY } };
  if (event === 'shot') return { ball: { x: 50, y: boxY }, focus: { x: 50, y: boxY } };
  if (event === 'save') return { ball: { x: 50, y: 50 + direction * 43 }, focus: { x: 50, y: 50 + direction * 43 } };
  if (event === 'goal' || event === 'penaltyGoal') return { ball: { x: 50, y: goalY }, focus: { x: 50, y: goalY } };
  if (event === 'penaltyMiss') return { ball: { x: sequence % 2 === 0 ? 38 : 62, y: goalY + (side === 'home' ? 7 : -7) }, focus: { x: 50, y: goalY + (side === 'home' ? 12 : -12) } };
  if (event === 'yellowCard' || event === 'foul' || event === 'injury') return { ball: { x: flankX, y: 50 + direction * 14 }, focus: { x: flankX, y: 50 + direction * 14 } };
  if (event === 'penaltyShootout') return { ball: { x: 50, y: side === 'home' ? 18 : 82 }, focus: { x: 50, y: side === 'home' ? 18 : 82 } };

  return { ball: { x: 50, y: 50 }, focus: { x: 50, y: 50 } };
};

export const createMatchAnimationState = (): MatchAnimationState => ({
  event: 'kickoff',
  side: 'neutral',
  minuteLabel: "0'",
  label: eventLabels.kickoff,
  sequence: 0,
  ball: { x: 50, y: 50 },
  focus: { x: 50, y: 50 },
  intensity: 0.35,
});

export const eventToAnimationState = ({
  event,
  side = 'neutral',
  minuteLabel,
  sequence,
}: {
  event: MatchVisualEvent;
  side?: MatchSide;
  minuteLabel: string;
  sequence: number;
}): MatchAnimationState => {
  const coordinates = eventPosition(event, side, sequence);
  const intenseEvents: MatchVisualEvent[] = ['shot', 'save', 'goal', 'penaltyGoal', 'penaltyMiss'];

  return {
    event,
    side,
    minuteLabel,
    label: eventLabels[event],
    sequence,
    ball: coordinates.ball,
    focus: coordinates.focus,
    intensity: intenseEvents.includes(event) ? 0.65 : 0.38,
  };
};

export const flowEventForMinute = (minute: number): MatchVisualEvent => {
  const flow: MatchVisualEvent[] = ['pass', 'attack', 'pass', 'shot', 'save', 'attack'];
  return flow[Math.abs(minute) % flow.length];
};
