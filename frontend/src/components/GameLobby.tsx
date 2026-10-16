import React, { useState, useEffect } from 'react';
import HeroCollection from './HeroCollection';
import HeroCard from './HeroCard';
import ProfileModal from './ProfileModal';
import { ShopIcon, BinderIcon } from './LobbyIcons';
import Coin from './Coin';
import XPBar from './XPBar';
import Icon from './ui/Icon';
import Shop from './Shop';
import RequirementModal from './RequirementModal';
import HowToPlayModal from './HowToPlayModal';
import { Hero, GameState, Quest, PendingQuestReward } from '../types';
import { socketService } from '../socketService';
import { useQuestReveal } from '../useQuestReveal';
import QuestRewardModal from './QuestRewardModal';
import SettingsModal from './SettingsModal';
import config from '../config';
import useCardGrid from '../hooks/useCardGrid';
import '../styles/Lobby.css';

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
  favorite_heroes: string[];
  xp: number;
  level: number;
  best_gauntlet_trial: number;
  player_id?: string;
}

interface GameLobbyProps {
  onStartGame: (gameMode: 'draft' | 'random') => void;
  onStartSurvival: () => void;
  onStartGauntlet: () => void;
  onSpectateGame?: (gameId: string, spectatingPlayerId: string) => void;
  victoryPoints: number;
  user: User;
  onLogout: () => void;
  isSearching?: boolean;
  searchMode?: 'draft' | 'random' | null;
  onCancelSearch?: () => void;
  gameState?: GameState | null;
  onCollectionStateChange?: (isOpen: boolean) => void;
  onFavoritesChange?: (favoriteHeroes: string[]) => void;
  quests?: Quest[];
  pendingQuestReward?: PendingQuestReward | null;
  onClaimQuestReward?: () => void;
}

const RANKED_MODES = ['draft', 'survival'] as const;
type RankedMode = typeof RANKED_MODES[number];
const DRAFT_UNLOCK_LEVEL = 3;
const SURVIVAL_UNLOCK_HEROES = 21;
const RANKED_MODE_NAMES: Record<RankedMode, string> = { draft: 'Draft mode', survival: 'Survival mode' };

// Phase 5 turns this on once the Gauntlet backend fixes land.
const SHOW_GAUNTLET = true;

