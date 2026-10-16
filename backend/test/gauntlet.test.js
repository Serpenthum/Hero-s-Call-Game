// The Gauntlet: HP carries between trials, the roster stays sound, offers are honest, one camp action per trial.
const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); });

async function startRun(id, name = id) {
  const started = await gm.initializeGauntletRun(id, name);
  assert.equal(started.success, true);
  return gm.gauntletRuns.get(id);
}

// The hero objects a finished battle hands back for a team (what processGauntletPostBattle reads)
function fought(run, hpByIndex) {
  return run.battle_team_indices.map(i => ({ name: run.roster[i].hero_id, currentHP: hpByIndex[i] ?? run.roster[i].max_hp }));
}

describe('HP across trials', () => {
  test('a hurt hero starts the next trial hurt', async () => {
    const a = await startRun('a');
    const b = await startRun('b');
    a.roster[0].current_hp = 4;
    a.battle_team_indices = [0, 1, 2];
    b.battle_team_indices = [0, 1, 2];
    assert.equal(gm.queueForGauntletTrial('a').waiting, true);
    const matched = gm.queueForGauntletTrial('b');
    assert.equal(matched.matched, true);
    const game = gm.games.get(matched.gameId);
    const team = game.players.find(p => p.id === 'a').team;
    assert.equal(team[0].currentHP, 4);
    assert.equal(team[1].currentHP, a.roster[1].max_hp);
    assert.equal(team[0].maxHP, a.roster[0].max_hp);
  });

  test('a battle saves the HP the heroes finished with, and a fallen hero stays down', async () => {
    const run = await startRun('a');
    run.battle_team_indices = [0, 1, 2];
    const names = [0, 1, 2].map(i => run.roster[i].hero_id);
    const result = await gm.processGauntletPostBattle('a', true, fought(run, { 0: 3, 1: 0 }));
    assert.equal(result.success, true);
    assert.equal(run.roster[0].current_hp, 3);
    assert.equal(run.roster[0].alive, true);
    assert.equal(run.roster[1].alive, false);
    assert.ok(run.dead_hero_ids.has(names[1]));
    assert.equal(run.roster[2].current_hp, run.roster[2].max_hp);
  });

  test('heal restores a hurt hero to full and refuses a healthy or fallen one', async () => {
    const run = await startRun('a');
    run.roster[2].current_hp = 2;
    assert.equal((await gm.performGauntletShopAction('a', 'heal', { heroIndex: 2 })).success, true);
    assert.equal(run.roster[2].current_hp, run.roster[2].max_hp);
    run.shop_actions_remaining = 1;
    assert.equal((await gm.performGauntletShopAction('a', 'heal', { heroIndex: 2 })).success, false, 'already full');
    run.roster[3].alive = false;
    assert.equal((await gm.performGauntletShopAction('a', 'heal', { heroIndex: 3 })).success, false, 'fallen');
    assert.equal(run.shop_actions_remaining, 1, 'failed attempts keep the action');
  });
});

describe('temporary resurrection', () => {
  test('a fallen hero returns in place, at full HP, for one battle', async () => {
    const run = await startRun('a');
    const fallen = run.roster[1];
    fallen.alive = false;
    fallen.current_hp = 0;
    run.dead_hero_ids.add(fallen.hero_id);
    const before = run.roster.map(r => r.hero_id);
    const result = await gm.performGauntletShopAction('a', 'temp_res', { heroId: fallen.hero_id });
    assert.equal(result.success, true);
    assert.deepEqual(run.roster.map(r => r.hero_id), before, 'same heroes, same order, no extra slot');
    assert.equal(fallen.alive, true);
    assert.equal(fallen.current_hp, fallen.max_hp);
    assert.equal(fallen.temporary_resurrection_active, true);
  });

  test('a hero who has not fallen cannot be revived', async () => {
    const run = await startRun('a');
    const result = await gm.performGauntletShopAction('a', 'temp_res', { heroId: run.roster[0].hero_id });
    assert.equal(result.success, false);
    assert.equal(run.shop_actions_remaining, 1);
  });

  test('after the battle the revived hero falls again and nobody else moves', async () => {
    const run = await startRun('a');
    const revived = run.roster[1];
    revived.temporary_resurrection_active = true;
    run.battle_team_indices = [1, 2, 3];
    const names = run.roster.map(r => r.hero_id);
    await gm.processGauntletPostBattle('a', true, fought(run, { 1: 5, 2: 6, 3: 7 }));
    assert.deepEqual(run.roster.map(r => r.hero_id), names, 'the roster keeps all six slots in order');
    assert.equal(revived.alive, false);
    assert.equal(revived.temporary_resurrection_active, false);
    assert.ok(run.dead_hero_ids.has(revived.hero_id));
    assert.equal(run.roster[2].current_hp, 6);
    assert.equal(run.roster[3].current_hp, 7);
  });
});

