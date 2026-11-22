#!/usr/bin/env node
// Shop readability audit (dev only, not shipped). Drives the shop in a headless browser and flags any text that
// leaves its box, is cut off by a clipping parent or the screen, overlaps other text, or is under 12px, any shop
// card under 222px wide, a scrolling leather column, and a floating Friends/Messages icon that is showing on a
// sideways phone or covers a shop control. A port of the approved mockup's auditShop().
//
// Needs playwright-core (not a dependency of this repo): set PLAYWRIGHT_CORE to its folder, or have it resolvable.
//
//   node scripts/shop-audit.mjs --base http://127.0.0.1:5199 --user Name --pass secret --steps sale,inside
//   node scripts/shop-audit.mjs --base http://127.0.0.1:5199 --dev "owned=all" --steps sale,inside
//
// Options:
//   --base URL         the running frontend (vite dev)
//   --user, --pass     sign in through the login page, then open the Shop from the lobby (the real path)
//   --dev QUERY        open the dev screen /#screens/shop?QUERY instead (canned replies, no sign-in)
//   --sizes LIST       default 640x360,844x390,1366x768,1920x1080
//   --steps LIST       run in this order at every size (once-only steps run at the first size):
//                        sale        every sale page
//                        inside      every page of the inside window
//                        poor-hero   tap a greyed price tag, audit the message
//                        poor-pack   tap a greyed "Buy pack", audit the message
//                        fail        a purchase answered with a server error (real app: the reply is faked)
//                        offline     a purchase whose request fails (real app only)
//                        buy-hero    (once) buy the first hero on sale, then audit the bought card at every size
//                        buy-pack    (once) buy a pack: shoot the opening over the shop at every size, open it,
//                                    press Done and check the shop is back and readable
//                        holo-off    (once) turn holographic effects off with the Settings switch, check the pack
//                        motion      check that nothing in the shop is moving (use with --reduced-motion)
//   --reduced-motion   emulate prefers-reduced-motion: reduce
//   --shots DIR        save a screenshot per step and size, named <size>-<prefix><step>.png
//   --prefix TEXT      prefix for the screenshot names
//   --css TEXT         add this stylesheet after the shop opens (to prove the audit catches a fault)
// Exit code 1 when anything is found.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MIN_CARD_PX = 222;
const MIN_TEXT_PX = 12;

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return pairs;
}, []));
const base = String(args.base ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const sizes = String(args.sizes ?? '640x360,844x390,1366x768,1920x1080').split(',').map(s => s.split('x').map(Number));
const steps = String(args.steps ?? 'sale,inside').split(',');
const shotsDir = typeof args.shots === 'string' ? args.shots : null;
const prefix = typeof args.prefix === 'string' ? args.prefix : '';
const devMode = args.dev !== undefined;

// ---------------------------------------------------------------------------------------------------------------
// The audit itself, run in the page. Returns { findings: string[], facts: {...} }.
function auditInPage({ minCardPx, minTextPx }) {
  const findings = [];
  const overlay = document.querySelector('.shop-overlay');
  if (!overlay) return { findings: ['no shop on screen'], facts: {} };
  // The inside window covers the showcase and the sale; audit only what is on top
  const insideWindow = overlay.querySelector('.shop-inside');
  const root = insideWindow || overlay;
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
  const lineRects = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
  };
  const over = (a, b, slack = 1) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack;

  // Every shown element that owns text directly
  const texts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || !shown(el)) continue;
    let entry = texts.find(t => t.el === el);
    if (!entry) texts.push(entry = { el, rects: [] });
    entry.rects.push(...lineRects(node));
  }

  for (const { el, rects } of texts) {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < minTextPx - 0.05) findings.push(`text under ${minTextPx}px (${size.toFixed(1)}px): ${name(el)}`);
    // Vertically, a display font's glyph box may stand a little past a tight line height; a wrapped extra line
    // overflows by a whole line, so allow under half an em
    if (cs.display !== 'inline' && el.clientWidth > 0
      && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 0.45 * size)) {
      findings.push(`text overflows its box (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}): ${name(el)}`);
    }
    for (const r of rects) {
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        findings.push(`text leaves the screen: ${name(el)}`);
        break;
      }
    }
    // Cut off by any clipping parent
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
      const box = p.getBoundingClientRect();
      const inner = {
        left: box.left + parseFloat(pcs.borderLeftWidth), right: box.right - parseFloat(pcs.borderRightWidth),
        top: box.top + parseFloat(pcs.borderTopWidth), bottom: box.bottom - parseFloat(pcs.borderBottomWidth),
      };
      const cut = rects.some(r => r.left < inner.left - 1 || r.right > inner.right + 1 || r.top < inner.top - 1 || r.bottom > inner.bottom + 1);
      if (cut) { findings.push(`text cut off by ${name(p).split(' "')[0]}: ${name(el)}`); break; }
    }
  }

  // Text over other text (the "Purchased" stamp is meant to lie over its card)
  const stampless = texts.filter(t => !t.el.closest('.shop-stamp'));
  for (let i = 0; i < stampless.length; i++) {
    for (let j = i + 1; j < stampless.length; j++) {
      const a = stampless[i], b = stampless[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.rects.some(ra => b.rects.some(rb => over(ra, rb)))) findings.push(`text overlaps text: ${name(a.el)} and ${name(b.el)}`);
    }
  }

  // Leather columns must not scroll
  for (const col of root.querySelectorAll('.shop-showcase, .shop-inside-side')) {
    if (shown(col) && col.scrollHeight > col.clientHeight + 1) findings.push(`column scrolls (${col.scrollHeight} in ${col.clientHeight}): ${name(col).split(' "')[0]}`);
  }

  // Cards: at least 222px wide; read the grid shape of the sale and the inside window
  const gridShape = selector => {
    const grid = root.querySelector(selector);
    if (!grid || !shown(grid)) return null;
    const cards = [...grid.querySelectorAll(':scope > .shop-slot > :first-child')].filter(shown).map(c => c.getBoundingClientRect());
    for (const r of cards) if (r.width < minCardPx - 0.05) findings.push(`card under ${minCardPx}px wide (${r.width.toFixed(1)}px) in ${selector}`);
    const lines = values => values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 8).length;
    const cols = lines(cards.map(r => r.left));
    const rows = lines(cards.map(r => r.top));
    return { cols, rows, cards: cards.length, cardWidth: cards.length ? +cards[0].width.toFixed(1) : 0 };
  };
  const facts = {
    sale: insideWindow ? null : gridShape('.shop-sale-grid'),
    inside: gridShape('.shop-inside-grid'),
    message: overlay.querySelector('.shop-message')?.textContent.trim() ?? document.querySelector('.shop-message--over-opening')?.textContent.trim() ?? null,
    balance: overlay.querySelector('.vp-amount')?.textContent.trim() ?? null,
  };

  // The floating Friends / Messages icons: hidden on sideways phones, and never over a shop control or text
  const phone = window.matchMedia('(max-height: 500px)').matches;
  const controls = [...root.querySelectorAll('button, .shop-dial, .shop-pager, .shop-pip')].filter(shown).map(el => ({ el, rects: [el.getBoundingClientRect()] }));
  facts.icons = [];
  for (const icon of document.querySelectorAll('.friends-icon, .message-icon')) {
    const showing = shown(icon);
    facts.icons.push(`${icon.className.split(' ')[0]}:${showing ? 'shown' : 'hidden'}`);
    if (!showing) continue;
    if (phone) { findings.push(`${name(icon).split(' "')[0]} shows on a sideways phone`); continue; }
    const r = icon.getBoundingClientRect();
    for (const t of [...texts, ...controls]) {
      if (t.rects.some(tr => over(r, tr, 0))) findings.push(`${name(icon).split(' "')[0]} covers ${name(t.el)}`);
    }
  }
  return { findings: [...new Set(findings)], facts };
}

