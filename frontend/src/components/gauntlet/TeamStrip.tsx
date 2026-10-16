import React from 'react';
import Icon from '../ui/Icon';
import { bracketOf } from './TrialMap';
import type { GauntletRunState } from '../../types';

interface TeamStripProps {
  runState: GauntletRunState;
  teamIndices: number[];
  searching: boolean;
  onRemove: (index: number) => void;
  onStart: () => void;
  onCancelSearch: () => void;
}

// Three places, in turn order. The roster below is where heroes are picked.
const TeamStrip: React.FC<TeamStripProps> = ({ runState, teamIndices, searching, onRemove, onStart, onCancelSearch }) => {
  const missing = 3 - teamIndices.length;
  const bracket = bracketOf(runState.current_trial);

  return (
    <section className="gt-team ui-panel" aria-label="Trial team">
      <div className="gt-team-places">
        {[0, 1, 2].map(place => {
          const index = teamIndices[place];
          const instance = index === undefined ? null : runState.roster[index];
          return (
            <div key={place} className={`gt-place-chip${instance ? ' is-filled' : ''}`}>
              <span className="gt-place-number">{place + 1}</span>
              {instance ? (
                <>
                  <span className="gt-place-name">{instance.hero_id}</span>
                  <span className="gt-place-hp">{instance.current_hp}/{instance.max_hp}</span>
                  {!searching && (
                    <button type="button" className="gt-place-remove" aria-label={`Take ${instance.hero_id} off the team`} onClick={() => onRemove(index)}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </>
              ) : (
                <span className="gt-place-empty">Pick a hero</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="gt-team-go">
        {searching ? (
          <>
            <p className="gt-searching" role="status">
              Looking for an opponent in bracket {bracket}
              <span className="placard-dots" aria-hidden="true"><span className="dot"></span><span className="dot"></span><span className="dot"></span></span>
            </p>
            <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" onClick={onCancelSearch}>Stop looking</button>
          </>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn--primary" disabled={missing > 0} onClick={onStart}>
              <Icon name="swords" /> Start trial {runState.current_trial}
            </button>
            {missing > 0 && <p className="gt-hint">Pick {missing} more {missing === 1 ? 'hero' : 'heroes'}.</p>}
          </>
        )}
      </div>
    </section>
  );
};

export default TeamStrip;
