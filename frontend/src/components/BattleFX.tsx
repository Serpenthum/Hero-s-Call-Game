import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BattleEvent,
  CastType,
  battleEventBus,
  getAnimSpeed,
  speedFactor,
  sfx
} from '../battleAnimations';
import '../styles/BattleFX.css';

interface BattleFXProps {
  gameOverResult: 'victory' | 'defeat' | 'neutral' | null;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; gravity: number;
}

const CAST_COLORS: Record<CastType, string> = {
  damage: '#ff6a3d',
  heal: '#4ade80',
  buff: '#facc15',
  debuff: '#a855f7',
  summon: '#60a5fa',
  generic: '#e5e7eb'
};

const CONFETTI = ['#facc15', '#f87171', '#60a5fa', '#4ade80', '#c084fc'];

// Total input-lock time per event, in ms at normal speed.
const LOCK_MS = { attack: 650, ability: 800, tick: 600 };

const POISON_GREEN = '#84cc16';

const BattleFX: React.FC<BattleFXProps> = ({ gameOverResult }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTime = useRef(0);
  const timers = useRef<number[]>([]);
  const [locked, setLocked] = useState(false);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // ---- Particles (single lightweight canvas, runs only while particles exist) ----
  const step = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { rafRef.current = null; return; }
    const dt = Math.min(0.05, (time - lastTime.current) / 1000 || 0.016);
    lastTime.current = time;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.current = particles.current.filter(p => p.life > 0);
    for (const p of particles.current) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    rafRef.current = particles.current.length > 0 ? requestAnimationFrame(step) : null;
  }, []);

  const burst = useCallback((x: number, y: number, colors: string[], count: number, opts: { speed?: number; gravity?: number; up?: boolean; life?: number; angle?: number; spread?: number } = {}) => {
    const { speed: s = 180, gravity = 300, up = false, life = 0.7, angle: baseAngle, spread = 0.4 } = opts;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle !== undefined
        ? baseAngle + (Math.random() - 0.5) * spread
        : up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      const v = s * (0.4 + Math.random() * 0.8);
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life, max: life,
        size: 2 + Math.random() * 3,
        color: colors[i % colors.length],
        gravity
      });
    }
    if (rafRef.current === null) {
      lastTime.current = performance.now();
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ---- DOM helpers ----
  const collectNodes = () => {
    const nodes = new Map<string, HTMLElement>();
    document.querySelectorAll<HTMLElement>('[data-anim-key]').forEach(n => nodes.set(n.dataset.animKey as string, n));
    return nodes;
  };

  const center = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
  };

  const floatText = (el: HTMLElement, text: string, color: string, big: boolean, f: number, drift = 0) => {
    const { x, top } = center(el);
    const div = document.createElement('div');
    div.className = 'battle-fx-float';
    div.textContent = text;
    div.style.left = `${x}px`;
    div.style.top = `${top + 24}px`;
    div.style.color = color;
    div.style.fontSize = big ? '36px' : '24px';
    document.body.appendChild(div);
    const anim = div.animate(
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${drift * 0.3}px), -18px) scale(1.15)`, opacity: 1, offset: 0.2 },
        { transform: `translate(calc(-50% + ${drift}px), -70px) scale(1)`, opacity: 0 }
      ],
      { duration: 1000 * f, easing: 'ease-out' }
    );
    anim.onfinish = () => div.remove();
    // Guard against a paused/hidden tab leaving stray nodes.
    later(() => div.remove(), 1500);
  };

  const shake = (el: HTMLElement, f: number, strong: boolean) => {
    const d = strong ? 10 : 6;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${-d}px)` },
        { transform: `translateX(${d}px)` },
        { transform: `translateX(${-d * 0.6}px)` },
        { transform: `translateX(${d * 0.6}px)` },
        { transform: 'translateX(0)' }
      ],
      { duration: 320 * f, easing: 'ease-out' }
    );
    el.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.8) sepia(1) hue-rotate(-50deg) saturate(5)', offset: 0.3 },
        { filter: 'brightness(1)' }
      ],
      { duration: 380 * f }
    );
  };

  const glow = (el: HTMLElement, rgb: string, f: number) => {
    el.animate(
      [
        { boxShadow: `0 0 0 0 rgba(${rgb}, 0)` },
        { boxShadow: `0 0 28px 10px rgba(${rgb}, 0.9)`, offset: 0.4 },
        { boxShadow: `0 0 0 0 rgba(${rgb}, 0)` }
      ],
      { duration: 600 * f }
    );
  };

  const hexToRgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  };

  const liftAndRestore = (el: HTMLElement, ms: number) => {
    const prev = el.style.zIndex;
    el.style.zIndex = '60';
    later(() => { el.style.zIndex = prev; }, ms);
  };

  // ---- Event playback ----
  const play = useCallback((ev: BattleEvent) => {
    const currentSpeed = getAnimSpeed();
    if (currentSpeed === 'off') return;
    const f = speedFactor(currentSpeed);
    const nodes = collectNodes();
    const actorEl = ev.actor ? nodes.get(ev.actor.key) : undefined;
    const cast: CastType = ev.cast || 'generic';
    const color = CAST_COLORS[cast];
    // Random side for the dodge and the attacker's whiff.
    const dodgeDir = Math.random() < 0.5 ? -1 : 1;

    // Primary enemy target: first damaged target, or by name for a missed attack.
    let primaryEl: HTMLElement | undefined;
    for (const t of ev.targets) {
      if (t.delta < 0 && t.key !== ev.actor?.key) { primaryEl = nodes.get(t.key); break; }
    }
    if (!primaryEl && ev.targetName && ev.actor) {
      for (const [key, node] of Array.from(nodes.entries())) {
        if (node.dataset.heroName === ev.targetName && !key.startsWith(`${ev.actor.playerId}:`)) {
          primaryEl = node;
          break;
        }
      }
    }

    setLocked(true);
    later(() => setLocked(false), LOCK_MS[ev.kind] * f);

    let impactDelay: number;

    if (ev.kind === 'attack') {
      impactDelay = 160 * f;
      sfx.swing();
      if (actorEl && primaryEl && actorEl !== primaryEl) {
        const a = center(actorEl);
        const b = center(primaryEl);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        liftAndRestore(actorEl, (ev.hit ? 450 : 520) * f);
        const lunge = ev.hit
          ? [
              { transform: 'translate(0, 0) scale(1)' },
              { transform: `translate(${-dx * 0.05}px, ${-dy * 0.05}px) scale(1.02)`, offset: 0.2 },
              { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(1.1)`, offset: 0.5 },
              { transform: 'translate(0, 0) scale(1)' }
            ]
          // Whiff: swings through empty air, overshoots, then stumbles back.
          : [
              { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
              { transform: `translate(${-dx * 0.05}px, ${-dy * 0.05}px) scale(1.02) rotate(0deg)`, offset: 0.2 },
              { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(1.08) rotate(${dodgeDir * 9}deg)`, offset: 0.5 },
              { transform: `translate(${dx * 0.2}px, ${dy * 0.2}px) scale(1) rotate(${-dodgeDir * 4}deg)`, offset: 0.75 },
              { transform: 'translate(0, 0) scale(1) rotate(0deg)' }
            ];
        actorEl.animate(lunge, { duration: (ev.hit ? 420 : 500) * f, easing: 'ease-in-out' });
      }
    } else if (ev.kind === 'tick') {
      impactDelay = 80 * f;
    } else {
      impactDelay = 300 * f;
      if (cast === 'heal') sfx.heal(); else sfx.cast();
      if (actorEl) {
        glow(actorEl, hexToRgb(color), f);
        const { x, y } = center(actorEl);
        burst(x, y, [color, '#ffffff'], 14, { speed: 90, gravity: -60, up: true, life: 0.8 });
        if (cast === 'summon') {
          actorEl.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }],
            { duration: 450 * f }
          );
        }
      }
    }

    later(() => {
      const sparkCount = ev.crit ? 24 : 12;

      if (ev.kind !== 'tick' && !ev.hit && primaryEl) {
        sfx.miss();
        const { x, y } = center(primaryEl);
        // Target sidesteps and briefly ghosts out of the way.
        primaryEl.animate(
          [
            { transform: 'translateX(0) rotate(0deg) scale(1)' },
            { transform: `translateX(${dodgeDir * 38}px) rotate(${dodgeDir * 7}deg) scale(0.95)`, offset: 0.35 },
            { transform: `translateX(${dodgeDir * 38}px) rotate(${dodgeDir * 7}deg) scale(0.95)`, offset: 0.65 },
            { transform: 'translateX(0) rotate(0deg) scale(1)' }
          ],
          { duration: 480 * f, easing: 'ease-out' }
        );
        primaryEl.animate([{ opacity: 1 }, { opacity: 0.55, offset: 0.35 }, { opacity: 1 }], { duration: 480 * f });
        // Grey wind streak that passes through where the target was.
        const from = actorEl ? center(actorEl) : { x, y: y - 200 };
        burst(x, y, ['#ffffff', '#cbd5e1', '#94a3b8'], 10, {
          speed: 380, gravity: 0, life: 0.35, angle: Math.atan2(y - from.y, x - from.x), spread: 0.25
        });
        floatText(primaryEl, 'Miss', '#94a3b8', false, f, dodgeDir * 30);
      }

      let anyDamage = false;
      for (const t of ev.targets) {
        const el = nodes.get(t.key);
        if (!el) continue;
        const { x, y } = center(el);

        if (t.delta < 0 && t.poisoned) {
          anyDamage = true;
          glow(el, hexToRgb(POISON_GREEN), f);
          burst(x, y + 40, [POISON_GREEN, '#22c55e', '#a3e635'], 14, { speed: 70, gravity: -70, up: true, life: 0.9 });
          floatText(el, `${t.delta}`, POISON_GREEN, false, f);
        } else if (t.delta < 0) {
          anyDamage = true;
          shake(el, f, ev.crit);
          burst(x, y, ev.kind === 'attack' ? ['#ffffff', '#fde68a'] : [color, '#ffffff'], sparkCount, { speed: 220 });
          floatText(el, `${t.delta}${ev.crit ? '!' : ''}`, '#ff4d4d', ev.crit, f);
        } else if (t.delta > 0) {
          glow(el, hexToRgb(CAST_COLORS.heal), f);
          burst(x, y + 40, [CAST_COLORS.heal, '#ffffff'], 12, { speed: 80, gravity: -80, up: true, life: 0.9 });
          floatText(el, `+${t.delta}`, CAST_COLORS.heal, false, f);
        }

        if (cast === 'buff' || cast === 'debuff') {
          if (t.statusesAdded.length > 0) {
            glow(el, hexToRgb(color), f);
            floatText(el, t.statusesAdded[0].replace(/_/g, ' '), color, false, f);
          }
        }

        if (t.died) {
          later(() => {
            sfx.death();
            el.animate(
              [
                { opacity: 1, transform: 'scale(1)', filter: 'none' },
                { opacity: 0.5, transform: 'scale(0.9) rotate(-2deg)', filter: 'grayscale(1) brightness(0.6)' }
              ],
              { duration: 500 * f }
            );
            burst(x, y, ['#6b7280', '#9ca3af', '#374151'], 18, { speed: 120, gravity: 200, life: 0.9 });
          }, 250 * f);
        } else if (t.revived) {
          burst(x, y, ['#fde047', '#ffffff'], 24, { speed: 150, gravity: -100, up: true, life: 1 });
        }
      }

      if (anyDamage) {
        sfx.hit(ev.crit);
        if (ev.crit) {
          // Shake .game-board, not .battle-layout: a transform on the layout would drag the fixed action bar with it.
          // Offsets stay negative so the scrollable overflow never grows (no scrollbar flash).
          document.querySelector('.game-board')?.animate(
            [
              { transform: 'translate(0, 0)' },
              { transform: 'translate(-5px, -3px)' },
              { transform: 'translate(0, 0)' },
              { transform: 'translate(-4px, -2px)' },
              { transform: 'translate(0, 0)' }
            ],
            { duration: 300 * f }
          );
        }
      }
    }, impactDelay);
  }, [burst]);

  useEffect(() => battleEventBus.subscribe(play), [play]);

  // ---- Victory / defeat cinematic ----
  useEffect(() => {
    if (!gameOverResult || getAnimSpeed() === 'off') return;
    const f = speedFactor(getAnimSpeed());
    later(() => {
      if (gameOverResult === 'victory') {
        sfx.win();
        for (let i = 0; i < 5; i++) {
          later(() => burst(window.innerWidth * (0.15 + i * 0.175), window.innerHeight * 0.3, CONFETTI, 30, { speed: 300, gravity: 500, life: 1.6 }), i * 120);
        }
      } else if (gameOverResult === 'defeat') {
        sfx.lose();
        burst(window.innerWidth / 2, window.innerHeight * 0.5, ['#4b5563', '#6b7280', '#1f2937'], 40, { speed: 160, gravity: 120, life: 1.6 });
      }
    }, 800 * f);
  }, [gameOverResult, burst]);

  useEffect(() => () => {
    timers.current.forEach(t => window.clearTimeout(t));
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="battle-fx-canvas" />
      {locked && <div className="battle-fx-lock" />}
    </>
  );
};

export default BattleFX;
