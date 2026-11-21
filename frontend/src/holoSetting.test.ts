import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHoloEffects, setHoloEffects, isHolo } from './holoSetting';

const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
};

describe('holo setting', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('holo effects default on, and off after setHoloEffects(false)', () => {
    expect(getHoloEffects()).toBe(true);
    setHoloEffects(false);
    expect(getHoloEffects()).toBe(false);
    expect(localStorage.getItem('heroscall.holo')).toBe('off');
    setHoloEffects(true);
    expect(getHoloEffects()).toBe(true);
    expect(localStorage.getItem('heroscall.holo')).toBe('on');
  });

  it('stays on when storage cannot be read or written', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => setHoloEffects(false)).not.toThrow();
    expect(getHoloEffects()).toBe(true);
  });
});

describe('isHolo', () => {
  it('is true only for heroes in the player\'s holo list', () => {
    const user = { holo_heroes: ['Monk'] };
    expect(isHolo(user, 'Monk')).toBe(true);
    expect(isHolo(user, 'Bard')).toBe(false);
    expect(isHolo({}, 'Monk')).toBe(false);
    expect(isHolo(null, 'Monk')).toBe(false);
  });
});
