#!/usr/bin/env node
// Binder readability audit (dev only, not shipped). Opens the dev binder (/#screens/binder) in a headless browser at
// each screen size and flags: a pocket card under the size's floor, a hero name under 11px on a sideways phone, the
// book, the filter button, the open filter panel, the status line, the close button or the arrows cut off or lying
// over each other, text that leaves its box or overlaps other text, and a page that scrolls sideways. It saves a
// screenshot of every state for the owner. With --turns it times the page turn instead (see below).
//
// Needs playwright-core (not a dependency of this repo): set PLAYWRIGHT_CORE to its folder, or have it resolvable.
// The dev binder fetches the hero list from the local backend (wrangler dev, port 8787).
//
//   node scripts/audit-binder.mjs --base http://127.0.0.1:5173 --shots ../.superpowers/sdd/x/owner-shots
//   node scripts/audit-binder.mjs --base http://127.0.0.1:4173 --api-cors --turns
//
// The dev screens only exist in a dev build, so to time the turn on a production build, build one with only that
// gate opened and the local backend, add the art, and preview it (React and the bundle stay production):
//   VITE_API_BASE_URL=http://127.0.0.1:8787 OUT=<dir> node --input-type=module -e "import { build } from 'vite';
//     await build({ define: { 'import.meta.env.DEV': 'true' }, build: { outDir: process.env.OUT, emptyOutDir: true } });"
//   cp -r hero-images <dir>/ && npx vite preview --port 4173 --outDir <dir>
//
// Options:
//   --base URL      the running frontend (vite dev, or vite preview of a production build)
//   --sizes LIST    default 640x360,740x360,844x390,1280x720,1920x1080
//   --shots DIR     save a screenshot per state and size, named <size>-<state>.png
//   --api-cors      answer the backend's requests through Playwright with an open CORS header. The backend only
//                   allows the dev server's origin, so a vite preview on another port needs this.
//   --turns         time the page turn instead: per size (default 740x360,1280x720) 5 turns each on a fresh
//                   browser and page load, then 5 warm turns on the last page. Reports the largest gap between
//                   requestAnimationFrame timestamps from the tap to the landing; a gap over 34 ms is a finding.
//   --css TEXT      add this stylesheet after the binder opens (to prove the audit catches a fault)
// Exit code 1 when anything is found.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// The smallest pocket card allowed, by screen width
const MIN_CARD_PX = { 640: 84, 740: 94, 844: 94, 1280: 158, 1920: 158 };
const MIN_NAME_PX = 11;   // the hero name on a pocket card, on sideways phones
const MAX_FRAME_GAP_MS = 34;
const FRESH_TURNS = 5;
const WARM_TURNS = 5;

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return pairs;
}, []));
const base = String(args.base ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const turnMode = !!args.turns;
const defaultSizes = turnMode ? '740x360,1280x720' : '640x360,740x360,844x390,1280x720,1920x1080';
const sizes = String(args.sizes ?? defaultSizes).split(',').map(s => s.split('x').map(Number));
const shotsDir = typeof args.shots === 'string' ? args.shots : null;

// A card floor for any width: the floor of the largest listed width at or under it
const cardFloor = w => Object.entries(MIN_CARD_PX).filter(([k]) => Number(k) <= w).map(([, v]) => v).pop() ?? 0;

// ---------------------------------------------------------------------------------------------------------------
// The audit itself, run in the page. Returns { findings: string[], facts: {...} }.
function auditInPage({ minCardPx, minNamePx, phone }) {
  const findings = [];
  const binder = document.querySelector('.binder');
  if (!binder) return { findings: ['no binder on screen'], facts: {} };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const shown = el => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
    }
    if (getComputedStyle(el).visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = el => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls} "${el.textContent.trim().slice(0, 40)}"`;
  };
  const short = el => name(el).split(' "')[0];
  const lineRects = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
  };
  const over = (a, b, slack = 1) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack;
  // The first ancestor (up to the binder) whose clipping box the rect sticks out of. It stops at the binder: the
  // binder is fixed to the screen, so the app's boxes round it (smaller than the screen with a safe-area inset)
  // don't clip it.
  const clipper = (el, rect) => {
    for (let p = el.parentElement; p && p !== document.body; p = p === binder ? null : p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
      const box = p.getBoundingClientRect();
      const inner = {
        left: box.left + parseFloat(pcs.borderLeftWidth), right: box.right - parseFloat(pcs.borderRightWidth),
        top: box.top + parseFloat(pcs.borderTopWidth), bottom: box.bottom - parseFloat(pcs.borderBottomWidth),
      };
      if (rect.left < inner.left - 1 || rect.right > inner.right + 1 || rect.top < inner.top - 1 || rect.bottom > inner.bottom + 1) return p;
    }
    return null;
  };
  const offScreen = r => r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;

  // The large view lies over everything; when it is open, audit only it
  const large = binder.querySelector('.binder-large');
  const panel = binder.querySelector('.binder-panel');

  // ---- The parts of the screen: on screen, not cut off, not over each other ----
  const one = sel => [...binder.querySelectorAll(sel)].filter(shown);
  const parts = large
    ? [['large view card', one('.binder-large-card')], ['large view button', one('.binder-large-fav, .binder-large-close')]]
    : [
      ['filter button', one('.binder-filter-btn')],
      ['close button', one('.binder > .binder-top .binder-close')],
      ['book', one('.binder-book')],
      ['status line', one('.binder-status')],
      ['arrow', one('.binder-arrow')],
      ['panel', panel ? one('.binder-panel') : []],
    ];
  for (const [label, els] of parts) {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (offScreen(r)) findings.push(`${label} leaves the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh}): ${short(el)}`);
      const cut = clipper(el, r);
      if (cut && cut !== binder) findings.push(`${label} cut off by ${short(cut)}`);
    }
  }
  const boxes = parts.flatMap(([label, els]) => els.map(el => ({ label, el, r: el.getBoundingClientRect() })));
  // The panel drops down over the book by design, and the arrows lie over the book's outer edge on narrow phones;
  // what they must not cover is a card, a control, or the status line.
  const allowed = (a, b) => {
    const pair = [a.label, b.label].sort().join('+');
    return pair === 'book+panel' || pair === 'arrow+book' || pair === 'arrow+panel'
      || a.el.contains(b.el) || b.el.contains(a.el);
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (allowed(a, b)) continue;
      if (over(a.r, b.r)) findings.push(`${a.label} overlaps ${b.label}: ${short(a.el)} and ${short(b.el)}`);
    }
  }
  // Arrows over a pocket card (an arrow under the open panel is covered anyway)
  const pocketCards = one('.binder-side:not(.binder-leaf) .binder-card');
  for (const arrow of one('.binder-arrow')) {
    const r = arrow.getBoundingClientRect();
    if (panel && over(r, panel.getBoundingClientRect())) continue;
    for (const card of pocketCards) {
      if (over(r, card.getBoundingClientRect())) { findings.push(`arrow over a card: ${short(arrow)} and ${name(card)}`); break; }
    }
  }
  // Nothing in the panel lies over anything else in it
  if (panel && shown(panel) && !large) {
    const items = [...panel.querySelectorAll('input, button, .binder-panel-head')].filter(shown);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (over(items[i].getBoundingClientRect(), items[j].getBoundingClientRect())) findings.push(`in the panel, ${name(items[i])} overlaps ${name(items[j])}`);
      }
      const r = items[i].getBoundingClientRect();
      const cut = clipper(items[i], r);
      if (cut && cut !== binder) findings.push(`in the panel, ${name(items[i])} cut off by ${short(cut)}`);
    }
  }

  // ---- Text: inside its box, not cut off, not over other text ----
  const roots = large ? [large] : [...one('.binder-filter-btn, .binder-status, .binder-panel, .binder-empty'),
    ...one('.binder-side:not(.binder-leaf) .binder-pocket')];
  const texts = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || !shown(el)) continue;
      let entry = texts.find(t => t.el === el);
      if (!entry) texts.push(entry = { el, rects: [] });
      entry.rects.push(...lineRects(node));
    }
  }
  // Under the open panel, the book's text is covered: skip it
  const panelRect = panel && shown(panel) && !large ? panel.getBoundingClientRect() : null;
  const visibleTexts = texts.filter(t => !panelRect || t.el.closest('.binder-panel') || !t.rects.some(r => over(r, panelRect, 0)));
  for (const { el, rects } of visibleTexts) {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (cs.display !== 'inline' && el.clientWidth > 0
      && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 0.45 * size)) {
      findings.push(`text overflows its box (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}): ${name(el)}`);
    }
    if (rects.some(offScreen)) findings.push(`text leaves the screen: ${name(el)}`);
    const cut = rects.map(r => clipper(el, r)).find(Boolean);
    if (cut) findings.push(`text cut off by ${short(cut)}: ${name(el)}`);
  }
  for (let i = 0; i < visibleTexts.length; i++) {
    for (let j = i + 1; j < visibleTexts.length; j++) {
      const a = visibleTexts[i], b = visibleTexts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.rects.some(ra => b.rects.some(rb => over(ra, rb)))) findings.push(`text overlaps text: ${name(a.el)} and ${name(b.el)}`);
    }
  }

  // ---- Pocket cards: the size floor, and the hero name on phones ----
  const facts = { cards: 0, cardWidth: null, nameFont: null, locked: 0, disabled: 0 };
  if (!large) {
    const widths = pocketCards.map(c => c.getBoundingClientRect().width);
    facts.cards = widths.length;
    if (widths.length) {
      facts.cardWidth = +Math.min(...widths).toFixed(1);
      if (facts.cardWidth < minCardPx - 0.05) findings.push(`smallest pocket card ${facts.cardWidth}px wide, under ${minCardPx}px`);
    }
    const names = pocketCards.map(c => c.querySelector('.card-hero-name')).filter(n => n && shown(n));
    if (names.length) {
      facts.nameFont = +Math.min(...names.map(n => parseFloat(getComputedStyle(n).fontSize))).toFixed(2);
      if (phone && facts.nameFont < minNamePx - 0.05) findings.push(`hero name ${facts.nameFont}px, under ${minNamePx}px`);
    } else if (pocketCards.length) findings.push('no hero name showing on the pocket cards');
    facts.locked = one('.binder-side:not(.binder-leaf) .binder-pocket--locked').length;
    facts.disabled = one('.binder-side:not(.binder-leaf) .binder-pocket--disabled').length;
  }

  // ---- Nothing scrolls sideways ----
  const page = document.scrollingElement;
  if (page.scrollWidth > vw + 1) findings.push(`the page scrolls sideways (${page.scrollWidth} in ${vw})`);
  for (const el of [binder, ...binder.querySelectorAll('.binder-stage, .binder-book, .binder-spread, .binder-panel, .binder-large')]) {
    if (shown(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') {
      findings.push(`${short(el)} scrolls sideways (${el.scrollWidth} in ${el.clientWidth})`);
    }
  }

  facts.status = binder.querySelector('.binder-status')?.textContent.trim() ?? null;
  facts.empty = binder.querySelector('.binder-empty') && shown(binder.querySelector('.binder-empty'))
    ? binder.querySelector('.binder-empty').textContent.trim() : null;
  return { findings: [...new Set(findings)], facts };
}

// ---------------------------------------------------------------------------------------------------------------
async function loadPlaywright() {
  const where = process.env.PLAYWRIGHT_CORE;
  if (where) return import(pathToFileURL(path.join(where, 'index.mjs')).href);
  return import('playwright-core');
}

const results = [];
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', e => console.log(`    page error: ${e.message}`));
  if (args['api-cors']) {
    await page.route(/:8787\//, async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      }
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    });
  }
  return page;
}

// Let finite animations end; loops (the "tap to open" pulse, holo shimmer) go on
const settle = async page => {
  await page.waitForFunction(() => document.getAnimations().every(a => {
    const t = a.effect?.getComputedTiming?.();
    return a.playState !== 'running' || (t && t.iterations === Infinity);
  }), null, { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(150);
};

const shoot = async (page, size, state) => {
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${size[0]}x${size[1]}-${state}.png`) });
};

