import React from 'react';
import HeroCard from '../HeroCard';
import { Hero } from '../../types';

interface FeaturedHeroProps {
  hero: Hero | null;
  favorite: boolean;
  swapKey: number;
  onOpen(heroName: string): void;
  onHoverChange(hovering: boolean): void;
}

// The featured hero on its pedestal. A tap opens the Binder on that hero's page.
const FeaturedHero: React.FC<FeaturedHeroProps> = ({ hero, favorite, swapKey, onOpen, onHoverChange }) => (
  <div className="lobby-stage">
    <div className="lobby-embers" aria-hidden="true" />
    <div className="lobby-pedestal" aria-hidden="true" />
    {hero && (
      <>
        <div className="lobby-float">
          <div
            key={swapKey}
            className="lobby-featured"
            data-swap={swapKey}
            role="button"
            tabIndex={0}
            aria-label={`${hero.name}: open in the Binder`}
            onClick={() => onOpen(hero.name)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(hero.name);
              }
            }}
            onPointerEnter={() => onHoverChange(true)}
            onPointerLeave={() => onHoverChange(false)}
            onFocus={() => onHoverChange(true)}
            onBlur={() => onHoverChange(false)}
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
              favorite={favorite}
              readable="none"
            />
          </div>
        </div>
        <p className="lobby-stage-hint">
          {favorite ? 'One of your favourites. Click to open in the Binder.' : 'Click to open in the Binder.'}
        </p>
      </>
    )}
  </div>
);

export default FeaturedHero;
