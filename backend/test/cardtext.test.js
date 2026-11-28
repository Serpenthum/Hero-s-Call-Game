// Card texts: every description in heros.json matches the approved wording in the spec
// (docs/superpowers/specs/2026-11-22-badges-wording-design.md, step 2), and the plain style holds.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HEROES = require('../heros.json');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice } = require('./support/battle');

// Spec "New texts, heroes in play" (64)
const IN_PLAY = [
  ["Barbarian", "Reckless Swing", "Deal 2D6 damage. Barbarian takes 2D4 damage."],
  ["Barbarian", "Break the Line", "Barbarian's attacks and abilities ignore Taunt and deflections."],
  ["Engineer", "Call Turret", "Summon a Turret (max 2). At the end of Engineer's turn, deal 1D4 damage to a random enemy per Turret."],
  ["Engineer", "Protective Gear", "When Engineer takes damage, sacrifice a Turret to block it."],
  ["Assassin", "Twin Daggers", "No basic attack. Can use its ability twice per turn."],
  ["Paladin", "Divine Smite", "Deal 1D4 damage and heal the lowest-HP ally for 1D4."],
  ["Paladin", "Shield of Faith", "When an enemy damages an ally adjacent to Paladin, Taunt that enemy: it must Focus Paladin on its next turn."],
  ["Sorcerer", "Twin Spell", "Once per round, when Sorcerer's ability hits, it can use its ability again."],
  ["Druid", "Healing Word", "At the end of Druid's turn, heal the lowest-HP ally for 1D4."],
  ["Cleric", "Guiding Bolt", "Deal 1D4 damage. The next attack or ability against the target has advantage."],
  ["Cleric", "Bless", "While Cleric is alive, all allies gain +1 Accuracy."],
  ["Monk", "One-Two Punch", "Deal 1D6 damage, then make a basic attack."],
  ["Monk", "Deflect", "Once per round, when an enemy hits an ally with a roll lower than Monk's Defense, block the damage and deal 1D4 damage to the attacker."],
  ["Cavalier", "Ride Down", "Attacks against enemies hit by Cavalier have advantage."],
  ["Piercer", "Piercing Strike", "Deal 1D4 damage. If the target has more than 8 Defense, deal an extra 1D6 damage."],
  ["Piercer", "Armor Breaker", "Piercer has advantage against enemies with more than 8 Defense."],
  ["Silencer", "Silence", "Deal 1D6 damage and Silence the target on its next turn."],
  ["Silencer", "Anti-Magic Field", "Enemy abilities against Silencer have disadvantage."],
  ["Berserker", "Bloodbath", "Gain 1 Bloodbath stack (max 2). Each stack gives Berserker's attacks +1 damage."],
  ["Wizard", "Arcane Shield", "Once per game, when Wizard would take more than 5 damage, block it."],
  ["Fighter", "Cleave", "Deal 1D6 damage to the target and 1D6 damage to the enemy on its left."],
  ["Warlock", "Vitality Drain", "Deal 1D6 damage and heal Warlock for that amount."],
  ["Warlock", "Dark Pact", "Adjacent allies permanently deal +1 damage with attacks and abilities."],
  ["Warden", "Compel Duel", "Deal 1D4 damage and Taunt the target: it must Focus Warden on its next turn."],
  ["Warden", "Shield Bash", "When an attack misses Warden, the attacker takes 1D6 damage."],
  ["Champion", "Inspiring Crowd", "Heal Champion for 1D4 (1D6 if below 11 HP)."],
  ["Champion", "Last Stand", "For each fallen ally, Champion gains +1 Defense and deals an extra 1D6 damage."],
  ["Ranger", "Piercing Shot", "Deal 1D6 damage. The target has -1 Defense until Ranger's next turn."],
  ["Ranger", "Eagle Eye", "Ranger's attacks and abilities have advantage."],
  ["Blood Hunter", "Crimson Rite", "Deal 3D4 damage. Blood Hunter takes 2D4 damage."],
  ["Blood Hunter", "Blood Price", "No basic attack. Can use each ability once per turn."],
  ["Shaman", "Elemental Strike", "Summon a Totem (max 3), then deal 1D4 damage per Totem."],
  ["Timekeeper", "Chrono Shift", "Choose an ally to use its ability on the target."],
  ["Timekeeper", "Haste", "Adjacent allies' abilities have advantage."],
  ["Ninja", "Vanish", "Once per round, after an enemy damages Ninja, it can't be Focused until its next turn."],
  ["Dragon Rider", "Dismount", "When Dragon Rider drops below 9 HP, it permanently loses 3 Defense and can't use its ability."],
  ["Bomber", "Explosion", "When Bomber dies, deal 1D6 damage to its killer."],
  ["Beast Tamer", "Call Beast / Command Attack", "Summon the Beast. If the Beast is already summoned, it deals 2D8 damage to the target instead."],
  ["Beast Tamer", "Pack Tactics", "While the Beast is summoned, Beast Tamer's attacks have advantage."],
  ["Brawler", "Iron Fists", "Brawler makes 2 basic attacks per turn. No ability."],
  ["Reaper", "Soul Harvest", "Deal 1D8 damage. If this kills the target, heal Reaper to full HP."],
  ["Reaper", "Aura of Dread", "While Reaper is alive, all enemies have -1 Defense."],
  ["Plague Spreader", "Poison Touch", "Deal 1D4 damage and give the target that many Poison stacks."],
  ["Dual Defender", "Stun", "Deal 1D4 damage. The target can't attack on its next turn."],
  ["Dual Defender", "Defend", "While Dual Defender is alive, the ally to its right uses Dual Defender's Defense."],
  ["Ace", "Stacked Deck", "Deal 2D4 damage. On a crit, deal an extra 1D4 damage."],
  ["Ace", "Ace Up The Sleeve", "When Ace rolls a 1 on an attack or ability, it automatically hits and crits."],
  ["Elementalist", "Thunderclap", "Deal 1D4 damage to the target and 1D4 damage to the enemy on its right."],
  ["Elementalist", "Wind Wall", "Each time Elementalist hits with an attack or ability, it gains +1 Defense until its next turn."],
  ["Mech", "Charged Fist", "Deal 1D6 damage and Taunt the target: it must Focus Mech on its next turn."],
  ["Mech", "Self Destruct", "Mech can destroy itself to deal 2D6 damage to all heroes, including allies."],
  ["Diplomat", "Declare War", "Adjacent allies make a basic attack on the target."],
  ["Diplomat", "Peace Treaty", "Once per game: Diplomat can heal all heroes for 2D6, including enemies."],
  ["Arcane Archer", "Far Shot", "Deal 1D4 damage. If Arcane Archer is at full HP, deal an extra 1D8 damage."],
  ["Arcane Archer", "Arcane Arrows", "Arcane Archer's attacks and abilities deal an extra 1D4 damage to enemies it has already damaged."],
  ["Shroomguard", "Cleansing Spores", "Deal 1D4 damage and remove all Poison from a random Poisoned ally."],
  ["Shroomguard", "Poison Aura", "When Shroomguard takes damage, give all heroes 1 Poison stack."],
  ["Angel", "Health Link", "Deal 1D4 damage and link the target to Angel. The next time Angel takes damage, the target takes the same damage."],
  ["Angel", "Resurrect", "Once per game: when an ally dies, revive it at half HP."],
  ["Pyromancer", "Incinerate", "Deal 1D6 damage. If this kills the target, deal 1D6 damage to enemies adjacent to it."],
  ["Medic", "Med Bots", "Summon a Med Bot (max 3)."],
  ["Medic", "Emergency Heal", "At the end of Medic's turn, heal the lowest-HP ally for 1D4 per Med Bot."],
  ["Hoarder", "Offer Bribe", "Deal 1D4 damage. The target can't use its ability on Hoarder until Hoarder's next turn."],
  ["Hoarder", "Collect Weapons", "When any hero dies, Hoarder adds its basic attack dice to its own."],
];

