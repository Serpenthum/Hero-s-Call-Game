// Draft clock: each ban or pick round lasts 30 seconds; whoever has not acted when it runs out is played for.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); });

const make = (id, name, hand) => ({
  id, name, userId: null, connected: true, team: [], draftCards: hand, bannedCard: null,
  attackOrder: [], currentHeroIndex: 0, hasUsedAttack: false, hasUsedAbility: false, usedAbilities: [],
  selectedTarget: null, twinSpellUsed: false, oneTwoPunchUsed: false, monkAttacksRemaining: 1,
  oneTwoPunchAttacksRemaining: 0, profile_icon: 'Sorcerer', monkDeflectUsed: false
});

// A game in the ban round: five heroes in each hand, nobody has acted
function newDraft() {
  const gameId = `draft-${Math.random().toString(36).slice(2)}`;
  const game = gm.createNewGame(gameId, 'draft');
  const heroes = gm.allHeroes.filter(h => !h.disabled).slice(0, 10).map(h => gm.resetHeroToOriginalState(h));
  game.players = [make('p0', 'Alice', heroes.slice(0, 5)), make('p1', 'Bob', heroes.slice(5, 10))];
  game.phase = 'draft';
  game.currentDraftPhase = 0;
  game.draftTurn = 0;
  game.draftCards = {
    player1: game.players[0].draftCards.map(h => h.name),
    player2: game.players[1].draftCards.map(h => h.name)
  };
  gm.games.set(gameId, game);
  game.players.forEach(p => gm.playerGameMap.set(p.id, gameId));
  return game;
}
const kinds = events => events.map(e => e.kind);

describe('Draft clock', () => {
  test('starts a 30 second clock for the ban round without acting yet', () => {
    const game = newDraft();
    const events = gm.tickDraftTimers(1000);
    assert.deepEqual(kinds(events), ['timer']);
    assert.equal(events[0].round, 0);
    assert.equal(events[0].durationMs, 30000);
    assert.equal(events[0].remainingMs, 30000);
    assert.equal(game.players[0].bannedCard, null);
  });

  test('does nothing before the clock runs out', () => {
    newDraft();
    gm.tickDraftTimers(1000);
    assert.deepEqual(gm.tickDraftTimers(1000 + 29999), []);
  });

  test('bans a random card from each undecided hand when it runs out', () => {
    const game = newDraft();
    const hands = game.players.map(p => p.draftCards.map(h => h.name));
    gm.tickDraftTimers(1000);
    const events = gm.tickDraftTimers(1000 + 30000);
    assert.deepEqual(kinds(events), ['ban', 'ban']);
    events.forEach(e => assert.equal(e.result.success, true));
    game.players.forEach((p, i) => assert.ok(hands[i].includes(p.bannedCard), `${p.name}'s ban came from their own hand`));
    assert.equal(game.currentDraftPhase, 1);
  });

  test('only plays for the player who is still undecided', () => {
    const game = newDraft();
    gm.tickDraftTimers(1000);
    gm.banCard('p0', game.players[0].draftCards[0].name);
    const events = gm.tickDraftTimers(1000 + 30000);
    assert.deepEqual(kinds(events), ['ban']);
    assert.equal(events[0].playerId, 'p1');
    assert.equal(game.currentDraftPhase, 1);
  });

  test('a new round gets a fresh 30 second clock', () => {
    newDraft();
    gm.tickDraftTimers(0);
    gm.tickDraftTimers(30000); // auto-bans and moves to the first pick round
    const events = gm.tickDraftTimers(30001);
    assert.deepEqual(kinds(events), ['timer']);
    assert.equal(events[0].round, 1);
    assert.equal(events[0].remainingMs, 30000);
    assert.deepEqual(gm.tickDraftTimers(30001 + 29999), []);
  });

  test('plays all three pick rounds and ends in setup with three heroes each', () => {
    const game = newDraft();
    let now = 0;
    for (let i = 0; i < 12 && game.phase === 'draft'; i++) {
      gm.tickDraftTimers(now);
      now += 30000;
    }
    assert.equal(game.phase, 'setup');
    game.players.forEach(p => assert.equal(p.team.length, 3));
    assert.deepEqual(gm.tickDraftTimers(now), []);
  });

  test('a player who already picked is left alone while the other is played for', () => {
    const game = newDraft();
    gm.tickDraftTimers(0);
    gm.tickDraftTimers(30000); // bans; now in pick round 1
    gm.tickDraftTimers(60000); // clock for round 1 starts
    gm.pickCard('p1', game.players[1].draftCards[0].name);
    const events = gm.tickDraftTimers(90000);
    assert.deepEqual(kinds(events), ['pick']);
    assert.equal(events[0].playerId, 'p0');
    assert.equal(game.currentDraftPhase, 2);
    assert.equal(game.players[1].team.length, 1, 'the player who had picked was not given a second pick');
  });

  test('ignores games that are not drafting', () => {
    const game = newDraft();
    game.phase = 'battle';
    assert.deepEqual(gm.tickDraftTimers(0), []);
    assert.deepEqual(gm.tickDraftTimers(99999), []);
  });
});
