import React, { useState, useEffect, useRef } from 'react';
import HeroCollection from './HeroCollection';
import ProfileModal from './ProfileModal';
import Icon from './ui/Icon';
import LobbyTopBar from './lobby/LobbyTopBar';
import LobbyFriendsButton, { LobbyFriendsProps } from './lobby/LobbyFriendsButton';
import PlayerPanel from './lobby/PlayerPanel';
import FeaturedHero from './lobby/FeaturedHero';
import ModeCards, { ModeCardSpec } from './lobby/ModeCards';
import Shop from './Shop';
import RequirementModal from './RequirementModal';
import HowToPlayModal from './HowToPlayModal';
import { Hero, GameState, Quest, PendingQuestReward } from '../types';
import { socketService } from '../socketService';
import { useQuestReveal } from '../useQuestReveal';
import QuestRewardModal from './QuestRewardModal';
import SettingsModal from './SettingsModal';
import config from '../config';
import { timeUntilUtcMidnight, utcDayKey, searchElapsed, formatRecord, nextFeaturedHero, collectionSummary, markLobbyArrival, consumeLobbyArrival } from '../lobby/lobbyRules';
import { getAnimSpeed } from '../battleAnimations';
import { isHolo } from '../holoSetting';
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
  holo_heroes?: string[];
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
  // Called with the new balance as soon as a shop purchase is confirmed
  onVictoryPointsChange?: (victoryPoints: number) => void;
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
  // Friends and Messages live in the top bar while the lobby shows (App hides its floating icons);
  // left out during the tutorial, when Friends is unavailable
  friends?: LobbyFriendsProps;
  // The Shop covers the top bar, so App shows its floating Friends icons while it is open
  onShopStateChange?: (isOpen: boolean) => void;
}

const RANKED_MODES = ['draft', 'survival'] as const;
type RankedMode = typeof RANKED_MODES[number];
const DRAFT_UNLOCK_LEVEL = 3;
const SURVIVAL_UNLOCK_HEROES = 21;
const RANKED_MODE_NAMES: Record<RankedMode, string> = { draft: 'Draft mode', survival: 'Survival mode' };

// Phase 5 turns this on once the Gauntlet backend fixes land.
const SHOW_GAUNTLET = true;

// The arrival sequence ends 1.35 s after the lobby opens (Lobby.css); its class comes off shortly after.
const ARRIVAL_MS = 1600;

// The featured hero changes this often (ms), unless the player is looking at it.
const FEATURE_SWAP_MS = 6000;

