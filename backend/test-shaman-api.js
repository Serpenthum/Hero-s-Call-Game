const fs = require('fs');
const path = require('path');

async function testShamanAPI() {
  try {
    console.log('Testing API endpoint for Shaman...');
    
    const response = await fetch('http://localhost:3001/api/heroes');
    const heroes = await response.json();
    
    console.log('Total heroes from API:', heroes.length);
    
    const shaman = heroes.find(hero => hero.name === 'Shaman');
    
    if (shaman) {
      console.log('✅ Shaman found in API response!');
      console.log('- Name:', shaman.name);
      console.log('- Disabled:', shaman.disabled);
      console.log('- HP:', shaman.HP);
      console.log('- AC:', shaman.AC);
    } else {
      console.log('❌ Shaman NOT found in API response');
      
      // Check if it might be disabled
      const allShamans = heroes.filter(hero => hero.name.includes('Shaman'));
      console.log('Heroes with "Shaman" in name:', allShamans.length);
      
      if (allShamans.length > 0) {
        allShamans.forEach((hero, i) => {
          console.log(`  ${i + 1}. ${hero.name} - disabled: ${hero.disabled}`);
        });
      }
    }
    
    // Also check the file directly
    const heroesPath = path.join(__dirname, 'heros.json');
    const fileData = JSON.parse(fs.readFileSync(heroesPath, 'utf8'));
    const fileShamans = fileData.filter(hero => hero.name === 'Shaman');
    
    console.log('\nDirect file check:');
    console.log('Shamans in file:', fileShamans.length);
    if (fileShamans.length > 0) {
      fileShamans.forEach((hero, i) => {
        console.log(`  ${i + 1}. ${hero.name} - disabled: ${hero.disabled}`);
      });
    }
    
  } catch (error) {
    console.error('Error testing API:', error.message);
  }
}

testShamanAPI();