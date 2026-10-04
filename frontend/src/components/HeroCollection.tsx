import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../styles/HeroCollection.css';
import CloseButton from './CloseButton';
import config from '../config';
import SharedHeroCard from './HeroCard';
import useCardGrid from '../hooks/useCardGrid';
import '../styles/ResponsiveCardGrid.css';

interface HeroAbility {
  name: string;
  description: string;
  category?: string;
  target_type?: string;
}

interface HeroSpecial {
  name: string;
  description: string;
  category?: string;
  trigger?: string;
}

interface Hero {
  name: string;
  HP: number;
  Defense: number;
  Accuracy: string;
  BasicAttack: string;
  Ability: HeroAbility[];
  Special: HeroSpecial | HeroSpecial[];
  disabled?: boolean;
}

interface HeroCollectionProps {
  onClose: () => void;
  userId?: number; // Optional user ID for authenticated users
  victoryPoints?: number; // Victory points to display
  onFavoritesChange?: (favoriteHeroes: string[]) => void; // Callback when favorites change
}

type SortOption = 'alphabetical' | 'hp' | 'ac' | 'accuracy' | 'damage';
type FilterOption = 'available' | 'not-owned' | 'all' | 'favorites' | 'disabled';

// Memoized HeroCard component to prevent unnecessary re-renders
const HeroCard = React.memo<{
  hero: Hero;
  actualIndex: number;
  isSelected: boolean;
  isFavorite: boolean;
  isOwned: boolean;
  onClick: (index: number) => void;
}>(({ hero, actualIndex, isSelected, isFavorite, isOwned, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(actualIndex);
  }, [actualIndex, onClick]);

  return (
    <SharedHeroCard
      hero={hero}
      className={`collection-card ${!isOwned || hero.disabled ? 'disabled-hero' : ''}`}
      isSelectable
      isSelected={isSelected}
      showFullInfo={false}
      disableHPAnimations
      onClick={handleClick}
    >
      {isFavorite && (
        <div className="favorite-star">⭐</div>
      )}
    </SharedHeroCard>
  );
});

HeroCard.displayName = 'HeroCard';

