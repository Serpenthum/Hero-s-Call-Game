// Shared helpers for engine tests: build a battle from hero names and control the dice.
const GameManager = require('../../gameManager');
const heroList = require('../../heros.json');
const { rig } = require('../../utils');

// The engine logs heavily; keep test output readable.
function quiet() {
  console.log = () => {};
  console.warn = () => {};
}

function makeManager(database = null) {
  quiet();
  return new GameManager(JSON.parse(JSON.stringify(heroList)), database);
}

function newPlayer(id, name) {
  return {
    id, name, userId: null, connected: true, team: [], draftCards: [], bannedCard: null,
    attackOrder: [], currentHeroIndex: 0, hasUsedAttack: false, hasUsedAbility: false,
    usedAbilities: [], selectedTarget: null, twinSpellUsed: false, oneTwoPunchUsed: false,
    monkAttacksRemaining: 1, oneTwoPunchAttacksRemaining: 0, profile_icon: 'Sorcerer',
    monkDeflectUsed: false
  };
}

// Starts a battle in the real 'battle' phase (same path as production: chooseTurnOrder).
// teamA/teamB are hero names; position 0 acts first for the player who goes first.
function startBattle(gm, teamA, teamB, { firstPlayer = 0, mode = 'random' } = {}) {
  const gameId = `game-${Math.random().toString(36).slice(2)}`;
  const game = gm.createNewGame(gameId, mode);
  const players = [newPlayer('p0', 'Alice'), newPlayer('p1', 'Bob')];
  [teamA, teamB].forEach((names, i) => {
    players[i].team = names.map(n => gm.resetHeroToOriginalState(gm.allHeroes.find(h => h.name === n)));
    players[i].attackOrder = names.slice();
  });
  game.players = players;
  game.phase = 'initiative';
  gm.games.set(gameId, game);
  players.forEach(p => gm.playerGameMap.set(p.id, gameId));

  // Initiative is rolled before the turn order is chosen; give the chosen first player the win
  const first = players[firstPlayer];
  first.initiativeRoll = 20;
  players[1 - firstPlayer].initiativeRoll = 1;
  gm.chooseTurnOrder(first.id, true);

  // Drop the first-pick silence so tests can use the first hero's ability.
  const firstHero = first.team[0];
  if (firstHero.statusEffects) firstHero.statusEffects.silenced = false;
  return game;
}

const hero = (game, playerIndex, name) => game.players[playerIndex].team.find(h => h.name === name);
const heroAt = (game, playerIndex, index) => game.players[playerIndex].team[index];

// Forces d20 rolls (attack rolls, initiative) to a fixed value; other dice use Math.random.
function setD20(value) { rig.value = value; }
function resetDice() {
  rig.value = null;
  if (Math.random.__original) Math.random = Math.random.__original;
}

// Replaces Math.random with a constant, a repeating sequence, or a function (damage dice, random picks).
function setRandom(valueOrSequence) {
  const original = Math.random.__original || Math.random;
  let fn;
  if (typeof valueOrSequence === 'function') {
    fn = valueOrSequence;
  } else {
    const seq = Array.isArray(valueOrSequence) ? valueOrSequence : [valueOrSequence];
    let i = 0;
    fn = () => seq[i++ % seq.length];
  }
  fn.__original = original;
  Math.random = fn;
}

function select(gm, playerId, targetName) {
  const result = gm.selectTarget(playerId, targetName);
  if (!result.success) throw new Error(`selectTarget failed: ${result.error}`);
  return result;
}

module.exports = {
  makeManager, startBattle, hero, heroAt, setD20, setRandom, resetDice, select, quiet, newPlayer
};
