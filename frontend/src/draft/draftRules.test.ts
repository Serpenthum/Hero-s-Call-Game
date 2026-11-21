import { describe, it, expect } from 'vitest';
import {
  draftStep,
  STEP_LABELS,
  playerStatus,
  visibleBans,
  swapInOrder,
  tableFiveCardWidth,
  chooseLayout,
  bigCardWidth,
  fitCards,
  shouldPlayReveal,
  resolveChosen,
} from './draftRules';

describe('draftStep', () => {
  it('maps draft phases to steps and setup to Order', () => {
    expect(draftStep('draft', 0)).toBe(0);
    expect(draftStep('draft', 3)).toBe(3);
    expect(draftStep('setup', 3)).toBe(4);
  });
  it('clamps out-of-range draft phases to 0-3', () => {
    expect(draftStep('draft', -1)).toBe(0);
    expect(draftStep('draft', 7)).toBe(3);
  });
  it('labels each step', () => {
    expect(STEP_LABELS).toEqual(['Ban', 'Pick 1', 'Pick 2', 'Pick 3', 'Order']);
  });
});

describe('playerStatus', () => {
  it('ban step is done once a card is banned', () => {
    expect(playerStatus({ bannedCard: null }, 0)).toBe('choosing');
    expect(playerStatus({ bannedCard: 'Monk' }, 0)).toBe('done');
  });
  it('pick steps are done once the team has that many heroes', () => {
    expect(playerStatus({ team: [1] }, 2)).toBe('choosing');
    expect(playerStatus({ team: [1, 2] }, 2)).toBe('done');
  });
  it('order step is done when ready or the order is complete', () => {
    expect(playerStatus({ attackOrder: ['a', 'b', 'c'] }, 4)).toBe('done');
    expect(playerStatus({ attackOrder: [], isReady: false }, 4)).toBe('choosing');
    expect(playerStatus({ attackOrder: [], isReady: true }, 4)).toBe('done');
  });
});

describe('visibleBans', () => {
  it('hides the opponent ban until both have banned', () => {
    expect(visibleBans('Monk', null)).toEqual({ mine: 'Monk', theirs: null });
    expect(visibleBans(null, 'Druid')).toEqual({ mine: null, theirs: null });
    expect(visibleBans('Monk', 'Druid')).toEqual({ mine: 'Monk', theirs: 'Druid' });
  });
});

describe('swapInOrder', () => {
  it('exchanges two entries', () => {
    expect(swapInOrder(['a', 'b', 'c'], 'a', 'c')).toEqual(['c', 'b', 'a']);
  });
  it('returns an unchanged copy when an entry is missing', () => {
    const order = ['a', 'b', 'c'];
    const result = swapInOrder(order, 'a', 'x');
    expect(result).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(order);
  });
});

describe('layout', () => {
  it('computes the five-card table width', () => {
    expect(tableFiveCardWidth(1280, 720)).toBe(232);
  });
  it('chooses table only when five cards stay readable', () => {
    expect(chooseLayout(1280, 720)).toBe('table');
    expect(chooseLayout(1024, 640)).toBe('focus');
    expect(chooseLayout(844, 390)).toBe('focus');
    expect(chooseLayout(1440, 900)).toBe('table');
  });
  it('sizes the big focus card', () => {
    expect(bigCardWidth(844, 390)).toBe(256);
    expect(bigCardWidth(640, 360)).toBe(235);
    expect(bigCardWidth(1024, 640)).toBe(409);
  });
});

describe('fitCards', () => {
  it('wraps to two rows when that gives bigger cards', () => {
    expect(fitCards(5, { width: 593, height: 462 }, 10)).toEqual({ width: 154, perRow: 3, rows: 2 });
  });
  it('keeps one row in a wide short box', () => {
    expect(fitCards(5, { width: 1236, height: 340 }, 18).rows).toBe(1);
  });
  it('fewer cards are never smaller', () => {
    const box = { width: 593, height: 462 };
    expect(fitCards(2, box, 10).width).toBeGreaterThanOrEqual(fitCards(5, box, 10).width);
  });
  it('treats zero cards as one', () => {
    const box = { width: 593, height: 462 };
    expect(fitCards(0, box, 10)).toEqual(fitCards(1, box, 10));
  });
});

describe('shouldPlayReveal', () => {
  it('plays only on a live setup to initiative transition seen in this tab', () => {
    expect(shouldPlayReveal(true, 'setup', 'initiative')).toBe(true);
    expect(shouldPlayReveal(false, 'setup', 'initiative')).toBe(false);
    expect(shouldPlayReveal(true, null, 'initiative')).toBe(false);
    expect(shouldPlayReveal(true, 'initiative', 'battle')).toBe(false);
  });
});

describe('resolveChosen', () => {
  it('keeps the choice only while it is still in hand', () => {
    expect(resolveChosen('Wizard', ['Monk'])).toBeNull();
    expect(resolveChosen('Monk', ['Monk', 'Bard'])).toBe('Monk');
    expect(resolveChosen(null, ['Monk'])).toBeNull();
  });
});
