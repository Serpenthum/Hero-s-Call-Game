// Pace simulation: plays simulated accounts through the real rule functions (packs, crafting, battle
// coins and XP, level-up coins, quests) and checks how many battles an average player needs to reach
// Survival (21 heroes) and the full collection. Every amount comes from the rule modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rollPack, PACK_PRICE, CRAFT_PRICE } = require('../packs');
const { applyXP, battleCoins, battleXP, QUEST_COINS, TUTORIAL_REWARD_COINS } = require('../economy');
const { QUEST_REWARD } = require('../quests');
const { GAUNTLET_STARTER_HEROES } = require('../database');
const heroes = require('../heros.json');

const ACCOUNTS = 2000;
const SEED = 20261123;
const SURVIVAL_HEROES = 21;
const QUESTS_EVERY = 6; // battles between quest pay-outs
const QUESTS_AT_ONCE = 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enabled = heroes.filter(h => !h.disabled).map(h => h.name);

// One account from the end of the tutorial until it owns every enabled hero.
function playAccount(random) {
  const acct = {
    level: 2, xp: 0, coins: TUTORIAL_REWARD_COINS, shards: 0,
    owned: [...GAUNTLET_STARTER_HEROES], holo: []
  };
  const gainXP = amount => {
    const r = applyXP({ level: acct.level, xp: acct.xp }, amount);
    acct.level = r.level;
    acct.xp = r.xp;
    acct.coins += r.coinsGained;
  };
  const spend = () => {
    while (acct.coins >= PACK_PRICE && acct.owned.length < enabled.length) {
      acct.coins -= PACK_PRICE;
      const { card, shards } = rollPack({ heroes, owned: acct.owned, holo: acct.holo, random });
      if (card.kind === 'new' || card.kind === 'holo') acct.owned.push(card.name);
      if (card.kind === 'holo' || card.kind === 'holo_upgrade') acct.holo.push(card.name);
      acct.shards += shards;
    }
    while (acct.shards >= CRAFT_PRICE && acct.owned.length < enabled.length) {
      acct.shards -= CRAFT_PRICE;
      acct.owned.push(enabled.find(name => !acct.owned.includes(name)));
    }
  };

  let battles = 0;
  let toSurvival = null;
  const record = () => {
    if (toSurvival === null && acct.owned.length >= SURVIVAL_HEROES) toSurvival = battles;
  };
  spend();
  record();
  while (acct.owned.length < enabled.length) {
    battles += 1;
    const ending = random() < 0.5 ? 'win' : 'loss';
    const alive = 1 + Math.floor(random() * 3);
    acct.coins += battleCoins('random', ending, alive);
    gainXP(battleXP(ending));
    if (battles % QUESTS_EVERY === 0) {
      acct.coins += QUESTS_AT_ONCE * QUEST_COINS;
      gainXP(QUESTS_AT_ONCE * QUEST_REWARD.xp);
    }
    spend();
    record();
  }
  return { toSurvival, toFull: battles };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
// Nearest-rank percentile
const percentile = (xs, p) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
};

test('average player reaches Survival in 35-50 battles and the full collection in 250-350', t => {
  assert.equal(enabled.length, 40);
  const random = mulberry32(SEED);
  const runs = Array.from({ length: ACCOUNTS }, () => playAccount(random));
  const survival = runs.map(r => r.toSurvival);
  const full = runs.map(r => r.toFull);

  const summary = (label, xs) =>
    `${label}: mean ${mean(xs).toFixed(1)}, p10 ${percentile(xs, 10)}, p90 ${percentile(xs, 90)}`;
  t.diagnostic(summary('battles to 21 heroes', survival));
  t.diagnostic(summary('battles to all 40 heroes', full));

  const survivalMean = mean(survival);
  const fullMean = mean(full);
  assert.ok(survivalMean >= 35 && survivalMean <= 50, `Survival mean ${survivalMean} outside 35-50`);
  assert.ok(fullMean >= 250 && fullMean <= 350, `full collection mean ${fullMean} outside 250-350`);
});
