// Battle badges, pure: which round tokens a hero card shows and their helper texts.
// Spec: docs/superpowers/specs/2026-11-22-badges-wording-design.md, "Every badge". Texts are the spec's, verbatim.
import type { Hero, PendingTaunt } from '../types';
import { isHeroAlive } from '../heroHealth';

export type BadgeRim = 'buff' | 'debuff' | 'poison';
export type BadgeKey = 'turrets' | 'totems' | 'medBots' | 'beast' | 'bloodbath' | 'frenzy' | 'desperateBlows'
  | 'hidden' | 'arcaneShield' | 'windWall' | 'poison' | 'taunted' | 'tauntComing' | 'silenced' | 'stunned'
  | 'bribed' | 'guidingBolt' | 'rideDown' | 'healthLink' | 'defenseDown' | 'arcaneMark';
export interface Badge {
  key: BadgeKey;
  symbol: string;        // sprite id: 'i-golem', 'i-totem1'..'i-totem3', 'i-bot', ... (spec "Every badge")
  rim: BadgeRim;
  count?: string;        // corner number: '2', '+1', '-1'; absent for Totems, Beast, Hidden, ...
  dashed?: boolean;      // 'Taunt coming' only
  short: string;         // phone text
  full: string;          // full sentence
}
export interface BadgeContext {
  allies?: Hero[];       // the hero's own team
  enemies?: Hero[];      // the other team
  pendingTaunts?: PendingTaunt[];
}

const clamp = (n: number, max: number) => Math.max(1, Math.min(max, Math.floor(n)));
const turns = (n: number) => `${n} more turn${n === 1 ? '' : 's'}`;

// silenced / disableAttack come as `true` or `{ active, duration }`; returns the turns left (undefined = no count)
function timed(v: boolean | { active: boolean; duration: number } | undefined): { on: boolean; left?: number } {
  if (v === true) return { on: true };
  if (v && typeof v === 'object' && v.active) {
    return { on: true, left: typeof v.duration === 'number' && v.duration > 0 ? v.duration : undefined };
  }
  return { on: false };
}

function hasSpecial(hero: Hero, name: string): boolean {
  const specials = (Array.isArray(hero.Special) ? hero.Special : [hero.Special]) as Array<{ name?: string } | undefined>;
  return specials.some(s => s?.name === name);
}

