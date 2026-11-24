// Pure shop rules: prices, purchase messages and pack ownership.

export const PACK_PRICE = 20;

export const NOT_ENOUGH_COINS = "You don't have enough coins.";
export const NOT_ENOUGH_MS = 2000;
export const ERROR_MS = 3000;

const KNOWN_SERVER_TEXTS = new Set([
  'Not enough to buy this.',
  'Hero already owned',
  'Hero not available',
]);

// The craft route's refusals, and the login check's (an expired login, see backend/auth.js)
const KNOWN_CRAFT_TEXTS = new Set([
  'Not enough shards.',
  'You already have this hero.',
  'Hero not available',
  'Hero name is required',
  'Please log in again',
]);

const PURCHASE_FAILED = 'Purchase failed. Please try again.';

/** A server message when it is one of `known`, safe for students; otherwise `fallback`. */
function knownServerText(serverMessage: unknown, known: ReadonlySet<string>, fallback: string): string {
  return typeof serverMessage === 'string' && known.has(serverMessage) ? serverMessage : fallback;
}

/** Shows a server message only when it is one we know is safe for students. */
export function shopErrorText(serverMessage: unknown): string {
  return knownServerText(serverMessage, KNOWN_SERVER_TEXTS, PURCHASE_FAILED);
}

/** A craft refusal as the binder shows it: a known refusal as sent, anything else as `fallback`. */
export function craftErrorText(serverMessage: unknown, fallback: string): string {
  return knownServerText(serverMessage, KNOWN_CRAFT_TEXTS, fallback);
}

/** How many of a pack's heroes the player already owns. */
export function packOwnedCount(
  packHeroes: { name: string }[],
  owned: string[],
): { owned: number; total: number } {
  const ownedNames = new Set(owned);
  return {
    owned: packHeroes.filter((hero) => ownedNames.has(hero.name)).length,
    total: packHeroes.length,
  };
}
