import React, { useEffect, useState } from 'react';
import QuestRewardModal from '../QuestRewardModal';
import RequirementModal from '../RequirementModal';
import SettingsModal from '../SettingsModal';
import HowToPlayModal from '../HowToPlayModal';
import PackOpening from '../packs/PackOpening';
import type { PackCardKind, PackResult } from '../packs/packTypes';
import TutorialOverlay from '../tutorial/TutorialOverlay';
import Shop from '../Shop';
import HeroCollection from '../HeroCollection';
import { DEFAULT_VIEW, FILTER_LABELS, type BinderFilter } from '../binder/binderRules';
import config from '../../config';
import BadgeSprite from '../badges/BadgeSprite';
import BadgeToken from '../badges/BadgeToken';
import type { Badge } from '../../battle/badges';
import '../../styles/HeroCard.css';

// The shop with canned replies, so it can be looked at without signing in: /#screens/shop?coins=12&owned=all
// coins: the balance (23). shards: the shard balance (60). owned: none, some (default) or all of the pack heroes.
// fail=1: packs are refused with a server error. A pack gives one random hero; a repeat pays 10 shards.
const DevShop: React.FC<{ query: string }> = ({ query }) => {
  const params = new URLSearchParams(query);
  const [coins, setCoins] = useState(Number(params.get('coins') ?? 23));
  const shards = Number(params.get('shards') ?? 60);
  const [heroes, setHeroes] = useState<any[] | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const fail = params.get('fail') === '1';

  useEffect(() => {
    const realFetch = window.fetch;
    const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
    let balance = coins;
    let shardBalance = shards;
    realFetch(`${config.API_BASE_URL}/api/heroes`).then(r => r.json()).then((list: any[]) => {
      const names: string[] = list.map(h => h.name);
      const ownedMode = params.get('owned') ?? 'some';
      let ownedNow = ownedMode === 'all' ? names : ownedMode === 'none' ? [] : names.filter((_, i) => i % 3 === 0);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/api/heroes')) return reply(list);
        if (url.includes('/api/shop/purchase-pack')) {
          if (fail) return reply({ success: false, message: 'D1_ERROR: no such table' });
          const hero = list[Math.floor(Math.random() * list.length)];
          const repeat = ownedNow.includes(hero.name);
          const shardsGained = repeat ? 10 : 0;
          balance -= 20;
          shardBalance += shardsGained;
          if (!repeat) ownedNow = [...ownedNow, hero.name];
          const card = { name: hero.name, kind: repeat ? 'repeat' : 'new', holo: false, hero };
          return reply({
            success: true, card, cards: [card], coinsSpent: 20, coinsBack: 0, shardsGained, shards: shardBalance,
            newVP: balance, holo_heroes: [], available_heroes: ownedNow, heroCount: ownedNow.length, heroesReceived: [hero.name],
          });
        }
        return realFetch(input, init);
      };
      setOwned(ownedNow);
      setHeroes(list);
    }).catch(() => undefined);
    return () => { window.fetch = realFetch; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!heroes) return null;
  return (
    <Shop
      onClose={() => undefined}
      userId={1}
      victoryPoints={coins}
      shards={shards}
      availableHeroes={owned}
      holoHeroes={owned.slice(0, 2)}
      onPurchaseComplete={() => undefined}
      onVictoryPointsChange={setCoins}
    />
  );
};

// The binder with canned replies: /#screens/binder?owned=all&holo=2&hero=Ninja
// signedin=0: signed out. owned: some (default: the mockup's 27 of 40), all or none. holo: how many owned heroes are
// holographic (5). hero: open on this hero. filter: the filter to open on (all, owned, favourites, holo, not-owned,
// disabled). fail=1: the heroes request fails. shards: the shard balance (140). craft: ok (default), refuse (the
// server says "Not enough shards."), old (an old server: 404) or slow (the reply takes 3 seconds).
const BINDER_NOT_OWNED = ['Assassin', 'Bomber', 'Champion', 'Cleric', 'Diplomat', 'Elementalist', 'Hoarder', 'Mech',
  'Plague Spreader', 'Shaman', 'Silencer', 'Timekeeper', 'Warden'];
const BINDER_HOLO = ['Angel', 'Blood Hunter', 'Paladin', 'Ninja', 'Dragon Rider'];
const BINDER_FAVOURITES = ['Arcane Archer', 'Barbarian', 'Blood Hunter', 'Monk', 'Wizard', 'Reaper'];
const DevBinder: React.FC<{ query: string }> = ({ query }) => {
  const params = new URLSearchParams(query);
  const signedIn = params.get('signedin') !== '0';
  const filterParam = params.get('filter');
  const filter = filterParam && filterParam in FILTER_LABELS ? filterParam as BinderFilter : DEFAULT_VIEW.filter;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const realFetch = window.fetch;
    const reply = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    let favourites = [...BINDER_FAVOURITES];
    realFetch(`${config.API_BASE_URL}/api/heroes?showAll=true`).then(r => r.json()).then((list: any[]) => {
      const enabled: string[] = list.filter(h => !h.disabled).map(h => h.name);
      const ownedMode = params.get('owned') ?? 'some';
      let owned = ownedMode === 'all' ? enabled : ownedMode === 'none' ? [] : enabled.filter(n => !BINDER_NOT_OWNED.includes(n));
      let shards = Number(params.get('shards') ?? 140);
      const craftMode = params.get('craft') ?? 'ok';
      const holoCount = Number(params.get('holo') ?? BINDER_HOLO.length);
      const holo = [...BINDER_HOLO.filter(n => owned.includes(n)), ...owned.filter(n => !BINDER_HOLO.includes(n))].slice(0, holoCount);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/api/heroes')) {
          if (params.get('fail') === '1') return reply({ error: 'canned failure' }, 500);
          // As the server: disabled heroes only come with showAll (the signed-in request)
          return reply(url.includes('showAll=true') ? list : list.filter(h => !h.disabled));
        }
        if (url.includes('/api/favorite-heroes/')) return reply({ favoriteHeroes: favourites });
        if (url.includes('/api/user/')) return reply({ success: true, user: { available_heroes: owned, holo_heroes: holo, shards } });
        if (url.includes('/api/shop/craft')) {
          if (craftMode === 'old') return reply({ error: 'Not found' }, 404);
          if (craftMode === 'refuse') return reply({ success: false, message: 'Not enough shards.' }, 400);
          const { heroName } = JSON.parse(String(init?.body)) as { heroName: string };
          owned = [...owned, heroName];
          shards -= 100;
          const body = { success: true, heroName, hero: list.find(h => h.name === heroName), shards, available_heroes: owned, heroCount: owned.length };
          if (craftMode !== 'slow') return reply(body);
          return new Promise<Response>(resolve => { window.setTimeout(() => { void reply(body).then(resolve); }, 3000); });
        }
        if (url.includes('/api/toggle-favorite-hero')) {
          const { heroName } = JSON.parse(String(init?.body)) as { heroName: string };
          favourites = favourites.includes(heroName) ? favourites.filter(n => n !== heroName) : [...favourites, heroName];
          return reply({ success: true, favoriteHeroes: favourites });
        }
        return realFetch(input, init);
      };
      setReady(true);
    }).catch(() => undefined);
    return () => { window.fetch = realFetch; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return (
    <HeroCollection
      onClose={() => undefined}
      userId={signedIn ? 1 : undefined}
      initialHero={params.get('hero') ?? undefined}
      initialView={{ ...DEFAULT_VIEW, filter }}
    />
  );
};

