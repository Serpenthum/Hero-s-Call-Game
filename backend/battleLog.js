// The battle log, as data. Every action becomes one or more structured entries that the client draws;
// the server never writes log sentences.
//
// How an entry is built: the state of every hero is copied before the action and compared with the state
// after it. The result object the engine returns supplies what a comparison cannot (dice, who rolled,
// which special reacted); the comparison supplies everything else (HP actually lost or gained, statuses,
// summons, deaths), so a side effect the engine forgot to report still reaches the log.
//
// Entry: { id, turn: { n, side, hero }, actor, action, kind, when, note, rows, reactions, falls, revives }
//   actor / target: { name, side, slot }          side = player index, slot = position in the team
//   kind: 'attack' | 'ability' | 'special' | 'effect'      when: 'start' | 'end' | null
//   row: { target, roll, outcome, amount, dice, parts, chips, killed }
//     outcome: 'hit' | 'crit' | 'miss' | 'blocked' | 'deflected' | 'heal' | 'effect'
//     roll: { d20, mod, total, vs, adv, rolls, why, auto }    adv = 'advantage' | 'disadvantage' | null
//     amount: HP change shown for the row (negative = damage)   parts: [{ label, value }] explains a bonus
//     chips: [{ text, tone }]    tone: 'poison' | 'bad' | 'good' | 'buff' | 'defense'
//   reaction: { actor, action, text, rows }   a special that answered the action

const SUMMONS = {
  totem_count: { label: 'Totems', max: 3 },
  turret_count: { label: 'Turrets', max: 2 },
  med_bot_count: { label: 'Med Bots', max: 3 }
};
const LOG_TAIL = 40; // entries sent with every game state; clients keep what they have already received

const key = (side, slot) => `${side}:${slot}`;
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function snapshot(game) {
  if (!game || !Array.isArray(game.players)) return null;
  const heroes = {};
  game.players.forEach((player, side) => {
    (player.team || []).forEach((hero, slot) => {
      heroes[key(side, slot)] = {
        name: hero.name, side, slot,
        hp: hero.currentHP,
        maxHp: hero.HP,
        def: hero.modifiedDefense !== undefined ? hero.modifiedDefense : (hero.Defense !== undefined ? hero.Defense : hero.AC),
        se: clone(hero.statusEffects) || {},
        scaling: clone(hero.scalingBuffs) || {},
        permanent: clone(hero.permanentBuffs) || {},
        conditional: clone(hero.conditionalEffects) || {},
        damageBuffs: (hero.passiveBuffs || []).filter(b => b.stat === 'damage').map(b => ({ value: b.value, source: b.sourceName }))
      };
    });
  });
  return {
    heroes,
    twinSpell: game.players.map(p => !!p.twinSpellActive),
    length: (game.log || []).length
  };
}

const ref = h => ({ name: h.name, side: h.side, slot: h.slot });

// Tracks how much of each hero's HP change is still unexplained while an action is turned into entries
class Ledger {
  constructor(before, after) {
    this.before = before.heroes;
    this.after = after.heroes;
    this.left = {};
    Object.keys(this.after).forEach(k => {
      if (this.before[k]) this.left[k] = this.after[k].hp - this.before[k].hp;
    });
    this.claimed = new Set();
  }

  // The hero a result names. Both teams can field the same hero, so prefer the side asked for, then the
  // hero whose HP moved the way the result says, then one no earlier row has used.
  find(name, { side = null, sign = 0, fresh = false } = {}) {
    const candidates = Object.keys(this.after).filter(k => this.after[k].name === name);
    if (candidates.length === 0) return null;
    const score = k => {
      let s = 0;
      if (side !== null && this.after[k].side === side) s += 4;
      if (sign && Math.sign(this.left[k]) === sign) s += 2;
      if (fresh && !this.claimed.has(k)) s += 1;
      return s;
    };
    return candidates.sort((a, b) => score(b) - score(a))[0];
  }

  // Takes up to `amount` (signed) out of what is left for a hero and returns what was really there
  take(k, amount) {
    const left = this.left[k] || 0;
    if (!amount || Math.sign(left) !== Math.sign(amount)) return 0;
    const taken = Math.abs(left) < Math.abs(amount) ? left : amount;
    this.left[k] = left - taken;
    return taken;
  }

  takeAll(k) {
    const left = this.left[k] || 0;
    this.left[k] = 0;
    return left;
  }

