// Type definitions for Hero's Call game

export interface Effect {
  type: string;
  value?: string | number;
  target?: string;
  trigger?: string;
  condition?: string;
  duration?: number;
  duration_unit?: string;
  frequency?: string;
  stat?: string;
  stacks?: number;
  max?: number;
  behavior?: {
    trigger: string;
    action: string;
    value: string;
    target: string;
  };
  cost?: {
    type: string;
    unit: string;
    amount: number;
  };
  actions?: Effect[];
  choices?: Effect[];
  outcomes?: {
    roll: number;
    action: Effect | Effect[];
  }[];
  roll?: string;
  effect?: string;
  max_stacks?: number;
  applies_to?: string[];
  permanent?: boolean;
}

export interface Ability {
  name: string;
  description: string;
  effects: Effect[];
  requires_ally_target?: boolean;
  secondary_effects?: Effect[];
  category?: string;
  target_type?: string;
  primary_effects?: Effect[];
}

export interface PassiveBuff {
  sourceHero: string;
  sourceName: string; // Name of the special/ability
  stat: string; // 'accuracy', 'damage', etc.
  value: number;
  permanent: boolean; // true for Warlock-style permanent buffs
}

export interface Hero {
  name: string;
  HP: number;
  Defense: number;
  Accuracy: string;
  BasicAttack: string;
  Ability: Ability[];
  Special: Ability[];
  disabled?: boolean; // Whether hero is disabled/not available in game
  
  // Runtime properties
  currentHP?: number;
  maxHP?: number;
  statusEffects?: StatusEffects;
  passiveBuffs?: PassiveBuff[];
  modifiedAccuracy?: string; // Display version with buffs applied
  modifiedBasicAttack?: string; // Display version with damage buffs
  companions?: Array<{ type: string; hp: number }>; // For summoner heroes like Beast Tamer
  id?: string;
  resurrected?: boolean; // Flag for resurrection animation
}

export interface StatusEffects {
  poison: number;
  beast_active?: boolean;
  totem_count?: number;
  turret_count?: number;
  taunt: {
    target: string;
    duration: number;
  } | null;
  inspiration: number;
  silenced: boolean | { active: boolean; duration: number; source?: string; description?: string; tooltip?: string };
  disableAttack: boolean | { active: boolean; duration: number };
  cannotTargetWithAbility?: {
    owner: string;
    duration: number;
    duration_unit: string;
    source: string;
  };
  untargetable: boolean;
  damageStacks?: number;
  defenseReduction?: number;
  grantedAdvantage?: boolean;
  grantAdvantage?: {
    duration: number;
    duration_unit: string;
    source: string;
  };
  statModifiers?: {
    [stat: string]: number;
  };
  statModifierDurations?: {
    [key: string]: number;
  };
  statModifierCasters?: {
    [key: string]: string;
  };
  statModifierUnits?: {
    [key: string]: string;
  };
  statModifierAbilities?: {
    [key: string]: string;
  };
  rideDownDebuff?: {
    source: string;
    maxHP: number; // Store max HP to detect full healing
  };
  arcaneShieldAvailable?: boolean;
  health_link?: boolean; // Applied by Angel's Health Link ability
  resurrectUsed?: boolean; // Track if Angel has used resurrection
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  team: Hero[];
  draftCards?: Hero[];
  bannedCard?: string | null;
  attackOrder: string[];
  currentHeroIndex: number;
  hasUsedAttack: boolean;
  hasUsedAbility: boolean;
  hasUsedSpecial?: boolean;
  usedAbilities?: string[];
  usedAttacks?: number;
  selectedTarget?: string | null;
  initiativeRoll?: number;
  monkAttacksRemaining?: number;
  oneTwoPunchAttacksRemaining?: number;
  profile_icon?: string;
  isReady?: boolean;
  disconnectionTimer?: {
    playerId: string;
    playerName: string;
    remainingTime: number;
    surrendered: boolean;
  } | null;
}