export function getBadges(hero: Hero, ctx: BadgeContext = {}): Badge[] {
  if (!isHeroAlive(hero)) return []; // A fallen hero shows no badges (owner decision 5)
  const se = hero.statusEffects;
  if (!se) return [];
  const badges: Badge[] = [];
  const enemies = ctx.enemies;

  // Buffs
  if (se.turret_count && se.turret_count > 0) {
    const n = clamp(se.turret_count, 2);
    badges.push({
      key: 'turrets', symbol: 'i-golem', rim: 'buff', count: `${n}`, short: `Turrets ${n}/2`,
      full: `${n} of 2 Turrets. At the end of Engineer's turn each deals 1D4 damage to a random enemy. One is given up to block damage.`,
    });
  }
  if (se.totem_count && se.totem_count > 0) {
    const n = clamp(se.totem_count, 3);
    badges.push({
      key: 'totems', symbol: `i-totem${n}`, rim: 'buff', short: `Totems ${n}/3`,
      full: `${n} of 3 Totems. Elemental Strike adds a Totem, then deals 1D4 damage per Totem.`,
    });
  }
  if (se.med_bot_count && se.med_bot_count > 0) {
    const n = clamp(se.med_bot_count, 3);
    badges.push({
      key: 'medBots', symbol: 'i-bot', rim: 'buff', count: `${n}`, short: `Med Bots ${n}/3`,
      full: `${n} of 3 Med Bots. At the end of Medic's turn, the lowest-HP ally heals for ${n}D4.`,
    });
  }
  if (se.beast_active) {
    badges.push({
      key: 'beast', symbol: 'i-paw', rim: 'buff', short: 'Beast out',
      full: "The Beast is out. Beast Tamer's attacks have advantage.",
    });
  }
  if (se.damageStacks && se.damageStacks > 0) {
    const n = se.damageStacks;
    badges.push({
      key: 'bloodbath', symbol: 'i-blood', rim: 'buff', count: `+${n}`, short: `Bloodbath +${n}`,
      full: `+${n} damage to attacks (max 2).`,
    });
  }
  if (hero.conditionalEffects?.Frenzy === true) {
    badges.push({
      key: 'frenzy', symbol: 'i-flame', rim: 'buff', short: 'Frenzy',
      full: 'Below 10 HP: Berserker can attack twice per turn.',
    });
  }
  if (hero.conditionalEffects?.['Desperate Blows'] === true) {
    badges.push({
      key: 'desperateBlows', symbol: 'i-blows', rim: 'buff', short: 'Desperate Blows',
      full: "Below 10 HP: Fighter's attacks have advantage.",
    });
  }
  if (se.untargetable) {
    badges.push({
      key: 'hidden', symbol: 'i-hidden', rim: 'buff', short: 'Hidden',
      full: "Can't be Focused until Ninja's next turn.",
    });
  }
  // A revived Wizard whose shield was never used gets a fresh statusEffects without arcaneShieldAvailable
  // until the server marks it again; the shield still works then, so it is shown.
  const shieldUp = se.arcaneShieldAvailable === true
    || (se.arcaneShieldAvailable === undefined && se.arcaneShieldUsed !== true && hasSpecial(hero, 'Arcane Shield'));
  if (shieldUp) {
    badges.push({
      key: 'arcaneShield', symbol: 'i-ashield', rim: 'buff', short: 'Arcane Shield',
      full: 'The first hit of more than 5 damage is reduced to 0.',
    });
  }
  const wind = se.windWallAC?.bonus;
  if (wind && wind > 0) {
    badges.push({
      key: 'windWall', symbol: 'i-wind', rim: 'buff', count: `+${wind}`, short: `Wind Wall +${wind}`,
      full: `+${wind} Defense until Elementalist's next turn.`,
    });
  }

  // Poison
  if (se.poison > 0) {
    badges.push({
      key: 'poison', symbol: 'i-poison', rim: 'poison', count: `${se.poison}`, short: `Poison ${se.poison}`,
      full: `Takes ${se.poison} damage at the end of its turn.`,
    });
  }

  // Debuffs
  const taunter = se.taunt?.target;
  // The taunter is on the other team; without the team (no context) it can't be checked, so the badge shows
  if (taunter && (!enemies || enemies.some(e => e.name === taunter && isHeroAlive(e)))) {
    badges.push({
      key: 'taunted', symbol: 'i-taunt', rim: 'debuff', short: `Taunted: ${taunter}`,
      full: `Must Focus ${taunter} with attacks and abilities on its next turn.`,
    });
  }
  const coming = hero.id ? ctx.pendingTaunts?.find(p => p.targetId === hero.id) : undefined;
  if (coming) {
    badges.push({
      key: 'tauntComing', symbol: 'i-taunt', rim: 'debuff', dashed: true, short: 'Taunt coming',
      full: `Will be taunted by ${coming.tauntTarget} at the end of this turn.`,
    });
  }
  const silence = timed(se.silenced);
  if (silence.on) {
    const n = silence.left;
    badges.push({
      key: 'silenced', symbol: 'i-silence', rim: 'debuff', ...(n ? { count: `${n}` } : {}),
      short: n ? `Silenced ${n}` : 'Silenced',
      full: n ? `Can't use abilities for ${turns(n)}.` : "Can't use abilities.",
    });
  }
  const stun = timed(se.disableAttack);
  if (stun.on) {
    const n = stun.left;
    badges.push({
      key: 'stunned', symbol: 'i-stun', rim: 'debuff', ...(n ? { count: `${n}` } : {}),
      short: n ? `Stunned ${n}` : 'Stunned',
      full: n ? `Can't make basic attacks for ${turns(n)}.` : "Can't make basic attacks.",
    });
  }
  if (se.cannotTargetWithAbility) {
    badges.push({
      key: 'bribed', symbol: 'i-bribe', rim: 'debuff', short: 'Bribed',
      full: "Can't use its ability on Hoarder until Hoarder's next turn.",
    });
  }
  if (se.grantAdvantage) {
    badges.push({
      key: 'guidingBolt', symbol: 'i-exposed', rim: 'debuff', short: 'Guiding Bolt',
      full: 'The next attack or ability roll against this hero has advantage.',
    });
  }
  if (se.rideDownDebuff) {
    badges.push({
      key: 'rideDown', symbol: 'i-shoe', rim: 'debuff', short: 'Ride Down',
      full: 'Attacks against this hero have advantage.',
    });
  }
  if (se.health_link) {
    badges.push({
      key: 'healthLink', symbol: 'i-link', rim: 'debuff', short: 'Health Link',
      full: 'The next time Angel takes damage, this hero takes it too.',
    });
  }
  // Piercing Shot is the only Defense debuff; a Defense bonus (Shaman, Wish) is not shown here
  const defense = se.statModifiers?.Defense;
  const piercing = Object.values(se.statModifierAbilities ?? {}).includes('Piercing Shot');
  if (defense !== undefined && defense < 0 && piercing) {
    badges.push({
      key: 'defenseDown', symbol: 'i-defdown', rim: 'debuff', count: `${defense}`, short: `Defense ${defense}`,
      full: `Piercing Shot: ${defense} Defense until Ranger's next turn.`,
    });
  }
  // Hidden while the Archer is dead (owner decision 6); damagedEnemies holds names
  if (enemies?.some(e => e.name === 'Arcane Archer' && isHeroAlive(e) && e.damagedEnemies?.includes(hero.name))) {
    badges.push({
      key: 'arcaneMark', symbol: 'i-mark', rim: 'debuff', short: 'Arcane mark',
      full: 'Arcane Archer deals +1D4 to this hero.',
    });
  }

  return badges;
}