// Every battle badge on bare card faces at 260, 180 and 129px: /#screens/badges?open=260-turrets
// A tap toggles a bubble and a mouse hover opens one, one at a time. open: the bubble to start with, "<width>-<badge key>".
const b = (key: Badge['key'], symbol: string, rim: Badge['rim'], short: string, full: string, count?: string): Badge =>
  ({ key, symbol, rim, short, full, ...(count ? { count } : {}) });
const BADGE_CARDS: Badge[][] = [
  [
    b('turrets', 'i-golem', 'buff', 'Turrets 2/2', "2 of 2 Turrets. At the end of Engineer's turn each deals 1D4 damage to a random enemy. One is given up to block damage.", '2'),
    b('hidden', 'i-hidden', 'buff', 'Hidden', "Can't be Focused until Ninja's next turn."),
    b('poison', 'i-poison', 'poison', 'Poison 3', 'Takes 3 damage at the end of its turn.', '3'),
    b('taunted', 'i-taunt', 'debuff', 'Taunted: Warden', 'Must Focus Warden with attacks and abilities on its next turn.'),
    { ...b('tauntComing', 'i-taunt', 'debuff', 'Taunt coming', 'Will be taunted by Paladin at the end of this turn.'), dashed: true },
    b('defenseDown', 'i-defdown', 'debuff', 'Defense -1', "Piercing Shot: -1 Defense until Ranger's next turn.", '-1'),
  ],
  [
    b('totems', 'i-totem2', 'buff', 'Totems 2/3', '2 of 3 Totems. Elemental Strike adds a Totem, then deals 1D4 damage per Totem.'),
    b('medBots', 'i-bot', 'buff', 'Med Bots 2/3', "2 of 3 Med Bots. At the end of Medic's turn, the lowest-HP ally heals for 2D4.", '2'),
    b('beast', 'i-paw', 'buff', 'Beast out', "The Beast is out. Beast Tamer's attacks have advantage."),
    b('bloodbath', 'i-blood', 'buff', 'Bloodbath +2', '+2 damage to attacks (max 2).', '+2'),
    b('frenzy', 'i-flame', 'buff', 'Frenzy', 'Below 10 HP: Berserker can attack twice per turn.'),
    b('desperateBlows', 'i-blows', 'buff', 'Desperate Blows', "Below 10 HP: Fighter's attacks have advantage."),
  ],
  [
    b('arcaneShield', 'i-ashield', 'buff', 'Arcane Shield', 'The first hit of more than 5 damage is reduced to 0.'),
    b('windWall', 'i-wind', 'buff', 'Wind Wall +1', "+1 Defense until Elementalist's next turn.", '+1'),
    b('silenced', 'i-silence', 'debuff', 'Silenced 1', "Can't use abilities for 1 more turn.", '1'),
    b('stunned', 'i-stun', 'debuff', 'Stunned 1', "Can't make basic attacks for 1 more turn.", '1'),
    b('bribed', 'i-bribe', 'debuff', 'Bribed', "Can't use its ability on Hoarder until Hoarder's next turn."),
  ],
  [
    b('guidingBolt', 'i-exposed', 'debuff', 'Guiding Bolt', 'The next attack or ability roll against this hero has advantage.'),
    b('rideDown', 'i-shoe', 'debuff', 'Ride Down', 'Attacks against this hero have advantage.'),
    b('healthLink', 'i-link', 'debuff', 'Health Link', 'The next time Angel takes damage, this hero takes it too.'),
    b('arcaneMark', 'i-mark', 'debuff', 'Arcane mark', 'Arcane Archer deals +1D4 to this hero.'),
  ],
];
const TOTEM_STEPS: Badge[] = [1, 2, 3].map(n =>
  b('totems', `i-totem${n}`, 'buff', `Totems ${n}/3`, `${n} of 3 Totems. Elemental Strike adds a Totem, then deals 1D4 damage per Totem.`));
