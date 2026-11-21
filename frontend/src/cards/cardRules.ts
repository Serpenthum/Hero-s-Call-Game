// Pure rules shared by the hero card: how a card is read, when it is tiny, how big its text is.

export type ReadMode = 'tap' | 'press' | 'none';

/** An explicit `readable` wins; otherwise selectable cards are read by press, others by tap. */
export function resolveReadMode(opts: { readable?: ReadMode; isSelectable?: boolean }): ReadMode {
  if (opts.readable) return opts.readable;
  return opts.isSelectable ? 'press' : 'tap';
}

/** At or below this width (px) the card is in tiny mode. */
export const TINY_CARD_MAX_WIDTH = 129;

/**
 * Largest size from maxEm down to minEm (inclusive, stepEm apart) for which `fits` is true.
 * Returns minEm when none fit. Steps in integer hundredths to avoid float drift.
 */
export function pickTextSize(
  fits: (sizeEm: number) => boolean,
  maxEm = 1.06,
  minEm = 0.8,
  stepEm = 0.02,
): number {
  const max = Math.round(maxEm * 100);
  const min = Math.round(minEm * 100);
  const step = Math.max(1, Math.round(stepEm * 100));
  for (let h = max; h >= min; h -= step) {
    const size = h / 100;
    if (fits(size)) return size;
  }
  return minEm;
}

/**
 * The range of rules-text sizes (em of the card's own font size) the card may pick.
 * Without minTextPx this is today's range. With it, the smallest size is raised (to the next hundredth) so the
 * rules text is never under minTextPx; the card then lets its text panel grow instead of shrinking the text.
 */
export function textSizeRange(opts: {
  cardFontPx: number;
  maxEm: number;
  minEm?: number;
  minTextPx?: number;
}): { minEm: number; maxEm: number } {
  const baseMin = opts.minEm ?? 0.8;
  if (!opts.minTextPx || !(opts.cardFontPx > 0)) return { minEm: baseMin, maxEm: opts.maxEm };
  const floorEm = Math.ceil((opts.minTextPx / opts.cardFontPx) * 100 - 1e-6) / 100;
  const minEm = Math.max(baseMin, floorEm);
  return { minEm, maxEm: Math.max(opts.maxEm, minEm) };
}

export type TextFitStage = null | 'tight' | 'rail';

/**
 * The layouts a card tries, in order, until its name clears the stat rail: as drawn, tighter text spacing, then
 * smaller stat gems. Only a card with a text floor gets the extra stages; every other card fits exactly as before.
 */
export function textFitStages(minTextPx?: number): TextFitStage[] {
  return minTextPx ? [null, 'tight', 'rail'] : [null];
}

type RuleText = { name: string; description: string };
export interface RuleSection {
  label: 'Ability' | 'Special';
  name: string;
  description: string;
}

/** Every ability and then every special of a hero, as the card prints them. Bomber's special is named Explosion. */
export function ruleSections(hero: { name: string; Ability?: RuleText[]; Special?: RuleText | RuleText[] }): RuleSection[] {
  const specials = Array.isArray(hero.Special) ? hero.Special : hero.Special ? [hero.Special] : [];
  return [
    ...(hero.Ability ?? []).map(a => ({ label: 'Ability' as const, name: a.name, description: a.description })),
    ...specials.map(s => ({
      label: 'Special' as const,
      name: hero.name === 'Bomber' ? 'Explosion' : s.name,
      description: s.description,
    })),
  ];
}
