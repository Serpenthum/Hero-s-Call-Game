import React, { useLayoutEffect, useRef } from 'react';
import type { Hero } from '../types';
import type { CardSide } from '../battle/focus';
import HeroCard from './HeroCard';
import '../styles/BattleDetails.css';

interface BattleDetailsPanelProps {
  hero: Hero;
  side: CardSide;
  isFocused: boolean;
  // A tap on the card closes it
  onClose?: () => void;
}

// Card proportions (width : height)
const CARD_W = 260;
const CARD_H = 391;
// Space kept clear between a phone panel and the screen's right edge
const EDGE_GAP = 8;

// A tapped battle card, shown at the top of the left column and nothing else: no header, no tags, no close button
// (it closes on a tap on itself or on empty space, Escape, an action or the turn change; see BattlePhase). The card is as large as
// the column's height allows, so its own face carries the ability and special text; on phones it grows past the
// column over the board. A fallen hero shows as dead on the card itself, and the focused enemy wears the focus ring.
const BattleDetailsPanel: React.FC<BattleDetailsPanelProps> = ({ hero, side, isFocused, onClose }) => {
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const column = panel.parentElement?.closest<HTMLElement>('.battle-combined-info') ?? panel.parentElement;

    const fit = () => {
      // The panel is fixed over the column it belongs to (the sidebar clips anything wider than the column)
      const box = column?.getBoundingClientRect();
      if (!box || box.height === 0) return;
      // Phones (a media query sets --details-side) may cover the board; larger screens stay inside the column
      const phone = getComputedStyle(panel).getPropertyValue('--details-side').trim() === '1';
      const maxW = phone ? window.innerWidth - box.left - EDGE_GAP : box.width;
      const cardW = Math.max(0, Math.floor(Math.min((box.height * CARD_W) / CARD_H, maxW)));
      panel.style.setProperty('--details-top', `${box.top}px`);
      panel.style.setProperty('--details-left', `${box.left}px`);
      panel.style.setProperty('--details-card-w', `${cardW}px`);
    };

    fit();
    const observer = new ResizeObserver(fit);
    if (column) observer.observe(column);
    // The phone switch is a media query, and a resize can move the column without resizing it
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [hero.name]);

  return (
    <aside
      ref={panelRef}
      className={`battle-details${isFocused ? ' battle-details--focused' : ''}`}
      data-side={side}
      data-keep-details
      data-tutorial="details-panel"
      role="dialog"
      aria-label={hero.name}
      onClick={onClose}
    >
      {/* Not isFocused on the card: only the board's card carries data-focused; the ring here is CSS */}
      <HeroCard hero={hero} isEnemy={side === 'enemy'} readable="none" disableHPAnimations />
    </aside>
  );
};

export default BattleDetailsPanel;
