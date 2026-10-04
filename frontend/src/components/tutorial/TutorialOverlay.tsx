import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TutorialSkull from './TutorialSkull';
import { sfx } from '../../battleAnimations';
import '../../styles/Tutorial.css';

export interface OverlayStep {
  key: string;
  text: string | null;
  // CSS selectors tried in order; the first match is highlighted. No match = centered skull, nothing highlighted.
  target?: string[];
  // When true the highlighted element stays clickable; everything else is locked.
  interactive?: boolean;
  showNext?: boolean;
  nextLabel?: string;
  side?: 'auto' | Side;
  // Where the skull sits when there is no target
  anchor?: 'bottom' | 'center' | 'topleft';
  // Dim the screen when nothing is highlighted (default true)
  dim?: boolean;
}

const EMPTY_STEP: OverlayStep = { key: 'none', text: null };

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Rect { left: number; top: number; width: number; height: number }

interface TutorialOverlayProps {
  step: OverlayStep | null;
  onNext?: () => void;
  onSkip?: () => void;
}

const PAD = 6;
const ARROW_W = 56;
const ARROW_H = 40;
const GAP = 10;
const SPEAKER_GAP = 8;
const MARGIN = 8;

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

function useTypewriter(text: string | null, key: string) {
  // Tagged with the step key so a new step never inherits the previous step's progress
  const [typed, setTyped] = useState({ key: '', count: 0 });
  const timer = useRef<number | undefined>(undefined);
  const count = typed.key === key ? typed.count : 0;

  useEffect(() => {
    if (!text) return;
    let i = 0;
    timer.current = window.setInterval(() => {
      i++;
      setTyped({ key, count: i });
      if (text[i - 1] !== ' ' && i % 2 === 0) sfx.chatter();
      if (i >= text.length) window.clearInterval(timer.current);
    }, 28);
    return () => window.clearInterval(timer.current);
  }, [key, text]);

  const done = !text || count >= text.length;
  const finish = () => {
    if (!text) return;
    window.clearInterval(timer.current);
    setTyped({ key, count: text.length });
  };
  return { shown: text ? text.slice(0, count) : '', done, finish };
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ step: stepProp, onNext, onSkip }) => {
  const step = stepProp || EMPTY_STEP;
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState({ w: 380, h: 120 });
  const speakerRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef('');
  const targetKey = (step.target || []).join('\n');
  const { shown, done, finish } = useTypewriter(step.text, step.key);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const swallowClick = useRef(false);

  // Any press while the text is still being written completes it; that same click must not also trigger the UI underneath
  useEffect(() => {
    if (done) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.tut-skip')) return;
      finishRef.current();
      swallowClick.current = true;
      window.setTimeout(() => { swallowClick.current = false; }, 700);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [done]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  // The highlighted element only becomes clickable once the prompt has been fully shown
  const interactive = !!step.interactive && done;

  // Poll the target: cards animate and the layout shifts, so a one-off measurement goes stale
  useEffect(() => {
    const selectors = targetKey ? targetKey.split('\n') : [];
    const update = () => {
      let el: Element | null = null;
      for (const sel of selectors) {
        el = document.querySelector(sel);
        if (el) break;
      }
      if (el && scrolledFor.current !== step.key) {
        scrolledFor.current = step.key;
        (el as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      const r = el ? el.getBoundingClientRect() : null;
      const next = r && r.width > 0 && r.height > 0
        ? { left: r.left, top: r.top, width: r.width, height: r.height }
        : null;
      setRect(prev => (sameRect(prev, next) ? prev : next));
      setVp(prev => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
    };
    update();
    const id = window.setInterval(update, 100);
    return () => window.clearInterval(id);
  }, [step.key, targetKey]);

  useLayoutEffect(() => {
    const el = speakerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize(prev => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
  });

  const spot = rect && {
    left: rect.left - PAD,
    top: rect.top - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2
  };

  let side: Side = 'left';
  if (spot) {
    if (step.side && step.side !== 'auto') {
      side = step.side;
    } else {
      const space = {
        left: spot.left,
        right: vp.w - (spot.left + spot.width),
        top: spot.top,
        bottom: vp.h - (spot.top + spot.height)
      };
      const sideSpace = ARROW_W + GAP + SPEAKER_GAP + (step.text ? size.w : 0) + MARGIN;
      const vertSpace = ARROW_W + GAP + SPEAKER_GAP + (step.text ? size.h : 0) + MARGIN;
      const need = { left: sideSpace, right: sideSpace, top: vertSpace, bottom: vertSpace };
      const order: Side[] = ['left', 'right', 'top', 'bottom'];
      side = order.find(s => space[s] >= need[s]) || order.reduce((best, s) => (space[s] / need[s] > space[best] / need[best] ? s : best), 'left' as Side);
    }
  }

  // Visual centre of the arrow, then the skull sits beyond it
  let arrow: { left: number; top: number; cx: number; cy: number } | null = null;
  let speaker: { left: number; top: number } | null = null;
  if (spot) {
    const cx = spot.left + spot.width / 2;
    const cy = spot.top + spot.height / 2;
    const centres: Record<Side, [number, number]> = {
      left: [spot.left - GAP - ARROW_W / 2, cy],
      right: [spot.left + spot.width + GAP + ARROW_W / 2, cy],
      top: [cx, spot.top - GAP - ARROW_W / 2],
      bottom: [cx, spot.top + spot.height + GAP + ARROW_W / 2]
    };
    const [acx, acy] = centres[side];
    arrow = { left: acx - ARROW_W / 2, top: acy - ARROW_H / 2, cx: acx, cy: acy };

    const raw: Record<Side, [number, number]> = {
      left: [acx - ARROW_W / 2 - SPEAKER_GAP - size.w, acy - size.h / 2],
      right: [acx + ARROW_W / 2 + SPEAKER_GAP, acy - size.h / 2],
      top: [acx - size.w / 2, acy - ARROW_W / 2 - SPEAKER_GAP - size.h],
      bottom: [acx - size.w / 2, acy + ARROW_W / 2 + SPEAKER_GAP]
    };
    const [sx, sy] = raw[side];
    speaker = {
      left: Math.max(MARGIN, Math.min(sx, vp.w - size.w - MARGIN)),
      top: Math.max(MARGIN, Math.min(sy, vp.h - size.h - MARGIN))
    };
  }

  const blockers: React.CSSProperties[] = !spot
    ? [{ left: 0, top: 0, width: '100vw', height: '100vh' }]
    : interactive
      ? [
          { left: 0, top: 0, width: '100vw', height: Math.max(0, spot.top) },
          { left: 0, top: spot.top + spot.height, width: '100vw', height: Math.max(0, vp.h - spot.top - spot.height) },
          { left: 0, top: spot.top, width: Math.max(0, spot.left), height: spot.height },
          { left: spot.left + spot.width, top: spot.top, width: Math.max(0, vp.w - spot.left - spot.width), height: spot.height }
        ]
      : [{ left: 0, top: 0, width: '100vw', height: '100vh' }];

  const handleSkip = () => {
    if (window.confirm('Skip the tutorial? You will not receive the tutorial rewards.')) onSkip?.();
  };

  return createPortal(
    <>
      {stepProp && blockers.map((style, i) => (
        <div key={i} className={`tut-block${!spot && step.dim !== false ? ' dim' : ''}`} style={style} />
      ))}

      {stepProp && spot && <div className="tut-spot" style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }} />}

      {stepProp && arrow && (
        <div className={`tut-arrow side-${side}`} style={{ left: arrow.left, top: arrow.top }}>
          <svg width={ARROW_W} height={ARROW_H} viewBox="0 0 56 40">
            <path d="M2 14 H32 V3 L54 20 L32 37 V26 H2 Z" fill="#7cff6b" stroke="#e6ffe0" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {step.text && (
        <div
          ref={speakerRef}
          className={`tut-speaker${speaker ? '' : step.anchor === 'center' ? ' middle' : step.anchor === 'topleft' ? ' topleft' : ' centered'}`}
          style={speaker ? { left: speaker.left, top: speaker.top } : undefined}
        >
          <TutorialSkull talking={!done} />
          <div className="tut-bubble">
            <div className="tut-text">
              <span className="tut-full">{step.text}</span>
              <span className="tut-typed">{shown}</span>
            </div>
            {step.showNext && (
              <button
                className="tut-next"
                style={{ visibility: done ? 'visible' : 'hidden' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onNext?.();
                }}
              >
                {step.nextLabel || 'Next ▶'}
              </button>
            )}
          </div>
        </div>
      )}

      {onSkip && (
        <button className="tut-skip" onClick={handleSkip}>
          Skip tutorial
        </button>
      )}
    </>,
    document.body
  );
};

export default TutorialOverlay;
