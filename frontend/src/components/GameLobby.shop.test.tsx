// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../socketService', () => ({ socketService: { getQuests: () => undefined } }));
// The shop stands in as a button that finishes a purchase, and shows the shards it is given
vi.mock('./Shop', () => ({
  default: ({ shards, onPurchaseComplete }: { shards?: number; onPurchaseComplete: () => void }) => (
    <button type="button" className="fake-shop" data-shards={String(shards)} onClick={onPurchaseComplete}>finish purchase</button>
  ),
}));

import GameLobby from './GameLobby';
import { cleanup, click, render, settle, stubBrowserApis } from '../testing/dom';

const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

const baseUser = () => ({
  id: 7, username: 'Ada', victory_points: 45, survival_wins: 0, survival_losses: 0, survival_used_heroes: [],
  available_heroes: ['Fighter'], favorite_heroes: [], holo_heroes: [], xp: 0, level: 1, best_gauntlet_trial: 0, shards: 60,
});

describe('GameLobby shop refresh', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/user/7')) {
        return reply({ success: true, user: { victory_points: 25, available_heroes: ['Fighter', 'Monk'], holo_heroes: [], shards: 70 } });
      }
      if (url.includes('/api/heroes')) return reply([]);
      return reply({});
    }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('the refresh after a purchase brings the shard balance up to date', async () => {
    const user = baseUser();
    const root = render(
      <GameLobby onStartGame={() => undefined} onStartSurvival={() => undefined} onStartGauntlet={() => undefined}
        victoryPoints={45} user={user} onLogout={() => undefined} />,
    );
    await settle();
    click(root.querySelector('.shop-tile'));
    expect(root.querySelector('.fake-shop')?.getAttribute('data-shards')).toBe('60');

    click(root.querySelector('.fake-shop'));
    await settle();

    expect(user.shards).toBe(70);
    expect(root.querySelector('.fake-shop')?.getAttribute('data-shards')).toBe('70');
  });
});