describe('the battle team', () => {
  test('three distinct whole roster slots', async () => {
    await startRun('a');
    for (const bad of [[0, 0, 1], [0, 1, 1.5], [0, 1, '2'], [0, 1, 9], [0, 1], [0, 1, 2, 3], 'abc', null]) {
      assert.equal(gm.setGauntletBattleTeam('a', bad).success, false, JSON.stringify(bad));
    }
    assert.equal(gm.setGauntletBattleTeam('a', [0, 1, 2]).success, true);
  });
});

describe('hero offers', () => {
  test('an offer never contains a hero already on the roster, or a repeat', async () => {
    const run = await startRun('a');
    const onRoster = new Set(run.roster.map(r => r.hero_id));
    for (let i = 0; i < 50; i++) {
      const offer = gm.generateGauntletHeroOffer(run);
      assert.equal(offer.length, 2);
      assert.notEqual(offer[0].name, offer[1].name);
      for (const entry of offer) assert.ok(!onRoster.has(entry.name), entry.name);
    }
  });

  test('a hero lost earlier in the run is not offered again', async () => {
    const run = await startRun('a');
    const lost = run.availableHeroPool.find(n => !run.roster.some(r => r.hero_id === n));
    run.dead_hero_ids.add(lost);
    for (let i = 0; i < 50; i++) {
      assert.ok(!gm.generateGauntletHeroOffer(run).some(e => e.name === lost));
    }
  });

  test('the offer is held, asking again shows the same two, and only an offered hero can be taken', async () => {
    const run = await startRun('a');
    run.roster.pop(); // room on the roster
    run.phase = 'hero_offer';
    const shown = await gm.completeGauntletHeroOffer('a', undefined, undefined, false);
    assert.equal(shown.action, 'show_offer');
    const again = await gm.completeGauntletHeroOffer('a', undefined, undefined, false);
    assert.deepEqual(again.offer.map(e => e.name), shown.offer.map(e => e.name));
    assert.equal(run.rerolls_remaining, 3, 'looking again is free but changes nothing');

    const outsider = run.availableHeroPool.find(n => !shown.offer.some(e => e.name === n) && !run.roster.some(r => r.hero_id === n));
    const refused = await gm.completeGauntletHeroOffer('a', outsider, undefined, false);
    assert.equal(refused.success, false);
    assert.match(refused.error, /offered/);

    const taken = await gm.completeGauntletHeroOffer('a', shown.offer[0].name, undefined, false);
    assert.equal(taken.success, true);
    assert.ok(run.roster.some(r => r.hero_id === shown.offer[0].name));
    assert.equal(run.pending_offer, null);
    assert.equal(run.phase, 'preparation');
  });

  test('a full roster must let one hero go, fallen or not, and the new hero takes the place', async () => {
    const run = await startRun('a');
    run.roster[4].alive = false;
    run.phase = 'hero_offer';
    const shown = await gm.completeGauntletHeroOffer('a', undefined, undefined, false);
    const pick = shown.offer[0].name;
    const need = await gm.completeGauntletHeroOffer('a', pick, undefined, false);
    assert.equal(need.action, 'need_sacrifice');
    assert.equal(run.roster.length, 6);
    assert.equal((await gm.completeGauntletHeroOffer('a', pick, 9, false)).success, false);
    const letGo = run.roster[4].hero_id;
    const done = await gm.completeGauntletHeroOffer('a', pick, 4, false);
    assert.equal(done.success, true);
    assert.equal(run.roster.length, 6);
    assert.ok(!run.roster.some(r => r.hero_id === letGo));
    assert.ok(run.roster.some(r => r.hero_id === pick));
  });

  test('a reroll costs one of three and draws a new pair; none left means no reroll', async () => {
    const run = await startRun('a');
    run.phase = 'hero_offer';
    await gm.completeGauntletHeroOffer('a', undefined, undefined, false);
    const rerolled = await gm.completeGauntletHeroOffer('a', undefined, undefined, true);
    assert.equal(rerolled.success, true);
    assert.equal(rerolled.action, 'show_offer');
    assert.equal(run.rerolls_remaining, 2);
    run.rerolls_remaining = 0;
    const refused = await gm.completeGauntletHeroOffer('a', undefined, undefined, true);
    assert.equal(refused.success, false);
    assert.equal(run.rerolls_remaining, 0);
  });

  test('skipping the free offer drops it and moves on to the camp', async () => {
    const run = await startRun('a');
    run.phase = 'hero_offer';
    await gm.completeGauntletHeroOffer('a', undefined, undefined, false);
    const result = await gm.completeGauntletHeroOffer('a', undefined, undefined, false, true);
    assert.equal(result.success, true);
    assert.equal(run.pending_offer, null);
    assert.equal(run.phase, 'preparation');
  });

  test('after a battle the run holds a fresh offer and the client can read it back', async () => {
    const run = await startRun('a');
    run.battle_team_indices = [0, 1, 2];
    const result = await gm.processGauntletPostBattle('a', true, fought(run, {}));
    assert.equal(result.heroOffer.length, 2);
    assert.equal(run.phase, 'hero_offer');
    const serial = gm.serializeGauntletRunState(run);
    assert.deepEqual(serial.pending_offer.map(e => e.name), result.heroOffer.map(e => e.name));
  });
});

