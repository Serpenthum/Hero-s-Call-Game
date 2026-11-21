import React, { useState, useEffect, useCallback, useRef } from 'react';
import HeroCard from './HeroCard';
import PackOpening from './packs/PackOpening';
import { isHoloKind, type PackCard, type PackResult } from './packs/packTypes';
import HoloPack from './shop/HoloPack';
import {
  HERO_PRICE, PACK_PRICE, NOT_ENOUGH_COINS, NOT_ENOUGH_MS, ERROR_MS,
  shopErrorText, saleTimeLeft, packOwnedCount,
} from './shop/shopRules';
import CloseButton from './CloseButton';
import Coin from './Coin';
import Icon from './ui/Icon';
import { Hero } from '../types';
import { READ_TEXT_MIN_PX } from '../draft/draftRules';
import config from '../config';
import { authHeaders } from '../authSession';
import '../styles/Shop.css';
import useCardGrid from '../hooks/useCardGrid';

// The server's reply when the balance it sees is short (the client thought it could afford)
const SERVER_NOT_ENOUGH = 'Not enough to buy this.';
// How long the sale grid carries .shop-turn after the page or the rotation changes (the card-turn animation)
const TURN_MS = 800;

interface ShopProps {
  onClose: () => void;
  userId: number;
  victoryPoints: number;
  availableHeroes: string[]; // Heroes the player already owns
  holoHeroes?: string[]; // Heroes the player owns as holographic
  onPurchaseComplete: () => void; // Callback to refresh user data
  onVictoryPointsChange?: (victoryPoints: number) => void; // New balance, straight from the purchase reply
}

type ShopMessage = { text: string; type: 'success' | 'error' };

// A row of page pips, the current one lit
const Pips: React.FC<{ count: number; current: number }> = ({ count, current }) => (
  <span className="shop-pips" aria-hidden="true">
    {Array.from({ length: count }, (_, page) => (
      <span key={page} className={`shop-pip${page === current ? ' is-on' : ''}`} />
    ))}
  </span>
);

