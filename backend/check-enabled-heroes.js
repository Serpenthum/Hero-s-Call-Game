const heroes = require('./heros.json');

console.log('Total heroes loaded:', heroes.length);

const enabledHeroes = heroes.filter(hero => !hero.disabled);
const disabledHeroes = heroes.filter(hero => hero.disabled);

console.log('\n=== ENABLED HEROES (used in random mode) ===');
enabledHeroes.forEach((hero, index) => {
  console.log(`${index + 1}. ${hero.name}`);
});

console.log('\n=== DISABLED HEROES (not used) ===');
disabledHeroes.forEach((hero, index) => {
  console.log(`${index + 1}. ${hero.name}`);
});

console.log(`\n✅ Enabled heroes: ${enabledHeroes.length}`);
console.log(`❌ Disabled heroes: ${disabledHeroes.length}`);

if (enabledHeroes.length >= 6) {
  console.log(`\n✅ Enough enabled heroes for random mode (need 6, have ${enabledHeroes.length})`);
} else {
  console.log(`\n❌ Not enough enabled heroes for random mode (need 6, have ${enabledHeroes.length})`);
}