export interface GameState {
  id: string;
  phase: 'waiting' | 'draft' | 'setup' | 'initiative' | 'battle' | 'ended';
  players: Player[];
  currentTurn: number;
  currentHeroTurn?: number;
  activeHero?: {
    name: string;
    playerIndex: number;
    heroIndex: number;
  } | null;
  currentDraftPhase: number;
  draftTurn: number;
  winner: string | null;
  draftCards?: {
    player1: string[];
    player2: string[];
  };
  battleLog?: any[]; // Backend battle log entries
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  isCritical: boolean;
  roll: number; // Legacy - prefer attackRoll
  total: number; // Legacy - prefer attackTotal
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
  targetHP: number;
  attacker: string;
  target: string;
  statusEffects?: any[];
  deathTriggerEffects?: any[];
  monkDeflected?: boolean;
  deflectingMonk?: string;
  deflectCounterDamage?: number;
  gameState?: GameState;
}

export interface DiceRoll {
  total: number;
  rolls: number[];
  isCritical?: boolean;
}

export interface OnlinePlayer {
  id: number;
  username: string;
  isInGame: boolean;
}

export interface FriendRequest {
  id: number;
  username: string;
  created_at: string;
}

export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  sender_username: string;
  receiver_username: string;
  message: string;
  created_at: string;
}

export interface SocketEvents {
  // Client to Server
  'authenticate': (data: { userId: number }) => void;
  'join-game': (data: { name: string; mode?: 'draft' | 'random' | 'friendly'; roomName?: string }) => void;
  'join-survival-game': (data: { name: string; team: Hero[] }) => void;
  'cancel-survival-search': () => void;
  'cancel-search': () => void;
  'create-friendly-room': (data: { roomName: string; playerName: string }) => void;
  'join-friendly-room': (data: { roomName: string; playerName: string }) => void;
  'ban-card': (data: { cardName: string }) => void;
  'pick-card': (data: { cardName: string }) => void;
  'set-attack-order': (data: { heroOrder: string[] }) => void;
  'roll-initiative': () => void;
  'choose-turn-order': (data: { goFirst: boolean }) => void;
  'select-target': (data: { targetId: string }) => void;
  'basic-attack': (data: { targetId: string }) => void;
  'use-ability': (data: { abilityIndex: number; targetId: string; allyTargetId?: string }) => void;
  'use-timekeeper-selected-ability': (data: { timekeeperTargetId: string; allyTargetId: string; selectedAbilityIndex: number }) => void;
  'activate-special': () => void;
  'end-turn': () => void;
  'auto-draft': () => void;
  'reconnect-game': (data: { gameId: string; playerName: string }) => void;
  'get-survival-state': () => void;
  'reset-survival-state': () => void;  
  'surrender-game': () => void;
  'return-to-lobby': () => void;
  
  // Gauntlet mode events (client to server)
  'start-gauntlet-run': (data: { name: string }) => void;
  'gauntlet-shop-action': (data: GauntletShopAction) => void;
  'set-gauntlet-battle-team': (data: { teamIndices: number[] }) => void;
  'queue-for-gauntlet-trial': () => void;
  'cancel-gauntlet-queue': () => void;
  'complete-gauntlet-hero-offer': (data: { selectedHeroId?: string; useReroll?: boolean; sacrificeIndex?: number }) => void;
  'abandon-gauntlet-run': () => void;
  
  // Friends system events
  'get-online-players': () => void;
  'send-friend-request': (data: { username: string }) => void;
  'respond-friend-request': (data: { requesterId: number; accept: boolean }) => void;
  'get-friend-requests': () => void;
  'remove-friend': (data: { friendId: number }) => void;
  'send-message': (data: { targetUserId: number; message: string }) => void;
  'get-messages': (data: { targetUserId: number; limit?: number }) => void;

  // Spectator events
  'get-spectatable-games': () => void;
  'check-player-spectatable': (data: { playerId: string }) => void;
  'spectate-game': (data: { gameId: string; spectatingPlayerId: string }) => void;
  'leave-spectate': () => void;
  'get-spectator-info': (data: { gameId: string }) => void;

