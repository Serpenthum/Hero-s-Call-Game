// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeroCollection from '../HeroCollection';
import { LAND_MS, OPENING_MS } from '../BinderOpening';
import { FORGE_DONE_MS, FORGE_END_MS, FORGE_HIT_MS, FORGE_LAND_MS, FORGE_SHARDS } from './craftForge';
import { DEFAULT_VIEW } from './binderRules';
import type { BinderHero } from './binderRules';
import { buttonByText, cleanup, click, render, settle, stubBrowserApis } from '../../testing/dom';
import config from '../../config';

const API = config.API_BASE_URL;
// The opening's stylesheet, read as text (vitest hands CSS imports over empty)
const openingCss = readFileSync(resolve(__dirname, '../../styles/Binder.css'), 'utf8');

// H01..H30 are enabled (HP rises with the number), Golem is disabled.
const hero = (name: string, HP: number, disabled = false): BinderHero => ({
  name, HP, Defense: 7, Accuracy: '+1', BasicAttack: '1D6', Ability: [], Special: null, disabled,
});
const NAMES = Array.from({ length: 30 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`);
const HEROES = [...NAMES.map((n, i) => hero(n, i + 1)), hero('Golem', 40, true)];
const OWNED = NAMES.slice(0, 10);
const HOLO = ['H01', 'H02', 'H20']; // H20 is not owned, so it doesn't count
const FAVOURITES = ['H03', 'H25'];

const reply = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

// shards: the player's balance (140), or null for an old server that sends none.
// craft: answers the craft request instead of the server's success.
function stubFetch(opts: { failHeroes?: boolean; shards?: number | null; craft?: (heroName: string) => Promise<Response> } = {}) {
  let favourites = [...FAVOURITES];
  let owned = [...OWNED];
  let shards = opts.shards === undefined ? 140 : opts.shards;
  let failHeroes = !!opts.failHeroes;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith(`${API}/api/heroes`)) {
      if (failHeroes) { failHeroes = false; return reply({}, false); }
      return reply(HEROES);
    }
    if (url === `${API}/api/favorite-heroes/7`) return reply({ favoriteHeroes: favourites });
    if (url === `${API}/api/user/7`) {
      return reply({ success: true, user: { available_heroes: owned, holo_heroes: HOLO, ...(shards === null ? {} : { shards }) } });
    }
    if (url === `${API}/api/shop/craft` && init?.method === 'POST') {
      const { heroName } = JSON.parse(String(init.body)) as { heroName: string };
      if (opts.craft) return opts.craft(heroName);
      owned = [...owned, heroName];
      shards = (shards ?? 0) - 100;
      return reply({ success: true, heroName, hero: HEROES.find(h => h.name === heroName), shards, available_heroes: owned, heroCount: owned.length });
    }
    if (url === `${API}/api/toggle-favorite-hero` && init?.method === 'POST') {
      const { heroName } = JSON.parse(String(init.body)) as { heroName: string };
      favourites = favourites.includes(heroName) ? favourites.filter(n => n !== heroName) : [...favourites, heroName];
      return reply({ favoriteHeroes: favourites });
    }
    return Promise.reject(new Error(`unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openBinder(props: Partial<React.ComponentProps<typeof HeroCollection>> = {}) {
  const root = render(<HeroCollection onClose={() => {}} userId={7} {...props} />);
  await settle();
  return root;
}

const pocketNames = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.binder-pocket:not(.binder-pocket--empty)')).map(p => p.getAttribute('aria-label'));
const status = (root: ParentNode) => root.querySelector('.binder-status')?.textContent;
const panel = (root: ParentNode) => root.querySelector('.binder-panel') as HTMLElement | null;

function openPanel(root: ParentNode) {
  if (!panel(root)) click(root.querySelector('.binder-filter-btn'));
  return panel(root)!;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressEscape() {
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
}

// Taps an arrow and sees the turn through: the leaf is laid on still, moves two frames later, and lands when its
// front face's animation ends. No card is made or dropped while it moves.
async function turnPage(root: ParentNode, arrow: '.binder-arrow--next' | '.binder-arrow--prev') {
  click(root.querySelector(arrow));
  expect(root.querySelector('.binder-book')!.className).toMatch(/binder-book--leafed/);
  expect(root.querySelector('.binder-book')!.className).not.toMatch(/binder-book--turning/);
  expect(root.querySelectorAll('.binder-leaf--front, .binder-leaf--back')).toHaveLength(2);
  await act(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  expect(root.querySelector('.binder-book')!.className).toMatch(/binder-book--turning/);
  const cards = Array.from(root.querySelectorAll('.binder-card'));
  act(() => { root.querySelector('.binder-leaf--front')!.dispatchEvent(new Event('animationend', { bubbles: true })); });
  expect(root.querySelector('.binder-leaf, .binder-cast, .binder-shade')).toBeNull();
  expect(root.querySelector('.binder-book')!.className).toBe('binder-book');
  // The cards now showing are the very elements that were on the leaf's back and under its front
  Array.from(root.querySelectorAll('.binder-card')).forEach(card => expect(cards).toContain(card));
}

const pocket = (root: ParentNode, name: string) => root.querySelector(`.binder-pocket[aria-label="${name}"]`) as HTMLElement | null;

describe('the binder', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stubBrowserApis();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    // Only the data hook's failure log is expected; React warnings would show up here too.
    for (const [first] of consoleError.mock.calls) expect(String(first)).toMatch(/^Error fetching heroes/);
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens on All, sorted by name, with 12 pockets and the status line', async () => {
    stubFetch();
    const root = await openBinder();
    expect(root.querySelectorAll('.binder-pocket')).toHaveLength(12);
    expect(pocketNames(root)).toEqual(NAMES.slice(0, 12));
    expect(root.querySelectorAll('.binder-side--left .binder-pocket')).toHaveLength(6);
    expect(root.querySelectorAll('.binder-side--right .binder-pocket')).toHaveLength(6);
    expect(status(root)).toBe('Page 1 of 3 · 10 of 30 heroes · 2 holographic');
    expect(root.querySelector('.binder-filter-label')?.textContent).toBe('All · by name');
    expect(root.querySelector('.binder-filter-dot')).toBeNull();
    // Owned cards plain, unowned ones locked, favourites starred
    expect(pocket(root, 'H01')!.querySelector('.binder-card')!.className).not.toMatch(/binder-card--locked/);
    expect(pocket(root, 'H11')!.querySelector('.binder-card')!.className).toMatch(/binder-card--locked/);
    expect(pocket(root, 'H03')!.querySelector('.card-fav-star')).not.toBeNull();
    expect(pocket(root, 'H04')!.querySelector('.card-fav-star')).toBeNull();
    expect(root.querySelector('.coin, .victory-points')).toBeNull();
  });

  it('the filter panel changes the filter, sort and search, and resets to spread 0', async () => {
    stubFetch();
    const root = await openBinder();
    await turnPage(root, '.binder-arrow--next');
    expect(status(root)).toMatch(/^Page 2 of 3/);

    const btn = root.querySelector('.binder-filter-btn')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const p = openPanel(root);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    click(buttonByText(p, 'Owned'));
    expect(buttonByText(panel(root)!, 'Owned')!.getAttribute('aria-pressed')).toBe('true');
    expect(buttonByText(panel(root)!, 'All')!.getAttribute('aria-pressed')).toBe('false');
    expect(pocketNames(root)).toEqual(OWNED);
    expect(status(root)).toBe('Owned · Page 1 of 1 · 10 of 30 heroes · 2 holographic');
    expect(root.querySelector('.binder-filter-label')?.textContent).toBe('Owned · by name');
    expect(root.querySelector('.binder-filter-dot')).not.toBeNull();

    click(buttonByText(panel(root)!, 'HP'));
    expect(pocketNames(root)[0]).toBe('H10');
    expect(root.querySelector('.binder-filter-label')?.textContent).toBe('Owned · by HP');

    click(buttonByText(panel(root)!, 'All'));
    click(buttonByText(panel(root)!, 'Name'));
    await turnPage(root, '.binder-arrow--next');
    expect(status(root)).toMatch(/^Page 2 of 3/);
    type(panel(root)!.querySelector('input[type=search]') as HTMLInputElement, 'H2');
    expect(pocketNames(root)).toEqual(['H20', 'H21', 'H22', 'H23', 'H24', 'H25', 'H26', 'H27', 'H28', 'H29']);
    expect(status(root)).toMatch(/^Page 1 of 1/);

    pressEscape();
    expect(panel(root)).toBeNull();
  });

  it('signed out: no Favourites or Holographic filter and no favourite button', async () => {
    stubFetch();
    const root = await openBinder({ userId: undefined });
    const p = openPanel(root);
    expect(buttonByText(p, 'All')).toBeDefined();
    expect(buttonByText(p, 'Not owned')).toBeDefined();
    expect(buttonByText(p, 'Favourites')).toBeUndefined();
    expect(buttonByText(p, 'Holographic')).toBeUndefined();
    pressEscape();
    click(pocket(root, 'H01'));
    expect(root.querySelector('.binder-large')).not.toBeNull();
    expect(buttonByText(root, 'Add to favourites')).toBeUndefined();
    expect(buttonByText(root, 'Remove from favourites')).toBeUndefined();
  });

  it('the next arrow shows spread 2; prev from spread 1 wraps to the last', async () => {
    stubFetch();
    const root = await openBinder();
    await turnPage(root, '.binder-arrow--next');
    expect(status(root)).toMatch(/^Page 2 of 3/);
    expect(pocketNames(root)).toEqual(NAMES.slice(12, 24));
    await turnPage(root, '.binder-arrow--prev');
    expect(status(root)).toMatch(/^Page 1 of 3/);
    await turnPage(root, '.binder-arrow--prev');
    expect(status(root)).toMatch(/^Page 3 of 3/);
    expect(pocketNames(root)).toEqual(NAMES.slice(24));
    expect(root.querySelectorAll('.binder-pocket--empty')).toHaveLength(6);
  });

  it('shows No heroes match and hides the arrows', async () => {
    stubFetch();
    const root = await openBinder();
    type(openPanel(root).querySelector('input[type=search]') as HTMLInputElement, 'zzz');
    expect(root.querySelector('.binder-book')?.textContent).toContain('No heroes match');
    expect(pocketNames(root)).toEqual([]);
    expect(root.querySelector('.binder-arrow--prev')).toBeNull();
    expect(root.querySelector('.binder-arrow--next')).toBeNull();
  });

  it('tapping a pocket opens the large view; Escape closes it', async () => {
    stubFetch();
    const root = await openBinder();
    click(pocket(root, 'H11'));
    const large = root.querySelector('.binder-large')!;
    expect(large.getAttribute('role')).toBe('dialog');
    expect(large.getAttribute('aria-label')).toBe('H11');
    expect(large.querySelector('.hero-card')?.getAttribute('data-min-text-px')).toBe('12');
    // Any hero can be favourited, owned or not
    expect(buttonByText(large, 'Add to favourites')).toBeDefined();
    pressEscape();
    expect(root.querySelector('.binder-large')).toBeNull();
  });

  it('the large view stays on the hero after unfavouriting under the Favourites filter', async () => {
    stubFetch();
    const root = await openBinder();
    click(buttonByText(openPanel(root), 'Favourites'));
    pressEscape();
    expect(pocketNames(root)).toEqual(['H03', 'H25']);
    click(pocket(root, 'H03'));
    click(buttonByText(root.querySelector('.binder-large')!, 'Remove from favourites'));
    await settle();
    expect(pocketNames(root)).toEqual(['H25']);
    const large = root.querySelector('.binder-large')!;
    expect(large.getAttribute('aria-label')).toBe('H03');
    expect(buttonByText(large, 'Add to favourites')).toBeDefined();
  });

  it('opens on initialHero\'s spread and lights its pocket', async () => {
    stubFetch();
    const root = await openBinder({ initialHero: 'H20' });
    expect(status(root)).toBe('Page 2 of 3 · 10 of 30 heroes · 2 holographic');
    expect(pocket(root, 'H20')!.className).toMatch(/binder-pocket--spotlight/);
    expect(pocket(root, 'H19')!.className).not.toMatch(/binder-pocket--spotlight/);
  });

  it('the X is over the closed binder and closes the binder without opening it', async () => {
    stubFetch();
    const onClose = vi.fn();
    const root = await openBinder({ onClose });
    expect(root.querySelector('.binder-opening')).not.toBeNull();
    // binder--unopened lifts the X over the opening (Binder.css)
    expect(root.querySelector('.binder')!.className).toMatch(/binder--unopened/);
    click(root.querySelector('.binder-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect((root.querySelector('.binder-opening') as HTMLElement).dataset.stage).toBe('closed');
  });

  it('Escape closes the binder while it sits closed', async () => {
    stubFetch();
    const onClose = vi.fn();
    const root = await openBinder({ onClose });
    expect(root.querySelector('.binder-opening')).not.toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('once the binder is open, the X is no longer lifted and Escape does not close the binder', async () => {
    stubFetch();
    const onClose = vi.fn();
    vi.useFakeTimers();
    try {
      const root = await openBinder({ onClose });
      click(root.querySelector('.binder-opening'));
      act(() => { vi.advanceTimersByTime(OPENING_MS); });
      expect(root.querySelector('.binder')!.className).not.toMatch(/binder--unopened/);
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // jsdom does no hit-testing, so this checks the opening's own stylesheet: while it opens by itself, the overlay
  // keeps catching taps (a tap must not reach a hidden pocket or arrow under it), and a tap on it skips to the book.
  it('a tap during the opening is caught by the overlay and skips to the book', async () => {
    stubFetch();
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = openingCss;
    vi.useFakeTimers();
    try {
      const root = await openBinder();
      const opening = () => root.querySelector('.binder-opening') as HTMLElement;
      act(() => { vi.advanceTimersByTime(LAND_MS); });
      let elapsed = 0;
      for (const at of [1, OPENING_MS / 2, OPENING_MS - 1]) {
        act(() => { vi.advanceTimersByTime(at - elapsed); });
        elapsed = at;
        expect(opening().dataset.stage).toBe('opening');
        expect(getComputedStyle(opening()).pointerEvents).not.toBe('none');
      }
      click(opening());
      expect(root.querySelector('.binder-opening')).toBeNull();
      expect(root.querySelector('.binder-large')).toBeNull();
      expect(status(root)).toBe('Page 1 of 3 · 10 of 30 heroes · 2 holographic');
    } finally {
      vi.useRealTimers();
      style.remove();
    }
  });

  it('the lit pocket stays lit until the binder has opened by itself, then goes out', async () => {
    stubFetch();
    vi.useFakeTimers();
    try {
      const root = await openBinder({ initialHero: 'H20' });
      const lit = () => /binder-pocket--spotlight/.test(pocket(root, 'H20')!.className);
      act(() => { vi.advanceTimersByTime(LAND_MS); }); // the cover starts to open by itself
      expect(lit()).toBe(true);
      act(() => { vi.advanceTimersByTime(OPENING_MS - 1); });
      expect(root.querySelector('.binder-opening')).not.toBeNull();
      expect(lit()).toBe(true);
      act(() => { vi.advanceTimersByTime(1); });
      expect(root.querySelector('.binder-opening')).toBeNull();
      expect(lit()).toBe(true);
      act(() => { vi.advanceTimersByTime(1599); });
      expect(lit()).toBe(true);
      act(() => { vi.advanceTimersByTime(1); });
      expect(lit()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens on a disabled hero\'s spread', async () => {
    stubFetch();
    const root = await openBinder({ initialHero: 'Golem' });
    expect(root.querySelector('.binder-filter-label')?.textContent).toBe('Disabled · by name');
    expect(pocketNames(root)).toEqual(['Golem']);
    expect(pocket(root, 'Golem')!.querySelector('.binder-card')!.className).toMatch(/binder-card--disabled/);
    expect(pocket(root, 'Golem')!.className).toMatch(/binder-pocket--spotlight/);
  });

  it('a failed load shows Couldn\'t load the heroes. and Try again refetches', async () => {
    const fetchMock = stubFetch({ failHeroes: true });
    const root = await openBinder();
    expect(root.textContent).toContain("Couldn't load the heroes.");
    expect(root.querySelector('.binder-book')).toBeNull();
    const heroCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(`${API}/api/heroes`)).length;
    expect(heroCalls()).toBe(1);
    click(buttonByText(root, 'Try again'));
    await settle();
    expect(heroCalls()).toBe(2);
    expect(root.textContent).not.toContain("Couldn't load the heroes.");
    expect(pocketNames(root)).toEqual(NAMES.slice(0, 12));
  });

  describe('shards and crafting', () => {
    const balance = (root: ParentNode) => root.querySelector('.binder-shards');
    const said = (root: ParentNode) => balance(root)?.querySelector('[role=status]')?.textContent;
    const shown = (root: ParentNode) => Number(balance(root)?.querySelector('b')?.textContent);
    const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const animationsOff = () => localStorage.setItem('heroscall.animSpeed', 'off');
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });
    const large = (root: ParentNode) => root.querySelector('.binder-large') as HTMLElement | null;
    const craftButton = (root: ParentNode) => buttonByText(large(root)!, 'Craft');
    const craftCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
      fetchMock.mock.calls.filter(([url]) => url === `${API}/api/shop/craft`);
    // Opens H11 (not owned), taps Craft and, if asked, Yes, craft
    function startCraft(root: ParentNode, confirm = true) {
      click(pocket(root, 'H11'));
      click(craftButton(root));
      if (confirm) click(buttonByText(large(root)!, 'Yes, craft'));
    }

    it('the binder shows the shard balance', async () => {
      stubFetch();
      const root = await openBinder();
      // The crystal and the number show; a screen reader hears "140 shards", and again when it changes
      expect(balance(root)?.querySelector('svg.shard-icon')).not.toBeNull();
      expect(balance(root)?.querySelector('b')?.textContent).toBe('140');
      expect(balance(root)?.querySelector('b')?.getAttribute('aria-hidden')).toBe('true');
      expect(said(root)).toBe('140 shards');
    });

    it('signed out: no shard balance and no Craft button', async () => {
      stubFetch();
      const root = await openBinder({ userId: undefined });
      expect(balance(root)).toBeNull();
      click(pocket(root, 'H11'));
      expect(craftButton(root)).toBeUndefined();
    });

    it('no shards field shows 0', async () => {
      stubFetch({ shards: null });
      const root = await openBinder();
      expect(said(root)).toBe('0 shards');
    });

    it('a locked card\'s large view shows Craft with 100 shards', async () => {
      stubFetch();
      const root = await openBinder();
      click(pocket(root, 'H11'));
      const view = large(root)!;
      // The picture is grey with a padlock until the card is owned
      expect(view.querySelector('.binder-large-card')!.className).toMatch(/is-locked/);
      expect(view.querySelector('.binder-lock-tag')).not.toBeNull();
      expect(view.textContent).toContain('Not owned');
      const craft = craftButton(root)!;
      expect(craft.disabled).toBe(false);
      expect(craft.textContent).toBe('Craft100 shards');
      expect(craft.getAttribute('aria-label')).toBe('Craft H11 for 100 shards');
      expect(view.textContent).toContain('You have 140 shards. You will have 40 left.');
      expect(view.textContent).not.toMatch(/VP/);
    });

    it('an owned card\'s large view has no Craft button and no padlock', async () => {
      stubFetch();
      const root = await openBinder();
      click(pocket(root, 'H01'));
      expect(craftButton(root)).toBeUndefined();
      expect(large(root)!.querySelector('.binder-large-card')!.className).not.toMatch(/is-locked/);
      expect(large(root)!.querySelector('.binder-lock-tag')).toBeNull();
    });

    it('with 60 shards Craft is disabled and says 40 more are needed', async () => {
      const fetchMock = stubFetch({ shards: 60 });
      const root = await openBinder();
      click(pocket(root, 'H11'));
      const craft = craftButton(root)!;
      expect(craft.disabled).toBe(true);
      expect(large(root)!.textContent).toContain('40 more shards needed');
      expect(large(root)!.textContent).toContain('You have 60 of 100.');
      click(craft);
      expect(buttonByText(large(root)!, 'Yes, craft')).toBeUndefined();
      expect(craftCalls(fetchMock)).toHaveLength(0);
    });

    it('tapping Craft asks first; Cancel sends nothing and returns to the large view', async () => {
      const fetchMock = stubFetch();
      const root = await openBinder();
      startCraft(root, false);
      const view = large(root)!;
      expect(view.textContent).toContain('Craft H11 for 100 shards?');
      expect(view.textContent).toContain('You will have 40 shards left.');
      expect(craftButton(root)).toBeUndefined();
      click(buttonByText(view, 'Cancel'));
      expect(large(root)).not.toBeNull();
      expect(buttonByText(large(root)!, 'Yes, craft')).toBeUndefined();
      expect(craftButton(root)).toBeDefined();
      await settle();
      expect(craftCalls(fetchMock)).toHaveLength(0);
    });

    it('"Yes, craft" sends exactly one request, naming only the hero', async () => {
      const fetchMock = stubFetch();
      const root = await openBinder();
      startCraft(root);
      await settle();
      expect(craftCalls(fetchMock)).toHaveLength(1);
      expect(JSON.parse(String(craftCalls(fetchMock)[0][1]?.body))).toEqual({ heroName: 'H11' });
    });

    it('crafting plays the craft animation, then the card is owned', async () => {
      vi.useFakeTimers();
      stubFetch();
      const root = await openBinder();
      startCraft(root);
      await settle();
      // The server has said yes: the forge starts on the card, which is still grey in the large view and its pocket
      const view = large(root)!;
      expect(view.dataset.forge).toBe('shell');
      expect(view.querySelectorAll('.binder-forge-shell polygon')).toHaveLength(FORGE_SHARDS);
      expect(view.querySelector('.binder-large-card')!.className).toMatch(/is-locked/);
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--locked/);
      expect(status(root)).toBe('Page 1 of 3 · 10 of 30 heroes · 2 holographic');
      // A screen reader hears the new balance once; the number on show counts down as the shards leave
      expect(said(root)).toBe('40 shards');
      expect(shown(root)).toBe(140);
      advance(700);
      expect(shown(root)).toBeLessThan(140);
      expect(shown(root)).toBeGreaterThan(40);
      // Nothing closes it while it plays
      pressEscape();
      click(large(root));
      click(large(root)!.querySelector('.binder-large-close'));
      expect(large(root)).not.toBeNull();
      advance(FORGE_HIT_MS - 700 - 1);
      expect(shown(root)).toBe(40);
      expect(large(root)!.dataset.forge).toBe('shell');
      // The strike: the shell is off and the card is in colour
      advance(1);
      expect(large(root)!.dataset.forge).toBe('struck');
      expect(large(root)!.querySelector('.binder-large-card')!.className).not.toMatch(/is-locked/);
      advance(FORGE_DONE_MS - FORGE_HIT_MS);
      expect(large(root)!.dataset.forge).toBe('done');
      expect(large(root)!.querySelector('.binder-craft-done')?.textContent).toBe('Crafted!H11 joins your binder.');
      // Home: the card lands in its pocket, which lights for a moment
      advance(FORGE_LAND_MS - FORGE_DONE_MS - 1);
      expect(large(root)).not.toBeNull();
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--locked/);
      advance(1);
      expect(large(root)).toBeNull();
      expect(pocket(root, 'H11')!.className).not.toMatch(/binder-pocket--locked/);
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--spotlight/);
      expect(pocket(root, 'H11')!.dataset.forge).toBeUndefined();
      expect(status(root)).toBe('Page 1 of 3 · 11 of 30 heroes · 2 holographic');
      advance(FORGE_END_MS - FORGE_LAND_MS);
      expect(pocket(root, 'H11')!.className).not.toMatch(/binder-pocket--spotlight/);
      expect(root.querySelector('.binder-fx')?.childElementCount).toBe(0);
      expect(shown(root)).toBe(40);
      // About five seconds from the tap to the pocket, as approved
      expect(FORGE_LAND_MS).toBeGreaterThan(4500);
      expect(FORGE_LAND_MS).toBeLessThan(5500);
    });

    it('crafting under the Not owned filter keeps the pocket there for the card to land in', async () => {
      vi.useFakeTimers();
      stubFetch();
      const root = await openBinder({ initialView: { ...DEFAULT_VIEW, filter: 'not-owned' } });
      startCraft(root);
      await settle();
      advance(FORGE_LAND_MS);
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--spotlight/);
      advance(FORGE_END_MS - FORGE_LAND_MS);
      expect(pocket(root, 'H11')).toBeNull(); // owned now, so it leaves the Not owned list
    });

    it('animation off makes it owned at once', async () => {
      vi.useFakeTimers();
      animationsOff();
      stubFetch();
      const root = await openBinder();
      startCraft(root);
      await settle();
      expect(large(root)).toBeNull();
      expect(pocket(root, 'H11')!.className).toBe('binder-pocket');
      expect(shown(root)).toBe(40);
      expect(said(root)).toBe('40 shards');
      expect(status(root)).toBe('Page 1 of 3 · 11 of 30 heroes · 2 holographic');
      expect(root.querySelector('.binder-fx')?.childElementCount).toBe(0);
      expect(root.querySelector('[data-forge]')).toBeNull();
      advance(FORGE_END_MS);
      expect(pocket(root, 'H11')!.className).toBe('binder-pocket');
    });

    it('a failed craft plays no animation', async () => {
      vi.useFakeTimers();
      let answer: (r: Response) => void = () => {};
      stubFetch({ craft: () => new Promise<Response>(resolve => { answer = resolve; }) });
      const root = await openBinder();
      startCraft(root);
      await settle();
      // Waiting for the server: a quiet line, no forge, and the large view cannot be closed from under the answer
      expect(large(root)!.querySelector('.binder-craft-wait')?.textContent).toBe('Crafting\u2026');
      expect(root.querySelector('[data-forge]')).toBeNull();
      advance(3000);
      expect(root.querySelector('[data-forge]')).toBeNull();
      expect(shown(root)).toBe(140);
      pressEscape();
      click(large(root));
      click(large(root)!.querySelector('.binder-large-close'));
      expect(large(root)).not.toBeNull();

      await act(async () => {
        answer({ ok: false, status: 400, json: () => Promise.resolve({ success: false, message: 'Not enough shards.' }) } as Response);
      });
      await settle();
      expect(large(root)!.querySelector('[role=alert]')?.textContent).toBe('Not enough shards.');
      expect(large(root)!.querySelector('.binder-craft-wait')).toBeNull();
      advance(FORGE_END_MS);
      expect(root.querySelector('[data-forge]')).toBeNull();
      expect(root.querySelector('.binder-fx')?.childElementCount).toBe(0);
      expect(large(root)!.querySelector('.binder-large-card')!.className).toMatch(/is-locked/);
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--locked/);
      expect(shown(root)).toBe(140);
      expect(said(root)).toBe('140 shards');
      // Settled, so it closes again
      pressEscape();
      expect(large(root)).toBeNull();
    });

    it('a refusal shows the server\'s message', async () => {
      stubFetch({ craft: () => reply({ success: false, message: 'You already have this hero.' }, false, 400) });
      const root = await openBinder();
      startCraft(root);
      await settle();
      const view = large(root)!;
      expect(view.querySelector('[role=alert]')?.textContent).toBe('You already have this hero.');
      expect(buttonByText(view, 'Yes, craft')).toBeUndefined(); // back to the large view
      expect(pocket(root, 'H11')!.className).toMatch(/binder-pocket--locked/);
      expect(said(root)).toBe('140 shards');
    });

    it('a 404 shows "Crafting isn\'t available right now."', async () => {
      stubFetch({ craft: () => reply({}, false, 404) });
      const root = await openBinder();
      startCraft(root);
      await settle();
      expect(large(root)!.querySelector('[role=alert]')?.textContent).toBe("Crafting isn't available right now.");
    });

    it('a second tap while crafting sends nothing', async () => {
      animationsOff();
      let answer: (r: Response) => void = () => {};
      const fetchMock = stubFetch({ craft: () => new Promise<Response>(resolve => { answer = resolve; }) });
      const root = await openBinder();
      startCraft(root);
      await settle();
      const yes = buttonByText(large(root)!, 'Yes, craft')!;
      expect(yes.disabled).toBe(true);
      // A tap the disabled button would swallow, sent straight to its handler
      act(() => { yes.disabled = false; yes.click(); });
      await settle();
      expect(craftCalls(fetchMock)).toHaveLength(1);
      await act(async () => {
        answer({ ok: true, status: 200, json: () => Promise.resolve({ success: true, heroName: 'H11', shards: 40, available_heroes: [...OWNED, 'H11'] }) } as Response);
      });
      await settle();
      expect(pocket(root, 'H11')!.className).not.toMatch(/binder-pocket--locked/);
    });

    it('a craft tells the lobby, so its user is current when the binder closes', async () => {
      stubFetch();
      const onPurchaseComplete = vi.fn();
      const root = await openBinder({ onPurchaseComplete });
      startCraft(root);
      await settle();
      expect(onPurchaseComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('the filter fade', () => {
    let animate: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      animate = vi.fn();
      (Element.prototype as { animate?: unknown }).animate = animate; // jsdom has no Web Animations
    });
    afterEach(() => {
      delete (Element.prototype as { animate?: unknown }).animate;
      localStorage.clear();
    });
    const fadedPages = () => animate.mock.instances.map(el => (el as Element).className);

    it('fades both pages in over 140 ms on a filter or sort change, and not on a page turn or while typing in search', async () => {
      stubFetch();
      const root = await openBinder();
      click(root.querySelector('.binder-arrow--next'));
      expect(animate).not.toHaveBeenCalled(); // nothing fades when the binder opens or a page turns

      click(buttonByText(openPanel(root), 'Owned'));
      expect(fadedPages()).toEqual(['binder-page', 'binder-page']);
      expect(animate.mock.calls[0]).toEqual([[{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }]);

      click(buttonByText(panel(root)!, 'HP'));
      expect(animate).toHaveBeenCalledTimes(4);

      type(panel(root)!.querySelector('input[type=search]') as HTMLInputElement, 'H0');
      expect(pocketNames(root)).toHaveLength(9);
      expect(animate).toHaveBeenCalledTimes(4);
    });

    it('does not fade with battle animations off', async () => {
      localStorage.setItem('heroscall.animSpeed', 'off');
      stubFetch();
      const root = await openBinder();
      click(buttonByText(openPanel(root), 'Owned'));
      expect(pocketNames(root)).toEqual(OWNED);
      expect(animate).not.toHaveBeenCalled();
      expect(root.querySelector('.binder')!.className).toMatch(/binder--still/);
    });
  });
});
