// A pocket's card shown large, with its rules text and the favourite button. Escape or a tap outside closes it.
// A hero the player does not own shows grey with a padlock; signed in, it can be crafted here with shards.
// Craft asks first, and only "Yes, craft" spends the shards. Once the server has said yes the forge plays here
// (craftForge.ts moves the pieces this file draws), and the view cannot be closed until the card is home.
import React, { useRef, useState } from 'react';
import HeroCard, { type HeroCardData } from '../HeroCard';
import CloseButton from '../CloseButton';
import { READ_TEXT_MIN_PX } from '../../draft/draftRules';
import type { BinderHero, Collection } from './binderRules';
import Shard from '../ui/Shard';
import { CRAFT_PRICE, craftState } from './craftRules';
import { SHELL_H, SHELL_W, forgeShell, type ForgePhase } from './craftForge';
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
  forge?: Exclude<ForgePhase, 'landed'>; // the crafting animation is playing on this card, and how far it is
}

// What the forge lays over the card: the shell of crystal (one facet per shard), its gloss, the heat, the white of
// the strike and the glint after it. All start unseen; craftForge.ts brings them in.
const ForgeLayers: React.FC<{ loose: boolean }> = ({ loose }) => (
  <div className="binder-forge" aria-hidden="true">
    <svg className={`binder-forge-shell${loose ? ' is-loose' : ''}`} viewBox={`0 0 ${SHELL_W} ${SHELL_H}`} preserveAspectRatio="none">
      {forgeShell().map((facet, i) => <polygon key={i} className={`f${facet.tone}`} points={facet.points} />)}
    </svg>
    <div className="binder-forge-gloss" />
    <div className="binder-forge-heat" />
    <div className="binder-forge-white" />
    <div className="binder-forge-glint" />
  </div>
);

export const BinderLargeView: React.FC<BinderLargeViewProps> = ({
  hero, collection, signedIn, onToggleFavourite, onClose, shards, onCraft, crafting, forge,
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
    if (result.ok) return; // the forge takes it from here (or, with animations off, the view has closed)
    setAsking(false);
    setMessage(result.message);
  };

  // The strike has landed: the card is in colour and its padlock is gone
  const struck = forge === 'struck' || forge === 'done';

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
      className={`binder-large-card${locked && !struck ? ' is-locked' : ''}`}
    />
  );

  return (
    <div
      className="binder-large"
      role="dialog"
      aria-modal="true"
      aria-label={hero.name}
      data-forge={forge}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {forge && <div className="binder-forge-dark" aria-hidden="true" />}
      <CloseButton className="binder-large-close" onClick={onClose} />
      <div className="binder-large-body">
        {!locked ? (
          <>{card}{favButton}</>
        ) : (
          <>
            <div className="binder-large-cardwrap">
              <div className="binder-forge-card">
                {card}
                {forge && <ForgeLayers loose={struck} />}
              </div>
              <span className="binder-lock-tag" title="Not owned"><LockIcon /></span>
            </div>
            {signedIn && (
              <div className={`binder-craft${asking ? ' is-asking' : ''}`}>
                {forge !== 'done' && <p className="binder-craft-state"><LockIcon /> Not owned</p>}
                {forge === 'done' ? (
                  <div className="binder-craft-done" role="status">
                    <h3>Crafted!</h3>
                    <p>{hero.name} joins your binder.</p>
                  </div>
                ) : asking ? (
                  <>
                    <p className="binder-craft-ask">
                      Craft <b>{hero.name}</b> for <span className="binder-craft-nw"><Shard /><b>{CRAFT_PRICE}</b> shards?</span>
                    </p>
                    {crafting
                      ? <p className="binder-craft-note binder-craft-wait" role="status">Crafting…</p>
                      : <p className="binder-craft-note">You will have <b>{shards - (forge ? 0 : CRAFT_PRICE)}</b> shards left.</p>}
                    <div className="binder-craft-row">
                      <button type="button" className="ui-btn" onClick={() => setAsking(false)} disabled={crafting || !!forge}>Cancel</button>
                      <button type="button" className="binder-craft-btn" onClick={() => { void confirmCraft(); }}
                        disabled={crafting || !!forge} aria-busy={crafting || undefined}>Yes, craft</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" className="binder-craft-btn" onClick={askToCraft} disabled={!canCraft}
                      aria-label={`Craft ${hero.name} for ${CRAFT_PRICE} shards`}>
                      <span>Craft</span><span className="binder-craft-price"><Shard />{CRAFT_PRICE} shards</span>
                    </button>
                    {message && <p className="binder-craft-message" role="alert">{message}</p>}
                    {shortfall > 0 ? (
                      <>
                        <div className="binder-craft-short">
                          <b><Shard />{shortfall} more shards needed</b>
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
                          You have <Shard /><b>{shards}</b> shards. You will have <b>{shards - CRAFT_PRICE}</b> left.
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