const HeroCollection: React.FC<HeroCollectionProps> = ({ onClose, userId, victoryPoints = 0, onFavoritesChange }) => {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [sortedHeroes, setSortedHeroes] = useState<Hero[]>([]);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState<SortOption>('alphabetical');
  const [filterOption, setFilterOption] = useState<FilterOption>('available');
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [favoriteHeroes, setFavoriteHeroes] = useState<string[]>([]);
  const [availableHeroes, setAvailableHeroes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const cardGrid = useCardGrid({ singleRowOnPhone: true });
  const heroesPerPage = cardGrid.pageSize;

  useEffect(() => {
    setCurrentPage(0);
  }, [heroesPerPage]);

  useEffect(() => {
    fetchHeroes();
    if (userId) {
      fetchFavoriteHeroes();
      fetchAvailableHeroes();
    }
  }, [filterOption, userId]); // Refetch when filter changes or userId changes

  useEffect(() => {
    if (heroes.length > 0) {
      let filtered = heroes;
      
      // Apply filter based on selection
      if (filterOption === 'available') {
        // Show only owned and enabled heroes
        filtered = heroes.filter(hero => 
          availableHeroes.includes(hero.name) && !hero.disabled
        );
      } else if (filterOption === 'not-owned') {
        // Show only enabled heroes not owned
        filtered = heroes.filter(hero => 
          !availableHeroes.includes(hero.name) && !hero.disabled
        );
      } else if (filterOption === 'disabled') {
        // Show only disabled heroes
        filtered = heroes.filter(hero => hero.disabled);
      } else if (filterOption === 'all') {
        // Show all heroes (owned and not owned, enabled and disabled)
        filtered = heroes;
      } else if (filterOption === 'favorites') {
        // Show only favorite heroes
        filtered = heroes.filter(hero => favoriteHeroes.includes(hero.name));
      }
      
      // Apply search filter
      if (searchQuery.trim() !== '') {
        filtered = filtered.filter(hero => 
          hero.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      
      const sorted = sortHeroes(filtered, sortOption);
      setSortedHeroes(sorted);
    }
  }, [heroes, sortOption, filterOption, favoriteHeroes, availableHeroes, searchQuery]);

  // Separate effect to reset page only when sort, filter, or search changes
  useEffect(() => {
    setCurrentPage(0);
    setSelectedHeroIndex(null);
  }, [sortOption, filterOption, searchQuery]);

  useEffect(() => {
    if (selectedHeroIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedHeroIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHeroIndex]);

  const parseAttackValue = useCallback((attack: string): number => {
    // Extract numeric value from attack string (e.g., "1D6" -> 6, "2D4" -> 8)
    const match = attack.match(/(\d+)D(\d+)/);
    if (match) {
      const numDice = parseInt(match[1]);
      const diceSize = parseInt(match[2]);
      return numDice * diceSize; // Use max possible damage for comparison
    }
    return 0;
  }, []);

  const parseAccuracyValue = useCallback((accuracy: string): number => {
    // Extract numeric value from accuracy string (e.g., "+2" -> 2, "+1" -> 1)
    const match = accuracy.match(/[+-](\d+)/);
    return match ? parseInt(match[1]) : 0;
  }, []);

  const sortHeroes = useCallback((heroList: Hero[], option: SortOption): Hero[] => {
    const sorted = [...heroList];
    
    switch (option) {
      case 'alphabetical':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'hp':
        return sorted.sort((a, b) => b.HP - a.HP);
      case 'ac':
        return sorted.sort((a, b) => b.Defense - a.Defense);
      case 'accuracy':
        return sorted.sort((a, b) => parseAccuracyValue(b.Accuracy) - parseAccuracyValue(a.Accuracy));
      case 'damage':
        return sorted.sort((a, b) => parseAttackValue(b.BasicAttack) - parseAttackValue(a.BasicAttack));
      default:
        return sorted;
    }
  }, [parseAccuracyValue, parseAttackValue]);

  const fetchHeroes = async () => {
    try {
      console.log('Attempting to fetch heroes from:', config.API_BASE_URL);
      
      // Always fetch all heroes, then filter based on filterOption
      let url = `${config.API_BASE_URL}/api/heroes`;
      const params = new URLSearchParams();
      
      if (userId) {
        params.append('userId', userId.toString());
        // Request all heroes to properly filter
        params.append('showAll', 'true');
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Fetched heroes data:', data);
      console.log('Total heroes received:', data.length);
      
      setHeroes(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching heroes from API, using fallback data:', error);
      
      // Fallback heroes data if API fails
      const fallbackHeroes = [
        {
          name: "Barbarian",
          HP: 25,
          Defense: 8,
          Accuracy: "+1",
          BasicAttack: "2d6+2",
          Ability: [{ 
            name: "Rage", 
            description: "Increase damage for 3 turns", 
            effects: [{ type: "damage_boost", value: 5, duration: 3 }]
          }],
          Special: [{ 
            name: "Berserker", 
            description: "Continue fighting when low HP", 
            effects: [{ type: "survival", trigger: "low_hp" }]
          }]
        },
        {
          name: "Wizard",
          HP: 15,
          Defense: 6,
          Accuracy: "+0",
          BasicAttack: "1d6",
          Ability: [{ 
            name: "Fireball", 
            description: "Area damage spell", 
            effects: [{ type: "area_damage", value: "2d6" }]
          }],
          Special: [{ 
            name: "Arcane Power", 
            description: "Bonus spell damage", 
            effects: [{ type: "spell_boost", value: 3 }]
          }]
        },
        {
          name: "Rogue",
          HP: 18,
          Defense: 7,
          Accuracy: "+2",
          BasicAttack: "1d6+3",
          Ability: [{ 
            name: "Sneak Attack", 
            description: "High damage from stealth", 
            effects: [{ type: "sneak_damage", value: "3d6" }]
          }],
          Special: [{ 
            name: "Evasion", 
            description: "Avoid some attacks", 
            effects: [{ type: "dodge_chance", value: 25 }]
          }]
        }
      ];
      
      console.log('Using fallback heroes for collection:', fallbackHeroes.length);
      setHeroes(fallbackHeroes);
      setLoading(false);
    }
  };

  const fetchFavoriteHeroes = async () => {
    if (!userId) return;
    
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/favorite-heroes/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setFavoriteHeroes(data.favoriteHeroes || []);
      }
    } catch (error) {
      console.error('Error fetching favorite heroes:', error);
    }
  };

  const fetchAvailableHeroes = async () => {
    if (!userId) return;
    
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/user/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setAvailableHeroes(data.user.available_heroes || []);
        }
      }
    } catch (error) {
      console.error('Error fetching available heroes:', error);
    }
  };

  const toggleFavoriteHero = async (heroName: string) => {
    if (!userId) return;
    
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/toggle-favorite-hero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, heroName }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setFavoriteHeroes(data.favoriteHeroes || []);
        
        // Notify parent component of the change
        if (onFavoritesChange) {
          onFavoritesChange(data.favoriteHeroes || []);
        }
      }
    } catch (error) {
      console.error('Error toggling favorite hero:', error);
    }
  };

  const handleHeroClick = useCallback((heroIndex: number) => {
    if (selectedHeroIndex === heroIndex) {
      setSelectedHeroIndex(null); // Deselect if already selected
    } else {
      setSelectedHeroIndex(heroIndex);
    }
  }, [selectedHeroIndex]);

  // Memoized pagination helper functions
  const getTotalPages = useMemo(() => 
    Math.ceil(sortedHeroes.length / heroesPerPage),
    [sortedHeroes.length, heroesPerPage]
  );
  const visiblePage = Math.min(currentPage, Math.max(0, getTotalPages - 1));
  
  const getCurrentPageHeroes = useMemo(() => {
    const startIndex = visiblePage * heroesPerPage;
    const endIndex = startIndex + heroesPerPage;
    return sortedHeroes.slice(startIndex, endIndex);
  }, [sortedHeroes, visiblePage, heroesPerPage]);

  const handleNextPage = useCallback(() => {
    if (isTransitioning) return; // Prevent rapid clicking
    
    setIsTransitioning(true);
    setSelectedHeroIndex(null); // Clear selection when changing pages
    
    setTimeout(() => {
      setCurrentPage((prev) => (prev + 1) % getTotalPages);
      
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50); // Small delay to ensure page change happens before fade in
    }, 200); // Fade out duration
  }, [isTransitioning, getTotalPages]);

  const handlePrevPage = useCallback(() => {
    if (isTransitioning) return; // Prevent rapid clicking
    
    setIsTransitioning(true);
    setSelectedHeroIndex(null); // Clear selection when changing pages
    
    setTimeout(() => {
      setCurrentPage((prev) => (prev - 1 + getTotalPages) % getTotalPages);
      
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50); // Small delay to ensure page change happens before fade in
    }, 200); // Fade out duration
  }, [isTransitioning, getTotalPages]);

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterOption(e.target.value as FilterOption);
  }, []);

  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOption(e.target.value as SortOption);
  }, []);



  if (loading) {
    return (
      <div className="collection-fullscreen">
        <div className="collection-header">
          <h2>Hero Collection</h2>
          <div className="header-right">
            <div className="victory-points">
              <span className="trophy-icon">🏆</span>
              <span className="points-text">Victory Points: {victoryPoints}</span>
            </div>
            <CloseButton onClick={onClose} />
          </div>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading heroes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="collection-fullscreen">
      <div className="collection-header">
        <h2>Hero Collection</h2>
        <div className="header-controls">
          <div className="filter-controls">
            <div className="control-group">
              <label htmlFor="filter-select">Show:</label>
              <select 
                id="filter-select"
                value={filterOption} 
                onChange={handleFilterChange}
                className="filter-dropdown"
              >
                <option value="available">Owned Heroes</option>
                <option value="not-owned">Not Owned</option>
                <option value="all">All Heroes</option>
                {userId && <option value="favorites">Favorite Heroes</option>}
                <option value="disabled">Disabled Heroes</option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="sort-select">Sort by:</label>
              <select 
                id="sort-select"
                value={sortOption} 
                onChange={handleSortChange}
                className="sort-dropdown"
              >
                <option value="alphabetical">Alphabetical</option>
                <option value="hp">Most HP</option>
                <option value="ac">Most AC</option>
                <option value="accuracy">Most Accuracy</option>
                <option value="damage">Highest Damage</option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="search-input">Search:</label>
              <input
                id="search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hero name..."
                className="search-input"
              />
            </div>
          </div>
          <div className="victory-points">
            <span className="trophy-icon">🏆</span>
            <span className="points-text">Victory Points: {victoryPoints}</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>
      </div>
      
      {selectedHeroIndex !== null && (
        <div className="selection-overlay" onClick={() => setSelectedHeroIndex(null)}></div>
      )}

      {selectedHeroIndex !== null && sortedHeroes[selectedHeroIndex] && (
        <div className="collection-card-preview" role="dialog" aria-modal="true" aria-label={sortedHeroes[selectedHeroIndex].name}>
          <CloseButton onClick={() => setSelectedHeroIndex(null)} />
          <SharedHeroCard hero={sortedHeroes[selectedHeroIndex]} showFullInfo={false} disableHPAnimations />
          {userId && (
            <div className="favorite-button-container">
              <button 
                className={`favorite-button ${favoriteHeroes.includes(sortedHeroes[selectedHeroIndex].name) ? 'favorited' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteHero(sortedHeroes[selectedHeroIndex].name);
                }}
              >
                {favoriteHeroes.includes(sortedHeroes[selectedHeroIndex].name) ? '⭐ Remove from Favorites' : '☆ Add to Favorites'}
              </button>
            </div>
          )}
        </div>
      )}
      
      <div className="collection-content">
        <div className="collection-grid-container">
          <div className="responsive-card-viewport" ref={cardGrid.ref} style={cardGrid.style}>
          <div className={`collection-grid responsive-card-grid ${isTransitioning ? 'transitioning' : ''}`}>
            {getCurrentPageHeroes.map((hero: Hero, index: number) => {
              const actualIndex = visiblePage * heroesPerPage + index;
              return (
                <HeroCard
                  key={hero.name} // Use hero name as key since it's unique and stable
                  hero={hero}
                  actualIndex={actualIndex}
                  isSelected={selectedHeroIndex === actualIndex}
                  isFavorite={favoriteHeroes.includes(hero.name)}
                  isOwned={availableHeroes.includes(hero.name)}
                  onClick={handleHeroClick}
                />
              );
            })}
          </div>
          </div>
          
          {getTotalPages > 1 && (
            <>
              <button 
                className={`pagination-arrow-overlay left-arrow ${isTransitioning ? 'disabled' : ''}`}
                onClick={handlePrevPage}
                disabled={isTransitioning}
                title="Previous page"
              >
                ‹
              </button>
              <button 
                className={`pagination-arrow-overlay right-arrow ${isTransitioning ? 'disabled' : ''}`}
                onClick={handleNextPage}
                disabled={isTransitioning}
                title="Next page"
              >
                ›
              </button>
              <div className="page-indicator-overlay">
                {visiblePage + 1} / {getTotalPages}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroCollection;
