import { useState, useEffect, useRef } from 'react';
import { socketService } from './socketService';
import { GameState, Player, Hero } from './types';
import GameLobby from './components/GameLobby';
import DraftPhase from './components/DraftPhase';
import BattlePhase from './components/BattlePhase';
import SurvivalMode from './components/SurvivalMode';
import SurvivalBattleTransition from './components/SurvivalBattleTransition';
import GauntletMode from './components/GauntletMode';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import FriendsIcon from './components/FriendsIcon';
import FriendsOverlay from './components/FriendsOverlay';
import MessageIcon from './components/MessageIcon';
import MessageChat from './components/MessageChat';
import config from './config';
import './App.css';



interface BattleLogEntry {
  id: string;
  timestamp: number;
  action: string;
  damage?: number;
  healing?: number;
  hit?: boolean;
  crit?: boolean;
  attacker?: string;
  target?: string;
  roll?: number; // Legacy - now prefer attackRoll/damageRoll
  total?: number; // Legacy - now prefer attackTotal/damageTotal
  attackRoll?: number;
  attackTotal?: number;
  advantageInfo?: {
    type: 'advantage' | 'disadvantage';
    roll1: number;
    roll2: number;
    chosen: number;
  };
  damageRoll?: number[];
  damageTotal?: number;
  healRoll?: number[];
  abilityName?: string;
  deflected?: boolean;
  isTimekeeperCommand?: boolean;
  commandingHero?: string;
  // Special ability properties
  specialName?: string;
  triggerContext?: string;
  isSpecial?: boolean;
  // Log entry type and source
  type?: string;
  source?: string;
  caster?: string;
  isNonStandardLog?: boolean; // Flag for entries that shouldn't have "used" prefix
  message?: string;
  description?: string;
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
  xp: number;
  level: number;
  best_gauntlet_trial: number;
  player_id?: string;
}

interface AppState {
  gameState: GameState | null;
  playerId: string | null;
  playerName: string;
  isConnected: boolean;
  error: string | null;
  allHeroes: Hero[];
  battleLog: BattleLogEntry[];
  victoryPoints: number;
  showSurvival: boolean;
  showGauntlet: boolean;
  isSurvivalMode: boolean;
  survivalTeam: Hero[];
  isTransitioningToBattle: boolean;
  
  // Survival state
  survivalWins: number;
  survivalLosses: number;
  
  // Authentication state
  user: User | null;
  showLogin: boolean;
  showRegister: boolean;

  // Spectator state
  isSpectating: boolean;
  spectatingPlayerId: string | null;
  spectators: Array<{ socketId: string; username: string; spectatingPlayerId: string }>;

  timekeeperAbilitySelection?: {
    ally: string;
    target: string;
    availableAbilities: Array<{
      index: number;
      name: string;
      description: string;
      category?: string;
    }>;
  };

  // Friends system state
  showFriendsOverlay: boolean;
  friendsNotificationCount: number;
  messageNotificationCount: number;
  unreadMessageChats: Map<number, string>; // Map of user ID to username with unread messages
  openMessageChats: Array<{
    targetUserId: number;
    targetUsername: string;
  }>;
  minimizedMessageChats: Array<{
    targetUserId: number;
    targetUsername: string;
  }>;
  showCollection: boolean;
  showDraftAbandonedModal: boolean;
  draftAbandonedMessage: string;
}

