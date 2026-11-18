import React, { useEffect, useState } from 'react';
import { startClockSound } from '../battleAnimations';
import '../styles/TurnTimerBar.css';

const WARNING_MS = 10000;

interface TurnTimerBarProps {
  deadline: number;
  durationMs: number;
  // The server stopped the clock (a player is disconnected) with remainingMs left on it
  paused?: boolean;
  remainingMs?: number;
}

// Hidden until the last 10 seconds of the turn, then burns down like a fuse. A stopped clock holds still.
const TurnTimerBar: React.FC<TurnTimerBarProps> = ({ deadline, durationMs, paused = false, remainingMs }) => {
  const [burnMs, setBurnMs] = useState<number | null>(null);
  const warningMs = Math.min(WARNING_MS, durationMs);

  useEffect(() => {
    if (paused) return;
    let stopSound: (() => void) | null = null;

    const begin = () => {
      const remaining = Math.min(warningMs, deadline - Date.now());
      if (remaining <= 0) return;
      setBurnMs(remaining);
      stopSound = startClockSound(remaining / 1000);
    };

    const delay = deadline - Date.now() - warningMs;
    const timeout = delay > 0 ? window.setTimeout(begin, delay) : undefined;
    if (delay <= 0) begin();

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      stopSound?.();
    };
  }, [deadline, warningMs, paused]);

  if (paused) {
    // Only shown if it was already burning, so it doesn't pop up mid-turn
    const left = remainingMs ?? 0;
    if (left <= 0 || left > warningMs) return null;
    return (
      <div className="turn-timer-bar turn-timer-bar--paused" role="timer" aria-label="Turn clock stopped">
        <div className="turn-timer-fill" style={{ ['--burn-start' as string]: `${(left / warningMs) * 100}%` }} />
      </div>
    );
  }

  if (burnMs === null) return null;

  const startPercent = Math.min(100, (burnMs / warningMs) * 100);

  return (
    <div className="turn-timer-bar" role="timer" aria-label="Time left in your turn">
      <div
        className="turn-timer-fill"
        style={{
          ['--burn-start' as string]: `${startPercent}%`,
          animationDuration: `${burnMs}ms`
        }}
      />
    </div>
  );
};

export default TurnTimerBar;
