import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import config from '../config';
import { diceText, outcomeText, sameHero } from '../battle/log';
import type { LogEntry, LogHero, LogReaction, LogRoll, LogRow } from '../battle/log';

interface BattleLogProps {
  entries: LogEntry[];
  /** The viewer's player index; their heroes are ringed in their colour */
  mySide: number;
  /** Player names by index, for the turn dividers */
  playerNames: string[];
  /** A spectator has no "You" */
  isSpectating?: boolean;
}

const sideClass = (side: number, mySide: number) => (side === mySide ? 'you' : 'foe');
const portrait = (name: string) =>
  `${config.IMAGE_BASE_URL}/hero-images/${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;
const initials = (name: string) => {
  const words = name.split(' ');
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2));
};

const D20 = () => (
  <svg className="log-d20" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7z" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 4.5l3.2 5.5H4.8z" fill="currentColor" />
  </svg>
);
const Skull = () => (
  <svg className="log-skull" viewBox="0 0 16 16" role="img" aria-label="defeated">
    <path d="M8 1.5c-3.3 0-5.5 2.2-5.5 5.2 0 1.8.8 3 2 3.8V13h7v-2.5c1.2-.8 2-2 2-3.8 0-3-2.2-5.200-5.500-5.200z" fill="currentColor" />
    <circle cx="5.8" cy="7" r="1.3" className="log-skull-eye" />
    <circle cx="10.2" cy="7" r="1.3" className="log-skull-eye" />
  </svg>
);

function Token({ hero, mySide }: { hero: LogHero; mySide: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`log-tok ${sideClass(hero.side, mySide)}`} aria-hidden="true">
      {broken
        ? initials(hero.name)
        : <img src={portrait(hero.name)} alt="" loading="lazy" onError={() => setBroken(true)} />}
    </span>
  );
}

const Name = ({ hero, mySide }: { hero: LogHero; mySide: number }) => (
  <b className={`log-name ${sideClass(hero.side, mySide)}`}>{hero.name}</b>
);

function Roll({ roll }: { roll: LogRoll }) {
  const dropped = roll.rolls ? roll.rolls.find((r, i) => r !== roll.d20 || i === 1) : undefined;
  return (
    <span className="log-roll">
      <D20 />
      {roll.adv && roll.rolls ? (
        <>
          <span>{roll.d20}</span>
          <s>{dropped}</s>
        </>
      ) : <span>{roll.d20}</span>}
      {roll.auto
        ? <span className="log-roll-auto">{roll.auto}</span>
        : <span>+{roll.mod} = {roll.total}</span>}
      {roll.vs !== null && !roll.auto && <span className="log-roll-vs">vs {roll.vs}</span>}
    </span>
  );
}

// The special behind a roll: "Eagle Eye", or "Disadvantage: Anti-Magic Field"
const rollWhy = (roll: LogRoll | null) => {
  if (!roll) return null;
  if (roll.adv === 'disadvantage') return roll.why ? `Disadvantage: ${roll.why}` : 'Disadvantage';
  if (roll.adv === 'advantage') return roll.why ? `Advantage: ${roll.why}` : 'Advantage';
  return roll.why;
};

function Outcome({ row, big }: { row: LogRow; big?: boolean }) {
  const text = outcomeText(row);
  const tone = row.outcome === 'crit' ? 'crit'
    : row.outcome === 'heal' || (row.amount || 0) > 0 ? 'heal'
    : (row.amount || 0) < 0 ? 'dmg' : 'dim';
  if (!text && !row.killed) return null;
  return (
    <span className={`log-out ${tone}${big ? ' big' : ''}`}>
      {row.outcome === 'crit' && <small>Crit</small>}
      {text}
      {row.killed && <Skull />}
    </span>
  );
}

const Chips = ({ row }: { row: LogRow }) => (
  <>
    {row.chips.map((chip, i) => <span key={i} className={`log-chip ${chip.tone}`}>{chip.text}</span>)}
  </>
);

// What sits under the names for one row: the roll, why it had advantage, statuses, and the dice
function RowDetail({ row }: { row: LogRow }) {
  const why = rollWhy(row.roll);
  const dice = diceText(row);
  return (
    <>
      {row.roll && <Roll roll={row.roll} />}
      {why && <span className="log-why">{why}</span>}
      <Chips row={row} />
      {dice && <span className="log-dice">{dice}</span>}
    </>
  );
}

function Reaction({ reaction, mySide }: { reaction: LogReaction; mySide: number }) {
  return (
    <div className="log-react">
      <span className="log-react-mark" aria-hidden="true">↳</span>
      <span className="log-react-body">
        <em>{reaction.action}</em>
        {reaction.actor && <> <Name hero={reaction.actor} mySide={mySide} /></>}
        {reaction.text && <span className="log-react-text"> {reaction.text}</span>}
        {reaction.rows.map((row, i) => (
          <span key={i} className="log-react-row">
            {!sameHero(row.target, reaction.actor) && <><span className="log-to">›</span> <Name hero={row.target} mySide={mySide} /></>}
            <Chips row={row} />
            <Outcome row={row} />
          </span>
        ))}
      </span>
    </div>
  );
}

function Entry({ entry, mySide }: { entry: LogEntry; mySide: number }) {
  const lead = entry.actor || entry.rows[0]?.target || null;
  const single = entry.rows.length === 1 ? entry.rows[0] : null;
  const self = !!single && sameHero(single.target, entry.actor);
  const crit = entry.rows.some(r => r.outcome === 'crit');
  const when = entry.when === 'start' ? 'start of turn' : entry.when === 'end' ? 'end of turn' : null;
  const basic = entry.kind === 'attack' && entry.action === 'Attack';
  let who: ReactNode = null;
  if (lead) {
    who = (
      <>
        <Name hero={lead} mySide={mySide} />
        {single && entry.actor && !self && <> <span className="log-to">›</span> <Name hero={single.target} mySide={mySide} /></>}
      </>
    );
  }
  return (
    <div
      data-log-id={entry.id}
      className={`log-entry ${lead ? sideClass(lead.side, mySide) : ''}${crit ? ' crit' : ''}`}
    >
      {lead && <Token hero={lead} mySide={mySide} />}
      <div className="log-main">
        <div className="log-head">
          <span className="log-who">{who}</span>
          {single && <Outcome row={single} big />}
        </div>
        <div className="log-what">
          {basic ? <span>Attack</span> : <em>{entry.action}</em>}
          {single && <RowDetail row={single} />}
          {entry.note && <span className="log-note">{entry.note}</span>}
          {when && <span className="log-note">{when}</span>}
        </div>
        {entry.rows.length > 1 && (
          <div className="log-rows">
            {entry.rows.map((row, i) => (
              <div key={i} className="log-row">
                <span className="log-row-who">
                  <Name hero={row.target} mySide={mySide} />
                  <RowDetail row={row} />
                </span>
                <Outcome row={row} />
              </div>
            ))}
          </div>
        )}
        {entry.reactions.map((reaction, i) => <Reaction key={i} reaction={reaction} mySide={mySide} />)}
      </div>
    </div>
  );
}

/** The battle log: one entry per action, grouped under whose turn it was, newest at the bottom. */
export default function BattleLog({ entries, mySide, playerNames, isSpectating }: BattleLogProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true); // the reader is at the newest entry, so keep them there

  useEffect(() => {
    const list = listRef.current;
    if (list && stuck.current) list.scrollTop = list.scrollHeight;
  }, [entries.length]);

  const onScroll = () => {
    const list = listRef.current;
    if (list) stuck.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  const items: ReactNode[] = [];
  let turn: number | null = null;
  entries.forEach(entry => {
    if (entry.turn && entry.turn.n !== turn) {
      turn = entry.turn.n;
      const owner = !isSpectating && entry.turn.side === mySide ? 'You' : (playerNames[entry.turn.side] || 'Opponent');
      items.push(
        <div key={`turn-${entry.id}`} className={`log-turn ${sideClass(entry.turn.side, mySide)}`}>
          <span>{owner} · {entry.turn.hero}</span>
        </div>
      );
    }
    items.push(<Entry key={entry.id} entry={entry} mySide={mySide} />);
    entry.falls.forEach(hero => {
      items.push(
        <div key={`fall-${entry.id}-${hero.side}-${hero.slot}`} className="log-fall">
          <Skull /><span><Name hero={hero} mySide={mySide} /> falls</span>
        </div>
      );
    });
  });

  return (
    <div className="battle-log-section">
      <h4>Battle Log</h4>
      <div className="log-entries" ref={listRef} onScroll={onScroll} role="log" aria-live="polite">
        {items.length > 0 ? items : <div className="log-placeholder">Battle actions will appear here</div>}
      </div>
    </div>
  );
}
