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

const PURCHASE_FAILED = 'Purchase failed. Please try again.';

/** Shows a server message only when it is one we know is safe for students. */
export function shopErrorText(serverMessage: unknown): string {
  return typeof serverMessage === 'string' && KNOWN_SERVER_TEXTS.has(serverMessage)
    ? serverMessage
    : PURCHASE_FAILED;
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
