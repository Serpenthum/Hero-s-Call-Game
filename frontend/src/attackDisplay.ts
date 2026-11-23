import { Hero } from './types';

export interface AttackDisplay {
  text: string;
  hasExtras: boolean;
  // Tooltip lines for bonuses that don't come from passiveBuffs.
  sources: string[];
}

// Builds e.g. "2D4 + 1D6 + 2": base attack plus every damage bonus, matching dice added together.
export function getAttackDisplay(hero: Pick<Hero, 'BasicAttack' | 'scalingBuffs' | 'statusEffects' | 'passiveBuffs'>): AttackDisplay {
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

  return { text: combineDice(parts), hasExtras: parts.length > 1, sources };
}

// Adds matching dice together and flat bonuses together: ["1D4", "1D4 + 1D6", "2"] → "2D4 + 1D6 + 2".
export function combineDice(parts: string[]): string {
  const dice = new Map<number, number>();
  let flat = 0;
  for (const term of parts.join('+').split('+').map(t => t.trim()).filter(Boolean)) {
    const die = term.match(/^(\d*)D(\d+)$/i);
    if (die) {
      const sides = Number(die[2]);
      dice.set(sides, (dice.get(sides) || 0) + Number(die[1] || 1));
    } else if (/^\d+$/.test(term)) {
      flat += Number(term);
    }
  }
  const terms = [...dice.entries()].sort((a, b) => a[0] - b[0]).map(([sides, count]) => `${count}D${sides}`);
  if (flat > 0) terms.push(String(flat));
  return terms.join(' + ');
}
