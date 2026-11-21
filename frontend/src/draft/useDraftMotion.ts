// The draft screen's motion: deal, ban stamp, flights into the team and the ban spot, hands swapping, the order hop.
//
// Rules it keeps:
// - The server's state is drawn as soon as it arrives. Everything here is a copy laid over the screen
//   (a flying card, the old hand sliding away) or a short CSS animation on what is already drawn.
// - Nothing here delays a socket call, and nothing blocks a tap: copies ignore the pointer.
// - With animations off (`off`) it does nothing at all.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Hero } from '../types';
import { heroImage } from '../components/draft/DraftPortrait';
import { getHoloEffects } from '../holoSetting';
import { DraftStep, heldCard } from './draftRules';
import { Anchor, Box, anchorAt, cancelFlights, flyCard } from './flyCard';

/** The stamp is read for this long before the banned card flies off (the stamp itself lands in 0.3 s). */
export const BAN_HOLD_MS = 650;
/** A sent card that the server never answers is shown again after this long. */
const SEND_GIVE_UP_MS = 4000;
const HOP_MS = 420;
const LAND_MS = 450;
const FLIP_MS = 600;
const POP_MS = 550;
const HAND_FX_MS = 1500;
const OUT_MS = 800;
const MATCH_FOUND_WAIT_MS = 2500;

type HandFx = 'wait' | 'deal' | 'in' | null;
type Kind = 'ban' | 'pick';

interface Hold {
  name: string;
  hero: Hero;
  index: number;
  size: number;
  step: DraftStep;
}

interface Seen {
  step: DraftStep;
  handNames: string[];
  teamNames: string[];
  theirCount: number;
  banMine: string | null;
  banTheirs: string | null;
}

interface Snapshot {
  hand: HTMLElement;
  box: Box;
  cards: Map<string, { box: Box; el: Element }>;
  vars: Array<[string, string]>;
  tiny: boolean;
}

export interface DraftMotionInput {
  root: React.RefObject<HTMLDivElement>;
  /** Animations off: nothing moves. */
  off: boolean;
  step: DraftStep;
  hand: Hero[];
  /** Your team in the server's order (the newest pick last). */
  teamNames: string[];
  theirCount: number;
  bans: { mine: string | null; theirs: string | null };
  timer?: { deadline: number; durationMs: number } | null;
  /** Goes up each time the server hands the game back after a reconnect: that state is shown with no motion. */
  rejoins?: number;
}

const SIZE_VARS = ['--draft-card-w', '--draft-card-scale', '--draft-hand-pad'];
const CARD_SELECTOR = '.draft-hand-card, .draft-order-card';
/** A copy of a hand keeps the card face it was copied with (Draft.css), whatever the table shows by then. */
const GHOST_TINY = 'draft-hand--tiny';

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const named = (parent: ParentNode, selector: string, name: string): Element | undefined =>
  Array.from(parent.querySelectorAll(selector)).find(el => el.getAttribute('data-name') === name);

/** A copy of a hand card for a flight: the same face (holo and all), at the hand card's width. */
function cardCopy(cardWrap: Element, width: number, tiny: boolean): HTMLElement {
  const box = document.createElement('div');
  box.className = `draft-flyer-card${tiny ? ' draft-flyer-card--tiny' : ''}`;
  box.style.width = `${width}px`;
  box.style.setProperty('--hero-card-scale', String(width / 260));
  const card = cardWrap.querySelector('.hero-card')?.cloneNode(true) as HTMLElement | undefined;
  if (card) {
    card.classList.remove('selected', 'card-hovering');
    box.appendChild(card);
  }
  return box;
}

/** A greyed round portrait for the flight into the ban spot. */
function banCopy(name: string, holo: boolean, width: number): HTMLElement {
  const portrait = document.createElement('span');
  portrait.className = `draft-portrait draft-flyer-ban${holo ? ' draft-portrait--holo' : ''}`;
  portrait.style.width = `${width}px`;
  portrait.style.height = `${width}px`;
  const img = document.createElement('img');
  img.src = heroImage(name);
  img.alt = '';
  portrait.appendChild(img);
  return portrait;
}

