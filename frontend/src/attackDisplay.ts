import { Hero } from './types';

export interface AttackDisplay {
  text: string;
  hasExtras: boolean;
  // Tooltip lines for bonuses that don't come from passiveBuffs.
  sources: string[];
}

// Builds e.g. "1D4 + 1D6 + 1D4 + 2": base attack plus every damage bonus, each shown separately.
export function getAttackDisplay(hero: Hero): AttackDisplay {
  if (!hero.BasicAttack || hero.BasicAttack === '—' || hero.BasicAttack === '-') {
    return { text: hero.BasicAttack, hasExtras: false, sources: [] };
  }

  const parts: string[] = [hero.BasicAttack];
  const sources: string[] = [];

  const scaling = hero.scalingBuffs;
  if (scaling?.damage) {
    parts.push(`${scaling.damage}D6`);
    sources.push(`+${scaling.damage}D6 from Last Stand`);
  }

  // Hoarder's Collect Weapons: one entry per fallen hero.
  for (const collected of scaling?.collectedDice || []) {
    const dice = collected.dice.replace(/\s*\+\s*/g, ' + ');
    parts.push(dice);
    sources.push(`+${dice} from ${collected.from}`);
  }

  const stacks = hero.statusEffects?.damageStacks;
  if (stacks && stacks > 0) {
    parts.push(String(stacks));
    sources.push(`+${stacks} from Bloodbath stacks`);
  }

  const passiveDamage = (hero.passiveBuffs || [])
    .filter(buff => buff.stat === 'damage')
    .reduce((sum, buff) => sum + buff.value, 0);
  if (passiveDamage > 0) parts.push(String(passiveDamage));

  return { text: parts.join(' + '), hasExtras: parts.length > 1, sources };
}
