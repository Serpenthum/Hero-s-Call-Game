import React from 'react';
import { Hero } from '../../types';
import { READ_TEXT_MIN_PX, swapInOrder } from '../../draft/draftRules';
import HeroCard from '../HeroCard';

export interface DraftOrderProps {
  order: Hero[];
  selected: string | null;
  ready: boolean;
  onTap(name: string): void;
  /** The cards are drawn as tiny cards (name and stats only). Every other card keeps the 12px rules-text floor. */
  tiny?: boolean;
  /** Laid across the hand area (the opponent-away notice). */
  banner?: React.ReactNode;
}

/** One tap in the order step: first tap selects, the same card again cancels, another card swaps the two. */
export function tapOrder(
  s: { order: string[]; selected: string | null },
  name: string,
): { order: string[]; selected: string | null } {
  if (s.selected === null) return { order: s.order, selected: name };
  if (s.selected === name) return { order: s.order, selected: null };
  return { order: swapInOrder(s.order, s.selected, name), selected: null };
}

/** The order step: your three heroes numbered 1-3 in the hand area, "Attacks first" under number 1. */
const DraftOrder: React.FC<DraftOrderProps> = ({ order, selected, ready, onTap, tiny = false, banner }) => (
  <>
    <p className="draft-hint">
      <b>Set your order.</b> Tap a hero, then tap where it goes.
    </p>
    <div className={`draft-hand draft-hand--order${ready ? ' draft-hand--ready' : ''}`}>
      {banner}
      {order.map((hero, i) => {
        const isSelected = selected === hero.name;
        return (
          <div
            key={hero.name}
            className={`draft-order-card${isSelected ? ' draft-order-card--selected' : ''}`}
            data-name={hero.name}
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="draft-order-badge">{i + 1}</span>
            {i === 0 && <span className="draft-order-first">Attacks first</span>}
            <HeroCard
              hero={hero}
              holo={!!hero.holo}
              isSelectable={!ready}
              isSelected={isSelected}
              onClick={() => onTap(hero.name)}
              readable="press"
              minTextPx={tiny ? undefined : READ_TEXT_MIN_PX}
              disableHPAnimations
            />
          </div>
        );
      })}
    </div>
  </>
);

export default DraftOrder;
