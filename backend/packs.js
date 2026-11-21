// The pack rule: 3 cards, unowned heroes first; when too few are left, owned heroes fill the pack
// as repeats worth 2 coins back each. Then one 1 in 5 roll for a bonus holographic hero.
// The order of random() calls is fixed so a given sequence always gives the same pack.
const PACK_PRICE = 12;
const PACK_SIZE = 3;
const REPEAT_REFUND = 2;
const HOLO_CHANCE = 0.2;

// Fisher-Yates, unlike sort(() => random() - 0.5) which is biased
function shuffle(list, random) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function rollPack({ heroes, owned, holo, random }) {
  const enabled = heroes.filter(h => !h.disabled).map(h => h.name);

  const cards = shuffle(enabled.filter(n => !owned.includes(n)), random)
    .slice(0, PACK_SIZE)
    .map(name => ({ name, kind: 'new' }));
  let coinsBack = 0;
  if (cards.length < PACK_SIZE) {
    const repeats = shuffle(enabled.filter(n => owned.includes(n)), random)
      .slice(0, PACK_SIZE - cards.length)
      .map(name => ({ name, kind: 'repeat' }));
    coinsBack = REPEAT_REFUND * repeats.length;
    cards.push(...repeats);
  }

  if (random() < HOLO_CHANCE) {
    const base = cards.map(c => c.name);
    const candidates = enabled.filter(n => !holo.includes(n) && !base.includes(n));
    if (candidates.length > 0) {
      const name = candidates[Math.floor(random() * candidates.length)];
      cards.push({ name, kind: owned.includes(name) ? 'holo_upgrade' : 'holo' });
    }
  }

  return { cards, coinsBack };
}

module.exports = { rollPack, PACK_PRICE, PACK_SIZE, REPEAT_REFUND, HOLO_CHANCE };