const record = (size, label, findings, facts = {}) => {
  results.push({ size: `${size[0]}x${size[1]}`, label, findings, facts });
};

// Load the dev binder; shoot the closed binder of the opening when asked, then tap it open
async function openBinder(page, size, query, { shootOpening = false } = {}) {
  await page.goto(`${base}/#screens/binder${query ? `?${query}` : ''}`);
  await page.waitForSelector('.binder-opening, .binder-book, .binder-error', { timeout: 20000 });
  if (await page.$('.binder-opening')) {
    await settle(page); // the closed binder has landed
    if (shootOpening) {
      const r = await page.$eval('.binder-opening-book', el => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, on: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight }; });
      const tap = await page.$eval('.binder-opening-tap', el => { const b = el.getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; });
      const findings = [];
      if (!r.on) findings.push('the closed binder leaves the screen');
      if (!tap) findings.push('"Tap the binder to open it" leaves the screen');
      record(size, 'opening', findings, { book: `${Math.round(r.w)}x${Math.round(r.h)}` });
      console.log(`${size.join('x')} ${'opening'.padEnd(18)} closed binder ${Math.round(r.w)}x${Math.round(r.h)}px`);
      for (const f of findings) console.log(`    FINDING ${f}`);
      await shoot(page, size, 'opening');
    }
    await page.click('.binder-opening');
    await page.waitForSelector('.binder-opening', { state: 'detached', timeout: 5000 });
  }
  await page.waitForSelector('.binder-book', { timeout: 10000 });
  if (typeof args.css === 'string') await page.addStyleTag({ content: args.css });
  await page.mouse.move(1, 1);
  await settle(page);
}

