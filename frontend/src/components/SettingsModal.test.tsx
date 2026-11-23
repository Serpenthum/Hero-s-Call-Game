// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';

vi.mock('../socketService', () => ({ socketService: { ping: () => new Promise(() => {}), setAutoEndTurn: () => {} } }));
vi.mock('../battleAnimations', () => ({
  getAnimSpeed: () => 'normal',
  setAnimSpeed: () => {},
  getAutoEndTurnEnabled: () => false,
  setAutoEndTurnEnabled: () => {},
  sfx: { hit: () => {} },
}));

import SettingsModal from './SettingsModal';
import { cleanup, click, render } from '../testing/dom';

function setRange(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('SettingsModal sound', () => {
  it('describes the Sound effects row', () => {
    const root = render(<SettingsModal onClose={() => {}} />);
    expect(root.textContent).toContain('Battle and menu sounds');
  });

  it('labels the effects slider "Effects volume"', () => {
    const root = render(<SettingsModal onClose={() => {}} />);
    const labels = Array.from(root.querySelectorAll('.settings-label span')).map(e => e.textContent);
    expect(labels).toContain('Effects volume');
    expect(labels).not.toContain('Volume');
  });

  it('Music switch toggles heroscall.music', () => {
    const root = render(<SettingsModal onClose={() => {}} />);
    const music = root.querySelector('[aria-label="Music"]') as HTMLButtonElement;
    expect(music.getAttribute('aria-checked')).toBe('true');
    expect(root.textContent).toContain('Background music in menus and battles');
    click(music);
    expect(localStorage.getItem('heroscall.music')).toBe('off');
    expect(music.getAttribute('aria-checked')).toBe('false');
    click(music);
    expect(localStorage.getItem('heroscall.music')).toBe('on');
  });

  it('Music volume writes heroscall.musicVolume and is disabled when Music is off', () => {
    const root = render(<SettingsModal onClose={() => {}} />);
    const slider = root.querySelector('[aria-label="Music volume"]') as HTMLInputElement;
    expect(slider.value).toBe('50');
    expect(slider.disabled).toBe(false);
    setRange(slider, 30);
    expect(localStorage.getItem('heroscall.musicVolume')).toBe('0.3');
    click(root.querySelector('[aria-label="Music"]'));
    expect(slider.disabled).toBe(true);
    expect(slider.closest('.settings-row')!.className).toContain('disabled');
  });

  it('Credits names VWolfdog', () => {
    const root = render(<SettingsModal onClose={() => {}} />);
    const text = root.textContent || '';
    expect(text).toContain('Credits');
    expect(text).toContain('Music: Soft Mysterious Harp Loop by VWolfdog (Jordy Hake), CC-BY 3.0. Woods by TBC, CC-BY. Sound effects: Kenney, lentikula, independent.nu, WobbleBoxx, untamedpixels and OpenGameArt contributors, CC0.');
  });
});
