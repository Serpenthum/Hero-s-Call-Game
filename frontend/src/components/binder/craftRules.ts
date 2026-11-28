// Crafting a hero with shards: what it costs, and whether the player can craft one now.
// The server holds the same price (backend/packs.js CRAFT_PRICE) and has the last word.

export const CRAFT_PRICE = 100;

// An owned hero is never crafted. Otherwise the player can craft with CRAFT_PRICE shards, or is short by the rest.
export function craftState(shards: number, owned: boolean): { canCraft: boolean; shortfall: number } {
  if (owned) return { canCraft: false, shortfall: 0 };
  const shortfall = Math.max(0, CRAFT_PRICE - shards);
  return { canCraft: shortfall === 0, shortfall };
}
