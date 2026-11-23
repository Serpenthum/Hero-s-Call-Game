// The battle log as the server sends it (backend/battleLog.js): data, not sentences.

export interface LogHero {
  name: string;
  side: number; // player index
  slot: number; // position in the team
}

export interface LogRoll {
  d20: number;
  mod: number;
  total: number | null;
  vs: number | null; // the defense the roll had to reach
  adv: 'advantage' | 'disadvantage' | null;
  rolls: [number, number] | null;
  why: string | null; // the special that gave advantage or widened the crit range
  auto: string | null; // 'Auto-hit', 'Ace Up The Sleeve'
}

export type LogTone = 'poison' | 'bad' | 'good' | 'buff' | 'defense';
export type LogOutcome = 'hit' | 'crit' | 'miss' | 'blocked' | 'deflected' | 'heal' | 'effect';

export interface LogRow {
  target: LogHero;
  roll: LogRoll | null;
  outcome: LogOutcome;
  amount: number | null; // negative = damage
  dice: number[] | null;
  parts: Array<{ label: string; value: number }> | null;
  chips: Array<{ text: string; tone: LogTone }>;
  killed: boolean;
}

export interface LogReaction {
  actor: LogHero | null;
  action: string;
  text: string | null;
  rows: LogRow[];
}

export interface LogEntry {
  id: number;
  turn: { n: number; side: number; hero: string };
  actor: LogHero | null;
  action: string;
  kind: 'attack' | 'ability' | 'special' | 'effect';
  when: 'start' | 'end' | null;
  note: string | null;
  rows: LogRow[];
  reactions: LogReaction[];
  falls: LogHero[];
  revives: LogHero[];
}

// The server sends only the newest entries with each game state; the client keeps the whole match.
// Entries arrive in order, so anything with an id we have not seen goes on the end.
export function mergeLog(have: LogEntry[], incoming: LogEntry[] | undefined): LogEntry[] {
  if (!incoming) return have; // a server that does not send the log yet
  if (incoming.length === 0) return have.length ? [] : have; // a new battle
  // Ids only grow within a battle; smaller ones mean the log started over
  if (have.length && incoming[incoming.length - 1].id < have[have.length - 1].id) return incoming;
  const seen = new Set(have.map(e => e.id));
  const fresh = incoming.filter(e => !seen.has(e.id));
  return fresh.length === 0 ? have : [...have, ...fresh];
}

export const sameHero = (a: LogHero | null, b: LogHero | null) =>
  !!a && !!b && a.side === b.side && a.slot === b.slot;

// "−3", "+8", "Miss": the outcome column
export function outcomeText(row: LogRow): string {
  if (row.outcome === 'miss') return 'Miss';
  if (row.outcome === 'blocked') return 'Blocked';
  if (row.outcome === 'deflected') return 'Deflected';
  if (!row.amount) return '';
  return row.amount > 0 ? `+${row.amount}` : `−${Math.abs(row.amount)}`;
}

// "(3+3 +1 Dark Pact)": shown only when the dice alone would not explain the number
export function diceText(row: LogRow): string {
  if (!row.dice || row.dice.length === 0) return '';
  if (row.dice.length < 2 && !row.parts) return '';
  const bonus = (row.parts || []).map(p => ` +${p.value} ${p.label}`).join('');
  return `${row.dice.join('+')}${bonus}`;
}

// What the tutorial needs to know about an entry
export const tutorialEntry = (e: LogEntry) => ({
  id: String(e.id),
  crit: e.rows.some(r => r.outcome === 'crit'),
  attacker: e.actor?.name,
});
