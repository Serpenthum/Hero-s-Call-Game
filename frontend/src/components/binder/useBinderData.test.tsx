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

const reply = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);

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
    return reply({ success: true, user: { available_heroes: ['Monk', 'Ninja'], holo_heroes: ['Monk'] } });
  }
  if (url === `${API}/api/toggle-favorite-hero` && init?.method === 'POST') {
    return reply({ favoriteHeroes: ['Ninja', 'Paladin'] });
  }
  return Promise.reject(new Error(`unexpected request ${url}`));
};

let latest: BinderData;
function Probe({ userId, onFavoritesChange }: { userId: number | undefined; onFavoritesChange?: (f: string[]) => void }) {
  latest = useBinderData(userId, onFavoritesChange);
  return null;
}

describe('useBinderData', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    // Only the hook's own failure logs are expected; React act() warnings would show up here too.
    for (const [first] of consoleError.mock.calls) expect(String(first)).toMatch(/^Error (fetching|toggling)/);
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
});
