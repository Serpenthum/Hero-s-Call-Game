import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HeroCard, { HeroCardData } from '../components/HeroCard';
import '../styles/CardReader.css';

export interface CardReaderOptions {
  holo?: boolean;
  favorite?: boolean;
  actions?: React.ReactNode; // Rendered under the large card
}

interface CardReaderApi {
  open(hero: HeroCardData, opts?: CardReaderOptions): void;
  close(): void;
}

interface ReaderEntry extends CardReaderOptions {
  hero: HeroCardData;
}

// Outside a provider (a lone card on a dev screen) reading simply does nothing.
const CardReaderContext = createContext<CardReaderApi>({ open: () => {}, close: () => {} });

export function useCardReader(): CardReaderApi {
  return useContext(CardReaderContext);
}

const HISTORY_KEY = 'heroCardReader';

export function CardReaderProvider(props: { children: React.ReactNode }): JSX.Element {
  const [entry, setEntry] = useState<ReaderEntry | null>(null);
  // True while the reader owns the top history entry, so the back button closes it.
  const pushedHistory = useRef(false);

  const open = useCallback((hero: HeroCardData, opts: CardReaderOptions = {}) => {
    setEntry({ hero, ...opts });
    if (!pushedHistory.current) {
      window.history.pushState({ [HISTORY_KEY]: true }, '');
      pushedHistory.current = true;
    }
  }, []);

  const close = useCallback(() => {
    setEntry(null);
    if (pushedHistory.current) {
      pushedHistory.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (!pushedHistory.current) return;
      pushedHistory.current = false;
      setEntry(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <CardReaderContext.Provider value={api}>
      {props.children}
      {entry && createPortal(<CardReaderOverlay entry={entry} onClose={close} />, document.body)}
    </CardReaderContext.Provider>
  );
}

const CardReaderOverlay: React.FC<{ entry: ReaderEntry; onClose: () => void }> = ({ entry, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  // Only a tap that starts on the overlay closes it; the release of the press that opened it does not.
  const pressedHere = useRef(false);

  useLayoutEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    overlayRef.current?.focus({ preventScroll: true });
    return () => {
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="card-reader"
      role="dialog"
      aria-modal="true"
      aria-label={entry.hero.name}
      tabIndex={-1}
      onPointerDown={() => { pressedHere.current = true; }}
      onClick={() => {
        if (!pressedHere.current) return;
        pressedHere.current = false;
        onClose();
      }}
      onContextMenu={event => event.preventDefault()}
    >
      <div className="card-reader-stage">
        <HeroCard
          hero={entry.hero}
          holo={entry.holo}
          favorite={entry.favorite}
          glint
          tilt
          readable="none"
          disableHPAnimations
        />
        {entry.actions && (
          <div className="card-reader-actions" onClick={event => event.stopPropagation()}>
            {entry.actions}
          </div>
        )}
      </div>
    </div>
  );
};
