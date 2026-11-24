// A pocket's card shown large, with its rules text and the favourite button. Escape or a tap outside closes it.
// A hero the player does not own shows grey with a padlock; signed in, it can be crafted here with shards.
// Craft asks first, and only "Yes, craft" spends the shards.
import React, { useRef, useState } from 'react';
import HeroCard, { type HeroCardData } from '../HeroCard';
import CloseButton from '../CloseButton';
import { READ_TEXT_MIN_PX } from '../../draft/draftRules';
import type { BinderHero, Collection } from './binderRules';
import { CRAFT_PRICE, craftState } from './craftRules';
import type { CraftResult } from './useBinderData';
import { LockIcon, StarIcon } from './BinderIcons';

interface BinderLargeViewProps {
  hero: BinderHero;
  collection: Collection;
  signedIn: boolean;
  onToggleFavourite: (name: string) => void;
  onClose: () => void;
  shards: number;
  onCraft: (name: string) => Promise<CraftResult>;
  crafting: boolean; // a craft request is on its way
}

export const BinderLargeView: React.FC<BinderLargeViewProps> = ({
  hero, collection, signedIn, onToggleFavourite, onClose, shards, onCraft, crafting,
}) => {
  const favourite = collection.favourites.includes(hero.name);
  // As the pocket shows it: a disabled hero is not locked, it is out of the game
  const locked = !hero.disabled && !collection.owned.includes(hero.name);
  const { canCraft, shortfall } = craftState(shards, !locked);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Set from the first "Yes, craft" until its reply: a second tap before the button shows disabled sends nothing
  const sent = useRef(false);

  const askToCraft = () => {
    if (!canCraft) return;
    setMessage(null);
    setAsking(true);
  };

  const confirmCraft = async () => {
    if (sent.current || crafting) return;
    sent.current = true;
    const result = await onCraft(hero.name);
    sent.current = false;
    setAsking(false);
    if (!result.ok) setMessage(result.message);
  };

  const favButton = signedIn && (
    <button type="button" className="binder-large-fav" onClick={() => onToggleFavourite(hero.name)}>
      <StarIcon />{favourite ? 'Remove from favourites' : 'Add to favourites'}
    </button>
  );

  const card = (
    <HeroCard
      hero={hero as unknown as HeroCardData}
      readable="none"
      showFullInfo={false}
      disableHPAnimations
      minTextPx={READ_TEXT_MIN_PX}
      holo={!locked && collection.holo.includes(hero.name)}
      favorite={favourite}
      className={`binder-large-card${locked ? ' is-locked' : ''}`}
    />
  );

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
        {!locked ? (
          <>{card}{favButton}</>
        ) : (
          <>
            <div className="binder-large-cardwrap">
              {card}
              <span className="binder-lock-tag" title="Not owned"><LockIcon /></span>
            </div>
            {signedIn && (
              <div className={`binder-craft${asking ? ' is-asking' : ''}`}>
                <p className="binder-craft-state"><LockIcon /> Not owned</p>
                {asking ? (
                  <>
                    <p className="binder-craft-ask">
                      Craft <b>{hero.name}</b> for <span className="binder-craft-nw"><b>{CRAFT_PRICE}</b> shards?</span>
                    </p>
                    <p className="binder-craft-note">You will have <b>{shards - CRAFT_PRICE}</b> shards left.</p>
                    <div className="binder-craft-row">
                      <button type="button" className="ui-btn" onClick={() => setAsking(false)} disabled={crafting}>Cancel</button>
                      <button type="button" className="binder-craft-btn" onClick={() => { void confirmCraft(); }}
                        disabled={crafting} aria-busy={crafting || undefined}>Yes, craft</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" className="binder-craft-btn" onClick={askToCraft} disabled={!canCraft}
                      aria-label={`Craft ${hero.name} for ${CRAFT_PRICE} shards`}>
                      <span>Craft</span><span className="binder-craft-price">{CRAFT_PRICE} shards</span>
                    </button>
                    {message && <p className="binder-craft-message" role="alert">{message}</p>}
                    {shortfall > 0 ? (
                      <>
                        <div className="binder-craft-short">
                          <b>{shortfall} more shards needed</b>
                          <span className="binder-craft-meter" aria-hidden="true">
                            <span style={{ '--p': shards / CRAFT_PRICE } as React.CSSProperties} />
                          </span>
                          <span className="binder-craft-have">You have {shards} of {CRAFT_PRICE}.</span>
                        </div>
                        <p className="binder-craft-fine">A hero you already own, pulled from a pack, gives 10 shards.</p>
                      </>
                    ) : (
                      <>
                        <p className="binder-craft-note">
                          You have <b>{shards}</b> shards. You will have <b>{shards - CRAFT_PRICE}</b> left.
                        </p>
                        <p className="binder-craft-fine">Crafting makes the normal card. Holographics only come from packs.</p>
                      </>
                    )}
                    {favButton}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
