import React, { useEffect, useRef, useState } from 'react';
import HeroCard from '../HeroCard';
import Coin from '../Coin';
import { useCardReader } from '../../cards/CardReader';
import { cardMotionOff } from '../../cards/cardMotion';
import { getHoloEffects } from '../../holoSetting';
import useCardGrid from '../../hooks/useCardGrid';
import { isHoloKind, PackCard, PackResult } from './packTypes';
import CardBack from './CardBack';
import PackSparks, { makeBurst, SparkBurst, SparkTone } from './PackSparks';
import '../../styles/PackOpening.css';

export type PackStage = 'pack' | 'opening' | 'cards';

interface PackOpeningProps {
  result: PackResult;
  price: number;
  canBuyAnother: boolean;
  buying: boolean;
  onBuyAnother: () => void;
  onDone: () => void;
  onTurn?: (name: string) => void; // Called as each card turns face up (tests read the order)
}

// How long the pack takes to open, and the gaps between cards under "Turn all over" (motion on only).
const OPENING_MS = 1500;
const TURN_GAP_MS = 380;
const HOLO_PAUSE_MS = 600;

// Motion only (PackOpening.css holds the matching animation times).
const CUT_SPARKS_MS = 450; // the line of light starts across the top of the pack
const TOP_OFF_MS = 900; // the top flies off: jolt, sparks, column of light
const PACK_GONE_MS = 2100; // the rest of the pack has dropped away
const TURN_SPARKS_MS = 300; // a card is face up
const HOLO_TREMBLE_MS = 900; // a holographic card trembles in the middle before it turns
const HOLO_SPOT_MS = 3000; // ...and goes back to its place this long after it took the screen
const SPARKS_LIFE_MS = 1300;
const BANNER_MS = 2200; // the banner has faded out

// Where a holographic card sits while it has the screen to itself.
interface Spot {
  index: number;
  dx: number;
  dy: number;
  scale: number;
}

/** "Turn all over" order: the plain cards left to right, then any holographic card last. */
export function turnAllOrder(cards: PackCard[], turned: boolean[]): number[] {
  const waiting = cards.map((_, i) => i).filter(i => !turned[i]);
  return [...waiting.filter(i => !isHoloKind(cards[i].kind)), ...waiting.filter(i => isHoloKind(cards[i].kind))];
}

const CardLabel: React.FC<{ card: PackCard }> = ({ card }) => {
  switch (card.kind) {
    case 'new':
      return <>New hero</>;
    case 'repeat':
      return <>Already owned · <Coin />+2</>;
    case 'holo':
      return <>Holographic!</>;
    case 'holo_upgrade':
      return <>Upgraded to holographic!</>;
  }
};

