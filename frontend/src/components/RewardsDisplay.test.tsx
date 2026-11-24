// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RewardsDisplay from './RewardsDisplay';
import { cleanup, render, stubBrowserApis } from '../testing/dom';

const rewards = (oldVictoryPoints: number, victoryPointsGained: number) => ({
  oldXP: 0, newXP: 30, xpGained: 30, oldLevel: 3, newLevel: 3,
  oldVictoryPoints, newVictoryPoints: oldVictoryPoints + victoryPointsGained, victoryPointsGained,
  leveledUp: false,
});

function show(props: ReturnType<typeof rewards>): HTMLElement {
  const root = render(<RewardsDisplay {...props} />);
  act(() => { vi.advanceTimersByTime(1000); }); // the content appears after a second
  return root;
}

describe('RewardsDisplay coins', () => {
  beforeEach(() => { vi.useFakeTimers(); stubBrowserApis(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows +2 coins for a loss and nothing for +0', () => {
    const loss = show(rewards(40, 2));
    expect(loss.querySelector('.vp-gain')?.textContent).toBe('+2');
    cleanup();

    const quitEarly = show(rewards(40, 0));
    expect(quitEarly.querySelector('.vp-gain')).toBeNull();
    expect(quitEarly.textContent).not.toContain('+0');
  });
});
