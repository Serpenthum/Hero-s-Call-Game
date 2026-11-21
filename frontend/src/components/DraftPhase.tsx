import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GameState, Player, Hero } from '../types';
import { socketService } from '../socketService';
import { getAnimSpeed } from '../battleAnimations';
import { useCardReader } from '../cards/CardReader';
import { READABLE_CARD_MIN_WIDTH, draftStep, playerStatus, draftChoice, visibleBans } from '../draft/draftRules';
import { useDraftLayout } from '../draft/useDraftLayout';
import { BeforeUpdate, useDraftMotion } from '../draft/useDraftMotion';
import DraftClock from './DraftClock';
import DraftTopBar from './draft/DraftTopBar';
import DraftBand from './draft/DraftBand';
import DraftHand from './draft/DraftHand';
import DraftBigCard from './draft/DraftBigCard';
import DraftOrder, { tapOrder } from './draft/DraftOrder';
import { isHolo } from '../holoSetting';
import '../styles/Draft.css';

interface DraftPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  opponent: Player | null;
  allHeroes: Hero[];
  draftTimer?: { round: number; deadline: number; durationMs: number } | null;
  /** The opponent-away notice (DisconnectNotice with its countdown), laid across the hand area. */
  away?: React.ReactNode;
  /** The connection to the server dropped: "Connecting…" in the top bar. */
  connecting?: boolean;
  /** Goes up each time the server hands the game back after a reconnect (no motion for that state). */
  rejoins?: number;
  /** The heroes you own holographic: the opponent bans from your collection, so their ban may be one. */
  holoHeroes?: string[];
}

/** The hand you hold: from your player, or from the older per-game lists. */
function handOf(gameState: GameState, currentPlayer: Player, allHeroes: Hero[]): Hero[] {
  if (Array.isArray(currentPlayer.draftCards)) return currentPlayer.draftCards;
  if (!gameState.draftCards) return [];
  const index = gameState.players.findIndex(p => p.id === currentPlayer.id);
  if (index === -1) return [];
  const names = index === 0 ? gameState.draftCards.player1 : gameState.draftCards.player2;
  if (!Array.isArray(names)) return [];
  return names.map(name => allHeroes.find(h => h.name === name)).filter(Boolean) as Hero[];
}

