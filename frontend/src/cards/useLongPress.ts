import React, { useEffect, useMemo, useRef } from 'react';

/** Timer logic for a long press, free of React and the DOM so it can be tested on its own. */
export function createLongPress(opts: {
  delayMs?: number;
  moveTolerancePx?: number;
  onLongPress: () => void;
}): { down(x: number, y: number): void; move(x: number, y: number): void; up(): boolean; cancel(): void } {
  const delayMs = opts.delayMs ?? 450;
  const tolerance = opts.moveTolerancePx ?? 10;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    down(x, y) {
      clear();
      fired = false;
      startX = x;
      startY = y;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        opts.onLongPress();
      }, delayMs);
    },
    move(x, y) {
      if (timer !== null && Math.hypot(x - startX, y - startY) > tolerance) clear();
    },
    up() {
      clear();
      const didFire = fired;
      fired = false;
      return didFire;
    },
    cancel() {
      clear();
      fired = false;
    },
  };
}

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onClickCapture: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * Pointer handlers that call onLongPress after a held press (touch or mouse) or a right-click.
 * The click that ends a long press is swallowed, so the element's own onClick does not also run.
 */
export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const callback = useRef(onLongPress);
  callback.current = onLongPress;
  const swallowClick = useRef(false);

  const press = useMemo(() => createLongPress({ onLongPress: () => callback.current() }), []);
  useEffect(() => () => press.cancel(), [press]);

  return useMemo<LongPressHandlers>(() => ({
    onPointerDown: event => {
      swallowClick.current = false;
      // A mouse long press ends over the reader, so this card never saw its pointerup: clear that stale press
      // first, or the right-click below would think it had already opened the reader.
      if (event.button !== 0) {
        press.cancel();
        return;
      }
      press.down(event.clientX, event.clientY);
    },
    onPointerMove: event => press.move(event.clientX, event.clientY),
    onPointerUp: () => {
      if (press.up()) swallowClick.current = true;
    },
    onPointerCancel: () => press.cancel(),
    onClickCapture: event => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
    onContextMenu: event => {
      event.preventDefault();
      // A touch long press raises contextmenu too: open once, and swallow any click that follows.
      const alreadyFired = press.up() || swallowClick.current;
      swallowClick.current = true;
      if (!alreadyFired) callback.current();
    },
  }), [press]);
}
