'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CompetitionFixture, MatchResult } from '@/lib/competitionEngine';
import type { MatchEngineState } from '@/lib/matchEngine';
import type { SimulationSpeed } from '@/lib/multiplayerMatchPreferences';
import LiveMatchPanel, { type LiveMatchEngineDebug } from './LiveMatchPanel';

interface MatchEnginePanelProps {
  matchSessionId: string;
  fixture: CompetitionFixture;
  result: MatchResult;
  homeName: string;
  awayName: string;
  autoContinue: boolean;
  speed: SimulationSpeed;
  onCompleted: () => void;
  onSkipped: () => void;
  onDismissSkipped: () => void;
  onAutoContinueChange: (value: boolean) => void;
  onSpeedChange: (value: SimulationSpeed) => void;
}

function MatchEnginePanelComponent({
  matchSessionId,
  fixture,
  result,
  homeName,
  awayName,
  autoContinue,
  speed,
  onCompleted,
  onSkipped,
  onDismissSkipped,
  onAutoContinueChange,
  onSpeedChange,
}: MatchEnginePanelProps) {
  const completedRef = useRef(onCompleted);
  const skippedRef = useRef(onSkipped);
  const dismissSkippedRef = useRef(onDismissSkipped);
  const [sessionFixture] = useState(fixture);
  const [sessionResult] = useState(result);
  useEffect(() => {
    completedRef.current = onCompleted;
    skippedRef.current = onSkipped;
    dismissSkippedRef.current = onDismissSkipped;
  }, [onCompleted, onDismissSkipped, onSkipped]);
  const [debug, setDebug] = useState<LiveMatchEngineDebug>({
    engineState: 'preparing',
    engineStartedAt: new Date().toISOString(),
    engineTick: 0,
    lastEngineAction: 'session-created',
    duplicateCompletionPrevented: false,
    timerCount: 0,
    timerActive: false,
  });

  const handleCompleted = useCallback(() => completedRef.current(), []);
  const handleSkipped = useCallback(() => skippedRef.current(), []);
  const handleDismissSkipped = useCallback(() => dismissSkippedRef.current(), []);
  const engineState: MatchEngineState = debug.engineState;

  return (
    <section className="min-w-0" data-match-session-id={matchSessionId}>
      <LiveMatchPanel
        fixture={sessionFixture}
        result={sessionResult}
        homeName={homeName}
        awayName={awayName}
        onComplete={handleCompleted}
        onSkip={handleSkipped}
        onDismissSkipped={handleDismissSkipped}
        simulationMode="manager"
        initialAutoContinue={autoContinue}
        initialSpeed={speed}
        onAutoContinueChange={onAutoContinueChange}
        onSpeedChange={onSpeedChange}
        onEngineDebug={setDebug}
      />
      <details className="mt-2 border border-white/15 bg-black/40 p-2 text-[9px] font-black uppercase text-white/60">
        <summary className="cursor-pointer text-white/80">Maç Motoru Debug</summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          <span className="break-all">Session: {matchSessionId}</span>
          <span>State: {engineState}</span>
          <span>Started: {debug.engineStartedAt}</span>
          <span>Tick: {debug.engineTick}</span>
          <span>Match: {sessionFixture.id}</span>
          <span>Action: {debug.lastEngineAction}</span>
          <span>Duplicate blocked: {debug.duplicateCompletionPrevented ? 'true' : 'false'}</span>
          <span>Timers: {debug.timerCount} / {debug.timerActive ? 'active' : 'idle'}</span>
        </div>
      </details>
    </section>
  );
}

export default memo(MatchEnginePanelComponent, (previous, next) => (
  previous.matchSessionId === next.matchSessionId
  && previous.autoContinue === next.autoContinue
  && previous.speed === next.speed
  && previous.homeName === next.homeName
  && previous.awayName === next.awayName
  && previous.onCompleted === next.onCompleted
  && previous.onSkipped === next.onSkipped
  && previous.onDismissSkipped === next.onDismissSkipped
  && previous.onAutoContinueChange === next.onAutoContinueChange
  && previous.onSpeedChange === next.onSpeedChange
));
