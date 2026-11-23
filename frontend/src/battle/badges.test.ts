import { describe, expect, it } from 'vitest';
import type { Hero, PendingTaunt, StatusEffects } from '../types';
import { getBadges, type Badge, type BadgeKey } from './badges';

function hero(name: string, effects: Partial<StatusEffects> = {}, extra: Partial<Hero> = {}): Hero {
  return {
    name,
    HP: 20,
    Defense: 10,
    Accuracy: '+2',
    BasicAttack: '1D6',
    Ability: [],
    Special: [],
    currentHP: 20,
    statusEffects: { poison: 0, taunt: null, silenced: false, disableAttack: false, untargetable: false, ...effects },
    ...extra,
  } as Hero;
}

const keys = (badges: Badge[]): BadgeKey[] => badges.map(b => b.key);
const only = (badges: Badge[], key: BadgeKey): Badge => {
  const found = badges.find(b => b.key === key);
  if (!found) throw new Error(`no ${key} badge in [${keys(badges).join(', ')}]`);
  return found;
};

describe('getBadges', () => {
  it('a fallen hero has no badges', () => {
    const fallen = hero('Fighter', { poison: 3, taunt: { target: 'Warden', duration: 1 } }, { currentHP: 0 });
    expect(getBadges(fallen, { enemies: [hero('Warden')] })).toEqual([]);
  });

  it('Turrets 2/2 with count 2, golem symbol, buff rim', () => {
    const b = only(getBadges(hero('Engineer', { turret_count: 2 })), 'turrets');
    expect(b).toMatchObject({ symbol: 'i-golem', rim: 'buff', count: '2', short: 'Turrets 2/2' });
    expect(b.full).toBe(
      '2 of 2 Turrets. At the end of Engineer\'s turn each deals 1D4 damage to a random enemy. One is given up to block damage.',
    );
    expect(b.full).toContain('each deals 1D4 damage');
  });

  it('Totems: one head per Totem, no count', () => {
    [1, 2, 3].forEach(n => {
      const b = only(getBadges(hero('Shaman', { totem_count: n })), 'totems');
      expect(b.symbol).toBe(`i-totem${n}`);
      expect(b.rim).toBe('buff');
      expect(b.count).toBeUndefined();
      expect(b.short).toBe(`Totems ${n}/3`);
      expect(b.full).toBe(`${n} of 3 Totems. Elemental Strike adds a Totem, then deals 1D4 damage per Totem.`);
    });
  });

  it('Med Bots full text uses the bot count', () => {
    const b = only(getBadges(hero('Medic', { med_bot_count: 2 })), 'medBots');
    expect(b).toMatchObject({ symbol: 'i-bot', rim: 'buff', count: '2', short: 'Med Bots 2/3' });
    expect(b.full).toBe('2 of 3 Med Bots. At the end of Medic\'s turn, the lowest-HP ally heals for 2D4.');
  });

  it('Poison 3: poison rim, count 3, "Takes 3 damage at the end of its turn."', () => {
    const b = only(getBadges(hero('Fighter', { poison: 3 })), 'poison');
    expect(b).toMatchObject({
      symbol: 'i-poison', rim: 'poison', count: '3', short: 'Poison 3', full: 'Takes 3 damage at the end of its turn.',
    });
  });

  it('Taunted: Warden, filled from statusEffects.taunt.target', () => {
    const b = only(
      getBadges(hero('Fighter', { taunt: { target: 'Warden', duration: 1 } }), { enemies: [hero('Warden')] }),
      'taunted',
    );
    expect(b).toMatchObject({
      symbol: 'i-taunt', rim: 'debuff', short: 'Taunted: Warden',
      full: 'Must Focus Warden with attacks and abilities on its next turn.',
    });
    expect(b.dashed).toBeFalsy();
    expect(b.count).toBeUndefined();
  });

  it('no Taunted badge when the taunter is dead', () => {
    const fighter = hero('Fighter', { taunt: { target: 'Warden', duration: 1 } });
    // A living Warden on the hero's own side (mirror match) does not count: the taunter is an enemy
    const ctx = { enemies: [hero('Warden', {}, { currentHP: 0 })], allies: [hero('Warden')] };
    expect(keys(getBadges(fighter, ctx))).not.toContain('taunted');
  });

  it('Taunt coming from pendingTaunts by id, dashed, names the Paladin', () => {
    const pending: PendingTaunt[] = [
      { targetId: '0-1', targetPlayerIndex: 0, tauntTarget: 'Paladin', appliedById: '1-0' },
    ];
    const mine = hero('Fighter', {}, { id: '0-1' });
    const b = only(getBadges(mine, { pendingTaunts: pending }), 'tauntComing');
    expect(b).toMatchObject({
      symbol: 'i-taunt', rim: 'debuff', dashed: true, short: 'Taunt coming',
      full: 'Will be taunted by Paladin at the end of this turn.',
    });
    // Same name on the other team (mirror match): matched by id, so no badge there
    const theirs = hero('Fighter', {}, { id: '1-1' });
    expect(keys(getBadges(theirs, { pendingTaunts: pending }))).not.toContain('tauntComing');
  });

  it('none without pendingTaunts (old server)', () => {
    expect(keys(getBadges(hero('Fighter', {}, { id: '0-1' }), {}))).not.toContain('tauntComing');
  });

  it('Silenced 2 says "2 more turns"', () => {
    const b = only(getBadges(hero('Fighter', { silenced: { active: true, duration: 2 } })), 'silenced');
    expect(b).toMatchObject({
      symbol: 'i-silence', rim: 'debuff', count: '2', short: 'Silenced 2', full: 'Can\'t use abilities for 2 more turns.',
    });
  });

  it('Stunned 1 says "1 more turn"', () => {
    const b = only(getBadges(hero('Fighter', { disableAttack: { active: true, duration: 1 } })), 'stunned');
    expect(b).toMatchObject({
      symbol: 'i-stun', rim: 'debuff', count: '1', short: 'Stunned 1', full: 'Can\'t make basic attacks for 1 more turn.',
    });
  });

  it('Bribed has no turn count', () => {
    const bribe = { owner: 'Hoarder', duration: 1, duration_unit: 'caster_turn', source: 'Hoarder' };
    const b = only(getBadges(hero('Fighter', { cannotTargetWithAbility: bribe })), 'bribed');
    expect(b).toMatchObject({
      symbol: 'i-bribe', rim: 'debuff', short: 'Bribed',
      full: 'Can\'t use its ability on Hoarder until Hoarder\'s next turn.',
    });
    expect(b.count).toBeUndefined();
  });

  it('Wind Wall +2 shows the total', () => {
    const b = only(getBadges(hero('Elementalist', { windWallAC: { bonus: 2 } })), 'windWall');
    expect(b).toMatchObject({
      symbol: 'i-wind', rim: 'buff', count: '+2', short: 'Wind Wall +2',
      full: '+2 Defense until Elementalist\'s next turn.',
    });
  });

  it('Frenzy and Desperate Blows follow conditionalEffects', () => {
    const on = getBadges(hero('Berserker', {}, { conditionalEffects: { Frenzy: true } }));
    expect(only(on, 'frenzy')).toMatchObject({
      symbol: 'i-flame', rim: 'buff', short: 'Frenzy', full: 'Below 10 HP: Berserker can attack twice per turn.',
    });
    expect(keys(getBadges(hero('Berserker', {}, { conditionalEffects: { Frenzy: false } })))).not.toContain('frenzy');

    const blows = getBadges(hero('Fighter', {}, { conditionalEffects: { 'Desperate Blows': true } }));
    expect(only(blows, 'desperateBlows')).toMatchObject({
      symbol: 'i-blows', rim: 'buff', short: 'Desperate Blows', full: 'Below 10 HP: Fighter\'s attacks have advantage.',
    });
    expect(keys(getBadges(hero('Fighter', {}, { conditionalEffects: { 'Desperate Blows': false } }))))
      .not.toContain('desperateBlows');
  });

  it('Arcane mark only while the Archer is alive', () => {
    const fighter = hero('Fighter');
    const archer = (hp: number) => hero('Arcane Archer', {}, { currentHP: hp, damagedEnemies: ['Fighter'] });
    expect(only(getBadges(fighter, { enemies: [archer(14)] }), 'arcaneMark')).toMatchObject({
      symbol: 'i-mark', rim: 'debuff', short: 'Arcane mark', full: 'Arcane Archer deals +1D4 to this hero.',
    });
    expect(keys(getBadges(fighter, { enemies: [archer(0)] }))).not.toContain('arcaneMark');
    // An Archer on the hero's own side never marks it
    expect(keys(getBadges(fighter, { allies: [archer(14)] }))).not.toContain('arcaneMark');
  });

  it('returns when the Archer is revived', () => {
    const fighter = hero('Fighter');
    const archer = hero('Arcane Archer', {}, { currentHP: 0, damagedEnemies: ['Fighter'] });
    expect(keys(getBadges(fighter, { enemies: [archer] }))).not.toContain('arcaneMark');
    archer.currentHP = 7; // Angel revived it; damagedEnemies is kept
    expect(keys(getBadges(fighter, { enemies: [archer] }))).toContain('arcaneMark');
  });

  it('Arcane Shield text says "more than 5"', () => {
    const b = only(getBadges(hero('Wizard', { arcaneShieldAvailable: true })), 'arcaneShield');
    expect(b).toMatchObject({
      symbol: 'i-ashield', rim: 'buff', short: 'Arcane Shield',
      full: 'The first hit of more than 5 damage is reduced to 0.',
    });
    expect(keys(getBadges(hero('Wizard', { arcaneShieldAvailable: false, arcaneShieldUsed: true }))))
      .not.toContain('arcaneShield');
  });

  it('a freshly picked Wizard shows no shield badge', () => {
    const special = [{ name: 'Arcane Shield', description: '', effects: [] }];
    const picked = hero('Wizard', {}, { Special: special });
    expect(keys(getBadges(picked))).not.toContain('arcaneShield');
  });

  it('no Inspired badge even if statusEffects.inspiration is set', () => {
    expect(getBadges(hero('Fighter', { inspiration: 2 } as unknown as Partial<StatusEffects>))).toEqual([]);
  });

  it('the other badges: Beast, Bloodbath, Hidden, Guiding Bolt, Ride Down, Health Link, Defense down', () => {
    const b = getBadges(hero('Fighter', {
      beast_active: true,
      damageStacks: 2,
      untargetable: true,
      grantAdvantage: { duration: 1, duration_unit: 'attack', source: 'Cleric' },
      rideDownDebuff: { source: 'Cavalier', maxHP: 20 },
      health_link: { source: 'Angel', sourceId: '1-2', duration: 999 },
      statModifiers: { Defense: -1 },
      statModifierAbilities: { Defense_Ranger: 'Piercing Shot' },
    }));
    expect(only(b, 'beast')).toMatchObject({
      symbol: 'i-paw', rim: 'buff', short: 'Beast out', full: 'The Beast is out. Beast Tamer\'s attacks have advantage.',
    });
    expect(only(b, 'bloodbath')).toMatchObject({
      symbol: 'i-blood', rim: 'buff', count: '+2', short: 'Bloodbath +2', full: '+2 damage to attacks (max 2).',
    });
    expect(only(b, 'hidden')).toMatchObject({
      symbol: 'i-hidden', rim: 'buff', short: 'Hidden', full: 'Can\'t be Focused until Ninja\'s next turn.',
    });
    expect(only(b, 'guidingBolt')).toMatchObject({
      symbol: 'i-exposed', rim: 'debuff', short: 'Guiding Bolt',
      full: 'The next attack or ability roll against this hero has advantage.',
    });
    expect(only(b, 'rideDown')).toMatchObject({
      symbol: 'i-shoe', rim: 'debuff', short: 'Ride Down', full: 'Attacks against this hero have advantage.',
    });
    expect(only(b, 'healthLink')).toMatchObject({
      symbol: 'i-link', rim: 'debuff', short: 'Health Link',
      full: 'The next time Angel takes damage, this hero takes it too.',
    });
    expect(only(b, 'defenseDown')).toMatchObject({
      symbol: 'i-defdown', rim: 'debuff', count: '-1', short: 'Defense -1',
      full: 'Piercing Shot: -1 Defense until Ranger\'s next turn.',
    });
    expect(keys(b)).toEqual([
      'beast', 'bloodbath', 'hidden', 'guidingBolt', 'rideDown', 'healthLink', 'defenseDown',
    ]);
  });

  it('a Defense bonus from an ally is not Defense down', () => {
    expect(keys(getBadges(hero('Fighter', { statModifiers: { Defense: 1 } })))).not.toContain('defenseDown');
  });

  it('lists badges in the spec table order: buffs, then poison, then debuffs', () => {
    const b = getBadges(
      hero('Fighter', {
        turret_count: 1,
        poison: 1,
        silenced: { active: true, duration: 1 },
        taunt: { target: 'Warden', duration: 1 },
        windWallAC: { bonus: 1 },
      }, { id: '0-0' }),
      {
        enemies: [hero('Warden'), hero('Arcane Archer', {}, { damagedEnemies: ['Fighter'] })],
        pendingTaunts: [{ targetId: '0-0', targetPlayerIndex: 0, tauntTarget: 'Paladin', appliedById: '1-1' }],
      },
    );
    expect(keys(b)).toEqual(['turrets', 'windWall', 'poison', 'taunted', 'tauntComing', 'silenced', 'arcaneMark']);
  });

  it('getBadges(hero) with no context does not throw and omits Taunt coming and Arcane mark', () => {
    const h = hero('Fighter', { poison: 2, taunt: { target: 'Warden', duration: 1 } }, { id: '0-0' });
    let badges: Badge[] = [];
    expect(() => { badges = getBadges(h); }).not.toThrow();
    expect(keys(badges)).toEqual(['poison', 'taunted']);
    expect(() => getBadges(hero('Fighter', {}, { statusEffects: undefined }))).not.toThrow();
    expect(getBadges(hero('Fighter', {}, { statusEffects: undefined }))).toEqual([]);
  });
});
