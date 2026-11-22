import { describe, it, expect } from 'vitest';
import {
  type BinderHero, type BinderFilter, type BinderSort, type Collection, DEFAULT_VIEW, matchesFilter, binderList,
  spreadCount, spreadPages, clampSpread, spreadOfHero, filterForHero, isFiltered, buttonLabel, statusLine,
  turnLayout, turnTarget, queueTurn, SORT_LABELS,
} from './binderRules';

const hero = (name: string, HP: number, Defense: number, Accuracy: string, BasicAttack: string, disabled = false): BinderHero =>
  ({ name, HP, Defense, Accuracy, BasicAttack, Ability: [], Special: null, disabled });

// 14 heroes, 2 disabled (Ghost, Wraith).
const heroes: BinderHero[] = [
  hero('Archer', 10, 12, '+2', '1D8'),
  hero('Bard', 8, 11, '+1', '1D6'),
  hero('Cleric', 12, 14, '+0', '1D6'),
  hero('Druid', 9, 12, '+1', '2D4'),
  hero('Fighter', 14, 16, '+1', '1D10'),
  hero('Ghost', 6, 10, '+3', '1D4', true),
  hero('Healer', 7, 10, '-1', '—'),
  hero('Knight', 14, 18, '+0', '2D6'),
  hero('Monk', 11, 15, '+2', '1D8'),
  hero('Paladin', 13, 17, '+1', '1D10'),
  hero('Rogue', 9, 13, '+3', '1D6'),
  hero('Sage', 6, 10, '+0', '-'),
  hero('Wizard', 6, 10, '+2', '1D4'),
  hero('Wraith', 8, 12, '+2', '1D12', true),
];
const names = (list: (BinderHero | null)[]) => list.map(h => h?.name ?? null);
const byName = (n: string) => heroes.find(h => h.name === n)!;

