import React from 'react';
import { Hero } from '../../types';
import { DraftStep, READ_TEXT_MIN_PX } from '../../draft/draftRules';
import HeroCard from '../HeroCard';

export interface DraftHandProps {
  cards: Hero[];
  chosen: string | null;
  step: DraftStep;
  locked: boolean;
  onChoose(name: string): void;
  /** The big-card layout: the hint tells the player a tap shows the card big. */
  layout?: 'table' | 'focus';
}

const hint = (step: DraftStep, layout: 'table' | 'focus') => {
  if (layout === 'focus') {
    return step === 0 ? (
      <><b>Ban one.</b> Tap a card to read it.</>
    ) : (
      <><b>Pick one.</b> Tap a card to read it.</>
    );
  }
  return step === 0 ? (
    <><b>Ban one.</b> Your opponent gets this hand next.</>
  ) : (
    <><b>Pick one</b> for your team.</>
  );
};

/** The hint line and the hand you hold. Each card is sized by the table's --draft-card-w. */
const DraftHand: React.FC<DraftHandProps> = ({ cards, chosen, step, locked, onChoose, layout = 'table' }) => (
  <>
    <p className={`draft-hint${step === 0 ? ' draft-hint--ban' : ''}`}>{hint(step, layout)}</p>
    <div className={`draft-hand${step === 0 ? ' draft-hand--ban' : ''}${locked ? ' draft-hand--locked' : ''}`}>
      {cards.map(hero => {
        const isChosen = chosen === hero.name;
        return (
          <div
            key={hero.name}
            className={`draft-hand-card${isChosen ? ' draft-hand-card--chosen' : ''}`}
            data-name={hero.name}
          >
            <HeroCard
              hero={hero}
              holo={!!hero.holo}
              isSelectable={!locked}
              isSelected={isChosen}
              onClick={() => onChoose(hero.name)}
              readable="press"
              // Table layout: these are the cards read on the table, so their rules text keeps the 12px floor.
              // In the big-card layout they are small (or tiny) and the big card is the one read.
              minTextPx={layout === 'table' ? READ_TEXT_MIN_PX : undefined}
              disableHPAnimations
            />
          </div>
        );
      })}
    </div>
  </>
);

export default DraftHand;
