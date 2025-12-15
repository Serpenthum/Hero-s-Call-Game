// Dragonflow Game Types

export type DragonType = 'fire' | 'water' | 'earth' | 'wood' | 'metal';

export interface DragonCard {
  id: string;
  type: DragonType;
  owner: 'player1' | 'player2' | null;
}

export interface FlowPosition {
  columnIndex: number; // 0-4
  card: DragonCard | null;
  isBlocked: boolean;
  blockedBy: string | null; // card id that's blocking this space
}

export interface GameBoard {
  playerFlow: FlowPosition[];
  opponentFlow: FlowPosition[];
  playerHand: DragonCard[];
  opponentHand: DragonCard[];
  deck: DragonCard[];
  discardPile: DragonCard[];
  playerOre: number;
  opponentOre: number;
}

export interface ActionCount {
  summon: number;
  attack: number;
  draw: number;
  gainOre: number;
  spendOre: number;
}

export interface HarmonizationPrompt {
  cardId: string;
  dragonType: DragonType;
  effect: string;
  columnIndex: number;
}

export type GamePhase = 'choose-starter' | 'playing' | 'game-over';

export interface DragonflowGameState {
  phase: GamePhase;
  currentTurn: 'player1' | 'player2';
  choosingPlayer?: 'player1' | 'player2';
  board: GameBoard;
  actionsUsed: ActionCount;
  actionsRemaining: number;
  selectedCard: string | null;
  selectedFlowPosition: number | null;
  pendingHarmonization: HarmonizationPrompt | null;
  winner: 'player1' | 'player2' | null;
  harmonizedThisTurn: string[]; // Card IDs that have already harmonized this turn
}

// Dragon harmonization rules
export const HARMONIZATION_RULES: Record<DragonType, DragonType> = {
  fire: 'wood',    // Wood harmonizes Fire
  earth: 'fire',   // Fire harmonizes Earth
  metal: 'earth',  // Earth harmonizes Metal
  water: 'metal',  // Metal harmonizes Water
  wood: 'water'    // Water harmonizes Wood
};

// Dragon combat rules (what each dragon can defeat)
export const COMBAT_RULES: Record<DragonType, DragonType> = {
  fire: 'metal',
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire'
};

// Dragon abilities descriptions
export const DRAGON_ABILITIES: Record<DragonType, string> = {
  water: 'Move a Dragon Spirit to another space in the Flow. Swap if occupied.',
  fire: 'Destroy one Dragon Spirit.',
  earth: 'Block one space in the Flow until this dragon is moved.',
  wood: 'Draw one card.',
  metal: 'Gain two Ore.'
};
