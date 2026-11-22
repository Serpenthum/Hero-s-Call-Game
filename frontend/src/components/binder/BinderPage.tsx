// One binder page: six pockets, each holding a hero card or nothing.
import React from 'react';
import HeroCard, { type HeroCardData } from '../HeroCard';
import type { BinderHero, Collection } from './binderRules';

interface BinderPageProps {
  heroes: (BinderHero | null)[];
  collection: Collection;
  spotlight: string | null;
  onOpen: (name: string) => void;
}

function cardClass(hero: BinderHero, collection: Collection): string {
  if (hero.disabled) return 'binder-card binder-card--disabled';
  return collection.owned.includes(hero.name) ? 'binder-card' : 'binder-card binder-card--locked';
}

// Memoised: a page re-renders only when its heroes, the collection, the spotlight or onOpen change.
export const BinderPage = React.memo<BinderPageProps>(({ heroes, collection, spotlight, onOpen }) => (
  <div className="binder-page">
    {heroes.map((hero, slot) => {
      if (!hero) return <div key={`empty-${slot}`} className="binder-pocket binder-pocket--empty" />;
      const open = () => onOpen(hero.name);
      return (
        <div
          key={hero.name}
          className={`binder-pocket${spotlight === hero.name ? ' binder-pocket--spotlight' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={hero.name}
          onClick={open}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            open();
          }}
        >
          <HeroCard
            hero={hero as unknown as HeroCardData}
            tiny
            readable="none"
            showFullInfo={false}
            disableHPAnimations
            holo={collection.holo.includes(hero.name)}
            favorite={collection.favourites.includes(hero.name)}
            className={cardClass(hero, collection)}
          />
        </div>
      );
    })}
  </div>
));

BinderPage.displayName = 'BinderPage';
