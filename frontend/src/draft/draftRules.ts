// Pure rules for the draft screen: steps, player status, ban visibility,
// order swaps, layout fit and the reveal trigger.

/** 0 Ban, 1-3 Pick, 4 Order. */
export type DraftStep = 0 | 1 | 2 | 3 | 4;

export const STEP_LABELS = ['Ban', 'Pick 1', 'Pick 2', 'Pick 3', 'Order'] as const;

export function draftStep(phase: string, currentDraftPhase: number): DraftStep {
  if (phase === 'setup') return 4;
  return Math.min(3, Math.max(0, currentDraftPhase)) as DraftStep;
}

export function playerStatus(
  p: { bannedCard?: string | null; team?: unknown[]; attackOrder?: string[]; isReady?: boolean },
  step: DraftStep,
): 'choosing' | 'done' {
  let done: boolean;
  if (step === 0) done = !!p.bannedCard;
  else if (step === 4) done = !!p.isReady || (p.attackOrder?.length ?? 0) === 3;
  else done = (p.team?.length ?? 0) >= step;
  return done ? 'done' : 'choosing';
}

/** The opponent's ban stays hidden until both players have banned. */
export function visibleBans(
  mine: string | null | undefined,
  theirs: string | null | undefined,
): { mine: string | null; theirs: string | null } {
  const m = mine ?? null;
  const t = theirs ?? null;
  return { mine: m, theirs: m && t ? t : null };
}

export function swapInOrder(order: string[], a: string, b: string): string[] {
  const next = [...order];
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i === -1 || j === -1) return next;
  next[i] = b;
  next[j] = a;
  return next;
}

/** The chosen card, or null once it is no longer in hand. */
export function resolveChosen(chosen: string | null, handNames: string[]): string | null {
  return chosen !== null && handNames.includes(chosen) ? chosen : null;
}

/**
 * The card the Ban/Pick button acts on, and whether the hand is locked.
 * Locked once this round's ban or pick was sent (before the server answers) or the server says this player is done.
 * The big-card layout shows its first card chosen when nothing else is.
 */
export function draftChoice(o: {
  picked: string | null;
  sent: string | null;
  handNames: string[];
  layout: 'table' | 'focus';
  serverDone: boolean;
}): { chosen: string | null; locked: boolean } {
  if (o.sent !== null || o.serverDone) return { chosen: null, locked: true };
  const kept = resolveChosen(o.picked, o.handNames);
  return { chosen: kept ?? (o.layout === 'focus' ? o.handNames[0] ?? null : null), locked: false };
}

/**
 * Draft motion: the card just sent keeps its place in the hand (hidden) while its copy is in the air.
 * Returns that hold, or null once the server's hand no longer matches it (the step moved on, the hands
 * swapped, the server played another card) or animations are off.
 * `gap` is true when the server has already taken the card out, so its place is kept empty;
 * false while the card is still in the server's hand (sent, not yet answered).
 */
export function heldCard<H extends { name: string; size: number; step: DraftStep }>(
  hold: H | null,
  off: boolean,
  step: DraftStep,
  handNames: string[],
): (H & { gap: boolean }) | null {
  if (!hold || off || hold.step !== step) return null;
  if (handNames.includes(hold.name)) return handNames.length === hold.size ? { ...hold, gap: false } : null;
  return handNames.length === hold.size - 1 ? { ...hold, gap: true } : null;
}

export const READABLE_CARD_MIN_WIDTH = 222;

/** Rules text on a card read on the draft screen (big card, table-layout hand) never goes below this (px). */
export const READ_TEXT_MIN_PX = 12;

/** Table layout chrome in px. CSS must use the same numbers. */
export const TABLE_CHROME = { bar: 56, band: 190, hint: 30, foot: 76, handPadY: 24, handPadX: 44, gap: 18 };

const CARD_RATIO = 1.46;

export function tableFiveCardWidth(w: number, h: number): number {
  const c = TABLE_CHROME;
  return Math.floor(
    Math.min(
      (w - c.handPadX - 4 * c.gap) / 5,
      (h - c.bar - c.band - c.hint - c.foot - c.handPadY) / CARD_RATIO,
    ),
  );
}

export function chooseLayout(w: number, h: number): 'table' | 'focus' {
  return tableFiveCardWidth(w, h) >= READABLE_CARD_MIN_WIDTH ? 'table' : 'focus';
}

export function bigCardWidth(w: number, h: number): number {
  return Math.floor(Math.min((h - 16) / CARD_RATIO, w * 0.4));
}

export function fitCards(
  n: number,
  box: { width: number; height: number },
  gap: number,
): { width: number; perRow: number; rows: 1 | 2 } {
  const count = Math.max(1, n);
  const fit = (rows: 1 | 2) => {
    const perRow = Math.ceil(count / rows);
    const width = Math.floor(
      Math.min(
        (box.width - gap * (perRow - 1)) / perRow,
        (box.height - gap * (rows - 1)) / rows / CARD_RATIO,
      ),
    );
    return { width, perRow, rows };
  };
  const one = fit(1);
  const two = fit(2);
  return two.width > one.width ? two : one;
}

/** The reveal plays only for a live setup -> initiative transition seen in this tab. */
export function shouldPlayReveal(sawSetupInThisTab: boolean, prevPhase: string | null, phase: string): boolean {
  return sawSetupInThisTab && prevPhase === 'setup' && phase === 'initiative';
}

// Order step: the order tapped so far, kept for this tab so a refresh before Ready does not lose it.
// One entry, tagged with its game, so another game never reads it. Cleared when the order is sent.
const ORDER_KEY = 'hc-draft-order';

export function loadTappedOrder(gameId: string): string[] | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ORDER_KEY) || 'null');
    return saved && saved.gameId === gameId && Array.isArray(saved.order) ? saved.order : null;
  } catch {
    return null;
  }
}

export function saveTappedOrder(gameId: string, order: string[] | null): void {
  try {
    if (order) sessionStorage.setItem(ORDER_KEY, JSON.stringify({ gameId, order }));
    else sessionStorage.removeItem(ORDER_KEY);
  } catch {
    // Storage off or full: the order just isn't kept across a refresh
  }
}
