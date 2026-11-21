// Pure parts of the reveal that plays when the draft ends: where the two rows stand for the face-off,
// when each beat happens, and whether this tab has seen the Order step live.
import type { Box } from './flyCard';

/** Beats of the reveal, in ms from the moment the copies are drawn (the approved mockup's timings). */
export const REVEAL = {
  /** Each card takes this long to drop or rise in. */
  cardInMs: 600,
  /** The first card starts after this; each next one this much later. */
  cardFirstMs: 200,
  cardGapMs: 90,
  /** VS slams in, then the line and the flash. */
  vsAtMs: 850,
  flashAtMs: 950,
  /** Both rows start gliding to the battle cards and the backdrop starts fading. */
  glideAtMs: 2200,
  glideMs: 750,
  /** The overlay goes: just after the glide has landed. */
  doneAtMs: 3000,
  /** Stills: the whole reveal is this fade. */
  fadeMs: 300,
  /** The board's cards never showed up to be measured: give up and fade to the board. */
  measureGiveUpMs: 1500,
  /** The battle began under the reveal: the rows go to their cards and the overlay goes in this long. */
  hurryMs: 300,
} as const;

/** When card `index` of a row starts moving. */
export function cardDelayMs(index: number): number {
  return REVEAL.cardFirstMs + index * REVEAL.cardGapMs;
}

/** How far sideways a row of cards must shift to sit centred on a screen `screenWidth` wide. */
export function centredRowOffset(cards: Box[], screenWidth: number): number {
  if (cards.length === 0) return 0;
  const left = Math.min(...cards.map(c => c.left));
  const right = Math.max(...cards.map(c => c.left + c.width));
  return screenWidth / 2 - (left + right) / 2;
}

/** The height of the VS line: half way between the bottom of the upper row and the top of the lower one. */
export function faceOffLineY(upper: Box[], lower: Box[], screenHeight: number): number {
  if (upper.length === 0 || lower.length === 0) return screenHeight / 2;
  const upperBottom = Math.max(...upper.map(c => c.top + c.height));
  const lowerTop = Math.min(...lower.map(c => c.top));
  return (upperBottom + lowerTop) / 2;
}

/** Two measurements of the same cards agree (to a tenth of a pixel): the board has stopped moving. */
export function sameBoxes(a: Box[] | null, b: Box[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((box, i) =>
    (['left', 'top', 'width', 'height'] as const).every(k => Math.abs(box[k] - b[i][k]) < 0.1),
  );
}

export type RevealStage = 'wait' | 'faceoff' | 'board' | 'fade' | 'hurry';

/**
 * Where the reveal stands `elapsedMs` after it began.
 * - stills: a fade from the first frame;
 * - no measured cards yet: wait, and after `measureGiveUpMs` fade instead;
 * - measured at `measuredAtMs`: face-off, then the glide onto the board, then done.
 */
export function revealStage(
  still: boolean,
  measuredAtMs: number | null,
  elapsedMs: number,
): RevealStage | 'done' {
  if (still) return elapsedMs >= REVEAL.fadeMs ? 'done' : 'fade';
  if (measuredAtMs === null) {
    if (elapsedMs < REVEAL.measureGiveUpMs) return 'wait';
    return elapsedMs >= REVEAL.measureGiveUpMs + REVEAL.fadeMs ? 'done' : 'fade';
  }
  const t = elapsedMs - measuredAtMs;
  if (t >= REVEAL.doneAtMs) return 'done';
  return t >= REVEAL.glideAtMs ? 'board' : 'faceoff';
}

/**
 * The battle began while the reveal was up (the roll winner chose quickly). What the reveal does in its
 * last moments, and for how long, so the cards never jump:
 * - face-off: the rows hurry onto their battle cards;
 * - nothing drawn yet: a short fade;
 * - already gliding or fading: it carries on to its own end (null).
 */
export function hurryStage(stage: RevealStage): { stage: RevealStage; ms: number } | null {
  if (stage === 'faceoff') return { stage: 'hurry', ms: REVEAL.hurryMs };
  if (stage === 'wait') return { stage: 'fade', ms: REVEAL.fadeMs };
  return null;
}

/**
 * Whether the reveal is up after the phase went from `prevPhase` to `phase`.
 * `play`: this change is the live Order-to-roll change the reveal plays for.
 * A reveal that is up stays up when the battle begins (it hurries its cards onto the board and ends itself);
 * any other change takes it down.
 */
export function revealOnPhase(revealing: boolean, play: boolean, prevPhase: string | null, phase: string | null): boolean {
  if (play) return true;
  return revealing && prevPhase === 'initiative' && phase === 'battle';
}

/** The phases the reveal can be on screen in: the roll, and the first moments of the battle after it. */
export function revealPhase(phase: string | null | undefined): boolean {
  return phase === 'initiative' || phase === 'battle';
}

/**
 * Whether this tab has watched the Order step (`setup`) of the game it is in, as a player.
 * Leaving the game forgets it; a spectator never counts.
 */
export function setupSeen(seen: boolean, phase: string | null, isSpectating: boolean): boolean {
  if (!phase || phase === 'waiting' || isSpectating) return false;
  return phase === 'setup' ? true : seen;
}
