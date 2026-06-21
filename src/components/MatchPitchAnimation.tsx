import {
  getPlayerMarkerPositions,
  type MatchAnimationState,
  type MatchSide,
  type PitchTrail,
} from '@/lib/matchAnimation';

const FIELD_TOP = 8;
const FIELD_HEIGHT = 124;
const FIELD_LEFT = 7;
const FIELD_WIDTH = 86;

const mapY = (value: number) => FIELD_TOP + value * (FIELD_HEIGHT / 100);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const markerPosition = (
  marker: { x: number; y: number },
  state: MatchAnimationState,
  side: Exclude<MatchSide, 'neutral'>,
  index: number,
) => {
  const isActive = state.activeSide === side && state.activePlayerIndex === index;
  const isTarget = state.activeSide === side && state.targetPlayerIndex === index;
  const sideInEvent = state.side === side || state.activeSide === side;
  const distance = Math.hypot(marker.x - state.focus.x, marker.y - state.focus.y);
  const pull = isActive ? state.intensity * 0.38 : sideInEvent && distance < 42 ? state.intensity * 0.18 : state.intensity * 0.035;
  const targetPull = isTarget ? 0.12 : 0;
  const wobble = ((state.sequence + index) % 3 - 1) * (sideInEvent ? 1.25 : 0.35);

  return {
    x: clamp(marker.x + (state.focus.x - marker.x) * pull + (state.target.x - marker.x) * targetPull + wobble, 9, 91),
    y: clamp(marker.y + (state.focus.y - marker.y) * pull + (state.target.y - marker.y) * targetPull, 7, 93),
  };
};

const trailStroke = (path: PitchTrail) => {
  if (path.type === 'shot' || path.type === 'goal') return '#facc15';
  if (path.type === 'penalty') return '#c084fc';
  if (path.type === 'save') return '#93c5fd';
  if (path.type === 'stoppage') return '#fb923c';
  if (path.type === 'attack') return '#22c55e';
  return '#bfdbfe';
};

const trailDash = (path: PitchTrail) => {
  if (path.type === 'pass') return '3 3';
  if (path.type === 'save') return '4 2';
  if (path.type === 'stoppage') return '2 4';
  return undefined;
};

const goalHighlightY = (side: MatchSide) => {
  if (side === 'home') return FIELD_TOP - 4;
  if (side === 'away') return FIELD_TOP + FIELD_HEIGHT;
  return FIELD_TOP - 4;
};

const pressureText = (momentum: number, homeName: string, awayName: string) => {
  if (momentum > 0.18) return `${homeName} baskısı`;
  if (momentum < -0.18) return `${awayName} baskısı`;
  return 'Dengeli oyun';
};