/** The draft table: ban, the three picks and the order step. */
const DraftPhase: React.FC<DraftPhaseProps> = ({
  gameState,
  currentPlayer,
  opponent,
  allHeroes,
  draftTimer,
  away = null,
  connecting = false,
  rejoins = 0,
  holoHeroes,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const reader = useCardReader();
  const step = draftStep(gameState.phase, gameState.currentDraftPhase);
  const ordering = step === 4;
  const hand = handOf(gameState, currentPlayer, allHeroes);
  const handNames = hand.map(h => h.name);
  const handKey = handNames.join('|');

  // Order step: the three heroes in the order you set (or already sent, after a refresh).
  const team = currentPlayer.team ?? [];
  const teamNames = team.map(h => h.name);
  const teamKey = teamNames.join('|');
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [orderSel, setOrderSel] = useState<string | null>(null);
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const [readySent, setReadySent] = useState(false);
  useEffect(() => {
    setLocalOrder(null);
    setOrderSel(null);
  }, [step, teamKey]);
  useEffect(() => {
    setReadySent(false);
    setLastTapped(null);
  }, [step]);
  const sameHeroes = (names: string[] | null | undefined): names is string[] =>
    !!names && names.length === teamNames.length && teamNames.every(n => names.includes(n));
  const serverOrder = currentPlayer.attackOrder;
  const orderNames = sameHeroes(localOrder) ? localOrder : sameHeroes(serverOrder) ? serverOrder : teamNames;
  const orderHeroes = orderNames.map(n => team.find(h => h.name === n)).filter(Boolean) as Hero[];

  const bans = visibleBans(currentPlayer.bannedCard, opponent?.bannedCard);
  // Animations off (the setting, or the system's reduced-motion setting): nothing on this screen moves.
  const motionOff =
    getAnimSpeed() === 'off' ||
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const motion = useDraftMotion({
    root: rootRef,
    off: motionOff,
    step,
    hand,
    teamNames,
    theirCount: opponent?.team?.length ?? 0,
    bans,
    timer: draftTimer,
    rejoins,
  });
  // The card just sent keeps its place in the hand (hidden) while its copy flies, so the other cards stay put.
  const held = motion.held;
  const shownHand = held?.gap ? [...hand.slice(0, held.index), held.hero, ...hand.slice(held.index)] : hand;

  const sizes = useDraftLayout(rootRef, ordering ? orderHeroes.length : shownHand.length, step);
  const { layout } = sizes;
  const orderKey = orderNames.join('|');
  useLayoutEffect(() => {
    motion.hopOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const serverStatus = playerStatus(currentPlayer, step);
  const ready = ordering && (readySent || serverStatus === 'done');
  const myStatus = ready ? 'done' : serverStatus;
  const theirStatus = opponent ? playerStatus(opponent, step) : 'choosing';
  // The card you tapped, and (big-card layout) a team or ban card shown big without changing that choice.
  const [picked, setPicked] = useState<string | null>(null);
  const [peek, setPeek] = useState<Hero | null>(null);
  // The card this round's ban or pick was sent for: the hand stays locked on it until the server answers.
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
    setPeek(null);
    setSent(null);
  }, [step, handKey]);

  // Locked once sent or done on the server. A choice no longer in the hand (the clock ran out) is dropped;
  // the big-card layout shows its first card chosen when nothing else is.
  const { chosen, locked } = draftChoice({ picked, sent, handNames, layout, serverDone: myStatus === 'done' });

  // Heroes seen on this screen, so a ban keeps its card (and holo flag) after it leaves the hand.
  const seen = useRef(new Map<string, Hero>());
  [...hand, ...team, ...(opponent?.team ?? [])].forEach(h => seen.current.set(h.name, h));
  const heroByName = (name: string) => seen.current.get(name) ?? allHeroes.find(h => h.name === name);

  const banHolo = {
    mine: !!(bans.mine && heroByName(bans.mine)?.holo),
    // Their ban is one of your heroes: holo if this screen saw it holo, or you own it holographic.
    theirs: !!(bans.theirs && (heroByName(bans.theirs)?.holo || isHolo({ holo_heroes: holoHeroes }, bans.theirs))),
  };

  const choose = (name: string) => {
    if (locked) return;
    setPeek(null);
    setPicked(layout === 'focus' ? name : chosen === name ? null : name);
  };

  // Order step: first tap selects, the same card again cancels, another card swaps the two.
  const tapHero = (name: string) => {
    if (ready) return;
    const next = tapOrder({ order: orderNames, selected: orderSel }, name);
    if (next.order !== orderNames) motion.noteOrder();
    setPeek(null);
    setLastTapped(name);
    setLocalOrder(next.order);
    setOrderSel(next.selected);
  };

  const read = (hero: Hero) => {
    if (layout === 'focus') setPeek(hero);
    else reader.open(hero, { holo: !!hero.holo });
  };

  const act = () => {
    if (ordering) {
      if (ready || orderNames.length !== 3) return;
      socketService.setAttackOrder(orderNames);
      setReadySent(true);
      setOrderSel(null);
      return;
    }
    if (!chosen || locked) return;
    if (step === 0) {
      if (gameState.phase === 'draft' && gameState.currentDraftPhase === 0) socketService.banCard(chosen);
    } else {
      socketService.pickCard(chosen);
    }
    // The socket call has gone; the stamp or the flight starts from here and waits for nothing.
    motion.send(chosen, step === 0 ? 'ban' : 'pick');
    setSent(chosen);
    setPeek(null);
  };

  const clock =
    !ordering && draftTimer && draftTimer.round === gameState.currentDraftPhase && myStatus !== 'done' ? (
      <DraftClock
        key={draftTimer.round}
        deadline={draftTimer.deadline}
        durationMs={draftTimer.durationMs}
        action={step === 0 ? 'ban' : 'pick'}
      />
    ) : null;

  const verb = step === 0 ? 'Ban' : 'Pick';
  const shown = sent ?? held?.name ?? chosen;
  // Order step: the big card shows the last hero tapped (the first hero before any tap).
  const bigHero = ordering
    ? peek ?? orderHeroes.find(h => h.name === lastTapped) ?? orderHeroes[0] ?? null
    : peek ?? (shown ? shownHand.find(h => h.name === shown) ?? null : null);
  // The big card wears the stamp too while your ban is on its way.
  const bigBanned = step === 0 && !!bigHero && bigHero.name === (sent ?? held?.name);
  const banner = away ? <div className="draft-away">{away}</div> : null;

  // Big-card layout: hand cards too narrow for readable rules text show as tiny cards (name and stats).
  const tinyHand = layout === 'focus' && sizes.handCard < READABLE_CARD_MIN_WIDTH;

  const style = {
    '--draft-card-w': `${sizes.handCard}px`,
    '--draft-card-scale': sizes.handCard / 260,
    '--draft-big-w': `${sizes.bigCard}px`,
    '--draft-big-scale': sizes.bigCard / 260,
    '--draft-slot-w': `${sizes.slot}px`,
    '--draft-slot-scale': sizes.slot / 260,
    '--draft-hand-pad': `${sizes.handPad}px`,
  } as React.CSSProperties;

  const classes = [
    'draft-table',
    `draft-table--${layout}`,
    tinyHand ? 'draft-table--tiny-hand' : '',
    held ? 'draft-table--sending' : '',
    bigBanned ? 'draft-table--big-banned' : '',
    motionOff ? 'draft--still' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={classes} style={style} {...motion.attrs}>
      <BeforeUpdate onBefore={motion.before} />
      {layout === 'focus' ? <DraftBigCard hero={bigHero} waiting={!ordering && locked} /> : null}
      <DraftTopBar step={step} clock={clock} connecting={connecting} onLeave={() => socketService.abandonDraft()} />
      <DraftBand
        layout={layout}
        me={{ name: currentPlayer.name, team: ordering ? orderHeroes : team, status: myStatus }}
        them={{ name: opponent?.name ?? 'Opponent', team: opponent?.team ?? [], status: theirStatus }}
        bans={bans}
        banHolo={banHolo}
        onRead={read}
        heroByName={heroByName}
      />
      {ordering ? (
        <DraftOrder order={orderHeroes} selected={orderSel} ready={ready} onTap={tapHero} tiny={tinyHand} banner={banner} />
      ) : (
        <DraftHand
          cards={shownHand}
          chosen={shown}
          step={step}
          locked={locked}
          onChoose={choose}
          layout={layout}
          tiny={tinyHand}
          banner={banner}
        />
      )}
      <footer className="draft-foot">
        {ordering ? (
          <button type="button" className="draft-act" disabled={ready || orderNames.length !== 3} onClick={act}>
            {ready ? 'Ready ✓' : 'Ready'}
          </button>
        ) : (
          <button
            type="button"
            className={`draft-act${step === 0 ? ' draft-act--ban' : ''}`}
            disabled={!chosen || locked}
            onClick={act}
          >
            {chosen && !locked ? `${verb} ${chosen}` : verb}
          </button>
        )}
      </footer>
      {/* Copies in motion (the old hand sliding off, a stamped card) are laid here; they ignore the pointer. */}
      <div className="draft-fx" aria-hidden="true" />
    </div>
  );
};

export default DraftPhase;
