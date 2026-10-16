import React from 'react';
import HeroCard from '../HeroCard';
import useCardGrid from '../../hooks/useCardGrid';
import type { GauntletHeroOffer, GauntletRunState, Hero } from '../../types';
import '../../styles/ResponsiveCardGrid.css';

interface OfferPanelProps {
  offer: GauntletHeroOffer[];
  runState: GauntletRunState;
  fromBattle: boolean; // the free offer after a battle can be skipped for good; a camp offer can be put away
  replacing: string | null; // set when the roster is full and a hero must make room
  busy: boolean;
  onChoose: (heroName: string) => void;
  onReplace: (rosterIndex: number) => void;
  onReroll: () => void;
  onLeave: () => void;
  onCancelReplace: () => void;
}

const OfferPanel: React.FC<OfferPanelProps> = ({ offer, runState, fromBattle, replacing, busy, onChoose, onReplace, onReroll, onLeave, onCancelReplace }) => {
  const grid = useCardGrid({ packCount: offer.length || 1 });

  if (replacing) {
    return (
      <div className="gt-offer ui-panel">
        <h2 className="gt-heading">Who makes room for {replacing}?</h2>
        <p className="gt-hint">Your roster is full. The hero you pick leaves the run for good.</p>
        <ul className="gt-replace-list">
          {runState.roster.map((instance, index) => {
            const fallen = !instance.alive && !instance.temporary_resurrection_active;
            return (
              <li key={`${instance.hero_id}-${index}`}>
                <button type="button" className="gt-replace" disabled={busy} onClick={() => onReplace(index)}>
                  <span className="gt-replace-name">{instance.hero_id}</span>
                  <span className={`gt-replace-hp${fallen ? ' is-fallen' : ''}`}>{fallen ? 'Fallen' : `${instance.current_hp}/${instance.max_hp}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="gt-offer-actions">
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onCancelReplace}>Back to the offer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gt-offer ui-panel">
      <h2 className="gt-heading">{fromBattle ? 'A new hero offers to join' : 'Hire a hero'}</h2>
      <p className="gt-hint">Choose one. {runState.roster.length >= 6 ? 'Your roster is full, so one hero will leave.' : 'They join your roster at full health.'}</p>
      <div className="responsive-card-viewport gt-offer-cards" ref={grid.ref} style={grid.style}>
        <div className="responsive-card-grid">
          {offer.map(entry => {
            const hero: Hero = { ...entry.data, currentHP: entry.data.HP, maxHP: entry.data.HP };
            return (
              <div key={entry.name} className="gt-offer-card">
                <HeroCard hero={hero} showFullInfo={false} disableHPAnimations />
                <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => onChoose(entry.name)}>
                  Choose {entry.name}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="gt-offer-actions">
        <button type="button" className="ui-btn" disabled={busy || runState.rerolls_remaining <= 0} onClick={onReroll}>
          Reroll ({runState.rerolls_remaining} left)
        </button>
        <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onLeave}>
          {fromBattle ? 'Keep my roster' : 'Not now'}
        </button>
      </div>
    </div>
  );
};

export default OfferPanel;
