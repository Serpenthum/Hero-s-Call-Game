import React from 'react';
import { DiceIcon, SwordsIcon, FlameIcon, TowerIcon } from './ModeIcons';

export interface ModeCardSpec {
  mode: 'random' | 'draft' | 'survival' | 'gauntlet';
  title: string;
  text: string;
  tag: 'Normal' | 'Ranked';
  playLabel: string;
  extraClass?: string;
  onActivate(): void;
}

interface ModeCardsProps {
  modes: ModeCardSpec[];
  searchingMode: string | null;
  searchClock: string;
  onLeaveQueue(): void;
}

const ICONS: Record<ModeCardSpec['mode'], React.FC<{ className?: string }>> = {
  random: DiceIcon,
  draft: SwordsIcon,
  survival: FlameIcon,
  gauntlet: TowerIcon,
};

// The modes on the table: Random first and wider, then the ranked modes the player has unlocked.
const ModeCards: React.FC<ModeCardsProps> = ({ modes, searchingMode, searchClock, onLeaveQueue }) => (
  <div className="mode-cards" data-count={modes.length}>
    {modes.map(spec => {
      const searching = searchingMode === spec.mode;
      const ModeIcon = ICONS[spec.mode];
      const classes = [
        'mode-card',
        `mode-card--${spec.mode}`,
        spec.mode === 'random' ? 'mode-card--main' : '',
        searching ? 'mode-card--searching' : '',
        spec.extraClass?.trim() ?? '',
      ].filter(Boolean).join(' ');
      return (
        <div key={spec.mode} className={classes} onClick={searching ? undefined : spec.onActivate}>
          <div className="mode-card-head">
            <span className="mode-card-icon"><ModeIcon /></span>
            <h3 className="mode-card-title">{spec.title}</h3>
            <span className="mode-card-tag">{spec.tag}</span>
          </div>
          <p className="mode-card-text">{searching ? `Finding an opponent · ${searchClock}` : spec.text}</p>
          {searching ? (
            <button
              type="button"
              className="mode-card-go mode-card-go--leave"
              onClick={e => { e.stopPropagation(); onLeaveQueue(); }}
            >
              Leave queue
            </button>
          ) : (
            <button
              type="button"
              className="mode-card-go"
              onClick={e => { e.stopPropagation(); spec.onActivate(); }}
            >
              {spec.playLabel}
            </button>
          )}
        </div>
      );
    })}
  </div>
);

export default ModeCards;
