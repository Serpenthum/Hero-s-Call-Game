// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBinderData, { type BinderData } from './useBinderData';
import type { BinderHero } from './binderRules';
import { cleanup, render, settle } from '../../testing/dom';
import { setAuthToken } from '../../authSession';
import config from '../../config';

const API = config.API_BASE_URL;

const hero = (name: string): BinderHero => ({
  name, HP: 20, Defense: 7, Accuracy: '+1', BasicAttack: '1D6', Ability: [], Special: null,
});
const HEROES = [hero('Monk'), hero('Ninja'), hero('Paladin')];

const reply = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

type Route = (url: string, init?: RequestInit) => Promise<Response>;

function stubFetch(route: Route) {
  const fetchMock = vi.fn(route);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Answers every endpoint the hook uses with a signed-in player's data.
const happyRoute: Route = (url, init) => {
  if (url.startsWith(`${API}/api/heroes`)) return reply(HEROES);
  if (url === `${API}/api/favorite-heroes/7`) return reply({ favoriteHeroes: ['Ninja'] });
  if (url === `${API}/api/user/7`) {
    return reply({ success: true, user: { available_heroes: ['Monk', 'Ninja'], holo_heroes: ['Monk'], shards: 140 } });
  }
  if (url === `${API}/api/shop/craft` && init?.method === 'POST') {
    return reply({
      success: true, heroName: 'Paladin', hero: HEROES[2], shards: 40, available_heroes: ['Monk', 'Ninja', 'Paladin'], heroCount: 3,
    });
  }
  if (url === `${API}/api/toggle-favorite-hero` && init?.method === 'POST') {
    return reply({ favoriteHeroes: ['Ninja', 'Paladin'] });
  }
  return Promise.reject(new Error(`unexpected request ${url}`));
};

let latest: BinderData;
function Probe({ userId, onFavoritesChange, onPurchaseComplete }: {
  userId: number | undefined; onFavoritesChange?: (f: string[]) => void; onPurchaseComplete?: () => void;
}) {
  latest = useBinderData(userId, onFavoritesChange, onPurchaseComplete);
  return null;
}

describe('useBinderData', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    // Only the hook's own failure logs are expected; React act() warnings would show up here too.
    for (const [first] of consoleError.mock.calls) expect(String(first)).toMatch(/^Error (fetching|toggling|crafting)/);
    cleanup();
    setAuthToken(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads heroes, owned, holo and favourites for a signed-in player', async () => {
    const fetchMock = stubFetch(happyRoute);
    render(<Probe userId={7} />);
    expect(latest.loading).toBe(true);
    // All three requests go out together, before any reply arrives.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/heroes?userId=7&showAll=true`);
    await settle();
    expect(latest.loading).toBe(false);
    expect(latest.error).toBe(false);
    expect(latest.heroes.map(h => h.name)).toEqual(['Monk', 'Ninja', 'Paladin']);
    expect(latest.collection).toEqual({ owned: ['Monk', 'Ninja'], favourites: ['Ninja'], holo: ['Monk'] });
  });

  it('signed out: fetches only heroes; collection is empty', async () => {
    const fetchMock = stubFetch(happyRoute);
    render(<Probe userId={undefined} />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/heroes`);
    expect(latest.heroes).toHaveLength(3);
    expect(latest.collection).toEqual({ owned: [], favourites: [], holo: [] });
  });

  it('a failed heroes request sets error, and retry refetches and clears it', async () => {
    let heroesUp = false;
    const fetchMock = stubFetch((url, init) =>
      url.startsWith(`${API}/api/heroes`) && !heroesUp ? reply({}, false) : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();
    expect(latest.loading).toBe(false);
    expect(latest.error).toBe(true);
    expect(latest.heroes).toEqual([]); // no fallback heroes

    heroesUp = true;
    act(() => latest.retry());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(6); // everything again
    expect(latest.error).toBe(false);
    expect(latest.heroes.map(h => h.name)).toEqual(['Monk', 'Ninja', 'Paladin']);
  });

  it('toggleFavourite posts { userId, heroName } with auth headers, takes favourites from the reply and calls onFavoritesChange', async () => {
    setAuthToken('tok');
    const fetchMock = stubFetch(happyRoute);
    const onFavoritesChange = vi.fn();
    render(<Probe userId={7} onFavoritesChange={onFavoritesChange} />);
    await settle();

    await act(() => latest.toggleFavourite('Paladin'));
    await settle();
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(url).toBe(`${API}/api/toggle-favorite-hero`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
    expect(JSON.parse(init?.body as string)).toEqual({ userId: 7, heroName: 'Paladin' });
    expect(latest.collection.favourites).toEqual(['Ninja', 'Paladin']);
    expect(onFavoritesChange).toHaveBeenCalledWith(['Ninja', 'Paladin']);
  });

  it('a failed toggle leaves favourites unchanged', async () => {
    const onFavoritesChange = vi.fn();
    stubFetch((url, init) =>
      url === `${API}/api/toggle-favorite-hero` ? reply({}, false) : happyRoute(url, init));
    render(<Probe userId={7} onFavoritesChange={onFavoritesChange} />);
    await settle();

    await act(() => latest.toggleFavourite('Paladin'));
    await settle();
    expect(latest.collection.favourites).toEqual(['Ninja']);
    expect(onFavoritesChange).not.toHaveBeenCalled();

    // A network failure is no different.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await act(() => latest.toggleFavourite('Paladin'));
    await settle();
    expect(latest.collection.favourites).toEqual(['Ninja']);
    expect(onFavoritesChange).not.toHaveBeenCalled();
  });
  it('the shard balance comes from the user; no shards field reads as 0', async () => {
    stubFetch(happyRoute);
    render(<Probe userId={7} />);
    await settle();
    expect(latest.shards).toBe(140);
    cleanup();

    stubFetch((url, init) => url === `${API}/api/user/7`
      ? reply({ success: true, user: { available_heroes: ['Monk'], holo_heroes: [] } })
      : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();
    expect(latest.shards).toBe(0);
  });

  it('craft posts only { heroName } with auth headers, takes owned and shards from the reply and tells the lobby', async () => {
    setAuthToken('tok');
    const fetchMock = stubFetch(happyRoute);
    const onPurchaseComplete = vi.fn();
    render(<Probe userId={7} onPurchaseComplete={onPurchaseComplete} />);
    await settle();

    let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(url).toBe(`${API}/api/shop/craft`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
    // Never a holographic: the request names the hero and nothing else
    expect(JSON.parse(init?.body as string)).toEqual({ heroName: 'Paladin' });
    expect(latest.collection.owned).toEqual(['Monk', 'Ninja', 'Paladin']);
    expect(latest.shards).toBe(40);
    expect(onPurchaseComplete).toHaveBeenCalledTimes(1);
  });

  it('a refusal hands back the server\'s message and changes nothing', async () => {
    const onPurchaseComplete = vi.fn();
    stubFetch((url, init) => url === `${API}/api/shop/craft`
      ? reply({ success: false, message: 'Not enough shards.' }, false, 400)
      : happyRoute(url, init));
    render(<Probe userId={7} onPurchaseComplete={onPurchaseComplete} />);
    await settle();

    let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: 'Not enough shards.' });
    expect(latest.collection.owned).toEqual(['Monk', 'Ninja']);
    expect(latest.shards).toBe(140);
    expect(onPurchaseComplete).not.toHaveBeenCalled();
  });

  it('a null or non-object reply is a failure: "Crafting isn\'t available right now."', async () => {
    let body: unknown = null;
    stubFetch((url, init) => url === `${API}/api/shop/craft` ? reply(body) : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();

    let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });
    body = 'yes';
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });
    await settle();
    expect(latest.collection.owned).toEqual(['Monk', 'Ninja']);
  });

  it('a server error\'s own text is never shown; the known refusals are', async () => {
    let body: unknown = { success: false, message: 'D1_ERROR: no such column: shards' };
    let status = 500;
    stubFetch((url, init) => url === `${API}/api/shop/craft` ? reply(body, false, status) : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();

    let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });

    status = 400;
    for (const known of ['Not enough shards.', 'You already have this hero.', 'Hero not available', 'Hero name is required']) {
      body = { success: false, message: known };
      await act(async () => { result = await latest.craft('Paladin'); });
      expect(result).toEqual({ ok: false, message: known });
    }
    status = 401;
    body = { success: false, message: 'Please log in again' };
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: 'Please log in again' });
    await settle();
  });

  it('a craft that ends unavailable, or as already owned, reloads the account; a plain refusal does not', async () => {
    let body: unknown = { success: false, message: 'Not enough shards.' };
    let status = 400;
    const fetchMock = stubFetch((url, init) => url === `${API}/api/shop/craft` ? reply(body, false, status) : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();
    const userLoads = () => fetchMock.mock.calls.filter(([url]) => url === `${API}/api/user/7`).length;
    const crafts = () => fetchMock.mock.calls.filter(([url]) => url === `${API}/api/shop/craft`).length;
    expect(userLoads()).toBe(1);

    await act(async () => { await latest.craft('Paladin'); });
    await settle();
    expect(userLoads()).toBe(1);

    body = { success: false, message: 'You already have this hero.' };
    await act(async () => { await latest.craft('Paladin'); });
    await settle();
    expect(userLoads()).toBe(2);

    body = { success: false, message: 'D1_ERROR: database is locked' };
    status = 500;
    await act(async () => { await latest.craft('Paladin'); });
    await settle();
    expect(userLoads()).toBe(3);
    // Never sent again by itself
    expect(crafts()).toBe(3);
  });

  it('a 404 (an old server) or no network: "Crafting isn\'t available right now."', async () => {
    stubFetch((url, init) => url === `${API}/api/shop/craft` ? reply({}, false, 404) : happyRoute(url, init));
    render(<Probe userId={7} />);
    await settle();

    let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });

    // The craft finds no network (the reload that follows it does)
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) =>
      url === `${API}/api/shop/craft` ? Promise.reject(new Error('offline')) : happyRoute(url, init)));
    await act(async () => { result = await latest.craft('Paladin'); });
    expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });
    await settle();
    expect(latest.collection.owned).toEqual(['Monk', 'Ninja']);
    expect(latest.shards).toBe(140);
  });

  describe('the craft time limit', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('a craft that gets no answer within 15 seconds gives up', async () => {
      vi.useFakeTimers();
      // A request that never answers, but stops when its signal aborts, as fetch does
      const fetchMock = stubFetch((url, init) => url === `${API}/api/shop/craft`
        ? new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        })
        : happyRoute(url, init));
      render(<Probe userId={7} />);
      await settle();

      let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
      let pending!: Promise<void>;
      act(() => { pending = latest.craft('Paladin').then(r => { result = r; }); });
      await settle();
      const signal = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]?.signal;
      expect(signal).toBeDefined();
      act(() => { vi.advanceTimersByTime(14999); });
      await settle();
      expect(result).toBeUndefined();
      expect(signal!.aborted).toBe(false);
      act(() => { vi.advanceTimersByTime(1); });
      await act(async () => { await pending; });
      expect(signal!.aborted).toBe(true);
      expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });
      expect(latest.collection.owned).toEqual(['Monk', 'Ninja']);
      expect(latest.shards).toBe(140);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a reply that comes after the limit changes nothing', async () => {
      vi.useFakeTimers();
      // A reply that only arrives after the abort: nothing is assumed from it
      let answer: (r: Response) => void = () => {};
      stubFetch((url, init) => url === `${API}/api/shop/craft`
        ? new Promise<Response>(resolve => { answer = resolve; })
        : happyRoute(url, init));
      render(<Probe userId={7} />);
      await settle();

      let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
      let pending!: Promise<void>;
      act(() => { pending = latest.craft('Paladin').then(r => { result = r; }); });
      await settle();
      act(() => { vi.advanceTimersByTime(20000); });
      await act(async () => {
        answer({ ok: true, status: 200, json: () => Promise.resolve({ success: true, shards: 40, available_heroes: ['Monk', 'Ninja', 'Paladin'] }) } as Response);
        await pending;
      });
      expect(result).toEqual({ ok: false, message: "Crafting isn't available right now." });
      expect(latest.collection.owned).toEqual(['Monk', 'Ninja']);
      expect(latest.shards).toBe(140);
    });

    it('a craft that answers in time is not aborted', async () => {
      vi.useFakeTimers();
      const fetchMock = stubFetch(happyRoute);
      render(<Probe userId={7} />);
      await settle();

      let result: Awaited<ReturnType<BinderData['craft']>> | undefined;
      await act(async () => { result = await latest.craft('Paladin'); });
      expect(result).toEqual({ ok: true });
      const signal = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]?.signal;
      expect(signal).toBeDefined();
      // The limit is cleared once the reply is in: nothing left to fire
      expect(vi.getTimerCount()).toBe(0);
      act(() => { vi.advanceTimersByTime(15000); });
      expect(signal!.aborted).toBe(false);
      expect(latest.collection.owned).toEqual(['Monk', 'Ninja', 'Paladin']);
      expect(latest.shards).toBe(40);
    });
  });
});
