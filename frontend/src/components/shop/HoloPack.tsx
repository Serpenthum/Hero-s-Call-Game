import React from 'react';
import { cardMotionOff } from '../../cards/cardMotion';
import { getHoloEffects } from '../../holoSetting';
// The foil's drift keyframes (card-holo-drift, card-holo-mask) are HeroCard's.
import '../../styles/HeroCard.css';
import '../../styles/HoloPack.css';

interface HoloPackProps {
  width: string; // Any CSS length: "112px", "var(--shop-pack-w)"
  name?: string;
}

const POINTER_VARS = ['--card-rx', '--card-ry', '--card-mx', '--card-my'];

// Only a mouse leans the pack; a finger just moves the foil.
const pointerCanTilt = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The shop's pack. It stands still; with holographic effects on, a card's foil lies over it and follows the pointer. */
const HoloPack: React.FC<HoloPackProps> = ({ width, name = 'Adventure Pack' }) => {
  const foil = getHoloEffects();
  const still = foil && cardMotionOff();

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pack = event.currentTarget;
    const rect = pack.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pack.classList.add('holo-pack--hovering');
    pack.style.setProperty('--card-mx', `${x * 100}%`);
    pack.style.setProperty('--card-my', `${y * 100}%`);
    if (!still && pointerCanTilt()) {
      pack.style.setProperty('--card-ry', `${(x - 0.5) * 24}deg`);
      pack.style.setProperty('--card-rx', `${(0.5 - y) * 24}deg`);
    }
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const pack = event.currentTarget;
    pack.classList.remove('holo-pack--hovering');
    POINTER_VARS.forEach(varName => pack.style.removeProperty(varName));
  };

  const classes = ['holo-pack', foil ? 'holo-pack--foil' : '', still ? 'holo-pack--still' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{ '--holo-pack-w': width } as React.CSSProperties}
      onPointerMove={foil ? handlePointerMove : undefined}
      onPointerLeave={foil ? handlePointerLeave : undefined}
    >
      <img className="holo-pack__image" src="/pack1.png" alt="" draggable={false} />
      <span className="holo-pack__name">{name}</span>
      {foil && (
        <>
          <span className="holo-pack__sheen" aria-hidden="true" />
          <span className="holo-pack__spark" aria-hidden="true" />
        </>
      )}
    </div>
  );
};

export default HoloPack;