// Spec "Switched-off heroes" (33)
const SWITCHED_OFF = [
  ["Bard", "Song of Valor", "Deal 1D4 damage. The ally to Bard's right has advantage on its next ability."],
  ["Bard", "Encore", "Once per round, when an ally misses with an attack or ability, it rerolls."],
  ["Witch Doctor", "Voodoo Ritual", "At the end of Witch Doctor's turn, deal 1D4 damage to the lowest-HP enemy."],
  ["Pixie", "Wish", "Choose an ally. It gains +1 Accuracy and +1 Defense, and heals for 1D4."],
  ["Pixie", "Fey Magic", "While Pixie has a living ally, it gains +6 Defense."],
  ["Serpent", "Poison Strike", "Deal 1D6 damage and give the target that many Poison stacks."],
  ["Serpent", "Absorb Venom", "Once per round, Serpent can remove all Poison from all heroes and heal 1 HP per stack removed."],
  ["Venom", "Plant Growth", "Deal 1D4 damage and summon a Poisonous Plant (max 2)."],
  ["Venom", "System Failure", "At the start of Venom's turn, give a random enemy 1D4 Poison stacks per Poisonous Plant."],
  ["Knight", "Iron Will", "Deal 1D6 damage. If all of Knight's allies have fallen, deal an extra 1D6 damage."],
  ["Knight", "Tank Buster", "Knight's attacks have advantage against enemies with more Defense than Knight."],
  ["Hacker", "Hack", "Choose an enemy and take an extra turn as that enemy. It can't attack itself."],
  ["Hacker", "System Failure", "When Hacker dies, its killer loses its special."],
  ["Shadow", "Surprise Attack", "Deal 1D4 damage. If Shadow has never hit this target, deal an extra 1D4 damage."],
  ["Shadow", "Shadow Form", "Enemies Shadow hasn't damaged have disadvantage on attacks and abilities against Shadow."],
  ["Guardian", "Revenge", "Deal 1D4 damage. If the target attacked Guardian this round, deal an extra 1D6 damage."],
  ["Guardian", "Protect", "When an enemy attacks an ally adjacent to Guardian, Taunt that enemy: it must Focus Guardian on its next turn."],
  ["Phoenix", "Rebirth", "Once per game: when Phoenix dies, revive it at half HP."],
  ["Blacksmith", "Sharpen", "Choose an ally. Its next attack deals an extra 1D8 damage."],
  ["Blacksmith", "Reinforce", "Choose an ally. It gains +2 Defense."],
  ["Healer", "Heal", "Heal an ally for 2D4."],
  ["Healer", "Cleanse", "Once per round, remove all debuffs from an ally."],
  ["Sniper", "Smoke Shot", "Deal 1D4 damage. Sniper gains +5 Defense until its next turn."],
  ["Sniper", "Lock In", "Sniper can skip its attack. If it does, its next attack deals an extra 3D6 damage."],
  ["Agent", "Plan Ahead", "Deal 1D4 damage and summon a Spy."],
  ["Agent", "Master Plan", "Remove 2 Spies to set an enemy's Defense to 0."],
  ["Mime", "Copy", "Choose an enemy and use its ability as Mime's own."],
  ["Mime", "Unique Duplicate", "At the start of the battle, choose an enemy and copy its special."],
  ["Gambler", "Luck of the Dice", "Deal 1D6 damage. If the roll was above 14, Gambler's next attack has advantage."],
  ["Gambler", "Rigged Dice", "Gambler's abilities have advantage."],
  ["Arcanist", "Enhance Ability", "Deal 1D4 damage. The ally to Arcanist's left has advantage on its next ability."],
  ["Arcanist", "Enhance Attack", "Deal 1D4 damage. The ally to Arcanist's right has advantage on its next attack."],
  ["Arcanist", "Tether Ally", "Once per round, when an ally hits with an attack or ability, Arcanist makes a basic attack on the same target."],
];

