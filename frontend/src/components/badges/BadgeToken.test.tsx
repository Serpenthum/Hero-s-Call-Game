// @vitest-environment jsdom
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import BadgeToken from './BadgeToken';
import BadgeSprite from './BadgeSprite';
import type { Badge } from '../../battle/badges';
import { cleanup, click, render } from '../../testing/dom';

const poison: Badge = { key: 'poison', symbol: 'i-poison', rim: 'poison', count: '3', short: 'Poison 3', full: 'Takes 3 damage at the end of its turn.' };
const hidden: Badge = { key: 'hidden', symbol: 'i-hidden', rim: 'buff', short: 'Hidden', full: "Can't be Focused until Ninja's next turn." };
const coming: Badge = { key: 'tauntComing', symbol: 'i-taunt', rim: 'debuff', dashed: true, short: 'Taunt coming', full: 'Will be taunted by Paladin at the end of this turn.' };
const noop = () => undefined;

afterEach(cleanup);

describe('BadgeToken', () => {
  it('renders the symbol reference and rim class', () => {
    const root = render(<BadgeToken badge={poison} open={false} onToggle={noop} />);
    const token = root.querySelector('.badge-token')!;
    expect(token.classList.contains('badge-poison')).toBe(true);
    expect(token.getAttribute('data-badge')).toBe('poison');
    expect(token.querySelector('.badge-token-btn svg use')!.getAttribute('href')).toBe('#i-poison');
    expect(render(<BadgeToken badge={hidden} open={false} onToggle={noop} />).querySelector('.badge-token.badge-buff')).not.toBeNull();
    expect(render(<BadgeToken badge={coming} open={false} onToggle={noop} />).querySelector('.badge-token.badge-debuff')).not.toBeNull();
  });

  it('shows the count only when given', () => {
    const withCount = render(<BadgeToken badge={poison} open={false} onToggle={noop} />);
    expect(withCount.querySelector('.badge-count')!.textContent).toBe('3');
    const without = render(<BadgeToken badge={hidden} open={false} onToggle={noop} />);
    expect(without.querySelector('.badge-count')).toBeNull();
  });

  it('Taunt coming has the dashed class', () => {
    expect(render(<BadgeToken badge={coming} open={false} onToggle={noop} />).querySelector('.badge-token.badge-dashed')).not.toBeNull();
    expect(render(<BadgeToken badge={poison} open={false} onToggle={noop} />).querySelector('.badge-dashed')).toBeNull();
  });

  it('the button carries aria-label with short and full text', () => {
    const button = render(<BadgeToken badge={poison} open={false} onToggle={noop} />).querySelector('button.badge-token-btn')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Poison 3. Takes 3 damage at the end of its turn.');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('click calls onToggle', () => {
    const onToggle = vi.fn();
    const root = render(<BadgeToken badge={poison} open={false} onToggle={onToggle} />);
    click(root.querySelector('.badge-token-btn')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('the tip renders only when open', () => {
    expect(render(<BadgeToken badge={poison} open={false} onToggle={noop} />).querySelector('.badge-tip')).toBeNull();
    const root = render(<BadgeToken badge={poison} open onToggle={noop} />);
    const tip = root.querySelector('.badge-tip')!;
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.querySelector('strong.badge-tip-name')!.textContent).toBe('Poison');
    expect(tip.querySelector('.badge-tip-short')!.textContent).toBe('Poison 3');
    expect(tip.querySelector('.badge-tip-full')!.textContent).toBe('Takes 3 damage at the end of its turn.');
    expect(root.querySelector('.badge-token-btn')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('tells the hover handler about the mouse only', () => {
    const onHoverChange = vi.fn();
    const button = render(<BadgeToken badge={poison} open={false} onToggle={noop} onHoverChange={onHoverChange} />).querySelector('.badge-token-btn')!;
    const pointer = (type: string, pointerType: string) => {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      button.dispatchEvent(event);
    };
    // React listens to pointerover/pointerout to produce pointerenter/pointerleave
    pointer('pointerover', 'touch');
    pointer('pointerout', 'touch');
    expect(onHoverChange).not.toHaveBeenCalled();
    pointer('pointerover', 'mouse');
    expect(onHoverChange).toHaveBeenLastCalledWith(true);
    pointer('pointerout', 'mouse');
    expect(onHoverChange).toHaveBeenLastCalledWith(false);
  });
  // The old poison pill glowed when its number went up; the token does the same for any corner number
  describe('pulse when the number goes up', () => {
    const Counter = ({ start, sign = '' }: { start: number; sign?: string }) => {
      const [n, setN] = useState(start);
      return (
        <>
          <button data-step="up" onClick={() => setN(n + 1)} />
          <button data-step="down" onClick={() => setN(n - 1)} />
          <BadgeToken badge={{ ...poison, count: `${sign}${n}` }} open={false} onToggle={noop} />
        </>
      );
    };

    it('does not pulse on first render', () => {
      expect(render(<Counter start={3} />).querySelector('.badge-pulse')).toBeNull();
    });

    it('pulses when the number goes up, and stops when the animation ends', () => {
      const root = render(<Counter start={3} />);
      click(root.querySelector('[data-step="up"]'));
      expect(root.querySelector('.badge-count')!.textContent).toBe('4');
      const pulse = root.querySelector('.badge-token-btn .badge-pulse')!;
      expect(pulse.getAttribute('aria-hidden')).toBe('true');
      act(() => { pulse.dispatchEvent(new Event('animationend', { bubbles: true })); });
      expect(root.querySelector('.badge-pulse')).toBeNull();
      click(root.querySelector('[data-step="up"]'));
      expect(root.querySelector('.badge-pulse')).not.toBeNull();
    });

    it('does not pulse when the number goes down', () => {
      const root = render(<Counter start={3} />);
      click(root.querySelector('[data-step="down"]'));
      expect(root.querySelector('.badge-count')!.textContent).toBe('2');
      expect(root.querySelector('.badge-pulse')).toBeNull();
    });

    it('reads a signed number by its size ("+1" to "+2")', () => {
      const root = render(<Counter start={1} sign="+" />);
      click(root.querySelector('[data-step="up"]'));
      expect(root.querySelector('.badge-pulse')).not.toBeNull();
    });
  });
});

describe('BadgeSprite', () => {
  it('holds every drawing a badge can ask for', () => {
    const html = renderToStaticMarkup(<BadgeSprite />);
    const ids = ['i-ashield', 'i-blood', 'i-blows', 'i-bot', 'i-bribe', 'i-defdown', 'i-exposed', 'i-flame', 'i-golem', 'i-hidden', 'i-link',
      'i-mark', 'i-paw', 'i-poison', 'i-shoe', 'i-silence', 'i-stun', 'i-taunt', 'i-totem1', 'i-totem2', 'i-totem3', 'i-wind'];
    ids.forEach(id => expect(html).toContain(`<symbol id="${id}"`));
    expect(html).toContain('aria-hidden="true"');
  });
});
