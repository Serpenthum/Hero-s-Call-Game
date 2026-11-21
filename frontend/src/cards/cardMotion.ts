import { getAnimSpeed } from '../battleAnimations';

// Card motion (glint, tilt, holo drift, the pack opening's moves) stops with "Battle animations: off"
// and with the system's reduced-motion setting.
export const cardMotionOff = (): boolean =>
  getAnimSpeed() === 'off' ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
