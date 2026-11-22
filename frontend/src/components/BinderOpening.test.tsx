// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BinderOpening, { OPENING_MS } from './BinderOpening';
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

  it('shows the closed binder and Tap the binder to open it', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    expect(opening(root)!.dataset.stage).toBe('closed');
    expect(root.querySelector('.binder-opening-cover')).not.toBeNull();
    expect(root.querySelector('.binder-opening-title')?.textContent).toBe("Hero's Call");
    expect(root.querySelector('.binder-opening-tap')?.textContent).toBe('Tap the binder to open it');
    advance(10000); // it waits for the tap
    expect(onOpened).not.toHaveBeenCalled();
  });

  it('a tap calls onOpened after the opening finishes', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    click(root.querySelector('.binder-opening-cover'));
    expect(opening(root)!.dataset.stage).toBe('opening');
    advance(OPENING_MS - 1);
    expect(onOpened).not.toHaveBeenCalled();
    advance(1);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('a second tap while it opens changes nothing', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    click(root.querySelector('.binder-opening-cover'));
    advance(OPENING_MS / 2);
    click(root.querySelector('.binder-opening-cover'));
    advance(OPENING_MS / 2);
    expect(onOpened).toHaveBeenCalledTimes(1);
    advance(OPENING_MS);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('Enter opens the binder', () => {
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    act(() => { opening(root)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    advance(OPENING_MS);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('with cardMotionOff, onOpened is called at once and nothing is shown', () => {
    localStorage.setItem('heroscall.animSpeed', 'off');
    const onOpened = vi.fn();
    const root = render(<BinderOpening onOpened={onOpened} />);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(root.innerHTML).toBe('');
  });
});
