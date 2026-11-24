import type { Hero } from '../../types';

// The card out of a pack (one per pack), as the server's purchase reply lists it.
export type PackCardKind = 'new' | 'repeat' | 'holo' | 'holo_upgrade';

export interface PackCard {
  name: string;
  kind: PackCardKind;
  hero: Hero;
  /** Whether the server drew this card holographic. Older servers may leave it out. */
  holo?: boolean;
}

export interface PackResult {
  cards: PackCard[];
  coinsBack: number;
  newVP: number;
  /** Shards this pack paid (0 from a server that sends none). */
  shardsGained: number;
  /** The shard balance after the pack, when the server sent it. */
  shards?: number;
}

export const isHoloKind = (kind: PackCardKind): boolean => kind === 'holo' || kind === 'holo_upgrade';

/**
 * Whether the card's face is drawn holographic (the takeover stays for the holo kinds only).
 * The server's `holo` flag decides when it sent one; otherwise the holo kinds are holographic.
 */
export const isHoloCard = (card: PackCard): boolean =>
  typeof card.holo === 'boolean' ? card.holo : isHoloKind(card.kind);
