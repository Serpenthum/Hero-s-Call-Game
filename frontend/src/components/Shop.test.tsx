// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('./HeroCard', () => ({
  default: ({ hero, holo, minTextPx }: { hero: { name: string }; holo?: boolean; minTextPx?: number }) => (
    <div className="hero-card" data-name={hero.name} data-holo={String(!!holo)} data-min-text={minTextPx} />
  ),
}));

import Shop from './Shop';
import type { Hero } from '../types';
import { buttonByText, cleanup, click, render, settle, stubBrowserApis } from '../testing/dom';

const hero = (name: string): Hero => ({ name, HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] });

const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

// Every enabled hero, starters included: a pack draws from all of them
let enabled: Hero[];
let packReplies: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(path));

function installFetch() {
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/shop/purchase-pack')) return reply(packReplies.shift());
    if (url.includes('/api/heroes')) return reply(enabled);
    return reply({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

// The card grids measure their box; jsdom has no layout, so report this size for every grid.
function stubGridSize(width: number, height: number) {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  });
}

function ShopHarness(props: { start: number; owned?: string[]; holoHeroes?: string[]; shards?: number }) {
  const [balance, setBalance] = useState(props.start);
  return (
    <Shop
      onClose={() => undefined}
      userId={7}
      victoryPoints={balance}
      shards={props.shards}
      availableHeroes={props.owned ?? ['Monk']}
      holoHeroes={props.holoHeroes}
      onPurchaseComplete={() => undefined}
      onVictoryPointsChange={setBalance}
    />
  );
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const messageText = () => document.querySelector('.shop-message')?.textContent ?? null;
const packButton = (root: ParentNode) => root.querySelector('.shop-buy-pack') as HTMLButtonElement;
const shortLine = (root: ParentNode) => root.querySelector('.shop-short')?.textContent ?? null;

describe('Shop', () => {
  beforeEach(() => {
    stubBrowserApis();
    stubGridSize(2000, 1000);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.useFakeTimers();
    localStorage.setItem('heroscall.animSpeed', 'off');
    enabled = [hero('Ninja'), hero('Monk'), hero('Pirate')];
    packReplies = [];
    installFetch();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('the shop asks the server only for a pack', async () => {
    packReplies.push({ success: false, message: 'Not enough to buy this.' });
    const root = render(<ShopHarness start={45} />);
    await settle();
    click(packButton(root));
    await settle();

    const shopCalls = fetchMock.mock.calls.map(([url]) => String(url)).filter(url => url.includes('/api/shop/'));
    expect(shopCalls).toEqual(['/api/shop/purchase-pack']);
    expect(calls('/rotation')).toHaveLength(0);
  });

  it('no sale heroes, dial or pager render', async () => {
    const root = render(<ShopHarness start={45} />);
    await settle();

    expect(root.querySelector('.shop-price-tag, .shop-stamp, .shop-sale-grid, .shop-dial, .shop-when, .shop-pager, .shop-pips')).toBeNull();
    expect(root.textContent).not.toContain('Next sale');
    expect(root.textContent).not.toMatch(/\bVP\b/);
  });

  it('the pack button greys below 20 coins', async () => {
    const root = render(<ShopHarness start={12} />);
    await settle();

    const pack = packButton(root);
    expect(pack.textContent).toContain('Buy pack');
    expect(pack.textContent).toContain('20');
    expect(pack.classList.contains('is-poor')).toBe(true);
    expect(pack.getAttribute('aria-disabled')).toBe('true');
    expect(pack.disabled).toBe(false);
    expect(shortLine(root)).toBe('8 more coins needed');

    click(pack);
    click(pack);
    await settle();
    expect(calls('/api/shop/purchase-pack')).toHaveLength(0);
    expect(messageText()).toBe("You don't have enough coins.");
    expect(root.querySelector('.shop-table .shop-message[role="alert"]')).not.toBeNull();
    advance(2000);
    expect(document.querySelector('.shop-message')).toBeNull();
  });

  it('one coin short says coin, and 20 coins can buy', async () => {
    const short = render(<ShopHarness start={19} />);
    await settle();
    expect(shortLine(short)).toBe('1 more coin needed');
    cleanup();

    const enough = render(<ShopHarness start={20} />);
    await settle();
    expect(packButton(enough).classList.contains('is-poor')).toBe(false);
    expect(packButton(enough).getAttribute('aria-disabled')).toBeNull();
    expect(shortLine(enough)).toBeNull();
  });

  it('a server error shows the fallback text for 3 seconds', async () => {
    packReplies.push({ success: false, message: 'boom' });
    const root = render(<ShopHarness start={20} />);
    await settle();

    click(packButton(root));
    await settle();

    expect(messageText()).toBe('Purchase failed. Please try again.');
    advance(2900);
    expect(messageText()).toBe('Purchase failed. Please try again.');
    advance(100);
    expect(document.querySelector('.shop-message')).toBeNull();
  });

  it('a not-enough reply shows the coins message for 2 seconds', async () => {
    packReplies.push({ success: false, message: 'Not enough to buy this.' });
    const root = render(<ShopHarness start={20} />);
    await settle();

    click(packButton(root));
    await settle();

    expect(messageText()).toBe("You don't have enough coins.");
    advance(2000);
    expect(document.querySelector('.shop-message')).toBeNull();
  });

  it('the table shows what a pack can hold, with the hero and shard counts', async () => {
    const root = render(<ShopHarness start={45} owned={['Monk']} shards={60} />);
    await settle();

    const table = root.querySelector('.shop-table') as HTMLElement;
    expect(table.textContent).toContain('What a pack can hold');
    const slots = Array.from(table.querySelectorAll('.shop-hold'));
    expect(slots.map(s => s.querySelector('.shop-hold-cap b')?.textContent)).toEqual(['A new hero', 'A holographic', 'One you own']);
    expect(slots[0].textContent).toContain('Any of the 3');
    expect(slots[1].textContent).toContain('1 pack in 10');
    expect(slots[2].textContent).toContain('10 shards instead');
    // The new hero is one the player lacks, the repeat one they own, and only the middle card is holographic
    const names = slots.map(s => s.querySelector('.hero-card')?.getAttribute('data-name'));
    expect(names[0]).not.toBe('Monk');
    expect(names[2]).toBe('Monk');
    expect(new Set(names).size).toBe(3);
    expect(slots.map(s => s.querySelector('.hero-card')?.getAttribute('data-holo'))).toEqual(['false', 'true', 'false']);

    expect(table.querySelector('.shop-meter--heroes .shop-meter-label')?.textContent).toBe('Heroes 1 of 3');
    expect(table.querySelector('.shop-meter--shards .shop-meter-label')?.textContent).toBe('Shards 60 of 100 to craft');
  });

  it('a missing shard balance reads as 0, and 100 or more is enough to craft', async () => {
    const none = render(<ShopHarness start={45} />);
    await settle();
    expect(none.querySelector('.shop-meter--shards .shop-meter-label')?.textContent).toBe('Shards 0 of 100 to craft');
    cleanup();

    const plenty = render(<ShopHarness start={45} shards={130} />);
    await settle();
    expect(plenty.querySelector('.shop-meter--shards .shop-meter-label')?.textContent).toBe('Shards 130, enough to craft');
  });

  it('card text has a 12px floor', async () => {
    const root = render(<ShopHarness start={20} />);
    await settle();
    click(buttonByText(root, "See what's inside"));
    await settle();

    const cards = Array.from(document.querySelectorAll('.shop-table .hero-card, .shop-inside .hero-card'));
    expect(document.querySelectorAll('.shop-table .hero-card').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.shop-inside .hero-card').length).toBeGreaterThan(0);
    expect(cards.every(card => card.getAttribute('data-min-text') === '12')).toBe(true);
  });

  it("what's inside lists every enabled hero, marks the owned ones and says what a pack gives", async () => {
    const root = render(<ShopHarness start={20} owned={['Ninja', 'Monk']} holoHeroes={['Ninja']} />);
    await settle();
    click(buttonByText(root, "See what's inside"));
    await settle();

    const inside = document.querySelector('.shop-inside') as HTMLElement;
    expect(inside.querySelector('.shop-inside-title')?.textContent).toBe("What's inside");
    expect(Array.from(inside.querySelectorAll('.hero-card')).map(c => c.getAttribute('data-name'))).toEqual(['Ninja', 'Monk', 'Pirate']);
    const facts = inside.querySelector('.shop-inside-facts')?.textContent ?? '';
    expect(facts).toContain('Every pack holds one random hero. All 3 are just as likely.');
    expect(facts).toContain('A hero you already have gives 10 shards.');
    expect(facts).toContain('1 pack in 10 is holographic.');
    expect(inside.querySelector('.shop-meter')?.textContent).toContain('You own 2 of 3');

    const slotOf = (name: string) => (inside.querySelector(`.hero-card[data-name="${name}"]`) as HTMLElement).closest('.shop-slot') as HTMLElement;
    expect(slotOf('Ninja').querySelector('.shop-owned-chip')?.textContent).toBe('Owned');
    expect(slotOf('Monk').querySelector('.shop-owned-chip')?.textContent).toBe('Owned');
    expect(slotOf('Pirate').querySelector('.shop-owned-chip')).toBeNull();
    expect(slotOf('Ninja').querySelector('.hero-card')?.getAttribute('data-holo')).toBe('true');
    expect(slotOf('Pirate').querySelector('.hero-card')?.getAttribute('data-holo')).toBe('false');
    expect(inside.textContent).not.toMatch(/\bVP\b/);
  });

  it("after a holographic pull, what's inside marks that hero holographic without a lobby refresh", async () => {
    packReplies.push({
      success: true,
      card: { name: 'Pirate', kind: 'holo', holo: true },
      cards: [{ name: 'Pirate', kind: 'holo', holo: true, hero: hero('Pirate') }],
      coinsSpent: 20, coinsBack: 0, shardsGained: 0, shards: 0, newVP: 25,
      holo_heroes: ['Pirate'], available_heroes: ['Monk', 'Pirate'], heroCount: 2, heroesReceived: ['Pirate'],
    });
    // The lobby's lists stay as they were: onPurchaseComplete does nothing here
    const root = render(<ShopHarness start={45} owned={['Monk']} holoHeroes={[]} />);
    await settle();
    click(packButton(root));
    await settle();
    click(document.querySelector('.pack-opening__pack'));
    click(document.querySelector('.pack-opening__card'));
    click(document.querySelector('.pack-opening__done'));
    click(buttonByText(root, "See what's inside"));
    await settle();

    const inside = document.querySelector('.shop-inside') as HTMLElement;
    const card = (name: string) => inside.querySelector(`.hero-card[data-name="${name}"]`) as HTMLElement;
    expect(card('Pirate').getAttribute('data-holo')).toBe('true');
    expect(card('Pirate').closest('.shop-slot')?.querySelector('.shop-owned-chip')?.textContent).toBe('Owned');
    expect(card('Ninja').getAttribute('data-holo')).toBe('false');
  });

  it("what's inside pages with a page count", async () => {
    stubGridSize(230, 350); // one card a page
    const root = render(<ShopHarness start={20} />);
    await settle();
    click(buttonByText(root, "See what's inside"));
    await settle();

    const page = () => document.querySelector('.shop-inside-page')?.textContent;
    const shown = () => Array.from(document.querySelectorAll('.shop-inside .hero-card')).map(c => c.getAttribute('data-name'));
    expect(page()).toBe('Page 1 of 3');
    expect(shown()).toEqual(['Ninja']);

    click(document.querySelector('.shop-inside [aria-label="Next page"]'));
    expect(page()).toBe('Page 2 of 3');
    expect(shown()).toEqual(['Monk']);
    click(document.querySelector('.shop-inside [aria-label="Previous page"]'));
    expect(page()).toBe('Page 1 of 3');

    click(document.querySelector('.shop-inside .shop-close'));
    expect(document.querySelector('.shop-inside')).toBeNull();
  });
});
