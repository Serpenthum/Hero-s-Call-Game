import React, { useEffect, useState } from 'react';

interface DraftClockProps {
  // Epoch milliseconds when the round ends
  deadline: number;
  durationMs: number;
  action: 'ban' | 'pick';
}

// The dial only appears for the last 10 seconds of a round
const SHOW_AT_MS = 10000;
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DraftClock: React.FC<DraftClockProps> = ({ deadline, action }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, deadline - now);
  // At zero the server has already played for you
  if (remaining > SHOW_AT_MS || remaining <= 0) return null;

  const seconds = Math.ceil(remaining / 1000);
  const fraction = remaining / SHOW_AT_MS;
  const verb = action === 'ban' ? 'banned' : 'picked';
  return (
    <div
      className={`draft-clock${seconds <= 3 ? ' draft-clock--urgent' : ''}`}
      role="timer"
      aria-label={`${seconds} seconds left. A random card will be ${verb} for you.`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="draft-clock-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="draft-clock-hand"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="draft-clock-seconds">{seconds}</span>
      <span className="draft-clock-note">{action === 'ban' ? 'Auto-ban' : 'Auto-pick'}</span>
    </div>
  );
};

export default DraftClock;
