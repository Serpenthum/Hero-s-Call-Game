import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BadgeKey } from '../../battle/badges';

// Which badge's helper bubble is open on one card. Spec "Helper text, by screen":
// - a click or tap opens it and it stays until a click elsewhere (or a tap on the same token);
// - a mouse hover opens it and leaving closes it, unless it was clicked open;
// - one open at a time on the whole page; Escape closes it; it closes when `resetKey` (the turn) changes.
// The card closes it when its badge goes away (it holds the badge list).

interface Tip { key: BadgeKey; pinned: boolean }
interface Owner { close: () => void }

// The card whose bubble is open now; opening another closes it, so two cards are never open together.
let current: Owner | null = null;

export interface BadgeTip {
  openKey: BadgeKey | null;
  toggle: (key: BadgeKey) => void;
  hover: (key: BadgeKey, on: boolean) => void;
  close: () => void;
}

export function useBadgeTip(resetKey: unknown): BadgeTip {
  const [tip, setTipState] = useState<Tip | null>(null);
  const tipRef = useRef<Tip | null>(null);
  const owner = useRef<Owner>({ close: () => undefined });

  // The ref is the truth between renders: a hover and a click can arrive before React re-renders.
  const setTip = useCallback((next: Tip | null) => {
    tipRef.current = next;
    setTipState(next);
    if (next) {
      if (current && current !== owner.current) current.close();
      current = owner.current;
    } else if (current === owner.current) {
      current = null;
    }
  }, []);
  owner.current.close = () => setTip(null);

  const close = useCallback(() => { if (tipRef.current) setTip(null); }, [setTip]);

  const toggle = useCallback((key: BadgeKey) => {
    const t = tipRef.current;
    // A hover-opened bubble that is clicked stays open (the mouse's click lands after its hover)
    setTip(t && t.key === key && t.pinned ? null : { key, pinned: true });
  }, [setTip]);

  const hover = useCallback((key: BadgeKey, on: boolean) => {
    const t = tipRef.current;
    if (on) {
      if (t && t.key === key) return;
      setTip({ key, pinned: false });
    } else if (t && t.key === key && !t.pinned) {
      setTip(null);
    }
  }, [setTip]);

  // A click anywhere but a badge closes it (capture: card taps stop their click from bubbling). A tap on another
  // badge opens that one, which closes this one through `current`.
  const isOpen = tip !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('.badge-token')) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  // A new turn closes it
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    close();
  }, [resetKey, close]);

  // Gone from the page: let the next card open without calling a dead one
  useEffect(() => () => { if (current === owner.current) current = null; }, []);

  return useMemo(() => ({ openKey: tip?.key ?? null, toggle, hover, close }), [tip, toggle, hover, close]);
}
