import React from 'react';
import type { Hero } from '../types';
import type { CardSide } from '../battle/focus';
import { ruleSections } from '../cards/cardRules';
import { isHeroAlive } from '../heroHealth';
import HeroCard from './HeroCard';
import CloseButton from './CloseButton';
import '../styles/BattleDetails.css';

interface BattleDetailsPanelProps {
  hero: Hero;
  side: CardSide;
  isFocused: boolean;
  onClose: () => void;
}

// A tapped battle card, shown over the left column: the live card, then every ability and special as plain text.
const BattleDetailsPanel: React.FC<BattleDetailsPanelProps> = ({ hero, side, isFocused, onClose }) => {
  const fallen = !isHeroAlive(hero);
  return (
    <aside
      className="battle-details"
      data-side={side}
      data-keep-details
      data-tutorial="details-panel"
      role="dialog"
      aria-label={hero.name}
    >
      <header className="battle-details-header">
        <h3 className="battle-details-name">{hero.name}</h3>
        <div className="battle-details-tags">
          <span className={`battle-details-tag battle-details-tag--${side}`}>{side === 'enemy' ? 'Enemy' : 'Your hero'}</span>
          {isFocused && <span className="battle-details-tag battle-details-tag--focused">Focused</span>}
          {fallen && <span className="battle-details-tag battle-details-tag--fallen">Fallen</span>}
        </div>
        <CloseButton onClick={onClose} label="Close details" className="battle-details-close" />
      </header>
      <div className="battle-details-card">
        <HeroCard hero={hero} isEnemy={side === 'enemy'} isFocused={isFocused} readable="none" disableHPAnimations />
      </div>
      <div className="battle-details-rules">
        {ruleSections(hero).map((section, index) => (
          <section key={`${section.label}-${index}`} className={`battle-details-rule battle-details-rule--${section.label.toLowerCase()}`}>
            <h4><span className="battle-details-label">{section.label}:</span> {section.name}</h4>
            <p>{section.description}</p>
          </section>
        ))}
      </div>
    </aside>
  );
};

export default BattleDetailsPanel;