// Spec: unchanged (16 in play + 3 switched off)
const UNCHANGED = [
  ["Assassin", "Poison Strike", "Deal 1D6 damage and give the target 1 Poison stack."],
  ["Sorcerer", "Chromatic Orb", "Deal 1D8 damage."],
  ["Druid", "Wildshape", "Heal Druid for 1D4."],
  ["Cavalier", "Trample", "Deal 1D6 damage."],
  ["Berserker", "Frenzy", "Below 10 HP, Berserker can attack twice per turn."],
  ["Wizard", "Fireball", "Deal 1D4 damage to all enemies."],
  ["Fighter", "Desperate Blows", "Below 10 HP, Fighter's attacks have advantage."],
  ["Blood Hunter", "Sanguine Renewal", "Deal 1D4 damage and heal Blood Hunter for that amount."],
  ["Shaman", "Totemic Bond", "While Shaman is alive, all allies gain +1 Defense."],
  ["Ninja", "Sharpened Shuriken", "Deal 2D6 damage."],
  ["Dragon Rider", "Fire Breath", "Deal 3D4 damage."],
  ["Bomber", "Bomb Toss", "Deal 1D6 damage to all enemies."],
  ["Plague Spreader", "Aura of Death", "At the start of Plague Spreader's turn, all other heroes take 1D4 damage."],
  ["Swordsman", "Colossal Strike", "Deal 1D8 damage."],
  ["Swordsman", "Critical Strikes", "Swordsman crits on 17, 18, 19, and 20."],
  ["Pyromancer", "Endless Burn", "At the end of Pyromancer's turn, it and all enemies take 1D4 damage."],
  ["Witch Doctor", "Hexburst Mending", "Deal 1D6 damage and heal adjacent allies for 1D4."],
  ["Phoenix", "Flamestrike", "Deal 1D6 damage."],
  ["Blacksmith", "—", "No special."],
];

const cardsOf = h => [...(h.Ability || []), ...(Array.isArray(h.Special) ? h.Special : [h.Special])].filter(Boolean);
const allCards = () => HEROES.flatMap(h => cardsOf(h).map(card => ({ hero: h.name, card })));

