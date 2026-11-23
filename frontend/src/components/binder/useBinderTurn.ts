// The page turn's timing. A turn mounts its leaf still (phase 'ready'), waits until the browser has laid the new
// pages out and decoded their art, moves the leaf (phase 'moving'), and only when it has landed tells the binder
// which spread is showing. Taps during a turn wait in a short queue.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cardMotionOff } from '../../cards/cardMotion';
import { playSound } from '../../sound';
import { queueTurn, turnTarget, type TurnDir } from './binderRules';

export const TURN_MS = 680;
const DECODE_CAP_MS = 150;   // slow art doesn't hold the leaf back longer than this
const LAND_SLACK_MS = 120;   // the leaf lands on animationend; this long after TURN_MS it lands anyway

export interface TurnState { from: number; to: number; dir: TurnDir; phase: 'ready' | 'moving' }

interface UseBinderTurnArgs {
  spread: number;
  spreads: number;
  viewKey: string; // changes when the filter, sort or search changes
  onSpreadChange: (s: number) => void;
  artFor: (spread: number) => string[]; // the image URLs on a spread
}

// A turn and the list it was started on. It only counts while the binder still shows that list and that spread.
interface Running { turn: TurnState; viewKey: string; spreads: number }

const stillShowing = (r: Running, now: UseBinderTurnArgs): boolean =>
  r.viewKey === now.viewKey && r.spreads === now.spreads && r.turn.from === now.spread;

const preloaded = new Set<string>();
function preload(url: string): void {
  if (preloaded.has(url) || typeof Image === 'undefined') return;
  preloaded.add(url);
  new Image().src = url;
}

function decode(url: string): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  const img = new Image();
  img.src = url;
  return typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
}

// Calls done once: two animation frames from now, and the art decoded or DECODE_CAP_MS gone by.
function whenReady(urls: string[], done: () => void): void {
  let frames = false;
  let art = false;
  let called = false;
  const check = () => {
    if (!frames || !art || called) return;
    called = true;
    done();
  };
  const artDone = () => { art = true; check(); };
  requestAnimationFrame(() => requestAnimationFrame(() => { frames = true; check(); }));
  void Promise.all(urls.map(decode)).then(artDone);
  window.setTimeout(artDone, DECODE_CAP_MS);
}

export default function useBinderTurn(a: UseBinderTurnArgs):
  { turn: TurnState | null; request: (dir: TurnDir) => void; land: () => void } {
  const { spread, spreads, viewKey, artFor } = a;
  const [running, setRunning] = useState<Running | null>(null);
  const runningRef = useRef<Running | null>(null); // the same value, for the callbacks
  const queue = useRef<TurnDir[]>([]);
  const runId = useRef(0);   // bumped whenever a turn ends, so a wait left over from it does nothing
  const landTimer = useRef<number>();
  const latest = useRef(a);
  latest.current = a;

  const set = useCallback((next: Running | null) => {
    runningRef.current = next;
    setRunning(next);
  }, []);

  const stop = useCallback(() => {
    runId.current++;
    window.clearTimeout(landTimer.current);
    queue.current = [];
    set(null);
  }, [set]);

  const landRef = useRef<() => void>(() => {});

  const start = useCallback((dir: TurnDir, from: number) => {
    const now = latest.current;
    const to = turnTarget(from, dir, now.spreads);
    const id = ++runId.current;
    window.clearTimeout(landTimer.current);
    const at = (phase: TurnState['phase']): Running =>
      ({ turn: { from, to, dir, phase }, viewKey: now.viewKey, spreads: now.spreads });
    set(at('ready'));
    whenReady(now.artFor(to), () => {
      if (runId.current !== id) return;
      set(at('moving'));
      playSound('binder.page');
      landTimer.current = window.setTimeout(() => landRef.current(), TURN_MS + LAND_SLACK_MS);
    });
  }, [set]);

  // The leaf has landed: show the new spread, then start the next turn in the queue from there.
  const land = useCallback(() => {
    const r = runningRef.current;
    if (!r || r.turn.phase !== 'moving') return;
    runId.current++;
    window.clearTimeout(landTimer.current);
    latest.current.onSpreadChange(r.turn.to);
    const [next, ...rest] = queue.current;
    queue.current = rest;
    if (next) start(next, r.turn.to);
    else set(null);
  }, [set, start]);
  landRef.current = land;

  const request = useCallback((dir: TurnDir) => {
    const now = latest.current;
    if (now.spreads < 2) return;
    const r = runningRef.current;
    const turning = !!r && stillShowing(r, now);
    if (cardMotionOff()) {
      if (r) stop();
      playSound('binder.page');
      now.onSpreadChange(turnTarget(now.spread, dir, now.spreads));
      return;
    }
    if (turning) {
      queue.current = queueTurn(queue.current, dir);
      return;
    }
    queue.current = [];
    start(dir, now.spread);
  }, [start, stop]);

  // The list changed under a turn (a new filter, sort or search, or a hero left the list): drop it and its queue.
  useEffect(() => {
    const r = runningRef.current;
    if (r && !stillShowing(r, latest.current)) stop();
  }, [viewKey, spreads, spread, stop]);

  useEffect(() => () => {
    runId.current++;
    window.clearTimeout(landTimer.current);
  }, []);

  // The spreads on either side are fetched ahead of time.
  useEffect(() => {
    if (spreads < 2) return;
    ([1, -1] as const).forEach(dir => artFor(turnTarget(spread, dir, spreads)).forEach(preload));
  }, [spread, spreads, artFor]);

  return { turn: running && stillShowing(running, a) ? running.turn : null, request, land };
}
