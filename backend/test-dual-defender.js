// Test the defense sharing issue by directly examining the logic

// Create a mock Monk hero that should receive shared defense
const monk = {
  name: 'Monk',
  HP: 16,
  Defense: 9, // Original defense 
  Accuracy: '+2',
  BasicAttack: '1D4',
  currentHP: 16,
  position: 1
};

// Create a mock Dual Defender that shares defense
const dualDefender = {
  name: 'Dual Defender',
  HP: 20,
  Defense: 11, // Defense to be shared
  Accuracy: '+1',
  BasicAttack: '1D4',
  currentHP: 20,
  position: 0
};

console.log('=== SIMULATING DEFENSE SHARING ===');
console.log(`Dual Defender Defense: ${dualDefender.Defense}`);
console.log(`Monk original Defense: ${monk.Defense}`);

// Simulate what applyAuraEffect does for set_defense_to_self
if (!monk.originalDefense && !monk.sharedDefense) {
  monk.originalDefense = monk.Defense; // Store original Defense for restoration
}

// Use the Dual Defender's base Defense as the ally's new base Defense
const sourceBaseDefense = dualDefender.Defense;
monk.Defense = sourceBaseDefense; // Set as new base Defense
monk.modifiedDefense = sourceBaseDefense; // Also update display
monk.sharedDefense = {
  source: dualDefender.name,
  originalDefense: monk.originalDefense,
  sharedValue: sourceBaseDefense
};

console.log('\n=== AFTER DEFENSE SHARING ===');
console.log(`Monk Defense: ${monk.Defense}`);
console.log(`Monk originalDefense: ${monk.originalDefense}`);
console.log(`Monk sharedDefense: ${JSON.stringify(monk.sharedDefense)}`);
console.log(`Monk modifiedDefense: ${monk.modifiedDefense}`);

// Now simulate what updateHeroDisplayStats does - THIS IS THE PROBLEM
console.log('\n=== SIMULATING updateHeroDisplayStats (THE PROBLEM) ===');

// This is the BUGGY line from updateHeroDisplayStats:
// hero.modifiedDefense = hero.Defense !== undefined ? hero.Defense : hero.AC;
// It resets to hero.Defense, but hero.Defense is already the SHARED value (11), not original (9)!

monk.modifiedDefense = monk.Defense; // This resets to the shared Defense (11), not the original!

console.log('PROBLEM: updateHeroDisplayStats resets modifiedDefense to current Defense value');
console.log(`But current Defense is already shared: ${monk.Defense}`);
console.log(`Should be using originalDefense when sharedDefense exists: ${monk.originalDefense}`);

console.log('\n=== PROPOSED FIX SIMULATION ===');
// Simulate the fixed updateHeroDisplayStats logic
if (monk.sharedDefense) {
  // Hero has shared defense - use the shared value as the base
  monk.modifiedDefense = monk.sharedDefense.sharedValue;
} else {
  // Normal case - use the hero's own Defense  
  monk.modifiedDefense = monk.Defense;
}

console.log(`Fixed modifiedDefense: ${monk.modifiedDefense}`);
console.log('This should stay at 11 (shared value) throughout all calculations');

// Now simulate adding other effects on top (like debuffs)
console.log('\n=== APPLYING ADDITIONAL EFFECTS ON TOP ===');
// Simulate applying a -1 Defense debuff (like from Ranger's Piercing Shot)
const defenseDebuff = -1;
monk.modifiedDefense += defenseDebuff;
console.log(`After -1 Defense debuff: ${monk.modifiedDefense}`);
console.log('Result: 10 (11 shared - 1 debuff) - this should be correct!');