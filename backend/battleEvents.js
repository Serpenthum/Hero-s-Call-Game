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
function castStyle(ability) {
  const types = collectEffectTypes(ability);
  if (types.some(t => t.includes('summon'))) return 'summon';
  if (types.some(t => t.includes('damage'))) return 'damage';
  if (types.some(t => t.includes('heal'))) return 'heal';
  if (types.includes('apply_buff')) return 'buff';
  if (types.includes('apply_debuff')) return 'debuff';
  return 'generic';
}

// Must be called before the action resolves: Beast Tamer's first use summons the beast, later uses command an attack.
function classifyCast(ability, hero) {
  if (hero && hero.name === 'Beast Tamer' && ability?.name === 'Call Beast / Command Attack') {
    return hero.statusEffects?.beast_active
      ? { cast: 'damage', variant: 'beast_attack' }
      : { cast: 'summon', variant: null };
  }
  return { cast: castStyle(ability), variant: null };
}

// Records something the client should hear (a commanded ally, a turret shot, a triggered special).
// Only collects while withBattleEvent has set game.soundNotes, so other callers cost nothing.
// note: { type: 'command', hero, playerId, kind, abilityName?, hit, crit }
//     | { type: 'trigger', hero, playerId, special }
//     | { type: 'turret', targetHero, targetPlayerId }
function noteSound(game, note) {
  if (game && Array.isArray(game.soundNotes) && note) game.soundNotes.push(note);
}

function noteKey(game, playerId, hero) {
  const player = game.players.find(p => p.id === playerId);
  const index = player ? (player.team || []).indexOf(hero) : -1;
  return index === -1 ? null : heroKey(playerId, index);
}

// Turns the notes into the optional event fields; empty lists are left out.
function soundFields(game) {
  const fields = {};
  if (!Array.isArray(game.soundNotes)) return fields;
  const commands = [];
  const triggers = [];
  const turretKeys = [];
  game.soundNotes.forEach(note => {
    if (note.type === 'command') {
      const key = noteKey(game, note.playerId, note.hero);
      if (!key) return;
      const command = { key, name: note.hero.name, kind: note.kind };
      if (note.abilityName) command.abilityName = note.abilityName;
      command.hit = !!note.hit;
      command.crit = !!note.crit;
      commands.push(command);
    } else if (note.type === 'trigger') {
      const key = noteKey(game, note.playerId, note.hero);
      if (key) triggers.push({ key, name: note.hero.name, special: note.special });
    } else if (note.type === 'turret') {
      const key = noteKey(game, note.targetPlayerId, note.targetHero);
      if (key && !turretKeys.includes(key)) turretKeys.push(key);
    }
  });
  if (commands.length) fields.commands = commands;
  if (triggers.length) fields.triggers = triggers;
  if (turretKeys.length) fields.turretKeys = turretKeys;
  return fields;
}

/**
 * @param {object} before  result of snapshotBattle() taken before the action
 * @param {object} game    live game after the action
 * @param {object} meta    { kind: 'attack'|'ability'|'tick', actorPlayerId, actorHeroIndex, actorName, abilityName, cast, hit, crit, targetName }
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

  const actor = meta.actorPlayerId != null
    ? { playerId: meta.actorPlayerId, heroIndex: meta.actorHeroIndex, key: heroKey(meta.actorPlayerId, meta.actorHeroIndex) }
    : null;
  if (actor && meta.actorName) actor.name = meta.actorName;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: meta.kind,
    cast: meta.cast || null,
    variant: meta.variant || null,
    actor,
    hit: meta.hit !== false,
    crit: !!meta.crit,
    targetName: meta.targetName || null,
    targetKey: meta.targetKey || null,
    targets
  };
  if (meta.abilityName) event.abilityName = meta.abilityName;
  return Object.assign(event, soundFields(game));
}

module.exports = { snapshotBattle, buildBattleEvent, classifyCast, heroKey, noteSound };
