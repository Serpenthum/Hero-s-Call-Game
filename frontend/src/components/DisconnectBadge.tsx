import React, { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import { forfeitLabel, secondsLeft } from '../reconnect';
import '../styles/DisconnectBadge.css';

const GRACE_MS = 30000;

// Re-renders a few times a second until the deadline passes
function useNow(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return now;
}

interface DeadlineProps {
  // When the seat is given up, on the local clock; null when unknown
  deadline: number | null;
}

// Laid over a disconnected player's avatar: the seconds left, and a bar that runs down with them.
export const DisconnectOverlay: React.FC<DeadlineProps> = ({ deadline }) => {
  const now = useNow(deadline);
  const left = deadline === null ? GRACE_MS : Math.max(0, deadline - now);
  return (
    <span className="disconnect-overlay" aria-hidden="true">
      <span className="disconnect-overlay__count">
        {deadline === null ? <Icon name="wifiOff" /> : secondsLeft(deadline, now)}
      </span>
      <span className="disconnect-overlay__bar" style={{ width: `${Math.min(100, (left / GRACE_MS) * 100)}%` }} />
    </span>
  );
};

interface DisconnectCaptionProps extends DeadlineProps {
  name: string;
  // The viewer wins if this player doesn't come back (their opponent, not a spectator)
  viewerIsOpponent: boolean;
}

// Under the avatar: says the player dropped out and how long until the seat is given up.
export const DisconnectCaption: React.FC<DisconnectCaptionProps> = ({ deadline, name, viewerIsOpponent }) => {
  const now = useNow(deadline);
  const seconds = deadline === null ? null : secondsLeft(deadline, now);
  return (
    <div className="disconnect-caption">
      {/* Announced once; the ticking count below is not read out every second */}
      <span className="disconnect-caption__title" role="status">
        <Icon name="wifiOff" size={14} /> Disconnected<span className="disconnect-caption__sr">: {name}</span>
      </span>
      <span className="disconnect-caption__count" aria-live="off">{forfeitLabel(seconds, viewerIsOpponent)}</span>
    </div>
  );
};
