// Maps the old hard-coded colours, fonts and ALL-CAPS onto the table tokens.
// Usage: node scripts/retoken-css.mjs file.css [file2.css ...]   (rewrites in place)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseColour(text) {
  const t = text.trim();
  let m = /^#([0-9a-f]+)$/i.exec(t);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(([^)]*)\)$/i.exec(t);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const num = s => (s.endsWith('%') ? parseFloat(s) * 2.55 : parseFloat(s));
    const a = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    return { r: num(p[0]), g: num(p[1]), b: num(p[2]), a };
  }
  m = /^hsla?\(([^)]*)\)$/i.exec(t);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const h = parseFloat(p[0]) / 360;
    const s = parseFloat(p[1]) / 100;
    const l = parseFloat(p[2]) / 100;
    const a = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const k = 2 * l - q;
    const f = x => {
      const t2 = (x + 1) % 1;
      if (t2 < 1 / 6) return k + (q - k) * 6 * t2;
      if (t2 < 1 / 2) return q;
      if (t2 < 2 / 3) return k + (q - k) * (2 / 3 - t2) * 6;
      return k;
    };
    return s === 0
      ? { r: l * 255, g: l * 255, b: l * 255, a }
      : { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255, a };
  }
  return null;
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

export function tokenFor(r, g, b) {
  const { h, s, l } = toHsl(r, g, b);
  if (l < 0.07) return '--felt-deep';
  if (s < 0.18 || l < 0.28) {
    if (l >= 0.8) return '--bone';
    if (l >= 0.5) return '--bone-dim';
    if (l >= 0.32) return '--leather-hi';
    if (l >= 0.17) return '--leather';
    return '--walnut';
  }
  if (h >= 345 || h < 18) return l > 0.6 ? '--ember-hi' : '--ember';
  if (h < 70) return l > 0.45 ? '--brass-hi' : '--brass';
  if (h < 170) return '--verdigris';
  if (h < 300) return '--brass';
  return '--ember-hi';
}

export function retokenColour(text, { shadow = false } = {}) {
  const c = parseColour(text);
  if (!c) return text;
  const token = shadow ? '--felt-deep' : tokenFor(c.r, c.g, c.b);
  const pct = Math.round(c.a * 100);
  return pct >= 97 ? `var(${token})` : `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
}

const COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const NAMED = /\b(white|black)\b/g;
const COLOUR_PROP = /color|background|border|outline|fill|stroke|shadow|filter|^--/;
const SHADOW_PROP = /shadow|^filter$|^-webkit-filter$/;

export function retokenDeclaration(prop, value) {
  const p = prop.trim().toLowerCase();
  if (p === 'text-transform') return /uppercase/.test(value) ? 'none' : value;
  if (p === 'font-family') return /emoji/i.test(value) || /^\s*inherit/.test(value) ? value : 'var(--font-ui)';
  if (!COLOUR_PROP.test(p)) return value;
  const shadow = SHADOW_PROP.test(p);
  return value
    .replace(COLOUR, m => retokenColour(m, { shadow }))
    .replace(NAMED, m => retokenColour(m === 'white' ? '#ffffff' : '#000000', { shadow }));
}

export function retokenCss(css) {
  return css.replace(/([-a-zA-Z]+)(\s*:\s*)([^;{}]+)(?=[;}])/g, (all, prop, sep, value) => {
    const next = retokenDeclaration(prop, value);
    return next === value ? all : `${prop}${sep}${next}`;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    writeFileSync(file, retokenCss(readFileSync(file, 'utf8')));
    console.log(`retokened ${file}`);
  }
}
