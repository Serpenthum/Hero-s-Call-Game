import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLongPress } from './useLongPress';

describe('createLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after 450 ms held', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    vi.advanceTimersByTime(449);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when released at 300 ms, and up() returns false', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    vi.advanceTimersByTime(300);
    expect(press.up()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire when the pointer moves 11 px', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    press.move(111, 100);
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(press.up()).toBe(false);
  });

  it('still fires after a small wobble within 10 px', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    press.move(106, 108);
    vi.advanceTimersByTime(450);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('up() returns true after it fired', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    vi.advanceTimersByTime(450);
    expect(press.up()).toBe(true);
    expect(press.up()).toBe(false);
  });

  it('cancel() stops it', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ onLongPress });
    press.down(100, 100);
    vi.advanceTimersByTime(200);
    press.cancel();
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(press.up()).toBe(false);
  });

  it('honours a custom delay and tolerance', () => {
    const onLongPress = vi.fn();
    const press = createLongPress({ delayMs: 100, moveTolerancePx: 3, onLongPress });
    press.down(0, 0);
    press.move(0, 4);
    vi.advanceTimersByTime(200);
    expect(onLongPress).not.toHaveBeenCalled();
    press.down(0, 0);
    vi.advanceTimersByTime(100);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
