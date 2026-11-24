// The pack rule: one card, picked with equal chance from every enabled hero, owned or not. Then one
// 1 in 10 roll makes it holographic; a holographic replaces the card rather than adding one. A hero the
// player already has (or a holographic they already have) is a repeat worth 10 shards.
// The order of random() calls is fixed (hero, then holographic roll) so a given sequence always gives
// the same pack.
const PACK_PRICE = 20;
const REPEAT_SHARDS = 10;
const HOLO_CHANCE = 0.1;
const CRAFT_PRICE = 100;

function rollPack({ heroes, owned, holo, random }) {
  const enabled = heroes.filter(h => !h.disabled).map(h => h.name);
  const name = enabled[Math.floor(random() * enabled.length)];
  const isHolo = random() < HOLO_CHANCE;

  let kind;
  if (!isHolo) kind = owned.includes(name) ? 'repeat' : 'new';
  else if (holo.includes(name)) kind = 'repeat';
  else kind = owned.includes(name) ? 'holo_upgrade' : 'holo';

  return { card: { name, kind, holo: isHolo }, shards: kind === 'repeat' ? REPEAT_SHARDS : 0 };
}

module.exports = { rollPack, PACK_PRICE, REPEAT_SHARDS, HOLO_CHANCE, CRAFT_PRICE };
