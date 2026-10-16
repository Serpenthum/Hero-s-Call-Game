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

  test('heal restores a hurt hero to full', async () => {
    const run = await startRun('a');
    run.roster[2].current_hp = 2;
    const result = await gm.performGauntletShopAction('a', 'heal', { heroIndex: 2 });
    assert.equal(result.success, true);
    assert.equal(run.roster[2].current_hp, run.roster[2].max_hp);
  });
});

describe('temporary resurrection', () => {
  test('only the revived hero leaves the roster; the others keep their place and HP', async () => {
    const run = await startRun('a');
    const revived = run.roster[1];
    revived.temporary_resurrection_active = true;
    run.battle_team_indices = [1, 2, 3];
    const keepNames = [0, 2, 3, 4, 5].map(i => run.roster[i].hero_id);
    const hp = { 1: 5, 2: 6, 3: 7 };
    await gm.processGauntletPostBattle('a', true, fought(run, hp));
    assert.equal(run.roster.length, 5);
    assert.deepEqual(run.roster.map(r => r.hero_id), keepNames);
    const hpOf = name => run.roster.find(r => r.hero_id === name).current_hp;
    assert.equal(hpOf(keepNames[1]), 6);
    assert.equal(hpOf(keepNames[2]), 7);
    assert.ok(run.dead_hero_ids.has(revived.hero_id));
  });

  test('a revived hero comes back at full HP and a living hero cannot be revived', async () => {
    const run = await startRun('a');
    const target = run.roster[1];
    run.roster.splice(1, 1);
    run.dead_hero_ids.add(target.hero_id);
    const result = await gm.performGauntletShopAction('a', 'temp_res', { heroId: target.hero_id });
    assert.equal(result.success, true);
    const back = run.roster.find(r => r.hero_id === target.hero_id);
    assert.equal(back.current_hp, back.max_hp);
    assert.equal(back.temporary_resurrection_active, true);
    run.shop_actions_remaining = 1;
    assert.equal((await gm.performGauntletShopAction('a', 'temp_res', { heroId: run.roster[0].hero_id })).success, false);
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
