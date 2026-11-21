// Shop endpoints: hero of the moment (5 VP) and card packs (12 VP, rule in packs.js: 3 cards,
// repeats give 2 back each, and a 1 in 5 bonus holographic).
// Every route needs a login token, acts only on the token's own account, and spends Victory Points
// through a guarded statement so simultaneous requests can never overspend.
const { createRouter } = require('./http/router');
const { rollPack, PACK_PRICE } = require('./packs');

const HERO_PRICE = 5;
const ROTATION_SIZE = 6;
const ROTATION_MS = 15 * 60 * 1000;

function createShopRouter({ database, getHeroes, auth, now = () => Date.now(), random = Math.random }) {
  const router = createRouter();
  router.use(auth.requireUser);

  // Requests for the same user run one at a time (read VP -> spend -> write heroes)
  const queues = new Map();
  function runExclusive(userId, task) {
    const previous = queues.get(userId) || Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => {});
    queues.set(userId, tail);
    tail.then(() => { if (queues.get(userId) === tail) queues.delete(userId); });
    return run;
  }

  // The same 6 unowned heroes for everyone during a 15 minute window
  function currentRotation(ownedHeroes) {
    const unowned = getHeroes().filter(h => !h.disabled && !ownedHeroes.includes(h.name));
    const shuffled = [...unowned];
    let seed = Math.floor(now() / ROTATION_MS);
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { heroes: shuffled.slice(0, Math.min(ROTATION_SIZE, shuffled.length)), seed: Math.floor(now() / ROTATION_MS) };
  }

  const fail = (res, status, message) => res.status(status).json({ success: false, message });

  router.get('/rotation', async (req, res) => {
    try {
      const user = await database.getUserById(req.userId);
      if (!user) return fail(res, 404, 'User not found');
      const rotation = currentRotation(user.available_heroes);
      res.json({
        success: true,
        heroes: rotation.heroes.map(hero => ({ ...hero, owned: false })),
        rotationSeed: rotation.seed
      });
    } catch (error) {
      fail(res, 500, error.message || 'Failed to get shop rotation');
    }
  });

  router.post('/purchase-hero', (req, res) => {
    const heroName = req.body && req.body.heroName;
    runExclusive(req.userId, async () => {
      if (typeof heroName !== 'string' || !heroName) return fail(res, 400, 'Hero name is required');

      const user = await database.getUserById(req.userId);
      if (!user) return fail(res, 404, 'User not found');
      if (user.victory_points < HERO_PRICE) return fail(res, 400, 'Not enough to buy this.');

      const hero = getHeroes().find(h => h.name === heroName);
      if (!hero || hero.disabled) return fail(res, 400, 'Hero not available');
      if (user.available_heroes.includes(heroName)) return fail(res, 400, 'Hero already owned');

      // Only the heroes currently on sale can be bought
      const rotation = currentRotation(user.available_heroes);
      if (!rotation.heroes.some(h => h.name === heroName)) {
        return fail(res, 400, 'That hero is no longer in the shop. The rotation has changed.');
      }

      const purchase = await database.purchaseHeroes(req.userId, HERO_PRICE, [heroName]);
      if (!purchase.success) return fail(res, 400, purchase.error);
      res.json({
        success: true,
        message: `${heroName} purchased successfully!`,
        newVP: purchase.newVP,
        heroName,
        available_heroes: purchase.available_heroes,
        heroCount: purchase.available_heroes.length
      });
    }).catch(error => fail(res, 500, error.message || 'Failed to purchase hero'));
  });

  router.post('/purchase-pack', (req, res) => {
    runExclusive(req.userId, async () => {
      const user = await database.getUserById(req.userId);
      if (!user) return fail(res, 404, 'User not found');
      if (user.victory_points < PACK_PRICE) return fail(res, 400, 'Not enough to buy this.');

      const heroes = getHeroes();
      const { cards, coinsBack } = rollPack({ heroes, owned: user.available_heroes, holo: user.holo_heroes, random });
      const namesOf = (...kinds) => cards.filter(c => kinds.includes(c.kind)).map(c => c.name);

      const purchase = await database.savePack(req.userId, {
        cost: PACK_PRICE,
        refund: coinsBack,
        addHeroes: namesOf('new'),
        addHolo: namesOf('holo', 'holo_upgrade')
      });
      if (!purchase.success) return fail(res, 400, purchase.error);
      res.json({
        success: true,
        message: `Pack opened! Received ${cards.length} card${cards.length > 1 ? 's' : ''}`,
        cards: cards.map(c => ({ ...c, hero: heroes.find(h => h.name === c.name) })),
        coinsSpent: PACK_PRICE,
        coinsBack,
        newVP: purchase.newVP,
        holo_heroes: purchase.holo_heroes,
        available_heroes: purchase.available_heroes,
        heroCount: purchase.available_heroes.length,
        heroesReceived: namesOf('new', 'holo')
      });
    }).catch(error => fail(res, 500, error.message || 'Failed to purchase pack'));
  });

  return router;
}

module.exports = { createShopRouter, HERO_PRICE, PACK_PRICE };