const PackOpening: React.FC<PackOpeningProps> = ({ result, price, canBuyAnother, buying, onBuyAnother, onDone, onTurn }) => {
  const [shown, setShown] = useState(result);
  const [stage, setStage] = useState<PackStage>('pack');
  const [turned, setTurned] = useState<boolean[]>(() => result.cards.map(() => false));
  const timers = useRef<number[]>([]);
  // Motion state: none of it decides the stage or which cards are turned.
  const fxTimers = useRef<number[]>([]);
  const revealed = useRef(new Set<number>()); // cards turned or on their way, so a card is revealed only once
  const spotBusy = useRef(false);
  const fxId = useRef(0);
  const rootEl = useRef<HTMLDivElement | null>(null);
  const packEl = useRef<HTMLButtonElement | null>(null);
  const cardEls = useRef<(HTMLDivElement | null)[]>([]);
  const [packLeaving, setPackLeaving] = useState(false);
  const [bursts, setBursts] = useState<SparkBurst[]>([]);
  const [jolts, setJolts] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const reader = useCardReader();
  const grid = useCardGrid({ packCount: result.cards.length });
  const still = cardMotionOff();

  const clearTimers = () => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  };
  const clearFx = () => {
    fxTimers.current.forEach(id => window.clearTimeout(id));
    fxTimers.current = [];
    revealed.current.clear();
    spotBusy.current = false;
  };
  useEffect(() => () => {
    clearTimers();
    clearFx();
  }, []);

  // A new pack (Buy another) starts again at the closed pack.
  if (result !== shown) {
    clearTimers();
    setShown(result);
    setStage('pack');
    setTurned(result.cards.map(() => false));
    clearFx();
    setPackLeaving(false);
    setBursts([]);
    setSpot(null);
    setBanner(null);
  }

  const { cards } = result;

  const turn = (index: number) => {
    setTurned(prev => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
    onTurn?.(cards[index].name);
  };

  // With "Show holographic effects" off, the rainbow light and sparks are gold.
  const holoTone: SparkTone = getHoloEffects() ? 'rainbow' : 'gold';
  const packTone: SparkTone = cards.some(card => isHoloKind(card.kind)) ? holoTone : 'gold';

  const later = (run: () => void, ms: number) => {
    fxTimers.current.push(window.setTimeout(run, ms));
  };
  // Sparks fly out of an element; `reach` is in heights of that element, `down` is how far down it they start.
  const sparks = (from: Element | null, tone: SparkTone, count: number, reach: number, down = 0.5) => {
    if (!from) return;
    const box = from.getBoundingClientRect();
    const id = ++fxId.current;
    setBursts(prev => [...prev, makeBurst(id, box, tone, count, box.height * reach, down)]);
    later(() => setBursts(prev => prev.filter(burst => burst.id !== id)), SPARKS_LIFE_MS);
  };
  const jolt = () => setJolts(count => count + 1);
  const showBanner = (index: number) => {
    const id = ++fxId.current;
    setBanner({ id, text: cards[index].kind === 'holo_upgrade' ? 'Upgraded to holographic!' : 'Holographic!' });
    later(() => setBanner(prev => (prev?.id === id ? null : prev)), BANNER_MS);
  };

  const openPack = () => {
    if (stage !== 'pack') return;
    if (still) {
      setStage('cards');
      return;
    }
    setStage('opening');
    setPackLeaving(true);
    timers.current.push(window.setTimeout(() => setStage('cards'), OPENING_MS));
    later(() => sparks(packEl.current, packTone, 26, 0.5, 0.2), CUT_SPARKS_MS);
    later(() => {
      jolt();
      sparks(packEl.current, packTone, 40, 0.85, 0.25);
    }, TOP_OFF_MS);
    later(() => setPackLeaving(false), PACK_GONE_MS);
  };

  // A holographic card takes over the screen: the rest dims, the card comes to the middle and trembles, then turns.
  const holoTakeover = (index: number) => {
    if (spotBusy.current) {
      later(() => holoTakeover(index), 400);
      return;
    }
    const el = cardEls.current[index];
    const root = rootEl.current;
    if (!el || !root) {
      turn(index);
      return;
    }
    spotBusy.current = true;
    // Measured from the card's place in the row, not where its launch has carried it so far.
    const row = el.offsetParent?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const centreX = row ? row.left + el.offsetLeft + el.offsetWidth / 2 : box.left + box.width / 2;
    const centreY = row ? row.top + el.offsetTop + el.offsetHeight / 2 : box.top + box.height / 2;
    const width = el.offsetWidth || box.width;
    const height = el.offsetHeight || box.height;
    const screen = root.getBoundingClientRect();
    setSpot({
      index,
      dx: screen.left + screen.width / 2 - centreX,
      dy: screen.top + screen.height * 0.54 - centreY,
      scale: Math.min(1.38, (screen.height * 0.72) / height, (screen.width * 0.86) / width),
    });
    later(() => {
      turn(index);
      showBanner(index);
      later(() => {
        jolt();
        sparks(el, holoTone, 70, 0.9);
      }, TURN_SPARKS_MS);
    }, HOLO_TREMBLE_MS);
    later(() => {
      setSpot(null);
      spotBusy.current = false;
    }, HOLO_SPOT_MS);
  };

  // Turns one face-down card with its motion (motion off: at once).
  const reveal = (index: number) => {
    if (revealed.current.has(index)) return;
    revealed.current.add(index);
    const holo = isHoloKind(cards[index].kind);
    if (still) {
      turn(index);
      if (holo) showBanner(index);
      return;
    }
    if (!holo) {
      turn(index);
      later(() => sparks(cardEls.current[index], 'gold', 14, 0.45), TURN_SPARKS_MS);
      return;
    }
    holoTakeover(index);
  };

  const tapCard = (index: number) => {
    if (!turned[index]) {
      reveal(index);
      return;
    }
    if (spot) return;
    reader.open(cards[index].hero, { holo: isHoloKind(cards[index].kind) });
  };

  const turnAll = () => {
    const order = turnAllOrder(cards, turned);
    if (still) {
      order.forEach(reveal);
      return;
    }
    clearTimers();
    let at = 0;
    order.forEach((index, step) => {
      at += step === 0 ? 0 : isHoloKind(cards[index].kind) ? HOLO_PAUSE_MS : TURN_GAP_MS;
      timers.current.push(window.setTimeout(() => reveal(index), at));
    });
  };

  const allTurned = turned.every(Boolean);
  const middle = (cards.length - 1) / 2;

  return (
    <div
      ref={rootEl}
      className={`pack-opening pack-opening-overlay${still ? ' pack-opening--still' : ''}`}
      data-stage={stage}
      data-count={cards.length}
      data-tone={packTone}
      data-holo-light={holoTone}
      data-jolt={jolts ? (jolts % 2 ? 'a' : 'b') : undefined}
      data-spot={spot ? 'on' : undefined}
      data-banner={banner ? 'on' : undefined}
    >
      <div className="pack-opening__dim" aria-hidden="true" />
      {(stage !== 'cards' || packLeaving) && (
        <div key="start" className="pack-opening__start" aria-hidden={stage === 'cards' ? true : undefined}>
          <div className="pack-opening__pack-spot">
            <div className="pack-opening__column" aria-hidden="true" />
            <button
              type="button"
              ref={packEl}
              className="pack-opening__pack"
              onClick={openPack}
              aria-label="Open the pack"
              tabIndex={stage === 'pack' ? 0 : -1}
            >
              <span className="pack-opening__wob">
                <span className="pack-opening__pack-rest">
                  <img src="/pack1.png" alt="" className="pack-opening__pack-image" draggable={false} />
                  <span className="pack-opening__pack-name" aria-hidden="true">Adventure Pack</span>
                </span>
                <span className="pack-opening__pack-top" aria-hidden="true">
                  <img src="/pack1.png" alt="" draggable={false} />
                </span>
                <span className="pack-opening__shine" aria-hidden="true" />
                <span className="pack-opening__cut" aria-hidden="true" />
              </span>
            </button>
            <div className="pack-opening__flash" aria-hidden="true" />
          </div>
          <p className="pack-opening__hint">Tap the pack to open it</p>
        </div>
      )}
      {stage === 'cards' && (
        <div key="reveal" className="pack-opening__reveal">
          <h2 className="pack-opening__heading">{cards.length === 4 ? 'A bonus fourth card!' : 'Your heroes'}</h2>
          <div className="pack-opening__cards" ref={grid.ref} style={grid.style}>
            {cards.map((card, index) => {
              const inSpot = spot?.index === index;
              const place = {
                '--i': index,
                '--o': index - middle,
                '--lift': Math.abs(index - middle),
                ...(inSpot ? { '--spot-x': `${spot.dx}px`, '--spot-y': `${spot.dy}px`, '--spot-scale': spot.scale } : null),
              } as React.CSSProperties;
              return (
                <div
                  key={`${card.name}-${index}`}
                  ref={el => { cardEls.current[index] = el; }}
                  className={`pack-opening__card${turned[index] ? ' is-turned' : ''}${inSpot ? ' is-spot' : ''}`}
                  style={place}
                  data-kind={card.kind}
                  data-name={card.name}
                  data-turned={turned[index] ? 'true' : 'false'}
                  role="button"
                  tabIndex={0}
                  aria-label={turned[index] ? `${card.name}, show large` : 'Turn this card over'}
                  onClick={() => tapCard(index)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      tapCard(index);
                    }
                  }}
                >
                  {inSpot && turned[index] && <div className="pack-opening__rays" aria-hidden="true" />}
                  <div className="pack-opening__flip">
                    <CardBack />
                    {turned[index] && (
                      <div className="pack-opening__face">
                        <HeroCard hero={card.hero} holo={isHoloKind(card.kind)} readable="none" disableHPAnimations />
                      </div>
                    )}
                  </div>
                  {turned[index] && <div className="pack-opening__label"><CardLabel card={card} /></div>}
                </div>
              );
            })}
          </div>
          <div className="pack-opening__actions">
            <button type="button" className="ui-btn ui-btn--quiet pack-opening__turn-all" onClick={turnAll} disabled={allTurned}>
              Turn all over
            </button>
            <button
              type="button"
              className="ui-btn pack-opening__again"
              onClick={onBuyAnother}
              disabled={!canBuyAnother || buying}
            >
              Buy another<Coin />{price}
            </button>
            <button type="button" className="ui-btn ui-btn--primary pack-opening__done" onClick={onDone} disabled={buying}>
              Done
            </button>
          </div>
        </div>
      )}
      {banner && <div key={banner.id} className="pack-opening__banner" aria-hidden="true">{banner.text}</div>}
      <PackSparks bursts={bursts} />
    </div>
  );
};

export default PackOpening;