const Shop: React.FC<ShopProps> = ({ onClose, userId, victoryPoints, availableHeroes, holoHeroes = [], onPurchaseComplete, onVictoryPointsChange }) => {
  // The purchase reply carries the new balance; show it at once (a pack's refresh waits for its opening to close)
  const applyNewBalance = (newVP: unknown) => {
    if (typeof newVP === 'number') onVictoryPointsChange?.(newVP);
  };
  const [saleHeroes, setSaleHeroes] = useState<Hero[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => saleTimeLeft(new Date()));
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  // Set at once on a click, so a second click in the same tick (before `purchasing` renders) sends nothing
  const purchaseLock = useRef(false);
  const [message, setMessage] = useState<ShopMessage | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  // Heroes owned now: the prop, plus what packs bought here since (the prop catches up when an opening closes)
  const [owned, setOwned] = useState<string[]>(availableHeroes);
  useEffect(() => { setOwned(availableHeroes); }, [availableHeroes]);
  const [purchasedHeroes, setPurchasedHeroes] = useState<Set<string>>(new Set());
  const [showPackContents, setShowPackContents] = useState(false);
  const [packContentHeroes, setPackContentHeroes] = useState<Hero[]>([]);
  const [packContentsPage, setPackContentsPage] = useState(0);
  const [turning, setTurning] = useState(false);

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

  const saleGrid = useCardGrid({ shopCount: saleHeroes.length });
  const heroesPerPage = saleGrid.pageSize;
  const totalPages = Math.ceil(saleHeroes.length / heroesPerPage);
  const visibleSalePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const displayedHeroes = saleHeroes.slice(visibleSalePage * heroesPerPage, (visibleSalePage + 1) * heroesPerPage);

  useEffect(() => {
    setCurrentPage(0);
  }, [heroesPerPage]);

  const packContentsGrid = useCardGrid({ shopCount: packContentHeroes.length });
  const packContentsPerPage = packContentsGrid.pageSize;
  const totalPackContentsPages = Math.ceil(packContentHeroes.length / packContentsPerPage);
  const visiblePackPage = Math.min(packContentsPage, Math.max(0, totalPackContentsPages - 1));
  const displayedPackContents = packContentHeroes.slice(visiblePackPage * packContentsPerPage, (visiblePackPage + 1) * packContentsPerPage);

  useEffect(() => {
    setPackContentsPage(0);
  }, [packContentsPerPage]);

  const ownsEveryPackHero = packContentHeroes.length > 0 && packContentHeroes.every(h => owned.includes(h.name));
  const ownedCount = packOwnedCount(packContentHeroes, owned);

  // The cards turn over when the player pages or the rotation changes, not when the shop first shows them
  const firstSale = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (firstSale.current) {
      firstSale.current = false;
      return;
    }
    setTurning(true);
    const timer = setTimeout(() => setTurning(false), TURN_MS);
    return () => clearTimeout(timer);
  }, [loading, visibleSalePage, saleHeroes]);

  const handleNextPage = () => {
    if (visibleSalePage < totalPages - 1) setCurrentPage(visibleSalePage + 1);
  };

  const handlePrevPage = () => {
    if (visibleSalePage > 0) setCurrentPage(visibleSalePage - 1);
  };

  const handleShowPackContents = useCallback(async () => {
    // Only fetch if not already loaded
    if (packContentHeroes.length > 0) {
      setShowPackContents(true);
      return;
    }

    try {
      // Fetch all enabled heroes
      const response = await fetch(`${config.API_BASE_URL}/api/heroes`);
      const allHeroes = await response.json();

      // Filter out the 10 starter heroes
      const starterHeroes = ['Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard'];
      const packHeroes = (Array.isArray(allHeroes) ? allHeroes : [])
        .filter((h: Hero) => !starterHeroes.includes(h.name));

      setPackContentHeroes(packHeroes);
      setPackContentsPage(0);
      setShowPackContents(true);
    } catch (error) {
      console.error('Error fetching pack contents:', error);
    }
  }, [packContentHeroes.length]);

  // The time left in this sale, each second; a new rotation brings new heroes
  useEffect(() => {
    let lastRotationSeed: number | null = null;

    const updateTimer = () => {
      const left = saleTimeLeft(new Date());
      setTimeLeft(left);
      if (lastRotationSeed !== null && left.seed !== lastRotationSeed) {
        console.log('🔄 Shop rotation changed - refreshing heroes...');
        fetchShopRotation();
      }
      lastRotationSeed = left.seed;
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    fetchShopRotation();
  }, [userId]);

  // Only the first fetch shows "Loading shop..."; a rotation refresh keeps the shop up and turns the cards
  const fetchShopRotation = async () => {
    try {
      // Fetch rotation heroes
      const rotationResponse = await fetch(`${config.API_BASE_URL}/api/shop/rotation?userId=${userId}`, { headers: authHeaders() });
      const rotationData = await rotationResponse.json();

      if (rotationData.success) {
        // Store all rotation heroes
        const rotationHeroes = rotationData.heroes;

        // Mark heroes that are already owned as purchased
        const ownedHeroNames = new Set<string>(rotationHeroes.filter((h: any) => h.owned).map((h: any) => h.name as string));
        setPurchasedHeroes(ownedHeroNames);

        // Set sale heroes (all 6 from rotation)
        setSaleHeroes(rotationHeroes);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching shop rotation:', error);
      setLoading(false);
    }
  };

  const handlePurchaseHero = async (heroName: string) => {
    if (purchaseLock.current || purchasedHeroes.has(heroName)) return;
    if (victoryPoints < HERO_PRICE) {
      showMessage(NOT_ENOUGH_COINS, NOT_ENOUGH_MS);
      return;
    }

    purchaseLock.current = true;
    setPurchasing(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/shop/purchase-hero`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, heroName })
      });

      const data = await response.json();

      if (data.success) {
        // Mark hero as purchased in current session
        setPurchasedHeroes(prev => new Set(prev).add(heroName));
        applyNewBalance(data.newVP);
        console.log(`✅ Hero purchased: ${data.heroCount} total heroes`);
        onPurchaseComplete(); // Refresh user data
      } else {
        showRefusal(data.message);
      }
    } catch (error) {
      console.error('Error purchasing hero:', error);
      showMessage('Purchase failed. Check your connection and try again.', ERROR_MS);
    } finally {
      purchaseLock.current = false;
      setPurchasing(false);
    }
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

        // New heroes leave the sale
        setPurchasedHeroes(prev => {
          const next = new Set(prev);
          data.cards.forEach((card: PackResult['cards'][number]) => {
            if (card.kind === 'new' || card.kind === 'holo') next.add(card.name);
          });
          return next;
        });

        // A repeat of a hero already owned holographic is drawn holographic too.
        const replyHoloHeroes: string[] = Array.isArray(data.holo_heroes) ? data.holo_heroes : [];
        const cards: PackCard[] = data.cards.map((card: PackCard) => ({
          ...card,
          holo: isHoloKind(card.kind) || (card.kind === 'repeat' && replyHoloHeroes.includes(card.name)),
        }));
        setPackResult({ cards, coinsBack: data.coinsBack ?? 0, newVP: data.newVP });
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
    onPurchaseComplete(); // Refresh user data: balance, owned and holographic heroes
  };

  if (loading) {
    return (
      <div className="shop-overlay">
        <div className="shop-container shop--b">
          <div className="shop-loading">Loading shop...</div>
        </div>
      </div>
    );
  }

  // Grey, not disabled: a tap on a price the player can't afford still fires and explains why
  const heroPoor = victoryPoints < HERO_PRICE;
  const packPoor = victoryPoints < PACK_PRICE;

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
        <div className={`shop-message shop-message--over-opening ${message.type}`} role="alert">
          {message.text}
        </div>
      )}

      <div className="shop-overlay" onClick={onClose}>
      <div className="shop-container shop--b" onClick={(e) => e.stopPropagation()}>
        <CloseButton className="shop-close" onClick={onClose} />

        {/* Left: the showcase */}
        <aside className="shop-showcase">
          <div className="shop-showcase-head">
            <h2>Hero shop</h2>
            <div className="shop-balance">
              <Coin className="vp-icon" />
              <span className="vp-amount">{victoryPoints}</span>
            </div>
          </div>

          <HoloPack width="var(--shop-pack-w)" />

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

          <div className="shop-foot">
            <div className="shop-dial" style={{ '--p': timeLeft.fraction } as React.CSSProperties} aria-hidden="true">
              <span className="shop-dial-hand" />
            </div>
            <div className="shop-when">
              <span className="shop-when-label">Next sale in</span>
              <span className="shop-when-time">{timeLeft.label}</span>
            </div>
            {totalPages > 1 && (
              <div className="shop-pager">
                <button
                  type="button"
                  className="shop-pager-btn prev"
                  onClick={handlePrevPage}
                  disabled={visibleSalePage === 0}
                  aria-label="Previous sale page"
                >
                  ←
                </button>
                <Pips count={totalPages} current={visibleSalePage} />
                <button
                  type="button"
                  className="shop-pager-btn next"
                  onClick={handleNextPage}
                  disabled={visibleSalePage >= totalPages - 1}
                  aria-label="Next sale page"
                >
                  →
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Right: the felt table of sale cards */}
        <section className="shop-table">
          {message && (
            <div className={`shop-message ${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          {saleHeroes.length === 0 ? (
            <div className="shop-empty">
              <Icon name="check" size={40} className="empty-icon" />
              <h3>You own every hero</h3>
              <p>New heroes will appear here when they are added.</p>
            </div>
          ) : (
            <div
              className={`shop-sale-grid${turning ? ' shop-turn' : ''}`}
              ref={saleGrid.ref}
              style={saleGrid.style}
            >
              {displayedHeroes.map((hero, index) => {
                const isPurchased = purchasedHeroes.has(hero.name);
                return (
                  <div
                    key={hero.name}
                    className={`shop-slot${isPurchased ? ' is-bought' : ''}`}
                    style={{ '--i': index } as React.CSSProperties}
                  >
                    <HeroCard
                      hero={hero}
                      showFullInfo={true}
                      disableHPAnimations={true}
                      holo={holoHeroes.includes(hero.name)}
                      minTextPx={READ_TEXT_MIN_PX}
                    />
                    {isPurchased ? (
                      <div className="shop-stamp">Purchased</div>
                    ) : (
                      <button
                        type="button"
                        className={`shop-price-tag${heroPoor ? ' is-poor' : ''}`}
                        aria-disabled={heroPoor ? 'true' : undefined}
                        aria-label={`Buy ${hero.name} for ${HERO_PRICE} coins`}
                        disabled={purchasing}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePurchaseHero(hero.name);
                        }}
                      >
                        <Coin /> <span className="shop-price-tag-amount">{HERO_PRICE}</span>
                        <span className="shop-price-tag-buy">Buy</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* "See what's inside": the pack's heroes, beside a leather column */}
        {showPackContents && (
          <div className="shop-inside" role="dialog" aria-label="Adventure Pack contents">
            <CloseButton className="shop-close" onClick={() => setShowPackContents(false)} />
            <aside className="shop-inside-side">
              <h2 className="shop-inside-title">Adventure Pack Contents</h2>
              <HoloPack width="var(--shop-pack-w)" />
              <p className="shop-inside-sub">
                {ownsEveryPackHero
                  ? <>You own every hero. Packs give repeats (<Coin />+2 each) and a chance of a holographic card.</>
                  : '3 heroes from this list, and a 1 in 5 chance of a bonus holographic card.'}
              </p>
              <div className="shop-meter">
                <span className="shop-meter-label">You own {ownedCount.owned} of {ownedCount.total}</span>
                <span className="shop-meter-bar" aria-hidden="true">
                  <span
                    className="shop-meter-fill"
                    style={{ '--p': ownedCount.total ? ownedCount.owned / ownedCount.total : 0 } as React.CSSProperties}
                  />
                </span>
              </div>
              {totalPackContentsPages > 1 && (
                <div className="shop-pager">
                  <Pips count={totalPackContentsPages} current={visiblePackPage} />
                </div>
              )}
            </aside>

            <section className="shop-inside-table">
              <button
                type="button"
                className="shop-inside-arrow prev"
                onClick={() => setPackContentsPage(Math.max(0, visiblePackPage - 1))}
                disabled={visiblePackPage === 0}
                aria-label="Previous page"
              >
                ←
              </button>
              <div className="shop-inside-grid" ref={packContentsGrid.ref} style={packContentsGrid.style}>
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
