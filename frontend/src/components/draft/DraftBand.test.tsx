import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));

import DraftBand, { DraftBandProps } from './DraftBand';
import DraftPortrait from './DraftPortrait';
import { visibleBans } from '../../draft/draftRules';
import type { Hero } from '../../types';

const hero = (name: string, extra: Partial<Hero> = {}): Hero => ({
  name,
  HP: 18,
  Defense: 8,
  Accuracy: '+2',
  BasicAttack: '1D6',
  Ability: [{ name: `${name} move`, description: `${name} rules`, effects: [] } as any],
  Special: [],
  ...extra,
});

const HEROES: Record<string, Hero> = {
  Monk: hero('Monk'),
  Wizard: hero('Wizard'),
  Bard: hero('Bard'),
  Druid: hero('Druid'),
};

const render = (props: Partial<DraftBandProps> = {}) =>
  renderToStaticMarkup(
    <DraftBand
      layout="table"
      me={{ name: 'Ada', team: [], status: 'choosing' }}
      them={{ name: 'Bo', team: [], status: 'choosing' }}
      bans={{ mine: null, theirs: null }}
      banHolo={{ mine: false, theirs: false }}
      onRead={() => {}}
      heroByName={name => HEROES[name]}
      {...props}
    />,
  );

// The markup of your side of the band, up to the centre column.
const mySide = (html: string) => {
  const start = html.indexOf('draft-slots--me');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('draft-band-centre', start));
};

describe('DraftBand', () => {
  it('shows your ban and never the opponent ban before you have banned', () => {
    const mineOnly = render({ bans: { mine: 'Monk', theirs: null } });
    expect(mineOnly).toContain('Monk');
    expect(mineOnly).toContain('draft-ban--set');

    // The opponent banned Wizard but you have not banned yet: nothing of Wizard reaches the page.
    const theirsHidden = render({ bans: visibleBans(null, 'Wizard') });
    expect(theirsHidden).not.toContain('Wizard');
    expect(theirsHidden).not.toContain('draft-ban--set');
  });

  it('shows both bans once both are in', () => {
    const html = render({ bans: visibleBans('Monk', 'Wizard') });
    expect(html).toContain('Monk');
    expect(html).toContain('Wizard');
  });

  it('says Choosing while a player has not acted and Done once they have', () => {
    const html = render({ me: { name: 'Ada', team: [], status: 'choosing' }, them: { name: 'Bo', team: [], status: 'done' } });
    expect(html).toContain('Choosing');
    expect(html).toContain('Done ✓');
    expect(html).toContain('draft-status');
  });

  it('draws a holographic team hero with the rainbow rim in the big-card layout', () => {
    const html = render({ layout: 'focus', me: { name: 'Ada', team: [hero('Bard', { holo: true })], status: 'done' } });
    expect(html).toContain('draft-portrait--holo');
  });

  it('draws a holographic ban with the rainbow rim', () => {
    const html = render({ bans: { mine: 'Monk', theirs: null }, banHolo: { mine: true, theirs: false } });
    expect(html).toContain('draft-portrait--holo');
  });

  it('drops the rainbow rim from team and ban portraits when holo effects are off', () => {
    const items = new Map<string, string>([['heroscall.holo', 'off']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); } });
    try {
      const team = render({ layout: 'focus', me: { name: 'Ada', team: [hero('Bard', { holo: true })], status: 'done' } });
      expect(team).not.toContain('draft-portrait--holo');
      const known = render({ bans: { mine: 'Monk', theirs: null }, banHolo: { mine: true, theirs: false } });
      expect(known).not.toContain('draft-portrait--holo');
      const unknown = render({ bans: { mine: 'Nobody', theirs: null }, banHolo: { mine: true, theirs: false } });
      expect(unknown).toContain('draft-portrait');
      expect(unknown).not.toContain('draft-portrait--holo');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fills one slot for a team of one and leaves slots 2 and 3 empty', () => {
    const html = render({ me: { name: 'Ada', team: [HEROES.Monk], status: 'done' } });
    const side = mySide(html);
    expect(side.match(/draft-slot--filled/g)?.length).toBe(1);
    expect(side.match(/draft-slot--empty/g)?.length).toBe(2);
    expect(side).toContain('>2<');
    expect(side).toContain('>3<');
    expect(side).toContain('Monk');
  });

  it('team slot cards are tiny and get no text floor', () => {
    const html = render({ me: { name: 'Ada', team: [HEROES.Monk], status: 'done' } });
    expect(html).not.toContain('data-min-text-px');
  });

  it('marks your slots and the mirrored opponent slots', () => {
    const html = render();
    expect(html).toContain('draft-slots--me');
    expect(html).toContain('draft-slots--them');
  });

  it('shows player names in the table layout and hides them in the big-card layout', () => {
    expect(render({ layout: 'table' })).toContain('Ada');
    expect(render({ layout: 'focus' })).not.toContain('Ada');
  });

  it('draws team cards as cards in the table layout and as portraits in the big-card layout', () => {
    const me = { name: 'Ada', team: [HEROES.Monk], status: 'done' as const };
    expect(render({ layout: 'table', me })).toContain('hero-layout-card');
    const focus = render({ layout: 'focus', me });
    expect(focus).not.toContain('hero-layout-card');
    expect(focus).toContain('draft-portrait');
  });

  it('gives opponent portraits the enemy rim', () => {
    const html = render({ layout: 'focus', them: { name: 'Bo', team: [HEROES.Druid], status: 'done' } });
    expect(html).toContain('draft-portrait--enemy');
  });
});

describe('DraftPortrait', () => {
  afterEach(() => { vi.useRealTimers(); });

  // Renders the portrait once and hands back the props on its button, so its handlers can be driven directly.
  const portraitProps = (onRead: (h: Hero) => void) => {
    let props: Record<string, any> = {};
    const Probe = () => {
      const el = DraftPortrait({ hero: HEROES.Monk, onRead }) as React.ReactElement;
      props = el.props;
      return el;
    };
    renderToStaticMarkup(<Probe />);
    return props;
  };
  const click = () => ({ stopPropagation: vi.fn(), preventDefault: vi.fn() });

  it('a tap shows the card (onRead) and is not swallowed', () => {
    vi.useFakeTimers();
    const onRead = vi.fn();
    const p = portraitProps(onRead);
    p.onPointerDown({ button: 0, clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(100);
    p.onPointerUp({});
    const e = click();
    p.onClickCapture(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
    p.onClick(e);
    expect(onRead).toHaveBeenCalledWith(HEROES.Monk);
  });

  it('a hold opens the reader only: the click that ends it stops in the capture phase, before onClick', () => {
    vi.useFakeTimers();
    const p = portraitProps(vi.fn());
    p.onPointerDown({ button: 0, clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(500);
    p.onPointerUp({});
    const e = click();
    p.onClickCapture(e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('a right-click opens the reader and swallows a following click', () => {
    const p = portraitProps(vi.fn());
    const menu = { preventDefault: vi.fn() };
    p.onContextMenu(menu);
    expect(menu.preventDefault).toHaveBeenCalled();
    const e = click();
    p.onClickCapture(e);
    expect(e.stopPropagation).toHaveBeenCalled();
  });
});