  open() {
    return Object.keys(this.left).filter(k => this.left[k] !== 0);
  }
}

function rollOf(piece, vs) {
  if (!piece || !piece.attackRoll || !piece.attackTotal) return null;
  const info = piece.advantageInfo || null;
  const roll = {
    d20: piece.attackRoll,
    mod: piece.attackTotal - piece.attackRoll,
    total: piece.attackTotal,
    vs: vs === undefined ? null : vs,
    adv: info ? info.type : null,
    rolls: info ? [info.roll1, info.roll2] : null,
    why: info && info.why ? info.why : null,
    auto: null
  };
  if (piece.isTimekeeperCommand) roll.auto = 'Auto-hit';
  return roll;
}

// New statuses on one hero, as chips
function statusChips(b, a) {
  const chips = [];
  const was = b.se || {};
  const now = a.se || {};
  const poisonGain = (now.poison || 0) - (was.poison || 0);
  if (poisonGain > 0) chips.push({ text: `Poison ${now.poison}`, tone: 'poison' });
  if (!was.silenced && now.silenced) chips.push({ text: 'Silenced', tone: 'bad' });
  if (now.taunt && (!was.taunt || was.taunt.target !== now.taunt.target)) chips.push({ text: `Taunted by ${now.taunt.target}`, tone: 'bad' });
  if ((!was.disableAttack || !was.disableAttack.active) && now.disableAttack && now.disableAttack.active) chips.push({ text: 'Stunned', tone: 'bad' });
  if ((!was.stun || !was.stun.active) && now.stun && now.stun.active) chips.push({ text: 'Stunned', tone: 'bad' });
  const defWas = (was.statModifiers && was.statModifiers.Defense) || 0;
  const defNow = (now.statModifiers && now.statModifiers.Defense) || 0;
  if (defNow !== defWas && defNow - defWas !== 0) {
    const change = defNow - defWas;
    chips.push({ text: `${change > 0 ? '+' : '−'}${Math.abs(change)} Def`, tone: change > 0 ? 'defense' : 'bad' });
  }
  if (!was.grantAdvantage && now.grantAdvantage) chips.push({ text: 'Marked', tone: 'bad' });
  if (!was.rideDownDebuff && now.rideDownDebuff) chips.push({ text: 'Ridden Down', tone: 'bad' });
  if (!was.health_link && now.health_link) chips.push({ text: 'Linked', tone: 'bad' });
  if (!was.cannotTargetWithAbility && now.cannotTargetWithAbility) chips.push({ text: 'Bribed', tone: 'bad' });
  if ((now.damageStacks || 0) > (was.damageStacks || 0)) chips.push({ text: `Stack ${now.damageStacks}/2`, tone: 'buff' });
  return chips;
}

// What changed on the acting hero that reads as a note on the entry ("Totems 2/3")
function summonNote(b, a) {
  const notes = [];
  Object.keys(SUMMONS).forEach(field => {
    const was = (b.se && b.se[field]) || 0;
    const now = (a.se && a.se[field]) || 0;
    if (now > was) notes.push(`${SUMMONS[field].label} ${now}/${SUMMONS[field].max}`);
  });
  if (!(b.se && b.se.beast_active) && a.se && a.se.beast_active) notes.push('Beast summoned');
  return notes;
}

// Why a basic attack or ability did more than its dice show
const BONUS_LABEL = {
  'Piercing Strike': 'high Defense', 'Far Shot': 'full HP', 'Stacked Deck': 'crit', 'Iron Will': 'last one standing',
  'Surprise Attack': 'surprise', 'Revenge': 'revenge'
};

function bonusParts(actorBefore, dice, damage, action) {
  if (!Array.isArray(dice) || dice.length === 0 || !damage) return null;
  const rolled = dice.reduce((sum, d) => sum + d, 0);
  let extra = damage - rolled;
  if (extra <= 0) return null;
  const parts = [];
  const stacks = (actorBefore.se && actorBefore.se.damageStacks) || 0;
  if (stacks > 0 && extra > 0) { const v = Math.min(stacks, extra); parts.push({ label: 'Bloodbath', value: v }); extra -= v; }
  (actorBefore.damageBuffs || []).forEach(buff => {
    if (extra <= 0 || buff.value <= 0) return;
    const v = Math.min(buff.value, extra);
    parts.push({ label: buff.source, value: v });
    extra -= v;
  });
  if (extra > 0) parts.push({ label: BONUS_LABEL[action] || (actorBefore.name === 'Arcane Archer' ? 'Arcane Arrows' : 'bonus'), value: extra });
  return parts;
}