describe('the camp action', () => {
  test('looking at the hire offer keeps the action; taking a hero uses it', async () => {
    const run = await startRun('a');
    run.roster.pop();
    const shown = await gm.performGauntletShopAction('a', 'buy_pack', {});
    assert.equal(shown.action, 'show_offer');
    assert.equal(run.shop_actions_remaining, 1);
    const taken = await gm.performGauntletShopAction('a', 'buy_pack', { selectedHeroId: shown.offer[0].name });
    assert.equal(taken.success, true);
    assert.equal(run.shop_actions_remaining, 0);
    assert.equal((await gm.performGauntletShopAction('a', 'skip_trial', {})).success, false, 'one action per trial');
  });

  test('heal, revive and skip each use the action', async () => {
    const run = await startRun('a');
    run.roster[0].current_hp = 1;
    await gm.performGauntletShopAction('a', 'heal', { heroIndex: 0 });
    assert.equal(run.shop_actions_remaining, 0);
    run.shop_actions_remaining = 1;
    const skipped = await gm.performGauntletShopAction('a', 'skip_trial', {});
    assert.equal(skipped.success, true);
    assert.equal(run.current_trial, 2);
    assert.equal(run.trials_won, 0, 'a skip is not a win');
    assert.equal(run.shop_actions_remaining, 0);
  });

  test('skipping is closed from trial 10', async () => {
    const run = await startRun('a');
    run.current_trial = 10;
    assert.equal((await gm.performGauntletShopAction('a', 'skip_trial', {})).success, false);
    assert.equal(run.current_trial, 10);
    assert.equal(run.shop_actions_remaining, 1);
  });

  test('an unknown action fails without using the action', async () => {
    const run = await startRun('a');
    assert.equal((await gm.performGauntletShopAction('a', 'jump', {})).success, false);
    assert.equal((await gm.performGauntletShopAction('a', 'heal', { heroIndex: -1 })).success, false);
    assert.equal(run.shop_actions_remaining, 1);
  });
});

describe('queueing for a trial', () => {
  test('refused while already queued or in a battle, and needs a team', async () => {
    const run = await startRun('a');
    assert.equal(gm.queueForGauntletTrial('a').success, false, 'no team yet');
    run.battle_team_indices = [0, 1, 2];
    assert.equal(gm.queueForGauntletTrial('a').waiting, true);
    assert.equal(gm.queueForGauntletTrial('a').success, false, 'already queued');
    gm.cancelGauntletQueue('a');
    run.phase = 'battle';
    assert.equal(gm.queueForGauntletTrial('a').success, false, 'in a battle');
  });

  test('players are only matched inside their bracket', async () => {
    const a = await startRun('a');
    const b = await startRun('b');
    a.battle_team_indices = [0, 1, 2];
    b.battle_team_indices = [0, 1, 2];
    b.current_trial = 5; // bracket C, a is bracket A
    assert.equal(gm.queueForGauntletTrial('a').waiting, true);
    assert.equal(gm.queueForGauntletTrial('b').waiting, true);
    const c = await startRun('c');
    c.battle_team_indices = [0, 1, 2];
    c.current_trial = 6; // bracket C with b
    assert.equal(gm.queueForGauntletTrial('c').matched, true);
  });
});
