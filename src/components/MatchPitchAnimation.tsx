import type { MatchAnimationState } from '@/lib/matchAnimation';

const homeBase = [
  { x: 50, y: 90 }, { x: 20, y: 75 }, { x: 40, y: 78 }, { x: 60, y: 78 }, { x: 80, y: 75 },
  { x: 28, y: 57 }, { x: 50, y: 62 }, { x: 72, y: 57 }, { x: 30, y: 39 }, { x: 50, y: 34 }, { x: 70, y: 39 },
];
const awayBase = homeBase.map((marker) => ({ x: 100 - marker.x, y: 100 - marker.y }));

const mapY = (value: number) => 8 + value * 1.24;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const markerPosition = (
  marker: { x: number; y: number },
  state: MatchAnimationState,
  side: 'home' | 'away',
  index: number,
) => {
  const sideActive = state.side === side || state.side === 'neutral';
  const distance = Math.hypot(marker.x - state.focus.x, marker.y - state.focus.y);
  const pull = sideActive && distance < 38 ? state.intensity * 0.22 : state.intensity * 0.06;
  const wobble = ((state.sequence + index) % 3 - 1) * (sideActive ? 1.5 : 0.6);

  return {
    x: clamp(marker.x + (state.focus.x - marker.x) * pull + wobble, 8, 92),
    y: clamp(marker.y + (state.focus.y - marker.y) * pull, 8, 92),
  };
};

export default function MatchPitchAnimation({
  state,
  homeName,
  awayName,
}: {
  state: MatchAnimationState;
  homeName: string;
  awayName: string;
}) {
  const ballX = clamp(state.ball.x, 4, 96);
  const ballY = clamp(state.ball.y, 3, 97);
  const isGoalEvent = state.event === 'goal' || state.event === 'penaltyGoal';
  const isStopEvent = state.event === 'yellowCard' || state.event === 'injury' || state.event === 'foul';

  return (
    <section className="mt-5 border-2 border-white/15 bg-zinc-900 p-3 shadow-[4px_4px_0px_0px_#000]" aria-label="2D canlı maç sahası">
      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
        <span className="truncate">{homeName}</span>
        <span className="border border-white/15 bg-black px-2 py-1 text-yellow-400">{state.minuteLabel} / {state.label}</span>
        <span className="truncate text-right">{awayName}</span>
      </div>
      <div className="mx-auto w-full max-w-sm overflow-hidden border-2 border-black bg-[#22543d] shadow-[5px_5px_0px_0px_#000]">
        <svg
          viewBox="0 0 100 140"
          className="h-[min(58vh,520px)] min-h-[310px] w-full"
          role="img"
          aria-label={`${state.label} animasyonu`}
        >
          <defs>
            <radialGradient id="stadium-glow" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#2f855a" />
              <stop offset="100%" stopColor="#123524" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width="100" height="140" fill="url(#stadium-glow)" />
          <rect x="7" y="8" width="86" height="124" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
          <line x1="7" y1="70" x2="93" y2="70" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <circle cx="50" cy="70" r="13" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <circle cx="50" cy="70" r="1.3" fill="rgba(255,255,255,0.65)" />
          <rect x="29" y="8" width="42" height="18" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="38" y="8" width="24" height="7" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.75" />
          <rect x="29" y="114" width="42" height="18" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="38" y="125" width="24" height="7" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.75" />
          <rect x="41" y="4" width="18" height="4" fill="#f8fafc" opacity="0.75" />
          <rect x="41" y="132" width="18" height="4" fill="#f8fafc" opacity="0.75" />

          {isStopEvent && (
            <circle
              cx={state.focus.x}
              cy={mapY(state.focus.y)}
              r="11"
              fill="rgba(250,204,21,0.15)"
              stroke="rgba(250,204,21,0.8)"
              strokeWidth="1"
            />
          )}

          {[...awayBase].map((marker, index) => {
            const position = markerPosition(marker, state, 'away', index);
            return (
              <g
                key={`away-${index}`}
                style={{ transform: `translate(${position.x}px, ${mapY(position.y)}px)`, transition: 'transform 520ms ease-out' }}
              >
                <circle r="2.6" fill="#ef4444" stroke="#111827" strokeWidth="0.8" />
              </g>
            );
          })}

          {[...homeBase].map((marker, index) => {
            const position = markerPosition(marker, state, 'home', index);
            return (
              <g
                key={`home-${index}`}
                style={{ transform: `translate(${position.x}px, ${mapY(position.y)}px)`, transition: 'transform 520ms ease-out' }}
              >
                <circle r="2.8" fill="#facc15" stroke="#111827" strokeWidth="0.8" />
              </g>
            );
          })}

          <g style={{ transform: `translate(${ballX}px, ${mapY(ballY)}px)`, transition: 'transform 430ms cubic-bezier(.2,.8,.2,1)' }}>
            {isGoalEvent && <circle r="8" fill="rgba(250,204,21,0.2)" stroke="#facc15" strokeWidth="1" />}
            <circle r="2.2" fill="#ffffff" stroke="#111827" strokeWidth="0.6" />
          </g>
        </svg>
      </div>
    </section>
  );
}
