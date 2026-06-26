'use client';

import { useEffect, useRef, useState } from 'react';
import { FastForward, Flag, Gauge, HeartPulse, RefreshCw, ShieldAlert, SkipForward } from 'lucide-react';
import type {
  CompetitionFixture,
  MatchIncident,
  MatchResult,
  PenaltyKick,
} from '@/lib/competitionEngine';
import {
  calculateMomentum,
  createMatchAnimationState,
  eventToAnimationState,
  flowEventForMinute,
  type MatchSide,
  type MatchVisualEvent,
  type MomentumSample,
} from '@/lib/matchAnimation';
import MatchPitchAnimation from './MatchPitchAnimation';

type MatchPhase = 'normal' | 'extra-time' | 'penalties' | 'finished';

interface TimelineEntry {
  id: string;
  minute: string;
  text: string;
  tone: 'neutral' | 'goal' | 'warning' | 'danger' | 'change' | 'penalty';
}

const CHECKPOINTS = [5, 12, 23, 37, 45, 60, 75, 90];
const EXTRA_TIME_CHECKPOINTS = [105, 120];
const MANAGER_CHECKPOINTS = [3, 6, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 90];
const MANAGER_EXTRA_TIME_CHECKPOINTS = [95, 100, 105, 110, 115, 120];
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const incidentText = (incident: MatchIncident, teamName: string) => {
  if (incident.type === 'goal') return `GOL - ${teamName}: ${incident.playerName}`;
  if (incident.type === 'yellow-card') return `Sarı kart - ${incident.playerName}`;
  if (incident.type === 'substitution') return `Oyuncu değişikliği - ${incident.relatedPlayerName ?? 'Oyuncu'} çıktı, ${incident.playerName} girdi`;
  return `Sakatlık - ${incident.playerName}`;
};

const incidentTone = (incident: MatchIncident): TimelineEntry['tone'] => {
  if (incident.type === 'goal') return 'goal';
  if (incident.type === 'yellow-card') return 'warning';
  if (incident.type === 'substitution') return 'change';
  return 'danger';
};

const flowText = (event: MatchVisualEvent, sideName: string) => {
  if (event === 'pass') return `${sideName} pas trafiği kuruyor`;
  if (event === 'attack') return `${sideName} hücuma çıkıyor`;
  if (event === 'shot') return `${sideName} şut açısı arıyor`;
  if (event === 'save') return 'Kaleci bölgesinde tehlike savuşturuldu';
  if (event === 'foul') return 'Faul düdüğü, oyun kısa süre durdu';
  return 'Oyun akıyor';
};

const toneClasses: Record<TimelineEntry['tone'], string> = {
  neutral: 'border-white/15 bg-white/5',
  goal: 'border-green-400 bg-green-500/15 text-green-300',
  warning: 'border-yellow-400 bg-yellow-500/15 text-yellow-200',
  danger: 'border-red-500 bg-red-500/15 text-red-200',
  change: 'border-blue-400 bg-blue-500/15 text-blue-200',
  penalty: 'border-purple-400 bg-purple-500/15 text-purple-200',
};

const createInitialTimeline = (): TimelineEntry[] => [{
  id: 'kick-off',
  minute: "0'",
  text: 'Maç başladı',
  tone: 'neutral',
}];