  // Server to Client
  'authentication-success': (data: { userId: number }) => void;
  'authentication-failed': (data: { message: string }) => void;
  'force-logout': (data: { message: string }) => void;
  'join-result': (data: { success: boolean; gameId: string; playerId: string; players: Player[]; gameReady: boolean; draftCards?: any; mode?: 'draft' | 'random' | 'friendly' | 'survival'; roomName?: string }) => void;
  'survival-match-found': (data: { success: boolean; gameId: string; playerId: string; players: Player[]; gameReady: boolean }) => void;
  'survival-search-cancelled': (data: { success: boolean }) => void;
  'search-cancelled': (data: { success: boolean }) => void;
  'friendly-room-created': (data: { success: boolean; roomName: string; gameId: string; playerId: string; message?: string }) => void;
  'friendly-room-joined': (data: { success: boolean; roomName: string; gameId: string; playerId: string; players: Player[]; message?: string }) => void;
  'game-start': (data: { players: Player[]; draftCards?: any; gameState?: GameState }) => void;
  'ban-complete': (data: any) => void;
  'pick-complete': (data: any) => void;
  'attack-order-set': (data: any) => void;
  'initiative-rolled': (data: any) => void;
  'battle-start': (data: any) => void;
  'target-selected': (data: any) => void;
  'attack-result': (data: AttackResult) => void;
  'ability-result': (data: any) => void;
  'special-activated': (data: any) => void;
  'turn-ended': (data: any) => void;
  'auto-draft-complete': (data: any) => void;
  'reconnect-success': (data: GameState) => void;
  'reconnect-failed': (data: { message: string }) => void;
  'error': (data: { message: string }) => void;
  'survival-state-response': (data: { state: { wins: number; losses: number; usedHeroes: string[]; isActive: boolean } }) => void;
  'survival-state-update': (data: { type: 'win' | 'loss' | 'reset'; state: { wins: number; losses: number; usedHeroes: string[]; isActive: boolean }; message: string; victoryPoints?: number }) => void;
  'victory-points-update': (data: { type: string; pointsAwarded: number; totalVictoryPoints: number; gameMode?: string; message: string }) => void;
  'xp-update': (data: { xpGained: number; newXP: number; newLevel: number; leveledUp: boolean; message: string }) => void;
  'game-surrendered': (data: { success: boolean; gameId: string; winner: string; surrenderedBy: string; gameState: GameState }) => void;
  'draft-abandoned': (data: { message: string; isOpponent?: boolean }) => void;
  'abandon-draft-result': (data: { success: boolean; message?: string }) => void;
  'returned-to-lobby': (data: { success: boolean; error?: string; preservedSurvivalState?: any }) => void;
  
