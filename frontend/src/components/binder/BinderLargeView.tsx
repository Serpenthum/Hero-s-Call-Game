// A pocket's card shown large, with its rules text and the favourite button. Escape or a tap outside closes it.
import React from 'react';
import HeroCard, { type HeroCardData } from '../HeroCard';
import CloseButton from '../CloseButton';
import { READ_TEXT_MIN_PX } from '../../draft/draftRules';
import type { BinderHero, Collection } from './binderRules';

interface BinderLargeViewProps {
  hero: BinderHero;
  collection: Collection;
  signedIn: boolean;
  onToggleFavourite: (name: string) => void;
  onClose: () => void;
}

export const BinderLargeView: React.FC<BinderLargeViewProps> = ({ hero, collection, signedIn, onToggleFavourite, onClose }) => {
  const favourite = collection.favourites.includes(hero.name);
  return (
    <div
      className="binder-large"
      role="dialog"
      aria-modal="true"
      aria-label={hero.name}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <CloseButton className="binder-large-close" onClick={onClose} />
      <div className="binder-large-body">
        <HeroCard
          hero={hero as unknown as HeroCardData}
          readable="none"
          showFullInfo={false}
          disableHPAnimations
          minTextPx={READ_TEXT_MIN_PX}
          holo={collection.holo.includes(hero.name)}
          favorite={favourite}
          className="binder-large-card"
        />
        {signedIn && (
          <button type="button" className="binder-large-fav" onClick={() => onToggleFavourite(hero.name)}>
            {favourite ? 'Remove from favourites' : 'Add to favourites'}
          </button>
        )}
      </div>
    </div>
  );
};
