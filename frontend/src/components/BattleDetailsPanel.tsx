import React, { useLayoutEffect, useRef, useState } from 'react';
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
  // Spectators: the player who owns the hero, shown instead of "Enemy" / "Your hero"
  ownerName?: string;
}

// The card takes the height the rules text leaves, between these shares of the panel's height.
const CARD_MIN_SHARE = 0.3;
const CARD_MAX_SHARE = 0.5;
const CARD_MAX_WIDTH_SHARE = 0.92;
// The name shrinks from this size to the 12px floor before it may break mid-word.
const NAME_MAX_PX = 20;
const NAME_MIN_PX = 12;

export function sideTag(side: CardSide, ownerName?: string): string {
  if (ownerName) return ownerName;
  return side === 'enemy' ? 'Enemy' : 'Your hero';
}

// A tapped battle card, shown over the left column: the live card, then every ability and special as plain text.
const BattleDetailsPanel: React.FC<BattleDetailsPanelProps> = ({ hero, side, isFocused, onClose, ownerName }) => {
  const fallen = !isHeroAlive(hero);
  const panelRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const rulesInnerRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const name = nameRef.current;
    const card = cardRef.current;
    const rules = rulesRef.current;
    const inner = rulesInnerRef.current;
    if (!panel || !name || !card || !rules || !inner) return;

    // "More" shows while there is rules text below the fold
    const updateMore = () => setMore(rules.scrollTop + rules.clientHeight < rules.scrollHeight - 2);

    const fit = () => {
      if (panel.clientHeight === 0) return;
      // The name: the largest size at which it fits its 40px row without breaking a word
      name.classList.remove('battle-details-name--break');
      let size = NAME_MAX_PX;
      for (; size > NAME_MIN_PX; size -= 1) {
        name.style.fontSize = `${size}px`;
        if (name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= name.clientHeight + 1) break;
      }
      name.style.fontSize = `${size}px`;
      if (name.scrollWidth > name.clientWidth + 1) name.classList.add('battle-details-name--break');

      // The card: whatever height the rules text leaves, within its share of the panel
      const style = getComputedStyle(panel);
      const panelH = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const panelW = panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.rowGap) || 0;
      const header = panel.querySelector<HTMLElement>('.battle-details-header');
      const headerH = header ? header.offsetHeight : 0;
      const leftover = panelH - headerH - inner.offsetHeight - 2 * gap - 2;
      const cardH = Math.min(Math.max(leftover, panelH * CARD_MIN_SHARE), panelH * CARD_MAX_SHARE);
      const cardW = Math.min(panelW * CARD_MAX_WIDTH_SHARE, (cardH * 260) / 391);
      card.style.setProperty('--details-card-w', `${Math.floor(cardW)}px`);
      updateMore();
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    observer.observe(inner);
    rules.addEventListener('scroll', updateMore, { passive: true });
    return () => {
      observer.disconnect();
      rules.removeEventListener('scroll', updateMore);
    };
  }, [hero.name]);

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
        <h3 className="battle-details-name" ref={nameRef}>{hero.name}</h3>
        <CloseButton onClick={onClose} label="Close details" className="battle-details-close" />
      </header>
      <div className="battle-details-card" ref={cardRef}>
        <HeroCard hero={hero} isEnemy={side === 'enemy'} isFocused={isFocused} readable="none" disableHPAnimations>
          {/* The tags sit over the card's art, so the header stays one 40px row */}
          <div className="battle-details-tags">
            <span className={`battle-details-tag battle-details-tag--${side}`}>{sideTag(side, ownerName)}</span>
            {isFocused && <span className="battle-details-tag battle-details-tag--focused">Focused</span>}
            {fallen && <span className="battle-details-tag battle-details-tag--fallen">Fallen</span>}
          </div>
        </HeroCard>
      </div>
      <div className={`battle-details-rules-wrap${more ? ' has-more' : ''}`}>
        <div className="battle-details-rules" ref={rulesRef}>
          <div ref={rulesInnerRef}>
            {ruleSections(hero).map((section, index) => (
              <section
                key={`${section.label}-${index}`}
                className={`battle-details-rule battle-details-rule--${section.label.toLowerCase()}`}
              >
                <h4><span className="battle-details-label">{section.label}:</span> {section.name}</h4>
                <p>{section.description}</p>
              </section>
            ))}
          </div>
        </div>
        {more && <div className="battle-details-more" aria-hidden="true">More ↓</div>}
      </div>
    </aside>
  );
};

export default BattleDetailsPanel;
