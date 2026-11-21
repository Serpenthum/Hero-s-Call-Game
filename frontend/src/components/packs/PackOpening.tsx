import React, { useEffect, useRef, useState } from 'react';
import HeroCard from '../HeroCard';
import Coin from '../Coin';
import { useCardReader } from '../../cards/CardReader';
import { cardMotionOff } from '../../cards/cardMotion';
import useCardGrid from '../../hooks/useCardGrid';
import { isHoloKind, PackCard, PackResult } from './packTypes';
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
const OPENING_MS = 900;
const TURN_GAP_MS = 220;
const HOLO_PAUSE_MS = 600;

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
  const reader = useCardReader();
  const grid = useCardGrid({ packCount: result.cards.length });
  const still = cardMotionOff();

  const clearTimers = () => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // A new pack (Buy another) starts again at the closed pack.
  if (result !== shown) {
    clearTimers();
    setShown(result);
    setStage('pack');
    setTurned(result.cards.map(() => false));
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

  const openPack = () => {
    if (stage !== 'pack') return;
    if (still) {
      setStage('cards');
      return;
    }
    setStage('opening');
    timers.current.push(window.setTimeout(() => setStage('cards'), OPENING_MS));
  };

  const tapCard = (index: number) => {
    if (!turned[index]) {
      turn(index);
      return;
    }
    reader.open(cards[index].hero, { holo: isHoloKind(cards[index].kind) });
  };

  const turnAll = () => {
    const order = turnAllOrder(cards, turned);
    if (still) {
      order.forEach(turn);
      return;
    }
    clearTimers();
    let at = 0;
    order.forEach((index, step) => {
      at += step === 0 ? 0 : isHoloKind(cards[index].kind) ? HOLO_PAUSE_MS : TURN_GAP_MS;
      timers.current.push(window.setTimeout(() => turn(index), at));
    });
  };

  const allTurned = turned.every(Boolean);

  return (
    <div
      className={`pack-opening pack-opening-overlay${still ? ' pack-opening--still' : ''}`}
      data-stage={stage}
      data-count={cards.length}
    >
      {stage !== 'cards' ? (
        <div className="pack-opening__start">
          <button type="button" className="pack-opening__pack" onClick={openPack} aria-label="Open the pack">
            <img src="/pack1.png" alt="" className="pack-opening__pack-image" draggable={false} />
          </button>
          <p className="pack-opening__hint">Tap the pack to open it</p>
        </div>
      ) : (
        <div className="pack-opening__reveal">
          <h2 className="pack-opening__heading">{cards.length === 4 ? 'A bonus fourth card!' : 'Your heroes'}</h2>
          <div className="pack-opening__cards" ref={grid.ref} style={grid.style}>
            {cards.map((card, index) => (
              <div
                key={`${card.name}-${index}`}
                className={`pack-opening__card${turned[index] ? ' is-turned' : ''}`}
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
                {turned[index] ? (
                  <>
                    <div className="pack-opening__face">
                      <HeroCard hero={card.hero} holo={isHoloKind(card.kind)} readable="none" disableHPAnimations />
                    </div>
                    <div className="pack-opening__label"><CardLabel card={card} /></div>
                  </>
                ) : (
                  <div className="pack-opening__back" aria-hidden="true" />
                )}
              </div>
            ))}
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
            <button type="button" className="ui-btn ui-btn--primary pack-opening__done" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackOpening;
