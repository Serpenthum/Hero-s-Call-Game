// A card copy that flies from one place on the screen to another (a pick into a team slot, a ban into
// the ban spot). The copy is a fixed layer over the page: it never blocks a tap and never holds anything back.
import { getAnimSpeed } from '../battleAnimations';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Anything that can say where it is: an element, or a place measured earlier. */
export interface Anchor {
  getBoundingClientRect(): Box;
}

export const FLY_MS = 620;
const FLY_EASING = 'cubic-bezier(.3,.7,.3,1)';
const FLYER_CLASS = 'draft-flyer';

/** The move that puts a copy sitting on `from` onto the centre of `to`, at `to`'s width. */
export function flyTransform(from: Box, to: Box): { dx: number; dy: number; scale: number } {
  return {
    dx: to.left + to.width / 2 - (from.left + from.width / 2),
    dy: to.top + to.height / 2 - (from.top + from.height / 2),
    scale: from.width > 0 ? to.width / from.width : 1,
  };
}

/** The arc: up and tilted a little past half way, then down onto the target. */
export function flyKeyframes(from: Box, to: Box): Array<{ transform: string; offset?: number }> {
  const { dx, dy, scale } = flyTransform(from, to);
  return [
    { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
    {
      transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + scale) / 2}) rotate(-6deg)`,
      offset: 0.55,
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)` },
  ];
}

/** A place that stays where an element is now, after the element itself has gone. */
export function anchorAt(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  const box = { left: r.left, top: r.top, width: r.width, height: r.height };
  return { getBoundingClientRect: () => box };
}

/**
 * Flies a copy from `from` to `to` and removes it. `render(width)` builds the copy at `from`'s width;
 * it lands centred on `to`, scaled to `to`'s width. Resolves at once when animations are off.
 */
export function flyCard(
  from: Anchor,
  to: Anchor,
  render: (width: number) => HTMLElement,
  ms: number = FLY_MS,
): Promise<void> {
  if (getAnimSpeed() === 'off' || typeof document === 'undefined' || !from || !to) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (a.width <= 0 || b.width <= 0) return Promise.resolve();

  const flyer = document.createElement('div');
  flyer.className = FLYER_CLASS;
  flyer.style.left = `${a.left}px`;
  flyer.style.top = `${a.top}px`;
  flyer.style.width = `${a.width}px`;
  flyer.style.height = `${a.height}px`;
  flyer.appendChild(render(a.width));
  document.body.appendChild(flyer);
  if (typeof flyer.animate !== 'function') {
    flyer.remove();
    return Promise.resolve();
  }
  const flight = flyer.animate(flyKeyframes(a, b), { duration: ms, easing: FLY_EASING, fill: 'forwards' });
  // A cancelled flight (cancelFlights) rejects `finished`; either way the copy goes.
  return flight.finished.then(
    () => flyer.remove(),
    () => flyer.remove(),
  );
}

/** Cuts every flight in the air: the copies vanish and their promises resolve. */
export function cancelFlights(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`.${FLYER_CLASS}`).forEach(flyer => {
    flyer.getAnimations().forEach(a => a.cancel());
    flyer.remove();
  });
}
