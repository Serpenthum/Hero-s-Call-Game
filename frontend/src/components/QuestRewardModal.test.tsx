// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sound = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock('../sound', () => sound);
import QuestRewardModal from './QuestRewardModal';
import type { PendingQuestReward } from '../types';
import { cleanup, render, stubBrowserApis } from '../testing/dom';

const reward = (vpGained: number): PendingQuestReward => ({
  completed: [{ id: 'q1', text: 'Win a battle' }] as PendingQuestReward['completed'],
  xpGained: 50, vpGained, oldXP: 0, oldLevel: 1, oldVictoryPoints: 0, leveledUp: false,
});

describe('QuestRewardModal sound', () => {
  beforeEach(() => { stubBrowserApis(); sound.playSound.mockClear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('quest modal plays quest once, and its coins 600 ms later', () => {
    render(<StrictMode><QuestRewardModal reward={reward(5)} onOk={vi.fn()} /></StrictMode>);
    expect(sound.playSound.mock.calls).toEqual([['quest'], ['coin', { delayMs: 600 }]]);
  });

  it('no coins, no coin sound', () => {
    render(<QuestRewardModal reward={reward(0)} onOk={vi.fn()} />);
    expect(sound.playSound.mock.calls).toEqual([['quest']]);
  });
});
