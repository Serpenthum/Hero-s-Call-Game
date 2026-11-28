// Shop endpoints: card packs (20 coins, rule in packs.js: one card, a 1 in 10 holographic, a repeat
// gives 10 shards) and crafting (100 shards for any enabled hero not yet owned, never a holographic).
// Every route needs a login token, acts only on the token's own account, and spends coins or shards
// through a guarded statement so simultaneous requests can never overspend.
const { createRouter } = require('./http/router');
const { rollPack, PACK_PRICE, CRAFT_PRICE } = require('./packs');

function createShopRouter({ database, getHeroes, auth, random = Math.random }) {
  const router = createRouter();
  router.use(auth.requireUser);

  // Requests for the same user run one at a time (read balance -> spend -> write heroes)
  const queues = new Map();
  function runExclusive(userId, task) {
    const previous = queues.get(userId) || Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => {});
    queues.set(userId, tail);
    tail.then(() => { if (queues.get(userId) === tail) queues.delete(userId); });
    return run;
  }

  const fail = (res, status, message) => res.status(status).json({ success: false, message });

  router.post('/purchase-pack', (req, res) => {
    runExclusive(req.userId, async () => {
      const user = await database.getUserById(req.userId);
      if (!user) return fail(res, 404, 'User not found');
      if (user.victory_points < PACK_PRICE) return fail(res, 400, 'Not enough to buy this.');

      const heroes = getHeroes();
      const { card, shards } = rollPack({ heroes, owned: user.available_heroes, holo: user.holo_heroes, random });
      // new: the hero; holo: the hero and its holographic; holo_upgrade: the holographic; repeat: shards only
      const addHeroes = card.kind === 'new' || card.kind === 'holo' ? [card.name] : [];
      const addHolo = card.kind === 'holo' || card.kind === 'holo_upgrade' ? [card.name] : [];

      const purchase = await database.savePack(req.userId, { cost: PACK_PRICE, shards, addHeroes, addHolo });
      if (!purchase.success) return fail(res, 400, purchase.error);
      const shown = { ...card, hero: heroes.find(h => h.name === card.name) };
      res.json({
        success: true,
        message: 'Pack opened!',
        card: shown,
        cards: [shown],
        coinsSpent: PACK_PRICE,
        coinsBack: 0,
        shardsGained: shards,
        shards: purchase.shards,
        newVP: purchase.newVP,
        holo_heroes: purchase.holo_heroes,
        available_heroes: purchase.available_heroes,
        heroCount: purchase.available_heroes.length,
        heroesReceived: addHeroes
      });
    }).catch(error => fail(res, 500, error.message || 'Failed to purchase pack'));
  });

  router.post('/craft', (req, res) => {
    const heroName = req.body && req.body.heroName;
    runExclusive(req.userId, async () => {
      if (typeof heroName !== 'string' || !heroName) return fail(res, 400, 'Hero name is required');

      const user = await database.getUserById(req.userId);
      if (!user) return fail(res, 404, 'User not found');

      const hero = getHeroes().find(h => h.name === heroName);
      if (!hero || hero.disabled) return fail(res, 400, 'Hero not available');
      if (user.available_heroes.includes(heroName)) return fail(res, 400, 'You already have this hero.');
      if (user.shards < CRAFT_PRICE) return fail(res, 400, 'Not enough shards.');

      const crafted = await database.craftHero(req.userId, heroName, CRAFT_PRICE);
      if (!crafted.success) return fail(res, 400, crafted.error);
      res.json({
        success: true,
        heroName,
        hero,
        shards: crafted.shards,
        available_heroes: crafted.available_heroes,
        heroCount: crafted.available_heroes.length
      });
    }).catch(error => fail(res, 500, error.message || 'Failed to craft hero'));
  });

  return router;
}

module.exports = { createShopRouter, PACK_PRICE, CRAFT_PRICE };
