// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import Shop from './Shop';
import type { Hero } from '../types';
import { buttonByText, cleanup, click, render, settle, stubBrowserApis } from '../testing/dom';

const hero = (name: string): Hero => ({ name, HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] });

// Today's server: one card, and the shards it paid
const packReply = (name: string, newVP: number, extra: Record<string, unknown> = {}) => ({
  success: true,
  card: { name, kind: 'new', holo: false },
  cards: [{ name, kind: 'new', holo: false, hero: hero(name) }],
  coinsSpent: 20,
  coinsBack: 0,
  shardsGained: 0,
  shards: 0,
  newVP,
  holo_heroes: [],
  available_heroes: ['Fighter', name],
  heroCount: 2,
  heroesReceived: [name],
  ...extra,
});

const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

let packReplies: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(path));

function installFetch() {
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/shop/purchase-pack')) {
      const next = packReplies.shift();
      return next instanceof Promise ? next : reply(next);
    }
    if (url.includes('/api/heroes')) return reply([hero('Ninja'), hero('Monk'), hero('Pirate')]);
    if (url.includes('/api/user/')) return reply({ success: true, user: { available_heroes: ['Fighter'] } });
    return reply({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

function ShopHarness(props: { start: number; owned?: string[]; shards?: number; onPurchaseComplete?: () => void }) {
  const [balance, setBalance] = useState(props.start);
  return (
    <Shop
      onClose={() => undefined}
      userId={7}
      victoryPoints={balance}
      shards={props.shards}
      availableHeroes={props.owned ?? ['Fighter']}
      onPurchaseComplete={props.onPurchaseComplete ?? (() => undefined)}
      onVictoryPointsChange={setBalance}
    />
  );
}

// A pack reply held back until the test lets it go (resolve), or fails it (fail).
function heldReply() {
  let resolve!: (body: unknown) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<Response>((ok, no) => {
    resolve = body => ok({ ok: true, json: () => Promise.resolve(body) } as Response);
    fail = no;
  });
  return { promise, resolve, fail };
}

async function openFirstPack(root: HTMLElement) {
  click(buttonByText(root, 'Buy pack'));
  await settle();
  click(document.querySelector('.pack-opening__pack'));
  click(document.querySelector('.pack-opening__card'));
}

const balanceShown = (root: ParentNode) => root.querySelector('.shop-showcase .vp-amount')?.textContent;
const packCardNames = () => Array.from(document.querySelectorAll('.pack-opening [data-kind]')).map(c => (c as HTMLElement).dataset.name);

describe('Shop packs', () => {
  beforeEach(() => {
    stubBrowserApis();
    localStorage.setItem('heroscall.animSpeed', 'off');
    packReplies = [];
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('buying a pack opens the card from the reply without fetching /api/heroes again', async () => {
    installFetch();
    packReplies.push(packReply('Ninja', 25));
    const root = render(<ShopHarness start={45} />);
    await settle();
    const heroFetchesBefore = calls('/api/heroes').length;

    click(buttonByText(root, 'Buy pack'));
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(calls('/api/heroes')).toHaveLength(heroFetchesBefore);
    expect(document.querySelector('.pack-opening')).not.toBeNull();
    expect(balanceShown(root)).toBe('25');
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Ninja']);
  });

  it('a repeat shows the shards it paid and the new balance, and the shop meter follows', async () => {
    installFetch();
    packReplies.push({ ...packReply('Monk', 25), cards: [{ name: 'Monk', kind: 'repeat', hero: hero('Monk') }], shardsGained: 10, shards: 70 });
    const root = render(<ShopHarness start={45} owned={['Fighter', 'Monk']} shards={60} />);
    await settle();
    await openFirstPack(root);

    expect(document.querySelector('.pack-opening__shards')?.textContent).toBe('+10 shards');
    expect(document.querySelector('.pack-opening')?.textContent).toContain('You now have 70 shards.');
    expect(root.querySelector('.shop-meter--shards .shop-meter-label')?.textContent).toBe('Shards 70 of 100 to craft');
  });

  it('a pack reply without shardsGained still opens', async () => {
    installFetch();
    // An older server: three cards, no shard fields
    packReplies.push({
      success: true,
      cards: [
        { name: 'Ninja', kind: 'new', hero: hero('Ninja') },
        { name: 'Monk', kind: 'repeat', hero: hero('Monk') },
        { name: 'Pirate', kind: 'new', hero: hero('Pirate') },
      ],
      coinsBack: 2,
      newVP: 27,
      holo_heroes: [],
      available_heroes: ['Fighter', 'Monk', 'Ninja', 'Pirate'],
    });
    const root = render(<ShopHarness start={45} owned={['Fighter', 'Monk']} shards={60} />);
    await settle();

    click(buttonByText(root, 'Buy pack'));
    await settle();
    expect(document.querySelector('.pack-opening')).not.toBeNull();
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Ninja', 'Monk', 'Pirate']);
    expect(document.querySelector('.pack-opening__shards')).toBeNull();
    expect(balanceShown(root)).toBe('27');
    expect(root.querySelector('.shop-meter--shards .shop-meter-label')?.textContent).toBe('Shards 60 of 100 to craft');
  });

  // A repeat paid in shards, of Monk, whose holographic the player owns; `card` is what the server sent
  const monkRepeat = (card: Record<string, unknown>) =>
    ({ ...packReply('Monk', 25), cards: [{ name: 'Monk', kind: 'repeat', hero: hero('Monk'), ...card }], holo_heroes: ['Monk'], shardsGained: 10, shards: 70 });
  const monkFace = () => document.querySelector('.pack-opening [data-name="Monk"]');
  const resultKind = () => document.querySelector('.pack-opening__kind')?.textContent;

  it('a plain repeat of a hero owned as a holographic is drawn plain and says "Already owned"', async () => {
    installFetch();
    packReplies.push(monkRepeat({ holo: false }));
    const root = render(<ShopHarness start={45} owned={['Fighter', 'Monk']} shards={60} />);
    await settle();
    await openFirstPack(root);

    expect(monkFace()).not.toBeNull();
    expect(document.querySelector('.pack-opening .card-holo')).toBeNull();
    expect(resultKind()).toBe('Already owned');
    expect(document.querySelector('.pack-opening__shards')?.textContent).toBe('+10 shards');
  });

  it('a holographic repeat says "Already owned as a holographic"', async () => {
    installFetch();
    packReplies.push(monkRepeat({ holo: true }));
    const root = render(<ShopHarness start={45} owned={['Fighter', 'Monk']} shards={60} />);
    await settle();
    await openFirstPack(root);

    expect(monkFace()?.querySelector('.card-holo')).not.toBeNull();
    expect(resultKind()).toBe('Already owned as a holographic');
    expect(document.querySelector('.pack-opening__shards')?.textContent).toBe('+10 shards');
  });

  it('a reply without a holo flag falls back to the old rule', async () => {
    installFetch();
    // An older server sends no flag: a repeat of a hero the reply lists as holographic is drawn holographic
    packReplies.push(monkRepeat({}));
    const root = render(<ShopHarness start={45} owned={['Fighter', 'Monk']} />);
    await settle();
    await openFirstPack(root);

    expect(monkFace()?.querySelector('.card-holo')).not.toBeNull();
  });

  it('a second click while buying sends no second request', async () => {
    installFetch();
    packReplies.push(packReply('Ninja', 25), packReply('Pirate', 5));
    const root = render(<ShopHarness start={45} />);
    await settle();

    const buy = buttonByText(root, 'Buy pack');
    click(buy);
    click(buy);
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(balanceShown(root)).toBe('25');
  });

  it('two clicks in the same tick send one request', async () => {
    installFetch();
    packReplies.push(packReply('Ninja', 25), packReply('Pirate', 5));
    const root = render(<ShopHarness start={45} />);
    await settle();

    const buy = buttonByText(root, 'Buy pack') as HTMLButtonElement;
    act(() => {
      buy.click();
      buy.click();
    });
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(balanceShown(root)).toBe('25');
  });

  it('the buy button is enabled when every hero is owned', async () => {
    installFetch();
    const root = render(<ShopHarness start={20} owned={['Fighter', 'Ninja', 'Monk', 'Pirate']} />);
    await settle();

    expect(buttonByText(root, 'Buy pack')?.disabled).toBe(false);
    expect(root.querySelector('.shop-buy-pack.is-poor')).toBeNull();
    expect(root.querySelector('.shop-showcase')?.textContent).toContain('One random hero. 1 pack in 10 is holographic.');
  });

  it('buy another starts a new opening with the new card and the new balance', async () => {
    installFetch();
    const onPurchaseComplete = vi.fn();
    packReplies.push(packReply('Ninja', 25), packReply('Pirate', 5));
    const root = render(<ShopHarness start={45} onPurchaseComplete={onPurchaseComplete} />);
    await settle();
    await openFirstPack(root);
    expect(onPurchaseComplete).not.toHaveBeenCalled();

    click(buttonByText(document, 'Buy another'));
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(2);
    expect((document.querySelector('.pack-opening') as HTMLElement).dataset.stage).toBe('pack');
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Pirate']);
    // Animations are off here, so the card is face up as soon as the pack is open
    expect((document.querySelector('.pack-opening [data-kind]') as HTMLElement).dataset.turned).toBe('true');
    expect(balanceShown(root)).toBe('5');
    expect(onPurchaseComplete).toHaveBeenCalledTimes(1);
    // 5 left: a third pack is out of reach
    expect(buttonByText(document, 'Buy another')?.disabled).toBe(true);

    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).toBeNull();
    expect(onPurchaseComplete).toHaveBeenCalledTimes(2);
  });

  it('Done is disabled while Buy another is out, and works once it is back', async () => {
    installFetch();
    const second = heldReply();
    packReplies.push(packReply('Ninja', 45), second.promise);
    const root = render(<ShopHarness start={65} />);
    await settle();
    await openFirstPack(root);

    click(buttonByText(document, 'Buy another'));
    await settle();
    expect(buttonByText(document, 'Done')?.disabled).toBe(true);
    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).not.toBeNull();

    second.resolve(packReply('Pirate', 25));
    await settle();
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Pirate']);
    expect(buttonByText(document, 'Done')?.disabled).toBe(false);
    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).toBeNull();
  });

  it('a Buy another the server refuses shows its message above the opening', async () => {
    installFetch();
    packReplies.push(packReply('Ninja', 45), { success: false, message: 'The shop is closed for now.' });
    const root = render(<ShopHarness start={65} />);
    await settle();
    await openFirstPack(root);

    click(buttonByText(document, 'Buy another'));
    await settle();

    const toast = document.querySelector('.shop-message--over-opening');
    expect(toast?.textContent).toBe('Purchase failed. Please try again.');
    expect(root.querySelector('.shop-container')?.contains(toast)).toBe(false);
    expect(document.querySelector('.pack-opening')).not.toBeNull();
  });

  it('a Buy another that fails to send shows the connection message above the opening', async () => {
    installFetch();
    const second = heldReply();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    packReplies.push(packReply('Ninja', 45), second.promise);
    const root = render(<ShopHarness start={65} />);
    await settle();
    await openFirstPack(root);

    click(buttonByText(document, 'Buy another'));
    second.fail(new Error('offline'));
    await settle();

    const toast = document.querySelector('.shop-message--over-opening');
    expect(toast?.textContent).toBe('Pack purchase failed. Check your connection and try again.');
    expect(root.querySelector('.shop-container')?.contains(toast)).toBe(false);
    expect(buttonByText(document, 'Done')?.disabled).toBe(false);
  });
});
