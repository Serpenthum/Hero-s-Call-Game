// The pack rule: one fully random hero, a 1 in 10 roll makes it holographic, repeats give 10 shards.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const packs = require('../packs');
const { rollPack, PACK_PRICE, REPEAT_SHARDS, HOLO_CHANCE, CRAFT_PRICE } = packs;

// 40 enabled heroes H0..H39, plus one disabled hero
const enabled = Array.from({ length: 40 }, (_, i) => `H${i}`);
const heroes = [...enabled.map(name => ({ name })), { name: 'X', disabled: true }];

// Returns the given values in turn, then keeps repeating the last one.
function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// Both pick hero H20 (index 20 of 40); the second value decides the holographic roll.
const normal = () => seq(0.5, 0.5);
const holo = () => seq(0.5, 0.05);

describe('rollPack', () => {
  test('exports the pack constants', () => {
    assert.equal(PACK_PRICE, 20);
    assert.equal(REPEAT_SHARDS, 10);
    assert.equal(HOLO_CHANCE, 0.1);
    assert.equal(CRAFT_PRICE, 100);
    assert.equal(packs.PACK_SIZE, undefined);
    assert.equal(packs.REPEAT_REFUND, undefined);
  });

  test('normal, not owned → new, 0 shards', () => {
    const result = rollPack({ heroes, owned: [], holo: [], random: normal() });
    assert.deepEqual(result, { card: { name: 'H20', kind: 'new', holo: false }, shards: 0 });
  });

  test('normal, owned → repeat, 10 shards, holo false', () => {
    const result = rollPack({ heroes, owned: ['H20'], holo: [], random: normal() });
    assert.deepEqual(result, { card: { name: 'H20', kind: 'repeat', holo: false }, shards: 10 });
  });

  test('holo, not owned → holo, 0 shards', () => {
    const result = rollPack({ heroes, owned: [], holo: [], random: holo() });
    assert.deepEqual(result, { card: { name: 'H20', kind: 'holo', holo: true }, shards: 0 });
  });

  test('holo, owned plain → holo_upgrade, 0 shards', () => {
    const result = rollPack({ heroes, owned: ['H20'], holo: [], random: holo() });
    assert.deepEqual(result, { card: { name: 'H20', kind: 'holo_upgrade', holo: true }, shards: 0 });
  });

  test('holo, already holo → repeat, 10 shards, holo true', () => {
    const result = rollPack({ heroes, owned: ['H20'], holo: ['H20'], random: holo() });
    assert.deepEqual(result, { card: { name: 'H20', kind: 'repeat', holo: true }, shards: 10 });
  });

  test('a roll of exactly 0.1 is not holographic', () => {
    const { card } = rollPack({ heroes, owned: [], holo: [], random: seq(0.5, 0.1) });
    assert.equal(card.holo, false);
    assert.equal(card.kind, 'new');
  });

  test('random is called exactly twice, hero first', () => {
    const values = [0.5, 0.05];
    let calls = 0;
    const random = () => values[calls++];
    const { card } = rollPack({ heroes, owned: [], holo: [], random });
    assert.equal(calls, 2);
    assert.equal(card.name, 'H20');
    assert.equal(card.holo, true);
  });

  test('owned heroes can be drawn', () => {
    for (let i = 0; i < 40; i++) {
      const { card, shards } = rollPack({ heroes, owned: enabled, holo: [], random: seq(i / 40, 0.5) });
      assert.equal(card.name, `H${i}`);
      assert.equal(card.kind, 'repeat');
      assert.equal(shards, 10);
    }
  });

  test('disabled heroes never appear', () => {
    for (let i = 0; i < 1000; i++) {
      const { card } = rollPack({ heroes, owned: [], holo: [], random: Math.random });
      assert.ok(enabled.includes(card.name));
    }
  });
});
