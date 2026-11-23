// Which sound each hero action makes. Pure mapping from a battle event to timed cues; playback lives elsewhere.
import { speedFactor, type AnimSpeed, type BattleEvent } from '../battleAnimations';
import type { SoundId } from './manifest';

export type Family =
  | 'weapon' | 'bow' | 'fists'
  | 'fire' | 'earth' | 'ice' | 'lightning' | 'plant' | 'water' | 'wind' | 'explosion'
  | 'laserPistol' | 'laserRifle' | 'emp' | 'holy' | 'dark' | 'arcane';

// 'synth.tick' is today's synthesized end-of-turn hit (poison, auras), kept as is.
// 'synth.death' is today's synthesized death sound (played here, not in BattleFX, so it sounds with animations off).
export type Cue = { sound: SoundId | 'synth.tick' | 'synth.death'; delayMs: number };

type AbilitySound = Family | 'heal' | 'summon' | 'buff.self' | 'buff.other' | 'command';

export type HeroSound = {
  attack: Family;
  ability?: AbilitySound;
  abilities?: Record<string, Family | 'heal' | 'summon'>;
  triggers?: Record<string, SoundId>;
};

const FAMILIES: readonly Family[] = [
  'weapon', 'bow', 'fists', 'fire', 'earth', 'ice', 'lightning', 'plant', 'water', 'wind', 'explosion',
  'laserPistol', 'laserRifle', 'emp', 'holy', 'dark', 'arcane'
];
const PHYSICAL: readonly Family[] = ['weapon', 'bow', 'fists'];

const DEFAULT: HeroSound = { attack: 'weapon', ability: 'weapon' };

// From the step 6 spec's hero table. Heroes not listed (weapon-only and disabled ones) use DEFAULT.
export const HERO_SOUNDS: Record<string, HeroSound> = {
  'Arcane Archer': { attack: 'bow', ability: 'bow' },
  Ranger: { attack: 'bow', ability: 'bow' },
  Monk: { attack: 'fists', ability: 'fists' },
  Brawler: { attack: 'fists', ability: 'fists' },
  Mech: { attack: 'weapon', ability: 'fists' },
  Engineer: { attack: 'weapon', ability: 'summon' },
  Wizard: { attack: 'weapon', ability: 'fire' },
  Pyromancer: { attack: 'weapon', ability: 'fire' },
  'Dragon Rider': { attack: 'weapon', ability: 'fire' },
  Elementalist: { attack: 'weapon', ability: 'lightning' },
  Shaman: { attack: 'weapon', ability: 'earth' },
  Shroomguard: { attack: 'weapon', ability: 'plant' },
  'Plague Spreader': { attack: 'weapon', ability: 'plant' },
  // No Twin Spell trigger sound: the recast is its own ability event, which already plays ice.
  Sorcerer: { attack: 'weapon', ability: 'ice' },
  Silencer: { attack: 'weapon', ability: 'emp' },
  Bomber: { attack: 'explosion', ability: 'explosion', triggers: { Explosion: 'explosion.hit' } },
  Cleric: { attack: 'weapon', ability: 'holy' },
  Warlock: { attack: 'weapon', ability: 'dark' },
  Reaper: { attack: 'weapon', ability: 'dark' },
  Angel: { attack: 'weapon', ability: 'arcane', triggers: { Resurrect: 'buff.self' } },
  Druid: { attack: 'weapon', ability: 'heal' },
  Medic: { attack: 'weapon', ability: 'summon' },
  Diplomat: { attack: 'weapon', ability: 'command' },
  Timekeeper: { attack: 'weapon', ability: 'command' },
  'Beast Tamer': { attack: 'weapon', ability: 'summon' },
  Berserker: { attack: 'weapon', ability: 'buff.self' },
  'Blood Hunter': { attack: 'weapon', abilities: { 'Crimson Rite': 'weapon', 'Sanguine Renewal': 'weapon' } }
};

const ATTACK_DELAY = 160;
const BEAST_ATTACK_DELAY = 200;
const ABILITY_DELAY = 300;
const TICK_DELAY = 80;
const COMMAND_GAP = 350;
const MIXED_HEAL_GAP = 150;
const TRIGGER_GAP = 400;
// BattleFX greys out a dead hero 250 ms after impact.
const DEATH_GAP = 250;

// Impact time at normal speed, matching BattleFX.
function impactDelay(ev: BattleEvent): number {
  if (ev.kind === 'attack') return ATTACK_DELAY;
  if (ev.kind === 'tick') return TICK_DELAY;
  if (ev.variant === 'beast_attack') return BEAST_ATTACK_DELAY;
  return ABILITY_DELAY;
}

const isFamily = (s: unknown): s is Family => FAMILIES.includes(s as Family);

function heroSound(name: string | undefined | null): HeroSound {
  return (name && HERO_SOUNDS[name]) || DEFAULT;
}

