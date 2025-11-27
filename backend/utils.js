// Utility functions for game mechanics

function rollDice(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollMultipleDice(count, sides) {
  let total = 0;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const roll = rollDice(sides);
    rolls.push(roll);
    total += roll;
  }
  return { total, rolls };
}

function parseDiceString(diceStr) {
  if (diceStr === '—' || diceStr === '') return null;
  
  // Handle fixed numbers
  if (!isNaN(diceStr)) {
    return { count: 0, sides: 0, modifier: parseInt(diceStr) };
  }

  const match = diceStr.match(/(\d+)D(\d+)(\+\d+)?/i);
  if (!match) return null;

  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    modifier: match[3] ? parseInt(match[3]) : 0
  };
}

function rollDiceString(diceStr, advantage = false) {
  const parsed = parseDiceString(diceStr);
  if (!parsed) return { total: 0, rolls: [], isCritical: false };

  // Handle fixed damage
  if (parsed.count === 0) {
    return { total: parsed.modifier, rolls: [], isCritical: false };
  }

  let bestResult = null;
  let rollCount = advantage ? 2 : 1;

  for (let attempt = 0; attempt < rollCount; attempt++) {
    const result = rollMultipleDice(parsed.count, parsed.sides);
    result.total += parsed.modifier;
    
    // Check for critical (natural 20 on any die)
    result.isCritical = result.rolls.includes(20);
    
    if (!bestResult || result.total > bestResult.total) {
      bestResult = result;
    }
  }

  return bestResult;
}

function calculateAttackRoll(accuracy, advantage = false, disadvantage = false, caster = null) {
  const accuracyBonus = parseInt(accuracy.replace('+', '')) || 0;
  
  let roll = rollDice(20);
  let advantageInfo = null;
  
  if (advantage && !disadvantage) {
    // Advantage: roll twice, take higher
    const secondRoll = rollDice(20);
    const finalRoll = Math.max(roll, secondRoll);
    advantageInfo = {
      type: 'advantage',
      roll1: roll,
      roll2: secondRoll,
      chosen: finalRoll
    };
    console.log(`🎲 Advantage roll: ${finalRoll} (rolled ${roll} and ${secondRoll}, chose higher)`);
    roll = finalRoll;
  } else if (disadvantage && !advantage) {
    // Disadvantage: roll twice, take lower
    const secondRoll = rollDice(20);
    const finalRoll = Math.min(roll, secondRoll);
    advantageInfo = {
      type: 'disadvantage',
      roll1: roll,
      roll2: secondRoll,
      chosen: finalRoll
    };
    console.log(`🎲 Disadvantage roll: ${finalRoll} (rolled ${roll} and ${secondRoll}, chose lower)`);
    roll = finalRoll;
  }
  // If both advantage and disadvantage, they cancel out (normal roll)
  
  // Check for modified crit range (like Swordsman's Critical Strikes)
  let critThreshold = 20;
  if (caster && caster.Special) {
    const specials = Array.isArray(caster.Special) ? caster.Special : [caster.Special];
    for (const special of specials) {
      if (special.effects) {
        for (const effect of special.effects) {
          if (effect.type === 'modify_crit_range' && effect.min_roll) {
            critThreshold = effect.min_roll;
            break;
          }
        }
      }
    }
  }
  
  return {
    roll: roll,
    bonus: accuracyBonus,
    total: roll + accuracyBonus,
    isCritical: roll >= critThreshold,
    crit: roll >= critThreshold, // Legacy compatibility
    advantageInfo: advantageInfo
  };
}

