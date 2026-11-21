import React, { useState, useEffect, useCallback, useRef } from 'react';
import HeroCard from './HeroCard';
import PackOpening from './packs/PackOpening';
import { isHoloKind, type PackCard, type PackResult } from './packs/packTypes';
import CloseButton from './CloseButton';
import Coin from './Coin';
import Icon from './ui/Icon';
import { Hero } from '../types';
import config from '../config';
import { authHeaders } from '../authSession';
import '../styles/Shop.css';
import useCardGrid from '../hooks/useCardGrid';
import '../styles/ResponsiveCardGrid.css';

const PACK_PRICE = 12;

interface ShopProps {
  onClose: () => void;
  userId: number;
  victoryPoints: number;
  availableHeroes: string[]; // Heroes the player already owns
  onPurchaseComplete: () => void; // Callback to refresh user data
  onVictoryPointsChange?: (victoryPoints: number) => void; // New balance, straight from the purchase reply
}

const Shop: React.FC<ShopProps> = ({ onClose, userId, victoryPoints, availableHeroes, onPurchaseComplete, onVictoryPointsChange }) => {
  // The purchase reply carries the new balance; show it at once (a pack's refresh waits for its opening to close)
  const applyNewBalance = (newVP: unknown) => {
    if (typeof newVP === 'number') onVictoryPointsChange?.(newVP);
  };
  const [saleHeroes, setSaleHeroes] = useState<Hero[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  // Set at once on a click, so a second click in the same tick (before `purchasing` renders) sends nothing
  const purchaseLock = useRef(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  // Heroes owned now: the prop, plus what packs bought here since (the prop catches up when an opening closes)
  const [owned, setOwned] = useState<string[]>(availableHeroes);
  useEffect(() => { setOwned(availableHeroes); }, [availableHeroes]);
  const [purchasedHeroes, setPurchasedHeroes] = useState<Set<string>>(new Set());
  const [showPackContents, setShowPackContents] = useState(false);
  const [packContentHeroes, setPackContentHeroes] = useState<Hero[]>([]);
  const [packContentsPage, setPackContentsPage] = useState(0);

  const saleGrid = useCardGrid({ rowExtra: 60 });
  const heroesPerPage = saleGrid.pageSize;
  const totalPages = Math.ceil(saleHeroes.length / heroesPerPage);
  const visibleSalePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const displayedHeroes = saleHeroes.slice(visibleSalePage * heroesPerPage, (visibleSalePage + 1) * heroesPerPage);

  useEffect(() => {
    setCurrentPage(0);
  }, [heroesPerPage]);

  const packContentsGrid = useCardGrid();
  const packContentsPerPage = packContentsGrid.pageSize;
  const totalPackContentsPages = Math.ceil(packContentHeroes.length / packContentsPerPage);
  const visiblePackPage = Math.min(packContentsPage, Math.max(0, totalPackContentsPages - 1));
  const displayedPackContents = packContentHeroes.slice(visiblePackPage * packContentsPerPage, (visiblePackPage + 1) * packContentsPerPage);

  useEffect(() => {
    setPackContentsPage(0);
  }, [packContentsPerPage]);

  const ownsEveryPackHero = packContentHeroes.length > 0 && packContentHeroes.every(h => owned.includes(h.name));

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
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

  // Calculate time until next 15-minute rotation
  useEffect(() => {
    let lastRotationSeed: number | null = null;
    
    const updateTimer = () => {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentRotation = Math.floor(currentMinutes / 15);
      const nextRotationMinute = (currentRotation + 1) * 15;
      
      const nextRotation = new Date(now);
      if (nextRotationMinute >= 60) {
        nextRotation.setHours(now.getHours() + 1, 0, 0, 0);
      } else {
        nextRotation.setMinutes(nextRotationMinute, 0, 0);
      }
      
      const diff = nextRotation.getTime() - now.getTime();
      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeUntilRefresh(`${minutes}m ${seconds}s`);
      
      // Check if we've moved to a new rotation period
      const currentSeed = Math.floor(now.getTime() / (15 * 60 * 1000));
      if (lastRotationSeed !== null && currentSeed !== lastRotationSeed) {
        console.log('🔄 Shop rotation changed - refreshing heroes...');
        fetchShopRotation();
      }
      lastRotationSeed = currentSeed;
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    fetchShopRotation();
  }, [userId]);

  const fetchShopRotation = async () => {
    try {
      setLoading(true);
      
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
    if (purchaseLock.current || victoryPoints < 5 || purchasedHeroes.has(heroName)) return;

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
        setMessage({ text: `${data.message}`, type: 'error' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error purchasing hero:', error);
      setMessage({ text: 'Purchase failed. Check your connection and try again.', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      purchaseLock.current = false;
      setPurchasing(false);
    }
  };

  // One lock for Buy pack and Buy another: a second tap while a request is out sends nothing.
  const handlePurchasePack = async () => {
    if (purchaseLock.current || victoryPoints < PACK_PRICE) return;
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
        const holoHeroes: string[] = Array.isArray(data.holo_heroes) ? data.holo_heroes : [];
        const cards: PackCard[] = data.cards.map((card: PackCard) => ({
          ...card,
          holo: isHoloKind(card.kind) || (card.kind === 'repeat' && holoHeroes.includes(card.name)),
        }));
        setPackResult({ cards, coinsBack: data.coinsBack ?? 0, newVP: data.newVP });
        // The opening already on screen covers the lobby; bring the lobby up to date with the pack before
        if (buyingAnother) onPurchaseComplete();
      } else {
        setMessage({ text: `${data.message}`, type: 'error' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error purchasing pack:', error);
      setMessage({ text: 'Pack purchase failed. Check your connection and try again.', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
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
        <div className="shop-container">
          <div className="shop-loading">Loading shop...</div>
        </div>
      </div>
    );
  }

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
      <div className="shop-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shop-header">
          <h2>Hero shop</h2>
          <div className="shop-header-right">
            <div className="shop-vp-display">
              <Coin className="vp-icon" />
              <span className="vp-amount">{victoryPoints}</span>
            </div>
            <CloseButton onClick={onClose} />
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`shop-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Main Shop Content - Two Column Layout */}
        <div className="shop-main-content">
          {/* Left Column - Hero Sale (75%) */}
          <div className="shop-sale-section">
            <div className="shop-section-header">
              <h3>Hero sale</h3>
              <div className="sale-timer">
                <Icon name="clock" className="timer-icon" />
                <span>Next sale: {timeUntilRefresh}</span>
              </div>
            </div>

            {saleHeroes.length === 0 ? (
              <div className="shop-empty">
                <Icon name="check" size={40} className="empty-icon" />
                <h3>You own every hero</h3>
                <p>New heroes will appear here when they are added.</p>
              </div>
            ) : (
              <div className="shop-sale-container">
                {/* Left Arrow */}
                <button 
                  className="shop-pagination-arrow left"
                  onClick={handlePrevPage}
                  disabled={visibleSalePage === 0}
                  aria-label="Previous sale page"
                >
                  ←
                </button>

                {/* Heroes Grid */}
                <div className="responsive-card-viewport" ref={saleGrid.ref} style={saleGrid.style}>
                <div className="shop-sale-grid responsive-card-grid">
                  {displayedHeroes.map((hero, index) => {
                    const isPurchased = purchasedHeroes.has(hero.name);
                    return (
                      <div key={index} className="shop-hero-wrapper">
                        <div className="shop-vp-badge">
                          <span><Coin /> 5</span>
                        </div>
                        
                        <div 
                          className={`shop-hero-card ${isPurchased ? 'purchased' : ''}`}
                        >
                          <HeroCard 
                            hero={hero}
                            showFullInfo={true}
                            disableHPAnimations={true}
                          />
                          {isPurchased && (
                            <div className="shop-hero-purchased-overlay">
                              <span className="purchased-text">Purchased</span>
                            </div>
                          )}
                        </div>
                        
                        <button 
                          className="shop-buy-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePurchaseHero(hero.name);
                          }}
                          disabled={purchasing || victoryPoints < 5 || isPurchased}
                        >
                          {isPurchased ? 'Purchased' : victoryPoints < 5 ? 'Not Enough' : 'Buy hero'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                </div>
                {/* Right Arrow */}
                <button 
                  className="shop-pagination-arrow right"
                  onClick={handleNextPage}
                  disabled={visibleSalePage >= totalPages - 1}
                  aria-label="Next sale page"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Hero Packs (25%) */}
          <div className="shop-pack-section">
            <div className="shop-section-header">
              <h3>Hero packs</h3>
            </div>
            <p className="pack-description">3 random heroes, and a 1 in 5 chance of a bonus holographic card.</p>
            
            <div className="shop-hero-wrapper pack-wrapper">
              <div className="shop-vp-badge pack-vp-badge">
                <span><Coin /> {PACK_PRICE}</span>
              </div>
              
              <div className="shop-hero-card pack-card-display">
                <img 
                  src="/pack1.png"
                  alt="Hero Pack"
                  className="pack-image"
                />
                <div className="pack-title-overlay">Adventure Pack</div>
              </div>
              
              <button 
                className="shop-buy-btn pack-buy-btn"
                onClick={handlePurchasePack}
                disabled={purchasing || victoryPoints < PACK_PRICE}
              >
                {victoryPoints < PACK_PRICE ? 'Not Enough' : 'Buy pack'}
              </button>
              
              <button 
                className="shop-buy-btn pack-info-btn"
                onClick={handleShowPackContents}
              >
                See what's inside
              </button>
            </div>
          </div>
        </div>

        {/* Pack Contents Modal */}
        {showPackContents && (
          <div className="pack-contents-modal" onClick={() => setShowPackContents(false)}>
            <div className="pack-contents-container" onClick={(e) => e.stopPropagation()}>
              <CloseButton className="modal-close-btn" onClick={() => setShowPackContents(false)} />
              <h2 className="pack-contents-title">Adventure Pack Contents</h2>
              <p className="pack-contents-subtitle">
                {ownsEveryPackHero
                  ? <>You own every hero. Packs give repeats (<Coin />+2 each) and a chance of a holographic card.</>
                  : '3 heroes from this list, and a 1 in 5 chance of a bonus holographic card.'}
              </p>
              
              <div className="responsive-card-viewport" ref={packContentsGrid.ref} style={packContentsGrid.style}>
              <div className="pack-contents-grid responsive-card-grid">
                {displayedPackContents.map((hero) => {
                  const isOwned = owned.includes(hero.name);
                  return (
                  <div key={hero.name} className="shop-hero-wrapper pack-content-hero">
                    <div className={`shop-hero-card ${isOwned ? 'purchased' : ''}`}>
                      <HeroCard hero={hero} showFullInfo={true} disableHPAnimations={true} />
                      {isOwned && (
                        <div className="shop-hero-purchased-overlay">
                          <span className="purchased-text">OWNED</span>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
              </div>
              
              {totalPackContentsPages > 1 && (
                <div className="pack-contents-pagination">
                  <button 
                    className="pagination-arrow"
                    onClick={() => setPackContentsPage(prev => Math.max(0, prev - 1))}
                    disabled={visiblePackPage === 0}
                  >
                    ←
                  </button>
                  <span className="pagination-info">
                    Page {visiblePackPage + 1} of {totalPackContentsPages}
                  </span>
                  <button 
                    className="pagination-arrow"
                    onClick={() => setPackContentsPage(prev => Math.min(totalPackContentsPages - 1, prev + 1))}
                    disabled={visiblePackPage === totalPackContentsPages - 1}
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default Shop;
