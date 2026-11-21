import type { Hero } from '../../types';

// One card out of a pack, as the server's purchase reply lists it.
export type PackCardKind = 'new' | 'repeat' | 'holo' | 'holo_upgrade';

export interface PackCard {
  name: string;
  kind: PackCardKind;
  hero: Hero;
  /** Drawn holographic: a holo kind, or a repeat of a hero the player already owns holographic. */
  holo?: boolean;
}

export interface PackResult {
  cards: PackCard[];
  coinsBack: number;
  newVP: number;
}

export const isHoloKind = (kind: PackCardKind): boolean => kind === 'holo' || kind === 'holo_upgrade';

/** Whether the card's face is drawn holographic (the takeover stays for the holo kinds only). */
export const isHoloCard = (card: PackCard): boolean => isHoloKind(card.kind) || !!card.holo;
