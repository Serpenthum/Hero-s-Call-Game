// The binder's opening: a closed leather binder lands on the table, then its cover swings open by itself and it
// grows to lie exactly over the real book underneath, and fades away. A tap (or Enter/Space) skips straight to the book.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cardMotionOff } from '../cards/cardMotion';

interface BinderOpeningProps {
  onOpened: () => void; // The real book is showing
}

// The binder drops and settles (Binder.css: the fall takes 0.85s) before its cover opens by itself.
export const LAND_MS = 1100;
// From the cover starting to open to the real book showing. Binder.css times the swing, the light and the fade inside this.
export const OPENING_MS = 1500;

const BinderOpening: React.FC<BinderOpeningProps> = ({ onOpened }) => {
  const [still] = useState(cardMotionOff);
  const [stage, setStage] = useState<'closed' | 'opening'>('closed');
  // Parent re-renders must not restart the timers
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  // onOpened runs once, whether the opening ends by itself or a tap skips it
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onOpenedRef.current();
  }, []);

  useEffect(() => {
    if (still) {
      finish();
      return;
    }
    const timer = stage === 'closed'
      ? window.setTimeout(() => setStage('opening'), LAND_MS)
      : window.setTimeout(finish, OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [still, stage, finish]);

  // Keyboard players skip it with Enter or Space
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);

  if (still) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    finish();
  };

  return (
    <div
      ref={rootRef}
      className="binder-opening"
      data-stage={stage}
      style={{ '--open-ms': `${OPENING_MS}ms` } as React.CSSProperties}
      role="button"
      aria-label="Open the binder now"
      tabIndex={0}
      onClick={finish}
      onKeyDown={onKeyDown}
    >
      <div className="binder-opening-stage">
        <div className="binder-opening-dust" />
        <div className="binder-opening-fall">
          <div className="binder-opening-book">
            <div className="binder-opening-spill" />
            <div className="binder-opening-half binder-opening-half--left" />
            <div className="binder-opening-half binder-opening-half--right" />
            <div className="binder-opening-rings" aria-hidden="true"><span /><span /><span /></div>
            <div className="binder-opening-light" />
            <div className="binder-opening-cover">
              <div className="binder-opening-front">
                <span className="binder-opening-glint" />
                <span className="binder-opening-corner binder-opening-corner--top" />
                <span className="binder-opening-corner binder-opening-corner--bottom" />
                <svg className="binder-opening-crest" viewBox="0 0 64 64" aria-hidden="true">
                  <path className="binder-opening-shield" d="M32 6 L54 14 V32 C54 45 44 54 32 58 C20 54 10 45 10 32 V14 Z" />
                  <path className="binder-opening-star" d="M32 17 L36.2 26.4 L46.5 27.6 L38.8 34.5 L41 44.6 L32 39.4 L23 44.6 L25.2 34.5 L17.5 27.6 L27.8 26.4 Z" />
                </svg>
                <div className="binder-opening-title">Hero's Call</div>
                <span className="binder-opening-clasp" />
              </div>
              <div className="binder-opening-back" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BinderOpening;
