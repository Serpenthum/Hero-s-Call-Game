const heroes = require('./heros.json');
console.log('Total heroes loaded:', heroes.length);
console.log('All hero names:');
heroes.forEach((hero, index) => {
  console.log(`${index + 1}. ${hero.name}`);
});

if (heroes.length >= 10) {
  console.log('\n✅ Enough heroes for draft (need 10, have ' + heroes.length + ')');
} else {
  console.log('\n❌ Not enough heroes for draft (need 10, have ' + heroes.length + ')');
}