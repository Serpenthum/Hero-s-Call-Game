import React, { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import config from '../config';
import { countdownFraction, DisconnectCountdown, forfeitLabel, secondsLeft } from '../reconnect';
import '../styles/DisconnectBadge.css';

// Re-renders a few times a second while a countdown runs
function useNow(countdown: DisconnectCountdown | null): number {
  const [now, setNow] = useState(() => Date.now());
  const deadline = countdown?.deadline ?? null;
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return now;
}

interface CountdownProps {
  // The dropped player's countdown on the local clock; null when it is not known
  countdown: DisconnectCountdown | null;
}

// Laid over a disconnected player's avatar: the seconds left, and a bar that runs down with them.
// The bar is sized from the countdown's own length (the server may start it under 30 s).
export const DisconnectOverlay: React.FC<CountdownProps> = ({ countdown }) => {
  const now = useNow(countdown);
  return (
    <span className="disconnect-overlay" aria-hidden="true">
      <span className="disconnect-overlay__count">
        {countdown === null ? <Icon name="wifiOff" /> : secondsLeft(countdown.deadline, now)}
      </span>
      <span className="disconnect-overlay__bar" style={{ width: `${countdownFraction(countdown, now) * 100}%` }} />
    </span>
  );
};

interface DisconnectCaptionProps extends CountdownProps {
  name: string;
  // The viewer wins if this player doesn't come back (their opponent, not a spectator)
  viewerIsOpponent: boolean;
}

// Under the avatar: says the player dropped out and how long until the seat is given up.
export const DisconnectCaption: React.FC<DisconnectCaptionProps> = ({ countdown, name, viewerIsOpponent }) => {
  const now = useNow(countdown);
  const seconds = countdown === null ? null : secondsLeft(countdown.deadline, now);
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

interface DisconnectNoticeProps extends DisconnectCaptionProps {
  profileIcon?: string;
}

// A self-contained sign for screens without a battle avatar (the draft, the initiative roll):
// the player's portrait with the countdown over it, their name, and the caption.
export const DisconnectNotice: React.FC<DisconnectNoticeProps> = ({ countdown, name, viewerIsOpponent, profileIcon }) => (
  <div className="disconnect-notice">
    <span className="profile-icon-frame disconnect-notice__portrait">
      <img
        src={`${config.IMAGE_BASE_URL}/hero-images/${(profileIcon || 'sorcerer').toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`}
        alt=""
        className="disconnect-notice__img"
      />
      <DisconnectOverlay countdown={countdown} />
    </span>
    <div className="disconnect-notice__text">
      <span className="disconnect-notice__name">{name}</span>
      <DisconnectCaption countdown={countdown} name={name} viewerIsOpponent={viewerIsOpponent} />
    </div>
  </div>
);
