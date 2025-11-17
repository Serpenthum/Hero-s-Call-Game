import React, { useState, useEffect } from 'react';
import '../styles/SurvivalTeamBuilder.css';
import config from '../config';

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

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
  favorite_heroes: string[];
}

interface SurvivalTeamBuilderProps {
  usedHeroes: string[];
  onTeamSelected: (team: Hero[]) => void;
  currentTeam: Hero[];
  onCancelSearch?: () => void;
  isSearching?: boolean;
  user?: User;
}

const SurvivalTeamBuilder: React.FC<SurvivalTeamBuilderProps> = ({ 
  usedHeroes, 
  onTeamSelected, 
  currentTeam,
  onCancelSearch,
  isSearching = false,
  user
}) => {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [availableHeroes, setAvailableHeroes] = useState<Hero[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Hero[]>(currentTeam);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hoveredHero, setHoveredHero] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'alphabetical' | 'hp' | 'ac' | 'accuracy' | 'damage'>('alphabetical');
  const [isSearchingForMatch, setIsSearchingForMatch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync with external searching state
  useEffect(() => {
    setIsSearchingForMatch(isSearching);
  }, [isSearching]);

  // Track the team composition when search starts
  const [searchStartTeam, setSearchStartTeam] = useState<Hero[]>([]);

  // Cancel search if team composition changes during active search
  useEffect(() => {
    if (isSearchingForMatch && searchStartTeam.length > 0) {
      // Check if current team is different from the team when search started
      const currentTeamNames = selectedTeam.map(h => h.name).sort();
      const startTeamNames = searchStartTeam.map(h => h.name).sort();
      
      const teamChanged = currentTeamNames.length !== startTeamNames.length || 
                         currentTeamNames.some((name, index) => name !== startTeamNames[index]);
      
      if (teamChanged) {
        console.log('🔄 Team composition changed during search, cancelling current search');
        console.log('Original team:', startTeamNames);
        console.log('New team:', currentTeamNames);
        
        // Cancel the current search
        handleCancelSearch();
        setSearchStartTeam([]); // Clear the search start team
      }
    }
  }, [selectedTeam, isSearchingForMatch, searchStartTeam]);

  const HEROES_PER_PAGE = 6; // 3 heroes per row, 2 rows
  const TEAM_SIZE = 3;

  const KEYWORD_TOOLTIPS: { [key: string]: string } = {
    poison: "A hero who is poisoned takes damage equal to their poison stacks at the end of each turn.",
    taunt: "Forces an enemy hero to attack the hero who taunted it instead of their intended target.",
    inspiration: "When rolling an attack or ability, can give it advantage by expending the inspiration.",
    silence: "Cannot use abilities while silenced.",
    disable_attack: "Cannot make basic attacks while stunned.",
    untargetable: "Cannot be targeted by attacks or abilities.",
    advantage: "Roll twice and take the higher result."
  };

  const renderKeywordWithTooltip = (text: string) => {
    const words = text.split(' ');
    return words.map((word, index) => {
      const cleanWord = word.replace(/[.,;:!?]/g, '').toLowerCase();
      const tooltip = KEYWORD_TOOLTIPS[cleanWord];
      
      if (tooltip) {
        return (
          <span key={index} className={`keyword ${cleanWord}`}>
            <span className="tooltip">
              {word}
              <span className="tooltiptext">{tooltip}</span>
            </span>
          </span>
        );
      }
      return <span key={index}>{word}</span>;
    }).reduce((prev: React.ReactNode[], curr, index) => {
      if (index > 0) prev.push(' ');
      prev.push(curr);
      return prev;
    }, []);
  };

  useEffect(() => {
    fetchHeroes();
  }, [user]); // Refetch when user changes

  const parseAttackValue = (attack: string): number => {
    // Extract numeric value from attack string (e.g., "1D6" -> 6, "2D4" -> 8)
    const match = attack.match(/(\d+)D(\d+)/);
    if (match) {
      const numDice = parseInt(match[1]);
      const diceSize = parseInt(match[2]);
      return numDice * diceSize; // Use max possible damage for comparison
    }
    return 0;
  };

  const parseAccuracyValue = (accuracy: string): number => {
    // Extract numeric value from accuracy string (e.g., "+2" -> 2, "+1" -> 1)
    const match = accuracy.match(/[+-](\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const sortHeroes = (heroList: Hero[], option: typeof sortOption): Hero[] => {
    const sorted = [...heroList];
    const favoriteHeroes = user?.favorite_heroes || [];
    
    // First, separate favorites and non-favorites
    const favorites = sorted.filter(hero => favoriteHeroes.includes(hero.name));
    const nonFavorites = sorted.filter(hero => !favoriteHeroes.includes(hero.name));
    
    // Sort each group according to the selected option
    const sortFunction = (a: Hero, b: Hero) => {
      switch (option) {
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        case 'hp':
          return b.HP - a.HP;
        case 'ac':
          return b.Defense - a.Defense;
        case 'accuracy':
          return parseAccuracyValue(b.Accuracy) - parseAccuracyValue(a.Accuracy);
        case 'damage':
          return parseAttackValue(b.BasicAttack) - parseAttackValue(a.BasicAttack);
        default:
          return 0;
      }
    };
    
    favorites.sort(sortFunction);
    nonFavorites.sort(sortFunction);
    
    // Return favorites first, then non-favorites
    return [...favorites, ...nonFavorites];
  };

  useEffect(() => {
    if (heroes.length > 0) {
      // Filter out used heroes and disabled heroes
      let available = heroes.filter(hero => 
        !hero.disabled && !usedHeroes.includes(hero.name)
      );
      
      // Apply search filter
      if (searchQuery.trim() !== '') {
        available = available.filter(hero => 
          hero.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      
      console.log('Total heroes:', heroes.length);
      console.log('Used heroes:', usedHeroes);
      console.log('Available heroes:', available.length);
      // Sort according to selected option
      const sorted = sortHeroes(available, sortOption);
      setAvailableHeroes(sorted);
      setCurrentPage(0); // Reset to first page when heroes change
    }
  }, [heroes, usedHeroes, sortOption, searchQuery]);

  const fetchHeroes = async () => {
    try {
      // Build URL with user data for authenticated requests
      let url = `${config.API_BASE_URL}/api/heroes`;
      if (user) {
        url += `?userId=${user.id}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
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
        },
        {
          name: "Paladin",
          HP: 22,
          Defense: 9,
          Accuracy: "+1",
          BasicAttack: "1d8+3",
          Ability: [{ 
            name: "Divine Strike", 
            description: "Holy damage attack", 
            effects: [{ type: "holy_damage", value: "2d8" }]
          }],
          Special: [{ 
            name: "Divine Protection", 
            description: "Damage reduction", 
            effects: [{ type: "damage_reduction", value: 3 }]
          }]
        },
        {
          name: "Archer",
          HP: 16,
          Defense: 6,
          Accuracy: "+3",
          BasicAttack: "1d8+2",
          Ability: [{ 
            name: "Multi-Shot", 
            description: "Attack multiple enemies", 
            effects: [{ type: "multi_attack", value: 3 }]
          }],
          Special: [{ 
            name: "Eagle Eye", 
            description: "Increased accuracy", 
            effects: [{ type: "accuracy_boost", value: 2 }]
          }]
        }
      ];
      
      console.log('Using fallback heroes for survival:', fallbackHeroes.length);
      setHeroes(fallbackHeroes);
      setLoading(false);
    }
  };



  const getTotalPages = () => Math.ceil(availableHeroes.length / HEROES_PER_PAGE);
  
  const getCurrentPageHeroes = () => {
    const startIndex = currentPage * HEROES_PER_PAGE;
    const endIndex = startIndex + HEROES_PER_PAGE;
    return availableHeroes.slice(startIndex, endIndex);
  };

  const handleNextPage = () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    setTimeout(() => {
      const totalPages = getTotalPages();
      setCurrentPage((prev) => (prev + 1) % totalPages);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 200);
  };

  const handlePrevPage = () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    setTimeout(() => {
      const totalPages = getTotalPages();
      setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 200);
  };

  const handleHeroSelect = (hero: Hero) => {
    // Check if hero is already selected
    const isAlreadySelected = selectedTeam.find(h => h.name === hero.name);
    
    if (isAlreadySelected) {
      // Remove hero from team if already selected
      setSelectedTeam(selectedTeam.filter(h => h.name !== hero.name));
    } else if (selectedTeam.length < TEAM_SIZE) {
      // Add hero to team if not at max capacity
      setSelectedTeam([...selectedTeam, hero]);
    }
  };

  const handleHeroRemove = (heroToRemove: Hero) => {
    setSelectedTeam(selectedTeam.filter(hero => hero.name !== heroToRemove.name));
  };

  const handleStartBattle = () => {
    if (selectedTeam.length === TEAM_SIZE) {
      setSearchStartTeam([...selectedTeam]); // Record the team composition when search starts
      setIsSearchingForMatch(true);
      onTeamSelected(selectedTeam);
    }
  };

  const handleCancelSearch = () => {
    setIsSearchingForMatch(false);
    setSearchStartTeam([]); // Clear the search start team
    if (onCancelSearch) {
      onCancelSearch();
    }
  };

  const isHeroSelected = (hero: Hero) => {
    return selectedTeam.some(selected => selected.name === hero.name);
  };

  if (loading) {
    return (
      <div className="survival-team-builder">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading heroes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="survival-team-builder">
      <div className="survival-split-layout">
        {/* Left Side - Hero Browser */}
        <div className="hero-browser-side">
          {/* Hero Browser Header */}
          <div className="hero-browser-header">
            <div className="page-indicator">
              {getTotalPages() > 1 ? `Page ${currentPage + 1} of ${getTotalPages()}` : `${availableHeroes.length} Heroes`}
            </div>
            <div className="survival-header-controls">
              <div className="sort-controls">
                <label htmlFor="survival-sort-select">Sort by:</label>
                <select 
                  id="survival-sort-select"
                  value={sortOption} 
                  onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                  className="survival-sort-dropdown"
                >
                  <option value="alphabetical">Alphabetical</option>
                  <option value="hp">Most HP</option>
                  <option value="ac">Most AC</option>
                  <option value="accuracy">Most Accuracy</option>
                  <option value="damage">Highest Damage</option>
                </select>
              </div>
              <div className="search-controls">
                <label htmlFor="survival-search-input">Search:</label>
                <input
                  id="survival-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hero name..."
                  className="survival-search-input"
                />
              </div>
            </div>
          </div>

          {/* Available Heroes Grid */}
          <div className="available-heroes-section">
            {availableHeroes.length === 0 ? (
              <div className="no-heroes-available">
                <h3>No Heroes Available</h3>
                <p>You have used all available heroes in this survival run.</p>
              </div>
            ) : (
              <div className="heroes-grid-container">
                <div className={`heroes-grid ${isTransitioning ? 'transitioning' : ''}`}>
                  {getCurrentPageHeroes().map((hero) => (
                    <div 
                      key={hero.name} 
                      className={`hero-card survival-card ${isHeroSelected(hero) ? 'selected' : ''} ${hoveredHero === hero.name ? 'hovered' : ''}`}
                      onClick={() => handleHeroSelect(hero)}
                      onMouseEnter={() => setHoveredHero(hero.name)}
                      onMouseLeave={() => setHoveredHero(null)}
                    >
                      {user?.favorite_heroes?.includes(hero.name) && (
                        <div className="favorite-star">⭐</div>
                      )}
                      <img 
                        src={`${config.IMAGE_BASE_URL}/hero-images/${hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
                        alt={hero.name}
                        className="hero-image"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                        }}
                      />
                      
                      <div className="hero-card-content">
                        <div className="hero-stats">
                          <div className="hero-name">{hero.name}</div>
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

                      {isHeroSelected(hero) && (
                        <div className="selection-indicator">✓</div>
                      )}

                      {hoveredHero === hero.name && (
                        <div className="hero-tooltip">
                          <div className="tooltip-section">
                            <h4>Abilities</h4>
                            {hero.Ability.map((ability, index) => (
                              <div key={index} className="tooltip-ability">
                                <div className="tooltip-ability-name">{ability.name}</div>
                                <div className="tooltip-ability-description">{renderKeywordWithTooltip(ability.description)}</div>
                              </div>
                            ))}
                          </div>
                          
                          {hero.Special && (
                            <div className="tooltip-section">
                              <h4>Special</h4>
                              {Array.isArray(hero.Special) ? (
                                hero.Special.map((special, index) => (
                                  <div key={index} className="tooltip-special">
                                    <div className="tooltip-special-name">{special.name}</div>
                                    <div className="tooltip-special-description">{renderKeywordWithTooltip(special.description)}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="tooltip-special">
                                  <div className="tooltip-special-name">{(hero.Special as any).name || "Special Ability"}</div>
                                  <div className="tooltip-special-description">{renderKeywordWithTooltip((hero.Special as any).description || "Special ability details not available")}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {getTotalPages() > 1 && (
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
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Team Selection */}
        <div className="team-selection-side">
          <div className="team-selection-header">
            <h2>Select Your Team</h2>
            <p>Choose 3 heroes for your survival battle</p>
          </div>

          {/* Selected Team Display */}
          <div className="selected-team">
            {Array.from({ length: TEAM_SIZE }, (_, index) => (
              <div key={index} className="team-slot">
                {selectedTeam[index] ? (
                  <div className="selected-hero" onClick={() => handleHeroRemove(selectedTeam[index])}>
                    <img 
                      src={`${config.IMAGE_BASE_URL}/hero-images/${selectedTeam[index].name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
                      alt={selectedTeam[index].name}
                      className="selected-hero-image"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                      }}
                    />
                    <div className="selected-hero-name">{selectedTeam[index].name}</div>
                    <div className="remove-hero-hint">Click to remove</div>
                  </div>
                ) : (
                  <div className="empty-slot">
                    <div className="empty-slot-content">
                      <span className="slot-number">{index + 1}</span>
                      <span className="slot-hint">Select Hero</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Start Battle Button */}
          {selectedTeam.length === TEAM_SIZE && (
            <div className="start-battle-container">
              {!isSearchingForMatch ? (
                <button className="start-battle-btn" onClick={handleStartBattle}>
                  Start Battle with Selected Team
                </button>
              ) : (
                <div className="matchmaking-status">
                  <div className="waiting-message">
                    <h3>🔍 Searching for opponent...</h3>
                    <p>Please wait while we find you a worthy challenger!</p>
                    <div className="loading-dots">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </div>
                  </div>
                  <button className="cancel-search-btn" onClick={handleCancelSearch}>
                    Cancel Search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurvivalTeamBuilder;
