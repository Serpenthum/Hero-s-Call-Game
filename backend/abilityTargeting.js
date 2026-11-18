// Classifies abilities and specials for battle Focus (see docs/superpowers/specs/2026-11-18-battle-focus-design.md).
// kind: where the ability lands. 'all' = every enemy, 'self' = never touches the focused enemy, 'enemy' = the focus.
// damaging: lost once the focused enemy has fallen.

const DAMAGING_TYPES = new Set([
  'damage', 'lifesteal_damage', 'conditional_damage', 'command_ally', 'command_adjacent_allies',
  'take_turn_as_enemy', 'copy_and_use_ability'
]);

const ENEMY_TARGETS = new Set(['target', 'chosen_enemy']);

function conditionHolds(condition, caster) {
  const beastActive = !!(caster && caster.statusEffects && caster.statusEffects.beast_active);
  if (condition === 'beast_active') return beastActive;
  if (condition === 'beast_inactive') return !beastActive;
  return true;
}

// Every effect of the ability; Beast Tamer's conditional actions count only when their condition holds.
function abilityEffects(ability, caster) {
  const effects = [];
  for (const key of Object.keys(ability || {})) {
    if (!/effects$/.test(key) || !Array.isArray(ability[key])) continue;
    for (const effect of ability[key]) {
      if (!effect) continue;
      if (effect.type === 'conditional_action') {
        if (effect.action && conditionHolds(effect.condition, caster)) effects.push(effect.action);
      } else {
        effects.push(effect);
      }
    }
  }
  return effects;
}

function touchesFocus(effect) {
  if (ENEMY_TARGETS.has(effect.target)) return true;
  if (typeof effect.target === 'string' && effect.target.startsWith('adjacent_enemy')) return true;
  return effect.against === 'target' || effect.source === 'chosen_enemy';
}

function classifyAbility(ability, caster) {
  const effects = abilityEffects(ability, caster);
  const damaging = effects.some(e => DAMAGING_TYPES.has(e.type));
  let kind;
  if (ability.target_type === 'all_enemies' || effects.some(e => e.target === 'all_enemies')) kind = 'all';
  else if (ability.target_type === 'self_only' || !effects.some(touchesFocus)) kind = 'self';
  else kind = 'enemy';
  return { kind, damaging };
}

function specialDamaging(special) {
  return !!special && special.category === 'activated_aoe';
}

// Owner's rule: only single-target damage needs a living focus. Area abilities ('all') and the
// activated specials (all area effects) still work after the focus falls; self abilities always do.
// 'enemy' covers Cleave and the Elementalist's ability, which hit the focus and splash a neighbour.
function lostWithFallenFocus(targeting) {
  return !!targeting && targeting.kind === 'enemy' && targeting.damaging;
}

module.exports = { classifyAbility, specialDamaging, lostWithFallenFocus };