function abilitySound(name: string | undefined | null, abilityName: string | undefined | null): AbilitySound {
  const hero = heroSound(name);
  if (hero.abilities) {
    const entries = Object.entries(hero.abilities);
    const match = abilityName ? hero.abilities[abilityName] : undefined;
    return match ?? (entries.length ? entries[0][1] : hero.ability ?? 'weapon');
  }
  return hero.ability ?? 'weapon';
}

function strike(family: Family, hit: boolean, crit: boolean): SoundId {
  if (!hit) return PHYSICAL.includes(family) ? 'weapon.miss' : 'spell.miss';
  return `${family}.${crit ? 'crit' : 'hit'}` as SoundId;
}

// A commanded ally's own sound (attack or ability), one cue.
function commandSound(name: string, kind: 'attack' | 'ability', abilityName: string | undefined, hit: boolean, crit: boolean): SoundId {
  if (kind === 'attack') return strike(heroSound(name).attack, hit, crit);
  const s = abilitySound(name, abilityName);
  if (isFamily(s)) return strike(s, hit, crit);
  if (s === 'command') return 'buff.other';
  return s;
}

function mainCues(ev: BattleEvent, f: number): Cue[] {
  const name = ev.actor?.name;

  if (ev.kind === 'tick') {
    const cues: Cue[] = [];
    const turrets = ev.turretKeys ?? [];
    if (turrets.length) cues.push({ sound: 'laserPistol.hit', delayMs: TICK_DELAY * f });
    if ((ev.targets ?? []).some(t => t.delta < 0 && !turrets.includes(t.key))) {
      cues.push({ sound: 'synth.tick', delayMs: TICK_DELAY * f });
    }
    // End-of-turn heals (Druid's Healing Word, Medic's Emergency Heal).
    if ((ev.targets ?? []).some(t => t.delta > 0)) cues.push({ sound: 'heal', delayMs: TICK_DELAY * f });
    return cues;
  }

  if (ev.kind === 'attack') {
    return [{ sound: strike(heroSound(name).attack, ev.hit, ev.crit), delayMs: ATTACK_DELAY * f }];
  }

  // Ability.
  const at = ABILITY_DELAY * f;
  if (ev.commands && ev.commands.length) {
    return ev.commands.map((c, i) => ({
      sound: commandSound(c.name, c.kind, c.abilityName, c.hit, c.crit),
      delayMs: at + i * COMMAND_GAP
    }));
  }

  // Beast Tamer's command attack is the beast's weapon strike.
  if (ev.variant === 'beast_attack') return [{ sound: strike('weapon', ev.hit, ev.crit), delayMs: BEAST_ATTACK_DELAY * f }];

  const s = abilitySound(name, ev.abilityName);
  const family: Family = isFamily(s) ? s : 'weapon';
  const cast = ev.cast ?? 'damage';

  if (cast === 'heal') return [{ sound: family === 'water' ? 'heal.water' : 'heal', delayMs: at }];
  // A summon that also strikes (Shaman's totem) keeps the hero's spell family.
  if (cast === 'summon' && !isFamily(s)) return [{ sound: 'summon', delayMs: at }];
  if (cast === 'buff' || cast === 'debuff' || cast === 'generic') {
    return [{ sound: s === 'buff.self' || s === 'buff.other' || s === 'heal' || s === 'summon' ? s : 'buff.other', delayMs: at }];
  }

  const cues: Cue[] = [{ sound: strike(family, ev.hit, ev.crit), delayMs: at }];
  if ((ev.targets ?? []).some(t => t.delta > 0)) {
    cues.push({ sound: family === 'water' ? 'heal.water' : 'heal', delayMs: at + MIXED_HEAL_GAP });
  }
  return cues;
}

export function soundsForEvent(ev: BattleEvent, speed: AnimSpeed): Cue[] {
  const f = speedFactor(speed === 'off' ? 'fast' : speed);
  const cues = mainCues(ev, f);
  const triggers = ev.triggers ?? [];

  // Triggers follow the last main cue (after commanded allies), or the impact if nothing else played.
  if (triggers.length) {
    const base = cues.length ? cues[cues.length - 1].delayMs : impactDelay(ev) * f;
    for (const t of triggers) {
      const sound = heroSound(t.name).triggers?.[t.special];
      if (sound) cues.push({ sound, delayMs: base + TRIGGER_GAP });
    }
  }

  // One death sound per event when any target died (several identical tones at once would only be louder).
  if ((ev.targets ?? []).some(t => t.died)) cues.push({ sound: 'synth.death', delayMs: (impactDelay(ev) + DEATH_GAP) * f });
  return cues;
}

// Manually activated specials (activate-special): Self Destruct booms, Peace Treaty heals, the rest are buffs.
export function soundForSpecial(heroName: string): SoundId {
  if (heroName === 'Mech') return 'explosion.hit';
  if (heroName === 'Diplomat') return 'heal';
  return 'buff.other';
}
