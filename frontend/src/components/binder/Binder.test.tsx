// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeroCollection from '../HeroCollection';
import type { BinderHero } from './binderRules';
import { buttonByText, cleanup, click, render, settle, stubBrowserApis } from '../../testing/dom';
import config from '../../config';

const API = config.API_BASE_URL;

// H01..H30 are enabled (HP rises with the number), Golem is disabled.
const hero = (name: string, HP: number, disabled = false): BinderHero => ({
  name, HP, Defense: 7, Accuracy: '+1', BasicAttack: '1D6', Ability: [], Special: null, disabled,
});
const NAMES = Array.from({ length: 30 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`);
const HEROES = [...NAMES.map((n, i) => hero(n, i + 1)), hero('Golem', 40, true)];
const OWNED = NAMES.slice(0, 10);
const HOLO = ['H01', 'H02', 'H20']; // H20 is not owned, so it doesn't count
const FAVOURITES = ['H03', 'H25'];

const reply = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);

function stubFetch(opts: { failHeroes?: boolean } = {}) {
  let favourites = [...FAVOURITES];
  let failHeroes = !!opts.failHeroes;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith(`${API}/api/heroes`)) {
      if (failHeroes) { failHeroes = false; return reply({}, false); }
      return reply(HEROES);
    }
    if (url === `${API}/api/favorite-heroes/7`) return reply({ favoriteHeroes: favourites });
    if (url === `${API}/api/user/7`) return reply({ success: true, user: { available_heroes: OWNED, holo_heroes: HOLO } });
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
    click(root.querySelector('.binder-arrow--next'));
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
    click(root.querySelector('.binder-arrow--next'));
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
    click(root.querySelector('.binder-arrow--next'));
    expect(status(root)).toMatch(/^Page 2 of 3/);
    expect(pocketNames(root)).toEqual(NAMES.slice(12, 24));
    click(root.querySelector('.binder-arrow--prev'));
    expect(status(root)).toMatch(/^Page 1 of 3/);
    click(root.querySelector('.binder-arrow--prev'));
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
});