const GameLobby: React.FC<GameLobbyProps> = ({ onStartGame, onStartSurvival, onStartGauntlet, victoryPoints, onVictoryPointsChange, user, onLogout, isSearching = false, searchMode = null, onCancelSearch, onCollectionStateChange, onFavoritesChange, quests = [], pendingQuestReward = null, onClaimQuestReward, friends, onShopStateChange }) => {
  // Refresh on entering the lobby so a new UTC day resets the list.
  useEffect(() => {
    socketService.getQuests();
  }, []);

  // Arrival: plays once after signing in or reloading, not on coming back from a match. The flag is read
  // here and put straight back, then cleared once the lobby has really mounted: React may run this
  // initialiser twice (Strict Mode) or throw a render away, and that must not use the arrival up.
  const [arrived] = useState(() => {
    const arrival = consumeLobbyArrival();
    if (arrival) markLobbyArrival();
    return arrival;
  });
  const [arriving, setArriving] = useState(arrived);
  useEffect(() => {
    consumeLobbyArrival();
    if (!arrived) return;
    const timer = window.setTimeout(() => setArriving(false), ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, [arrived]);

  const questReveal = useQuestReveal(
    pendingQuestReward,
    { xp: user.xp || 0, level: user.level || 1, vp: victoryPoints },
    onClaimQuestReward || (() => {})
  );
  const pendingQuestIds = new Set((pendingQuestReward?.completed || []).map(q => q.id));

  const [showCollection, setShowCollection] = useState(false);
  // The hero the Binder opens on (the featured card was tapped)
  const [binderHero, setBinderHero] = useState<string | undefined>(undefined);
  const [showShop, setShowShop] = useState(false);
  const shopStateRef = useRef(onShopStateChange);
  shopStateRef.current = onShopStateChange;
  useEffect(() => {
    shopStateRef.current?.(showShop);
  }, [showShop]);
  // Leaving the lobby with the Shop open (a match found) must not leave the floating icons hidden
  useEffect(() => () => shopStateRef.current?.(false), []);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [allHeroes, setAllHeroes] = useState<Hero[]>([]);
  const [profileIcon, setProfileIcon] = useState<string | null>(null);
  const [record, setRecord] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.API_BASE_URL}/api/player-stats/${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) {
          setProfileIcon(data.stats.profile_icon);
          setRecord(formatRecord(data.stats));
        } else {
          setRecord(null);
        }
      })
      .catch(err => {
        console.error('Failed to load player stats:', err);
        if (!cancelled) setRecord(null);
      });
    return () => { cancelled = true; };
  }, [user.id]);

  // Quests reset at midnight UTC; the countdown beside the heading follows it, and the list is asked
  // for again once the UTC day turns over, so yesterday's quests never sit beside a fresh countdown.
  const [resetText, setResetText] = useState(() => timeUntilUtcMidnight(new Date()));
  useEffect(() => {
    let utcDay = utcDayKey(new Date());
    const timer = window.setInterval(() => {
      const now = new Date();
      setResetText(timeUntilUtcMidnight(now));
      const today = utcDayKey(now);
      if (today !== utcDay) {
        utcDay = today;
        socketService.getQuests();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Search clock: starts when a search starts (or switches mode), ticks each second, clears when it ends.
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isSearching) {
      setSearchStartedAt(null);
      return;
    }
    const started = Date.now();
    setSearchStartedAt(started);
    setClockNow(started);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isSearching, searchMode]);
  // Survival and Gauntlet keep their own screens, so only Random and Draft search from a card.
  const searchingMode = isSearching && (searchMode === 'random' || searchMode === 'draft') ? searchMode : null;
  const searchClock = searchElapsed(searchStartedAt, clockNow);
  const [showRequirementModal, setShowRequirementModal] = useState(false);
  const [requirementModalData, setRequirementModalData] = useState({
    message: '',
    currentCount: 0,
    requiredCount: 0,
    type: 'heroes' as 'heroes' | 'level'
  });
  const [featuredHero, setFeaturedHero] = useState<Hero | null>(null);
  const [swapKey, setSwapKey] = useState(0);
  const featuredRef = useRef<Hero | null>(null);
  const featureTurn = useRef(0);
  const featureHovered = useRef(false);
  const favoritesRef = useRef<string[]>(user.favorite_heroes || []);
  favoritesRef.current = user.favorite_heroes || [];
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

  const handleShowCollection = (heroName?: string) => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setBinderHero(heroName);
    setShowCollection(true);
    onCollectionStateChange?.(true);
  };

  const handleCloseCollection = () => {
    setShowCollection(false);
    setBinderHero(undefined);
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
          available_heroes: userData.available_heroes,
          holo_heroes: userData.holo_heroes || []
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

  // Fetch heroes; the first featured hero uses turn 0. On failure the stage shows only the pedestal.
  useEffect(() => {
    let cancelled = false;
    const fetchHeroes = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/heroes`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const heroes: Hero[] = await response.json();
        if (cancelled) return;
        setAllHeroes(heroes);
        featureTurn.current = 0;
        const first = nextFeaturedHero(heroes, favoritesRef.current, 0, null, Math.random);
        featuredRef.current = first;
        setFeaturedHero(first);
      } catch (error) {
        console.error('Failed to fetch heroes:', error);
      }
    };

    fetchHeroes();
    return () => { cancelled = true; };
  }, []);

  // A new featured hero every few seconds; held while the player hovers it or the tab is hidden.
  useEffect(() => {
    if (allHeroes.length === 0) return;
    const timer = window.setInterval(() => {
      if (featureHovered.current || document.visibilityState !== 'visible') return;
      featureTurn.current += 1;
      const next = nextFeaturedHero(allHeroes, favoritesRef.current, featureTurn.current, featuredRef.current?.name ?? null, Math.random);
      featuredRef.current = next;
      setFeaturedHero(next);
      setSwapKey(k => k + 1);
    }, FEATURE_SWAP_MS);
    return () => window.clearInterval(timer);
  }, [allHeroes]);

  const collection = allHeroes.length > 0
    ? collectionSummary(allHeroes, user.available_heroes || [], user.favorite_heroes || [], user.holo_heroes)
    : null;

  const unlockClass = (mode: RankedMode) => (modeAnimates(mode) || rankedAnimates ? 'mode-unlock-reveal' : undefined);
  const modes: ModeCardSpec[] = [
    { mode: 'random', title: 'Random', text: 'Quick battle with random teams.', tag: 'Normal', playLabel: 'Play random', onActivate: () => handleModeSelect('random') },
  ];
  if (draftVisible) modes.push({ mode: 'draft', title: 'Draft', text: 'Ban, then pick your team.', tag: 'Ranked', playLabel: 'Play draft', extraClass: unlockClass('draft'), onActivate: () => handleModeSelect('draft') });
  if (survivalVisible) modes.push({ mode: 'survival', title: 'Survival', text: 'Win with each hero once.', tag: 'Ranked', playLabel: 'Enter survival', extraClass: unlockClass('survival'), onActivate: handleSurvivalClick });
  if (SHOW_GAUNTLET) modes.push({ mode: 'gauntlet', title: 'Gauntlet', text: 'Face 13 trials with a roster of six.', tag: 'Ranked', playLabel: 'Enter gauntlet', onActivate: handleGauntletClick });

  return (
    <div className={`game-lobby-modern lobby${getAnimSpeed() === 'off' ? ' lobby--still' : ''}${arriving ? ' lobby--arrive' : ''}`}>
      <LobbyTopBar
        coins={questReveal.display.vp}
        coinsBumping={questReveal.counting}
        level={questReveal.display.level || 1}
        xp={questReveal.display.xp || 0}
        levelFlash={questReveal.levelFlash}
        onLogout={onLogout}
        friends={friends && <LobbyFriendsButton {...friends} />}
      />

      <main className="lobby-main">
        <PlayerPanel
          username={user.username}
          profileIcon={profileIcon}
          record={record}
          quests={quests}
          pendingQuestIds={pendingQuestIds}
          revealStage={questReveal.stage}
          resetText={resetText}
          collection={collection}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenShop={handleShowShop}
          onOpenBinder={() => handleShowCollection()}
        />

        <section className="lobby-table">
          <FeaturedHero
            hero={featuredHero}
            favorite={!!featuredHero && (user.favorite_heroes || []).includes(featuredHero.name)}
            holo={!!featuredHero && isHolo(user, featuredHero.name)}
            swapKey={swapKey}
            arriving={arrived}
            onOpen={name => { featureHovered.current = false; handleShowCollection(name); }}
            onHoverChange={hovering => { featureHovered.current = hovering; }}
          />
          <ModeCards modes={modes} searchingMode={searchingMode} searchClock={searchClock} onLeaveQueue={() => onCancelSearch?.()} />
        </section>
      </main>

      {/* Shop Modal */}
      {showShop && (
        <Shop
          onClose={handleCloseShop}
          userId={user.id}
          victoryPoints={victoryPoints}
          availableHeroes={user.available_heroes}
          holoHeroes={user.holo_heroes}
          onPurchaseComplete={handlePurchaseComplete}
          onVictoryPointsChange={onVictoryPointsChange}
        />
      )}

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection
          onClose={handleCloseCollection}
          userId={user.id}
          victoryPoints={victoryPoints}
          onFavoritesChange={onFavoritesChange}
          initialHero={binderHero}
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