async function check(page, size, label, extra = () => []) {
  await page.mouse.move(1, 1); // a mouse left over a pocket lifts it
  await settle(page);
  const { findings, facts } = await page.evaluate(auditInPage, {
    minCardPx: cardFloor(size[0]),
    minNamePx: MIN_NAME_PX,
    phone: size[1] <= 500,
  });
  findings.push(...extra(facts));
  record(size, label, findings, facts);
  const card = facts.cardWidth == null ? '' : `smallest card ${facts.cardWidth}px (floor ${cardFloor(size[0])}) | name ${facts.nameFont}px | `;
  console.log(`${size.join('x')} ${label.padEnd(18)} ${card}${facts.cards ?? 0} cards, ${facts.locked ?? 0} locked, ${facts.disabled ?? 0} disabled${facts.empty ? ` | "${facts.empty}"` : ''} | "${facts.status}"`);
  for (const f of findings) console.log(`    FINDING ${f}`);
  await shoot(page, size, label);
}

async function audit() {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
    try {
      // The opening, the open book, the large view, the panel and an empty search
      let page = await newPage(context);
      await openBinder(page, size, '', { shootOpening: true });
      await check(page, size, 'book', f => (f.cards === 12 ? [] : [`${f.cards} cards on the first spread, expected 12`]));
      await page.click('.binder-side:not(.binder-leaf) .binder-pocket:not(.binder-pocket--empty)');
      await page.waitForSelector('.binder-large .binder-large-card');
      await check(page, size, 'large-view');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.binder-large', { state: 'detached' });
      await page.click('.binder-filter-btn');
      await page.waitForSelector('.binder-panel');
      await check(page, size, 'panel-open');
      await page.fill('.binder-search', 'zzzz');
      await check(page, size, 'empty-search', f => (f.empty === 'No heroes match' ? [] : [`empty search shows ${JSON.stringify(f.empty)}, expected "No heroes match"`]));
      await page.click('.binder-panel-done');
      await page.waitForSelector('.binder-panel', { state: 'detached' });
      await check(page, size, 'empty-search-closed', f => (f.empty === 'No heroes match' ? [] : [`empty search shows ${JSON.stringify(f.empty)}, expected "No heroes match"`]));
      await page.close();

      // Locked cards (heroes not owned) and disabled cards
      page = await newPage(context);
      await openBinder(page, size, 'filter=not-owned');
      await check(page, size, 'locked', f => (f.locked > 0 ? [] : ['no locked card on screen']));
      await page.close();
      page = await newPage(context);
      await openBinder(page, size, 'filter=disabled');
      await check(page, size, 'disabled', f => (f.disabled > 0 ? [] : ['no disabled card on screen']));
      await page.close();
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The page turn's frames: from the tap on the arrow to the leaf landing
async function timeTurn(page) {
  await page.evaluate(() => {
    const t = window.__turn = { frames: [], tap: null, landed: null, moving: null };
    const book = document.querySelector('.binder-book');
    let seenLeaf = false;
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (book.classList.contains('binder-book--leafed')) seenLeaf = true;
      if (book.classList.contains('binder-book--turning') && t.moving == null) t.moving = now;
      if (seenLeaf && !book.classList.contains('binder-book--leafed') && t.landed == null) {
        t.landed = now;
        observer.disconnect();
      }
    });
    observer.observe(book, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('pointerdown', e => { t.tap = e.timeStamp; }, { capture: true, once: true });
    const loop = ts => {
      t.frames.push(ts);
      if (t.landed == null || ts < t.landed + 50) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.waitForTimeout(100); // a few frames before the tap
  await page.click('.binder-arrow--next');
  await page.waitForFunction(() => window.__turn.landed != null && window.__turn.frames.at(-1) > window.__turn.landed + 30, null, { timeout: 5000 });
  return page.evaluate(() => {
    const { frames, tap, landed, moving } = window.__turn;
    // Every gap between frames that ends after the tap and starts before the landing
    const gaps = [];
    const ends = [];
    for (let i = 1; i < frames.length; i++) {
      if (frames[i] > tap && frames[i - 1] < landed) { gaps.push(frames[i] - frames[i - 1]); ends.push(frames[i]); }
    }
    const maxGap = Math.max(...gaps);
    return {
      maxGap,
      maxGapAt: ends[gaps.indexOf(maxGap)] - tap, // when the longest frame ended, after the tap
      firstGap: gaps[0],
      over: gaps.filter(g => g > 34).length,
      frames: gaps.length,
      toMoving: moving - tap,
      toLand: landed - tap,
    };
  });
}

async function turns() {
  const fmt = n => n.toFixed(1).padStart(6);
  for (const size of sizes) {
    const runs = [];
    let page;
    let context;
    for (let i = 0; i < FRESH_TURNS; i++) {
      if (context) await context.close();
      context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
      page = await newPage(context);
      await openBinder(page, size, '');
      await page.waitForTimeout(500);
      runs.push({ kind: `fresh ${i + 1}`, ...(await timeTurn(page)) });
    }
    for (let i = 0; i < WARM_TURNS; i++) {
      await settle(page);
      await page.waitForTimeout(300);
      runs.push({ kind: `warm ${i + 1}`, ...(await timeTurn(page)) });
    }
    await context.close();
    console.log(`${size.join('x')} page turns (ms): largest frame gap and when it ended, first frame gap, gaps over 34, tap to leaf moving, tap to landing`);
    for (const r of runs) {
      console.log(`  ${r.kind.padEnd(8)} max ${fmt(r.maxGap)} at ${fmt(r.maxGapAt)}  first ${fmt(r.firstGap)}  over34 ${String(r.over).padStart(2)}/${r.frames}  moving ${fmt(r.toMoving)}  landed ${fmt(r.toLand)}`);
      record(size, `turn ${r.kind}`, r.maxGap > MAX_FRAME_GAP_MS ? [`frame gap ${r.maxGap.toFixed(1)} ms (first frame ${r.firstGap.toFixed(1)} ms), over ${MAX_FRAME_GAP_MS} ms`] : [], r);
    }
  }
}

try {
  if (turnMode) await turns();
  else await audit();
} finally {
  await browser.close();
}

const all = results.flatMap(r => r.findings.map(f => `${r.size} ${r.label}: ${f}`));
console.log(all.length ? `\n${all.length} finding(s)` : '\nNo findings.');
process.exit(all.length ? 1 : 0);
