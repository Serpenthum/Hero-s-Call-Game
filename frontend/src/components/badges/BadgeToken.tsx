import React from 'react';
import type { Badge, BadgeKey } from '../../battle/badges';
import '../../styles/Badges.css';

// The badge's name, shown above the full sentence where there is room (phones show the short form instead)
const BADGE_NAMES: Record<BadgeKey, string> = {
  turrets: 'Turrets',
  totems: 'Totems',
  medBots: 'Med Bots',
  beast: 'Beast',
  bloodbath: 'Bloodbath',
  frenzy: 'Frenzy',
  desperateBlows: 'Desperate Blows',
  hidden: 'Hidden',
  arcaneShield: 'Arcane Shield',
  windWall: 'Wind Wall',
  poison: 'Poison',
  taunted: 'Taunted',
  tauntComing: 'Taunt coming',
  silenced: 'Silenced',
  stunned: 'Stunned',
  bribed: 'Bribed',
  guidingBolt: 'Guiding Bolt',
  rideDown: 'Ride Down',
  healthLink: 'Health Link',
  defenseDown: 'Defense down',
  arcaneMark: 'Arcane mark',
};

interface BadgeTokenProps {
  badge: Badge;
  open: boolean;
  onToggle: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

// One round badge on a battle card, with its helper bubble while open. The owner of `open` decides what a tap
// and a hover do; this only reports them. It does not stop the tap from reaching the card: the card does.
const BadgeToken: React.FC<BadgeTokenProps> = ({ badge, open, onToggle, onHoverChange }) => {
  const hover = (hovering: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') onHoverChange?.(hovering);
  };
  return (
    <span className={`badge-token badge-${badge.rim}${badge.dashed ? ' badge-dashed' : ''}`} data-badge={badge.key}>
      <button
        type="button"
        className="badge-token-btn"
        aria-expanded={open}
        aria-label={`${badge.short}. ${badge.full}`}
        onClick={onToggle}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><use href={`#${badge.symbol}`} /></svg>
        {badge.count && <span className="badge-count">{badge.count}</span>}
      </button>
      {open && (
        <span role="tooltip" className="badge-tip">
          <strong className="badge-tip-name">{BADGE_NAMES[badge.key]}</strong>
          <span className="badge-tip-short">{badge.short}</span>
          <span className="badge-tip-full">{badge.full}</span>
        </span>
      )}
    </span>
  );
};

export default BadgeToken;
