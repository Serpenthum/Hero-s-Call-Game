import React from 'react';
import HeroCard from '../HeroCard';
import useCardGrid from '../../hooks/useCardGrid';
import type { GauntletRunState, Hero } from '../../types';
import '../../styles/ResponsiveCardGrid.css';

export type CampPick = 'heal' | 'temp_res' | null;

interface RosterSheetProps {
  roster: GauntletRunState['roster'];
  teamIndices: number[];
  pick: CampPick;
  locked: boolean; // while searching or fighting the team cannot change
  onToggleTeam: (index: number) => void;
  onPick: (index: number) => void;
}

const RosterSheet: React.FC<RosterSheetProps> = ({ roster, teamIndices, pick, locked, onToggleTeam, onPick }) => {
  const grid = useCardGrid({ packCount: Math.max(1, roster.length) });

  return (
    <div className="responsive-card-viewport gt-roster" ref={grid.ref} style={grid.style}>
      <div className="responsive-card-grid">
        {roster.map((instance, index) => {
          const fallen = !instance.alive && !instance.temporary_resurrection_active;
          const revived = instance.temporary_resurrection_active;
          const hurt = instance.alive && instance.current_hp < instance.max_hp;
          const place = teamIndices.indexOf(index);
          const target = (pick === 'heal' && hurt) || (pick === 'temp_res' && fallen);
          const hero: Hero = { ...instance.hero, currentHP: instance.current_hp, maxHP: instance.max_hp };
          const percent = Math.max(0, Math.min(100, Math.round((instance.current_hp / instance.max_hp) * 100)));
          const clickable = pick ? target : !locked && !fallen;
          const status = fallen ? 'Fallen' : revived ? 'Returns for one battle' : place >= 0 ? `On the team, place ${place + 1}` : hurt ? 'Wounded' : 'Ready';

          return (
            <div
              key={`${instance.hero_id}-${index}`}
              className={`gt-slot${fallen ? ' is-fallen' : ''}${place >= 0 ? ' is-on-team' : ''}${pick ? (target ? ' is-target' : ' is-dim') : ''}`}
            >
              <button
                type="button"
                className="gt-slot-hit"
                disabled={!clickable}
                aria-label={`${instance.hero_id}: ${status}, ${instance.current_hp} of ${instance.max_hp} health`}
                aria-pressed={pick ? undefined : place >= 0}
                onClick={() => (pick ? onPick(index) : onToggleTeam(index))}
              >
                <HeroCard hero={hero} showFullInfo={false} disableHPAnimations />
              </button>
              {place >= 0 && <span className="gt-place" aria-hidden="true">{place + 1}</span>}
              <div className="ui-hpbar gt-hp" aria-hidden="true"><div className="ui-hpbar__fill" style={{ width: `${percent}%` }} /></div>
              <p className={`gt-status${fallen ? ' is-fallen' : revived ? ' is-revived' : ''}`}>{status}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RosterSheet;
