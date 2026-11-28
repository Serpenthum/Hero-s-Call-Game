import React, { useState, useEffect, useCallback, useRef } from 'react';
import HeroCard from './HeroCard';
import PackOpening from './packs/PackOpening';
import { isHoloKind, type PackCard, type PackResult } from './packs/packTypes';
import HoloPack from './shop/HoloPack';
import {
  PACK_PRICE, NOT_ENOUGH_COINS, NOT_ENOUGH_MS, ERROR_MS,
  shopErrorText, packOwnedCount,
} from './shop/shopRules';
import CloseButton from './CloseButton';
import Coin from './Coin';
import Shard from './ui/Shard';
import { CRAFT_PRICE } from './binder/craftRules';
import { cardMotionOff } from '../cards/cardMotion';
import { Hero } from '../types';
import { READ_TEXT_MIN_PX } from '../draft/draftRules';
import config from '../config';
import { authHeaders } from '../authSession';
import '../styles/Shop.css';
import useCardGrid from '../hooks/useCardGrid';

// The server's reply when the balance it sees is short (the client thought it could afford)
const SERVER_NOT_ENOUGH = 'Not enough to buy this.';

interface ShopProps {
  onClose: () => void;
  userId: number;
  victoryPoints: number;
  shards?: number; // The shard balance; missing means 0
  availableHeroes: string[]; // Heroes the player already owns
  holoHeroes?: string[]; // Heroes the player owns as holographic
  onPurchaseComplete: () => void; // Callback to refresh user data
  onVictoryPointsChange?: (victoryPoints: number) => void; // New balance, straight from the purchase reply
}

type ShopMessage = { text: string; type: 'success' | 'error' };

// A labelled progress bar: the heroes owned, the shards towards a craft
const Meter: React.FC<{ className?: string; fraction: number; children: React.ReactNode }> = ({ className = '', fraction, children }) => (
  <div className={`shop-meter ${className}`.trim()}>
    <span className="shop-meter-label">{children}</span>
    <span className="shop-meter-bar" aria-hidden="true">
      <span className="shop-meter-fill" style={{ '--p': Math.min(1, Math.max(0, fraction)) } as React.CSSProperties} />
    </span>
  </div>
);

// One of the three cards on the felt that show what a pack can hold
const HoldSlot: React.FC<{ hero: Hero; holo?: boolean; repeat?: boolean; title: string; sub: React.ReactNode }> = ({ hero, holo = false, repeat = false, title, sub }) => (
  <div className={`shop-hold${repeat ? ' is-repeat' : ''}`}>
    <div className="shop-hold-card">
      <HeroCard hero={hero} showFullInfo={true} disableHPAnimations={true} holo={holo} minTextPx={READ_TEXT_MIN_PX} />
      {repeat && <span className="shop-hold-shards" aria-hidden="true"><Shard />+10 shards</span>}
    </div>
    <div className="shop-hold-cap"><b>{title}</b><span>{sub}</span></div>
  </div>
);

// The three heroes on the felt: one the player lacks, a holographic, and one they own (all different when the list allows)
function pickHoldHeroes(heroes: Hero[], owned: string[]): [Hero, Hero, Hero] | null {
  if (heroes.length === 0) return null;
  const has = (hero: Hero) => owned.includes(hero.name);
  const taken = new Set<string>();
  const pick = (prefer: (hero: Hero) => boolean) => {
    const hero = heroes.find(h => !taken.has(h.name) && prefer(h)) ?? heroes.find(h => !taken.has(h.name)) ?? heroes[0];
    taken.add(hero.name);
    return hero;
  };
  const fresh = pick(h => !has(h));
  const repeat = pick(has);
  const holo = pick(() => true);
  return [fresh, holo, repeat];
}

