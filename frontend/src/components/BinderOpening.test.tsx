// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sound = vi.hoisted(() => ({ playSound: vi.fn(), loadSoundGroup: vi.fn() }));
vi.mock('../sound', () => sound);
import BinderOpening, { LAND_MS, OPENING_MS } from './BinderOpening';
import { cleanup, click, render, stubBrowserApis } from '../testing/dom';

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const opening = (root: ParentNode) => root.querySelector('.binder-opening') as HTMLElement | null;

describe('BinderOpening', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the closed binder with no prompt to tap', () => {
    const root = render(<BinderOpening onOpened={vi.fn()} />);
    expect(opening(root)!.dataset.stage).toBe('closed');
    expect(root.querySelector('.binder-opening-cover')).not.toBeNull();
    expect(root.querySelector('.binder-opening-title')?.textContent).toBe("Hero's Call");
    expect(root.textContent).not.toMatch(/tap/i);
  });

  it('opens by itself once it has landed, then calls onOpened when the opening ends', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    advance(LAND_MS - 1);
    expect(opening(root)!.dataset.stage).toBe('closed');
    advance(1);
    expect(opening(root)!.dataset.stage).toBe('opening');
    advance(OPENING_MS - 1);
    expect(onOpened).not.toHaveBeenCalled();
    advance(1);
    expect(onOpened).toHaveBeenCalledTimes(1);
    advance(10000);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('a tap while it sits closed skips straight to the book', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    click(root.querySelector('.binder-opening-cover'));
    expect(onOpened).toHaveBeenCalledTimes(1);
    advance(LAND_MS + OPENING_MS);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('a tap while it opens skips to the end, and onOpened still runs only once', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    advance(LAND_MS + OPENING_MS / 2);
    expect(onOpened).not.toHaveBeenCalled();
    click(opening(root));
    expect(onOpened).toHaveBeenCalledTimes(1);
    click(opening(root));
    advance(OPENING_MS);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it.each(['Enter', ' '])('the %j key skips it', (key) => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    act(() => { opening(root)!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('with cardMotionOff, onOpened is called at once and nothing is shown', () => {
    localStorage.setItem('heroscall.animSpeed', 'off');
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(root.innerHTML).toBe('');
  });

  describe('sound', () => {
    const opens = () => sound.playSound.mock.calls.filter(c => c[0] === 'binder.open').length;
    beforeEach(() => { sound.playSound.mockClear(); sound.loadSoundGroup.mockClear(); });

    it('binder opening plays binder.open when it opens', () => {
      const root = render(<BinderOpening onOpened={vi.fn()} />);
      expect(sound.loadSoundGroup).toHaveBeenCalledWith('binder');
      advance(LAND_MS - 1);
      expect(opens()).toBe(0);
      advance(1);
      expect(opening(root)!.dataset.stage).toBe('opening');
      expect(opens()).toBe(1);
      click(opening(root));
      advance(OPENING_MS * 3);
      expect(opens()).toBe(1);
    });

    it('a skip tap while closed plays binder.open once', () => {
      const root = render(<BinderOpening onOpened={vi.fn()} />);
      click(opening(root));
      advance(LAND_MS + OPENING_MS);
      expect(opens()).toBe(1);
    });
  });
});
