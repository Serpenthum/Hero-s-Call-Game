import React from 'react';
import { Hero } from '../../types';
import HeroCard from '../HeroCard';

interface DraftBigCardProps {
  hero: Hero | null;
  waiting: boolean;
}

/** Big-card layout: one full card down the left side, sized by the table's --draft-big-w. */
const DraftBigCard: React.FC<DraftBigCardProps> = ({ hero, waiting }) => (
  <aside className="draft-big" aria-live="polite">
    {hero ? (
      <div className="draft-big-card" key={hero.name} data-name={hero.name}>
        <HeroCard hero={hero} holo={!!hero.holo} readable="none" disableHPAnimations />
      </div>
    ) : (
      waiting && <p className="draft-big-wait">Waiting for your opponent…</p>
    )}
  </aside>
);

export default DraftBigCard;
