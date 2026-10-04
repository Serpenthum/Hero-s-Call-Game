import React, { useEffect, useState } from 'react';
import { startFuseSound } from '../battleAnimations';
import '../styles/TurnTimerBar.css';

const WARNING_MS = 10000;

interface TurnTimerBarProps {
  deadline: number;
  durationMs: number;
}

// Hidden until the last 10 seconds of the turn, then burns down like a fuse.
const TurnTimerBar: React.FC<TurnTimerBarProps> = ({ deadline, durationMs }) => {
  const [burnMs, setBurnMs] = useState<number | null>(null);

  useEffect(() => {
    const warningMs = Math.min(WARNING_MS, durationMs);
    let stopSound: (() => void) | null = null;

    const begin = () => {
      const remaining = Math.min(warningMs, deadline - Date.now());
      if (remaining <= 0) return;
      setBurnMs(remaining);
      stopSound = startFuseSound(remaining / 1000);
    };

    const delay = deadline - Date.now() - warningMs;
    const timeout = delay > 0 ? window.setTimeout(begin, delay) : undefined;
    if (delay <= 0) begin();

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      stopSound?.();
    };
  }, [deadline, durationMs]);

  if (burnMs === null) return null;

  const startPercent = Math.min(100, (burnMs / Math.min(WARNING_MS, durationMs)) * 100);

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
