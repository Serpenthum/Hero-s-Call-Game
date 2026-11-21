import { describe, expect, it, vi } from 'vitest';

const speed = vi.hoisted(() => ({ value: 'off' as 'off' | 'normal' }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => speed.value }));

import { flyCard, flyKeyframes, flyTransform, cancelFlights } from './flyCard';

const at = (left: number, top: number, width: number, height: number) => ({
  getBoundingClientRect: () => ({ left, top, width, height }),
});

describe('flyTransform', () => {
  it('moves the centre of the copy onto the centre of the target, at the target width', () => {
    const t = flyTransform({ left: 100, top: 400, width: 200, height: 300 }, { left: 20, top: 90, width: 100, height: 150 });
    expect(t.scale).toBe(0.5);
    expect(t.dx).toBe(70 - 200);
    expect(t.dy).toBe(165 - 550);
  });

  it('centres a card on a round spot (a different shape)', () => {
    const t = flyTransform({ left: 0, top: 0, width: 100, height: 150 }, { left: 300, top: 10, width: 40, height: 40 });
    expect(t.scale).toBe(0.4);
    expect(t.dx).toBe(320 - 50);
    expect(t.dy).toBe(30 - 75);
  });

  it('does not divide by a zero width', () => {
    expect(flyTransform({ left: 0, top: 0, width: 0, height: 0 }, { left: 5, top: 5, width: 10, height: 10 }).scale).toBe(1);
  });
});

describe('flyKeyframes', () => {
  it('starts in place, arcs up past half way, and ends on the target', () => {
    const frames = flyKeyframes({ left: 0, top: 200, width: 100, height: 150 }, { left: 200, top: 0, width: 50, height: 75 });
    expect(frames).toHaveLength(3);
    expect(frames[0].transform).toBe('translate(0px, 0px) scale(1) rotate(0deg)');
    // dx 175, dy -237.5: half way, lifted 40px, half-way scale, tilted
    expect(frames[1]).toEqual({ transform: 'translate(87.5px, -158.75px) scale(0.75) rotate(-6deg)', offset: 0.55 });
    expect(frames[2].transform).toBe('translate(175px, -237.5px) scale(0.5) rotate(0deg)');
  });
});

describe('flyCard with animations off', () => {
  it('resolves at once and builds no copy', async () => {
    speed.value = 'off';
    const render = vi.fn();
    await expect(flyCard(at(0, 0, 100, 150), at(50, 50, 40, 60), render as never)).resolves.toBeUndefined();
    expect(render).not.toHaveBeenCalled();
  });
});

describe('flyCard without a page', () => {
  it('resolves at once (no document)', async () => {
    speed.value = 'normal';
    const render = vi.fn();
    await expect(flyCard(at(0, 0, 100, 150), at(50, 50, 40, 60), render as never)).resolves.toBeUndefined();
    expect(render).not.toHaveBeenCalled();
    expect(() => cancelFlights()).not.toThrow();
  });
});
