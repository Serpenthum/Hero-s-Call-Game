// The pack rule: 3 cards, unowned heroes first, repeats refund 2 each, and a 1 in 5 bonus holographic.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { rollPack, PACK_PRICE, PACK_SIZE, REPEAT_REFUND, HOLO_CHANCE } = require('../packs');

const heroes = [
  { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' },
  { name: 'X', disabled: true }
];
const enabled = ['A', 'B', 'C', 'D', 'E', 'F'];

// Returns the given values in turn, then keeps repeating the last one.
function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const names = cards => cards.map(c => c.name);

describe('rollPack', () => {
  test('exports the pack constants', () => {
    assert.equal(PACK_PRICE, 12);
    assert.equal(PACK_SIZE, 3);
    assert.equal(REPEAT_REFUND, 2);
    assert.equal(HOLO_CHANCE, 0.2);
  });

  test('three different unowned heroes when enough are left', () => {
    const { cards, coinsBack } = rollPack({ heroes, owned: [], holo: [], random: () => 0.99 });
    assert.equal(cards.length, 3);
    assert.ok(cards.every(c => c.kind === 'new'));
    assert.equal(new Set(names(cards)).size, 3);
    assert.equal(coinsBack, 0);
  });

  test('the 20% roll adds a bonus fourth card', () => {
    const { cards } = rollPack({ heroes, owned: [], holo: [], random: () => 0 });
    assert.equal(cards.length, 4);
    assert.equal(cards[3].kind, 'holo');
    assert.ok(!names(cards.slice(0, 3)).includes(cards[3].name));
  });

  test('a roll of exactly 0.2 misses', () => {
    // 5 shuffle swaps for 6 unowned heroes, then the bonus roll
    const { cards } = rollPack({ heroes, owned: [], holo: [], random: seq(0.5, 0.5, 0.5, 0.5, 0.5, 0.2) });
    assert.equal(cards.length, 3);
  });

  test('repeats fill the pack and give 2 back each', () => {
    const owned = ['A', 'B', 'C', 'D', 'E'];
    const { cards, coinsBack } = rollPack({ heroes, owned, holo: [], random: () => 0.99 });
    assert.equal(cards.length, 3);
    assert.deepEqual(cards[0], { name: 'F', kind: 'new' });
    assert.deepEqual(cards.slice(1).map(c => c.kind), ['repeat', 'repeat']);
    assert.ok(cards.slice(1).every(c => owned.includes(c.name)));
    assert.equal(new Set(names(cards)).size, 3);
    assert.equal(coinsBack, 4);
  });

  test('a player who owns everything still gets three repeats', () => {
    const { cards, coinsBack } = rollPack({ heroes, owned: enabled, holo: [], random: () => 0.99 });
    assert.equal(cards.length, 3);
    assert.ok(cards.every(c => c.kind === 'repeat'));
    assert.equal(new Set(names(cards)).size, 3);
    assert.equal(coinsBack, 6);
  });

  test('bonus upgrades an owned plain hero', () => {
    const { cards } = rollPack({ heroes, owned: enabled, holo: [], random: () => 0 });
    assert.equal(cards.length, 4);
    assert.equal(cards[3].kind, 'holo_upgrade');
    assert.ok(!names(cards.slice(0, 3)).includes(cards[3].name));
  });

  test('bonus skips heroes already holographic', () => {
    const base = names(rollPack({ heroes, owned: enabled, holo: [], random: () => 0 }).cards.slice(0, 3));
    const left = enabled.filter(n => !base.includes(n));
    const holo = enabled.filter(n => n !== left[left.length - 1]);
    const { cards } = rollPack({ heroes, owned: enabled, holo, random: () => 0 });
    assert.equal(cards.length, 4);
    assert.deepEqual(cards[3], { name: left[left.length - 1], kind: 'holo_upgrade' });
  });

  test('no bonus when every hero is holographic', () => {
    const { cards } = rollPack({ heroes, owned: enabled, holo: enabled, random: () => 0 });
    assert.equal(cards.length, 3);
  });

  test('disabled heroes never appear', () => {
    for (const random of [() => 0, () => 0.5, () => 0.99]) {
      for (const owned of [[], enabled]) {
        const { cards } = rollPack({ heroes, owned, holo: [], random });
        assert.ok(!names(cards).includes('X'));
      }
    }
  });
});