function build(game, kind, before, result, meta) {
  const after = meta.after || snapshot(game);
  if (!before || !after) return [];
  const ledger = new Ledger(before, after);
  const B = ledger.before;
  const A = ledger.after;
  const actorKey = meta.actorKey;
  const actor = actorKey && A[actorKey] ? ref(A[actorKey]) : null;
  const foeSide = actor ? 1 - actor.side : null;
  const entries = [];
  const used = new Set(); // heroes whose status chips are already on a row

  const makeEntry = (who, action, entryKind, extra = {}) => ({
    actor: who, action, kind: entryKind, when: null, note: null, rows: [], reactions: [], falls: [], revives: [], ...extra
  });
  const makeRow = (k, fields = {}) => {
    ledger.claimed.add(k);
    return { target: ref(A[k]), roll: null, outcome: 'effect', amount: null, dice: null, parts: null, chips: [], killed: false, ...fields };
  };
  const attachChips = (row, k) => {
    if (used.has(k)) return;
    used.add(k);
    row.chips.push(...statusChips(B[k], A[k]));
  };
  // A damaging or healing row built from one piece of an engine result
  const rowFromPiece = (piece, k, actorBefore, action = null) => {
    const row = makeRow(k, { roll: rollOf(piece, B[k].def) });
    const reported = piece.damage || 0;
    const healed = piece.healing || 0;
    if (row.roll && actorBefore && actorBefore.name === 'Ace' && row.roll.d20 === 1 && piece.isCritical) {
      row.roll.auto = 'Ace Up The Sleeve';
      row.roll.total = null;
    }
    if (piece.hit === false) {
      row.outcome = 'miss';
    } else if (reported > 0) {
      const taken = ledger.take(k, -reported);
      row.outcome = piece.isCritical ? 'crit' : 'hit';
      row.amount = -reported;
      if (taken === 0 && B[k].hp > 0 && A[k].hp === B[k].hp) { row.outcome = 'blocked'; row.amount = 0; }
      const dice = Array.isArray(piece.damageRoll) ? piece.damageRoll : (piece.damageRoll && piece.damageRoll.rolls) || null;
      if (dice && dice.length && dice.every(d => typeof d === 'number')) {
        row.dice = dice;
        if (actorBefore) row.parts = bonusParts(actorBefore, dice, reported, action);
      }
      if (row.roll && piece.isCritical && row.roll.d20 < 20 && row.roll.d20 !== 1 && !row.roll.why) row.roll.why = 'Critical Strikes';
    } else if (healed > 0) {
      ledger.take(k, healed);
      row.outcome = 'heal';
      row.amount = healed;
    } else if (row.roll && piece.hit !== false && piece.damage === 0) {
      row.outcome = 'blocked';
      row.amount = 0;
    }
    attachChips(row, k);
    return row;
  };

  // ---- the action itself ----
  let main = null;
  const pieces = []; // named things the engine says also happened: { caster, special, target, damage, healing, raw }
  const addPieces = (list, when) => (list || []).forEach(p => { if (p && typeof p === 'object') pieces.push({ raw: p, when }); });

  if (kind === 'attack') {
    main = makeEntry(actor, 'Attack', 'attack');
    const k = ledger.find(result.target, { side: foeSide });
    if (k) {
      const piece = {
        attackRoll: result.attackRoll, attackTotal: result.attackTotal, advantageInfo: result.advantageInfo,
        hit: result.hit, isCritical: result.isCritical, damage: result.monkDeflected ? 0 : result.damage, damageRoll: result.damageRoll
      };
      const row = rowFromPiece(piece, k, B[actorKey]);
      if (result.monkDeflected) { row.outcome = 'deflected'; row.amount = 0; }
      main.rows.push(row);
    }
    entries.push(main);
    addPieces(result.statusEffects, null);
    addPieces(result.deathTriggerEffects, null);
  } else if (kind === 'ability') {
    const results = result.results || [];
    main = makeEntry(actor, meta.abilityName || result.ability || 'Ability', 'ability');
    entries.push(main);
    const damageDice = {};
    results.forEach(r => { if (r.type === 'damage' && r.target && r.damageRoll) damageDice[r.target] = r.damageRoll; });
    let commanded = null;
    results.forEach(r => {
      if (r.type === 'ability_comprehensive') {
        const own = !r.caster || !actor || r.caster === actor.name;
        const isHeal = !r.damage && r.healing > 0;
        const casterKey = own ? actorKey : ledger.find(r.caster, { side: actor ? actor.side : null });
        const casterSide = casterKey ? A[casterKey].side : (actor ? actor.side : null);
        // An attack (it rolled, hit or missed) lands on the other team; a heal or a self-buff on the caster's own
        const offensive = r.damage > 0 || !!r.attackRoll || r.hit === false;
        const casterName = own ? actor && actor.name : r.caster;
        const onOwnSide = !offensive && (isHeal || r.target === casterName);
        const k = typeof r.target === 'string'
          ? ledger.find(r.target, { side: onOwnSide ? casterSide : 1 - casterSide, sign: isHeal ? 1 : (r.damage ? -1 : 0), fresh: true })
          : null;
        let entry = main;
        if (!own && casterKey) {
          // An ally acting on this hero's order (Timekeeper's Chrono Shift)
          if (!commanded || commanded.actor.slot !== A[casterKey].slot) {
            commanded = makeEntry(ref(A[casterKey]), r.abilityName || 'Ability', 'ability', { note: `ordered by ${actor.name}` });
            entries.push(commanded);
            if (main.rows.length === 0) main.rows.push(makeRow(casterKey));
          }
          entry = commanded;
        }
        if (!k) return;
        const piece = { ...r, damageRoll: damageDice[r.target] };
        const row = rowFromPiece(piece, k, casterKey ? B[casterKey] : null, entry.action);
        entry.rows.push(row);
      } else if (r.type === 'attack' && r.attacker) {
        // An ally's basic attack on this hero's order (Diplomat's Declare War)
        const casterKey = ledger.find(r.attacker, { side: actor ? actor.side : null });
        const k = ledger.find(r.target, { side: foeSide, sign: -1 });
        if (!casterKey || !k) return;
        const entry = makeEntry(ref(A[casterKey]), 'Attack', 'attack', { note: `ordered by ${actor.name}` });
        entry.rows.push(rowFromPiece(r, k, B[casterKey]));
        entries.push(entry);
      } else if (r.type === 'special_comprehensive' && actor && r.caster === actor.name && r.attackRoll && r.target) {
        // The hero's own second mode (Beast Tamer's Command Attack)
        const k = ledger.find(r.target, { side: foeSide, sign: -1 });
        if (k) { main.action = r.specialName === 'Command Beast' ? 'Command Attack' : r.specialName; main.rows.push(rowFromPiece(r, k, B[actorKey])); }
      } else if (r.type === 'one_two_punch_activated') {
        main.note = 'attacks again';
      } else if (r.type === 'special_comprehensive' || r.type === 'counter_attack' || r.type === 'protective_gear') {
        pieces.push({ raw: r, when: null });
      }
    });
    addPieces(result.deathTriggerEffects, null);
    // "Call Beast / Command Attack" is one ability with two modes
    if (main.action.includes(' / ')) main.action = main.action.split(' / ')[main.rows.length ? 1 : 0];
  } else if (kind === 'special') {
    main = makeEntry(actor, meta.specialName || 'Special', 'special');
    entries.push(main);
    (result.results || []).forEach(r => {
      if ((r.type === 'damage' || r.type === 'miss') && r.target) {
        const k = ledger.find(r.target, { sign: r.type === 'damage' ? -1 : 0, fresh: true });
        if (k) main.rows.push(rowFromPiece({ ...r, hit: r.type === 'damage' && r.hit !== false }, k, null));
      }
    });
    addPieces(result.deathTriggerEffects, null);
  } else if (kind === 'turn') {
    addPieces(result.endTurnEffects, 'end');
    addPieces(result.turnStartEffects, 'start');
  }

  // ---- what answered it: specials the engine named ----
  const HIDDEN = new Set(['attack_roll', 'death', 'silence_expired', 'attack_disable_expired', 'taunt_expired', 'stat_modifier_expired', 'damage', 'heal', 'status_applied']);
  const AREA = new Set(['Aura of Death', 'Endless Burn', 'Poison Aura', 'Peace Treaty']);
  pieces.forEach(({ raw: p, when }) => {
    if (HIDDEN.has(p.type)) return;
    let casterName = p.caster || p.source || p.defender || null;
    let action = p.specialName || null;
    if (p.type === 'poison_damage') { casterName = null; action = 'Poison'; }
    if (p.type === 'turret_attack') action = 'Turret';
    if (p.type === 'healing_word' || p.type === 'druid_healing') action = 'Healing Word';
    if (p.type === 'emergency_heal') action = 'Emergency Heal';
    if (p.type === 'counter_attack') action = 'Shield Bash';
    if (p.type === 'protective_gear') action = 'Protective Gear';
    if (p.type === 'monk_deflect' || p.type === 'monk_deflect_counter') action = 'Deflect';
    if (!action) return;
    // These are read off the state below, so they show once, when they actually take effect
    if (action === 'Vanish' || action === 'Arcane Shield') return;
    const casterKey = casterName ? ledger.find(casterName, {}) : null;
    const reaction = { actor: casterKey ? ref(A[casterKey]) : null, action, text: null, rows: [] };

    const amount = p.damage ? -p.damage : (p.healing || p.healAmount || 0);
    const targetName = typeof p.target === 'string' ? p.target : (p.attacker && p.type === 'counter_attack' ? p.attacker : null);
    if (AREA.has(action)) {
      ledger.open().forEach(k => {
        const taken = ledger.takeAll(k);
        const row = makeRow(k, { outcome: taken > 0 ? 'heal' : 'hit', amount: taken });
        attachChips(row, k);
        reaction.rows.push(row);
      });
      if (action === 'Poison Aura') {
        Object.keys(A).forEach(k => {
          if (used.has(k)) return;
          const chips = statusChips(B[k], A[k]).filter(c => c.tone === 'poison');
          if (chips.length) { used.add(k); reaction.rows.push(makeRow(k, { chips })); }
        });
        reaction.text = 'everyone gains 1 Poison';
        reaction.rows = reaction.rows.filter(r => r.amount);
      }
    } else if (targetName && amount) {
      const k = ledger.find(targetName, { sign: Math.sign(amount), fresh: true });
      if (k) {
        const taken = ledger.take(k, amount) || 0;
        const row = makeRow(k, { outcome: amount > 0 ? 'heal' : 'hit', amount: taken || amount });
        attachChips(row, k);
        reaction.rows.push(row);
      }
    }
    if (action === 'Protective Gear') reaction.text = 'turret sacrificed, damage blocked';
    if (action === 'Arcane Shield') reaction.text = 'damage blocked';
    if (action === 'Vanish') reaction.text = "can't be Focused until its next turn";
    if (action === 'Twin Spell') reaction.text = 'may cast again';
    if (action === 'Shield of Faith') {
      const taunted = Object.keys(A).find(k => A[k].se.taunt && A[k].se.taunt.source === 'Shield of Faith' && !(B[k].se.taunt && B[k].se.taunt.source === 'Shield of Faith'));
      if (taunted) { const row = makeRow(taunted); attachChips(row, taunted); reaction.rows.push(row); }
    }
    if (when) {
      // Start- and end-of-turn effects stand on their own
      const entry = makeEntry(reaction.actor, action, action === 'Poison' ? 'effect' : 'special', { when, note: reaction.text, rows: reaction.rows });
      if (action === 'Poison' && reaction.rows[0]) { entry.actor = reaction.rows[0].target; }
      entries.push(entry);
    } else if (main) {
      main.reactions.push(reaction);
    } else {
      entries.push(makeEntry(reaction.actor, action, 'special', { note: reaction.text, rows: reaction.rows }));
    }
  });

  const host = main || entries[entries.length - 1] || null;
  const react = (heroKey, action, text, rows = []) => {
    const reaction = { actor: heroKey ? ref(A[heroKey]) : null, action, text, rows };
    const named = (host ? host.reactions : []).find(r => r.action === action && r.actor && heroKey && r.actor.slot === A[heroKey].slot && r.actor.side === A[heroKey].side);
    if (named) { if (!named.text) named.text = text; return named; }
    if (host) host.reactions.push(reaction);
    else entries.push(makeEntry(reaction.actor, action, 'special', { note: text, rows }));
    return reaction;
  };

  // ---- what the engine did not name: read it off the state ----
  Object.keys(A).forEach(k => {
    const b = B[k];
    const a = A[k];
    if (!b) return;
    // Health Link passes the Angel's damage on
    if (b.se.health_link && ledger.left[k] < 0 && !a.se.health_link) {
      const taken = ledger.takeAll(k);
      const angel = ledger.find(b.se.health_link.source, { side: 1 - a.side });
      react(angel, 'Health Link', null, [makeRow(k, { outcome: 'hit', amount: taken })]);
    }
    if (!b.se.arcaneShieldUsed && a.se.arcaneShieldUsed) react(k, 'Arcane Shield', 'damage blocked');
    if (!b.se.untargetable && a.se.untargetable) react(k, 'Vanish', "can't be Focused until its next turn");
    if (!(b.permanent && b.permanent.Dismount) && a.permanent && a.permanent.Dismount) react(k, 'Dismount', '−3 Defense, ability lost');
    const wallWas = (b.se.windWallAC && b.se.windWallAC.bonus) || 0;
    const wallNow = (a.se.windWallAC && a.se.windWallAC.bonus) || 0;
    if (wallNow > wallWas) react(k, 'Wind Wall', `+${wallNow - wallWas} Defense until its next turn`);
    if ((a.scaling.defense || 0) > (b.scaling.defense || 0) || (a.scaling.damage || 0) > (b.scaling.damage || 0)) {
      react(k, 'Last Stand', `+${(a.scaling.defense || 0) - (b.scaling.defense || 0)} Defense, +${(a.scaling.damage || 0) - (b.scaling.damage || 0)}D6 damage`);
    }
    const diceWas = (b.scaling.collectedDice || []).length;
    const diceNow = a.scaling.collectedDice || [];
    if (diceNow.length > diceWas) {
      react(k, 'Collect Weapons', diceNow.slice(diceWas).map(d => `+${d.dice} from ${d.from}`).join(', '));
    }
    Object.keys(a.conditional || {}).forEach(name => {
      if (a.conditional[name] && !(b.conditional && b.conditional[name]) && (name === 'Frenzy' || name === 'Desperate Blows')) {
        react(k, name, name === 'Frenzy' ? 'two attacks per turn' : 'attacks have advantage');
      }
    });
    const turretsLost = ((b.se.turret_count || 0) - (a.se.turret_count || 0));
    if (turretsLost > 0 && kind !== 'turn') react(k, 'Protective Gear', 'turret sacrificed, damage blocked');
    // Killed and raised by the same action: HP never reads 0 in between
    if (!b.se.resurrectUsed && a.se.resurrectUsed && main) {
      const raised = main.rows.find(row => row.target.side === a.side && row.amount < 0 && -row.amount >= B[key(row.target.side, row.target.slot)].hp);
      if (raised) {
        const rk = key(raised.target.side, raised.target.slot);
        ledger.takeAll(rk);
        raised.killed = true;
        react(k, 'Resurrect', null, [makeRow(rk, { outcome: 'heal', amount: A[rk].hp, chips: [{ text: `back at ${A[rk].hp} HP`, tone: 'good' }] })]);
      }
    }
    if (b.hp <= 0 && a.hp > 0) {
      const taken = ledger.takeAll(k);
      const angel = Object.keys(A).find(x => A[x].side === a.side && !B[x].se.resurrectUsed && A[x].se.resurrectUsed);
      const row = makeRow(k, { outcome: 'heal', amount: taken, chips: [{ text: `back at ${a.hp} HP`, tone: 'good' }] });
      react(angel || k, angel ? 'Resurrect' : 'Rebirth', null, [row]);
    }
  });
  before.twinSpell.forEach((was, side) => {
    if (!was && after.twinSpell[side] && actor && actor.side === side) react(actorKey, 'Twin Spell', 'may cast again');
  });

  // ---- anything still unexplained ----
  if (main) {
    const summons = actorKey && B[actorKey] ? summonNote(B[actorKey], A[actorKey]) : [];
    if (summons.length) main.note = [main.note, ...summons].filter(Boolean).join(' · ');
    // A hit that a shield or a deflect stopped reads as stopped, not as a miss or an empty row
    main.reactions = main.reactions.filter(r => r.rows.length || r.text);
    main.reactions.forEach(r => {
      if (!r.actor) return;
      if (r.action === 'Arcane Shield' || r.action === 'Protective Gear') {
        main.rows.forEach(row => { if (row.target.side === r.actor.side && row.target.slot === r.actor.slot && !row.amount && row.outcome !== 'miss') { row.outcome = 'blocked'; row.amount = 0; } });
      }
      if (r.action === 'Deflect') {
        main.rows.forEach(row => { if (row.outcome === 'miss' && row.roll && row.roll.vs !== null && row.roll.total >= row.roll.vs) row.outcome = 'deflected'; });
      }
    });
    ledger.open().forEach(k => {
      const taken = ledger.takeAll(k);
      const already = main.rows.some(row => row.target.side === A[k].side && row.target.slot === A[k].slot && row.amount);
      if (k === actorKey && already) return; // Self Destruct: the hero's own row already says it
      if (k === actorKey && kind !== 'special') {
        // The action cost or fed the hero that used it (recoil, lifesteal, Soul Harvest)
        const full = taken > 0 && A[k].hp >= A[k].maxHp && main.rows.some(r => A[key(r.target.side, r.target.slot)].hp <= 0);
        const row = makeRow(k, { outcome: taken > 0 ? 'heal' : 'hit', amount: taken, chips: [{ text: taken > 0 ? (full ? 'healed to full' : 'self heal') : 'recoil', tone: taken > 0 ? 'good' : 'bad' }] });
        attachChips(row, k);
        main.rows.push(row);
      } else {
        const row = makeRow(k, { outcome: taken > 0 ? 'heal' : 'hit', amount: taken });
        attachChips(row, k);
        main.rows.push(row);
      }
    });
    // Statuses on heroes no row mentions (a self-buff, a cleanse, a mark)
    Object.keys(A).forEach(k => {
      if (used.has(k) || !B[k]) return;
      const chips = statusChips(B[k], A[k]);
      const cleansed = (B[k].se.poison || 0) > 0 && (A[k].se.poison || 0) === 0 && A[k].hp > 0;
      if (cleansed) chips.push({ text: 'Poison cleansed', tone: 'good' });
      if (chips.length === 0) return;
      used.add(k);
      main.rows.push(makeRow(k, { chips }));
    });
  } else {
    ledger.open().forEach(k => {
      const taken = ledger.takeAll(k);
      const row = makeRow(k, { outcome: taken > 0 ? 'heal' : 'hit', amount: taken });
      entries.push(makeEntry(ref(A[k]), taken > 0 ? 'Healed' : 'Damage', 'effect', { when: 'end', rows: [row] }));
    });
  }

  // ---- deaths ----
  const fallen = Object.keys(A).filter(k => B[k] && B[k].hp > 0 && A[k].hp <= 0);
  const stillDown = fallen.filter(k => A[k].hp <= 0);
  const lastEntry = entries[entries.length - 1];
  entries.forEach(entry => {
    const mark = rows => rows.forEach(row => {
      const k = key(row.target.side, row.target.slot);
      if (fallen.includes(k) && row.amount < 0) row.killed = true;
    });
    mark(entry.rows);
    entry.reactions.forEach(r => mark(r.rows));
  });
  if (lastEntry) lastEntry.falls = stillDown.map(k => ref(A[k]));
  else if (stillDown.length) entries.push(makeEntry(null, 'Defeated', 'effect', { falls: stillDown.map(k => ref(A[k])) }));

  // An action with nothing to show (an expired status, an empty turn change) is not an entry
  return entries.filter(e => e === main || e.rows.length || e.reactions.length || e.falls.length || e.note);
}

// Appends the entries for one action to the game's log
function record(game, kind, before, result, meta) {
  if (!game) return [];
  if (!game.log) game.log = [];
  if (!game.logSeq) game.logSeq = 0;
  let entries = [];
  try {
    entries = build(game, kind, before, result, meta);
  } catch (err) {
    console.error('battle log failed:', err.message);
    return [];
  }
  entries.forEach(entry => {
    entry.id = ++game.logSeq;
    entry.turn = entry.when === 'start' ? meta.turnAfter : meta.turn;
  });
  // Entries of an action that ran inside this one (a turn that ended itself) were added first; put ours ahead
  game.log.splice(before.length, 0, ...entries);
  return entries;
}

const tail = game => (game && game.log ? game.log.slice(-LOG_TAIL) : []);

module.exports = { snapshot, record, build, tail, LOG_TAIL };
