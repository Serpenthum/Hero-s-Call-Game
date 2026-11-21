import { describe, it, expect } from 'vitest';
import {
  REVEAL,
  cardDelayMs,
  centredRowOffset,
  faceOffLineY,
  hurryStage,
  revealOnPhase,
  revealPhase,
  revealStage,
  sameBoxes,
  setupSeen,
} from './revealRules';

const box = (left: number, top: number, width = 100, height = 150) => ({ left, top, width, height });

describe('centredRowOffset', () => {
  it('shifts a row so its middle is the middle of the screen', () => {
    // Board cards sit right of centre (the log panel is wider than the actions panel)
    const row = [box(400, 50), box(510, 50), box(620, 50)]; // spans 400-720, middle 560
    expect(centredRowOffset(row, 1000)).toBe(-60);
    expect(centredRowOffset(row, 1200)).toBe(40);
  });
  it('does not depend on the order of the cards and is 0 for a centred or empty row', () => {
    expect(centredRowOffset([box(620, 50), box(400, 50)], 1000)).toBe(-60);
    expect(centredRowOffset([box(450, 0)], 1000)).toBe(0);
    expect(centredRowOffset([], 1000)).toBe(0);
  });
});

describe('faceOffLineY', () => {
  it('is half way between the two rows', () => {
    expect(faceOffLineY([box(0, 40, 100, 150)], [box(0, 230, 100, 150)], 400)).toBe(210);
  });
  it('falls back to the middle of the screen without cards', () => {
    expect(faceOffLineY([], [box(0, 230)], 400)).toBe(200);
  });
});

describe('sameBoxes', () => {
  it('is true only for the same cards in the same places', () => {
    expect(sameBoxes([box(1, 2)], [box(1.04, 2)])).toBe(true);
    expect(sameBoxes([box(1, 2)], [box(1.5, 2)])).toBe(false);
    expect(sameBoxes([box(1, 2)], [box(1, 2, 101)])).toBe(false);
    expect(sameBoxes([box(1, 2)], [box(1, 2), box(3, 4)])).toBe(false);
    expect(sameBoxes(null, [box(1, 2)])).toBe(false);
  });
});

describe('cardDelayMs', () => {
  it('starts the cards 90 ms apart', () => {
    expect([0, 1, 2].map(cardDelayMs)).toEqual([200, 290, 380]);
  });
});

describe('revealStage', () => {
  it('stills: a 0.3 s fade and nothing else', () => {
    expect(revealStage(true, null, 0)).toBe('fade');
    expect(revealStage(true, 0, 299)).toBe('fade');
    expect(revealStage(true, null, 300)).toBe('done');
  });
  it('waits for the board, then faces off, glides and ends', () => {
    expect(revealStage(false, null, 40)).toBe('wait');
    expect(revealStage(false, 50, 50)).toBe('faceoff');
    expect(revealStage(false, 50, 50 + REVEAL.glideAtMs - 1)).toBe('faceoff');
    expect(revealStage(false, 50, 50 + REVEAL.glideAtMs)).toBe('board');
    expect(revealStage(false, 50, 50 + REVEAL.doneAtMs - 1)).toBe('board');
    expect(revealStage(false, 50, 50 + REVEAL.doneAtMs)).toBe('done');
  });
  it('the glide has landed before the overlay goes', () => {
    expect(REVEAL.glideAtMs + REVEAL.glideMs).toBeLessThanOrEqual(REVEAL.doneAtMs);
  });
  it('gives up and fades when the board never shows its cards', () => {
    expect(revealStage(false, null, REVEAL.measureGiveUpMs - 1)).toBe('wait');
    expect(revealStage(false, null, REVEAL.measureGiveUpMs)).toBe('fade');
    expect(revealStage(false, null, REVEAL.measureGiveUpMs + REVEAL.fadeMs)).toBe('done');
  });
});

describe('setupSeen', () => {
  it('turns on at the Order step and stays on into the roll', () => {
    expect(setupSeen(false, 'draft', false)).toBe(false);
    expect(setupSeen(false, 'setup', false)).toBe(true);
    expect(setupSeen(true, 'initiative', false)).toBe(true);
  });
  it('a tab that joined at the roll never saw it', () => {
    expect(setupSeen(false, 'initiative', false)).toBe(false);
  });
  it('is forgotten when the game is left, and never counts for a spectator', () => {
    expect(setupSeen(true, null, false)).toBe(false);
    expect(setupSeen(true, 'waiting', false)).toBe(false);
    expect(setupSeen(false, 'setup', true)).toBe(false);
  });
});

describe('hurryStage (the battle begins under the reveal)', () => {
  it('hurries the rows onto the board from the face-off, in 0.3 s', () => {
    expect(hurryStage('faceoff')).toEqual({ stage: 'hurry', ms: 300 });
  });
  it('fades when no copy was drawn yet', () => {
    expect(hurryStage('wait')).toEqual({ stage: 'fade', ms: REVEAL.fadeMs });
  });
  it('leaves a glide or a fade (stills) to finish on its own, and never hurries twice', () => {
    expect(hurryStage('board')).toBeNull();
    expect(hurryStage('fade')).toBeNull();
    expect(hurryStage('hurry')).toBeNull();
  });
});

describe('revealOnPhase', () => {
  it('goes up on the live Order-to-roll change', () => {
    expect(revealOnPhase(false, true, 'setup', 'initiative')).toBe(true);
  });
  it('stays up when the battle begins under it, so its cards can be brought home', () => {
    expect(revealOnPhase(true, false, 'initiative', 'battle')).toBe(true);
  });
  it('does not start at the battle when it was not up', () => {
    expect(revealOnPhase(false, false, 'initiative', 'battle')).toBe(false);
  });
  it('comes down on any other change', () => {
    expect(revealOnPhase(true, false, 'battle', 'ended')).toBe(false);
    expect(revealOnPhase(true, false, 'initiative', null)).toBe(false);
    expect(revealOnPhase(true, false, 'initiative', 'waiting')).toBe(false);
    expect(revealOnPhase(true, false, 'setup', 'battle')).toBe(false);
    expect(revealOnPhase(true, false, null, 'initiative')).toBe(false);
  });
});

describe('revealPhase', () => {
  it('is the roll and the battle only', () => {
    expect(revealPhase('initiative')).toBe(true);
    expect(revealPhase('battle')).toBe(true);
    expect(['draft', 'setup', 'ended', 'waiting', null, undefined].some(p => revealPhase(p))).toBe(false);
  });
});
