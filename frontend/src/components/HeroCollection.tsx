import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../styles/HeroCollection.css';

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
type FilterOption = 'available' | 'all' | 'favorites';

// Memoized HeroCard component to prevent unnecessary re-renders
const HeroCard = React.memo<{
  hero: Hero;
  actualIndex: number;
  isSelected: boolean;
  isFavorite: boolean;
  onClick: (index: number) => void;
}>(({ hero, actualIndex, isSelected, isFavorite, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(actualIndex);
  }, [actualIndex, onClick]);

  return (
    <div 
      className={`hero-card selectable collection-card ${isSelected ? 'enlarged' : ''} ${hero.disabled ? 'disabled-hero' : ''}`}
      onClick={handleClick}
    >
      {isFavorite && (
        <div className="favorite-star">⭐</div>
      )}
      <img 
        src={`http://localhost:3001/hero-images/${hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
        alt={hero.name}
        className="hero-image"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }}
      />
      
      <div className="hero-card-content">
        <div className="hero-stats">
          <div className="hero-name">
            {hero.name}
            {hero.disabled && <span className="disabled-badge">Not Available</span>}
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">❤️</span>
            <span>HP: {hero.HP}</span>
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">🛡️</span>
            <span>Defense: {hero.Defense}</span>
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">🎯</span>
            <span>Accuracy: {hero.Accuracy}</span>
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">⚔️</span>
            <span>Attack: {hero.BasicAttack}</span>
          </div>
        </div>
      </div>
    </div>
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
  
  const HEROES_PER_PAGE = 14; // 2 rows of 7 heroes each

  useEffect(() => {
    fetchHeroes();
    if (userId) {
      fetchFavoriteHeroes();
    }
  }, [filterOption, userId]); // Refetch when filter changes or userId changes

  useEffect(() => {
    if (heroes.length > 0) {
      let filtered = heroes;
      
      // Apply favorites filter if selected
      if (filterOption === 'favorites') {
        filtered = heroes.filter(hero => favoriteHeroes.includes(hero.name));
      }
      
      const sorted = sortHeroes(filtered, sortOption);
      setSortedHeroes(sorted);
      setCurrentPage(0); // Reset to first page when sorting or filtering changes
    }
  }, [heroes, sortOption, filterOption, favoriteHeroes]);

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
      console.log('Attempting to fetch heroes from:', 'http://localhost:3001/api/heroes');
      
      // Build URL with parameters for authenticated users in collection view
      let url = 'http://localhost:3001/api/heroes';
      const params = new URLSearchParams();
      
      if (userId) {
        params.append('userId', userId.toString());
        if (filterOption === 'all') {
          params.append('showAll', 'true');
        }
      } else {
        // For non-authenticated users, show all enabled heroes
        params.append('showAll', 'false');
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
      console.log('Fetched data:', data);
      console.log('Total heroes received:', data.length);
      
      // If showing all heroes (collection view), keep all; otherwise filter enabled
      let filteredHeroes = data;
      if (filterOption === 'available') {
        filteredHeroes = data.filter((hero: Hero) => !hero.disabled);
      }
      console.log('Filtered heroes:', filteredHeroes.length);
      
      setHeroes(filteredHeroes);
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
      const response = await fetch(`http://localhost:3001/api/favorite-heroes/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setFavoriteHeroes(data.favoriteHeroes || []);
      }
    } catch (error) {
      console.error('Error fetching favorite heroes:', error);
    }
  };

  const toggleFavoriteHero = async (heroName: string) => {
    if (!userId) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/toggle-favorite-hero', {
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
    Math.ceil(sortedHeroes.length / HEROES_PER_PAGE), 
    [sortedHeroes.length]
  );
  
  const getCurrentPageHeroes = useMemo(() => {
    const startIndex = currentPage * HEROES_PER_PAGE;
    const endIndex = startIndex + HEROES_PER_PAGE;
    return sortedHeroes.slice(startIndex, endIndex);
  }, [sortedHeroes, currentPage]);

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
            <button className="close-btn" onClick={onClose}>×</button>
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
                <option value="available">Available Heroes</option>
                <option value="all">All Heroes</option>
                {userId && <option value="favorites">Favorite Heroes</option>}
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
          </div>
          <div className="victory-points">
            <span className="trophy-icon">🏆</span>
            <span className="points-text">Victory Points: {victoryPoints}</span>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
      </div>
      
      {selectedHeroIndex !== null && (
        <div className="selection-overlay" onClick={() => setSelectedHeroIndex(null)}></div>
      )}

      {selectedHeroIndex !== null && (
        <div className="hero-details-panel">
          <h3>{sortedHeroes[selectedHeroIndex].name}</h3>
          
          <div className="ability-section">
            <h4>Abilities</h4>
            {sortedHeroes[selectedHeroIndex].Ability.map((ability, index) => (
              <div key={index} className="ability-item">
                <div className="ability-name">{ability.name}</div>
                <div className="ability-description">{ability.description}</div>
              </div>
            ))}
          </div>

          <div className="special-section">
            <h4>Special</h4>
            {Array.isArray(sortedHeroes[selectedHeroIndex].Special) ? (
              (sortedHeroes[selectedHeroIndex].Special as HeroSpecial[]).map((special, index) => (
                <div key={index} className="special-item">
                  <div className="special-name">{special.name}</div>
                  <div className="special-description">{special.description}</div>
                </div>
              ))
            ) : (
              <div className="special-item">
                <div className="special-name">
                  {(sortedHeroes[selectedHeroIndex].Special as HeroSpecial)?.name || 'No Special'}
                </div>
                <div className="special-description">
                  {(sortedHeroes[selectedHeroIndex].Special as HeroSpecial)?.description || 'No description available'}
                </div>
              </div>
            )}
          </div>
          
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
          <div className={`collection-grid ${isTransitioning ? 'transitioning' : ''}`}>
            {getCurrentPageHeroes.map((hero: Hero, index: number) => {
              const actualIndex = currentPage * HEROES_PER_PAGE + index;
              return (
                <HeroCard
                  key={hero.name} // Use hero name as key since it's unique and stable
                  hero={hero}
                  actualIndex={actualIndex}
                  isSelected={selectedHeroIndex === actualIndex}
                  isFavorite={favoriteHeroes.includes(hero.name)}
                  onClick={handleHeroClick}
                />
              );
            })}
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
                {currentPage + 1} / {getTotalPages}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroCollection;