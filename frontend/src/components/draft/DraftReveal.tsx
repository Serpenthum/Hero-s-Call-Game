import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hero } from '../../types';
import HeroCard from '../HeroCard';
import { getAnimSpeed } from '../../battleAnimations';
import type { Box } from '../../draft/flyCard';
import {
  RevealStage,
  cardDelayMs,
  centredRowOffset,
  faceOffLineY,
  hurryStage,
  revealStage,
  sameBoxes,
} from '../../draft/revealRules';
import { isSkipKey } from '../lobby/MatchFoundOverlay';
import '../../styles/DraftReveal.css';

interface RevealSide {
  id: string;
  team: Hero[];
}

interface DraftRevealProps {
  me: RevealSide;
  them: RevealSide;
  /** The battle has begun under the reveal (the roll winner chose at once): end quickly, without a jump. */
  hurry?: boolean;
  onDone(): void;
}

interface Measured {
  them: Box[];
  me: Box[];
  themDx: number;
  meDx: number;
  lineY: number;
}

// While the reveal's copies are on screen the board's own cards and the Starting Roll box are hidden
// (still laid out, so they can be measured), and the board's panels, name plates and row colours wait
// out of sight until the glide, when they build up around the copies. DraftReveal.css reads this from
// the page root: `on` (face-off), `board` (the glide), `hurry` (a quick end), `done` (played through).
const ROOT_ATTR = 'data-draft-reveal';
/** A hurried end: every card copy still dropping in has landed this long before the overlay goes. */
const HURRY_SETTLE_MS = 40;
/** How long the Starting Roll box takes to fade in once the reveal has played through (DraftReveal.css). */
const ROLL_IN_MS = 350;
/** The board must hold still for this many frames in a row before the copies are drawn on it. */
const STEADY_FRAMES = 3;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The board's cards for one side, in team order; null until every one of them is drawn. */
function measureSide(side: RevealSide): Box[] | null {
  const boxes: Box[] = [];
  for (let i = 0; i < side.team.length; i++) {
    const el = Array.from(document.querySelectorAll('.battle-layout [data-anim-key]')).find(
      node => node.getAttribute('data-anim-key') === `${side.id}:${i}`,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    boxes.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return boxes.length > 0 ? boxes : null;
}

function measureBoard(me: RevealSide, them: RevealSide): Measured | null {
  const theirs = measureSide(them);
  const mine = measureSide(me);
  if (!theirs || !mine) return null;
  return {
    them: theirs,
    me: mine,
    themDx: centredRowOffset(theirs, window.innerWidth),
    meDx: centredRowOffset(mine, window.innerWidth),
    lineY: faceOffLineY(theirs, mine, window.innerHeight),
  };
}

// The reveal: the battle board is already drawn underneath. Copies of its six cards face off in the
// middle of the screen, VS slams between them, then both rows glide onto the board's own cards while the
// backdrop fades and the board's panels slide in. It never holds the game back: the state is already
// `initiative`, and a tap (or Escape, Enter, Space) ends it at once. With animations off it is a 0.3 s fade.
// If the battle begins while it is up, it lets every tap through and hurries to its end.
const DraftReveal: React.FC<DraftRevealProps> = ({ me, them, hurry = false, onDone }) => {
  const [still] = useState(() => getAnimSpeed() === 'off' || reducedMotion());
  const [stage, setStage] = useState<RevealStage>(still ? 'fade' : 'wait');
  const [measured, setMeasured] = useState<Measured | null>(null);
  const latest = useRef({ me, them, onDone });
  latest.current = { me, them, onDone };
  const finished = useRef(false);
  const overlay = useRef<HTMLDivElement>(null);
  const stageNow = useRef(stage);
  stageNow.current = stage;
  /** Set once the reveal is hurrying: the timeline below stops and this takes over. */
  const hurrying = useRef<{ stage: RevealStage; ms: number } | null>(null);

  /** Ends the reveal. `played`: it ran to its end, so the Starting Roll box fades in instead of popping. */
  const finish = (played: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const root = document.documentElement;
    if (played) {
      root.setAttribute(ROOT_ATTR, 'done');
      window.setTimeout(() => {
        if (root.getAttribute(ROOT_ATTR) === 'done') root.removeAttribute(ROOT_ATTR);
      }, ROLL_IN_MS);
    } else {
      root.removeAttribute(ROOT_ATTR);
    }
    latest.current.onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // The board's cards and roll box stay hidden for as long as the copies stand in for them; the rest of
  // the board builds up during the glide.
  const cover = stage === 'wait' || stage === 'faceoff' ? 'on' : stage === 'board' || stage === 'hurry' ? stage : null;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!cover) return;
    root.setAttribute(ROOT_ATTR, cover);
    return () => {
      if (root.getAttribute(ROOT_ATTR) === cover) root.removeAttribute(ROOT_ATTR);
    };
  }, [cover]);

  // The battle began under the reveal. Mid face-off: the rows go to their battle cards in 0.3 s and any
  // copy still dropping in is sped up to land in that time. Nothing drawn yet: a 0.3 s fade. Already
  // gliding or fading: it carries on to its own end.
  useLayoutEffect(() => {
    if (!hurry) return;
    if (!hurrying.current) {
      const plan = hurryStage(stageNow.current);
      if (!plan) return;
      hurrying.current = plan;
      setStage(plan.stage);
      if (plan.stage === 'hurry') {
        const landIn = plan.ms - HURRY_SETTLE_MS;
        overlay.current?.querySelectorAll('.draft-reveal-card').forEach(card => {
          card.getAnimations().forEach(anim => {
            const end = Number(anim.effect?.getComputedTiming().endTime ?? 0);
            const left = end - Number(anim.currentTime ?? 0);
            if (left > landIn) anim.updatePlaybackRate(left / landIn);
          });
        });
      }
    }
    const timer = window.setTimeout(() => finishRef.current(false), hurrying.current.ms);
    return () => window.clearTimeout(timer);
  }, [hurry]);

  // One clock for the whole reveal: measure the board until it holds still, then follow the timeline.
  useEffect(() => {
    const start = performance.now();
    let measuredAt: number | null = null;
    let last: Box[] | null = null;
    let steady = 0;
    let shown: RevealStage | null = null;
    let frame = 0;
    let timer = 0;
    // Each step runs on the next frame, or after a short wait where frames are held back (a hidden tab),
    // so the reveal always ends on time.
    const schedule = () => {
      frame = window.requestAnimationFrame(tick);
      timer = window.setTimeout(tick, 100);
    };
    const unschedule = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };

    const tick = () => {
      unschedule();
      if (hurrying.current) return;
      const elapsed = performance.now() - start;
      if (!still && measuredAt === null) {
        const board = measureBoard(latest.current.me, latest.current.them);
        const boxes = board ? [...board.them, ...board.me] : null;
        steady = board && sameBoxes(last, boxes) ? steady + 1 : 0;
        last = boxes;
        if (board && steady >= STEADY_FRAMES) {
          measuredAt = elapsed;
          setMeasured(board);
        }
      }
      const next = revealStage(still, measuredAt, elapsed);
      if (next === 'done') {
        finishRef.current(measuredAt !== null);
        return;
      }
      if (next !== shown) {
        shown = next;
        setStage(next);
      }
      schedule();
    };
    schedule();

    const onKey = (e: KeyboardEvent) => {
      if (isSkipKey(e.key)) finishRef.current(false);
    };
    // A turned or resized screen moves the board under the copies: go straight to it.
    const onResize = () => finishRef.current(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      unschedule();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [still]);

  const row = (side: RevealSide, boxes: Box[], dx: number, theirs: boolean) => (
    <div
      className={`draft-reveal-row draft-reveal-row--${theirs ? 'them' : 'me'}`}
      style={{ '--draft-reveal-dx': `${dx}px` } as React.CSSProperties}
    >
      {side.team.map((hero, i) => {
        const box = boxes[i];
        if (!box) return null;
        return (
          <div
            key={`${hero.name}-${i}`}
            className="draft-reveal-card"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              animationDelay: `${cardDelayMs(i)}ms`,
              '--hero-card-scale': box.width / 260,
            } as React.CSSProperties}
          >
            <HeroCard hero={hero} isEnemy={theirs} holo={!!hero.holo} readable="none" disableHPAnimations />
          </div>
        );
      })}
    </div>
  );

  const showCopies = !!measured && (stage === 'faceoff' || stage === 'board' || stage === 'hurry');

  return (
    <div
      ref={overlay}
      className={`draft-reveal draft-reveal--${stage}${hurry ? ' draft-reveal--passing' : ''}`}
      role="presentation"
      data-stage={stage}
      onClick={() => finish(false)}
    >
      {showCopies && measured && (
        <>
          {row(them, measured.them, measured.themDx, true)}
          {row(me, measured.me, measured.meDx, false)}
          <div className="draft-reveal-line" style={{ top: measured.lineY }} aria-hidden="true" />
          <div className="draft-reveal-vs" style={{ top: measured.lineY }} aria-hidden="true">VS</div>
          <div className="draft-reveal-flash" aria-hidden="true" />
        </>
      )}
    </div>
  );
};

export default DraftReveal;
