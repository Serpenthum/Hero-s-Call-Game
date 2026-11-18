import React, { useLayoutEffect, useRef } from 'react';
import type { Hero } from '../types';
import type { CardSide } from '../battle/focus';
import { isHeroAlive } from '../heroHealth';
import HeroCard from './HeroCard';
import CloseButton from './CloseButton';
import '../styles/BattleDetails.css';

interface BattleDetailsPanelProps {
  hero: Hero;
  side: CardSide;
  isFocused: boolean;
  onClose: () => void;
  // Spectators: the player who owns the hero, shown instead of "Enemy" / "Your hero"
  ownerName?: string;
}

// Card proportions (width : height)
const CARD_W = 260;
const CARD_H = 391;

export function sideTag(side: CardSide, ownerName?: string): string {
  if (ownerName) return ownerName;
  return side === 'enemy' ? 'Enemy' : 'Your hero';
}

// A tapped battle card, shown over the left column: the live card, as large as the column allows, so its own
// face carries the ability and special text. The header holds the tags and the close X.
const BattleDetailsPanel: React.FC<BattleDetailsPanelProps> = ({ hero, side, isFocused, onClose, ownerName }) => {
  const fallen = !isHeroAlive(hero);
  const panelRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const card = cardRef.current;
    if (!panel || !card) return;

    // The largest card that fits the space under the header, at the card's aspect ratio
    const fit = () => {
      if (card.clientHeight === 0 && card.clientWidth === 0) return;
      const cardW = Math.min(card.clientWidth, (card.clientHeight * CARD_W) / CARD_H);
      card.style.setProperty('--details-card-w', `${Math.max(0, Math.floor(cardW))}px`);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    observer.observe(card);
    return () => observer.disconnect();
  }, [hero.name]);

  const tag = sideTag(side, ownerName);
  return (
    <aside
      ref={panelRef}
      className="battle-details"
      data-side={side}
      data-keep-details
      data-tutorial="details-panel"
      role="dialog"
      aria-label={hero.name}
    >
      <header className="battle-details-header">
        {/* The card shows its own name, so the header carries only the tags and the close X */}
        <div className="battle-details-tags">
          <span className={`battle-details-tag battle-details-tag--${side}`} title={tag}>{tag}</span>
          {isFocused && <span className="battle-details-tag battle-details-tag--focused">Focused</span>}
          {fallen && <span className="battle-details-tag battle-details-tag--fallen">Fallen</span>}
        </div>
        <CloseButton onClick={onClose} label="Close details" className="battle-details-close" />
      </header>
      <div className="battle-details-card" ref={cardRef}>
        {/* Not isFocused: the board's card is the one marked (data-focused); here the "Focused" tag says it */}
        <HeroCard hero={hero} isEnemy={side === 'enemy'} readable="none" disableHPAnimations />
      </div>
    </aside>
  );
};

export default BattleDetailsPanel;