const Shop: React.FC<ShopProps> = ({ onClose, userId, victoryPoints, shards: shardsProp, availableHeroes, holoHeroes: holoHeroesProp, onPurchaseComplete, onVictoryPointsChange }) => {
  // The purchase reply carries the new balance; show it at once (a pack's refresh waits for its opening to close)
  const applyNewBalance = (newVP: unknown) => {
    if (typeof newVP === 'number') onVictoryPointsChange?.(newVP);
  };
  const [purchasing, setPurchasing] = useState(false);
  // Set at once on a click, so a second click in the same tick (before `purchasing` renders) sends nothing
  const purchaseLock = useRef(false);
  const [message, setMessage] = useState<ShopMessage | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  // Heroes owned now: the prop, plus what packs bought here since (the prop catches up when an opening closes)
  const [owned, setOwned] = useState<string[]>(availableHeroes);
  useEffect(() => { setOwned(availableHeroes); }, [availableHeroes]);
  // Heroes owned as holographic now: the same, from the pack reply's holo_heroes
  const [holoHeroes, setHoloHeroes] = useState<string[]>(holoHeroesProp ?? []);
  useEffect(() => { setHoloHeroes(holoHeroesProp ?? []); }, [holoHeroesProp]);
  // The shard balance now: the prop, or the last pack reply's
  const [shards, setShards] = useState(shardsProp ?? 0);
  useEffect(() => { setShards(shardsProp ?? 0); }, [shardsProp]);
  // Every enabled hero: a pack draws one of them, owned or not
  const [packHeroes, setPackHeroes] = useState<Hero[]>([]);
  const [showPackContents, setShowPackContents] = useState(false);
  const [packContentsPage, setPackContentsPage] = useState(0);
  // The balance bumps each time it changes while the shop is open (a new key replays the bump), not when it opens
  const balanceBumps = useRef({ shown: victoryPoints, count: 0 });
  if (balanceBumps.current.shown !== victoryPoints) {
    balanceBumps.current = { shown: victoryPoints, count: balanceBumps.current.count + 1 };
  }

  // A new message replaces the one showing, and lasts its own time from now
  const showMessage = useCallback((text: string, ms: number, type: ShopMessage['type'] = 'error') => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage({ text, type });
    messageTimer.current = setTimeout(() => {
      messageTimer.current = null;
      setMessage(null);
    }, ms);
  }, []);
  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current); }, []);

  const showRefusal = (serverMessage: unknown) => {
    if (serverMessage === SERVER_NOT_ENOUGH) showMessage(NOT_ENOUGH_COINS, NOT_ENOUGH_MS);
    else showMessage(shopErrorText(serverMessage), ERROR_MS);
  };

  const loadPackHeroes = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/heroes`);
      const allHeroes = await response.json();
      const list: Hero[] = Array.isArray(allHeroes) ? allHeroes : [];
      setPackHeroes(list);
      return list.length > 0;
    } catch (error) {
      console.error('Error fetching pack heroes:', error);
      return false;
    }
  }, []);
  useEffect(() => { loadPackHeroes(); }, [loadPackHeroes]);

  const packContentsGrid = useCardGrid({ shopCount: packHeroes.length });
  const packContentsPerPage = packContentsGrid.pageSize;
  const totalPackContentsPages = Math.max(1, Math.ceil(packHeroes.length / packContentsPerPage));
  const visiblePackPage = Math.min(packContentsPage, totalPackContentsPages - 1);
  const displayedPackContents = packHeroes.slice(visiblePackPage * packContentsPerPage, (visiblePackPage + 1) * packContentsPerPage);

  useEffect(() => {
    setPackContentsPage(0);
  }, [packContentsPerPage]);

  const ownedCount = packOwnedCount(packHeroes, owned);
  const holdHeroes = pickHoldHeroes(packHeroes, owned);

  const handleShowPackContents = async () => {
    // The list loads with the shop; if that failed, try again now
    if (packHeroes.length === 0 && !(await loadPackHeroes())) return;
    setPackContentsPage(0);
    setShowPackContents(true);
  };

  // One lock for Buy pack and Buy another: a second tap while a request is out sends nothing.
  const handlePurchasePack = async () => {
    if (purchaseLock.current) return;
    if (victoryPoints < PACK_PRICE) {
      showMessage(NOT_ENOUGH_COINS, NOT_ENOUGH_MS);
      return;
    }
    const buyingAnother = packResult !== null;

    purchaseLock.current = true;
    setPurchasing(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/shop/purchase-pack`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (data.success && Array.isArray(data.cards)) {
        applyNewBalance(data.newVP);
        if (Array.isArray(data.available_heroes)) setOwned(data.available_heroes);
        const newShards = typeof data.shards === 'number' ? data.shards : undefined;
        if (newShards !== undefined) setShards(newShards);

        // A card is holographic when the server drew it so (its `holo` flag). An older server sends no flag:
        // then the holo kinds are holographic, and so is a repeat of a hero the reply lists as holographic.
        const replyHoloHeroes: string[] = Array.isArray(data.holo_heroes) ? data.holo_heroes : [];
        if (Array.isArray(data.holo_heroes)) setHoloHeroes(data.holo_heroes);
        const cards: PackCard[] = data.cards.map((card: PackCard) => ({
          ...card,
          holo: typeof card.holo === 'boolean'
            ? card.holo
            : isHoloKind(card.kind) || (card.kind === 'repeat' && replyHoloHeroes.includes(card.name)),
        }));
        setPackResult({
          cards,
          coinsBack: data.coinsBack ?? 0,
          newVP: data.newVP,
          shardsGained: data.shardsGained ?? 0,
          shards: newShards,
        });
        // The opening already on screen covers the lobby; bring the lobby up to date with the pack before
        if (buyingAnother) onPurchaseComplete();
      } else {
        showRefusal(data.message);
      }
    } catch (error) {
      console.error('Error purchasing pack:', error);
      showMessage('Pack purchase failed. Check your connection and try again.', ERROR_MS);
    } finally {
      purchaseLock.current = false;
      setPurchasing(false);
    }
  };

  const handlePackDone = () => {
    setPackResult(null);
    onPurchaseComplete(); // Refresh user data: balance, owned and holographic heroes, shards
  };

  // Grey, not disabled: a tap on a price the player can't afford still fires and explains why
  const packPoor = victoryPoints < PACK_PRICE;
  const coinsShort = PACK_PRICE - victoryPoints;
  const heroTotal = packHeroes.length;

  return (
    <>
      {packResult && (
        <PackOpening
          result={packResult}
          price={PACK_PRICE}
          canBuyAnother={victoryPoints >= PACK_PRICE && !purchasing}
          buying={purchasing}
          onBuyAnother={handlePurchasePack}
          onDone={handlePackDone}
        />
      )}
      {/* The shop's message sits under the opening; while it is up, show it above */}
      {packResult && message && (
        <div className={`shop-message shop-message--over-opening ${message.type}${cardMotionOff() ? ' shop-message--still' : ''}`} role="alert">
          {message.text}
        </div>
      )}

      <div className="shop-overlay" onClick={onClose}>
      <div className={`shop-container shop--b${cardMotionOff() ? ' shop--still' : ''}`} onClick={(e) => e.stopPropagation()}>
        <CloseButton className="shop-close" onClick={onClose} />

        {/* Left: the leather counter */}
        <aside className="shop-showcase">
          <div className="shop-showcase-head">
            <h2>Hero shop</h2>
            <div className="shop-balance">
              <Coin className="vp-icon" />
              <span key={balanceBumps.current.count} className={`vp-amount${balanceBumps.current.count > 0 ? ' is-bumped' : ''}`}>
                {victoryPoints}
              </span>
            </div>
          </div>

          <HoloPack width="var(--shop-pack-w)" />
          <p className="shop-pack-note">One random hero. 1 pack in 10 is holographic.</p>

          <button
            type="button"
            className={`shop-buy-pack${packPoor ? ' is-poor' : ''}`}
            aria-disabled={packPoor ? 'true' : undefined}
            disabled={purchasing}
            onClick={handlePurchasePack}
          >
            <span className="shop-buy-pack-label">Buy pack</span>
            <span className="shop-buy-pack-price"><Coin /> {PACK_PRICE}</span>
          </button>
          <button type="button" className="shop-inside-btn" onClick={handleShowPackContents}>
            See what's inside
          </button>
          {packPoor && (
            <p className="shop-short">
              <Coin />
              <span>{coinsShort} more {coinsShort === 1 ? 'coin' : 'coins'} needed</span>
            </p>
          )}
        </aside>

        {/* Right: the felt table, what a pack can hold and how far along the player is */}
        <section className="shop-table">
          {message && (
            <div className={`shop-message ${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          {holdHeroes && (
            <>
              <p className="shop-table-title">What a pack can hold</p>
              <div className="shop-holds">
                <HoldSlot hero={holdHeroes[0]} title="A new hero" sub={ownedCount.owned >= heroTotal ? `You have all ${heroTotal}` : `Any of the ${heroTotal}`} />
                <HoldSlot hero={holdHeroes[1]} holo title="A holographic" sub="1 pack in 10" />
                <HoldSlot hero={holdHeroes[2]} repeat title="One you own" sub={<><Shard />10 shards instead</>} />
              </div>
              <div className="shop-meters">
                <Meter className="shop-meter--heroes" fraction={heroTotal ? ownedCount.owned / heroTotal : 0}>
                  Heroes <span>{ownedCount.owned} of {heroTotal}</span>
                </Meter>
                <Meter className="shop-meter--shards" fraction={shards / CRAFT_PRICE}>
                  <Shard />Shards <span>{shards >= CRAFT_PRICE ? `${shards}, enough to craft` : `${shards} of ${CRAFT_PRICE} to craft`}</span>
                </Meter>
              </div>
            </>
          )}
        </section>

        {/* "See what's inside": every hero a pack can give, beside a leather column */}
        {showPackContents && (
          <div className="shop-inside" role="dialog" aria-label="What's inside the Adventure Pack">
            <CloseButton className="shop-close" onClick={() => setShowPackContents(false)} />
            <aside className="shop-inside-side">
              <h2 className="shop-inside-title">What's inside</h2>
              <HoloPack width="var(--shop-pack-w)" />
              <ul className="shop-inside-facts">
                <li>Every pack holds <b>one random hero</b>. All {heroTotal} are just as likely.</li>
                <li>A hero you already have gives <Shard /><b>10 shards</b>.</li>
                <li><b>1 pack in 10</b> is holographic.</li>
              </ul>
              <Meter fraction={ownedCount.total ? ownedCount.owned / ownedCount.total : 0}>
                You own {ownedCount.owned} of {ownedCount.total}
              </Meter>
              <div className="shop-inside-pager">
                <span className="shop-inside-page">
                  <span className="shop-inside-page-word">Page </span>{visiblePackPage + 1} of {totalPackContentsPages}
                </span>
              </div>
            </aside>

            <section className="shop-inside-table" style={packContentsGrid.style}>
              <button
                type="button"
                className="shop-inside-arrow prev"
                onClick={() => setPackContentsPage(Math.max(0, visiblePackPage - 1))}
                disabled={visiblePackPage === 0}
                aria-label="Previous page"
              >
                ←
              </button>
              <div className="shop-inside-grid" ref={packContentsGrid.ref}>
                {displayedPackContents.map((hero) => (
                  <div key={hero.name} className="shop-slot">
                    <HeroCard
                      hero={hero}
                      showFullInfo={true}
                      disableHPAnimations={true}
                      holo={holoHeroes.includes(hero.name)}
                      minTextPx={READ_TEXT_MIN_PX}
                    />
                    {owned.includes(hero.name) && <span className="shop-owned-chip">Owned</span>}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="shop-inside-arrow next"
                onClick={() => setPackContentsPage(Math.min(totalPackContentsPages - 1, visiblePackPage + 1))}
                disabled={visiblePackPage >= totalPackContentsPages - 1}
                aria-label="Next page"
              >
                →
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default Shop;