const c: Collection = {
  owned: ['Archer', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Ghost'],
  holo: ['Archer', 'Bard', 'Knight'],          // Knight is unowned (stale data)
  favourites: ['Cleric', 'Monk', 'Wraith'],    // owned, unowned, disabled
};

const list13 = heroes.slice(0, 13);

describe('matchesFilter', () => {
  it('all = enabled; owned = owned and enabled; holo = owned holo; not-owned = enabled unowned; disabled; favourites = any favourite', () => {
    const shown = (f: BinderFilter) => names(heroes.filter(h => matchesFilter(h, f, c)));
    expect(shown('all')).toEqual(names(heroes.filter(h => !h.disabled)));
    expect(shown('owned')).toEqual(['Archer', 'Bard', 'Cleric', 'Druid', 'Fighter']);
    expect(shown('holo')).toEqual(['Archer', 'Bard']);
    expect(shown('not-owned')).toEqual(['Healer', 'Knight', 'Monk', 'Paladin', 'Rogue', 'Sage', 'Wizard']);
    expect(shown('disabled')).toEqual(['Ghost', 'Wraith']);
    expect(shown('favourites')).toEqual(['Cleric', 'Monk', 'Wraith']);
  });
});

describe('binderList', () => {
  it('sorts by name A-Z, and by HP, Defense, Accuracy (+N), Attack (dice max, "—" counts as 0) highest first, ties by name', () => {
    const shuffled = [...heroes].reverse();
    const sorted = (sort: BinderSort) => names(binderList(shuffled, { ...DEFAULT_VIEW, sort }, c));
    expect(sorted('name')).toEqual(['Archer', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Healer', 'Knight', 'Monk',
      'Paladin', 'Rogue', 'Sage', 'Wizard']);
    expect(sorted('hp')).toEqual(['Fighter', 'Knight', 'Paladin', 'Cleric', 'Monk', 'Archer', 'Druid', 'Rogue',
      'Bard', 'Healer', 'Sage', 'Wizard']);
    expect(sorted('defense')).toEqual(['Knight', 'Paladin', 'Fighter', 'Monk', 'Cleric', 'Rogue', 'Archer', 'Druid',
      'Bard', 'Healer', 'Sage', 'Wizard']);
    expect(sorted('accuracy')).toEqual(['Rogue', 'Archer', 'Monk', 'Wizard', 'Bard', 'Druid', 'Fighter', 'Paladin',
      'Cleric', 'Knight', 'Sage', 'Healer']);
    expect(sorted('attack')).toEqual(['Knight', 'Fighter', 'Paladin', 'Archer', 'Druid', 'Monk', 'Bard', 'Cleric',
      'Rogue', 'Wizard', 'Healer', 'Sage']);
  });

  it('search is case-insensitive on name and applies after the filter', () => {
    expect(names(binderList(heroes, { filter: 'all', sort: 'name', query: 'AR' }, c))).toEqual(['Archer', 'Bard', 'Wizard']);
    expect(names(binderList(heroes, { filter: 'owned', sort: 'name', query: ' i ' }, c))).toEqual(['Cleric', 'Druid', 'Fighter']);
    expect(names(binderList(heroes, { filter: 'disabled', sort: 'name', query: 'wr' }, c))).toEqual(['Wraith']);
  });
});

describe('paging', () => {
  it('spreadCount', () => {
    expect(spreadCount(0)).toBe(1); expect(spreadCount(12)).toBe(1); expect(spreadCount(13)).toBe(2); expect(spreadCount(40)).toBe(4);
  });
  it('spreadPages pads with null to 6 + 6', () => {
    const [l, r] = spreadPages(list13, 1);
    expect(l[0]?.name).toBe(list13[12].name);
    expect(l.slice(1).every(x => x === null)).toBe(true);
    expect(r).toEqual([null, null, null, null, null, null]);
    const [l0, r0] = spreadPages(list13, 0);
    expect(names(l0)).toEqual(names(list13.slice(0, 6)));
    expect(names(r0)).toEqual(names(list13.slice(6, 12)));
  });
  it('clampSpread', () => {
    expect(clampSpread(3, 13)).toBe(1); expect(clampSpread(2, 0)).toBe(0);
    expect(clampSpread(-1, 13)).toBe(0); expect(clampSpread(1, 13)).toBe(1);
  });
  it('spreadOfHero', () => {
    expect(spreadOfHero(list13, list13[12].name)).toBe(1); expect(spreadOfHero(list13, list13[0].name)).toBe(0);
    expect(spreadOfHero(list13, 'Nobody')).toBeNull();
  });
});

describe('filterForHero', () => {
  it('keeps the current filter if it shows the hero, else disabled for a disabled hero, else all', () => {
    expect(filterForHero(byName('Archer'), c, 'holo')).toBe('holo');
    expect(filterForHero(byName('Monk'), c, 'owned')).toBe('all');
    expect(filterForHero(byName('Ghost'), c, 'owned')).toBe('disabled');
    expect(filterForHero(byName('Wraith'), c, 'favourites')).toBe('favourites');
    expect(filterForHero(byName('Wraith'), c, 'all')).toBe('disabled');
  });
});

describe('labels', () => {
  it('isFiltered', () => {
    expect(isFiltered(DEFAULT_VIEW)).toBe(false); expect(isFiltered({ ...DEFAULT_VIEW, sort: 'hp' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_VIEW, query: '  ' })).toBe(false); expect(isFiltered({ ...DEFAULT_VIEW, query: 'an' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_VIEW, filter: 'owned' })).toBe(true);
  });
  it('buttonLabel', () => {
    expect(buttonLabel(DEFAULT_VIEW)).toBe('All · by name');
    expect(buttonLabel({ filter: 'not-owned', sort: 'hp', query: '' })).toBe('Not owned · by HP');
    expect(buttonLabel({ filter: 'owned', sort: 'defense', query: '' })).toBe('Owned · by defense');
    expect(buttonLabel({ filter: 'holo', sort: 'attack', query: '' })).toBe('Holographic · by attack');
  });
  it('SORT_LABELS', () => {
    expect(SORT_LABELS).toEqual({ name: 'Name', hp: 'HP', defense: 'Defense', accuracy: 'Accuracy', attack: 'Attack' });
  });
  it('statusLine', () => {
    expect(statusLine({ filter: 'all', spread: 0, spreads: 4, ownedCount: 27, enabledCount: 40, holoCount: 5 }))
      .toBe('Page 1 of 4 · 27 of 40 heroes · 5 holographic');
    expect(statusLine({ filter: 'favourites', spread: 0, spreads: 1, ownedCount: 27, enabledCount: 40, holoCount: 5 }))
      .toBe('Favourites · Page 1 of 1 · 27 of 40 heroes · 5 holographic');
  });
});

describe('page turn', () => {
  it('turnLayout next: under = from.left + to.right, leaf front = from.right, back = to.left', () => {
    expect(turnLayout(0, 1, 1)).toEqual({ underLeft: { spread: 0, side: 0 }, underRight: { spread: 1, side: 1 },
      leafFront: { spread: 0, side: 1 }, leafBack: { spread: 1, side: 0 } });
  });
  it('turnLayout prev: under = to.left + from.right, leaf front = from.left, back = to.right', () => {
    expect(turnLayout(1, 0, -1)).toEqual({ underLeft: { spread: 0, side: 0 }, underRight: { spread: 1, side: 1 },
      leafFront: { spread: 1, side: 0 }, leafBack: { spread: 0, side: 1 } });
  });
  it('turnTarget wraps', () => {
    expect(turnTarget(3, 1, 4)).toBe(0); expect(turnTarget(0, -1, 4)).toBe(3);
    expect(turnTarget(1, 1, 4)).toBe(2); expect(turnTarget(0, 1, 1)).toBe(0);
  });
  it('queueTurn keeps at most 2 waiting', () => {
    expect(queueTurn([1, 1], 1)).toEqual([1, 1]); expect(queueTurn([], -1)).toEqual([-1]);
    expect(queueTurn([1], -1)).toEqual([1, -1]); expect(queueTurn([1], -1, 1)).toEqual([1]);
  });
});
