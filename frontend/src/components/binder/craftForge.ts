// The forge: what plays in the binder once the server has confirmed a craft.
// Shards leave the balance, fly to the locked card and set on it as a shell of crystal; the shell heats from
// crystal-cold to white-hot; one strike breaks it off and the card underneath is owned and in colour; then the card
// flies to its pocket, which lights for a moment. Timings and moves are the approved mockup's
// (docs/superpowers/specs/2026-11-23-economy-core-mockup.html, section d).
//
// React draws the pieces (BinderLargeView the shell and its layers, HeroCollection the balance and the effects layer)
// and holds the state; this module only moves them. Every step
// runs on a timer, so the phases arrive on time whether or not the browser can animate.

/** One facet per shard that flies in. */
export const FORGE_SHARDS = 30;
const FIRST_SHARD_MS = 180;
const SHARD_GAP_MS = 26;
const SHARD_FLY_MS = 600;
const HEAT_MS = 900;
const FLIGHT_MS = 620;
/** The shell is whole and starts to heat. */
export const FORGE_SET_MS = FIRST_SHARD_MS + (FORGE_SHARDS - 1) * SHARD_GAP_MS + SHARD_FLY_MS + 120;
/** The strike: the shell bursts off and the card is in colour. */
export const FORGE_HIT_MS = FORGE_SET_MS + HEAT_MS;
/** "Crafted!" stamps in beside the card. */
export const FORGE_DONE_MS = FORGE_HIT_MS + 420;
/** The card leaves for its pocket. */
export const FORGE_HOME_MS = FORGE_HIT_MS + 1650;
/** The card is in its pocket and the pocket lights. */
export const FORGE_LAND_MS = FORGE_HOME_MS + FLIGHT_MS;
/** The pocket's light goes out: the forge is over. */
export const FORGE_END_MS = FORGE_LAND_MS + 900;

export type ForgePhase = 'shell' | 'struck' | 'done' | 'landed';

export interface ForgeFacet {
  points: string; // an SVG polygon's points, on the shell's own grid
  tone: 0 | 1 | 2 | 3;
  cx: number;
  cy: number;
}

export const SHELL_W = 260;
export const SHELL_H = 391;

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let shell: ForgeFacet[] | null = null;

/** The shell: the card's face cut into 30 jagged facets, in the order they set (the same cut every time). */
export function forgeShell(): ForgeFacet[] {
  if (shell) return shell;
  const r = mulberry(11);
  const cols = 3;
  const rows = 5;
  const pts: [number, number][] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      pts.push([i * SHELL_W / cols + (edgeX ? 0 : (r() - 0.5) * 46), j * SHELL_H / rows + (edgeY ? 0 : (r() - 0.5) * 42)]);
    }
  }
  const at = (i: number, j: number) => pts[j * (cols + 1) + i];
  const tris: [number, number][][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      if (r() < 0.5) tris.push([a, b, c], [a, c, d]);
      else tris.push([a, b, d], [b, c, d]);
    }
  }
  const order = tris.map((_, i) => [r(), i]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  shell = order.map(i => {
    const t = tris[i];
    return {
      points: t.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '),
      tone: Math.floor(r() * 4) as ForgeFacet['tone'],
      cx: (t[0][0] + t[1][0] + t[2][0]) / 3,
      cy: (t[0][1] + t[1][1] + t[2][1]) / 3,
    };
  });
  return shell;
}

const SPARK_TONES = {
  gold: ['--card-white', '--brass-hi', '--pack-spark', '--ember-spark'],
  shard: ['--card-white', '--shard-hot', '--shard', '--shard'],
  forge: ['--card-white', '--pack-light', '--ember-spark', '--shard-hot', '--brass-hi'],
};
const HOT_TONES = ['--pack-light', '--ember-glow', '--ember-spark', '--card-white', '--pack-glow'];
const JOLT = [[0, 0], [-7, 4], [6, -5], [-5, -3], [4, 4], [-2, 1], [0, 0]];
const JOLT_AT = [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1];

export interface ForgeRun {
  root: HTMLElement; // the binder
  hero: string;
  from: number; // the shard balance before the craft
  cost: number;
  onShards: (shown: number) => void; // the balance on show, counting down as the shards leave
  onPhase: (phase: ForgePhase) => void;
  onEnd: () => void;
}

