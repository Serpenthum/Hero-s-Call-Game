import React, { useRef, useState } from 'react';
import HeroCard from '../HeroCard';
import { Hero } from '../../types';

interface FeaturedHeroProps {
  hero: Hero | null;
  favorite: boolean;
  holo: boolean;
  swapKey: number;
  // The player has just arrived at the lobby: the first card flips in as part of the arrival
  arriving?: boolean;
  onOpen(heroName: string): void;
  onHoverChange(hovering: boolean): void;
}

// Embers drifting up from the pedestal: placed once, each already mid-flight when the lobby opens.
const EMBER_COUNT = 12;
const makeEmbers = (): React.CSSProperties[] =>
  Array.from({ length: EMBER_COUNT }, () => {
    const seconds = 6 + Math.random() * 7;
    const size = 2 + Math.random() * 3;
    return {
      left: `${20 + Math.random() * 60}%`,
      width: `${size}px`,
      height: `${size}px`,
      '--dx': `${Math.random() * 100 - 50}px`,
      animationDuration: `${seconds}s`,
      animationDelay: `${-Math.random() * seconds}s`,
    } as React.CSSProperties;
  });

// The featured hero on its pedestal. A tap opens the Binder on that hero's page.
const FeaturedHero: React.FC<FeaturedHeroProps> = ({ hero, favorite, holo, swapKey, arriving = false, onOpen, onHoverChange }) => {
  // Pointer hover and keyboard focus are tracked apart, so a mouse passing over a focused card
  // does not report "not hovering" and let the next swap remount it (dropping focus).
  const hovered = useRef(false);
  const focused = useRef(false);
  const report = () => onHoverChange(hovered.current || focused.current);
  const [embers] = useState(makeEmbers);
  // The first card simply appears (or flips in with the arrival); every later one flips in as a swap.
  const entrance = swapKey > 0 ? ' lobby-featured--swap' : arriving ? ' lobby-featured--arrive' : '';
  // The Binder covers the card once it opens, so neither flag should hold the swaps afterwards.
  const open = (name: string) => {
    hovered.current = false;
    focused.current = false;
    onOpen(name);
  };

  return (
    <div className="lobby-stage">
      <div className="lobby-embers" aria-hidden="true">
        {embers.map((style, i) => <i key={i} style={style} />)}
      </div>
      <div className="lobby-pedestal" aria-hidden="true" />
      {hero && (
        <>
          <div className="lobby-float">
            <div
              key={swapKey}
              className={`lobby-featured${entrance}`}
              data-swap={swapKey}
              role="button"
              tabIndex={0}
              aria-label={`${hero.name}: open in the Binder`}
              onClick={() => open(hero.name)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open(hero.name);
                }
              }}
              onPointerEnter={() => { hovered.current = true; report(); }}
              onPointerLeave={() => { hovered.current = false; report(); }}
              onFocus={() => { focused.current = true; report(); }}
              onBlur={() => { focused.current = false; report(); }}
            >
              <HeroCard
                hero={{
                  name: hero.name,
                  HP: hero.HP,
                  Defense: hero.Defense,
                  Accuracy: hero.Accuracy,
                  BasicAttack: hero.BasicAttack,
                  Ability: hero.Ability,
                  Special: hero.Special,
                }}
                showFullInfo={false}
                disableHPAnimations
                glint
                tilt
                holo={holo}
                favorite={favorite}
                readable="none"
              />
            </div>
          </div>
          <p className="lobby-stage-hint">
            {favorite ? 'One of your favourites. Tap or click to open in the Binder.' : 'Tap or click to open in the Binder.'}
          </p>
        </>
      )}
    </div>
  );
};

export default FeaturedHero;