// ---------------------------------------------------------------------------------------------------------------
async function loadPlaywright() {
  const where = process.env.PLAYWRIGHT_CORE;
  if (where) return import(pathToFileURL(path.join(where, 'index.mjs')).href);
  return import('playwright-core');
}

const results = [];
let page;

const settle = async () => {
  // Let finite animations end (the turn, the stamp, the coin bump, the message slide); loops like the dial rim go on
  await page.waitForFunction(() => document.getAnimations().every(a => {
    const t = a.effect?.getComputedTiming?.();
    return a.playState !== 'running' || (t && t.iterations === Infinity);
  }), null, { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(150);
};

async function check(label, [w, h], { shot = true } = {}) {
  await page.mouse.move(1, 1); // a mouse left over a card lifts it 4px
  await settle();
  const { findings, facts } = await page.evaluate(auditInPage, { minCardPx: MIN_CARD_PX, minTextPx: MIN_TEXT_PX });
  const size = `${w}x${h}`;
  results.push({ size, label, findings, facts });
  const grid = g => g ? `${g.cols}x${g.rows} cards ${g.cardWidth}px` : '-';
  console.log(`${size} ${label.padEnd(22)} sale ${grid(facts.sale)} | inside ${grid(facts.inside)} | coins ${facts.balance}${facts.message ? ` | "${facts.message}"` : ''}${facts.icons?.length ? ` | ${facts.icons.join(' ')}` : ''}`);
  for (const f of findings) console.log(`    FINDING ${f}`);
  if (shot && shotsDir) await page.screenshot({ path: path.join(shotsDir, `${size}-${prefix}${label}.png`) });
}

const clickAndWait = async (selector) => { await page.click(selector); await page.waitForTimeout(100); };
const nextEnabled = sel => page.$eval(sel, b => !b.disabled).catch(() => false);
const NOT_ENOUGH = { text: "You don't have enough coins.", ms: 2000 };
const ERROR = { text: null, ms: 3000 };

// Tap something that brings up the shop's message, audit it, and time how long it stays
async function messageStep(label, size, selector, expected, fakeReply = null) {
  if (fakeReply) await fakePurchaseReply(fakeReply);
  await firstSalePage();
  await settle();
  const target = await page.$(selector);
  const fail = text => results.push({ size: size.join('x'), label, findings: [text], facts: {} });
  if (!target) { fail(`nothing to tap (${selector})`); return; }
  // Time the message in the page: from its first frame on screen to its removal
  await page.evaluate(() => {
    const times = window.__shopMessageTimes = {};
    new MutationObserver((list, observer) => {
      const el = document.querySelector('.shop-message');
      if (el && !times.shown) times.shown = performance.now();
      if (!el && times.shown) { times.gone = performance.now(); observer.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await target.click({ force: true }); // a greyed button carries aria-disabled, which Playwright would wait out
  await page.waitForSelector('.shop-message');
  await check(label, size);
  await page.waitForSelector('.shop-message', { state: 'detached', timeout: 8000 }).catch(() => undefined);
  const lasted = Math.round(await page.evaluate(() => window.__shopMessageTimes.gone - window.__shopMessageTimes.shown));
  if (fakeReply) await page.unroute('**/api/shop/purchase-*');
  const text = results.at(-1).facts.message;
  console.log(`    message lasted about ${lasted} ms`);
  if (expected.text && text !== expected.text) fail(`message reads "${text}", expected "${expected.text}"`);
  if (/not enough/i.test(text ?? '')) fail(`"not enough" wording: "${text}"`);
  if (!(Math.abs(lasted - expected.ms) <= 100)) fail(`message lasted about ${lasted} ms, expected ${expected.ms} ms`);
}

async function openShop() {
  if (devMode) {
    await page.goto(`${base}/#screens/shop?${args.dev === true ? '' : args.dev}`);
  } else {
    await page.goto(base);
    await page.fill('input[placeholder="Your username"]', String(args.user));
    await page.fill('input[placeholder="Your password"]', String(args.pass));
    await page.click('button[type="submit"]');
    await page.waitForSelector('.shop-tile', { timeout: 20000 });
    await page.click('.shop-tile');
  }
  await page.waitForSelector('.shop-sale-grid, .shop-empty', { timeout: 20000 });
}

async function firstSalePage() {
  while (await nextEnabled('.shop-pager-btn.prev')) await clickAndWait('.shop-pager-btn.prev');
}

async function fakePurchaseReply(kind) {
  // kind 'fail': the server answers with an error; 'offline': the request never arrives
  await page.route('**/api/shop/purchase-*', route => kind === 'offline'
    ? route.abort('internetdisconnected')
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'D1_ERROR: no such table' }) }));
}

const onceDone = new Set();
const stepRunners = {
  async sale(size) {
    await firstSalePage();
    for (let n = 1; ; n++) {
      await check(n === 1 ? 'shop' : `sale-${n}`, size, { shot: n === 1 });
      if (!(await nextEnabled('.shop-pager-btn.next'))) break;
      await clickAndWait('.shop-pager-btn.next');
    }
    await firstSalePage();
  },
  async inside(size) {
    await clickAndWait('.shop-inside-btn');
    await page.waitForSelector('.shop-inside-grid .shop-slot');
    while (await nextEnabled('.shop-inside-arrow.prev')) await clickAndWait('.shop-inside-arrow.prev');
    for (let n = 1; ; n++) {
      const last = !(await nextEnabled('.shop-inside-arrow.next'));
      await check(n === 1 ? 'inside' : `inside-${n}`, size, { shot: n === 1 || last });
      if (last) break;
      await clickAndWait('.shop-inside-arrow.next');
    }
    await clickAndWait('.shop-inside .shop-close');
  },
  'poor-hero': size => messageStep('poor-message', size, '.shop-price-tag.is-poor', NOT_ENOUGH),
  'poor-pack': size => messageStep('poor-pack-message', size, '.shop-buy-pack.is-poor', NOT_ENOUGH),
  fail: size => messageStep('error-message', size, '.shop-price-tag:not(.is-poor)', ERROR, devMode ? null : 'fail'),
  offline: size => messageStep('offline-message', size, '.shop-price-tag:not(.is-poor)', ERROR, 'offline'),
  async 'buy-hero'(size) {
    if (!onceDone.has('buy-hero')) {
      onceDone.add('buy-hero');
      await firstSalePage();
      await page.click('.shop-price-tag:not(.is-poor)');
      await page.waitForSelector('.shop-slot.is-bought .shop-stamp');
    }
    await firstSalePage();
    while (!(await page.$('.shop-slot.is-bought')) && await nextEnabled('.shop-pager-btn.next')) await clickAndWait('.shop-pager-btn.next');
    await check('bought', size);
  },
  async 'buy-pack'(size, all) {
    if (onceDone.has('buy-pack')) return;
    onceDone.add('buy-pack');
    await page.click('.shop-buy-pack');
    await page.waitForSelector('.pack-opening__pack', { timeout: 10000 });
    for (const s of all) {
      await page.setViewportSize({ width: s[0], height: s[1] });
      await page.waitForTimeout(600);
      const under = await page.evaluate(() => !!document.querySelector('.shop-overlay .shop-sale-grid, .shop-overlay .shop-empty'));
      results.push({ size: s.join('x'), label: 'pack-opening', findings: under ? [] : ['the shop is not under the pack opening'], facts: {} });
      console.log(`${s.join('x')} pack-opening           shop underneath: ${under}`);
      if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${s.join('x')}-${prefix}pack-opening.png`) });
    }
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.click('.pack-opening__pack');
    await page.waitForSelector('.pack-opening__done', { timeout: 15000 });
    if (await nextEnabled('.pack-opening__turn-all')) await page.click('.pack-opening__turn-all');
    await page.waitForTimeout(1500);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${size.join('x')}-${prefix}pack-cards.png`) });
    await page.click('.pack-opening__done');
    await page.waitForSelector('.pack-opening', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    const back = await page.evaluate(() => !document.querySelector('.pack-opening') && !!document.querySelector('.shop-sale-grid, .shop-empty'));
    if (!back) results.push({ size: size.join('x'), label: 'after-pack-done', findings: ['Done did not return to the shop'], facts: {} });
    await check('after-pack-done', size);
  },
  async 'holo-off'(size) {
    if (!onceDone.has('holo-off')) {
      onceDone.add('holo-off');
      if (devMode) {
        await page.evaluate(() => localStorage.setItem('heroscall.holo', 'off'));
        await openShop();
      } else {
        // Close the shop, Profile, Settings, the switch, back out, open the shop again
        await page.click('.shop-close');
        await page.click('.lobby-portrait');
        await page.click('.profile-tool-btn[aria-label="Settings"]');
        const sw = page.locator('.settings-switch[aria-label="Show holographic effects"]');
        if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click();
        const now = await sw.getAttribute('aria-checked');
        if (now !== 'false') results.push({ size: size.join('x'), label: 'holo-off', findings: ['the Settings switch did not turn off'], facts: {} });
        await page.click('.settings-modal .game-close-btn'); // back to Profile
        await page.click('.profile-modal .profile-close-btn');
        await page.click('.shop-tile');
        await page.waitForSelector('.shop-sale-grid, .shop-empty');
      }
    }
    const pack = await page.evaluate(() => {
      const p = document.querySelector('.shop-showcase .holo-pack');
      if (!p) return null;
      const foil = p.querySelector('[class*="foil"], [class*="sheen"], [class*="shine"]');
      return { classes: p.className, foil: !!foil && getComputedStyle(foil).display !== 'none' };
    });
    const plain = pack && !/foil|holo-pack--holo|is-holo/.test(pack.classes.replace(/^holo-pack\b/, '')) && !pack.foil;
    results.push({ size: size.join('x'), label: 'holo-off-pack', findings: plain ? [] : [`pack not plain with holo off: ${JSON.stringify(pack)}`], facts: {} });
    await check('holo-off', size);
  },
  async motion(size) {
    // Nothing in the shop may move, loops included, and a page turn must not play either
    await firstSalePage();
    if (await nextEnabled('.shop-pager-btn.next')) await page.click('.shop-pager-btn.next');
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running' && a.effect?.target?.closest?.('.shop-overlay'))
      .map(a => `${a.animationName ?? a.transitionProperty ?? 'animation'} on ${a.effect.target.className}`));
    const transitions = await page.evaluate(() => [...document.querySelectorAll('.shop-overlay *')]
      .filter(el => { const cs = getComputedStyle(el); return cs.transitionDuration.split(',').some(d => parseFloat(d) > 0) || (cs.animationName !== 'none' && cs.animationDuration.split(',').some(d => parseFloat(d) > 0) && cs.animationPlayState !== 'paused'); })
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')}`));
    results.push({ size: size.join('x'), label: 'motion', findings: [...moving.map(m => `moving: ${m}`), ...transitions.slice(0, 10).map(t => `has motion: ${t}`)], facts: {} });
    console.log(`${size.join('x')} motion                 running ${moving.length}, elements with motion ${transitions.length}`);
    await firstSalePage();
    await check('reduced-motion', size);
  },
};

// ---------------------------------------------------------------------------------------------------------------
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: sizes[0][0], height: sizes[0][1] },
  reducedMotion: args['reduced-motion'] ? 'reduce' : 'no-preference',
});
page = await context.newPage();
page.on('pageerror', e => console.log(`    page error: ${e.message}`));
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

try {
  await openShop();
  if (typeof args.css === 'string') await page.addStyleTag({ content: args.css });
  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.waitForTimeout(400);
    for (const step of steps) {
      const run = stepRunners[step];
      if (!run) throw new Error(`unknown step ${step}`);
      await run(size, sizes);
    }
  }
} finally {
  await browser.close();
}

const all = results.flatMap(r => r.findings.map(f => `${r.size} ${r.label}: ${f}`));
console.log(all.length ? `\n${all.length} finding(s)` : '\nNo findings.');
process.exit(all.length ? 1 : 0);