  // Gauntlet mode events (server to client)
  'gauntlet-run-started': (data: { success: boolean; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-shop-action-result': (data: { success: boolean; runState?: GauntletRunState; action?: string; offer?: GauntletHeroOffer[]; error?: string }) => void;
  'gauntlet-battle-team-set': (data: { success: boolean; error?: string }) => void;
  'gauntlet-match-found': (data: { gameId: string; opponentName: string }) => void;
  'gauntlet-queue-waiting': () => void;
  'gauntlet-queue-cancelled': (data: { success: boolean }) => void;
  'gauntlet-battle-complete': (data: { won: boolean; runState?: GauntletRunState; heroOffer?: GauntletHeroOffer[]; runEnded?: boolean; finalTrial?: number; rewards?: GauntletRewards }) => void;
  'gauntlet-hero-offer-result': (data: { success: boolean; runState?: GauntletRunState; offer?: GauntletHeroOffer[]; error?: string }) => void;
  'gauntlet-run-abandoned': (data: { success: boolean; finalTrial: number; rewards?: GauntletRewards }) => void;
  
  // Friends system server responses
  'online-players-response': (data: { success: boolean; onlinePlayers?: OnlinePlayer[]; totalOnline?: number; friendIds?: number[]; error?: string }) => void;
  'friend-request-response': (data: { success: boolean; message?: string; error?: string }) => void;
  'friend-request-received': (data: { from: string; fromId: number }) => void;
  'friend-response-result': (data: { success: boolean; message?: string; error?: string }) => void;
  'friend-request-accepted': (data: { from: string; fromId: number }) => void;
  'friend-requests-response': (data: { success: boolean; requests?: FriendRequest[]; error?: string }) => void;
  'message-response': (data: { success: boolean; message?: Message; error?: string }) => void;
  'message-received': (data: Message) => void;
  'messages-response': (data: { success: boolean; messages?: Message[]; error?: string }) => void;
  'remove-friend-response': (data: { success: boolean; message?: string; error?: string }) => void;
  'friend-removed': (data: { from: string; fromId: number }) => void;

  // Spectator server responses
  'spectatable-games-list': (data: { success: boolean; games: Array<{
    gameId: string;
    mode: string;
    phase: string;
    roomName: string | null;
    players: Array<{ id: string; name: string }>;
    spectatorCount: number;
    maxSpectators: number;
  }> }) => void;
  'player-spectatable-result': (data: { success: boolean; canSpectate: boolean; gameInfo?: any }) => void;
  'spectate-result': (data: { 
    success: boolean; 
    gameId?: string; 
    gameState?: GameState; 
    spectatingPlayerId?: string; 
    spectators?: Array<{ socketId: string; username: string; spectatingPlayerId: string }>; 
    error?: string 
  }) => void;
  'spectate-left': (data: { success: boolean; error?: string }) => void;
  'spectator-update': (data: { 
    type: 'joined' | 'left'; 
    spectatorUsername?: string; 
    spectatorCount: number; 
    spectatorList: Array<{ socketId: string; username: string; spectatingPlayerId: string }> 
  }) => void;
  'spectator-info-response': (data: { success: boolean; count: number; list: string[] }) => void;
  'spectated-player-disconnected': (data: { playerId: string; playerName: string }) => void;
}

export type GamePhase = GameState['phase'];

export interface TooltipData {
  keyword: string;
  description: string;
}

// =================================================================
// GAUNTLET MODE TYPES
// =================================================================

export interface HeroInstance {
  hero_id: string;
  hero: Hero;
  current_hp: number;
  max_hp: number;
  alive: boolean;
  temporary_resurrection_active: boolean;
}

export interface GauntletRunState {
  current_trial: number;
  roster: HeroInstance[];
  dead_hero_ids: string[];
  rerolls_remaining: number;
  shop_actions_remaining: number;
  battle_team_indices: number[];
  phase: 'preparation' | 'queueing' | 'battle' | 'hero_offer';
}

export interface GauntletShopAction {
  type: 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial';
  data?: any;
}

export interface GauntletHeroOffer {
  name: string;
  data: Hero;
}

export interface GauntletRewards {
  xp: number;
  victoryPoints: number;
}

export interface GauntletSocketEvents {
  // Client to Server
  'start-gauntlet-run': (data: { name: string }) => void;
  'get-gauntlet-run-state': () => void;
  'gauntlet-shop-action': (data: { action: string; heroIndex?: number; heroId?: string; selectedHeroId?: string; sacrificeIndex?: number; useReroll?: boolean }) => void;
  'set-gauntlet-battle-team': (data: { teamIndices: number[] }) => void;
  'queue-for-gauntlet-trial': () => void;
  'cancel-gauntlet-queue': () => void;
  'complete-gauntlet-hero-offer': (data: { selectedHeroId?: string; sacrificeIndex?: number; useReroll?: boolean }) => void;
  'abandon-gauntlet-run': () => void;

  // Server to Client
  'gauntlet-run-started': (data: { success: boolean; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-run-state-response': (data: { success: boolean; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-shop-action-result': (data: { success: boolean; action?: string; message?: string; offer?: GauntletHeroOffer[]; selectedHero?: string; rerolls_remaining?: number; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-battle-team-set': (data: { success: boolean; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-match-found': (data: { gameId: string; players: Player[]; initiative: any }) => void;
  'gauntlet-queue-waiting': (data: { message: string }) => void;
  'gauntlet-queue-failed': (data: { error: string }) => void;
  'gauntlet-queue-cancelled': (data: { success: boolean; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-battle-complete': (data: { won: boolean; runEnded: boolean; finalTrial?: number; runState?: GauntletRunState; heroOffer?: GauntletHeroOffer[] | null }) => void;
  'gauntlet-hero-offer-result': (data: { success: boolean; action?: string; message?: string; offer?: GauntletHeroOffer[]; selectedHero?: string; rerolls_remaining?: number; runState?: GauntletRunState; error?: string }) => void;
  'gauntlet-run-abandoned': (data: { success: boolean; finalTrial?: number; rewards?: GauntletRewards; error?: string }) => void;
}