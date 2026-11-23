import { beforeEach, describe, expect, it, vi } from 'vitest';
const effects = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock('./effects', () => effects);
import { playRewardSounds } from './rewardSounds';

describe('playRewardSounds', () => {
  beforeEach(() => effects.playSound.mockClear());

  it('a reward with coins plays coin; with leveledUp plays levelup once', () => {
    playRewardSounds({ coinsGained: 3 });
    expect(effects.playSound.mock.calls).toEqual([['coin']]);
    effects.playSound.mockClear();
    playRewardSounds({ leveledUp: true });
    expect(effects.playSound.mock.calls).toEqual([['levelup']]);
  });

  it('nothing gained plays nothing', () => {
    playRewardSounds({ coinsGained: 0, leveledUp: false });
    playRewardSounds({});
    playRewardSounds({ coinsGained: -12 });
    expect(effects.playSound).not.toHaveBeenCalled();
  });
});
