import React from 'react';
import config from '../../config';
import { Hero } from '../../types';
import { useCardReader } from '../../cards/CardReader';
import { useLongPress } from '../../cards/useLongPress';
import { getHoloEffects } from '../../holoSetting';

export const heroImage = (name: string): string =>
  `${config.IMAGE_BASE_URL}/hero-images/${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;

interface DraftPortraitProps {
  hero: Hero;
  enemy?: boolean;
  onRead(hero: Hero): void;
}

/** A round hero portrait: tap shows the card (onRead), hold or right-click opens the large reader. */
const DraftPortrait: React.FC<DraftPortraitProps> = ({ hero, enemy = false, onRead }) => {
  const reader = useCardReader();
  const press = useLongPress(() => reader.open(hero, { holo: !!hero.holo }));
  const classes = ['draft-portrait', enemy ? 'draft-portrait--enemy' : '', hero.holo && getHoloEffects() ? 'draft-portrait--holo' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      title={hero.name}
      aria-label={hero.name}
      data-name={hero.name}
      onClick={() => onRead(hero)}
      {...press}
    >
      <img src={heroImage(hero.name)} alt="" draggable={false} decoding="async" />
    </button>
  );
};

export default DraftPortrait;
