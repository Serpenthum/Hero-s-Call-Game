// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BattleLog from './BattleLog';
import { diceText, mergeLog, outcomeText, tutorialEntry } from '../battle/log';
import type { LogEntry, LogRow } from '../battle/log';

const hero = (name: string, side: number, slot = 0) => ({ name, side, slot });
const row = (over: Partial<LogRow> = {}): LogRow => ({
  target: hero('Berserker', 0), roll: null, outcome: 'effect', amount: null, dice: null, parts: null, chips: [], killed: false, ...over,
});
const roll = (d20: number, mod: number, vs: number) => ({ d20, mod, total: d20 + mod, vs, adv: null, rolls: null, why: null, auto: null });
const entry = (id: number, over: Partial<LogEntry> = {}): LogEntry => ({
  id, turn: { n: 0, side: 1, hero: 'Reaper' }, actor: hero('Reaper', 1, 2), action: 'Attack', kind: 'attack', when: null, note: null,
  rows: [], reactions: [], falls: [], revives: [], ...over,
});
const text = (entries: LogEntry[], props: Partial<Parameters<typeof BattleLog>[0]> = {}) =>
  renderToStaticMarkup(<BattleLog entries={entries} mySide={0} playerNames={['serpenthor', 'Bullet12123']} {...props} />)
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('BattleLog', () => {
  it('shows a placeholder before anything happens', () => {
    expect(text([])).toContain('Battle actions will appear here');
  });

  it('reads a hit as who, whom, the roll against defense, and the damage', () => {
    const out = text([entry(1, { rows: [row({ roll: roll(7, 2, 9), outcome: 'hit', amount: -3, dice: [3] })] })]);
    expect(out).toContain('Reaper › Berserker');
    expect(out).toContain('7 +2 = 9 vs 9');
    expect(out).toContain('−3');
    expect(out).not.toContain('used');
    expect(out).not.toContain('(3)');
  });

  it('heads each turn with whose it was', () => {
    const out = text([
      entry(1, { rows: [row({ outcome: 'miss', roll: roll(3, 2, 9) })] }),
      entry(2, { turn: { n: 1, side: 0, hero: 'Berserker' }, actor: hero('Berserker', 0), rows: [row({ target: hero('Angel', 1), outcome: 'miss', roll: roll(1, 2, 6) })] }),
    ]);
    expect(out).toContain('Bullet12123 · Reaper');
    expect(out).toContain('You · Berserker');
    expect(out.indexOf('Bullet12123 · Reaper')).toBeLessThan(out.indexOf('You · Berserker'));
    expect(out).toContain('Miss');
  });

  it('names both players for a spectator', () => {
    const out = text([entry(1, { turn: { n: 0, side: 0, hero: 'Ninja' }, actor: hero('Ninja', 0) })], { isSpectating: true });
    expect(out).toContain('serpenthor · Ninja');
    expect(out).not.toContain('You');
  });

  it('shows a self-buff on the hero alone, with its chip', () => {
    const out = text([entry(1, {
      actor: hero('Berserker', 0), action: 'Bloodbath', kind: 'ability',
      rows: [row({ chips: [{ text: 'Stack 1/2', tone: 'buff' }] })],
    })]);
    expect(out).toContain('Bloodbath');
    expect(out).toContain('Stack 1/2');
    expect(out).not.toContain('›');
  });

  it('lists an area ability as one entry with a line per target', () => {
    const html = renderToStaticMarkup(<BattleLog mySide={0} playerNames={[]} entries={[entry(1, {
      actor: hero('Wizard', 0), action: 'Fireball', kind: 'ability', turn: { n: 0, side: 0, hero: 'Wizard' },
      rows: [
        row({ target: hero('Ninja', 1, 0), roll: roll(15, 3, 7), outcome: 'hit', amount: -3 }),
        row({ target: hero('Warden', 1, 1), roll: roll(6, 3, 11), outcome: 'miss' }),
      ],
    })]} />);
    expect(html.match(/class="log-entry /g)).toHaveLength(1);
    expect(html.match(/class="log-row"/g)).toHaveLength(2);
  });

  it('shows advantage with the dropped die and the special that gave it', () => {
    const out = text([entry(1, {
      rows: [row({ roll: { ...roll(12, 3, 8), adv: 'advantage', rolls: [7, 12], why: 'Eagle Eye' }, outcome: 'hit', amount: -4 })],
    })]);
    expect(out).toContain('12 7 +3 = 15 vs 8');
    expect(out).toContain('Advantage: Eagle Eye');
  });

  it('explains a bonus next to the dice', () => {
    const out = text([entry(1, { rows: [row({ outcome: 'hit', amount: -6, dice: [5], parts: [{ label: 'Bloodbath', value: 1 }] })] })]);
    expect(out).toContain('5 +1 Bloodbath');
  });

  it('puts a reaction inside the entry that caused it and gives a fall its own line', () => {
    const out = text([entry(1, {
      rows: [row({ target: hero('Bomber', 0, 1), outcome: 'hit', amount: -4, killed: true })],
      reactions: [{ actor: hero('Bomber', 0, 1), action: 'Explosion', text: null, rows: [row({ target: hero('Reaper', 1, 2), outcome: 'hit', amount: -4 })] }],
      falls: [hero('Bomber', 0, 1)],
    })]);
    expect(out).toContain('Explosion Bomber › Reaper −4');
    expect(out).toContain('Bomber falls');
  });

  it('marks crits and keeps the id the tutorial points at', () => {
    const html = renderToStaticMarkup(<BattleLog mySide={0} playerNames={[]} entries={[entry(7, { rows: [row({ outcome: 'crit', amount: -8 })] })]} />);
    expect(html).toContain('data-log-id="7"');
    expect(html).toContain('log-entry foe crit');
    expect(html).toContain('Crit');
  });

  it('labels start- and end-of-turn effects', () => {
    const out = text([entry(1, { actor: hero('Druid', 0), action: 'Healing Word', kind: 'special', when: 'end', rows: [row({ target: hero('Fighter', 0, 1), outcome: 'heal', amount: 3 })] })]);
    expect(out).toContain('Healing Word');
    expect(out).toContain('end of turn');
    expect(out).toContain('+3');
  });
});

describe('log helpers', () => {
  it('outcomeText', () => {
    expect(outcomeText(row({ outcome: 'blocked', amount: 0 }))).toBe('Blocked');
    expect(outcomeText(row({ outcome: 'deflected' }))).toBe('Deflected');
    expect(outcomeText(row({ outcome: 'heal', amount: 8 }))).toBe('+8');
    expect(outcomeText(row())).toBe('');
  });

  it('diceText hides a single plain die', () => {
    expect(diceText(row({ dice: [4] }))).toBe('');
    expect(diceText(row({ dice: [3, 3] }))).toBe('3+3');
  });

  it('mergeLog appends only entries it has not seen', () => {
    const have = [entry(1), entry(2)];
    expect(mergeLog(have, [entry(2), entry(3)]).map(e => e.id)).toEqual([1, 2, 3]);
    expect(mergeLog(have, [entry(1), entry(2)])).toBe(have);
    expect(mergeLog(have, undefined)).toBe(have);
  });

  it('mergeLog starts over for a new battle', () => {
    expect(mergeLog([entry(5), entry(6)], [])).toEqual([]);
    expect(mergeLog([entry(5), entry(6)], [entry(1)]).map(e => e.id)).toEqual([1]);
  });

  it('tutorialEntry keeps what the tutorial reads', () => {
    expect(tutorialEntry(entry(4, { rows: [row({ outcome: 'crit' })] }))).toEqual({ id: '4', crit: true, attacker: 'Reaper' });
  });
});