const GameLobby: React.FC<GameLobbyProps> = ({ onStartGame, onStartSurvival, onStartGauntlet, victoryPoints, user, onLogout, isSearching = false, searchMode = null, onCancelSearch, onCollectionStateChange, onFavoritesChange, quests = [], pendingQuestReward = null, onClaimQuestReward }) => {
  // Refresh on entering the lobby so a new UTC day resets the list.
  useEffect(() => {
    socketService.getQuests();
  }, []);

  const questReveal = useQuestReveal(
    pendingQuestReward,
    { xp: user.xp || 0, level: user.level || 1, vp: victoryPoints },
    onClaimQuestReward || (() => {})
  );
  const pendingQuestIds = new Set((pendingQuestReward?.completed || []).map(q => q.id));

  const [showCollection, setShowCollection] = useState(false);
  const previewGrid = useCardGrid({ fixedColumns: 1 });
  const [showShop, setShowShop] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [allHeroes, setAllHeroes] = useState<Hero[]>([]);
  const [profileIcon, setProfileIcon] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.API_BASE_URL}/api/player-stats/${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.success) setProfileIcon(data.stats.profile_icon);
      })
      .catch(err => console.error('Failed to load profile icon:', err));
    return () => { cancelled = true; };
  }, [user.id]);
  const [showRequirementModal, setShowRequirementModal] = useState(false);
  const [requirementModalData, setRequirementModalData] = useState({
    message: '',
    currentCount: 0,
    requiredCount: 0,
    type: 'heroes' as 'heroes' | 'level'
  });
  const [currentRandomHero, setCurrentRandomHero] = useState<Hero | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userRefreshTrigger, setUserRefreshTrigger] = useState(0);

  // Ranked modes stay hidden until unlocked; unlocking shows a notification and animates the mode in.
  // The level shown in the XP bar is used so the unlock lands with the level-up animation.
  const modeUnlocked: Record<RankedMode, boolean> = {
    draft: questReveal.display.level >= DRAFT_UNLOCK_LEVEL,
    survival: (user.available_heroes?.length || 0) >= SURVIVAL_UNLOCK_HEROES
  };
  const seenModesKey = `heroscall.seenModes.${user.id}`;
  const [revealedModes, setRevealedModes] = useState<RankedMode[]>(() => {
    try {
      const stored = localStorage.getItem(seenModesKey);
      if (stored) return JSON.parse(stored) as RankedMode[];
    } catch {
      // fall through to a silent first-time initialisation
    }
    // First visit with this feature: players who already unlocked modes keep them without a notification.
    const initial = RANKED_MODES.filter(m => modeUnlocked[m]);
    try { localStorage.setItem(seenModesKey, JSON.stringify(initial)); } catch { /* storage unavailable */ }
    return initial;
  });
  const [justUnlocked, setJustUnlocked] = useState<RankedMode[]>([]);
  const [unlockToast, setUnlockToast] = useState<RankedMode[] | null>(null);

  useEffect(() => {
    const fresh = RANKED_MODES.filter(m => modeUnlocked[m] && !revealedModes.includes(m));
    if (fresh.length === 0) return;
    setUnlockToast(fresh);
    // Let the notification land first, then add the mode to the lobby with its entrance animation.
    const timer = window.setTimeout(() => {
      const next = [...revealedModes, ...fresh];
      try { localStorage.setItem(seenModesKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
      setRevealedModes(next);
      setJustUnlocked(fresh);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeUnlocked.draft, modeUnlocked.survival, revealedModes]);

  useEffect(() => {
    if (justUnlocked.length === 0) return;
    const timer = window.setTimeout(() => setJustUnlocked([]), 2200);
    return () => window.clearTimeout(timer);
  }, [justUnlocked]);

  useEffect(() => {
    if (!unlockToast) return;
    const timer = window.setTimeout(() => setUnlockToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [unlockToast]);

  const draftVisible = revealedModes.includes('draft');
  const survivalVisible = revealedModes.includes('survival');
  const visibleRanked = RANKED_MODES.filter(m => revealedModes.includes(m));
  // Animate the whole section when it first appears, otherwise just the newly added mode.
  const rankedAnimates = visibleRanked.length > 0 && visibleRanked.every(m => justUnlocked.includes(m));
  const modeAnimates = (mode: RankedMode) => justUnlocked.includes(mode) && !rankedAnimates;

  const handleModeSelect = (mode: 'draft' | 'random') => {
    // Check if player meets level requirement for Draft mode
    if (mode === 'draft' && user.level < 3) {
      setRequirementModalData({
        message: 'You must reach level 3 to unlock Draft Mode.',
        currentCount: user.level,
        requiredCount: 3,
        type: 'level'
      });
      setShowRequirementModal(true);
      return;
    }
    
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartGame(mode);
  };

  const handleShowCollection = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setShowCollection(true);
    onCollectionStateChange?.(true);
  };

  const handleCloseCollection = () => {
    setShowCollection(false);
    onCollectionStateChange?.(false);
  };

  const handleShowShop = () => {
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setShowShop(true);
  };

  const handleCloseShop = () => {
    setShowShop(false);
  };

  const handlePurchaseComplete = async () => {
    // Fetch updated user data without reloading the page
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/user/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        // API returns { success: true, user: {...} }
        const userData = data.user || data;
        // Update the user object by merging with existing data
        Object.assign(user, {
          victory_points: userData.victory_points,
          available_heroes: userData.available_heroes
        });
        setUserRefreshTrigger(prev => prev + 1);
        console.log(`✅ User data updated: ${userData.available_heroes.length} heroes`);
      }
    } catch (error) {
      console.error('Error fetching updated user data:', error);
    }
  };

  const handleSurvivalClick = () => {
    // Check if player has enough heroes for Survival mode
    const ownedHeroCount = user.available_heroes?.length || 0;
    console.log(`🔍 Survival check: ${ownedHeroCount} heroes owned, need 21`);
    if (ownedHeroCount < 21) {
      setRequirementModalData({
        message: 'You need at least 21 heroes to play Survival Mode.',
        currentCount: ownedHeroCount,
        requiredCount: 21,
        type: 'heroes'
      });
      setShowRequirementModal(true);
      return;
    }
    
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartSurvival();
  };

  const handleGauntletClick = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartGauntlet();
  };

  // Fetch heroes and set up rotation
  useEffect(() => {
    const fetchHeroes = async () => {
      try {
        console.log('Fetching heroes from API...');
        const response = await fetch(`${config.API_BASE_URL}/api/heroes`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const heroes = await response.json();
        console.log('Heroes loaded successfully:', heroes.length, 'heroes');
        setAllHeroes(heroes);
        
        if (heroes.length > 0) {
          const randomHero = heroes[Math.floor(Math.random() * heroes.length)];
          console.log('Setting random hero:', randomHero.name);
          setCurrentRandomHero(randomHero);
        }
      } catch (error) {
        console.error('Failed to fetch heroes from API, using fallback data:', error);
        
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
              description: "Increase damage", 
              effects: [{ type: "damage_boost", value: 5 }]
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
        
        console.log('Using fallback heroes:', fallbackHeroes.length);
        setAllHeroes(fallbackHeroes);
        
        if (fallbackHeroes.length > 0) {
          const randomHero = fallbackHeroes[Math.floor(Math.random() * fallbackHeroes.length)];
          console.log('Setting fallback random hero:', randomHero.name);
          setCurrentRandomHero(randomHero);
        }
      }
    };

    fetchHeroes();
  }, []);

  // Set up hero rotation timer with smooth transition
  useEffect(() => {
    if (allHeroes.length === 0) return;

    const interval = setInterval(() => {
      // Start transition
      setIsTransitioning(true);
      
      // After fade out completes, change hero and fade back in
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * allHeroes.length);
        setCurrentRandomHero(allHeroes[randomIndex]);
        setIsTransitioning(false);
      }, 300); // Half of transition duration
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, [allHeroes]);

  const renderPlacard = ({ mode, title, text, icon, tag, extraClass = '', onActivate, playLabel }: {
    mode: 'random' | 'draft' | 'survival' | 'gauntlet';
    title: string;
    text: string;
    icon: 'dice' | 'swords' | 'flame' | 'tower';
    tag: 'Normal' | 'Ranked';
    extraClass?: string;
    onActivate: () => void;
    playLabel: string;
  }) => {
    const searching = isSearching && searchMode === mode;
    return (
      <div
        key={mode}
        className={`placard${searching ? ' placard--searching' : ''}${extraClass}`}
        onClick={searching ? undefined : onActivate}
      >
        <div className="placard-head">
          <Icon name={icon} size={28} className="placard-icon" />
          <h3 className="placard-title">{title}</h3>
          <span className="ui-badge">{tag}</span>
        </div>
        {searching ? (
          <p className="placard-text" role="status">
            Finding an opponent
            <span className="placard-dots" aria-hidden="true">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </span>
          </p>
        ) : (
          <p className="placard-text">{text}</p>
        )}
        {searching ? (
          <button className="ui-btn ui-btn--danger ui-btn--block" onClick={(e) => { e.stopPropagation(); onCancelSearch?.(); }}>
            Leave queue
          </button>
        ) : (
          <button className="ui-btn ui-btn--primary ui-btn--block">{playLabel}</button>
        )}
      </div>
    );
  };

  return (
    <div className="game-lobby-modern lobby">
      <header className="lobby-bar">
        <h1 className="lobby-title">Hero's Call</h1>
        <div className="lobby-status">
          <div className="ui-pill lobby-coins">
            <Coin />
            <span className={`lobby-coins-amount${questReveal.counting ? ' vp-bump' : ''}`}>{questReveal.display.vp}</span>
          </div>
          <div className="lobby-level">
            <span className="lobby-level-text">Level {questReveal.display.level || 1}</span>
            <XPBar
              currentXP={questReveal.display.xp || 0}
              level={questReveal.display.level || 1}
              animated={false}
              leveledUp={questReveal.levelFlash}
            />
          </div>
          <button className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onLogout}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </header>

      <main className="lobby-main">
        <aside className="lobby-ledger ui-panel">
          <div className="lobby-player">
            <h2>{user.username}</h2>
            <button
              className="profile-avatar-btn"
              onClick={() => setShowProfileModal(true)}
              aria-label="Open profile"
              title="Profile"
            >
              {profileIcon && (
                <img
                  src={`${config.IMAGE_BASE_URL}/hero-images/${profileIcon.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`}
                  alt={profileIcon}
                />
              )}
            </button>
          </div>
          <h3 className="lobby-section-title">Quests</h3>
          {quests.length === 0 ? (
            <p className="lobby-empty">No quests today. New ones arrive at midnight UTC.</p>
          ) : (
            <ul className="lobby-quests">
              {quests.map(quest => {
                // Pending quests stay unchecked until the reveal starts.
                const revealed = !pendingQuestIds.has(quest.id) || questReveal.stage !== 'idle';
                const isDone = quest.completed && revealed;
                const justRevealed = pendingQuestIds.has(quest.id) && revealed;
                const shownProgress = quest.completed && !revealed ? quest.target - 1 : quest.progress;
                return (
                  <li key={quest.id} className={`lobby-quest${isDone ? ' completed' : ''}${justRevealed ? ' just-completed' : ''}`}>
                    <span className="lobby-quest-text">{quest.text}</span>
                    <span className="lobby-quest-progress">
                      {isDone ? <Icon name="check" title="Done" /> : `${shownProgress}/${quest.target}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="lobby-tiles">
            <button className="lobby-tile shop-tile" onClick={handleShowShop}>
              <ShopIcon className="lobby-tile-icon" />
              <span>Shop</span>
            </button>
            <button className="lobby-tile binder-tile" data-tutorial="collection" onClick={handleShowCollection}>
              <BinderIcon className="lobby-tile-icon" />
              <span>Binder</span>
            </button>
          </div>
        </aside>

        <section className="lobby-table">
          <div className="lobby-stage">
            <div className="lobby-hero-viewport" ref={previewGrid.ref} style={previewGrid.style}>
              {currentRandomHero && (
                <div className={`random-hero-card ${isTransitioning ? 'transitioning' : ''}`}>
                  <HeroCard
                    hero={{
                      name: currentRandomHero.name,
                      HP: currentRandomHero.HP,
                      Defense: currentRandomHero.Defense,
                      Accuracy: currentRandomHero.Accuracy,
                      BasicAttack: currentRandomHero.BasicAttack,
                      Ability: currentRandomHero.Ability,
                      Special: currentRandomHero.Special
                      // Only include base hero properties, no runtime modifications
                    }}
                    showFullInfo={false}
                    disableHPAnimations={true}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="lobby-placards">
            {renderPlacard({ mode: 'random', title: 'Random mode', text: 'Quick battle with random teams.', icon: 'dice', tag: 'Normal', onActivate: () => handleModeSelect('random'), playLabel: 'Play random' })}
            {draftVisible && renderPlacard({ mode: 'draft', title: 'Draft mode', text: 'Ban, then pick your team.', icon: 'swords', tag: 'Ranked', extraClass: modeAnimates('draft') || rankedAnimates ? ' mode-unlock-reveal' : '', onActivate: () => handleModeSelect('draft'), playLabel: 'Play draft' })}
            {survivalVisible && renderPlacard({ mode: 'survival', title: 'Survival mode', text: 'Win with each hero once.', icon: 'flame', tag: 'Ranked', extraClass: modeAnimates('survival') || rankedAnimates ? ' mode-unlock-reveal' : '', onActivate: handleSurvivalClick, playLabel: 'Enter survival' })}
            {SHOW_GAUNTLET && renderPlacard({ mode: 'gauntlet', title: 'Gauntlet', text: 'Face 13 trials with a roster of six.', icon: 'tower', tag: 'Ranked', onActivate: handleGauntletClick, playLabel: 'Enter gauntlet' })}
          </div>
        </section>
      </main>

      {/* Shop Modal */}
      {showShop && (
        <Shop
          onClose={handleCloseShop}
          userId={user.id}
          victoryPoints={victoryPoints}
          availableHeroes={user.available_heroes}
          onPurchaseComplete={handlePurchaseComplete}
        />
      )}

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection
          onClose={handleCloseCollection}
          userId={user.id}
          victoryPoints={victoryPoints}
          onFavoritesChange={onFavoritesChange}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        user={user}
        allHeroes={allHeroes}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onIconChange={setProfileIcon}
        onOpenHowToPlay={() => { setShowProfileModal(false); setShowRulesModal(true); }}
        onOpenSettings={() => { setShowProfileModal(false); setShowSettingsModal(true); }}
      />

      {showSettingsModal && <SettingsModal onClose={() => { setShowSettingsModal(false); setShowProfileModal(true); }} />}
      {showRulesModal && <HowToPlayModal onClose={() => { setShowRulesModal(false); setShowProfileModal(true); }} />}

      {/* Mode unlock notification */}
      {unlockToast && (
        <div className="mode-unlock-toast" role="status" onClick={() => setUnlockToast(null)}>
          <Icon name="unlock" size={24} className="mode-unlock-toast-icon" />
          <div className="mode-unlock-toast-text">
            <strong>New mode unlocked</strong>
            <span>{unlockToast.map(m => RANKED_MODE_NAMES[m]).join(' and ')} {unlockToast.length > 1 ? 'are' : 'is'} now available in Ranked.</span>
          </div>
        </div>
      )}

      {questReveal.stage === 'prompt' && pendingQuestReward && (
        <QuestRewardModal reward={pendingQuestReward} onOk={questReveal.claim} />
      )}

      <RequirementModal
        isOpen={showRequirementModal}
        onClose={() => setShowRequirementModal(false)}
        message={requirementModalData.message}
        currentCount={requirementModalData.currentCount}
        requiredCount={requirementModalData.requiredCount}
        type={requirementModalData.type}
      />
    </div>
  );
};

export default GameLobby;