function App() {
  // Initialize Victory Points from localStorage
  const getInitialVictoryPoints = (): number => {
    const stored = localStorage.getItem('heroCallVictoryPoints');
    return stored ? parseInt(stored, 10) : 0;
  };

  const [state, setState] = useState<AppState>({
    gameState: null,
    playerId: null,
    playerName: '',
    isConnected: false,
    error: null,
    allHeroes: [],

    battleLog: [],
    victoryPoints: getInitialVictoryPoints(),
    showSurvival: false,
    showGauntlet: false,
    isSurvivalMode: false,
    survivalTeam: [],
    isTransitioningToBattle: false,
    
    // Survival state
    survivalWins: 0,
    survivalLosses: 0,
    
    // Authentication state
    user: null,
    showLogin: true, // Start with login page
    showRegister: false,

    // Spectator state
    isSpectating: false,
    spectatingPlayerId: null,
    spectators: [],

    // Friends system state
    showFriendsOverlay: false,
    friendsNotificationCount: 0,
    messageNotificationCount: 0,
    unreadMessageChats: new Map(),
    openMessageChats: [],
    minimizedMessageChats: [],
    showCollection: false,
    showDraftAbandonedModal: false,
    draftAbandonedMessage: '',

  });

  const [isSearchingForSurvivalMatch, setIsSearchingForSurvivalMatch] = useState(false);
  const [isSearchingForMatch, setIsSearchingForMatch] = useState(false);
  const [searchMode, setSearchMode] = useState<'draft' | 'random' | null>(null);
  
  // Ref to track survival return timeout
  const survivalReturnTimeoutRef = useRef<number | null>(null);

  // Rewards data state for displaying XP and VP gains
  const [rewardsData, setRewardsData] = useState<{
    oldXP: number;
    newXP: number;
    xpGained: number;
    oldLevel: number;
    newLevel: number;
    oldVictoryPoints: number;
    newVictoryPoints: number;
    victoryPointsGained: number;
    leveledUp: boolean;
  } | null>(null);

  // Save Victory Points to localStorage whenever it changes
  useEffect(() => {
    if (state.victoryPoints !== undefined && state.victoryPoints !== null) {
      localStorage.setItem('heroCallVictoryPoints', state.victoryPoints.toString());
    }
  }, [state.victoryPoints]);

  // Save active game state to localStorage for reconnection
  useEffect(() => {
    if (state.gameState && state.playerId && state.user) {
      const gameData = {
        gameId: state.gameState.id,
        playerId: state.playerId,
        playerName: state.user.username,
        phase: state.gameState.phase,
        timestamp: Date.now()
      };
      localStorage.setItem('heroCallActiveGame', JSON.stringify(gameData));
    } else {
      localStorage.removeItem('heroCallActiveGame');
    }
  }, [state.gameState, state.playerId, state.user]);

  // Attempt to reconnect to active game on load
  useEffect(() => {
    if (state.user && !state.gameState) {
      const storedGame = localStorage.getItem('heroCallActiveGame');
      if (storedGame) {
        try {
          const gameData = JSON.parse(storedGame);
          // Only attempt reconnect if game is recent (within 30 minutes)
          const timeSinceGame = Date.now() - gameData.timestamp;
          if (timeSinceGame < 30 * 60 * 1000) {
            console.log('🔄 Attempting to reconnect to game:', gameData.gameId);
            socketService.reconnectToGame(gameData.gameId, gameData.playerName);
          } else {
            console.log('⏰ Stored game too old, not reconnecting');
            localStorage.removeItem('heroCallActiveGame');
          }
        } catch (error) {
          console.error('Failed to parse stored game data:', error);
          localStorage.removeItem('heroCallActiveGame');
        }
      }
    }
  }, [state.user, state.gameState]);

  useEffect(() => {
    // Load heroes data - only load if user is authenticated
    if (state.user) {
      const url = `${config.API_BASE_URL}/api/heroes?userId=${state.user.id}`;
      fetch(url)
        .then(res => res.json())
        .then(heroes => {
          setState(prev => ({ ...prev, allHeroes: heroes }));
        })
        .catch(err => console.error('Failed to load heroes:', err));
    }
  }, [state.user]); // Reload heroes when user changes

  useEffect(() => {
    // Only initialize socket connection if user is authenticated
    if (!state.user) return;

    // Initialize socket connection and authenticate
    const socket = socketService.connect();
    
    // Authenticate the socket connection with user ID
    socketService.authenticate(state.user.id);

    // Socket event handlers for reconnection
    socket.on('reconnect-success', (gameState) => {
      console.log('✅ Reconnected to game successfully:', gameState);
      setState(prev => ({
        ...prev,
        gameState: gameState,
        playerId: socketService.socket?.id || null,
        isConnected: true,
        error: null
      }));
      setIsSearchingForMatch(false);
      setSearchMode(null);
    });

    socket.on('reconnect-failed', (data) => {
      console.log('❌ Reconnection failed:', data.message);
      localStorage.removeItem('heroCallActiveGame');
      setState(prev => ({
        ...prev,
        error: data.message
      }));
    });

    // Socket event handlers
    socket.on('join-result', (data) => {
      console.log('📨 Join result received:', data);
      if (data.success) {
        // For survival mode, don't set gameState yet - just confirm we're in queue
        if (data.mode === 'survival') {
          console.log('🎯 Joined survival queue, waiting for opponent...');
          setState(prev => ({
            ...prev,
            playerId: data.playerId,
            isConnected: true,
            error: null
          }));
          // Keep searching state active if game isn't ready yet
          if (!data.gameReady) {
            setIsSearchingForSurvivalMatch(true);
          }
        } else {
          // Regular mode - set up game state
          console.log(`🎮 Regular mode join - gameReady: ${data.gameReady}, players: ${data.players?.length || 0}`);
          setState(prev => ({
            ...prev,
            playerId: data.playerId,
            gameState: {
              id: data.gameId,
              phase: 'waiting', // Always start with waiting, game-start event will update this
              players: data.players || [],
              currentTurn: 0,
              currentDraftPhase: 0,
              draftTurn: 0,
              winner: null,
              draftCards: data.draftCards || []
            },
            isConnected: true,
            error: null
          }));
          // Only clear searching state if the game is ready (has 2 players)
          if (data.gameReady) {
            console.log('🎮 Game ready! Clearing search state');
            setIsSearchingForMatch(false);
            setSearchMode(null);
          } else {
            console.log('🔍 Game not ready, keeping search state active');
          }
          // If game is not ready, keep searching state active
        }
      } else {
        setState(prev => ({ ...prev, error: 'Failed to join game' }));
        // Clear searching state on failure
        setIsSearchingForMatch(false);
        setSearchMode(null);
      }
    });

    // Handle join results for all modes (including survival)
    // For survival mode, this just confirms we're in the queue
    // The actual game start will come via 'game-start' event

    socket.on('survival-search-cancelled', (data) => {
      if (data.success) {
        setIsSearchingForSurvivalMatch(false);
        // Reset survival mode state when search is cancelled
        setState(prev => ({
          ...prev,
          isSurvivalMode: false,
          survivalTeam: [],
          gameState: null,
          error: null
        }));
      }
    });

    socket.on('search-cancelled', (data) => {
      if (data.success) {
        setIsSearchingForMatch(false);
        setSearchMode(null);
        // Reset game state when search is cancelled
        setState(prev => ({
          ...prev,
          gameState: null,
          playerId: null,
          playerName: '',
          error: null
        }));
      }
    });

    socket.on('friendly-room-created', (data) => {
      if (data.success) {
        setState(prev => ({
          ...prev,
          playerId: data.playerId,
          gameState: {
            id: data.gameId,
            phase: 'waiting',
            players: [],
            currentTurn: 0,
            currentDraftPhase: 0,
            draftTurn: 0,
            winner: null
          },
          isConnected: true,
          error: null
        }));
      } else {
        setState(prev => ({ ...prev, error: data.message || 'Failed to create room' }));
      }
    });

    socket.on('friendly-room-joined', (data) => {
      if (data.success) {
        setState(prev => ({
          ...prev,
          playerId: data.playerId,
          gameState: {
            id: data.gameId,
            phase: 'waiting',
            players: data.players,
            currentTurn: 0,
            currentDraftPhase: 0,
            draftTurn: 0,
            winner: null
          },
          isConnected: true,
          error: null
        }));
      } else {
        setState(prev => ({ ...prev, error: data.message || 'Failed to join room' }));
      }
    });

    socket.on('game-start', (data) => {
      // Stop searching when game starts
      setIsSearchingForSurvivalMatch(false);
      setIsSearchingForMatch(false);
      setSearchMode(null);
      
      if (data.gameState) {
        // Random or survival mode - full game state provided
        console.log('🎮 Game starting with state:', data.gameState.phase);
        console.log('🎮 Game data received:', data);
        
        // Use functional update to get current state
        setState(prev => {
          console.log('🔍 Current state before update:');
          console.log('  - isSurvivalMode:', prev.isSurvivalMode);
          console.log('  - survivalTeam:', prev.survivalTeam.map(h => h.name));
          console.log('  - showSurvival:', prev.showSurvival);
          console.log('  - isTransitioningToBattle:', prev.isTransitioningToBattle);
          
          // If this is survival mode, start the transition effect
          if (prev.isSurvivalMode && prev.survivalTeam.length > 0) {
            console.log('🎬 Starting survival battle transition!');
            console.log('🎬 Team going into transition:', prev.survivalTeam.map(h => h.name));
            return {
              ...prev,
              isTransitioningToBattle: true,
              gameState: data.gameState || prev.gameState // Store the new game state
            };
          } else {
            console.log('🎯 Direct battle start (not survival mode)');
            return {
              ...prev,
              gameState: data.gameState || prev.gameState
            };
          }
        });
      } else {
        // Draft mode - traditional draft flow
        console.log('📋 Starting draft mode');
        setState(prev => ({
          ...prev,
          gameState: prev.gameState ? {
            ...prev.gameState,
            phase: 'draft',
            players: data.players,
            draftCards: data.draftCards
          } : null
        }));
      }
    });

    socket.on('ban-complete', (data) => {
      console.log('Received ban-complete:', data);
      setState(prev => {
        console.log('Previous game state:', prev.gameState);
        // Use the full game state if provided, otherwise update specific fields
        const newState = {
          ...prev,
          gameState: data.gameState || (prev.gameState ? {
            ...prev.gameState,
            currentDraftPhase: data.currentDraftPhase,
            draftTurn: data.draftTurn,
            draftCards: data.draftCards || prev.gameState.draftCards
          } : null)
        };
        console.log('New game state:', newState.gameState);
        return newState;
      });
    });

    socket.on('pick-complete', (data) => {
      console.log('Pick complete data:', data);
      setState(prev => {
        const newState = {
          ...prev,
          gameState: data.gameState || (prev.gameState ? {
            ...prev.gameState,
            phase: data.phase,
            currentDraftPhase: data.currentDraftPhase,
            draftTurn: data.draftTurn,
            draftCards: data.draftCards || prev.gameState.draftCards
          } : null)
        };
        console.log('Pick complete new state:', newState.gameState);
        if (data.initiative) {
          console.log('Initiative data received:', data.initiative);
        }
        return newState;
      });
    });

    socket.on('attack-order-set', (data) => {
      console.log('Attack order set data:', data);
      setState(prev => {
        if (!prev.gameState || !data.gameState) {
          return prev;
        }
        
        // If both players are ready and we're transitioning to initiative, accept full gameState
        if (data.bothReady && data.gameState.phase === 'initiative') {
          console.log('Both players ready - accepting full gameState for initiative phase');
          return {
            ...prev,
            gameState: data.gameState
          };
        }
        
        // Otherwise, only update phase and ready status without touching team orders
        const newState = {
          ...prev,
          gameState: {
            ...prev.gameState,
            phase: data.gameState.phase,
            // Update each player's ready status without touching their team order
            players: prev.gameState.players.map(player => {
              const updatedPlayer = data.gameState.players.find(p => p.id === player.id);
              if (updatedPlayer) {
                return {
                  ...player,
                  isReady: updatedPlayer.isReady
                  // Do NOT update team or attackOrder here - only update ready status
                  // Each player maintains their own team order locally until both are ready
                };
              }
              return player;
            })
          }
        };
        // If initiative data is included, log it for the initiative modal to pick up
        if (data.initiative) {
          console.log('Initiative data received from setup:', data.initiative);
        }
        return newState;
      });
    });

    socket.on('initiative-rolled', (data) => {
      // Handle tie - reset rolls and show message
      if (data.tie) {
        setState(prev => ({
          ...prev,
          gameState: prev.gameState ? {
            ...prev.gameState,
            players: prev.gameState.players.map(p => ({
              ...p,
              initiativeRoll: undefined
            }))
          } : null
        }));
        // Show tie message briefly
        setTimeout(() => {
          alert(`Both players rolled ${data.rolls.player1}! Rolling again...`);
        }, 100);
        return;
      }
      
      setState(prev => ({
        ...prev,
        gameState: prev.gameState ? {
          ...prev.gameState,
          players: prev.gameState.players.map(p => 
            p.id === state.playerId ? {...p, initiativeRoll: data.roll} : p
          )
        } : null
      }));
    });

    socket.on('battle-start', (data) => {
      setState(prev => ({
        ...prev,
        gameState: data.gameState
      }));
    });

    socket.on('attack-result', (data) => {
      setState(prev => {
        const newLogEntries: BattleLogEntry[] = [];
        
        // Check if attack was deflected by Monk
        if (data.monkDeflected) {
          // Deflection log entry
          const deflectLogEntry: BattleLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            action: `${data.deflectingMonk} deflected attack on ${data.target}`,
            damage: data.deflectCounterDamage,
            hit: true,
            crit: false,
            attacker: data.deflectingMonk,
            target: data.attacker,
            deflected: true,
            isNonStandardLog: true
          };
          newLogEntries.push(deflectLogEntry);
        } else {
          // Main attack log entry (normal attack)
          const attackLogEntry: BattleLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            action: 'Basic Attack',
            damage: data.damage,
            hit: data.hit,
            crit: data.isCritical,
            attacker: data.attacker,
            target: data.target,
            attackRoll: data.attackRoll,
            attackTotal: data.attackTotal,
            advantageInfo: data.advantageInfo,
            damageRoll: data.damageRoll,
            damageTotal: data.damageTotal,
            // Legacy fallback
            roll: data.roll || data.attackRoll,
            total: data.total || data.attackTotal
          };
          newLogEntries.push(attackLogEntry);
        }

        // Process status effects (like counter-attacks)
        if (data.statusEffects && data.statusEffects.length > 0) {
          data.statusEffects.forEach((effect: any, index: number) => {
            if (effect.type === 'counter_attack') {
              const counterLogEntry: BattleLogEntry = {
                id: `${Date.now()}-counter-${index}`,
                timestamp: Date.now() + index + 1,
                action: `${effect.defender} Shield Bashed ${effect.attacker}`,
                damage: effect.damage,
                hit: true,
                crit: false,
                attacker: effect.defender,
                target: effect.attacker,
                damageRoll: effect.damageRoll,
                damageTotal: effect.damage
              };
              newLogEntries.push(counterLogEntry);
            }
          });
        }

        // Process death trigger effects (like Bomber's Self Destruct)
        if (data.deathTriggerEffects && data.deathTriggerEffects.length > 0) {
          data.deathTriggerEffects.forEach((effect: any, index: number) => {
            let action = '';
            let damage = 0;
            
            switch (effect.type) {
              case 'special_damage':
                action = `${effect.caster}'s ${effect.specialName} deals damage to ${effect.target}`;
                damage = effect.damage;
                break;
              default:
                action = `${effect.caster}'s ${effect.specialName} activates`;
            }
            
            if (action) {
              const deathTriggerEntry: BattleLogEntry = {
                id: `${Date.now()}-death-${index}`,
                timestamp: Date.now() + index + 2,
                action,
                damage,
                hit: true,
                crit: false,
                attacker: effect.caster,
                target: effect.target,
                damageRoll: effect.damageRoll
              };
              newLogEntries.push(deathTriggerEntry);
            }
          });
        }

        // Process special backend log entries (resurrection, health link reflection, etc.)
        if (data.gameState && data.gameState.battleLog) {
          const specialBackendEntries = data.gameState.battleLog.filter((entry: any) => 
            entry.type === 'resurrection' || 
            entry.type === 'health_link_reflection' ||
            entry.type === 'special_activation' ||
            entry.type === 'special_comprehensive'
          );
          
          specialBackendEntries.forEach((backendEntry: any, index: number) => {
            const specialEntry: BattleLogEntry = {
              id: `${Date.now()}-backend-${backendEntry.type}-${index}`,
              timestamp: backendEntry.timestamp || Date.now() + index + 10,
              action: backendEntry.message || backendEntry.action,
              damage: backendEntry.damage,
              healing: backendEntry.healing || backendEntry.healAmount,
              hit: backendEntry.hit !== undefined ? backendEntry.hit : true,
              crit: backendEntry.isCritical || backendEntry.crit || false,
              attacker: backendEntry.source || backendEntry.caster || backendEntry.attacker,
              target: backendEntry.target,
              type: backendEntry.type,
              source: backendEntry.source,
              caster: backendEntry.caster,
              specialName: backendEntry.specialName,
              isSpecial: backendEntry.isSpecial || false
            };
            newLogEntries.push(specialEntry);
          });
        }

        return {
          ...prev,
          gameState: data.gameState || prev.gameState,
          battleLog: [...newLogEntries, ...prev.battleLog.slice(0, 10 - newLogEntries.length)] // Keep last 10 entries
        };
      });
    });

    socket.on('special-activated', (data) => {
      setState(prev => {
        const newLogEntries: BattleLogEntry[] = [];
        
        // Add activation log entry
        const activationEntry: BattleLogEntry = {
          id: `${Date.now()}-special-activation`,
          timestamp: Date.now(),
          action: `${data.results[0]?.source || 'Hero'} used ${data.results[0]?.message?.split(' used ')[1]?.split(' on')[0] || 'Self Destruct'}`,
          hit: true,
          crit: false,
          attacker: data.results[0]?.source,
          target: 'all heroes'
        };
        newLogEntries.push(activationEntry);
        
        // Process each result (hit/miss for each hero)
        if (data.results && data.results.length > 0) {
          data.results.forEach((result: any, index: number) => {
            if (result.type === 'damage' || result.type === 'miss') {
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-special-${index}`,
                timestamp: Date.now() + index + 1,
                action: result.message || `${result.source} ${result.hit ? 'hits' : 'misses'} ${result.target}`,
                damage: result.damage || 0,
                hit: result.hit,
                crit: result.isCritical || false,
                attacker: result.source,
                target: result.target,
                attackRoll: result.attackRoll,
                attackTotal: result.attackTotal,
                damageRoll: result.damageRoll?.rolls,
                damageTotal: result.damage
              };
              newLogEntries.push(logEntry);
            } else if (result.type === 'self_destruct') {
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-self-destruct`,
                timestamp: Date.now() + 999,
                action: `${result.caster} self-destructs!`,
                hit: true,
                crit: false,
                attacker: result.caster,
                target: result.caster
              };
              newLogEntries.push(logEntry);
            }
          });
        }
        
        return {
          ...prev,
          gameState: data.gameState || prev.gameState,
          battleLog: [...newLogEntries, ...prev.battleLog.slice(0, 10 - newLogEntries.length)]
        };
      });
    });

    socket.on('ability-result', (data) => {
      setState(prev => {
        const newLogEntries: BattleLogEntry[] = [];
        
        // Check if this is a Timekeeper ability selection requirement
        if (data.results && data.results.some((result: any) => result.type === 'ability_selection_required')) {
          const selectionResult = data.results.find((result: any) => result.type === 'ability_selection_required');
          // Store the ability selection info for the BattlePhase component to handle
          return {
            ...prev,
            timekeeperAbilitySelection: {
              ally: selectionResult.ally,
              target: selectionResult.timekeeperTarget,
              availableAbilities: selectionResult.availableAbilities
            },
            gameState: data.gameState || prev.gameState
          };
        }
        
        // Create a log entry for each result
        if (data.results && data.results.length > 0) {
          console.log('🔍 Processing ability results:', data.results.map((r: any) => ({ type: r.type, message: r.message })));
          
          // Check if we have comprehensive entries - if so, only process those to avoid duplicates
          const hasComprehensiveEntries = data.results.some((r: any) => 
            r.type === 'ability_comprehensive' || r.type === 'special_comprehensive'
          );
          
          data.results.forEach((result: any, index: number) => {
            // Handle comprehensive ability log entries (the new format)
            if (result.type === 'ability_comprehensive') {
              console.log('✅ Using comprehensive log entry:', result.message);
              console.log('🎯 Target debug:', { target: result.target, type: typeof result.target });
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-${index}`,
                timestamp: Date.now() + index,
                action: result.message, // Use the comprehensive message
                ...(result.damage !== undefined && { damage: result.damage }),
                ...(result.healing !== undefined && result.healing > 0 && { healing: result.healing }),
                hit: result.hit ?? true,
                crit: result.isCritical || false,
                attacker: data.caster,
                target: typeof result.target === 'string' ? result.target : String(result.target || 'Unknown'),
                attackRoll: result.attackRoll,
                attackTotal: result.attackTotal,
                advantageInfo: result.advantageInfo,
                // Legacy fallback for basic attacks or older data
                roll: result.attackRoll,
                total: result.attackTotal,
                abilityName: data.ability,
                isTimekeeperCommand: result.isTimekeeperCommand || false,
                commandingHero: result.commandingHero || null
              };
              
              newLogEntries.push(logEntry);
              return; // Skip the old handling for this entry
            }
            
            // Handle comprehensive special log entries (the new format)
            if (result.type === 'special_comprehensive') {
              console.log('✅ Using comprehensive special log entry:', result.message);
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-${index}`,
                timestamp: Date.now() + index,
                action: result.message, // Use the comprehensive message
                ...(result.damage !== undefined && { damage: result.damage }),
                ...(result.healing !== undefined && result.healing > 0 && { healing: result.healing }),
                hit: result.hit ?? true,
                crit: result.isCritical || false,
                attacker: result.caster || data.caster, // Prioritize result.caster for specials (reactive abilities)
                target: result.target,
                attackRoll: result.attackRoll,
                attackTotal: result.attackTotal,
                advantageInfo: result.advantageInfo,
                // Legacy fallback for basic attacks or older data
                roll: result.attackRoll,
                total: result.attackTotal,
                specialName: result.specialName, // Store special name for gold styling
                triggerContext: result.triggerContext,
                isSpecial: true // Flag to identify special abilities
              };
              
              newLogEntries.push(logEntry);
              return; // Skip the old handling for this entry
            }
            
            // If we have comprehensive entries, skip the individual system entries to avoid duplicates
            if (hasComprehensiveEntries && (
              result.type === 'damage' ||
              result.type === 'heal' ||
              result.type === 'lifesteal_damage' ||
              result.type === 'lifesteal_healing' ||
              result.type === 'status_applied' ||
              result.type === 'apply_buff' ||
              result.type === 'apply_debuff' ||
              result.type === 'status_missed' ||
              result.type === 'recoil_damage' ||
              result.type === 'attack_roll'
            )) {
              console.log('⏭️ Skipping individual system entry to avoid duplication:', result.type);
              return;
            }
            
            // Legacy handling for old-style result entries (keep for compatibility)
            let action = '';
            let target = '';
            let damage = 0;
            
            switch (result.type) {
              case 'attack':
                // Handle commanded attacks (like from Declare War)
                if (result.commandedBy) {
                  action = result.hit
                    ? `${result.attacker} used Basic Attack (commanded by ${result.commandedBy})`
                    : `${result.attacker} missed (commanded by ${result.commandedBy})`;
                } else {
                  action = result.hit
                    ? `${result.attacker} used Basic Attack`
                    : `${result.attacker} missed`;
                }
                target = result.target;
                damage = result.damage || 0;
                break;
              case 'damage':
                action = result.hit ? `${data.ability} deals damage to ${result.target}` : `${data.ability} misses ${result.target}`;
                target = result.target;
                break;
              case 'lifesteal_damage':
                action = result.hit ? `${data.ability} deals damage and heals from ${result.target}` : `${data.ability} misses ${result.target}`;
                target = result.target;
                break;
              case 'heal':
                action = `${data.ability} heals ${result.target}`;
                target = result.target;
                break;
              case 'status_applied':
                if (result.effect === 'damage_stack') {
                  action = `${data.ability} grants ${data.caster} 1 stack of ${result.effect}`;
                } else if (result.effect === 'taunt') {
                  action = `${data.ability} taunts ${result.target}`;
                } else if (result.effect === 'silence') {
                  action = `${data.ability} silences ${result.target}`;
                } else if (result.effect === 'poison') {
                  action = `${data.ability} poisons ${result.target}`;
                } else {
                  action = `${data.ability} applies ${result.effect} to ${result.target}`;
                }
                target = result.target;
                break;
              case 'status_missed':
                action = `${data.ability} fails to apply ${result.effect} to ${result.target}`;
                target = result.target;
                break;
              case 'apply_debuff':
                action = result.hit ? `${data.ability} applies ${result.effect} to ${result.target}` : `${data.ability} fails to apply ${result.effect} to ${result.target}`;
                target = result.target;
                break;
              case 'apply_buff':
                if (result.effect === 'damage_stack') {
                  action = result.hit ? `${data.ability} grants ${data.caster} 1 stack of ${result.effect}` : `${data.ability} fails to apply effect`;
                } else {
                  action = result.hit ? `${data.ability} applies ${result.effect} to ${result.target}` : `${data.ability} fails to apply ${result.effect} to ${result.target}`;
                }
                target = result.target;
                break;
              case 'recoil_damage':
                action = result.hit ? `${data.ability} causes recoil` : `${data.ability} misses (no recoil)`;
                target = result.target;
                break;
              case 'twin_spell_activated':
                action = result.message || `${data.caster} used Twin Spell`;
                target = '';
                break;
              case 'miss':
                action = result.message || `${data.caster}'s ${data.ability} missed ${result.target}`;
                target = result.target;
                break;
              default:
                // Skip unknown types - they may be handled by comprehensive entries
                return;
            }
            
            const logEntry: BattleLogEntry = {
              id: `${Date.now()}-${index}`,
              timestamp: Date.now() + index,
              action: action,
              ...(result.damage !== undefined && { damage: result.damage }),
              ...(result.healing !== undefined && result.healing > 0 && { healing: result.healing }),
              hit: result.hit ?? (result.type !== 'miss'),
              crit: result.isCritical || false,
              attacker: data.caster,
              target,
              attackRoll: result.attackRoll,
              attackTotal: result.attackTotal,
              advantageInfo: result.advantageInfo,
              damageRoll: result.damageRoll,
              damageTotal: result.damageTotal,
              healRoll: result.healRoll,
              // Legacy fallback for basic attacks or older data
              roll: result.roll || result.attackRoll,
              total: result.total || result.attackTotal,
              abilityName: data.ability
            };
            
            newLogEntries.push(logEntry);
          });
        } else {
          // Fallback for abilities with no results
          const fallbackEntry: BattleLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            action: data.ability || 'Ability',
            hit: false,
            attacker: data.caster,
            target: data.target,
            abilityName: data.ability
          };
          newLogEntries.push(fallbackEntry);
        }

        // Process special backend log entries (resurrection, health link reflection, etc.)
        if (data.gameState && data.gameState.battleLog) {
          const specialBackendEntries = data.gameState.battleLog.filter((entry: any) => 
            entry.type === 'resurrection' || 
            entry.type === 'health_link_reflection' ||
            entry.type === 'special_activation' ||
            entry.type === 'special_comprehensive'
          );
          
          specialBackendEntries.forEach((backendEntry: any, index: number) => {
            const specialEntry: BattleLogEntry = {
              id: `${Date.now()}-backend-${backendEntry.type}-${index}`,
              timestamp: backendEntry.timestamp || Date.now() + index,
              action: backendEntry.message || backendEntry.action,
              damage: backendEntry.damage,
              healing: backendEntry.healing || backendEntry.healAmount,
              hit: backendEntry.hit !== undefined ? backendEntry.hit : true,
              crit: backendEntry.isCritical || backendEntry.crit || false,
              attacker: backendEntry.source || backendEntry.caster || backendEntry.attacker,
              target: backendEntry.target,
              type: backendEntry.type,
              source: backendEntry.source,
              caster: backendEntry.caster,
              specialName: backendEntry.specialName,
              isSpecial: backendEntry.isSpecial || false
            };
            newLogEntries.push(specialEntry);
          });
        }

        // Process death trigger effects (like Bomber's Self Destruct)
        if (data.deathTriggerEffects && data.deathTriggerEffects.length > 0) {
          data.deathTriggerEffects.forEach((effect: any, index: number) => {
            let action = '';
            let damage = 0;
            
            switch (effect.type) {
              case 'special_damage':
                action = `${effect.caster}'s ${effect.specialName} deals damage to ${effect.target}`;
                damage = effect.damage;
                break;
              default:
                action = `${effect.caster}'s ${effect.specialName} activates`;
            }
            
            if (action) {
              const deathTriggerEntry: BattleLogEntry = {
                id: `${Date.now()}-death-ability-${index}`,
                timestamp: Date.now() + index + 100,
                action,
                damage,
                hit: true,
                crit: false,
                attacker: effect.caster,
                target: effect.target,
                damageRoll: effect.damageRoll
              };
              newLogEntries.push(deathTriggerEntry);
            }
          });
        }

        return {
          ...prev,
          gameState: data.gameState || prev.gameState,
          battleLog: [...newLogEntries.reverse(), ...prev.battleLog.slice(0, 9 - newLogEntries.length)] // Keep last 10 entries total
        };
      });
    });

    socket.on('target-selected', (data) => {
      console.log('🎯 Target selected response from server:', data);
      setState(prev => ({
        ...prev,
        gameState: data.gameState || prev.gameState
      }));
    });

    socket.on('turn-ended', (data) => {
      setState(prev => {
        const newLogEntries: BattleLogEntry[] = [];
        
        // Process end-of-turn special abilities
        if (data.endTurnEffects && data.endTurnEffects.length > 0) {
          data.endTurnEffects.forEach((effect: any, index: number) => {
            let action = '';
            let target = '';
            let damage = 0;
            let healing = 0;
            let isNonStandardLog = false;
            
            switch (effect.type) {
              case 'druid_healing':
                action = `${effect.caster}'s Healing Word heals ${effect.target}`;
                target = effect.target;
                healing = effect.healing;
                break;
              case 'special_damage':
                action = `${effect.caster}'s ${effect.specialName} deals damage to ${effect.target}`;
                target = effect.target;
                damage = effect.damage;
                break;
              case 'special_heal':
                action = `${effect.caster}'s ${effect.specialName} heals ${effect.target}`;
                target = effect.target;
                healing = effect.healing;
                break;
              case 'special_taunt':
                action = `${effect.caster}'s ${effect.specialName} taunts ${effect.target}${effect.taunted_to ? ` to target ${effect.taunted_to}` : ''}`;
                target = effect.target;
                break;
              case 'special_debuff':
                action = `${effect.caster}'s ${effect.specialName} applies ${effect.effect} to ${effect.target}`;
                target = effect.target;
                break;
              case 'special_buff':
                action = `${effect.caster}'s ${effect.specialName} applies ${effect.effect} to ${effect.target}`;
                target = effect.target;
                break;
              case 'monk_deflect':
                action = `${effect.caster}'s Deflect protects ${effect.protectedTarget} and counters ${effect.target}`;
                target = effect.target;
                damage = effect.damage;
                break;
              case 'summon':
                action = `${effect.caster} summons a Beast!`;
                target = '';
                break;
              case 'attack_roll':
                // Skip attack roll info - it's internal data, don't add to log
                action = '';
                break;
              case 'miss':
                action = effect.message || `${effect.caster}'s attack misses ${effect.target}!`;
                target = effect.target;
                break;
              case 'poison_damage':
                action = `${effect.target} is poisoned`;
                target = effect.target;
                damage = effect.damage;
                // Mark this as a non-standard log entry to prevent "used" prefix
                isNonStandardLog = true;
                break;
              case 'monk_deflect_counter':
                if (effect.abilityName) {
                  action = `${effect.caster} COUNTERED ${effect.target}'s "${effect.abilityName}" and dealt ${effect.damage} damage`;
                } else {
                  action = `${effect.caster} COUNTERED ${effect.target}'s attack and dealt ${effect.damage} damage`;
                }
                target = effect.target;
                damage = effect.damage;
                break;
              case 'silence_expired':
              case 'attack_disable_expired':
              case 'taunt_expired':
              case 'stat_modifier_expired':
                // Don't log these - they're just internal status updates
                action = '';
                break;
              default:
                // If there's a message property, use it directly without prefix
                if (effect.message) {
                  action = effect.message;
                } else if (effect.caster && effect.specialName) {
                  action = `${effect.caster}'s ${effect.specialName}`;
                } else {
                  // Skip logging if we don't have enough info
                  action = '';
                }
                target = effect.target || '';
            }
            
            if (action) {
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-special-${index}`,
                timestamp: Date.now() + index,
                action,
                ...(damage > 0 && { damage }),
                ...(healing > 0 && { healing }),
                hit: true,
                crit: false,
                attacker: isNonStandardLog ? undefined : effect.caster,
                target,
                isNonStandardLog
              };
              newLogEntries.push(logEntry);
            }
          });
        }
        
        // Process turn-start special abilities
        if (data.turnStartEffects && data.turnStartEffects.length > 0) {
          data.turnStartEffects.forEach((effect: any, index: number) => {
            let action = '';
            let damage = 0;
            let healing = 0;
            
            switch (effect.type) {
              case 'special_damage':
                action = `${effect.specialName} dealt ${effect.damage} damage to all other heroes`;
                damage = effect.damage;
                break;
              default:
                // If there's a message property, use it directly
                if (effect.message) {
                  action = effect.message;
                } else if (effect.caster && effect.specialName) {
                  action = `${effect.caster}'s ${effect.specialName}`;
                } else {
                  // Skip if we don't have enough info
                  action = '';
                }
            }
            
            if (action) {
              const logEntry: BattleLogEntry = {
                id: `${Date.now()}-turn-start-${index}`,
                timestamp: Date.now() + index + 1000, // Ensure turn start effects appear after end turn effects
                action,
                ...(damage > 0 && { damage }),
                ...(healing > 0 && { healing }),
                hit: true,
                crit: false,
                attacker: effect.caster,
                target: effect.target || 'all others'
              };
              newLogEntries.push(logEntry);
            }
          });
        }
        
        // Award Victory Points if player won the game
        let newVictoryPoints = prev.victoryPoints;
        const updatedGameState = data.gameState || prev.gameState;
        
        // Check if this is a game end (someone won) and if it's the current player
        console.log('🔍 Turn check:', {
          hasUpdatedGameState: !!updatedGameState,
          updatedWinner: updatedGameState?.winner,
          hasPrevGameState: !!prev.gameState,
          prevWinner: prev.gameState?.winner,
          playerId: prev.playerId,
          isSurvivalMode: prev.isSurvivalMode
        });
        if (updatedGameState && updatedGameState.winner && prev.gameState && !prev.gameState.winner) {
          if (updatedGameState.winner === prev.playerId) {
            // Player won
            if (prev.isSurvivalMode) {
              // Survival mode win - add heroes to used list and increment wins
              console.log('🏆 Survival Victory! Backend will handle survival state update.');
              // Return to survival mode team selection after a short delay
              survivalReturnTimeoutRef.current = window.setTimeout(() => {
                setState(prevState => ({
                  ...prevState,
                  showSurvival: true,
                  gameState: null,
                  survivalTeam: [],
                  battleLog: []
                }));
                survivalReturnTimeoutRef.current = null;
              }, 3000); // 3 second delay to show victory screen
            } else {
              // Regular mode win - award Victory Point
              newVictoryPoints = prev.victoryPoints + 1;
              console.log('🏆 Victory! Awarded 1 Victory Point. Total:', newVictoryPoints);
            }
          } else {
            // Player lost
            if (prev.isSurvivalMode) {
              // Survival mode loss - add heroes to used list and increment losses
              console.log('💀 Survival Defeat! Backend will handle survival state update.');
              // Return to survival mode team selection after a short delay
              survivalReturnTimeoutRef.current = window.setTimeout(() => {
                setState(prevState => ({
                  ...prevState,
                  showSurvival: true,
                  gameState: null,
                  survivalTeam: [],
                  battleLog: []
                }));
                survivalReturnTimeoutRef.current = null;
              }, 3000); // 3 second delay to show defeat screen
            }
          }
        }

        return {
          ...prev,
          gameState: updatedGameState,
          victoryPoints: newVictoryPoints,
          ...(newLogEntries.length > 0 && {
            battleLog: [...newLogEntries, ...prev.battleLog.slice(0, 10 - newLogEntries.length)]
          })
        };
      });
    });

    socket.on('auto-draft-complete', (data) => {
      setState(prev => ({
        ...prev,
        gameState: data.gameState,
        error: null
      }));
    });

    socket.on('game-surrendered', (data) => {
      console.log('🏳️ Game surrendered:', data);
      setState(prev => ({
        ...prev,
        gameState: data.gameState
      }));
    });

    socket.on('draft-abandoned', (data: { message: string; isOpponent?: boolean }) => {
      console.log('🚫 Draft abandoned:', data);
      // Show modal to opponent, direct return to lobby for abandoner
      setState(prev => ({
        ...prev,
        showDraftAbandonedModal: data.isOpponent === true,
        draftAbandonedMessage: data.message || 'Your opponent has abandoned the draft.',
        gameState: null,
        currentView: 'lobby',
        matchmakingMode: null,
        gameId: null
      }));
    });

    socket.on('error', (data) => {
      console.log('❌ Server error:', data);
      setState(prev => ({ ...prev, error: data.message }));
    });

    socket.on('connect', () => {
      setState(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    // Spectator mode listeners
    socket.on('spectate-result', (data) => {
      console.log('👁️ Spectate result:', data);
      if (data.success && data.gameState) {
        // Convert backend battleLog to frontend format
        const backendLog = data.gameState.battleLog || [];
        const convertedLog: BattleLogEntry[] = backendLog.map((entry: any, index: number) => ({
          id: entry.id || `backend-${Date.now()}-${index}`,
          timestamp: entry.timestamp || Date.now(),
          action: entry.message || entry.action || 'Unknown action',
          damage: entry.damage,
          healing: entry.healing,
          hit: entry.hit,
          crit: entry.isCritical || entry.crit,
          attacker: entry.source || entry.caster || entry.attacker,
          target: entry.target,
          attackRoll: entry.attackRoll,
          attackTotal: entry.attackTotal,
          advantageInfo: entry.advantageInfo,
          damageRoll: entry.damageRoll?.rolls || entry.damageRoll,
          damageTotal: entry.damageTotal || entry.damage,
          abilityName: entry.specialName || entry.abilityName,
          isSpecial: entry.type?.includes('special')
        }));

        setState(prev => ({
          ...prev,
          gameState: data.gameState || null,
          isSpectating: true,
          spectatingPlayerId: data.spectatingPlayerId || null,
          spectators: data.spectators || [],
          playerId: prev.playerId, // Keep our own player ID
          battleLog: convertedLog // Initialize battle log from backend
        }));
      } else {
        console.error('❌ Failed to spectate:', data.error);
        alert(data.error || 'Failed to join as spectator');
      }
    });

    socket.on('spectator-update', (data) => {
      console.log('👁️ Spectator update:', data.spectatorList);
      setState(prev => ({
        ...prev,
        spectators: data.spectatorList || []
      }));
    });

    socket.on('spectated-player-disconnected', (data) => {
      console.log('⚠️ Spectated player disconnected:', data.playerName);
      // If we're spectating, show an alert and stop spectating
      if (state.isSpectating) {
        alert(`${data.playerName} has disconnected from the game.`);
        handleStopSpectating();
      }
    });

    socket.on('returned-to-lobby', (data) => {
      console.log('🏠 Returned to lobby response:', data);
      if (data.success) {
        console.log('✅ Successfully returned to lobby');
        if (data.preservedSurvivalState) {
          console.log('🏆 Survival state preserved:', data.preservedSurvivalState);
        }
      } else {
        console.error('❌ Failed to return to lobby:', data.error);
      }
    });

    // Survival state listeners
    socket.on('survival-state-response', (data) => {
      console.log('🔄 Received survival state from server:', data.state);
      setState(prev => ({
        ...prev,
        survivalWins: data.state.wins,
        survivalLosses: data.state.losses,
        // Update the user object to keep survival data in sync
        user: prev.user ? {
          ...prev.user,
          survival_wins: data.state.wins,
          survival_losses: data.state.losses,
          survival_used_heroes: data.state.usedHeroes || prev.user.survival_used_heroes
        } : prev.user
      }));
    });

    socket.on('survival-state-update', (data) => {
      console.log('🏆 Received survival state update:', data.type, data.state);
      setState(prev => ({
        ...prev,
        survivalWins: data.state.wins,
        survivalLosses: data.state.losses,
        // Update the user object to keep it in sync
        user: prev.user ? {
          ...prev.user,
          survival_wins: data.state.wins,
          survival_losses: data.state.losses,
          survival_used_heroes: data.state.usedHeroes || prev.user.survival_used_heroes
        } : prev.user,
        // Update victory points if provided (for run completion)
        ...(data.victoryPoints !== undefined && { victoryPoints: data.victoryPoints })
      }));
    });

    socket.on('victory-points-update', (data) => {
      console.log('🏆 Received victory points update:', data);
      setState(prev => {
        const oldVP = prev.victoryPoints;
        const newVP = data.totalVictoryPoints;
        const vpGained = data.pointsAwarded || (newVP - oldVP);
        
        // Update rewards data with VP information
        setRewardsData(prevRewards => ({
          oldXP: prevRewards?.oldXP || prev.user?.xp || 0,
          newXP: prevRewards?.newXP || prev.user?.xp || 0,
          xpGained: prevRewards?.xpGained || 0,
          oldLevel: prevRewards?.oldLevel || prev.user?.level || 1,
          newLevel: prevRewards?.newLevel || prev.user?.level || 1,
          oldVictoryPoints: oldVP,
          newVictoryPoints: newVP,
          victoryPointsGained: vpGained,
          leveledUp: prevRewards?.leveledUp || false
        }));
        
        return {
          ...prev,
          victoryPoints: newVP
        };
      });
      
      // Show notification to user
      if (data.message) {
        console.log('🎊 Victory Points:', data.message);
        // For survival abandon, the rewards are shown in the SurvivalMode component's end modal
        // No need for additional alert here
      }
    });

    socket.on('xp-update', (data) => {
      console.log('⭐ Received XP update:', data);
      setState(prev => {
        const oldXP = prev.user?.xp || 0;
        const oldLevel = prev.user?.level || 1;
        
        // Update rewards data with XP and VP information
        setRewardsData(prevRewards => ({
          oldXP: oldXP,
          newXP: data.newXP,
          xpGained: data.xpGained || 0,
          oldLevel: oldLevel,
          newLevel: data.newLevel,
          oldVictoryPoints: prevRewards?.oldVictoryPoints || prev.victoryPoints,
          newVictoryPoints: data.vpGained ? (prev.victoryPoints + data.vpGained) : (prevRewards?.newVictoryPoints || prev.victoryPoints),
          victoryPointsGained: data.vpGained || (prevRewards?.victoryPointsGained || 0),
          leveledUp: data.leveledUp || false
        }));
        
        return {
          ...prev,
          user: prev.user ? {
            ...prev.user,
            xp: data.newXP,
            level: data.newLevel
          } : prev.user
        };
      });
      
      // Log XP gain for user visibility
      if (data.xpGained) {
        console.log(`✨ +${data.xpGained} XP! New total: ${data.newXP} XP (Level ${data.newLevel})`);
        if (data.leveledUp) {
          console.log(`🎉 LEVEL UP! You are now Level ${data.newLevel}!`);
        }
      } else if (data.leveledUp) {
        // Level up from login with existing XP
        console.log(`🎉 LEVEL UP! You are now Level ${data.newLevel}! (+${data.vpGained} VP)`);
      }
    });

    socket.on('victory-points-update', (data) => {
      console.log('🏆 Received Victory Points update:', data);
      setState(prev => {
        // Update rewards data with VP information
        setRewardsData(prevRewards => ({
          ...prevRewards,
          oldXP: prevRewards?.oldXP || prev.user?.xp || 0,
          newXP: prevRewards?.newXP || prev.user?.xp || 0,
          xpGained: prevRewards?.xpGained || 0,
          oldLevel: prevRewards?.oldLevel || prev.user?.level || 1,
          newLevel: prevRewards?.newLevel || prev.user?.level || 1,
          oldVictoryPoints: data.oldVictoryPoints,
          newVictoryPoints: data.newVictoryPoints,
          victoryPointsGained: data.victoryPointsGained,
          leveledUp: prevRewards?.leveledUp || false
        }));
        
        return {
          ...prev,
          victoryPoints: data.newVictoryPoints
        };
      });
    });

    socket.on('authentication-success', (data) => {
      console.log('Socket authentication successful for user:', data.userId);
      // Request current survival state after successful authentication
      socketService.getSurvivalState();
    });

    socket.on('authentication-failed', (data) => {
      console.error('Socket authentication failed:', data.message);
      // If authentication fails due to duplicate login, log out the user
      if (data.message.includes('already logged in')) {
        alert('⚠️ Multiple Sessions Detected\n\n' + data.message);
        handleLogout();
      } else {
        setState(prev => ({ ...prev, error: data.message || 'Authentication failed' }));
      }
    });

    socket.on('force-logout', (data) => {
      console.log('Force logout received:', data.message);
      alert(data.message);
      handleLogout();
    });

    // Friends system socket listeners
    socket.on('friend-request-received', (data) => {
      console.log('Friend request received from:', data.from);
      setState(prev => ({
        ...prev,
        friendsNotificationCount: prev.friendsNotificationCount + 1
      }));
    });

    socket.on('message-received', (message) => {
      console.log('Message received from:', message.sender_username);
      setState(prev => {
        const newUnreadChats = new Map(prev.unreadMessageChats);
        newUnreadChats.set(message.sender_id, message.sender_username);
        
        return {
          ...prev,
          messageNotificationCount: prev.messageNotificationCount + 1,
          unreadMessageChats: newUnreadChats
        };
      });
    });

    return () => {
      socket.off('reconnect-success');
      socket.off('reconnect-failed');
      socketService.disconnect();
    };
  }, [state.user?.id]); // Re-run only when user ID changes, not the entire user object



  const handleJoinGame = (mode: 'draft' | 'random') => {
    // Ensure user is properly authenticated before joining
    if (!state.user || !state.user.username) {
      console.error('❌ Cannot join game: User not authenticated or username missing', state.user);
      setState(prev => ({ ...prev, error: 'Please login first to join a game.' }));
      return;
    }

    const playerName = state.user.username;
    
    console.log(`🎮 Starting ${mode} mode search for player: ${playerName}`);
    console.log(`🎮 User state:`, state.user);
    setState(prev => ({ ...prev, playerName }));
    setIsSearchingForMatch(true);
    setSearchMode(mode);
    socketService.joinGame(playerName, mode);
  };

  const handleFriendlyGame = (action: 'create' | 'join', roomName: string) => {
    // Ensure user is properly authenticated before joining
    if (!state.user || !state.user.username) {
      console.error('❌ Cannot join friendly game: User not authenticated or username missing', state.user);
      setState(prev => ({ ...prev, error: 'Please login first to join a game.' }));
      return;
    }

    const playerName = state.user.username;
    
    setState(prev => ({ ...prev, playerName }));
    
    if (action === 'create') {
      socketService.createFriendlyRoom(roomName, playerName);
    } else {
      socketService.joinFriendlyRoom(roomName, playerName);
    }
  };

  // Survival win/loss handling is now managed by the backend via WebSocket

  const handleStartSurvival = () => {
    setState(prev => ({ ...prev, showSurvival: true }));
  };

  const handleStartGauntlet = () => {
    setState(prev => ({ ...prev, showGauntlet: true }));
  };

  const handleReturnToLobby = (forceMainLobby: boolean = false) => {
    // Clear any pending survival return timeout
    if (survivalReturnTimeoutRef.current) {
      window.clearTimeout(survivalReturnTimeoutRef.current);
      survivalReturnTimeoutRef.current = null;
    }
    
    console.log('🏠 Return to lobby requested, forceMainLobby:', forceMainLobby);
    
    // Clear rewards data when returning to lobby
    setRewardsData(null);
    
    // Clear stored game state
    localStorage.removeItem('heroCallActiveGame');
    
    // Use the socket service to properly handle return to lobby
    socketService.returnToLobby();
    
    setState(prev => {
      // If forceMainLobby is true OR we're not in survival mode, go to main lobby
      if (forceMainLobby || !prev.isSurvivalMode) {
        console.log('🏠 Return to main lobby from battle');
        return {
          ...prev, 
          showSurvival: false,
          isSurvivalMode: false,
          survivalTeam: [],
          gameState: null,
          battleLog: []
        };
      } else {
        // Stay in survival mode - return to survival team selection
        console.log('🏠 Manual return to survival mode from battle');
        
        return {
          ...prev,
          showSurvival: true,
          gameState: null,
          survivalTeam: [],
          battleLog: []
        };
      }
    });
  };

  const handleSurvivalBattle = (team: Hero[]) => {
    // Store selected team for future use
    console.log('Survival team selected:', team.map(h => h.name));
    
    // Ensure user is properly authenticated before joining
    if (!state.user || !state.user.username) {
      console.error('❌ Cannot join survival game: User not authenticated or username missing', state.user);
      setState(prev => ({ ...prev, error: 'Please login first to join a game.' }));
      return;
    }

    const playerName = state.user.username;
    
    setState(prev => ({ 
      ...prev, 
      playerName,
      isSurvivalMode: true,
      survivalTeam: team
    }));
    
    setIsSearchingForSurvivalMatch(true);
    
    // Use survival matchmaking
    socketService.joinSurvivalGame(playerName, team);
  };

  const handleCancelSurvivalSearch = () => {
    socketService.cancelSurvivalSearch();
    setIsSearchingForSurvivalMatch(false);
    setState(prev => ({ 
      ...prev, 
      isSurvivalMode: false,
      survivalTeam: []
    }));
  };

  const handleCancelSearch = () => {
    socketService.cancelSearch();
    setIsSearchingForMatch(false);
    setSearchMode(null);
    setState(prev => ({ 
      ...prev, 
      gameState: null,
      playerId: null,
      playerName: '',
      error: null
    }));
  };

  // Authentication handlers
  const handleLogin = (user: User) => {
    setState(prev => ({
      ...prev,
      user,
      showLogin: false,
      showRegister: false,
      victoryPoints: user.victory_points
    }));
    
    // Check for pending level-up data from login
    const pendingLevelUpData = localStorage.getItem('pendingLevelUpData');
    if (pendingLevelUpData) {
      try {
        const levelUpData = JSON.parse(pendingLevelUpData);
        localStorage.removeItem('pendingLevelUpData');
        
        // Set rewards data to show the rewards modal
        setRewardsData({
          oldXP: 0, // Not showing XP animation for login level-up
          newXP: user.xp,
          xpGained: 0,
          oldLevel: levelUpData.oldLevel,
          newLevel: levelUpData.newLevel,
          oldVictoryPoints: levelUpData.oldVictoryPoints,
          newVictoryPoints: levelUpData.newVictoryPoints,
          victoryPointsGained: levelUpData.vpGained,
          leveledUp: true
        });
        
        console.log('🎉 Login level-up detected! Showing rewards modal');
      } catch (error) {
        console.error('Error parsing level-up data:', error);
        localStorage.removeItem('pendingLevelUpData');
      }
    }
  };

  const handleShowRegister = () => {
    setState(prev => ({
      ...prev,
      showLogin: false,
      showRegister: true
    }));
  };

  const handleRegisterSuccess = () => {
    setState(prev => ({
      ...prev,
      showLogin: true,
      showRegister: false
    }));
  };

  const handleBackToLogin = () => {
    setState(prev => ({
      ...prev,
      showLogin: true,
      showRegister: false
    }));
  };

  const handleLogout = async () => {
    const currentUser = state.user;
    
    // Clear stored game state
    localStorage.removeItem('heroCallActiveGame');
    
    // Update UI state first
    setState(prev => ({
      ...prev,
      user: null,
      showLogin: true,
      showRegister: false,
      gameState: null,
      showSurvival: false,
      isSurvivalMode: false,
      survivalTeam: [],
      victoryPoints: 0,
      showFriendsOverlay: false,
      friendsNotificationCount: 0,
      messageNotificationCount: 0,
      unreadMessageChats: new Map(),
      openMessageChats: []
    }));
    
    // Call logout API to clean up server-side session
    if (currentUser) {
      try {
        await fetch(`${config.API_BASE_URL}/api/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: currentUser.id }),
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
      }
    }
    
    // Disconnect socket
    socketService.disconnect();
    setIsSearchingForSurvivalMatch(false);
  };

  // Friends system handlers
  const handleToggleFriendsOverlay = () => {
    setState(prev => ({
      ...prev,
      showFriendsOverlay: !prev.showFriendsOverlay,
      friendsNotificationCount: prev.showFriendsOverlay ? prev.friendsNotificationCount : 0
    }));
  };

  const handleOpenMessageChat = (playerId: number, playerName: string) => {
    setState(prev => {
      // Check if chat is already open
      const existingChat = prev.openMessageChats.find(chat => chat.targetUserId === playerId);
      if (existingChat) {
        return prev; // Chat already open
      }

      // Clear notifications for this user if they have unread messages
      const newUnreadChats = new Map(prev.unreadMessageChats);
      const hadUnreadFromThisUser = newUnreadChats.has(playerId);
      newUnreadChats.delete(playerId);

      // Check if chat is minimized and restore it
      const minimizedChat = prev.minimizedMessageChats.find(chat => chat.targetUserId === playerId);
      if (minimizedChat) {
        return {
          ...prev,
          openMessageChats: [...prev.openMessageChats, minimizedChat],
          minimizedMessageChats: prev.minimizedMessageChats.filter(chat => chat.targetUserId !== playerId),
          showFriendsOverlay: false,
          unreadMessageChats: newUnreadChats,
          // Decrease notification count if this user had unread messages
          messageNotificationCount: hadUnreadFromThisUser 
            ? Math.max(0, prev.messageNotificationCount - 1)
            : prev.messageNotificationCount
        };
      }

      return {
        ...prev,
        openMessageChats: [...prev.openMessageChats, {
          targetUserId: playerId,
          targetUsername: playerName
        }],
        showFriendsOverlay: false, // Close overlay when opening chat
        unreadMessageChats: newUnreadChats,
        // Decrease notification count if this user had unread messages
        messageNotificationCount: hadUnreadFromThisUser 
          ? Math.max(0, prev.messageNotificationCount - 1)
          : prev.messageNotificationCount
      };
    });
  };

  const handleCloseMessageChat = (playerId: number) => {
    setState(prev => ({
      ...prev,
      openMessageChats: prev.openMessageChats.filter(chat => chat.targetUserId !== playerId)
    }));
  };

  const handleMinimizeMessageChat = (playerId: number, playerName: string) => {
    setState(prev => {
      const chatToMinimize = prev.openMessageChats.find(chat => chat.targetUserId === playerId);
      if (!chatToMinimize) return prev;

      return {
        ...prev,
        openMessageChats: prev.openMessageChats.filter(chat => chat.targetUserId !== playerId),
        minimizedMessageChats: [...prev.minimizedMessageChats, {
          targetUserId: playerId,
          targetUsername: playerName
        }]
      };
    });
  };

  const handleMessageIconClick = () => {
    // If there are unread messages, open the most recent one
    if (state.unreadMessageChats.size > 0) {
      // Get the first unread chat (user ID and username)
      const [firstUnreadUserId, firstUnreadUsername] = Array.from(state.unreadMessageChats)[0];
      
      // Open the chat with this user
      handleOpenMessageChat(firstUnreadUserId, firstUnreadUsername);
      
      console.log('Opening message chat for:', firstUnreadUsername, '(ID:', firstUnreadUserId, ')');
    }
    // If there are minimized chats, restore the most recent one
    else if (state.minimizedMessageChats.length > 0) {
      const firstMinimized = state.minimizedMessageChats[0];
      handleOpenMessageChat(firstMinimized.targetUserId, firstMinimized.targetUsername);
    }
  };

  const handleCollectionStateChange = (isOpen: boolean) => {
    setState(prev => ({
      ...prev,
      showCollection: isOpen
    }));
  };

  const handleFavoritesChange = (favoriteHeroes: string[]) => {
    setState(prev => {
      if (!prev.user) return prev;
      
      return {
        ...prev,
        user: {
          ...prev.user,
          favorite_heroes: favoriteHeroes
        }
      };
    });
  };

  // Spectator handlers
  const handleSpectateGame = (gameId: string, spectatingPlayerId: string) => {
    console.log('👁️ Attempting to spectate game:', gameId, 'player:', spectatingPlayerId);
    socketService.spectateGame(gameId, spectatingPlayerId);
  };

  const handleSpectatePlayer = (_playerName: string) => {
    // This is handled directly by FriendsOverlay calling socketService.spectateGame
    // after receiving player-spectatable-result
    // This function is kept for interface compatibility
  };

  const handleStopSpectating = () => {
    console.log('👁️ Stopping spectation');
    socketService.leaveSpectate();
    setState(prev => ({
      ...prev,
      gameState: null,
      isSpectating: false,
      spectatingPlayerId: null,
      spectators: [],
      battleLog: []
    }));
  };

  const getCurrentPlayer = (): Player | null => {
    if (!state.gameState || !state.playerId) {
      return null;
    }
    const player = state.gameState.players.find(p => p.id === state.playerId) || null;
    return player;
  };

  const getOpponentPlayer = (): Player | null => {
    if (!state.gameState || !state.playerId) return null;
    const opponent = state.gameState.players.find(p => p.id !== state.playerId) || null;
    return opponent;
  };

  const renderGameContent = () => {
    // Show login/register pages if user is not authenticated
    if (!state.user) {
      if (state.showRegister) {
        return (
          <RegisterPage
            onRegisterSuccess={handleRegisterSuccess}
            onBackToLogin={handleBackToLogin}
          />
        );
      } else {
        return (
          <LoginPage
            onLogin={handleLogin}
            onShowRegister={handleShowRegister}
          />
        );
      }
    }
    
    if (state.showSurvival) {
      return (
        <SurvivalMode
          onReturnToLobby={handleReturnToLobby}
          onStartBattle={handleSurvivalBattle}
          onCancelSearch={handleCancelSurvivalSearch}
          isSearchingForMatch={isSearchingForSurvivalMatch}
          user={state.user}
          rewardsData={rewardsData || undefined}
        />
      );
    }

    if (state.showGauntlet) {
      return (
        <GauntletMode
          onReturnToLobby={() => setState(prev => ({ ...prev, showGauntlet: false }))}
          user={state.user}
        />
      );
    }

    // Show GameLobby if we don't have a game state OR if we're in waiting phase (still matchmaking)
    if (!state.gameState || state.gameState.phase === 'waiting') {
      return (
        <GameLobby
          onStartGame={handleJoinGame}
          onStartFriendlyGame={handleFriendlyGame}
          onStartSurvival={handleStartSurvival}
          onStartGauntlet={handleStartGauntlet}
          onSpectateGame={handleSpectateGame}
          victoryPoints={state.victoryPoints}
          user={state.user}
          onLogout={handleLogout}
          isSearching={isSearchingForMatch || (state.gameState?.phase === 'waiting')}
          searchMode={searchMode}
          onCancelSearch={handleCancelSearch}
          gameState={state.gameState}
          onCollectionStateChange={handleCollectionStateChange}
          onFavoritesChange={handleFavoritesChange}
        />
      );
    }

    // Special handling for spectators
    if (state.isSpectating && state.spectatingPlayerId) {
      const spectatedPlayer = state.gameState.players.find(p => p.id === state.spectatingPlayerId);
      const otherPlayer = state.gameState.players.find(p => p.id !== state.spectatingPlayerId) || null;
      
      if (!spectatedPlayer) {
        return <div>Error: Could not find spectated player</div>;
      }

      // Route spectators directly to battle phase with the spectated player's perspective
      if (state.gameState.phase === 'draft' || state.gameState.phase === 'setup') {
        return <div>Waiting for battle to start...</div>;
      }

      if (state.gameState.phase === 'initiative' || state.gameState.phase === 'battle' || state.gameState.phase === 'ended') {
        return (
          <BattlePhase
            gameState={state.gameState}
            currentPlayer={spectatedPlayer}
            opponent={otherPlayer}
            playerId={state.spectatingPlayerId}
            onReturnToLobby={handleReturnToLobby}
            isSurvivalMode={state.isSurvivalMode}
            isSpectating={true}
            spectatingPlayerId={state.spectatingPlayerId}
            onStopSpectating={handleStopSpectating}
            spectators={state.spectators}
            timekeeperAbilitySelection={state.timekeeperAbilitySelection}
            onClearTimekeeperSelection={() => setState(prev => ({ ...prev, timekeeperAbilitySelection: undefined }))}
            rewardsData={rewardsData || undefined}
          />
        );
      }

      return <div>Unknown game phase</div>;
    }

    const currentPlayer = getCurrentPlayer();
    const opponent = getOpponentPlayer();

    if (!currentPlayer) {
      return <div>Loading...</div>;
    }

    switch (state.gameState.phase) {
      case 'draft':
      case 'setup':
        return (
          <DraftPhase
            gameState={state.gameState}
            currentPlayer={currentPlayer}
            opponent={opponent}
            allHeroes={state.allHeroes}
          />
        );

      case 'initiative':
      case 'battle':
      case 'ended': // Keep battle phase active even when game ends
        return (
          <BattlePhase
            gameState={state.gameState}
            currentPlayer={currentPlayer}
            opponent={opponent}
            playerId={state.playerId!}
            onReturnToLobby={handleReturnToLobby}
            isSurvivalMode={state.isSurvivalMode}
            isSpectating={state.isSpectating}
            spectatingPlayerId={state.spectatingPlayerId || undefined}
            onStopSpectating={handleStopSpectating}
            spectators={state.spectators}
            timekeeperAbilitySelection={state.timekeeperAbilitySelection}
            onClearTimekeeperSelection={() => setState(prev => ({ ...prev, timekeeperAbilitySelection: undefined }))}
            rewardsData={rewardsData || undefined}
          />
        );

      default:
        return <div>Unknown game phase: {state.gameState.phase}</div>;
    }
  };

  
  // Helper function to render advantage roll information
  const renderAdvantageRoll = (entry: BattleLogEntry) => {
    if (!entry.attackRoll || !entry.attackTotal) return null;
    
    // Check if this is a Timekeeper commanded ability
    if (entry.attackRoll && (entry as any).isTimekeeperCommand) {
      return (
        <span className="roll-info timekeeper-command">
          {' '}(Commanded by {(entry as any).commandingHero} - Auto-hit{entry.crit ? ' with CRITICAL!' : ''})
        </span>
      );
    }
    
    if (entry.advantageInfo) {
      const { type, roll1, roll2, chosen } = entry.advantageInfo;
      return (
        <span className="roll-info">
          {' '}({type}: 
          <span className={roll1 === chosen ? 'advantage-chosen' : ''}>{roll1}</span>
          {' '}and{' '}
          <span className={roll2 === chosen ? 'advantage-chosen' : ''}>{roll2}</span>
          , chose {chosen}+{entry.attackTotal - entry.attackRoll} = {entry.attackTotal})
        </span>
      );
    }
    
    return (
      <span className="roll-info">
        {' '}(attack: {entry.attackRoll}+{entry.attackTotal - entry.attackRoll} = {entry.attackTotal})
      </span>
    );
  };

  const renderSidebar = () => {
    if (!state.gameState || state.isTransitioningToBattle || state.gameState.phase === 'waiting') return null;
    
    const currentPlayer = getCurrentPlayer();
    const opponent = getOpponentPlayer();
    
    return (
      <aside className="game-sidebar">
        <div className="sidebar-header">
          <h2>Hero's Call</h2>
          {!state.isConnected && <div className="connection-status">Connecting...</div>}
        </div>
        
        {/* Survival Mode Information */}
        {state.isSurvivalMode && (
          <div className="survival-info">
            <div className="survival-stats">
              <div className="survival-wins">🏆 Wins: {state.survivalWins}</div>
              <div className="survival-losses">💀 Losses: {state.survivalLosses}</div>
            </div>
          </div>
        )}
        
        <div className="game-info">
          {/* Draft Phase Information */}
          {state.gameState.phase === 'draft' && (
            <div className="draft-info">
              {currentPlayer && opponent && (
                <div className="matchup-display">
                  <span className="player-name-sidebar">{currentPlayer.name}</span>
                  <span className="vs-text-sidebar">vs</span>
                  <span className="opponent-name-sidebar">{opponent.name}</span>
                </div>
              )}
              {currentPlayer && (
                <div className="turn-status">
                  {(currentPlayer.team?.length || 0) < state.gameState.currentDraftPhase 
                    ? "● Your turn to pick" 
                    : "⏳ Waiting for opponent"}
                </div>
              )}
              
              {/* Banned Cards Section */}
              {currentPlayer?.bannedCard && opponent?.bannedCard && (
                <div className="banned-cards-section">
                  <h3>BANNED CARDS</h3>
                  <div className="banned-cards-subtitle">
                    These cards cannot be picked
                  </div>
                  
                  <div className="banned-cards-list">
                    {[currentPlayer.bannedCard, opponent.bannedCard].filter(Boolean).map((cardName, index) => {
                      const bannedByPlayer = cardName === currentPlayer.bannedCard;
                      return (
                        <div key={index} className="banned-card-item">
                          <img 
                            src={`http://localhost:3001/hero-images/${cardName.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
                            alt={cardName}
                            className="banned-card-image"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vPC90ZXh0Pjwvc3ZnPg==';
                            }}
                          />
                          <span className="banned-card-name">{cardName}</span>
                          <span className="banned-by-label">{bannedByPlayer ? '(You)' : '(Opp.)'}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="banned-cards-count">
                    2 cards banned
                  </div>
                </div>
              )}
              
              {/* Abandon Draft Button */}
              <button
                onClick={() => {
                  socketService.abandonDraft();
                }}
                className="abandon-draft-button"
                title="Return to lobby without rewards"
              >
                ✕ ABANDON DRAFT
              </button>
            </div>
          )}
          
          {/* Setup Phase Information */}
          {state.gameState.phase === 'setup' && (
            <div className="setup-info">
              {currentPlayer && opponent && (
                <div className="matchup-display">
                  <span className="player-name-sidebar">{currentPlayer.name}</span>
                  <span className="vs-text-sidebar">vs</span>
                  <span className="opponent-name-sidebar">{opponent.name}</span>
                </div>
              )}
              
              {currentPlayer && opponent && (
                <div className="turn-status">
                  {!currentPlayer.attackOrder || currentPlayer.attackOrder.length !== 3
                    ? "⚔️ Set your attack order"
                    : opponent.attackOrder && opponent.attackOrder.length === 3
                    ? "✅ Both players ready!"
                    : "⏳ Waiting for opponent"}
                </div>
              )}
              
              {/* Abandon Draft Button */}
              <button
                onClick={() => {
                  socketService.abandonDraft();
                }}
                className="abandon-draft-button"
                title="Return to lobby without rewards"
              >
                ✕ ABANDON DRAFT
              </button>
            </div>
          )}
          

          
          {/* Battle Phase Information - Combined Active Hero and Battle Log */}
          {state.gameState.phase === 'battle' && (
            <div className="battle-combined-info">
              <h3>Battle</h3>
              {((currentPlayer && opponent) || state.isSpectating) ? (
                <>
                  <div className="turn-info">
                    {(() => {
                      if (state.isSpectating) {
                        // For spectators, show which player's turn it is
                        const activePlayerIndex = state.gameState.currentTurn;
                        const activePlayer = state.gameState.players[activePlayerIndex];
                        return activePlayer ? (
                          <div className="spectator-turn">👁️ Watching: {activePlayer.name}'s Turn</div>
                        ) : null;
                      }
                      
                      const playerIndex = state.gameState.players.findIndex(p => p.id === state.playerId);
                      return state.gameState.currentTurn === playerIndex ? (
                        <div className="current-turn">🔥 Your Turn</div>
                      ) : (
                        <div className="opponent-turn">⏳ Opponent's Turn</div>
                      );
                    })()}
                  </div>
                  

                  
                  {/* Active Hero Information */}
                  {(() => {
                    // Use the backend's activeHero information for accurate display
                    if (!state.gameState?.activeHero) return null;
                    
                    const activePlayerIndex = state.gameState?.activeHero?.playerIndex;
                    const activePlayer = activePlayerIndex !== undefined ? state.gameState?.players?.[activePlayerIndex] : undefined;
                    const activeHero = activePlayer?.team?.find(h => h.name === state.gameState?.activeHero?.name);
                    
                    if (!activeHero) return null;
                    
                    return (
                      <div className="active-hero">
                        <h4>Active Hero</h4>
                        <div className="hero-name">{activeHero.name}</div>
                        <div className="hero-hp">
                          HP: {activeHero.currentHP || activeHero.HP}/{activeHero.HP}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Battle Log - Connected to Active Hero */}
                  <div className="battle-log-section">
                    <h4>Battle Log</h4>
                    <div className="log-entries">
                      {state.battleLog.length > 0 ? (
                        state.battleLog.map((entry) => (
                          <div key={entry.id} className="log-entry">
                            <div className="log-action">
                              {/* Check if this is a comprehensive log entry with formatted message */}
                              {typeof entry.action === 'string' && entry.action?.includes('used') && entry.action?.includes('→') ? (
                                // New comprehensive format: "Hero used Ability on Target → HIT for X damage"
                                <span dangerouslySetInnerHTML={{
                                  __html: entry.action
                                    .replace(
                                      /([\w']+)\s+used\s+([^→]+?)\s+on\s+([^→]+?)\s*→/,
                                      entry.isSpecial 
                                        ? '<span class="hero-name">$1</span> used <span class="special-name">$2</span> on <span class="target-name">$3</span> →'
                                        : '<span class="hero-name">$1</span> used <span class="ability-name">$2</span> on <span class="target-name">$3</span> →'
                                    )
                                    .replace(
                                      /^(<span class="hero-name">[\w']+<\/span> used <span class="(?:ability|special)-name">[^<]+<\/span>)\s*→/,
                                      '$1 →'
                                    )
                                }} />
                              ) : typeof entry.action === 'string' && (entry.action.includes('used') || entry.action.includes('activates')) ? (
                                // Comprehensive message that already contains the full text - display as-is with styling
                                <span dangerouslySetInnerHTML={{
                                  __html: entry.action.replace(
                                    /([\w\s']+)'s\s+([\w\s-]+)\s+activates/,
                                    '<span class="hero-name">$1</span>\'s <span class="special-name">$2</span> activates'
                                  ).replace(
                                    /([\w']+)\s+used\s+([\w\s-]+?)(?=\s+on|$)/,
                                    '<span class="hero-name">$1</span> used <span class="special-name">$2</span>'
                                  )
                                }} />
                              ) : entry.isNonStandardLog ? (
                                // Non-standard logs (like poison) - display action as-is without "used" prefix
                                <span>{entry.action}</span>
                              ) : entry.isSpecial && entry.specialName ? (
                                // Special ability format with gold styling
                                <>
                                  <span className="hero-name">{typeof entry.attacker === 'string' ? entry.attacker : (entry.attacker as any)?.name || 'Unknown'}</span> used <span className="special-name">{entry.specialName}</span>
                                  {entry.triggerContext && <span className="trigger-context"> ({typeof entry.triggerContext === 'string' ? entry.triggerContext : 'trigger'})</span>}
                                </>
                              ) : (
                                // Legacy format: "Attacker used Action"
                                <>
                                  <span className="hero-name">{typeof entry.attacker === 'string' ? entry.attacker : (entry.attacker as any)?.name || 'Unknown'}</span> used {entry.abilityName ? (
                                    <span className="ability-name">{entry.abilityName}</span>
                                  ) : (typeof entry.action === 'string' ? entry.action : 'Unknown Action')}
                                </>
                              )}
                              {renderAdvantageRoll(entry)}
                            </div>
                            <div className="log-result">
                              {/* Handle different ability types */}
                              {entry.type === 'special_activation' ? (
                                // Special ability activation
                                <span className="special-ability">
                                  ✨ <span className="special-name">{entry.specialName}</span> activated!
                                </span>
                              ) : entry.action?.includes('Twin Spell') ? (
                                // Twin Spell activation
                                <span className="special-ability">🔮 Twin Spell activated! Casting again...</span>
                              ) : entry.type === 'resurrection' ? (
                                // Angel Resurrection
                                <span className="heal">
                                  👼 <span className="hero-name">{entry.caster}</span> used <span className="special-name">Resurrection</span> and restored <span className="target-name">{entry.target}</span> to {entry.healing} HP
                                  {entry.description && <span className="heal-info"> - {entry.description}</span>}
                                </span>
                              ) : entry.type === 'health_link_reflection' ? (
                                // Angel Health Link reflection
                                <span className="special-reflection">
                                  💫 <span className="special-name">Health Link</span> reflected {entry.damage} damage from <span className="hero-name">{entry.source}</span> to <span className="target-name">{entry.target}</span>
                                </span>
                              ) : entry.action?.includes('heals') ? (
                                // Healing abilities
                                <>
                                  <span className="heal">Healed for {entry.healing} HP</span>
                                  {entry.healRoll && entry.healRoll.length > 0 && (
                                    <span className="heal-roll-info"> (healing: {entry.healRoll.join('+')} = {entry.healing})</span>
                                  )}
                                </>
                              ) : entry.action?.includes('stack') ? (
                                // Buff/stack abilities
                                <span className="buff">Effect applied successfully</span>
                              ) : (entry.action?.includes('applies') || entry.action?.includes('grants')) ? (
                                // Other buffs/debuffs
                                <span className="status">Status effect applied</span>
                              ) : entry.hit ? (
                                // Damage abilities
                                <>
                                  {entry.crit && <span className="crit">CRITICAL HIT! </span>}
                                  {entry.damage !== undefined && (
                                    <>
                                      <span className="hit">Hit <span className="target-name">{entry.target || 'Unknown'}</span> for {entry.damage} damage</span>
                                      {entry.isSpecial && entry.specialName && (
                                        <span className="special-note"> (from <span className="special-name">{entry.specialName}</span>)</span>
                                      )}
                                    </>
                                  )}
                                  {entry.damageRoll && entry.damageRoll.length > 0 && (
                                    <span className="damage-roll-info"> (damage: {entry.damageRoll.join('+')} = {entry.damage})</span>
                                  )}
                                  {/* Show healing for lifesteal abilities */}
                                  {entry.healing && entry.healing > 0 && (
                                    <span className="heal">
                                      {entry.action?.includes('deals damage and heals') ? ' and lifestole' : ' and healed for'} {entry.healing} HP
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="miss">Missed <span className="target-name">{entry.target || 'Unknown'}</span>{entry.isSpecial && entry.specialName && <span className="special-note"> (from <span className="special-name">{entry.specialName}</span>)</span>}</span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="log-placeholder">Battle actions will appear here</div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    );
  };



  return (
    <div className="App">
      <div className="app-layout" style={{ display: state.isTransitioningToBattle ? 'none' : 'flex' }}>
        {renderSidebar()}
        <main className="game-content">
          {renderGameContent()}
        </main>
      </div>


      {/* Survival Battle Transition */}
      {state.isTransitioningToBattle && (
        <SurvivalBattleTransition
          selectedTeam={state.survivalTeam}
          onTransitionComplete={() => {
            console.log('🎬 Transition complete - switching to battle');
            setState(prev => {
              console.log('🔍 Transition complete state check:');
              console.log('  - gameState.phase:', prev.gameState?.phase);
              console.log('  - gameState:', prev.gameState);
              
              return {
                ...prev,
                isTransitioningToBattle: false,
                showSurvival: false
              };
            });
          }}
        />
      )}

      {/* Friends System - show everywhere except in collection */}
      {state.user && !state.showCollection && (
        <>
          {/* Friends Icon */}
          <FriendsIcon
            onClick={handleToggleFriendsOverlay}
            hasNotifications={state.friendsNotificationCount > 0}
            notificationCount={state.friendsNotificationCount}
            isOpen={state.showFriendsOverlay}
          />
          
          {/* Message Icon */}
          <MessageIcon 
            onClick={handleMessageIconClick}
            hasNotifications={state.messageNotificationCount > 0}
            notificationCount={state.messageNotificationCount}
            hasMinimizedChats={state.minimizedMessageChats.length > 0}
          />          {/* Friends Overlay */}
          {state.showFriendsOverlay && (
            <FriendsOverlay
              onClose={handleToggleFriendsOverlay}
              onOpenMessage={handleOpenMessageChat}
              onSpectatePlayer={handleSpectatePlayer}
              currentUserId={state.user!.id}
            />
          )}

          {/* Message Chat Windows */}
          {state.openMessageChats.map((chat) => (
            <MessageChat
              key={chat.targetUserId}
              targetUserId={chat.targetUserId}
              targetUsername={chat.targetUsername}
              currentUserId={state.user!.id}
              onClose={() => handleCloseMessageChat(chat.targetUserId)}
              onMinimize={() => handleMinimizeMessageChat(chat.targetUserId, chat.targetUsername)}
            />
          ))}
        </>
      )}

      {/* Draft Abandoned Modal */}
      {state.showDraftAbandonedModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Draft Abandoned</h2>
            <p>{state.draftAbandonedMessage}</p>
            <button
              className="action-button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  showDraftAbandonedModal: false,
                  draftAbandonedMessage: ''
                }));
              }}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
