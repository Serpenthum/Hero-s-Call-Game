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

// '' for an owned hero. The pocket carries the state too: its padlock or crossed circle sits over the card.
function cardState(hero: BinderHero, collection: Collection): '' | 'locked' | 'disabled' {
  if (hero.disabled) return 'disabled';
  return collection.owned.includes(hero.name) ? '' : 'locked';
}

// Memoised: a page re-renders only when its heroes, the collection, the spotlight or onOpen change.
export const BinderPage = React.memo<BinderPageProps>(({ heroes, collection, spotlight, onOpen }) => (
  <div className="binder-page">
    {heroes.map((hero, slot) => {
      if (!hero) return <div key={`empty-${slot}`} className="binder-pocket binder-pocket--empty" />;
      const open = () => onOpen(hero.name);
      const state = cardState(hero, collection);
      return (
        <div
          key={hero.name}
          className={`binder-pocket${state && ` binder-pocket--${state}`}${spotlight === hero.name ? ' binder-pocket--spotlight' : ''}`}
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
            className={`binder-card${state && ` binder-card--${state}`}`}
          />
        </div>
      );
    })}
  </div>
));

BinderPage.displayName = 'BinderPage';