interface Place { x: number; y: number; w: number; h: number; cx: number; cy: number }

/** Plays the forge over the binder's large view. Returns a stop that cuts it short and clears what it drew. */
export function playForge({ root, hero, from, cost, onShards, onPhase, onEnd }: ForgeRun): () => void {
  const timers: number[] = [];
  const running: Animation[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const at = (run: () => void, ms: number) => { timers.push(window.setTimeout(run, ms)); };
  // Every move goes through here: nothing happens where the browser cannot animate, and stop() can cancel it.
  const an = (el: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    if (!el || typeof el.animate !== 'function') return undefined;
    const animation = el.animate(frames, { fill: 'both', ...options });
    running.push(animation);
    return animation;
  };
  const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  const find = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);

  const fx = find('.binder-fx');
  const large = find('.binder-large');
  const wrap = find('.binder-large-cardwrap');
  const card = find('.binder-forge-card');
  const face = find('.binder-large-card');
  const layers = find('.binder-forge');
  const side = find('.binder-craft');
  const chip = find('.binder-shards');
  const dark = find('.binder-forge-dark');
  const gloss = find('.binder-forge-gloss');
  const heat = find('.binder-forge-heat');
  const white = find('.binder-forge-white');
  const glint = find('.binder-forge-glint');
  const polys = Array.from(root.querySelectorAll<SVGPolygonElement>('.binder-forge-shell polygon'));
  const facets = forgeShell();

  // Where something is, in the effects layer's own pixels
  const place = (el: Element | null): Place => {
    const o = fx?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const r = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2, cy: r.top - o.top + r.height / 2 };
  };
  const C = place(face);
  const source = place(chip);
  const sx = C.w / SHELL_W;
  const sy = C.h / SHELL_H;

  // The layers take the card's own corners and type size, so the crystal sits on the card exactly
  if (layers && face) {
    const drawn = getComputedStyle(face);
    layers.style.borderRadius = drawn.borderRadius;
    layers.style.fontSize = drawn.fontSize;
  }

  const sparks = (x: number, y: number, count: number, reach: number, tone: keyof typeof SPARK_TONES, up = 0) => {
    if (!fx || typeof fx.animate !== 'function') return;
    const tones = SPARK_TONES[tone];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('i');
      el.className = 'binder-spark';
      el.style.setProperty('--spark', `var(${tones[i % tones.length]})`);
      fx.appendChild(el);
      const a = rnd(0, Math.PI * 2);
      const dist = reach * rnd(0.3, 1);
      const flight = an(el, [
        { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x + Math.cos(a) * dist}px,${y + Math.sin(a) * dist - up * rnd(0.4, 1)}px) scale(.2)`, opacity: 0 },
      ], { duration: rnd(650, 1000), easing: 'cubic-bezier(.1,.7,.3,1)' });
      if (flight) flight.onfinish = () => el.remove();
    }
  };
  const jolt = (strength: number, ms: number) => an(root, JOLT.map(([x, y], i) => ({
    transform: x || y ? `translate(${x * strength}px,${y * strength}px)` : 'none', offset: JOLT_AT[i],
  })), { duration: ms, fill: 'none' });

  /* 1. the table darkens and the buttons step back */
  an(dark, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 300 });
  an(gloss, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 700 });
  an(chip, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, fill: 'none' });

  /* 2. thirty shards leave the balance, one after another, and each sets as a facet of crystal on the card */
  const crystal = chip?.querySelector('.shard-icon');
  facets.forEach((facet, i) => {
    const tx = C.x + facet.cx * sx;
    const ty = C.y + facet.cy * sy;
    at(() => {
      onShards(from - Math.round(cost * (i + 1) / FORGE_SHARDS));
      if (!fx || !crystal || typeof fx.animate !== 'function') return;
      const fly = document.createElement('span');
      fly.className = 'binder-fly';
      fly.appendChild(crystal.cloneNode(true));
      fx.appendChild(fly);
      // A thrown arc: out from the balance, round, and in
      const mx = (source.cx + tx) / 2 + rnd(-0.28, 0.28) * C.h;
      const my = (source.cy + ty) / 2 + rnd(-0.55, 0.35) * C.h;
      const spin = rnd(-540, 540);
      const frames: Keyframe[] = [];
      for (let s = 0; s <= 8; s++) {
        const u = s / 8;
        const x = (1 - u) * (1 - u) * source.cx + 2 * u * (1 - u) * mx + u * u * tx;
        const y = (1 - u) * (1 - u) * source.cy + 2 * u * (1 - u) * my + u * u * ty;
        frames.push({
          transform: `translate(${x}px,${y}px) rotate(${spin * u}deg) scale(${u < 0.2 ? 0.5 + u * 3.5 : 1.2 - (u - 0.2) * 0.4})`,
          opacity: s === 0 ? 0 : 1,
        });
      }
      const flight = an(fly, frames, { duration: SHARD_FLY_MS, easing: 'cubic-bezier(.45,0,.9,.6)' });
      if (flight) flight.onfinish = () => fly.remove();
    }, FIRST_SHARD_MS + i * SHARD_GAP_MS);
    at(() => {
      an(polys[i], [
        { opacity: 0, filter: 'brightness(3.2)' },
        { opacity: 1, filter: 'brightness(2.2)', offset: 0.3 },
        { opacity: 1, filter: 'brightness(1)' },
      ], { duration: 320 });
      sparks(tx, ty, 3, C.h * 0.09, 'shard');
      an(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.012)' }, { transform: 'scale(1)' }], { duration: 110, fill: 'none' });
    }, FIRST_SHARD_MS + i * SHARD_GAP_MS + SHARD_FLY_MS);
  });

  /* 3. the heat: crystal-cold to white-hot, the card shaking harder as it goes */
  at(() => {
    const hot = HOT_TONES.map(name => `color-mix(in srgb, ${token(name)} 90%, transparent)`);
    const whiteHot = token('--card-white');
    polys.forEach((p, i) => an(p, [{ fill: hot[i % hot.length], stroke: whiteHot }], { duration: HEAT_MS * rnd(0.55, 0.95), easing: 'ease-in' }));
    an(gloss, [{ opacity: 1 }, { opacity: 0 }], { duration: HEAT_MS });
    an(heat, [{ opacity: 0 }, { opacity: 0.3, offset: 0.6 }, { opacity: 0.7 }], { duration: HEAT_MS, easing: 'ease-in' });
    an(card, [0, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 0].map((deg, i) => ({ transform: `rotate(${deg}deg) scale(${1 + i * 0.006})` })),
      { duration: HEAT_MS, easing: 'linear' });
    an(layers, [
      { boxShadow: `0 0 0 0 ${token('--shard')}` },
      { boxShadow: `0 0 26px 6px ${token('--shard')}`, offset: 0.35 },
      { boxShadow: `0 0 44px 14px ${token('--ember-glow')}`, offset: 0.8 },
      { boxShadow: `0 0 70px 26px ${token('--pack-light')}` },
    ], { duration: HEAT_MS, easing: 'ease-in' });
    for (let e = 0; e < 5; e++) {
      at(() => sparks(C.cx + rnd(-0.4, 0.4) * C.w, C.y + C.h * rnd(0.55, 1), 4, C.h * 0.16, 'forge', C.h * 0.5), e * 130);
    }
  }, FORGE_SET_MS);
  // Two lighter blows land while it heats; the third is the one that breaks the shell
  const blow = () => {
    an(wrap, [{ transform: 'scale(1)' }, { transform: 'scale(.955)', offset: 0.25 }, { transform: 'scale(1.02)', offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: 240, fill: 'none' });
    sparks(C.cx, C.cy, 16, C.h * 0.6, 'forge');
    jolt(0.4, 260);
  };
  at(blow, FORGE_SET_MS + 300);
  at(blow, FORGE_SET_MS + 600);

  /* 4. the strike: the shell bursts off and the card is owned */
  at(() => {
    card?.getAnimations?.().forEach(a => a.cancel());
    layers?.getAnimations?.().forEach(a => a.cancel());
    onPhase('struck');
    an(white, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
    an(heat, [{ opacity: 0.7 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    an(card, [{ transform: 'scale(1.07)' }, { transform: 'scale(1.17)', offset: 0.28 }, { transform: 'scale(.985)', offset: 0.7 }, { transform: 'scale(1)' }],
      { duration: 620, easing: 'ease-out', fill: 'none' });
    an(layers, [{ boxShadow: `0 0 70px 26px ${token('--pack-light')}` }, { boxShadow: `0 0 0 0 ${token('--pack-glow')}` }],
      { duration: 620, easing: 'ease-out', fill: 'none' });
    polys.forEach((p, i) => {
      const px = facets[i].cx - SHELL_W / 2;
      const py = facets[i].cy - SHELL_H / 2;
      const len = Math.hypot(px, py) || 1;
      const far = rnd(150, 330);
      an(p, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1.4)' },
        { transform: `translate(${px / len * far}px,${py / len * far + 40}px) rotate(${rnd(-260, 260)}deg) scale(.35)`, opacity: 0, filter: 'brightness(1)' },
      ], { duration: rnd(520, 780), easing: 'cubic-bezier(.1,.6,.3,1)' });
    });
    if (fx && typeof fx.animate === 'function') {
      const centre = `translate(${C.cx}px,${C.cy}px)`;
      const bloom = document.createElement('div');
      const ring = document.createElement('div');
      bloom.className = 'binder-forge-bloom';
      ring.className = 'binder-forge-ring';
      [bloom, ring].forEach(el => {
        el.style.width = el.style.height = `${C.h}px`;
        el.style.margin = `${-C.h / 2}px`;
        fx.appendChild(el);
      });
      const blooming = an(bloom, [{ transform: `${centre} scale(.3)`, opacity: 0.9 }, { transform: `${centre} scale(2.6)`, opacity: 0 }], { duration: 700, easing: 'ease-out' });
      const ringing = an(ring, [{ transform: `${centre} scale(.25)`, opacity: 1 }, { transform: `${centre} scale(2.4)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.1,.6,.3,1)' });
      if (blooming) blooming.onfinish = () => bloom.remove();
      if (ringing) ringing.onfinish = () => ring.remove();
    }
    sparks(C.cx, C.cy, 56, C.h * 0.95, 'forge');
    jolt(1, 400);
    an(dark, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 500 });
  }, FORGE_HIT_MS);
  at(() => an(glint, [{ opacity: 1, backgroundPosition: '130% 0' }, { opacity: 1, backgroundPosition: '-70% 0' }],
    { duration: 650, easing: 'ease-in-out', fill: 'none' }), FORGE_HIT_MS + 300);
  at(() => onPhase('done'), FORGE_DONE_MS);

  /* 5. home: the card flies to its pocket, and the pocket lights */
  let pocket: HTMLElement | null = null;
  at(() => {
    pocket = Array.from(root.querySelectorAll<HTMLElement>('.binder-pocket')).find(p => p.getAttribute('aria-label') === hero) ?? null;
    const small = pocket?.querySelector('.binder-card') ?? null;
    an(side, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    if (large) an(large, [{ backgroundColor: getComputedStyle(large).backgroundColor }, { backgroundColor: 'transparent' }], { duration: FLIGHT_MS * 0.7 });
    if (!pocket || !small || !wrap) {
      an(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: FLIGHT_MS });
      return;
    }
    // The pocket waits empty for its card: no padlock, nothing in it
    pocket.dataset.forge = 'arriving';
    const to = place(small);
    const s = C.w > 0 ? to.w / C.w : 1;
    wrap.style.transformOrigin = '0 0';
    an(wrap, [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${(to.x - C.x) * 0.45}px,${(to.y - C.y) * 0.45 - C.h * 0.06}px) scale(${1 - (1 - s) * 0.4})`, offset: 0.45 },
      { transform: `translate(${to.x - C.x}px,${to.y - C.y}px) scale(${s})` },
    ], { duration: FLIGHT_MS, easing: 'cubic-bezier(.5,0,.3,1)' });
  }, FORGE_HOME_MS);
  at(() => {
    onPhase('landed');
    if (!pocket) return;
    delete pocket.dataset.forge;
    const small = pocket.querySelector('.binder-card');
    const to = place(small);
    sparks(to.cx, to.cy, 18, to.h * 0.8, 'gold');
    an(small, [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out', fill: 'none' });
  }, FORGE_LAND_MS);
  at(onEnd, FORGE_END_MS);

  return () => {
    timers.forEach(id => window.clearTimeout(id));
    running.forEach(animation => animation.cancel());
    fx?.replaceChildren();
    if (pocket) delete pocket.dataset.forge;
    if (wrap) wrap.style.transformOrigin = '';
  };
}
