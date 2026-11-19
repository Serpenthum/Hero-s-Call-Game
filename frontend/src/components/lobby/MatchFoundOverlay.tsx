import React, { useEffect, useRef, useState } from 'react';
import config from '../../config';
import { getAnimSpeed } from '../../battleAnimations';
import { heroImageUrl } from '../../lobby/lobbyRules';
import '../../styles/MatchFound.css';

interface MatchPlayer {
  name: string;
  icon: string | null;
}

interface MatchFoundOverlayProps {
  me: MatchPlayer;
  them: MatchPlayer;
  onDone(): void;
}

// The whole moment lasts under two seconds: the draft clock is already running underneath.
// Keep these in step with MatchFound.css (the fade-out there is 400 ms).
export const MATCH_FOUND_FADE_AT_MS = 1450;
export const MATCH_FOUND_DONE_AT_MS = 1850;

// A player's portrait: their profile hero, or a brass frame with their initial when there is none
// (or its picture does not load).
const Portrait: React.FC<{ player: MatchPlayer }> = ({ player }) => {
  const [failed, setFailed] = useState(false);
  if (player.icon && !failed) {
    return (
      <img
        className="match-found-portrait"
        src={heroImageUrl(config.IMAGE_BASE_URL, player.icon)}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="match-found-portrait match-found-portrait--initial" aria-hidden="true">
      {(player.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
};

// Keys that skip the overlay (other keys, e.g. a modifier or a shortcut, leave it playing)
export const isSkipKey = (key: string) => key === 'Escape' || key === 'Enter' || key === ' ';

// "Match found": both players slide in and VS slams between them, over the game screen that has
// already started underneath. It leaves by itself; a tap, Escape, Enter or Space skips it.
const MatchFoundOverlay: React.FC<MatchFoundOverlayProps> = ({ me, them, onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), MATCH_FOUND_FADE_AT_MS);
    const done = window.setTimeout(() => doneRef.current(), MATCH_FOUND_DONE_AT_MS);
    const onKey = (e: KeyboardEvent) => {
      if (isSkipKey(e.key)) doneRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const classes = [
    'match-found',
    getAnimSpeed() === 'off' ? 'match-found--still' : '',
    leaving ? 'match-found--leaving' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" onClick={onDone}>
      <div className="match-found-caption">Match found</div>
      <div className="match-found-row">
        <div className="match-found-player match-found-player--me">
          <Portrait player={me} />
          <span className="match-found-name">{me.name}</span>
        </div>
        <div className="match-found-clash">
          <div className="match-found-flash" aria-hidden="true" />
          <div className="match-found-vs">VS</div>
        </div>
        <div className="match-found-player match-found-player--them">
          <Portrait player={them} />
          <span className="match-found-name">{them.name}</span>
        </div>
      </div>
    </div>
  );
};

export default MatchFoundOverlay;