export default function MatchPitchAnimation({
  state,
  homeName,
  awayName,
  score,
  penaltyScore,
  showPenaltyScore,
}: {
  state: MatchAnimationState;
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  penaltyScore: { home: number; away: number };
  showPenaltyScore: boolean;
}) {
  const homeMarkers = getPlayerMarkerPositions('4-2-3-1', 'home');
  const awayMarkers = getPlayerMarkerPositions('4-2-3-1', 'away');
  const ballX = clamp(state.ball.x, 4, 96);
  const ballY = clamp(state.ball.y, 2, 98);
  const focusY = mapY(state.focus.y);
  const isGoalEvent = state.event === 'goal' || state.event === 'penaltyGoal';
  const isShotEvent = state.event === 'shot' || state.event === 'penaltyGoal' || state.event === 'penaltyMiss';
  const isStopEvent = state.event === 'yellowCard' || state.event === 'injury' || state.event === 'foul';
  const homePressureWidth = clamp(50 + state.momentum * 50, 4, 96);

  const renderMarkers = (
    markers: typeof homeMarkers,
    side: Exclude<MatchSide, 'neutral'>,
  ) => markers.map((marker, index) => {
    const position = markerPosition(marker, state, side, index);
    const isActive = state.activeSide === side && state.activePlayerIndex === index;
    const isTarget = state.activeSide === side && state.targetPlayerIndex === index;
    const isHome = side === 'home';

    return (
      <g
        key={`${side}-${marker.number}-${index}`}
        style={{
          transform: `translate(${position.x}px, ${mapY(position.y)}px)`,
          transition: 'transform 520ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {(isActive || isTarget) && (
          <circle
            r={isActive ? 6.4 : 5.3}
            fill={isHome ? 'rgba(250,204,21,0.22)' : 'rgba(248,113,113,0.22)'}
            stroke={isHome ? '#fef08a' : '#fecaca'}
            strokeWidth="0.8"
          >
            <animate attributeName="r" values={isActive ? '4.8;7.4;4.8' : '4.4;6.1;4.4'} dur="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.95;0.35;0.95" dur="1s" repeatCount="indefinite" />
          </circle>
        )}
        <circle
          r={isHome ? 4.15 : 4}
          fill={isHome ? '#facc15' : '#ef4444'}
          stroke={isActive ? '#ffffff' : '#111827'}
          strokeWidth={isActive ? 1.1 : 0.75}
        />
        <circle r="1" cx="-1.25" cy="-1.25" fill="rgba(255,255,255,0.55)" />
        <text
          x="0"
          y="1.15"
          textAnchor="middle"
          fontSize="3.45"
          fontWeight="900"
          fill={isHome ? '#111827' : '#ffffff'}
        >
          {marker.number}
        </text>
      </g>
    );
  });

  return (
    <section className="mt-5 border-2 border-white/15 bg-zinc-900 p-3 shadow-[4px_4px_0px_0px_#000]" aria-label="2D canlı maç sahası">
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-2 border-black bg-zinc-950 px-3 py-2 shadow-[3px_3px_0px_0px_#000]">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase text-yellow-300">{homeName}</p>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Ev sahibi</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-green-300">{state.minuteLabel} / {state.label}</p>
          <p className={`text-4xl font-black tabular-nums leading-none ${isGoalEvent ? 'text-yellow-300' : 'text-white'}`}>
            {score.home} - {score.away}
          </p>
          {showPenaltyScore && (
            <p className="mt-1 text-[10px] font-black text-purple-300">
              Penaltılar: {penaltyScore.home} - {penaltyScore.away}
            </p>
          )}
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-[10px] font-black uppercase text-red-300">{awayName}</p>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Deplasman</p>
        </div>
      </div>

      <div className="mb-3 border border-white/10 bg-black/35 p-2">
        <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.14em] text-white/50">
          <span>{homeName}</span>
          <span className="text-white/70">{pressureText(state.momentum, homeName, awayName)}</span>
          <span>{awayName}</span>
        </div>
        <div className="relative h-3 overflow-hidden border border-black bg-red-500/60">
          <div
            className="h-full bg-yellow-400 transition-[width] duration-500 ease-out"
            style={{ width: `${homePressureWidth}%` }}
          />
          <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-black/70" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md overflow-hidden border-2 border-black bg-[#10251a] shadow-[5px_5px_0px_0px_#000]">
        <svg
          viewBox="0 0 100 140"
          className="w-full"
          style={{ height: 'clamp(300px, 48vh, 520px)' }}
          role="img"
          aria-label={`${state.label} animasyonu`}
        >
          <defs>
            <radialGradient id="stadium-glow" cx="50%" cy="50%" r="72%">
              <stop offset="0%" stopColor="#2f855a" />
              <stop offset="62%" stopColor="#1f6f47" />
              <stop offset="100%" stopColor="#0f2418" />
            </radialGradient>
            <linearGradient id="goal-flash" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(250,204,21,0)" />
              <stop offset="45%" stopColor="rgba(250,204,21,0.75)" />
              <stop offset="100%" stopColor="rgba(250,204,21,0)" />
            </linearGradient>
            <marker id="match-arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" fill="#bbf7d0" />
            </marker>
          </defs>

          <rect x="0" y="0" width="100" height="140" fill="#0b1510" />
          <rect x="2" y="2" width="96" height="136" fill="url(#stadium-glow)" />
          {Array.from({ length: 10 }).map((_, index) => (
            <rect
              key={`stripe-${index}`}
              x={FIELD_LEFT}
              y={FIELD_TOP + index * (FIELD_HEIGHT / 10)}
              width={FIELD_WIDTH}
              height={FIELD_HEIGHT / 10}
              fill={index % 2 === 0 ? '#27784c' : '#216b43'}
              opacity="0.82"
            />
          ))}
          <rect x={FIELD_LEFT} y={FIELD_TOP} width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="rgba(255,255,255,0.03)" />

          <rect x={FIELD_LEFT} y={FIELD_TOP} width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="1.05" />
          <line x1={FIELD_LEFT} y1="70" x2={FIELD_LEFT + FIELD_WIDTH} y2="70" stroke="rgba(255,255,255,0.76)" strokeWidth="0.95" />
          <circle cx="50" cy="70" r="13.5" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="0.9" />
          <circle cx="50" cy="70" r="1.4" fill="rgba(255,255,255,0.85)" />

          <rect x="26" y={FIELD_TOP} width="48" height="19" fill="rgba(0,0,0,0.05)" stroke="rgba(255,255,255,0.72)" strokeWidth="0.95" />
          <rect x="38" y={FIELD_TOP} width="24" height="7.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="0.85" />
          <path d="M40 27 Q50 32 60 27" fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth="0.8" />
          <circle cx="50" cy={mapY(18)} r="0.95" fill="rgba(255,255,255,0.8)" />

          <rect x="26" y={FIELD_TOP + FIELD_HEIGHT - 19} width="48" height="19" fill="rgba(0,0,0,0.05)" stroke="rgba(255,255,255,0.72)" strokeWidth="0.95" />
          <rect x="38" y={FIELD_TOP + FIELD_HEIGHT - 7.5} width="24" height="7.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="0.85" />
          <path d="M40 113 Q50 108 60 113" fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth="0.8" />
          <circle cx="50" cy={mapY(82)} r="0.95" fill="rgba(255,255,255,0.8)" />

          <rect x="41" y="3.5" width="18" height="4.5" fill="#f8fafc" opacity="0.86" />
          <rect x="41" y="132" width="18" height="4.5" fill="#f8fafc" opacity="0.86" />
          <line x1="41" y1={FIELD_TOP} x2="41" y2="4" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
          <line x1="59" y1={FIELD_TOP} x2="59" y2="4" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
          <line x1="41" y1={FIELD_TOP + FIELD_HEIGHT} x2="41" y2="136" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
          <line x1="59" y1={FIELD_TOP + FIELD_HEIGHT} x2="59" y2="136" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />

          <ellipse
            key={`focus-${state.sequence}`}
            cx={state.focus.x}
            cy={focusY}
            rx={state.zone === 'goal' ? 19 : 15}
            ry={state.zone === 'goal' ? 11 : 8}
            fill={isStopEvent ? 'rgba(250,204,21,0.16)' : 'rgba(255,255,255,0.12)'}
            stroke={isStopEvent ? 'rgba(250,204,21,0.72)' : 'rgba(187,247,208,0.35)'}
            strokeWidth="0.9"
          >
            <animate attributeName="opacity" values="0.2;0.75;0.2" dur="1.15s" repeatCount="1" />
          </ellipse>

          {isShotEvent && state.side !== 'neutral' && (
            <rect
              key={`target-goal-${state.sequence}`}
              x="35"
              y={goalHighlightY(state.side)}
              width="30"
              height="9"
              fill="rgba(250,204,21,0.2)"
              stroke="#fde047"
              strokeWidth="0.8"
            >
              <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.65s" repeatCount="2" />
            </rect>
          )}

          {(state.event === 'attack' || state.event === 'shot') && state.path && (
            <line
              key={`arrow-${state.sequence}`}
              x1={state.path.from.x}
              y1={mapY(state.path.from.y)}
              x2={state.path.to.x}
              y2={mapY(state.path.to.y)}
              stroke="#bbf7d0"
              strokeWidth="0.75"
              strokeOpacity="0.65"
              markerEnd="url(#match-arrow-head)"
            />
          )}

          {state.path && state.path.type !== 'stoppage' && (
            <line
              key={`trail-${state.sequence}`}
              x1={state.path.from.x}
              y1={mapY(state.path.from.y)}
              x2={state.path.to.x}
              y2={mapY(state.path.to.y)}
              stroke={trailStroke(state.path)}
              strokeWidth={state.path.type === 'shot' || state.path.type === 'goal' || state.path.type === 'penalty' ? 1.35 : 0.9}
              strokeLinecap="round"
              strokeDasharray={trailDash(state.path)}
              opacity="0.88"
            >
              <animate attributeName="opacity" values="0.95;0.25;0" dur="1.05s" repeatCount="1" fill="freeze" />
            </line>
          )}

          {renderMarkers(awayMarkers, 'away')}
          {renderMarkers(homeMarkers, 'home')}

          <g
            style={{
              transform: `translate(${ballX}px, ${mapY(ballY)}px)`,
              transition: `transform ${state.event === 'shot' || state.event === 'goal' || state.event === 'penaltyGoal' ? 280 : 520}ms cubic-bezier(.2,.8,.2,1)`,
            }}
          >
            {(isGoalEvent || isShotEvent) && (
              <circle r={isGoalEvent ? 10 : 7} fill={isGoalEvent ? 'rgba(250,204,21,0.24)' : 'rgba(255,255,255,0.18)'} stroke={isGoalEvent ? '#facc15' : '#ffffff'} strokeWidth="0.9">
                <animate attributeName="r" values={isGoalEvent ? '5;12;5' : '4;8;4'} dur="0.72s" repeatCount="1" />
                <animate attributeName="opacity" values="0.9;0.35;0.9" dur="0.72s" repeatCount="1" />
              </circle>
            )}
            <circle r="2.35" fill="#ffffff" stroke="#111827" strokeWidth="0.62" />
            <path d="M-1.3 0 Q0 -1.4 1.3 0 Q0 1.4 -1.3 0" fill="none" stroke="#111827" strokeWidth="0.35" opacity="0.7" />
          </g>

          {isGoalEvent && (
            <g key={`goal-${state.sequence}`}>
              <rect x="20" y={state.side === 'home' ? 11 : 120} width="60" height="10" fill="url(#goal-flash)" opacity="0.75">
                <animate attributeName="opacity" values="0;0.9;0" dur="1s" repeatCount="1" />
              </rect>
              <text
                x="50"
                y={state.side === 'home' ? 19 : 128}
                textAnchor="middle"
                fontSize="7"
                fontWeight="900"
                fill="#facc15"
                stroke="#111827"
                strokeWidth="0.45"
              >
                GOOOL
                <animate attributeName="opacity" values="0;1;0" dur="1.05s" repeatCount="1" />
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
