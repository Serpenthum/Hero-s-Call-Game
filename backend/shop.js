// Shop endpoints: hero of the moment (5 VP) and card packs (12 VP).
// Every route needs a login token, acts only on the token's own account, and spends Victory Points
// through a guarded statement so simultaneous requests can never overspend.
const express = require('express');

const HERO_PRICE = 5;
const PACK_PRICE = 12;
const PACK_SIZE = 3;
const ROTATION_SIZE = 6;
const ROTATION_MS = 15 * 60 * 1000;

function createShopRouter({ database, getHeroes, auth, now = () => Date.now() }) {
  const router = express.Router();
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
      if (user.victory_points < HERO_PRICE) return fail(res, 400, 'Not enough Victory Points');

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
      if (user.victory_points < PACK_PRICE) return fail(res, 400, 'Not enough Victory Points');

      const unowned = getHeroes().filter(h => !h.disabled && !user.available_heroes.includes(h.name));
      if (unowned.length === 0) return fail(res, 400, 'All heroes already owned');

      // Fisher-Yates, unlike sort(() => Math.random() - 0.5) which is biased
      const pool = [...unowned];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const received = pool.slice(0, Math.min(PACK_SIZE, pool.length)).map(h => h.name);

      const purchase = await database.purchaseHeroes(req.userId, PACK_PRICE, received);
      if (!purchase.success) return fail(res, 400, purchase.error);
      res.json({
        success: true,
        message: `Pack opened! Received ${received.length} hero${received.length > 1 ? 'es' : ''}`,
        newVP: purchase.newVP,
        heroesReceived: received,
        available_heroes: purchase.available_heroes,
        heroCount: purchase.available_heroes.length
      });
    }).catch(error => fail(res, 500, error.message || 'Failed to purchase pack'));
  });

  return router;
}

module.exports = { createShopRouter, HERO_PRICE, PACK_PRICE };