const DevBadges: React.FC<{ query: string }> = ({ query }) => {
  const [open, setOpen] = useState<string | null>(new URLSearchParams(query).get('open'));
  const [pinned, setPinned] = useState(open !== null);
  const token = (badge: Badge, id: string) => (
    <BadgeToken
      key={id}
      badge={badge}
      open={open === id}
      onToggle={() => { setOpen(open === id && pinned ? null : id); setPinned(!(open === id && pinned)); }}
      onHoverChange={hovering => { if (!pinned) setOpen(hovering ? id : null); }}
    />
  );
  return (
    <div style={{ minHeight: '100vh', padding: 'var(--space-5)', background: 'var(--felt-surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <BadgeSprite />
      {/* The drawings, large, to judge them against the mockup. Off a card the bubble is centred on its token. */}
      <div className="dev-badges-big" style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap', fontSize: 26, paddingLeft: '14em' }}>
        {[...TOTEM_STEPS.map((badge, i) => [badge, `big-totem${i + 1}`] as const),
          ...BADGE_CARDS.flat().filter(badge => badge.key !== 'totems').map(badge => [badge, `big-${badge.key}`] as const),
        ].map(([badge, id]) => token(badge, id))}
      </div>
      {[260, 180, 129].map(width => (
        <div key={width} style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {BADGE_CARDS.map((badges, card) => (
            <div
              key={card}
              className="hero-card hero-layout-card"
              style={{
                '--hero-card-scale': width / 260,
                border: 'max(2px, 0.2em) solid var(--brass)',
                background: 'linear-gradient(160deg, var(--verdigris), var(--stat-defense) 45%, var(--leather-hi))',
              } as React.CSSProperties}
            >
              <div className="card-status">{badges.map(badge => token(badge, `${width}-${badge.key}`))}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
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
    shardsGained: 0,
  });
  // Today's one-card pack, forced to an outcome: /#screens/pack-one?outcome=repeat
  // outcome: new (default), repeat, holo, upgrade or holo-repeat (the mockup's five). hero: which sample hero (0 to 3).
  const onePack = (): PackResult | null => {
    const params = new URLSearchParams(query);
    const sample = heroes[Number(params.get('hero') ?? 0)];
    if (!sample) return null;
    const outcome = params.get('outcome') ?? 'new';
    const kind: PackCardKind = outcome === 'holo' ? 'holo' : outcome === 'upgrade' ? 'holo_upgrade' : outcome === 'new' ? 'new' : 'repeat';
    const paid = kind === 'repeat';
    return {
      cards: [{ name: sample.name, kind, hero: sample, holo: kind !== 'new' && outcome !== 'repeat' }],
      coinsBack: 0,
      newVP: 30,
      shardsGained: paid ? 10 : 0,
      shards: paid ? 70 : 60,
    };
  };
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
    case 'pack-one': {
      const pack = onePack();
      return pack && <PackOpening result={pack} price={20} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />;
    }
    case 'shop':
      return <DevShop query={query} />;
    case 'binder':
      return <DevBinder query={query} />;
    case 'badges':
      return <DevBadges query={query} />;
    case 'tutorial':
      return <TutorialOverlay step={{ key: 'dev', text: 'This is your Binder. Every hero you own lives here.', showNext: true, nextLabel: 'Got it', anchor: 'center' }} onNext={noop} />;
    default:
      return <div style={{ padding: 'var(--space-7)', color: 'var(--bone)' }}>Screens: quest-reward, requirement, settings, how-to-play, pack-opening, pack-opening-holo, pack-one, shop, binder, badges, tutorial</div>;
  }
};

export default DevScreens;