/** Runs `onBefore` just before React changes the page, while the old hand is still on it. */
export class BeforeUpdate extends React.Component<{ onBefore(): void }> {
  getSnapshotBeforeUpdate() {
    this.props.onBefore();
    return null;
  }
  componentDidUpdate() {}
  render() {
    return null;
  }
}

export function useDraftMotion(input: DraftMotionInput) {
  const { root, off, step, hand, teamNames, theirCount, bans, rejoins = 0 } = input;
  const handNames = hand.map(h => h.name);
  const now: Seen = { step, handNames, teamNames, theirCount, banMine: bans.mine, banTheirs: bans.theirs };
  // `own` changes when your side of the table does: only then is the old hand worth copying.
  const own = [step, handNames.join('|'), teamNames.join('|'), bans.mine].join('~');
  const signature = [own, theirCount, bans.theirs].join('~');

  const [handFx, setHandFx] = useState<HandFx>(null);
  const [flySlot, setFlySlot] = useState<number | null>(null);
  const [flyBan, setFlyBan] = useState(false);
  const [landed, setLanded] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [popMine, setPopMine] = useState(false);
  const [popTheirs, setPopTheirs] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);

  const latest = useRef({ now, own, input });
  latest.current = { now, own, input };
  const committed = useRef<(Seen & { own: string }) | null>(null);
  const rejoinsSeen = useRef(rejoins);
  const snap = useRef<Snapshot | null>(null);
  const seq = useRef<{ id: number; name: string; kind: Kind; done: boolean } | null>(null);
  const seqId = useRef(0);
  const fxToken = useRef(0);
  const hopFrom = useRef<Map<string, Box> | null>(null);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const showHandFx = useCallback(
    (fx: Exclude<HandFx, null | 'wait'>) => {
      const token = ++fxToken.current;
      setHandFx(fx);
      later(() => {
        if (fxToken.current === token) setHandFx(null);
      }, HAND_FX_MS);
    },
    [later],
  );

  const land = useCallback(
    (slot: number) => {
      setLanded(slot);
      later(() => setLanded(v => (v === slot ? null : v)), LAND_MS);
    },
    [later],
  );
  const popBan = useCallback(
    (who: 'mine' | 'theirs') => {
      const set = who === 'mine' ? setPopMine : setPopTheirs;
      set(true);
      later(() => set(false), POP_MS);
    },
    [later],
  );

  /** A copy of the old hand (or one card of it) laid over the table where it stood. */
  const layGhost = (el: HTMLElement, at: Box, vars: Array<[string, string]>, extra: string): HTMLElement | null => {
    const table = root.current;
    const layer = table?.querySelector('.draft-fx');
    if (!table || !layer) return null;
    const origin = table.getBoundingClientRect();
    el.classList.add('draft-hand--ghost', ...extra.split(' ').filter(Boolean));
    el.style.left = `${at.left - origin.left}px`;
    el.style.top = `${at.top - origin.top}px`;
    el.style.width = `${at.width}px`;
    el.style.height = `${at.height}px`;
    vars.forEach(([k, v]) => el.style.setProperty(k, v));
    layer.appendChild(el);
    return el;
  };

  const sizeVars = (): Array<[string, string]> => {
    const table = root.current;
    return table ? SIZE_VARS.map(k => [k, table.style.getPropertyValue(k)] as [string, string]) : [];
  };

  const clearGhosts = (selector: string) => root.current?.querySelectorAll(selector).forEach(g => g.remove());

  /** Cuts the ban or pick in the air: the server said something else. */
  const cut = () => {
    seq.current = null;
    cancelFlights();
    clearGhosts('.draft-hand--stamped');
    setFlySlot(null);
    setFlyBan(false);
    setHold(null);
  };

  /** A flight has landed. The slot or ban spot shows again; it pulses once the server has it. */
  const finish = (id: number, kind: Kind, slot: number) => {
    const s = seq.current;
    if (!alive.current || !s || s.id !== id) return;
    if (kind === 'pick') setFlySlot(null);
    else setFlyBan(false);
    const seen = committed.current;
    const confirmed = !!seen && (kind === 'pick' ? seen.teamNames.includes(s.name) : seen.banMine === s.name);
    if (!confirmed) {
      // The server has not answered yet: the card stays out of the hand until it does.
      s.done = true;
      return;
    }
    seq.current = null;
    setHold(null);
    if (kind === 'pick') land(slot);
    else popBan('mine');
  };

  /**
   * The player pressed Ban or Pick: the card leaves the hand now. Call just before the socket call's
   * state is set; it never waits for anything.
   */
  const send = (name: string, kind: Kind) => {
    const table = root.current;
    if (off || !table) return;
    const cardEl = named(table, '.draft-hand-card', name);
    const hero = hand.find(h => h.name === name);
    if (!cardEl || !hero) return;
    const id = ++seqId.current;
    // Called only once a copy is really on its way: from here the card's place in the hand is held.
    const begin = () => {
      seq.current = { id, name, kind, done: false };
      setHold({ name, hero, index: handNames.indexOf(name), size: handNames.length, step });
      later(() => {
        if (seq.current?.id === id) cut();
      }, SEND_GIVE_UP_MS);
    };

    const tiny = table.classList.contains('draft-table--tiny-hand');
    if (kind === 'pick') {
      const slot = teamNames.length;
      const target = table.querySelector(`.draft-slots--me .draft-slot:nth-child(${slot + 1})`);
      // No slot to fly to: nothing is hidden, the card simply waits for the server.
      if (!target) return;
      begin();
      setFlySlot(slot);
      void flyCard(cardEl, target, w => cardCopy(cardEl, w, tiny)).then(() => finish(id, 'pick', slot));
      return;
    }

    // Ban: a stamped, greyed copy stays where the card was, then a portrait flies to the ban spot.
    const target = table.querySelector('.draft-ban--mine .draft-ban-token');
    const at = boxOf(cardEl);
    const ghost = document.createElement('div');
    ghost.className = 'draft-hand draft-hand--ban';
    const copy = cardEl.cloneNode(true) as HTMLElement;
    copy.classList.remove('draft-hand-card--chosen');
    copy.classList.add('draft-hand-card--banned');
    if (!copy.querySelector('.draft-stamp')) {
      const stamp = document.createElement('span');
      stamp.className = 'draft-stamp';
      stamp.textContent = 'Banned';
      copy.appendChild(stamp);
    }
    ghost.appendChild(copy);
    // No ban spot or nowhere to lay the copy: nothing is hidden, the card in the hand wears the stamp itself.
    if (!target || !layGhost(ghost, at, sizeVars(), `draft-hand--stamped${tiny ? ` ${GHOST_TINY}` : ''}`)) return;
    begin();
    setFlyBan(true);
    later(() => {
      const from = anchorAt(ghost);
      ghost.remove();
      if (seq.current?.id !== id) return;
      void flyCard(from, target, w => banCopy(name, !!hero.holo && getHoloEffects(), w)).then(() => finish(id, 'ban', 0));
    }, BAN_HOLD_MS);
  };

  /** Just before the page changes: keep a copy of the hand that is about to be replaced. */
  const before = useCallback(() => {
    const table = root.current;
    if (!table || latest.current.input.off) return;
    if (committed.current && committed.current.own === latest.current.own) return;
    const handEl = table.querySelector<HTMLElement>('.draft-hand');
    if (!handEl) {
      snap.current = null;
      return;
    }
    const copy = handEl.cloneNode(true) as HTMLElement;
    const live = Array.from(handEl.querySelectorAll(CARD_SELECTOR));
    const copies = Array.from(copy.querySelectorAll(CARD_SELECTOR));
    const cards = new Map<string, { box: Box; el: Element }>();
    live.forEach((el, i) => {
      const name = el.getAttribute('data-name');
      if (name && copies[i]) cards.set(name, { box: boxOf(el), el: copies[i] });
    });
    snap.current = {
      hand: copy,
      box: boxOf(handEl),
      cards,
      vars: SIZE_VARS.map(k => [k, table.style.getPropertyValue(k)] as [string, string]),
      tiny: table.classList.contains('draft-table--tiny-hand'),
    };
  }, [root]);

  // After each change from the server: start the motion that change calls for.
  useLayoutEffect(() => {
    const prev = committed.current;
    committed.current = { ...now, own };
    const old = snap.current;
    snap.current = null;
    const table = root.current;
    // A state handed back after a reconnect is not a live change: it is shown as it is. No hand slides and
    // no card flies for what happened while this screen was away; anything in the air is dropped.
    const rejoined = rejoinsSeen.current !== rejoins;
    rejoinsSeen.current = rejoins;
    if (rejoined) {
      if (seq.current) cut();
      clearGhosts('.draft-hand--ghost');
      return;
    }
    if (!prev || off || !table) return;

    const played: string[] = [];

    /** The server played a card this screen did not send (the clock ran out): fly it from where it was. */
    const flyPlayed = (name: string, kind: Kind) => {
      const from = old?.cards.get(name);
      if (kind === 'pick') {
        const slotEl = named(table, '.draft-slots--me .draft-slot', name);
        const slot = slotEl?.parentElement ? Array.from(slotEl.parentElement.children).indexOf(slotEl) : -1;
        if (slot < 0) return;
        if (!from || !slotEl || !old) return land(slot);
        const anchor: Anchor = { getBoundingClientRect: () => from.box };
        setFlySlot(slot);
        void flyCard(anchor, slotEl, w => cardCopy(from.el, w, old.tiny)).then(() => {
          if (!alive.current) return;
          setFlySlot(v => (v === slot ? null : v));
          land(slot);
        });
        return;
      }
      const target = table.querySelector('.draft-ban--mine .draft-ban-token');
      if (!from || !target) return popBan('mine');
      const anchor: Anchor = { getBoundingClientRect: () => from.box };
      const holo = !!from.el.querySelector('.card-holo');
      setFlyBan(true);
      void flyCard(anchor, target, w => banCopy(name, holo, w)).then(() => {
        if (!alive.current) return;
        setFlyBan(false);
        popBan('mine');
      });
    };

    const settle = (name: string, kind: Kind) => {
      played.push(name);
      const s = seq.current;
      if (s && s.kind === kind && s.name === name) {
        // The card this screen sent. Still in the air: let it land. Already landed: show it now.
        if (!s.done) return;
        seq.current = null;
        setHold(null);
        if (kind === 'pick') land(now.teamNames.indexOf(name));
        else popBan('mine');
        return;
      }
      if (s) cut();
      flyPlayed(name, kind);
    };

    const picked = now.teamNames.filter(n => !prev.teamNames.includes(n));
    if (picked.length === 1) settle(picked[0], 'pick');
    if (now.banMine && now.banMine !== prev.banMine) settle(now.banMine, 'ban');

    if (now.banTheirs && !prev.banTheirs) popBan('theirs');
    if (now.theirCount === prev.theirCount + 1) {
      const slot = prev.theirCount;
      setFlipped(slot);
      later(() => setFlipped(v => (v === slot ? null : v)), FLIP_MS);
    }

    // A new hand (the hands swapped, or the order step began): the old one slides off, the new one comes in.
    const swapped = now.step !== prev.step || now.handNames.some(n => !prev.handNames.includes(n));
    if (swapped) {
      setHold(null);
      if (old) {
        old.hand.querySelector('.draft-away')?.remove();
        const gone = new Set([...played, ...(seq.current ? [seq.current.name] : [])]);
        old.cards.forEach(({ el }, name) => {
          if (gone.has(name)) (el as HTMLElement).style.visibility = 'hidden';
        });
        const ghost = layGhost(old.hand, old.box, old.vars, `draft-hand--out${old.tiny ? ` ${GHOST_TINY}` : ''}`);
        if (ghost) later(() => ghost.remove(), OUT_MS);
      }
      showHandFx(now.step === 4 ? 'deal' : 'in');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, off, rejoins]);

  // First sight of the screen: deal the hand when the draft has only just begun. A refresh or a rejoin
  // part-way through shows the cards in place.
  useLayoutEffect(() => {
    alive.current = true;
    const pending = timers.current;
    let watch: MutationObserver | null = null;
    const first = latest.current;
    const { timer } = first.input;
    const untouched = first.now.step === 0 && !first.now.banMine && first.now.handNames.length > 0;
    if (!off && untouched && typeof document !== 'undefined') {
      const overlay = document.querySelector('.match-found:not(.match-found--leaving)');
      const justBegun = !timer || timer.deadline - Date.now() > timer.durationMs - 4000;
      if (overlay) {
        // "Match found" covers the table: hold the hand back and deal as it lifts.
        setHandFx('wait');
        let dealt = false;
        const deal = () => {
          if (dealt) return;
          dealt = true;
          watch?.disconnect();
          setHandFx(v => (v === 'wait' ? 'deal' : v));
          const token = ++fxToken.current;
          later(() => {
            if (fxToken.current === token) setHandFx(null);
          }, HAND_FX_MS);
        };
        watch = new MutationObserver(() => {
          if (!overlay.isConnected || overlay.classList.contains('match-found--leaving')) deal();
        });
        watch.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        if (overlay.parentNode) watch.observe(overlay.parentNode, { childList: true });
        later(deal, MATCH_FOUND_WAIT_MS);
      } else if (justBegun && performance.now() > 5000) {
        showHandFx('deal');
      }
    }
    return () => {
      alive.current = false;
      watch?.disconnect();
      pending.forEach(id => window.clearTimeout(id));
      pending.clear();
      cancelFlights();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Order step: note where the cards stand just before two of them trade places. */
  const noteOrder = () => {
    const table = root.current;
    if (off || !table) return;
    const from = new Map<string, Box>();
    table.querySelectorAll('.draft-hand:not(.draft-hand--ghost) > .draft-order-card').forEach(el => {
      const name = el.getAttribute('data-name');
      if (name) from.set(name, boxOf(el));
    });
    hopFrom.current = from;
  };

  /** Order step: after the swap is drawn, each moved card hops from its old place to its new one. */
  const hopOrder = useCallback(() => {
    const from = hopFrom.current;
    hopFrom.current = null;
    const table = root.current;
    if (!from || !table) return;
    table.querySelectorAll<HTMLElement>('.draft-hand:not(.draft-hand--ghost) > .draft-order-card').forEach(el => {
      const was = from.get(el.getAttribute('data-name') ?? '');
      if (!was || typeof el.animate !== 'function') return;
      el.getAnimations().forEach(a => {
        if (a.id === 'draft-hop') a.cancel();
      });
      const dx = was.left - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) return;
      const hop = el.animate(
        [{ transform: `translate(${dx}px, 0px)` }, { transform: 'translate(0px, -16px)', offset: 0.6 }, { transform: 'translate(0px, 0px)' }],
        { duration: HOP_MS, easing: 'cubic-bezier(.3,.8,.3,1)' },
      );
      hop.id = 'draft-hop';
    });
  }, [root]);

  // The sent card keeps its place in the hand (hidden) while its copy is in the air, so the other cards
  // stay put. Dropped the moment the server's hand stops matching it.
  const held = heldCard(hold, off, step, handNames);

  const attrs: Record<string, string | undefined> = {
    'data-hand': handFx ?? undefined,
    'data-fly-slot': flySlot === null ? undefined : String(flySlot + 1),
    'data-fly-ban': flyBan ? '' : undefined,
    'data-land': landed === null ? undefined : String(landed + 1),
    'data-flip': flipped === null ? undefined : String(flipped + 1),
    'data-pop': popMine && popTheirs ? 'both' : popMine ? 'mine' : popTheirs ? 'theirs' : undefined,
  };

  return { attrs, held, send, before, noteOrder, hopOrder };
}