export default function LiveMatchPanel({
  fixture,
  result,
  homeName,
  awayName,
  onComplete,
  onSkip,
  simulationMode = 'quick',
}: {
  fixture: CompetitionFixture;
  result: MatchResult;
  homeName: string;
  awayName: string;
  onComplete: () => void;
  onSkip?: () => void;
  simulationMode?: 'quick' | 'manager';
}) {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<MatchPhase>('normal');
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [penaltyScore, setPenaltyScore] = useState({ home: 0, away: 0 });
  const [timeline, setTimeline] = useState<TimelineEntry[]>(createInitialTimeline);
  const [animationState, setAnimationState] = useState(createMatchAnimationState);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const speedRef = useRef<'normal' | 'fast'>('normal');
  const skipRef = useRef(false);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  const addEntry = (entry: TimelineEntry) => {
    setTimeline((items) => [...items, entry]);
  };

  useEffect(() => {
    let cancelled = false;
    let runningScore = { home: 0, away: 0 };
    let animationSequence = 0;
    let momentumSamples: MomentumSample[] = [];
    skipRef.current = false;
    speedRef.current = 'normal';
    const isManagerMode = simulationMode === 'manager';
    const normalCheckpoints = isManagerMode ? MANAGER_CHECKPOINTS : CHECKPOINTS;
    const extraCheckpoints = isManagerMode ? MANAGER_EXTRA_TIME_CHECKPOINTS : EXTRA_TIME_CHECKPOINTS;

    const wait = async () => {
      if (skipRef.current) return;
      const duration = speedRef.current === 'fast' ? 95 : isManagerMode ? 1050 : 430;
      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
    };

    const resetMatchState = () => {
      runningScore = { home: 0, away: 0 };
      setMinute(0);
      setPhase('normal');
      setScore(runningScore);
      setPenaltyScore({ home: 0, away: 0 });
      setTimeline(createInitialTimeline());
      setAnimationState(createMatchAnimationState());
      setSpeed('normal');
      momentumSamples = [];
    };

    const showAnimation = (
      event: MatchVisualEvent,
      side: MatchSide,
      minuteLabel: string,
    ) => {
      animationSequence += 1;
      momentumSamples = [...momentumSamples, { event, side }].slice(-8);
      setAnimationState(eventToAnimationState({
        event,
        side,
        minuteLabel,
        sequence: animationSequence,
        momentum: calculateMomentum(momentumSamples),
      }));
    };

    const revealIncident = async (incident: MatchIncident, index: number) => {
      if (cancelled) return;
      const side: MatchSide = incident.teamId === fixture.homeTeamId ? 'home' : 'away';
      if (incident.type === 'goal') {
        runningScore = {
          home: runningScore.home + (incident.teamId === fixture.homeTeamId ? 1 : 0),
          away: runningScore.away + (incident.teamId === fixture.awayTeamId ? 1 : 0),
        };
        setScore(runningScore);
      }
      showAnimation(
        incident.type === 'goal'
          ? 'goal'
          : incident.type === 'yellow-card'
            ? 'yellowCard'
            : incident.type === 'substitution'
              ? 'pass'
              : 'injury',
        side,
        `${incident.minute}'`,
      );
      addEntry({
        id: `incident-${incident.minute}-${index}`,
        minute: `${incident.minute}'`,
        text: incidentText(
          incident,
          incident.teamId === fixture.homeTeamId ? homeName : awayName,
        ),
        tone: incidentTone(incident),
      });
      await wait();
    };

    const playMinutes = async (
      from: number,
      to: number,
      checkpoints: number[],
      incidents: MatchIncident[],
    ) => {
      const moments = Array.from(new Set([
        ...checkpoints,
        ...incidents.map((incident) => incident.minute),
      ]))
        .filter((value) => value >= from && value <= to)
        .sort((a, b) => a - b);

      for (const moment of moments) {
        if (cancelled) return;
        setMinute(moment);
        const currentIncidents = incidents.filter((incident) => incident.minute === moment);
        if (currentIncidents.length === 0) {
          const flowEvent = moment === 45 ? 'halftime' : flowEventForMinute(moment);
          const side: MatchSide = moment === 45 ? 'neutral' : moment % 2 === 0 ? 'home' : 'away';
          showAnimation(
            flowEvent,
            side,
            `${moment}'`,
          );
          if (isManagerMode && flowEvent !== 'halftime') {
            addEntry({
              id: `flow-${moment}`,
              minute: `${moment}'`,
              text: flowText(flowEvent, side === 'home' ? homeName : awayName),
              tone: flowEvent === 'foul' ? 'warning' : 'neutral',
            });
          }
          await wait();
        }
        for (let index = 0; index < currentIncidents.length; index += 1) {
          await revealIncident(currentIncidents[index], index);
        }
      }
    };

    const revealPenalty = async (kick: PenaltyKick) => {
      if (cancelled) return;
      const side: MatchSide = kick.teamId === fixture.homeTeamId ? 'home' : 'away';
      setPenaltyScore({ home: kick.homeScore, away: kick.awayScore });
      showAnimation(kick.scored ? 'penaltyGoal' : 'penaltyMiss', side, `P${kick.order}`);
      addEntry({
        id: `penalty-${kick.order}`,
        minute: `P${kick.order}`,
        text: `${kick.teamId === fixture.homeTeamId ? homeName : awayName} - ${kick.playerName}: ${kick.scored ? 'Gol' : 'Kaçtı'}`,
        tone: 'penalty',
      });
      await wait();
    };

    const run = async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (cancelled) return;
      resetMatchState();

      const normalIncidents = result.incidents.filter((incident) => incident.minute <= 90);
      await playMinutes(1, 90, normalCheckpoints, normalIncidents);
      if (cancelled) return;

      addEntry({
        id: 'normal-time',
        minute: "90'",
        text: result.extraTime ? 'Normal süre berabere bitti. Uzatma başlıyor.' : 'Normal süre tamamlandı.',
        tone: 'neutral',
      });
      showAnimation(result.extraTime ? 'extraTime' : 'fulltime', 'neutral', "90'");
      await wait();

      if (result.extraTime) {
        setPhase('extra-time');
        showAnimation('extraTime', 'neutral', "90+");
        const extraIncidents = result.incidents.filter((incident) => incident.minute > 90);
        await playMinutes(91, 120, extraCheckpoints, extraIncidents);
        if (cancelled) return;
        addEntry({
          id: 'extra-time',
          minute: "120'",
          text: result.penalties ? 'Uzatma berabere bitti. Penaltılar başlıyor.' : 'Uzatma tamamlandı.',
          tone: 'neutral',
        });
        showAnimation(result.penalties ? 'penaltyShootout' : 'fulltime', 'neutral', "120'");
        await wait();
      }

      if (result.penalties && result.penaltyKicks) {
        setPhase('penalties');
        showAnimation('penaltyShootout', 'neutral', 'PEN');
        for (const kick of result.penaltyKicks) await revealPenalty(kick);
      }

      if (cancelled) return;
      setPhase('finished');
      setMinute(result.extraTime ? 120 : 90);
      addEntry({
        id: 'finished',
        minute: 'FT',
        text: 'Maç sona erdi.',
        tone: 'neutral',
      });
      showAnimation('fulltime', 'neutral', 'FT');
      completeRef.current();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [awayName, fixture.awayTeamId, fixture.homeTeamId, homeName, result, simulationMode]);

  const toggleSpeed = () => {
    const next = speed === 'normal' ? 'fast' : 'normal';
    speedRef.current = next;
    setSpeed(next);
  };

  const skipToResult = () => {
    skipRef.current = true;
    speedRef.current = 'fast';
    setSpeed('fast');
    onSkip?.();
  };

  const statProgress = phase === 'finished' || phase === 'penalties'
    ? 1
    : clampNumber(minute / (result.extraTime ? 120 : 90), 0.08, 1);
  const liveStats = {
    shotsHome: Math.max(score.home, Math.round(result.stats.shotsHome * statProgress)),
    shotsAway: Math.max(score.away, Math.round(result.stats.shotsAway * statProgress)),
    shotsOnTargetHome: Math.max(score.home, Math.round(result.stats.shotsOnTargetHome * statProgress)),
    shotsOnTargetAway: Math.max(score.away, Math.round(result.stats.shotsOnTargetAway * statProgress)),
    passesHome: Math.round(result.stats.passesHome * statProgress),
    passesAway: Math.round(result.stats.passesAway * statProgress),
    foulsHome: Math.round(result.stats.foulsHome * statProgress),
    foulsAway: Math.round(result.stats.foulsAway * statProgress),
  };

  return (
    <section className="mt-7 border-4 border-black bg-zinc-950 p-5 text-white shadow-[7px_7px_0px_0px_#000]">
      <div className="flex flex-col gap-5 border-b-2 border-white/15 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-400">Canlı Maç</p>
          <p className="mt-1 text-4xl font-black tabular-nums">
            {phase === 'penalties' ? 'PEN' : `${minute}'`}
          </p>
        </div>
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-4">
          <p className="text-right text-lg font-black uppercase">{homeName}</p>
          <div className="text-center">
            <p className="whitespace-nowrap text-5xl font-black tabular-nums">{score.home} - {score.away}</p>
            {(phase === 'penalties' || phase === 'finished') && result.penalties && (
              <p className="mt-1 text-xs font-black text-purple-300">
                Penaltılar: {penaltyScore.home} - {penaltyScore.away}
              </p>
            )}
          </div>
          <p className="text-left text-lg font-black uppercase">{awayName}</p>
        </div>
      </div>

      <MatchPitchAnimation
        state={animationState}
        homeName={homeName}
        awayName={awayName}
        score={score}
        penaltyScore={penaltyScore}
        showPenaltyScore={(phase === 'penalties' || phase === 'finished') && Boolean(result.penalties)}
      />

      <div className="mt-4 grid gap-2 border-2 border-white/10 bg-black/25 p-3 sm:grid-cols-5">
        <LiveStat label="Şut" home={liveStats.shotsHome} away={liveStats.shotsAway} />
        <LiveStat label="İsabetli Şut" home={liveStats.shotsOnTargetHome} away={liveStats.shotsOnTargetAway} />
        <LiveStat label="Topa Sahip Olma" home={`%${result.stats.possessionHome}`} away={`%${100 - result.stats.possessionHome}`} />
        <LiveStat label="Pas" home={liveStats.passesHome} away={liveStats.passesAway} />
        <LiveStat label="Faul" home={liveStats.foulsHome} away={liveStats.foulsAway} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleSpeed}
          className="game-button flex items-center gap-2 border-2 border-white/25 bg-zinc-900 px-4 py-2 text-[10px] font-black uppercase"
        >
          {speed === 'fast' ? <Gauge size={16} /> : <FastForward size={16} />}
          {speed === 'fast' ? 'Normal hız' : 'Simülasyonu hızlandır'}
        </button>
        <button
          type="button"
          onClick={skipToResult}
          className="game-button flex items-center gap-2 border-2 border-black bg-yellow-500 px-4 py-2 text-[10px] font-black uppercase text-black"
        >
          <SkipForward size={16} /> Sonuca atla
        </button>
      </div>

      <div className="mt-5 max-h-80 space-y-2 overflow-y-auto border-t border-white/10 pt-4" aria-live="polite">
        {[...timeline].reverse().map((entry) => (
          <div key={entry.id} className={`grid grid-cols-[3rem_auto_1fr] items-center gap-3 border-l-4 p-3 text-xs font-black ${toneClasses[entry.tone]}`}>
            <span className="tabular-nums">{entry.minute}</span>
            {entry.tone === 'goal' ? <Flag size={15} /> :
              entry.tone === 'warning' ? <ShieldAlert size={15} /> :
                entry.tone === 'danger' ? <HeartPulse size={15} /> :
                  entry.tone === 'change' ? <RefreshCw size={15} /> :
                    <span className="h-2 w-2 bg-current" />}
            <span>{entry.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveStat({
  label,
  home,
  away,
}: {
  label: string;
  home: string | number;
  away: string | number;
}) {
  return (
    <div className="border border-white/10 bg-zinc-950 px-3 py-2 text-center">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-black tabular-nums text-white">
        {home} <span className="text-white/35">/</span> {away}
      </p>
    </div>
  );
}
