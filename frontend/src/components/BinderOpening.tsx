import React, { useEffect, useRef } from 'react';

interface BinderOpeningProps {
  onDone: () => void;
}

const INTRO_MS = 1700;

// Closed leather binder whose cover swings open, then zooms into the open binder. Click to skip.
const BinderOpening: React.FC<BinderOpeningProps> = ({ onDone }) => {
  // Parent re-renders must not restart the timer
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDoneRef.current();
      return;
    }
    const timer = window.setTimeout(() => onDoneRef.current(), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const pockets = Array.from({ length: 9 }, (_, i) => <span key={i} className="bi-pocket" />);

  return (
    <div className="binder-intro" onClick={onDone} role="presentation">
      <div className="binder-intro-stage">
        <div className="binder-intro-book">
          <div className="bi-page bi-page-right">
            <div className="bi-pocket-grid">{pockets}</div>
          </div>
          <div className="bi-cover">
            <div className="bi-face bi-cover-front">
              <div className="bi-rings">
                <span /><span /><span />
              </div>
              <div className="bi-crest">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M32 6 L54 14 V32 C54 45 44 54 32 58 C20 54 10 45 10 32 V14 Z" fill="none" stroke="#e8b830" strokeWidth="2.5" strokeLinejoin="round" />
                  <path d="M32 17 L36.2 26.4 L46.5 27.6 L38.8 34.5 L41 44.6 L32 39.4 L23 44.6 L25.2 34.5 L17.5 27.6 L27.8 26.4 Z" fill="#e8b830" />
                </svg>
              </div>
              <div className="bi-title">Hero's Call</div>
            </div>
            <div className="bi-face bi-cover-back">
              <div className="bi-page bi-page-left">
                <div className="bi-pocket-grid">{pockets}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BinderOpening;
