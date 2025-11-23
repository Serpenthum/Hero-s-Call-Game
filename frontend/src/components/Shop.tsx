import React, { useState, useEffect, useMemo, useCallback } from 'react';
import HeroCard from './HeroCard';
import PackOpeningAnimation from './PackOpeningAnimation';
import { Hero } from '../types';
import config from '../config';
import '../styles/Shop.css';

interface ShopProps {
  onClose: () => void;
  userId: number;
  victoryPoints: number;
  availableHeroes: string[]; // Heroes the player already owns
  onPurchaseComplete: () => void; // Callback to refresh user data
}

const Shop: React.FC<ShopProps> = ({ onClose, userId, victoryPoints, availableHeroes, onPurchaseComplete }) => {
  const [unownedHeroes, setUnownedHeroes] = useState<Hero[]>([]);
  const [saleHeroes, setSaleHeroes] = useState<Hero[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('');
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [packOpening, setPackOpening] = useState(false);
  const [packHeroes, setPackHeroes] = useState<Hero[]>([]);
  const [purchasedHeroes, setPurchasedHeroes] = useState<Set<string>>(new Set());
  const [showPackContents, setShowPackContents] = useState(false);
  const [packContentHeroes, setPackContentHeroes] = useState<Hero[]>([]);
  const [packContentsPage, setPackContentsPage] = useState(0);

  const heroesPerPage = 3;
  const totalPages = Math.ceil(saleHeroes.length / heroesPerPage);
  const displayedHeroes = saleHeroes.slice(currentPage * heroesPerPage, (currentPage + 1) * heroesPerPage);

  const packContentsPerPage = 5;
  const totalPackContentsPages = Math.ceil(packContentHeroes.length / packContentsPerPage);
  const displayedPackContents = packContentHeroes.slice(packContentsPage * packContentsPerPage, (packContentsPage + 1) * packContentsPerPage);

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
      const rotationResponse = await fetch(`${config.API_BASE_URL}/api/shop/rotation?userId=${userId}`);
      const rotationData = await rotationResponse.json();
      
      // Fetch ALL enabled heroes and user data to check total unowned count for packs
      const allHeroesResponse = await fetch(`${config.API_BASE_URL}/api/heroes`);
      const allHeroesData = await allHeroesResponse.json();
      
      const userResponse = await fetch(`${config.API_BASE_URL}/api/user/${userId}`);
      const userData = await userResponse.json();
      
      if (rotationData.success) {
        // Store all rotation heroes
        const rotationHeroes = rotationData.heroes;
        
        // Mark heroes that are already owned as purchased
        const ownedHeroNames = new Set<string>(rotationHeroes.filter((h: any) => h.owned).map((h: any) => h.name as string));
        setPurchasedHeroes(ownedHeroNames);
        
        // Set sale heroes (all 6 from rotation)
        setSaleHeroes(rotationHeroes);
        
        // Track ALL unowned enabled heroes for pack purchases
        if (allHeroesData && userData.success) {
          const enabledHeroes = Array.isArray(allHeroesData) ? allHeroesData : allHeroesData.heroes || [];
          const userOwnedHeroes = userData.user.available_heroes || [];
          const allUnowned = enabledHeroes.filter((h: any) => !userOwnedHeroes.includes(h.name));
          setUnownedHeroes(allUnowned);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching shop rotation:', error);
      setLoading(false);
    }
  };

  const handlePurchaseHero = async (heroName: string) => {
    if (purchasing || victoryPoints < 5) return;

    setPurchasing(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/shop/purchase-hero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, heroName })
      });

      const data = await response.json();
      
      if (data.success) {
        // Mark hero as purchased in current session
        setPurchasedHeroes(prev => new Set(prev).add(heroName));
        setSelectedHero(null);
        console.log(`✅ Hero purchased: ${data.heroCount} total heroes`);
        onPurchaseComplete(); // Refresh user data
      } else {
        setMessage({ text: `❌ ${data.message}`, type: 'error' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error purchasing hero:', error);
      setMessage({ text: '❌ Purchase failed. Please try again.', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchasePack = async () => {
    if (purchasing || victoryPoints < 12 || unownedHeroes.length === 0) return;

    setPurchasing(true);
    
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/shop/purchase-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();
      
      if (data.success) {
        const heroesReceived = data.heroesReceived || [];
        
        // Mark received heroes as purchased in the shop
        setPurchasedHeroes(prev => {
          const newSet = new Set(prev);
          heroesReceived.forEach((name: string) => newSet.add(name));
          return newSet;
        });
        
        // Fetch full hero data for animation
        const allHeroesResponse = await fetch(`${config.API_BASE_URL}/api/heroes`);
        const allHeroes: Hero[] = await allHeroesResponse.json();
        
        // Get full hero objects for animation from all heroes
        const heroObjects = heroesReceived
          .map((heroName: string) => allHeroes.find(h => h.name === heroName))
          .filter((h: Hero | undefined): h is Hero => h !== undefined);
        
        if (heroObjects.length > 0) {
          setPackHeroes(heroObjects);
          setPackOpening(true);
        }
        
        console.log(`✅ Pack purchased: ${data.heroCount} total heroes now`);
        
        // Remove purchased heroes from unowned list
        setUnownedHeroes(prev => prev.filter(h => !heroesReceived.includes(h.name)));
      } else {
        setMessage({ text: `❌ ${data.message}`, type: 'error' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error purchasing pack:', error);
      setMessage({ text: '❌ Pack purchase failed. Please try again.', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setPurchasing(false);
    }
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

  const handlePackAnimationComplete = () => {
    setPackOpening(false);
    setPackHeroes([]);
    onPurchaseComplete(); // Refresh user data
  };

  return (
    <>
      {/* Pack Opening Animation */}
      {packOpening && packHeroes.length > 0 && (
        <PackOpeningAnimation 
          heroes={packHeroes} 
          onComplete={handlePackAnimationComplete}
        />
      )}

      <div className="shop-overlay" onClick={onClose}>
      <div className="shop-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shop-header">
          <h2>🏪 Hero Shop</h2>
          <div className="shop-header-right">
            <div className="shop-vp-display">
              <span className="vp-icon">🏆</span>
              <span className="vp-amount">{victoryPoints} VP</span>
            </div>
            <button className="shop-close-btn" onClick={onClose}>✕</button>
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
              <h3>Hero Sale</h3>
              <div className="sale-timer">
                <span className="timer-icon">⏰</span>
                <span>Next sale: {timeUntilRefresh}</span>
              </div>
            </div>

            {saleHeroes.length === 0 ? (
              <div className="shop-empty">
                <div className="empty-icon">🎉</div>
                <h3>All Heroes Unlocked!</h3>
                <p>You own all available heroes in the game.</p>
              </div>
            ) : (
              <div className="shop-sale-container">
                {/* Left Arrow */}
                <button 
                  className="shop-pagination-arrow left"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                >
                  ←
                </button>

                {/* Heroes Grid */}
                <div className="shop-sale-grid">
                  {displayedHeroes.map((hero, index) => {
                    const isPurchased = purchasedHeroes.has(hero.name);
                    return (
                      <div key={index} className="shop-hero-wrapper">
                        <div className="shop-vp-badge">
                          <span>🏆 5</span>
                        </div>
                        
                        <div 
                          className={`shop-hero-card ${selectedHero?.name === hero.name ? 'selected' : ''} ${isPurchased ? 'purchased' : ''}`}
                          onClick={() => !isPurchased && setSelectedHero(selectedHero?.name === hero.name ? null : hero)}
                        >
                          <HeroCard 
                            hero={hero}
                            showFullInfo={false}
                            disableHPAnimations={true}
                          />
                          {isPurchased && (
                            <div className="shop-hero-purchased-overlay">
                              <span className="purchased-text">PURCHASED</span>
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
                          {isPurchased ? 'Purchased' : victoryPoints < 5 ? 'Not Enough VP' : 'Buy Hero'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Right Arrow */}
                <button 
                  className="shop-pagination-arrow right"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1}
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Hero Packs (25%) */}
          <div className="shop-pack-section">
            <div className="shop-section-header">
              <h3>Hero Packs</h3>
            </div>
            <p className="pack-description">Get 3 random heroes. Start your first adventure by collecting over 30 new heroes!</p>
            
            <div className="shop-hero-wrapper pack-wrapper">
              <div className="shop-vp-badge pack-vp-badge">
                <span>🏆 12</span>
              </div>
              
              <div className="shop-hero-card pack-card-display">
                <img 
                  src="pack1.png"
                  alt="Hero Pack"
                  className="pack-image"
                />
                <div className="pack-title-overlay">Adventure Pack</div>
              </div>
              
              <button 
                className="shop-buy-btn pack-buy-btn"
                onClick={handlePurchasePack}
                disabled={purchasing || victoryPoints < 12 || unownedHeroes.length === 0}
              >
                {unownedHeroes.length === 0 ? 'All Heroes Owned!' : 
                 victoryPoints < 12 ? 'Not Enough VP' : 'Buy Pack'}
              </button>
              
              <button 
                className="shop-buy-btn pack-info-btn"
                onClick={handleShowPackContents}
              >
                See What's Inside
              </button>
            </div>
          </div>
        </div>

        {/* Selected Hero Details */}
        {selectedHero && (
          <div className="shop-hero-details">
            <h3>{selectedHero.name}</h3>
            <div className="hero-details-content">
              <HeroCard 
                hero={selectedHero}
                showFullInfo={true}
                disableHPAnimations={true}
              />
            </div>
          </div>
        )}

        {/* Pack Contents Modal */}
        {showPackContents && (
          <div className="pack-contents-modal" onClick={() => setShowPackContents(false)}>
            <div className="pack-contents-container" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn" onClick={() => setShowPackContents(false)}>✕</button>
              <h2 className="pack-contents-title">Adventure Pack Contents</h2>
              <p className="pack-contents-subtitle">{packContentHeroes.length} Heroes Available</p>
              
              <div className="pack-contents-grid">
                {displayedPackContents.map((hero) => {
                  const isOwned = availableHeroes.includes(hero.name);
                  return (
                  <div key={hero.name} className="shop-hero-wrapper pack-content-hero">
                    <div className={`shop-hero-card ${isOwned ? 'purchased' : ''}`} onClick={() => !isOwned && setSelectedHero(hero)}>
                      <HeroCard hero={hero} showFullInfo={false} disableHPAnimations={true} />
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
              
              {totalPackContentsPages > 1 && (
                <div className="pack-contents-pagination">
                  <button 
                    className="pagination-arrow"
                    onClick={() => setPackContentsPage(prev => Math.max(0, prev - 1))}
                    disabled={packContentsPage === 0}
                  >
                    ←
                  </button>
                  <span className="pagination-info">
                    Page {packContentsPage + 1} of {totalPackContentsPages}
                  </span>
                  <button 
                    className="pagination-arrow"
                    onClick={() => setPackContentsPage(prev => Math.min(totalPackContentsPages - 1, prev + 1))}
                    disabled={packContentsPage === totalPackContentsPages - 1}
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