function calculateDamage(damageStr, isCritical = false, advantage = false, caster = null, isBasicAttack = false) {
  const parsed = parseDiceString(damageStr);
  if (!parsed) return { total: 0, rolls: [] };

  let baseDamage;
  if (isCritical && parsed.count > 0) {
    // Critical hit: maximum damage
    baseDamage = {
      total: (parsed.count * parsed.sides) + parsed.modifier,
      rolls: Array(parsed.count).fill(parsed.sides),
      isCritical: true
    };
  } else {
    baseDamage = rollDiceString(damageStr, advantage);
  }

  // Apply damage stacks if caster has them (Berserker bloodbath stacks)
  if (caster && caster.statusEffects && caster.statusEffects.damageStacks) {
    baseDamage.total += caster.statusEffects.damageStacks;
  }

  // Apply passive damage buffs if caster has them (Warlock Dark Pact, etc.)
  if (caster && caster.passiveBuffs) {
    const damageBuffs = caster.passiveBuffs.filter(b => b.stat === 'damage');
    const totalDamageBonus = damageBuffs.reduce((sum, buff) => sum + buff.value, 0);
    if (totalDamageBonus > 0) {
      baseDamage.total += totalDamageBonus;
    }
  }

  // Apply scaling damage buffs if caster has them (Champion's Last Stand)
  if (caster && caster.scalingBuffs && caster.scalingBuffs.damage) {
    const scalingDamage = caster.scalingBuffs.damage;
    // Each scaling point adds 1D6 damage
    for (let i = 0; i < scalingDamage; i++) {
      const extraDamage = isCritical ? 6 : rollDice(6); // Max damage on crit
      baseDamage.total += extraDamage;
      baseDamage.rolls.push(extraDamage);
    }
  }
  
  // Apply Hoarder's collected dice ONLY for basic attacks
  if (isBasicAttack && caster && caster.scalingBuffs && caster.scalingBuffs.collectedDice && caster.scalingBuffs.collectedDice.length > 0) {
    for (const collected of caster.scalingBuffs.collectedDice) {
      const collectedDamage = rollDiceString(collected.dice);
      if (isCritical) {
        // For critical hits, maximize the collected dice too
        const parsed = parseDiceString(collected.dice);
        if (parsed) {
          baseDamage.total += (parsed.count * parsed.sides) + parsed.modifier;
          baseDamage.rolls.push(...Array(parsed.count).fill(parsed.sides));
        } else {
          baseDamage.total += collectedDamage.total;
          baseDamage.rolls.push(...collectedDamage.rolls);
        }
      } else {
        baseDamage.total += collectedDamage.total;
        baseDamage.rolls.push(...collectedDamage.rolls);
      }
    }
  }

  return baseDamage;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function weightedShuffle(array, favoredHeroes = []) {
  // Create weighted pool - favored heroes appear multiple times
  const weightedPool = [];
  
  array.forEach(hero => {
    // Add hero once normally
    weightedPool.push(hero);
    
    // Add favored heroes additional times (3x more likely to appear)
    if (favoredHeroes.includes(hero.name)) {
      weightedPool.push(hero, hero, hero);
    }
  });
  
  // Shuffle the weighted pool
  const shuffledPool = shuffleArray(weightedPool);
  
  // Remove duplicates while preserving the weighted order
  const result = [];
  const seenNames = new Set();
  
  for (const hero of shuffledPool) {
    if (!seenNames.has(hero.name)) {
      result.push(hero);
      seenNames.add(hero.name);
    }
  }
  
  // If we don't have enough unique heroes, fill with remaining
  const remainingHeroes = array.filter(hero => !seenNames.has(hero.name));
  result.push(...shuffleArray(remainingHeroes));
  
  return result;
}

function applyStatusEffect(hero, effect, value, duration = null, stat = null, caster = null, durationUnit = null, abilityName = null) {
  if (!hero.statusEffects) {
    hero.statusEffects = {
      poison: 0,
      taunt: null,
      inspiration: 0,
      silenced: false,
      untargetable: false,
      damageStacks: 0,
      armorReduction: 0,
      stun: null,
      statModifiers: {},
      statModifierDurations: {},
      statModifierCasters: {},
      statModifierUnits: {},
      statModifierAbilities: {}
    };
  }

  switch (effect) {
    case 'poison':
      if (value === 'match_damage') {
        // For Plague Spreader's Poison Touch - value will be set by the calling code
        hero.statusEffects.poison += hero.lastDamageDealt || 1;
      } else {
        hero.statusEffects.poison += value;
      }
      break;
    case 'taunt':
      hero.statusEffects.taunt = { 
        target: value, 
        duration: duration || 1,
        appliedBy: caster,
        source: caster
      };
      break;
    case 'inspiration':
      hero.statusEffects.inspiration += value;
      break;
    case 'silence':
      console.log(`🤐 Applying silence to ${hero.name} for ${duration || 1} turns`);
      hero.statusEffects.silenced = { active: true, duration: duration || 1 };
      break;
    case 'stun':
      console.log(`😵 Applying stun to ${hero.name} for ${duration || 1} turns`);
      hero.statusEffects.stun = { active: true, duration: duration || 1, appliedBy: caster };
      break;
    case 'disable_attack':
      console.log(`🚫 Disabling attacks for ${hero.name} for ${duration || 1} turns`);
      hero.statusEffects.disableAttack = { active: true, duration: duration || 1, appliedBy: caster };
      break;
    case 'untargetable':
      hero.statusEffects.untargetable = true;
      if (duration) {
        setTimeout(() => hero.statusEffects.untargetable = false, duration);
      }
      break;
    case 'damage_stack':
      hero.statusEffects.damageStacks = Math.min(
        (hero.statusEffects.damageStacks || 0) + value, 
        2 // Max 2 stacks for Berserker
      );
      break;
    case 'armor_reduction':
      hero.statusEffects.armorReduction = (hero.statusEffects.armorReduction || 0) + value;
      break;
    case 'stat_modifier':
      // Handle stat modifiers with duration tracking
      if (!hero.statusEffects.statModifiers) {
        hero.statusEffects.statModifiers = {};
      }
      const statToModify = stat || 'Defense'; // Default to Defense if no stat specified
      if (!hero.statusEffects.statModifiers[statToModify]) {
        hero.statusEffects.statModifiers[statToModify] = 0;
      }
      hero.statusEffects.statModifiers[statToModify] += value;
      
      // Store duration info if provided
      if (duration && durationUnit) {
        if (!hero.statusEffects.statModifierDurations) {
          hero.statusEffects.statModifierDurations = {};
        }
        if (!hero.statusEffects.statModifierCasters) {
          hero.statusEffects.statModifierCasters = {};
        }
        if (!hero.statusEffects.statModifierUnits) {
          hero.statusEffects.statModifierUnits = {};
        }
        
        const modifierKey = `${statToModify}_${caster}`;
        hero.statusEffects.statModifierDurations[modifierKey] = duration;
        hero.statusEffects.statModifierCasters[modifierKey] = caster;
        hero.statusEffects.statModifierUnits[modifierKey] = durationUnit;
        
        // Store ability name if provided
        if (abilityName) {
          if (!hero.statusEffects.statModifierAbilities) {
            hero.statusEffects.statModifierAbilities = {};
          }
          hero.statusEffects.statModifierAbilities[modifierKey] = abilityName;
        }
      }
      break;
  }
}

function processEndOfTurn(hero) {
  const effects = hero.statusEffects;
  const results = [];

  // Process poison damage
  if (effects.poison > 0) {
    const poisonDamage = effects.poison;
    hero.currentHP = Math.max(0, hero.currentHP - poisonDamage);
    results.push({
      type: 'poison_damage',
      target: hero.name,
      damage: poisonDamage,
      remainingHP: hero.currentHP
    });
  }

  // Reduce timed effects
  if (effects.taunt && effects.taunt.duration) {
    effects.taunt.duration--;
    if (effects.taunt.duration <= 0) {
      effects.taunt = null;
      results.push({ type: 'taunt_expired' });
    }
  }

  // Handle silence duration
  if (effects.silenced && effects.silenced.active && effects.silenced.duration) {
    effects.silenced.duration--;
    console.log(`🤐 ${hero.name} silence duration decreased to ${effects.silenced.duration}`);
    if (effects.silenced.duration <= 0) {
      console.log(`🗣️ ${hero.name} silence expired!`);
      effects.silenced = false;
      results.push({ type: 'silence_expired' });
    }
  }

  // Handle disable attack duration  
  if (effects.disableAttack && effects.disableAttack.active && effects.disableAttack.duration) {
    effects.disableAttack.duration--;
    console.log(`🚫 ${hero.name} attack disable duration decreased to ${effects.disableAttack.duration}`);
    if (effects.disableAttack.duration <= 0) {
      console.log(`⚔️ ${hero.name} can attack again!`);
      effects.disableAttack = false;
      results.push({ type: 'attack_disable_expired' });
    }
  }

  // Cavalier's Ride Down debuff persists until healed to full HP (handled elsewhere)
  // No automatic expiration needed here

  // Handle stat modifier durations
  if (effects.statModifierDurations) {
    Object.keys(effects.statModifierDurations).forEach(stat => {
      if (effects.statModifierDurations[stat] > 0) {
        effects.statModifierDurations[stat]--;
        if (effects.statModifierDurations[stat] <= 0) {
          // Remove the stat modifier when duration expires
          if (effects.statModifiers && effects.statModifiers[stat]) {
            delete effects.statModifiers[stat];
            results.push({ 
              type: 'stat_modifier_expired',
              stat: stat,
              hero: hero.name
            });
          }
          delete effects.statModifierDurations[stat];
        }
      }
    });
  }

  return results;
}

function getTargetableEnemies(allEnemies, attackingHero) {
  // Filter out untargetable enemies
  let targetable = allEnemies.filter(enemy => 
    enemy.currentHP > 0 && !enemy.statusEffects?.untargetable
  );

  // Check for taunt effects
  const taunters = targetable.filter(enemy => 
    enemy.statusEffects?.taunt?.target === attackingHero.id
  );

  // If there are taunters and the attacking hero doesn't ignore taunt, must target taunters
  if (taunters.length > 0 && !attackingHero.specialEffects?.ignoresTaunt) {
    return taunters;
  }

  return targetable;
}

function canUseBasicAttack(hero) {
  return hero.BasicAttack !== '—' && hero.BasicAttack !== '';
}

function hasSpecialEffect(hero, effectName) {
  if (!hero.Special) return false;
  
  // Handle both array and object formats
  const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
  
  return specials.some(special => 
    special.effects?.some(effect => 
      effect.effect === effectName || effect.type === effectName
    )
  );
}

function calculateEffectiveDefense(hero) {
  // Use modifiedDefense if it exists (already includes scalingBuffs from updateHeroDisplayStats)
  let effectiveDefense = hero.modifiedDefense !== undefined ? hero.modifiedDefense : (hero.Defense !== undefined ? hero.Defense : hero.AC);
  
  // Ensure we have a valid number
  if (effectiveDefense === undefined || effectiveDefense === null) {
    console.error(`⚠️ calculateEffectiveDefense: No Defense found for ${hero.name}`, { hero });
    effectiveDefense = 0;
  }
  
  // Note: modifiedDefense already includes:
  // - Base Defense
  // - Shared Defense (Dual Defender)
  // - Permanent stat modifiers (Dragon Rider's Dismount)
  // - Status effect stat modifiers (Ranger's Piercing Shot)
  // - Scaling buffs (Champion's Last Stand)
  // - Wind Wall bonus (Elementalist)
  // - Passive buffs/debuffs from auras
  // So we don't need to add them again here
  
  return Math.max(0, effectiveDefense); // Defense can't go below 0
}

module.exports = {
  rollDice,
  rollMultipleDice,
  parseDiceString,
  rollDiceString,
  calculateAttackRoll,
  calculateDamage,
  shuffleArray,
  weightedShuffle,
  applyStatusEffect,
  processEndOfTurn,
  getTargetableEnemies,
  canUseBasicAttack,
  hasSpecialEffect,
  calculateEffectiveDefense
};