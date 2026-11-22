import { describe, it, expect } from 'vitest';
import heroes from '../../../backend/heros.json';
import type { BattleEvent, BattleEventTarget } from '../battleAnimations';
import { HERO_SOUNDS, soundsForEvent, soundForSpecial } from './heroSounds';

function target(key: string, delta: number, extra: Partial<BattleEventTarget> = {}): BattleEventTarget {
  return {
    key, playerId: key.split(':')[0], heroIndex: Number(key.split(':')[1]), name: 'X',
    delta, hpAfter: 5, died: false, revived: false, statusesAdded: [], ...extra
  };
}

function ev(partial: Partial<BattleEvent> & { name?: string }): BattleEvent {
  const { name, ...rest } = partial;
  return {
    id: 'e1',
    kind: 'attack',
    cast: null,
    actor: { playerId: 'p0', heroIndex: 0, key: 'p0:0', ...(name ? { name } : {}) },
    hit: true,
    crit: false,
    targetName: 'X',
    targets: [target('p1:0', -3)],
    ...rest
  };
}

const sounds = (e: BattleEvent, speed: 'off' | 'fast' | 'normal' = 'normal') => soundsForEvent(e, speed).map(c => c.sound);

describe('soundsForEvent', () => {
  it('Ranger attack hit → bow.hit; crit → bow.crit; miss → weapon.miss', () => {
    expect(sounds(ev({ name: 'Ranger' }))).toEqual(['bow.hit']);
    expect(sounds(ev({ name: 'Ranger', crit: true }))).toEqual(['bow.crit']);
    expect(sounds(ev({ name: 'Ranger', hit: false, targets: [] }))).toEqual(['weapon.miss']);
  });

  it('Monk ability crit → fists.crit', () => {
    expect(sounds(ev({ name: 'Monk', kind: 'ability', cast: 'damage', crit: true, abilityName: 'One-Two Punch' }))).toEqual(['fists.crit']);
  });

  it('Wizard Fireball on four heroes → exactly one fire.hit', () => {
    const cues = soundsForEvent(ev({
      name: 'Wizard', kind: 'ability', cast: 'damage', abilityName: 'Fireball',
      targets: [target('p1:0', -2), target('p1:1', -3), target('p1:2', -1), target('p1:3', -4)]
    }), 'normal');
    expect(cues).toEqual([{ sound: 'fire.hit', delayMs: 300 }]);
  });

  it('Wizard basic attack → weapon.hit', () => {
    expect(soundsForEvent(ev({ name: 'Wizard' }), 'normal')).toEqual([{ sound: 'weapon.hit', delayMs: 160 }]);
  });

  it('Silencer ability → emp.hit; miss → spell.miss', () => {
    expect(sounds(ev({ name: 'Silencer', kind: 'ability', cast: 'damage', abilityName: 'Silence' }))).toEqual(['emp.hit']);
    expect(sounds(ev({ name: 'Silencer', kind: 'ability', cast: 'damage', abilityName: 'Silence', hit: false, targets: [] }))).toEqual(['spell.miss']);
  });

  it('Druid Wildshape (cast heal) → heal', () => {
    expect(sounds(ev({ name: 'Druid', kind: 'ability', cast: 'heal', abilityName: 'Wildshape', targets: [target('p0:0', 3)] }))).toEqual(['heal']);
  });

  it('Paladin Divine Smite hit with a heal target → weapon.hit then heal 150 ms later', () => {
    const cues = soundsForEvent(ev({
      name: 'Paladin', kind: 'ability', cast: 'damage', abilityName: 'Divine Smite',
      targets: [target('p1:0', -2), target('p0:1', 2)]
    }), 'normal');
    expect(cues).toEqual([{ sound: 'weapon.hit', delayMs: 300 }, { sound: 'heal', delayMs: 450 }]);
  });

  it('Engineer Call Turret → summon; tick with turretKeys and poison → laserPistol.hit and synth.tick', () => {
    expect(sounds(ev({ name: 'Engineer', kind: 'ability', cast: 'summon', abilityName: 'Call Turret', targets: [] }))).toEqual(['summon']);
    const tick = ev({
      kind: 'tick', actor: null, targetName: null, turretKeys: ['p1:0'],
      targets: [target('p1:0', -2), target('p1:1', -1, { poisoned: true })]
    });
    expect(soundsForEvent(tick, 'normal')).toEqual([
      { sound: 'laserPistol.hit', delayMs: 80 },
      { sound: 'synth.tick', delayMs: 80 }
    ]);
    // Turret only: no synth tick.
    expect(sounds(ev({ kind: 'tick', actor: null, turretKeys: ['p1:0'], targets: [target('p1:0', -2)] }))).toEqual(['laserPistol.hit']);
    // Old server, poison only: today's tick.
    expect(sounds(ev({ kind: 'tick', actor: null, targets: [target('p1:1', -1)] }))).toEqual(['synth.tick']);
  });

  it('tick with a +HP target → heal; poison damage plus a heal → synth.tick and heal', () => {
    expect(soundsForEvent(ev({ kind: 'tick', actor: null, targets: [target('p0:1', 2), target('p0:2', 1)] }), 'normal'))
      .toEqual([{ sound: 'heal', delayMs: 80 }]);
    expect(sounds(ev({ kind: 'tick', actor: null, targets: [target('p1:1', -1, { poisoned: true }), target('p0:1', 2)] })))
      .toEqual(['synth.tick', 'heal']);
  });

  it('a trigger with no map entry is skipped without throwing', () => {
    expect(sounds(ev({ name: 'Ranger', triggers: [{ key: 'p1:0', name: 'Paladin', special: 'Shield of Faith' }] }))).toEqual(['bow.hit']);
    expect(sounds(ev({ name: 'Ranger', triggers: [{ key: 'p1:0', name: 'Nobody', special: 'Nothing' }] }))).toEqual(['bow.hit']);
  });

  it('Declare War commanding Ranger then Monk → bow.hit at 300 ms, fists.hit at 650 ms', () => {
    const cues = soundsForEvent(ev({
      name: 'Diplomat', kind: 'ability', cast: 'generic', abilityName: 'Declare War',
      commands: [
        { key: 'p0:0', name: 'Ranger', kind: 'attack', hit: true, crit: false },
        { key: 'p0:2', name: 'Monk', kind: 'attack', hit: true, crit: false }
      ]
    }), 'normal');
    expect(cues).toEqual([{ sound: 'bow.hit', delayMs: 300 }, { sound: 'fists.hit', delayMs: 650 }]);
  });

  it('Chrono Shift commanding Wizard → fire.hit', () => {
    expect(sounds(ev({
      name: 'Timekeeper', kind: 'ability', cast: 'generic', abilityName: 'Chrono Shift',
      commands: [{ key: 'p0:1', name: 'Wizard', kind: 'ability', abilityName: 'Fireball', hit: true, crit: false }]
    }))).toEqual(['fire.hit']);
  });

  it('Bomber trigger Explosion adds explosion.hit 400 ms after', () => {
    const cues = soundsForEvent(ev({
      name: 'Ranger', targets: [target('p1:0', -9, { died: true })],
      triggers: [{ key: 'p1:0', name: 'Bomber', special: 'Explosion' }]
    }), 'normal');
    expect(cues).toEqual([
      { sound: 'bow.hit', delayMs: 160 },
      { sound: 'explosion.hit', delayMs: 560 },
      { sound: 'synth.death', delayMs: 410 }
    ]);
  });

  it('a target that died adds one synth.death 250 ms after impact (fast factor when off)', () => {
    const died = [target('p1:0', -9, { died: true, hpAfter: 0 }), target('p1:1', -9, { died: true, hpAfter: 0 })];
    expect(soundsForEvent(ev({ name: 'Ranger', targets: died }), 'normal'))
      .toEqual([{ sound: 'bow.hit', delayMs: 160 }, { sound: 'synth.death', delayMs: 410 }]);
    expect(soundsForEvent(ev({ name: 'Ranger', targets: died }), 'off'))
      .toEqual([{ sound: 'bow.hit', delayMs: 96 }, { sound: 'synth.death', delayMs: 246 }]);
    expect(soundsForEvent(ev({ kind: 'ability', cast: 'damage', name: 'Wizard', targets: died }), 'normal'))
      .toContainEqual({ sound: 'synth.death', delayMs: 550 });
    expect(soundsForEvent(ev({ kind: 'tick', actor: null, targets: died }), 'normal'))
      .toContainEqual({ sound: 'synth.death', delayMs: 330 });
    expect(sounds(ev({ name: 'Ranger' }))).not.toContain('synth.death');
  });

  it('Angel Resurrect plays buff.self; Sorcerer Twin Spell trigger plays nothing (the recast has its own event)', () => {
    expect(sounds(ev({ name: 'Ranger', triggers: [{ key: 'p1:0', name: 'Angel', special: 'Resurrect' }] }))).toEqual(['bow.hit', 'buff.self']);
    expect(sounds(ev({
      name: 'Sorcerer', kind: 'ability', cast: 'damage', abilityName: 'Chromatic Orb',
      triggers: [{ key: 'p0:0', name: 'Sorcerer', special: 'Twin Spell' }]
    }))).toEqual(['ice.hit']);
  });

  it('event with no actor.name, no abilityName, no commands → weapon.hit, no throw', () => {
    expect(sounds(ev({}))).toEqual(['weapon.hit']);
    expect(sounds(ev({ kind: 'ability', cast: 'damage' }))).toEqual(['weapon.hit']);
    expect(sounds(ev({ actor: null }))).toEqual(['weapon.hit']);
    expect(sounds(ev({ kind: 'ability', cast: 'buff' }))).toEqual(['buff.other']);
    expect(sounds(ev({ name: 'Nobody Knows', kind: 'ability', cast: 'damage', hit: false }))).toEqual(['weapon.miss']);
  });

  it('speed off uses the fast factor (attack cue at 96 ms)', () => {
    expect(soundsForEvent(ev({ name: 'Ranger' }), 'off')).toEqual([{ sound: 'bow.hit', delayMs: 96 }]);
    expect(soundsForEvent(ev({ name: 'Ranger' }), 'fast')).toEqual([{ sound: 'bow.hit', delayMs: 96 }]);
  });

  it('Beast Tamer: Call Beast → summon; command attack → weapon', () => {
    expect(sounds(ev({ name: 'Beast Tamer', kind: 'ability', cast: 'summon', abilityName: 'Call Beast / Command Attack', targets: [] }))).toEqual(['summon']);
    expect(soundsForEvent(ev({ name: 'Beast Tamer', kind: 'ability', cast: 'damage', variant: 'beast_attack', abilityName: 'Call Beast / Command Attack' }), 'normal'))
      .toEqual([{ sound: 'weapon.hit', delayMs: 200 }]);
    expect(soundsForEvent(ev({ name: 'Beast Tamer', kind: 'ability', cast: 'damage', variant: 'beast_attack' }), 'fast'))
      .toEqual([{ sound: 'weapon.hit', delayMs: 120 }]);
  });

  it('Shaman Elemental Strike (server cast summon) → earth.hit', () => {
    expect(sounds(ev({ name: 'Shaman', kind: 'ability', cast: 'summon', abilityName: 'Elemental Strike' }))).toEqual(['earth.hit']);
  });

  it('Berserker Bloodbath → buff.self; Blood Hunter Sanguine Renewal → weapon.hit then heal', () => {
    expect(sounds(ev({ name: 'Berserker', kind: 'ability', cast: 'buff', abilityName: 'Bloodbath', targets: [] }))).toEqual(['buff.self']);
    expect(sounds(ev({
      name: 'Blood Hunter', kind: 'ability', cast: 'damage', abilityName: 'Sanguine Renewal',
      targets: [target('p1:0', -3), target('p0:0', 3)]
    }))).toEqual(['weapon.hit', 'heal']);
  });

  it('every enabled hero in backend/heros.json has an entry or is meant to default', () => {
    const spec: Record<string, { attack: string; ability: string }> = {
      'Arcane Archer': { attack: 'bow', ability: 'bow' }, Ranger: { attack: 'bow', ability: 'bow' },
      Monk: { attack: 'fists', ability: 'fists' }, Brawler: { attack: 'fists', ability: 'fists' },
      Mech: { attack: 'weapon', ability: 'fists' }, Engineer: { attack: 'weapon', ability: 'summon' },
      Wizard: { attack: 'weapon', ability: 'fire' }, Pyromancer: { attack: 'weapon', ability: 'fire' },
      'Dragon Rider': { attack: 'weapon', ability: 'fire' }, Elementalist: { attack: 'weapon', ability: 'lightning' },
      Shaman: { attack: 'weapon', ability: 'earth' }, Shroomguard: { attack: 'weapon', ability: 'plant' },
      'Plague Spreader': { attack: 'weapon', ability: 'plant' }, Sorcerer: { attack: 'weapon', ability: 'ice' },
      Silencer: { attack: 'weapon', ability: 'emp' }, Bomber: { attack: 'explosion', ability: 'explosion' },
      Cleric: { attack: 'weapon', ability: 'holy' }, Warlock: { attack: 'weapon', ability: 'dark' },
      Reaper: { attack: 'weapon', ability: 'dark' }, Angel: { attack: 'weapon', ability: 'arcane' },
      Druid: { attack: 'weapon', ability: 'heal' }, Medic: { attack: 'weapon', ability: 'summon' },
      Diplomat: { attack: 'weapon', ability: 'command' }, Timekeeper: { attack: 'weapon', ability: 'command' },
      'Beast Tamer': { attack: 'weapon', ability: 'summon' }, Berserker: { attack: 'weapon', ability: 'buff.self' }
    };
    for (const [name, want] of Object.entries(spec)) {
      expect(HERO_SOUNDS[name], name).toMatchObject(want);
    }
    expect(HERO_SOUNDS['Blood Hunter'].abilities).toEqual({ 'Crimson Rite': 'weapon', 'Sanguine Renewal': 'weapon' });
    expect(HERO_SOUNDS.Bomber.triggers).toEqual({ Explosion: 'explosion.hit' });
    expect(HERO_SOUNDS.Angel.triggers).toEqual({ Resurrect: 'buff.self' });
    expect(HERO_SOUNDS.Sorcerer.triggers).toBeUndefined();

    const weaponOnly = ['Paladin', 'Champion', 'Barbarian', 'Cavalier', 'Piercer', 'Fighter', 'Warden', 'Swordsman',
      'Assassin', 'Ninja', 'Dual Defender', 'Hoarder', 'Ace'];
    const known = new Set([...Object.keys(spec), 'Blood Hunter', ...weaponOnly]);
    const enabled = (heroes as Array<{ name: string; disabled?: boolean }>).filter(h => !h.disabled).map(h => h.name);
    const unaccounted = enabled.filter(n => !known.has(n));
    expect(unaccounted).toEqual([]);
    // Weapon-only heroes need no entry: an unlisted hero plays weapon for both.
    for (const name of weaponOnly) {
      const entry = HERO_SOUNDS[name] ?? { attack: 'weapon', ability: 'weapon' };
      expect(entry, name).toMatchObject({ attack: 'weapon', ability: 'weapon' });
    }
  });
});

describe('soundForSpecial', () => {
  it("soundForSpecial('Mech') → explosion.hit; ('Diplomat') → heal", () => {
    expect(soundForSpecial('Mech')).toBe('explosion.hit');
    expect(soundForSpecial('Diplomat')).toBe('heal');
    expect(soundForSpecial('Ranger')).toBe('buff.other');
  });
});
