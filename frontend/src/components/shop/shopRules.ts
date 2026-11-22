// Pure shop rules: prices, purchase messages, the sale clock and pack ownership.

export const HERO_PRICE = 5;
export const PACK_PRICE = 12;

export const NOT_ENOUGH_COINS = "You don't have enough coins.";
export const NOT_ENOUGH_MS = 2000;
export const ERROR_MS = 3000;

const ROTATION_MS = 15 * 60 * 1000;

const KNOWN_SERVER_TEXTS = new Set([
  'Not enough to buy this.',
  'Hero already owned',
  'Hero not available',
  'That hero is no longer in the shop. The rotation has changed.',
]);

const PURCHASE_FAILED = 'Purchase failed. Please try again.';

/** Shows a server message only when it is one we know is safe for students. */
export function shopErrorText(serverMessage: unknown): string {
  return typeof serverMessage === 'string' && KNOWN_SERVER_TEXTS.has(serverMessage)
    ? serverMessage
    : PURCHASE_FAILED;
}

/** Time until the next 15-minute shop rotation (local clock quarter hours). */
export function saleTimeLeft(now: Date): { label: string; fraction: number; seed: number } {
  const nextRotationMinute = (Math.floor(now.getMinutes() / 15) + 1) * 15;
  const nextRotation = new Date(now);
  if (nextRotationMinute >= 60) {
    nextRotation.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    nextRotation.setMinutes(nextRotationMinute, 0, 0);
  }

  const diff = nextRotation.getTime() - now.getTime();
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return {
    label: `${minutes}m ${seconds}s`,
    fraction: diff / ROTATION_MS,
    seed: Math.floor(now.getTime() / ROTATION_MS),
  };
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
