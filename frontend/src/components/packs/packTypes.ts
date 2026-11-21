import type { Hero } from '../../types';

// One card out of a pack, as the server's purchase reply lists it.
export type PackCardKind = 'new' | 'repeat' | 'holo' | 'holo_upgrade';

export interface PackCard {
  name: string;
  kind: PackCardKind;
  hero: Hero;
}

export interface PackResult {
  cards: PackCard[];
  coinsBack: number;
  newVP: number;
}

export const isHoloKind = (kind: PackCardKind): boolean => kind === 'holo' || kind === 'holo_upgrade';
