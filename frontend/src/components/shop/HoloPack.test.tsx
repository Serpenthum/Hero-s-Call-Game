// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HoloPack from './HoloPack';
import { cleanup, render, stubBrowserApis } from '../../testing/dom';

const TILT_QUERY = '(hover: hover) and (pointer: fine)';

// A mouse: the only kind of pointer the pack leans toward.
function stubFinePointer() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === TILT_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderPack(width = '112px') {
  const el = render(<HoloPack width={width} />).querySelector('.holo-pack') as HTMLElement;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 150, right: 100, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
  return el;
}

const moveTo = (el: HTMLElement, clientX: number, clientY: number) =>
  el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY }));
// React reads a pointer leaving from pointerout.
const leave = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: null }));

describe('HoloPack', () => {
  beforeEach(() => {
    stubBrowserApis();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('draws the foil when holo effects are on', () => {
    const root = render(<HoloPack width="112px" />);
    expect(root.querySelector('.holo-pack--foil')).not.toBeNull();
    expect(root.querySelector('.holo-pack__sheen')).not.toBeNull();
    expect(root.querySelector('.holo-pack__spark')).not.toBeNull();
  });

  it('draws plain when holo effects are off', () => {
    localStorage.setItem('heroscall.holo', 'off');
    const root = render(<HoloPack width="112px" />);
    expect(root.querySelector('.holo-pack')).not.toBeNull();
    expect(root.querySelector('.holo-pack--foil')).toBeNull();
    expect(root.querySelector('.holo-pack__sheen')).toBeNull();
    expect(root.querySelector('.holo-pack__spark')).toBeNull();
  });

  it('the foil follows the pointer', () => {
    const el = renderPack();
    moveTo(el, 25, 150);
    expect(el.style.getPropertyValue('--card-mx')).toBe('25%');
    expect(el.style.getPropertyValue('--card-my')).toBe('100%');
  });

  it('has no ring element', () => {
    expect(render(<HoloPack width="112px" />).querySelector('.pk-foil')).toBeNull();
  });

  it('does not lean on a touch screen', () => {
    const el = renderPack();
    moveTo(el, 25, 150);
    expect(el.style.getPropertyValue('--card-rx')).toBe('');
    expect(el.style.getPropertyValue('--card-ry')).toBe('');
  });

  it('leans toward a mouse pointer', () => {
    stubFinePointer();
    const el = renderPack();
    moveTo(el, 25, 150);
    expect(el.style.getPropertyValue('--card-ry')).toBe('-6deg');
    expect(el.style.getPropertyValue('--card-rx')).toBe('-12deg');
  });

  it('resets the foil and the lean when the pointer leaves', () => {
    stubFinePointer();
    const el = renderPack();
    moveTo(el, 25, 150);
    expect(el.classList.contains('holo-pack--hovering')).toBe(true);
    leave(el);
    for (const name of ['--card-mx', '--card-my', '--card-rx', '--card-ry']) {
      expect(el.style.getPropertyValue(name)).toBe('');
    }
    expect(el.classList.contains('holo-pack--hovering')).toBe(false);
  });

  it('does not follow the pointer when holo effects are off', () => {
    localStorage.setItem('heroscall.holo', 'off');
    stubFinePointer();
    const el = renderPack();
    moveTo(el, 25, 150);
    expect(el.style.getPropertyValue('--card-mx')).toBe('');
    expect(el.style.getPropertyValue('--card-ry')).toBe('');
  });

  it('takes its width as any CSS length', () => {
    expect(renderPack('var(--shop-pack-w)').style.getPropertyValue('--holo-pack-w')).toBe('var(--shop-pack-w)');
  });

  it('shows the pack name, "Adventure Pack" unless told otherwise', () => {
    expect(render(<HoloPack width="112px" />).querySelector('.holo-pack__name')?.textContent).toBe('Adventure Pack');
    expect(render(<HoloPack width="112px" name="Dragon Pack" />).querySelector('.holo-pack__name')?.textContent).toBe('Dragon Pack');
  });

  it('uses the same picture as the pack opening', () => {
    expect(render(<HoloPack width="112px" />).querySelector('img')?.getAttribute('src')).toBe('/pack1.png');
  });
});
