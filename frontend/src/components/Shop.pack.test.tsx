// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import Shop from './Shop';
import type { Hero } from '../types';
import { buttonByText, cleanup, click, render, settle, stubBrowserApis } from '../testing/dom';

const hero = (name: string): Hero => ({ name, HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] });

const packReply = (names: string[], newVP: number) => ({
  success: true,
  cards: names.map(name => ({ name, kind: 'new', hero: hero(name) })),
  coinsSpent: 12,
  coinsBack: 0,
  newVP,
  holo_heroes: [],
  available_heroes: ['Fighter', ...names],
  heroCount: 1 + names.length,
  heroesReceived: names,
  message: 'ok',
});

const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

let packReplies: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(path));

function installFetch(rotation: Hero[] = [hero('Ninja')]) {
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/shop/rotation')) return reply({ success: true, heroes: rotation.map(h => ({ ...h, owned: false })) });
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

function ShopHarness(props: { start: number; owned?: string[]; onPurchaseComplete?: () => void }) {
  const [balance, setBalance] = useState(props.start);
  return (
    <Shop
      onClose={() => undefined}
      userId={7}
      victoryPoints={balance}
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
  click(buttonByText(document, 'Turn all over'));
}

const balanceShown = (root: ParentNode) => root.querySelector('.shop-header .vp-amount')?.textContent;
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

  it('a repeat of a hero the reply lists as holographic is drawn holographic', async () => {
    installFetch();
    packReplies.push({
      ...packReply(['Ninja', 'Pirate'], 18),
      cards: [
        { name: 'Ninja', kind: 'new', hero: hero('Ninja') },
        { name: 'Monk', kind: 'repeat', hero: hero('Monk') },
        { name: 'Pirate', kind: 'repeat', hero: hero('Pirate') },
      ],
      holo_heroes: ['Monk'],
    });
    const root = render(<ShopHarness start={30} owned={['Fighter', 'Monk', 'Pirate']} />);
    await settle();
    await openFirstPack(root);

    const face = (name: string) => document.querySelector(`.pack-opening [data-name="${name}"]`);
    expect(face('Monk')?.querySelector('.card-holo')).not.toBeNull();
    expect(face('Pirate')?.querySelector('.card-holo')).toBeNull();
    expect(face('Ninja')?.querySelector('.card-holo')).toBeNull();
  });

  it('buying a pack uses the cards from the reply without fetching /api/heroes', async () => {
    installFetch();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18));
    const root = render(<ShopHarness start={30} />);
    await settle();
    const heroFetchesBefore = calls('/api/heroes').length;

    click(buttonByText(root, 'Buy pack'));
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(calls('/api/heroes')).toHaveLength(heroFetchesBefore);
    expect(document.querySelector('.pack-opening')).not.toBeNull();
    expect(balanceShown(root)).toBe('18');
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Ninja', 'Monk', 'Pirate']);
  });

  it('a second click while buying sends no second request', async () => {
    installFetch();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), packReply(['Samurai', 'Monk', 'Pirate'], 6));
    const root = render(<ShopHarness start={30} />);
    await settle();

    const buy = buttonByText(root, 'Buy pack');
    click(buy);
    click(buy);
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(balanceShown(root)).toBe('18');
  });

  it('the buy button is enabled when every hero is owned', async () => {
    installFetch([]);
    const root = render(<ShopHarness start={12} owned={['Fighter', 'Ninja', 'Monk', 'Pirate']} />);
    await settle();

    expect(buttonByText(root, 'Buy pack')?.disabled).toBe(false);
    expect(root.textContent).toContain('3 random heroes, and a 1 in 5 chance of a bonus holographic card.');

    click(buttonByText(root, "See what's inside"));
    await settle();
    expect(root.textContent).toContain('You own every hero. Packs give repeats (+2 each) and a chance of a holographic card.');
    expect(root.querySelector('.pack-contents-subtitle .coin-icon')).not.toBeNull();
  });

  it('the contents modal lists the pack chances when heroes are left to find', async () => {
    installFetch();
    const root = render(<ShopHarness start={12} />);
    await settle();
    click(buttonByText(root, "See what's inside"));
    await settle();
    expect(root.textContent).toContain('3 heroes from this list, and a 1 in 5 chance of a bonus holographic card.');
  });

  it('buy another starts a new opening with the new cards and the new balance', async () => {
    installFetch();
    const onPurchaseComplete = vi.fn();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), packReply(['Samurai', 'Viking', 'Pirate'], 6));
    const root = render(<ShopHarness start={30} onPurchaseComplete={onPurchaseComplete} />);
    await settle();

    click(buttonByText(root, 'Buy pack'));
    await settle();
    click(document.querySelector('.pack-opening__pack'));
    click(buttonByText(document, 'Turn all over'));
    expect(onPurchaseComplete).not.toHaveBeenCalled();

    click(buttonByText(document, 'Buy another'));
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(2);
    expect((document.querySelector('.pack-opening') as HTMLElement).dataset.stage).toBe('pack');
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Samurai', 'Viking', 'Pirate']);
    expect(Array.from(document.querySelectorAll('.pack-opening [data-kind]')).every(c => (c as HTMLElement).dataset.turned === 'false')).toBe(true);
    expect(balanceShown(root)).toBe('6');
    expect(onPurchaseComplete).toHaveBeenCalledTimes(1);
    // 6 left: a third pack is out of reach
    expect(buttonByText(document, 'Buy another')?.disabled).toBe(true);

    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).toBeNull();
    expect(onPurchaseComplete).toHaveBeenCalledTimes(2);
  });

  it('two clicks in the same tick send one request', async () => {
    installFetch();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), packReply(['Samurai', 'Monk', 'Pirate'], 6));
    const root = render(<ShopHarness start={30} />);
    await settle();

    const buy = buttonByText(root, 'Buy pack') as HTMLButtonElement;
    act(() => {
      buy.click();
      buy.click();
    });
    await settle();

    expect(calls('/api/shop/purchase-pack')).toHaveLength(1);
    expect(balanceShown(root)).toBe('18');
  });

  it('Done is disabled while Buy another is out, and works once it is back', async () => {
    installFetch();
    const second = heldReply();
    const onPurchaseComplete = vi.fn();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), second.promise);
    const root = render(<ShopHarness start={30} onPurchaseComplete={onPurchaseComplete} />);
    await settle();
    await openFirstPack(root);

    click(buttonByText(document, 'Buy another'));
    await settle();
    expect(buttonByText(document, 'Done')?.disabled).toBe(true);
    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).not.toBeNull();

    second.resolve(packReply(['Samurai', 'Viking', 'Pirate'], 6));
    await settle();
    click(document.querySelector('.pack-opening__pack'));
    expect(packCardNames()).toEqual(['Samurai', 'Viking', 'Pirate']);
    expect(buttonByText(document, 'Done')?.disabled).toBe(false);
    click(buttonByText(document, 'Done'));
    expect(document.querySelector('.pack-opening')).toBeNull();
  });

  it('a Buy another the server refuses shows its message above the opening', async () => {
    installFetch();
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), { success: false, message: 'The shop is closed for now.' });
    const root = render(<ShopHarness start={30} />);
    await settle();
    await openFirstPack(root);

    click(buttonByText(document, 'Buy another'));
    await settle();

    const toast = document.querySelector('.shop-message--over-opening');
    expect(toast?.textContent).toBe('The shop is closed for now.');
    expect(root.querySelector('.shop-container')?.contains(toast)).toBe(false);
    expect(document.querySelector('.pack-opening')).not.toBeNull();
  });

  it('a Buy another that fails to send shows the connection message above the opening', async () => {
    installFetch();
    const second = heldReply();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    packReplies.push(packReply(['Ninja', 'Monk', 'Pirate'], 18), second.promise);
    const root = render(<ShopHarness start={30} />);
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
