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

let rotation: Hero[];
let heroReplies: unknown[];
let packReplies: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(path));

function installFetch() {
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/shop/rotation')) return reply({ success: true, heroes: rotation.map(h => ({ ...h, owned: false })) });
    if (url.includes('/api/shop/purchase-hero')) return reply(heroReplies.shift());
    if (url.includes('/api/shop/purchase-pack')) return reply(packReplies.shift());
    if (url.includes('/api/heroes')) return reply([hero('Ninja'), hero('Monk'), hero('Pirate')]);
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

function ShopHarness(props: { start: number; owned?: string[]; holoHeroes?: string[] }) {
  const [balance, setBalance] = useState(props.start);
  return (
    <Shop
      onClose={() => undefined}
      userId={7}
      victoryPoints={balance}
      availableHeroes={props.owned ?? ['Fighter']}
      holoHeroes={props.holoHeroes}
      onPurchaseComplete={() => undefined}
      onVictoryPointsChange={setBalance}
    />
  );
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const messageText = () => document.querySelector('.shop-message')?.textContent ?? null;

describe('Shop', () => {
  beforeEach(() => {
    stubBrowserApis();
    stubGridSize(2000, 1000);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 21, 10, 7, 30));
    localStorage.setItem('heroscall.animSpeed', 'off');
    rotation = [hero('Ninja'), hero('Pirate')];
    heroReplies = [];
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

  it('a greyed tag sends no request and shows the coins message', async () => {
    const root = render(<ShopHarness start={3} />);
    await settle();

    const tag = root.querySelector('.shop-price-tag') as HTMLButtonElement;
    expect(tag.classList.contains('is-poor')).toBe(true);
    expect(tag.getAttribute('aria-disabled')).toBe('true');
    expect(tag.disabled).toBe(false);
    click(tag);
    click(tag);
    await settle();

    expect(calls('/api/shop/purchase-hero')).toHaveLength(0);
    expect(messageText()).toBe("You don't have enough coins.");
    expect(root.querySelector('.shop-table .shop-message[role="alert"]')).not.toBeNull();
    advance(2000);
    expect(document.querySelector('.shop-message')).toBeNull();
  });

  it('the greyed pack button sends no request', async () => {
    const root = render(<ShopHarness start={8} />);
    await settle();

    const pack = root.querySelector('.shop-buy-pack') as HTMLButtonElement;
    expect(pack.classList.contains('is-poor')).toBe(true);
    expect(pack.getAttribute('aria-disabled')).toBe('true');
    expect(pack.disabled).toBe(false);
    click(pack);
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(0);
    expect(messageText()).toBe("You don't have enough coins.");
  });

  it('greys the pack tag after a hero purchase drops the balance below 12', async () => {
    heroReplies.push({ success: true, newVP: 8, heroCount: 2 });
    const root = render(<ShopHarness start={13} />);
    await settle();
    expect(root.querySelector('.shop-buy-pack.is-poor')).toBeNull();

    click(root.querySelector('.shop-price-tag'));
    await settle();

    expect(calls('/api/shop/purchase-hero')).toHaveLength(1);
    expect(root.querySelector('.shop-buy-pack.is-poor')).not.toBeNull();
    const tags = Array.from(root.querySelectorAll('.shop-price-tag'));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.some(tag => tag.classList.contains('is-poor'))).toBe(false);
    expect(root.querySelector('.shop-slot .shop-stamp')?.textContent).toBe('Purchased');
  });

  it('a server error shows the fallback text for 3 seconds', async () => {
    heroReplies.push({ success: false, message: 'boom' });
    const root = render(<ShopHarness start={20} />);
    await settle();

    click(root.querySelector('.shop-price-tag'));
    await settle();

    expect(messageText()).toBe('Purchase failed. Please try again.');
    advance(2900);
    expect(messageText()).toBe('Purchase failed. Please try again.');
    advance(100);
    expect(document.querySelector('.shop-message')).toBeNull();
  });

  it('a not-enough reply shows the coins message for 2 seconds', async () => {
    heroReplies.push({ success: false, message: 'Not enough to buy this.' });
    const root = render(<ShopHarness start={20} />);
    await settle();

    click(root.querySelector('.shop-price-tag'));
    await settle();

    expect(messageText()).toBe("You don't have enough coins.");
    advance(2000);
    expect(document.querySelector('.shop-message')).toBeNull();
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

  it('the inside window counts owned heroes and shows holo', async () => {
    const root = render(<ShopHarness start={20} owned={['Ninja']} holoHeroes={['Ninja']} />);
    await settle();
    click(buttonByText(root, "See what's inside"));
    await settle();

    expect(document.querySelector('.shop-inside .shop-meter')?.textContent).toContain('You own 1 of 2');
    const ninja = document.querySelector('.shop-inside .hero-card[data-name="Ninja"]') as HTMLElement;
    expect(ninja.dataset.holo).toBe('true');
    const slot = ninja.closest('.shop-slot') as HTMLElement;
    expect(slot.querySelector('.shop-owned-chip')?.textContent).toBe('Owned');
    expect(slot.querySelector('.shop-hero-purchased-overlay')).toBeNull();
    const pirate = document.querySelector('.shop-inside .hero-card[data-name="Pirate"]') as HTMLElement;
    expect(pirate.dataset.holo).toBe('false');
    expect(pirate.closest('.shop-slot')?.querySelector('.shop-owned-chip')).toBeNull();
  });

  it('the sale page clamps when the rotation shrinks', async () => {
    stubGridSize(230, 350); // one card per page
    rotation = [hero('Ninja'), hero('Pirate'), hero('Samurai')];
    const root = render(<ShopHarness start={20} />);
    await settle();
    expect(root.querySelectorAll('.shop-pager .shop-pip')).toHaveLength(3);

    click(root.querySelector('[aria-label="Next sale page"]'));
    expect(root.querySelector('.shop-sale-grid .hero-card')?.getAttribute('data-name')).toBe('Pirate');

    rotation = [hero('Viking')];
    advance(7.5 * 60 * 1000); // the 10:15 rotation
    await settle();

    const cards = root.querySelectorAll('.shop-sale-grid .hero-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-name')).toBe('Viking');
  });

  it('turns the cards when the page changes, not at first load', async () => {
    stubGridSize(230, 350);
    rotation = [hero('Ninja'), hero('Pirate')];
    const root = render(<ShopHarness start={20} />);
    await settle();
    expect(root.querySelector('.shop-sale-grid.shop-turn')).toBeNull();

    click(root.querySelector('[aria-label="Next sale page"]'));
    expect(root.querySelector('.shop-sale-grid.shop-turn')).not.toBeNull();
    advance(800);
    expect(root.querySelector('.shop-sale-grid.shop-turn')).toBeNull();
  });

  it('shows the all-owned state and keeps the pack for sale', async () => {
    rotation = [];
    packReplies.push({ success: false, message: 'Not enough to buy this.' });
    const root = render(<ShopHarness start={20} />);
    await settle();

    expect(root.querySelector('.shop-table')?.textContent).toContain('You own every hero');
    const pack = root.querySelector('.shop-buy-pack') as HTMLButtonElement;
    expect(pack.classList.contains('is-poor')).toBe(false);
    click(pack);
    await settle();
    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
  });

  it('the dial shows the time left', async () => {
    const root = render(<ShopHarness start={20} />);
    await settle();

    const dial = root.querySelector('.shop-showcase .shop-foot .shop-dial') as HTMLElement;
    expect(dial.style.getPropertyValue('--p')).toBe('0.5');
    expect(root.querySelector('.shop-when')?.textContent).toContain('7m 30s');
    advance(1000);
    expect(root.querySelector('.shop-when')?.textContent).toContain('7m 29s');
  });
});
