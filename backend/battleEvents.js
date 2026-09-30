// Builds compact animation events by diffing team HP/status before and after an action.
// Purely additive: never mutates the game, so it cannot change gameplay.

const heroKey = (playerId, teamIndex) => `${playerId}:${teamIndex}`;

function snapshotBattle(game) {
  if (!game || !Array.isArray(game.players)) return null;
  const heroes = {};
  game.players.forEach(player => {
    (player.team || []).forEach((hero, index) => {
      const effects = hero.statusEffects || {};
      heroes[heroKey(player.id, index)] = {
        playerId: player.id,
        heroIndex: index,
        name: hero.name,
        hp: hero.currentHP,
        statuses: Object.keys(effects).filter(k => effects[k])
      };
    });
  });
  return heroes;
}

function collectEffectTypes(ability) {
  const effects = [...(ability?.primary_effects || []), ...(ability?.secondary_effects || [])];
  return effects.map(e => e.type).filter(Boolean);
}

// Priority decides which single cast style the client plays.
function classifyCast(ability) {
  const types = collectEffectTypes(ability);
  if (types.some(t => t.includes('summon'))) return 'summon';
  if (types.some(t => t.includes('damage'))) return 'damage';
  if (types.some(t => t.includes('heal'))) return 'heal';
  if (types.includes('apply_buff')) return 'buff';
  if (types.includes('apply_debuff')) return 'debuff';
  return 'generic';
}

/**
 * @param {object} before  result of snapshotBattle() taken before the action
 * @param {object} game    live game after the action
 * @param {object} meta    { kind: 'attack'|'ability'|'tick', actorPlayerId, actorHeroIndex, cast, hit, crit, targetName }
 */
function buildBattleEvent(before, game, meta) {
  const after = snapshotBattle(game);
  if (!before || !after) return null;

  const targets = [];
  Object.keys(after).forEach(key => {
    const prev = before[key];
    const now = after[key];
    if (!prev) return;
    const delta = now.hp - prev.hp;
    const statusesAdded = now.statuses.filter(s => !prev.statuses.includes(s));
    if (delta === 0 && statusesAdded.length === 0) return;
    targets.push({
      key,
      playerId: now.playerId,
      heroIndex: now.heroIndex,
      name: now.name,
      delta,
      hpAfter: now.hp,
      died: prev.hp > 0 && now.hp <= 0,
      revived: prev.hp <= 0 && now.hp > 0,
      poisoned: meta.kind === 'tick' && delta < 0 && prev.statuses.includes('poison'),
      statusesAdded
    });
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: meta.kind,
    cast: meta.cast || null,
    actor: meta.actorPlayerId != null
      ? { playerId: meta.actorPlayerId, heroIndex: meta.actorHeroIndex, key: heroKey(meta.actorPlayerId, meta.actorHeroIndex) }
      : null,
    hit: meta.hit !== false,
    crit: !!meta.crit,
    targetName: meta.targetName || null,
    targets
  };
}

module.exports = { snapshotBattle, buildBattleEvent, classifyCast, heroKey };