describe('card texts', () => {
  test('every card text in the spec matches heros.json', () => {
    const rows = [...IN_PLAY, ...SWITCHED_OFF, ...UNCHANGED];
    assert.equal(IN_PLAY.length, 64);
    assert.equal(SWITCHED_OFF.length, 33);
    assert.equal(UNCHANGED.length, 19);
    for (const [heroName, cardName, text] of rows) {
      const h = HEROES.find(x => x.name === heroName);
      assert.ok(h, `hero ${heroName} exists`);
      const card = cardsOf(h).find(c => c.name === cardName);
      assert.ok(card, `${heroName} has ${cardName}`);
      assert.equal(card.description, text, `${heroName} / ${cardName}`);
    }
    // The table covers every card in the game
    assert.equal(rows.length, allCards().length);
  });

  test('style rules hold for every description', () => {
    for (const { hero: name, card } of allCards()) {
      const d = card.description;
      const at = `${name} / ${card.name}: ${d}`;
      assert.ok(!d.includes(';'), `no semicolon: ${at}`);
      assert.ok(!/\byou\b/i.test(d), `no "you": ${at}`);
      assert.ok(!/cannot/i.test(d), `"Can't", not "cannot": ${at}`);
      assert.ok(!/untargetable/i.test(d), `no "untargetable": ${at}`);
      assert.ok(!/\bhealth\b/i.test(d), `"HP", not "health": ${at}`);
      assert.ok(!/to hit/i.test(d), `"Accuracy", not "to hit": ${at}`);
      assert.ok(!/\d+d\d+/.test(d), `capital D in dice: ${at}`);
      // A damage roll says "damage". Heals ("for 1D4", "(1D6 if ...)") and Poison counts ("1D4 Poison stacks") do not.
      for (const m of d.matchAll(/\d+D\d+/g)) {
        const before = d.slice(0, m.index);
        const after = d.slice(m.index + m[0].length);
        const healOrCount = /(for |\()$/.test(before) || /^ Poison/.test(after);
        if (!healOrCount) assert.ok(/^ damage\b/.test(after), `"${m[0]} damage": ${at}`);
      }
    }
  });
});

describe('Vanish strings say Focus', () => {
  let gm;
  beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
  afterEach(() => resetDice());
  const FOES = ['Ninja', 'Fighter', 'Swordsman'];
  const saysFocus = (text, what) => {
    assert.match(text, /[Cc]an't be Focused/, what);
    assert.doesNotMatch(text, /untargetable|targeted/i, what);
  };

  test('the Focus refusal', () => {
    const game = startBattle(gm, ['Barbarian', 'Cleric', 'Reaper'], FOES);
    hero(game, 1, 'Ninja').statusEffects.untargetable = true;
    const result = gm.selectTarget('p0', 'Ninja');
    assert.equal(result.success, false);
    saysFocus(result.error, 'selectTarget');
  });

  test('the attack and ability refusals on a Focus that Vanished', () => {
    const game = startBattle(gm, ['Barbarian', 'Cleric', 'Reaper'], FOES);
    assert.equal(gm.selectTarget('p0', 'Ninja').success, true);
    hero(game, 1, 'Ninja').statusEffects.untargetable = true;
    const attack = gm.basicAttack('p0', 'Ninja');
    assert.equal(attack.success, false);
    saysFocus(attack.error, 'basicAttack');
    const ability = gm.useAbility('p0', 0, 'Ninja');
    assert.equal(ability.success, false);
    saysFocus(ability.error, 'useAbility');
  });

  test('the battle log reaction', () => {
    const game = startBattle(gm, ['Barbarian', 'Cleric', 'Reaper'], FOES);
    gm.selectTarget('p0', 'Ninja');
    assert.equal(gm.basicAttack('p0', 'Ninja').success, true);
    assert.equal(hero(game, 1, 'Ninja').statusEffects.untargetable, true);
    const reaction = game.log[game.log.length - 1].reactions.find(r => r.action === 'Vanish');
    assert.ok(reaction, 'Vanish reaction');
    assert.equal(reaction.text, "can't be Focused until its next turn");
  });

  test('no player-facing message or error in the server says untargetable or targeted', () => {
    // The Vanish log line's message is not shown anywhere today, so it is checked in the source
    for (const file of ['gameManager.js', 'battleLog.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      assert.doesNotMatch(src, /(message|error|text)\s*[:=]\s*['"`][^'"`]*(untargetable|be targeted)/i, file);
      assert.doesNotMatch(src, /react\([^)]*'Vanish',\s*'[^']*(untargetable|be targeted)/, file);
      assert.doesNotMatch(src, /FOCUS_UNTARGETABLE = ["'][^"']*targeted/, file);
    }
  });
});
