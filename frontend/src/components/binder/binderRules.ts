// Pure rules for the hero binder: filter, sort, search, paging, labels and the page-turn layout.

export interface BinderHero {
  name: string; HP: number; Defense: number; Accuracy: string; BasicAttack: string;
  Ability: unknown[]; Special: unknown; disabled?: boolean;
}
export type BinderFilter = 'all' | 'owned' | 'favourites' | 'holo' | 'not-owned' | 'disabled';
export type BinderSort = 'name' | 'hp' | 'defense' | 'accuracy' | 'attack';
export interface BinderView { filter: BinderFilter; sort: BinderSort; query: string }
export interface Collection { owned: string[]; favourites: string[]; holo: string[] }

export const PER_PAGE = 6;
export const PER_SPREAD = 12;
export const DEFAULT_VIEW: BinderView = { filter: 'all', sort: 'name', query: '' };

export const FILTER_LABELS: Record<BinderFilter, string> = {
  all: 'All', owned: 'Owned', favourites: 'Favourites', holo: 'Holographic', 'not-owned': 'Not owned', disabled: 'Disabled',
};
export const SORT_LABELS: Record<BinderSort, string> = {
  name: 'Name', hp: 'HP', defense: 'Defense', accuracy: 'Accuracy', attack: 'Attack',
};

const SEP = ' · ';

export function matchesFilter(h: BinderHero, f: BinderFilter, c: Collection): boolean {
  const owned = c.owned.includes(h.name);
  switch (f) {
    case 'all': return !h.disabled;
    case 'owned': return owned && !h.disabled;
    case 'holo': return owned && !h.disabled && c.holo.includes(h.name);
    case 'not-owned': return !owned && !h.disabled;
    case 'disabled': return !!h.disabled;
    case 'favourites': return c.favourites.includes(h.name);
  }
}

// Max damage of a dice attack ("2D6" -> 12); anything else ("—", "-") counts as 0.
function attackValue(attack: string): number {
  const m = attack.match(/(\d+)D(\d+)/i);
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

// Signed accuracy ("+2" -> 2, "-1" -> -1, "+0" -> 0).
function accuracyValue(accuracy: string): number {
  const m = accuracy.match(/[+-]?\d+/);
  return m ? Number(m[0]) : 0;
}

const SORT_VALUE: Record<Exclude<BinderSort, 'name'>, (h: BinderHero) => number> = {
  hp: h => h.HP, defense: h => h.Defense, accuracy: h => accuracyValue(h.Accuracy), attack: h => attackValue(h.BasicAttack),
};

export function binderList(heroes: BinderHero[], v: BinderView, c: Collection): BinderHero[] {
  const q = v.query.trim().toLowerCase();
  const list = heroes.filter(h => matchesFilter(h, v.filter, c) && (!q || h.name.toLowerCase().includes(q)));
  const byName = (a: BinderHero, b: BinderHero) => a.name.localeCompare(b.name);
  if (v.sort === 'name') return list.sort(byName);
  const value = SORT_VALUE[v.sort];
  return list.sort((a, b) => value(b) - value(a) || byName(a, b));
}

export function spreadCount(listLength: number): number {
  return Math.max(1, Math.ceil(listLength / PER_SPREAD));
}

function page(list: BinderHero[], start: number): (BinderHero | null)[] {
  return Array.from({ length: PER_PAGE }, (_, i) => list[start + i] ?? null);
}

export function spreadPages(list: BinderHero[], spread: number): [(BinderHero | null)[], (BinderHero | null)[]] {
  const start = spread * PER_SPREAD;
  return [page(list, start), page(list, start + PER_PAGE)];
}

export function clampSpread(spread: number, listLength: number): number {
  return Math.min(Math.max(0, spread), spreadCount(listLength) - 1);
}

export function spreadOfHero(list: BinderHero[], name: string): number | null {
  const i = list.findIndex(h => h.name === name);
  return i < 0 ? null : Math.floor(i / PER_SPREAD);
}

// The filter to show when opening on a hero: keep the current one if it shows the hero.
export function filterForHero(h: BinderHero, c: Collection, current: BinderFilter): BinderFilter {
  if (matchesFilter(h, current, c)) return current;
  return h.disabled ? 'disabled' : 'all';
}

export function isFiltered(v: BinderView): boolean {
  return v.filter !== DEFAULT_VIEW.filter || v.sort !== DEFAULT_VIEW.sort || v.query.trim() !== '';
}

export function buttonLabel(v: BinderView): string {
  const sort = v.sort === 'hp' ? SORT_LABELS.hp : SORT_LABELS[v.sort].toLowerCase(); // HP stays an acronym
  return `${FILTER_LABELS[v.filter]}${SEP}by ${sort}`;
}

export function statusLine(a: { filter: BinderFilter; spread: number; spreads: number;
  ownedCount: number; enabledCount: number; holoCount: number }): string {
  const parts = [
    `Page ${a.spread + 1} of ${a.spreads}`,
    `${a.ownedCount} of ${a.enabledCount} heroes`,
    `${a.holoCount} holographic`,
  ];
  if (a.filter !== 'all') parts.unshift(FILTER_LABELS[a.filter]);
  return parts.join(SEP);
}

export type TurnDir = 1 | -1;
export interface PageRef { spread: number; side: 0 | 1 } // 0 = left page, 1 = right page

// Which pages sit under the turning leaf and which pages are on its two faces.
export function turnLayout(from: number, to: number, dir: TurnDir):
  { underLeft: PageRef; underRight: PageRef; leafFront: PageRef; leafBack: PageRef } {
  const left = (spread: number): PageRef => ({ spread, side: 0 });
  const right = (spread: number): PageRef => ({ spread, side: 1 });
  return dir === 1
    ? { underLeft: left(from), underRight: right(to), leafFront: right(from), leafBack: left(to) }
    : { underLeft: left(to), underRight: right(from), leafFront: left(from), leafBack: right(to) };
}

export function turnTarget(spread: number, dir: TurnDir, spreads: number): number {
  return (((spread + dir) % spreads) + spreads) % spreads;
}

export function queueTurn(queue: TurnDir[], dir: TurnDir, max = 2): TurnDir[] {
  return queue.length >= max ? queue : [...queue, dir];
}
