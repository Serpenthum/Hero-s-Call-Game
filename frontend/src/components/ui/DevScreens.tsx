import React, { useEffect, useState } from 'react';
import QuestRewardModal from '../QuestRewardModal';
import RequirementModal from '../RequirementModal';
import SettingsModal from '../SettingsModal';
import HowToPlayModal from '../HowToPlayModal';
import PackOpening from '../packs/PackOpening';
import type { PackCardKind, PackResult } from '../packs/packTypes';
import TutorialOverlay from '../tutorial/TutorialOverlay';
import Shop from '../Shop';
import config from '../../config';

// The shop with canned replies, so it can be looked at without signing in: /#screens/shop?coins=3&owned=all
// coins: the balance (23). owned: none, some (default) or all of the pack heroes. bought: sale heroes already
// owned, by name, comma separated. fail=1: purchases are refused with a server error. sale=none: nothing on sale.
const SHOP_SALE = ['Engineer', 'Dragon Rider', 'Elementalist', 'Arcane Archer', 'Angel', 'Ninja'];
const DevShop: React.FC<{ query: string }> = ({ query }) => {
  const params = new URLSearchParams(query);
  const [coins, setCoins] = useState(Number(params.get('coins') ?? 23));
  const [heroes, setHeroes] = useState<any[] | null>(null);
  const bought = (params.get('bought') ?? '').split(',').filter(Boolean);
  const fail = params.get('fail') === '1';

  useEffect(() => {
    const realFetch = window.fetch;
    const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
    let balance = coins;
    realFetch(`${config.API_BASE_URL}/api/heroes`).then(r => r.json()).then((list: any[]) => {
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/api/shop/rotation')) {
          const sale = params.get('sale') === 'none' ? [] : SHOP_SALE.map(name => list.find(h => h.name === name)).filter(Boolean);
          return reply({ success: true, heroes: sale.map(h => ({ ...h, owned: bought.includes(h.name) })) });
        }
        if (url.includes('/api/shop/purchase-hero')) {
          if (fail) return reply({ success: false, message: 'D1_ERROR: no such table' });
          balance -= 5;
          return reply({ success: true, newVP: balance, heroCount: 12 });
        }
        if (url.includes('/api/shop/purchase-pack')) return reply({ success: false, message: 'D1_ERROR: no such table' });
        return realFetch(input, init);
      };
      setHeroes(list);
    }).catch(() => undefined);
    return () => { window.fetch = realFetch; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!heroes) return null;
  const names: string[] = heroes.map(h => h.name);
  const ownedMode = params.get('owned') ?? 'some';
  const owned = ownedMode === 'all' ? names : ownedMode === 'none' ? [] : names.filter((_, i) => i % 3 === 0);
  return (
    <Shop
      onClose={() => undefined}
      userId={1}
      victoryPoints={coins}
      availableHeroes={[...owned, ...bought]}
      holoHeroes={owned.slice(0, 2)}
      onPurchaseComplete={() => undefined}
      onVictoryPointsChange={setCoins}
    />
  );
};

// Dev only: shows one rarely reached screen with sample data, e.g. /#screens/quest-reward
const DevScreens: React.FC = () => {
  const [name, query = ''] = window.location.hash.replace('#screens/', '').split('?');
  const [heroes, setHeroes] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${config.API_BASE_URL}/api/heroes`)
      .then(r => r.json())
      .then(list => setHeroes(list.slice(0, 4)))
      .catch(() => undefined);
  }, []);
  const noop = () => undefined;
  // Sample packs: /#screens/pack-opening (3 cards) and /#screens/pack-opening-holo (a bonus holographic fourth)
  const samplePack = (kinds: PackCardKind[]): PackResult => ({
    cards: kinds.map((kind, i) => ({ name: heroes[i].name, kind, hero: heroes[i] })),
    coinsBack: kinds.filter(k => k === 'repeat').length * 2,
    newVP: 30,
  });
  const packScreen = (kinds: PackCardKind[]) =>
    heroes.length >= kinds.length
      ? <PackOpening result={samplePack(kinds)} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />
      : null;

  switch (name) {
    case 'quest-reward':
      return (
        <QuestRewardModal
          reward={{ completed: [{ id: 1, text: 'Win 1 battle with Ninja' }, { id: 2, text: 'Win 1 battle going 2nd' }], xpGained: 40, vpGained: 8, leveledUp: true } as any}
          onOk={noop}
        />
      );
    case 'requirement':
      return <RequirementModal isOpen onClose={noop} message="You need at least 21 heroes to play Survival Mode." currentCount={12} requiredCount={21} type="heroes" />;
    case 'settings':
      return <SettingsModal onClose={noop} />;
    case 'how-to-play':
      return <HowToPlayModal onClose={noop} />;
    case 'pack-opening':
      return packScreen(['new', 'repeat', 'new']);
    case 'pack-opening-holo':
      return packScreen(['new', 'repeat', 'new', 'holo']);
    case 'shop':
      return <DevShop query={query} />;
    case 'tutorial':
      return <TutorialOverlay step={{ key: 'dev', text: 'This is your Binder. Every hero you own lives here.', showNext: true, nextLabel: 'Got it', anchor: 'center' }} onNext={noop} />;
    default:
      return <div style={{ padding: 'var(--space-7)', color: 'var(--bone)' }}>Screens: quest-reward, requirement, settings, how-to-play, pack-opening, pack-opening-holo, shop, tutorial</div>;
  }
};

export default DevScreens;
