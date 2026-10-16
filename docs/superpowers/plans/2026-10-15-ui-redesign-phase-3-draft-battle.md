# UI Redesign Phase 3: Draft and Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the draft (ban, pick, setup) and battle (initiative, board, action bar, log sidebar, timer, game-over, floating controls) onto the "table" design system without changing their geometry, add a 30 second draft clock (server auto-play plus a dial for the last 10 seconds) and a rotate prompt for upright phones, and prove it all with a before/after computed-style comparison and real two-player matches.

**Architecture:** The screens' rules live inside the 3.9k-line `App.css` mixed with card, friends and chat rules. A one-time carve script moves only the rules for classes that the draft and battle components actually render into `GameScreens.css` (card rules stay put, per the card rule). A reusable, unit-tested `retoken-css.mjs` then maps every hard-coded colour, font and ALL-CAPS in the carved file (and in `BattlePhone.css`, `TurnTimerBar.css`, `RewardsDisplay.css`) onto tokens. A small hand-written `GameTheme.css` override layer sets the identity (tinted halves, brass buttons, log colours, modal frames). Inline-styled floating controls and emoji copy in `BattlePhase.tsx`, `DraftPhase.tsx` and the `App.tsx` sidebar are replaced with classes, `Icon` and sentence-case copy. Geometry (left log sidebar, two team halves, fixed right action bar, tuned phone layout) is unchanged. The draft clock lives on the server (`tickDraftTimers`, tested first); upright phones get a "rotate your phone" prompt instead of a portrait layout.

**Tech Stack:** React 18, plain CSS on `tokens.css` / `primitives.css`, Node 20 scripts and `node:test`, Playwright MCP tools (two tabs play each other; each tab keeps its login in memory, so Quick admin login in two tabs gives two accounts).

**Spec:** `docs/superpowers/specs/2026-10-15-ui-redesign-design.md`. Earlier phases: `docs/superpowers/plans/2026-10-15-ui-redesign-phase-1-foundation.md`, `...-phase-2-lobby.md`.

## Global Constraints

- Colours (verbatim): felt `#101b18`, walnut `#241a14`, leather `#33261d`, brass `#b08a45`, bone `#e6dfcf`, ember `#c4482f`, verdigris `#5fa08a`; all live in `tokens.css`. No Bootstrap colours.
- Type: IM Fell English for titles and large numerals; Alegreya Sans for UI text; sentence case; no all-caps labels; no emoji icons (use `Icon`); lines under 80 characters.
- Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow.
- Motion only in response to actions, plus one orchestrated moment per screen; `prefers-reduced-motion` respected.
- Quality floor: works from 320px up, visible keyboard focus, sufficient contrast.
- Copy: buttons say what happens; one name per action ("Surrender", "Abandon draft"); errors say how to fix them.
- Currency (user rule): never named; coin image beside a number; no "VP", "victory points" or "coins" in UI text.
- Hero cards (user rule): a card must show its image as now, its stats, and ALL ability and special text. Card rules stay in `App.css` and `HeroCard.css`; do not edit `HeroCard.tsx`/`HeroCard.css`.
- Geometry of the draft and battle screens does not change (sidebar left, halves centre, action bar fixed right, tuned phone layout in `BattlePhone.css`). The action bar stays on the right: cards are sized by height, so a bottom tray would shrink them on desktop and in phone landscape, and they must show all their text. Upright phones (portrait) get a "Rotate your phone" prompt instead of a portrait layout (user decision); a real portrait layout would be separate work.
- Draft clock (user rule): 30 seconds per round (the ban round and each of the three pick rounds); the dial appears only for the last 10 seconds; at zero a random card from the player's own hand is banned or picked for whoever has not acted. The setup (attack order) screen stays untimed. The battle turn timer bar is restyled too.
- Push straight to `main`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `frontend/dist`; verification builds use `--outDir "$TEMP/hc-dist"`.
- Revert point for the whole redesign: tag `ui-before-redesign`.
- Existing `tsc --noEmit` errors are unrelated. Gates: `npm run check:tokens`, `node --test scripts/`, `vite build`, backend `npm test`, style diff, screenshots.
- If Vite serves an empty or stale CSS file after a rewrite, restart `npm run dev`.

## Review Focus

- Spectating a live match: the action bar shows "Stop spectating" as a normal button, and the page never shows a raw red inline button (Task 7).
- Opponent disconnect countdown, spectator count button and spectator list keep their positions and stay readable on the felt (Task 7, step 6 renders them by forcing state in the page).
- Long opponent or player names (12 wide characters) do not overflow the team label at 390px and 667x375 (Task 7).
- A card with the most text (Blood Hunter) still shows all ability and special text in draft and battle after the re-theme (Task 7).
- Survival-mode sidebar block (wins and losses) shows no emoji and no raw colours (Task 4 lint; Task 7 by forcing the state in the page).
- Game over with and without rewards: the rewards block inside the modal reads on the walnut panel (Task 7).
- Reduced motion: title glow, pulsing turn banner, timer and draft dial animations stop (Task 7).
- Draft clock: the dial shows only in the last 10 seconds, only to a player who has not acted, and the auto-ban or auto-pick at 30 seconds leaves both tabs in the same state (Task 1 tests; Task 7, step 8).
- A player who acts at 29 seconds is not also auto-played; one who is idle during a pick round never ends up with two picks (Task 1 tests).
- Upright phone: the rotate prompt covers draft and battle but never the lobby, and disappears when the phone turns sideways (Task 7, step 9).

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/scripts/style-snapshot.js` (new) | In-page function: computed styles of the screen chrome, keyed by class |
| `frontend/scripts/style-diff.mjs` (new) | Compares two snapshots |
| `frontend/scripts/carve-game-css.mjs` (new; deleted in Task 3) | Moves screen rules from `App.css` into `GameScreens.css` |
| `frontend/scripts/retoken-css.mjs` (new) + `retoken-css.test.mjs` (new) | Colour/font/caps mapper with unit tests; reused in phases 4 and 5 |
| `frontend/src/styles/GameScreens.css` (new) | Carved screen rules, then retokened |
| `frontend/src/styles/GameTheme.css` (new) | Hand-written overrides: identity and floating controls |
| `frontend/src/styles/BattlePhone.css`, `TurnTimerBar.css`, `RewardsDisplay.css` (retokened in place) | Phone layout, turn timer, rewards block |
| `frontend/src/App.css` (reduced) | Keeps card, friends, chat and other rules |
| `frontend/src/components/ui/Icon.tsx` (modify) | New icons `eye`, `user`, `flag`, `rotate` |
| `backend/gameManager.js`, `backend/server.js` (modify), `backend/test/draftclock.test.js` (new) | Draft clock: `tickDraftTimers`, a one-second interval, `draft-timer` event |
| `frontend/src/components/DraftClock.tsx`, `RotatePrompt.tsx` (new) | The 10 second dial and the upright-phone prompt |
| `frontend/src/components/BattlePhase.tsx`, `DraftPhase.tsx`, `frontend/src/App.tsx` (modify) | Classes instead of inline styles; sentence-case copy without emoji |
| `frontend/scripts/check-tokens.mjs` (modify) | Add migrated files |

All commands run from `frontend/` unless a path says otherwise.

### Scenarios used to reach screens (referenced by Tasks 1 and 5)

Open two browser tabs (`browser_tabs` with action `new`). In each tab navigate to the dev URL (`npm run dev`, read the port from its output) and click Quick admin login; the tabs are accounts Admin1 and Admin2 (the next free admin names).
- **Scenario R (random match to battle):** in both tabs click the Random placard's "Play random". Random mode skips the initiative overlay and goes straight to the battle: one tab shows "Your turn" with the enemy cards glowing as targets, the other "Opponent's turn". Click a glowing enemy card to see the action bar fill in. Surrender from a tab ends the game and shows the game-over overlay.
- **Scenario D (draft to battle):** in both tabs click the Draft placard's "Play draft". Each tab selects any card and clicks "Ban card". Then each tab selects a card and clicks "Pick card" three times. In the setup screen click "Ready" in both tabs (drag is optional). Only the draft path shows the initiative overlay: click "Roll initiative" in both tabs and the winner picks "Go first". Waiting 30 seconds in any ban or pick round makes the server play for you (Task 1).
- **Scenario S (spectate):** with a battle running, open a third tab, Quick admin login, open the friends overlay and use the spectate button on a friend in the match. If friends cannot be arranged quickly, record that spectating was not exercised live and test it by temporarily rendering the spectator branch (Task 7, step 5.6).

---

### Task 1: Draft clock on the server

Each draft round (the ban round, then pick rounds 1 to 3) gets a 30 second clock. Everyone decides at the same time in each round, so one clock per round covers both players. Whoever has not acted when it runs out gets a random card from their own hand banned or picked for them. The setup (attack order) screen stays untimed.

**Files:**
- Modify: `backend/gameManager.js` (new `tickDraftTimers`), `backend/server.js` (a one-second interval next to the turn timer code)
- Create: `backend/test/draftclock.test.js`

**Interfaces:**
- Produces: `gameManager.tickDraftTimers(now = Date.now())` returning an array of events: `{ kind: 'timer', gameId, round, durationMs, remainingMs }`, `{ kind: 'ban', gameId, playerId, result }` or `{ kind: 'pick', gameId, playerId, result }` (`result` is exactly what `banCard`/`pickCard` return). Server event `draft-timer` with `{ gameId, round, durationMs, remainingMs }` (round 0 is the ban round, 1 to 3 are pick rounds).

- [ ] **Step 1: Write the failing tests**

Create `backend/test/draftclock.test.js`:

```js
// Draft clock: each ban or pick round lasts 30 seconds; whoever has not acted when it runs out is played for.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); });

const make = (id, name, hand) => ({
  id, name, userId: null, connected: true, team: [], draftCards: hand, bannedCard: null,
  attackOrder: [], currentHeroIndex: 0, hasUsedAttack: false, hasUsedAbility: false, usedAbilities: [],
  selectedTarget: null, twinSpellUsed: false, oneTwoPunchUsed: false, monkAttacksRemaining: 1,
  oneTwoPunchAttacksRemaining: 0, profile_icon: 'Sorcerer', monkDeflectUsed: false
});

// A game in the ban round: five heroes in each hand, nobody has acted
function newDraft() {
  const gameId = `draft-${Math.random().toString(36).slice(2)}`;
  const game = gm.createNewGame(gameId, 'draft');
  const heroes = gm.allHeroes.filter(h => !h.disabled).slice(0, 10).map(h => gm.resetHeroToOriginalState(h));
  game.players = [make('p0', 'Alice', heroes.slice(0, 5)), make('p1', 'Bob', heroes.slice(5, 10))];
  game.phase = 'draft';
  game.currentDraftPhase = 0;
  game.draftTurn = 0;
  game.draftCards = {
    player1: game.players[0].draftCards.map(h => h.name),
    player2: game.players[1].draftCards.map(h => h.name)
  };
  gm.games.set(gameId, game);
  game.players.forEach(p => gm.playerGameMap.set(p.id, gameId));
  return game;
}
const kinds = events => events.map(e => e.kind);

describe('Draft clock', () => {
  test('starts a 30 second clock for the ban round without acting yet', () => {
    const game = newDraft();
    const events = gm.tickDraftTimers(1000);
    assert.deepEqual(kinds(events), ['timer']);
    assert.equal(events[0].round, 0);
    assert.equal(events[0].durationMs, 30000);
    assert.equal(events[0].remainingMs, 30000);
    assert.equal(game.players[0].bannedCard, null);
  });

  test('does nothing before the clock runs out', () => {
    newDraft();
    gm.tickDraftTimers(1000);
    assert.deepEqual(gm.tickDraftTimers(1000 + 29999), []);
  });

  test('bans a random card from each undecided hand when it runs out', () => {
    const game = newDraft();
    const hands = game.players.map(p => p.draftCards.map(h => h.name));
    gm.tickDraftTimers(1000);
    const events = gm.tickDraftTimers(1000 + 30000);
    assert.deepEqual(kinds(events), ['ban', 'ban']);
    events.forEach(e => assert.equal(e.result.success, true));
    game.players.forEach((p, i) => assert.ok(hands[i].includes(p.bannedCard), `${p.name}'s ban came from their own hand`));
    assert.equal(game.currentDraftPhase, 1);
  });

  test('only plays for the player who is still undecided', () => {
    const game = newDraft();
    gm.tickDraftTimers(1000);
    gm.banCard('p0', game.players[0].draftCards[0].name);
    const events = gm.tickDraftTimers(1000 + 30000);
    assert.deepEqual(kinds(events), ['ban']);
    assert.equal(events[0].playerId, 'p1');
    assert.equal(game.currentDraftPhase, 1);
  });

  test('a new round gets a fresh 30 second clock', () => {
    newDraft();
    gm.tickDraftTimers(0);
    gm.tickDraftTimers(30000); // auto-bans and moves to the first pick round
    const events = gm.tickDraftTimers(30001);
    assert.deepEqual(kinds(events), ['timer']);
    assert.equal(events[0].round, 1);
    assert.equal(events[0].remainingMs, 30000);
    assert.deepEqual(gm.tickDraftTimers(30001 + 29999), []);
  });

  test('plays all three pick rounds and ends in setup with three heroes each', () => {
    const game = newDraft();
    let now = 0;
    for (let i = 0; i < 12 && game.phase === 'draft'; i++) {
      gm.tickDraftTimers(now);
      now += 30000;
    }
    assert.equal(game.phase, 'setup');
    game.players.forEach(p => assert.equal(p.team.length, 3));
    assert.deepEqual(gm.tickDraftTimers(now), []);
  });

  test('a player who already picked is left alone while the other is played for', () => {
    const game = newDraft();
    gm.tickDraftTimers(0);
    gm.tickDraftTimers(30000); // bans; now in pick round 1
    gm.tickDraftTimers(60000); // clock for round 1 starts
    gm.pickCard('p1', game.players[1].draftCards[0].name);
    const events = gm.tickDraftTimers(90000);
    assert.deepEqual(kinds(events), ['pick']);
    assert.equal(events[0].playerId, 'p0');
    assert.equal(game.currentDraftPhase, 2);
    assert.equal(game.players[1].team.length, 1, 'the player who had picked was not given a second pick');
  });

  test('ignores games that are not drafting', () => {
    const game = newDraft();
    game.phase = 'battle';
    assert.deepEqual(gm.tickDraftTimers(0), []);
    assert.deepEqual(gm.tickDraftTimers(99999), []);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run (from `backend/`): `node --test test/draftclock.test.js`
Expected: FAIL: `gm.tickDraftTimers is not a function` in every test.

- [ ] **Step 3: Implement `tickDraftTimers`**

In `gameManager.js`, add `const DRAFT_TIME_MS = 30000;` beside the other top-level constants (after the `require` lines), and add this method to the class directly above `autoDraft(playerId) {`:

```js
  // Draft clock: each ban or pick round lasts DRAFT_TIME_MS. The server calls this about once a second.
  // Returns what happened so the server can tell the players.
  tickDraftTimers(now = Date.now()) {
    const events = [];
    for (const [gameId, game] of this.games) {
      if (game.phase !== 'draft') continue;
      const round = game.currentDraftPhase;
      if (!game.draftClock || game.draftClock.round !== round) {
        game.draftClock = { round, deadline: now + DRAFT_TIME_MS };
        events.push({ kind: 'timer', gameId, round, durationMs: DRAFT_TIME_MS, remainingMs: DRAFT_TIME_MS });
        continue;
      }
      if (now < game.draftClock.deadline) continue;

      for (const player of [...game.players]) {
        // Once the last undecided player has acted the round moves on; the next tick starts its clock
        if (game.phase !== 'draft' || game.currentDraftPhase !== round) break;
        const undecided = round === 0 ? !player.bannedCard : player.team.length < round;
        if (!undecided || !player.draftCards || player.draftCards.length === 0) continue;
        const card = player.draftCards[Math.floor(Math.random() * player.draftCards.length)];
        const result = round === 0 ? this.banCard(player.id, card.name) : this.pickCard(player.id, card.name);
        events.push({ kind: round === 0 ? 'ban' : 'pick', gameId, playerId: player.id, result });
      }
    }
    return events;
  }

```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `node --test test/draftclock.test.js` (Expected: 8 tests pass), then `npm test` (Expected: `# pass 104`, `# fail 0`; that is the 96 existing plus 8 new).

- [ ] **Step 5: Tell the players**

In `server.js`, directly below the `startTurnTimer` function, add:

```js
// Draft clock: the game manager does the auto-ban and auto-pick; here we tell the players.
setInterval(() => {
  for (const ev of gameManager.tickDraftTimers()) {
    if (ev.kind === 'timer') {
      io.to(ev.gameId).emit('draft-timer', { gameId: ev.gameId, round: ev.round, durationMs: ev.durationMs, remainingMs: ev.remainingMs });
    } else if (ev.result && ev.result.success) {
      io.to(ev.gameId).emit(ev.kind === 'ban' ? 'ban-complete' : 'pick-complete', ev.result);
    }
  }
}, 1000).unref();
```

Run: `node --check server.js` (Expected: no output). With the backend restarted (`npm start` in `backend/`), play Scenario D, wait 30 seconds without clicking in either tab: the ban round auto-plays (each tab shows its hand drop to 4 cards and the "You banned" line), and a further 30 seconds later round 1 auto-picks. This is verified again in Task 7.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(draft): 30 second clock per ban and pick round with auto-play"
git push origin main
```

---

### Task 2: Style-snapshot tooling and baselines

**Files:**
- Create: `frontend/scripts/style-snapshot.js`, `frontend/scripts/style-diff.mjs`

**Interfaces:**
- Produces: `style-snapshot.js` containing one arrow function `() => ({ "<tag.class.class>": ["<style signature>", ...] })` to pass as the `function` of `browser_evaluate` (with `filename` to save the result); `node scripts/style-diff.mjs a.json b.json` printing differences and exiting 1 when any exist.

- [ ] **Step 1: Write the snapshot function**

Create `frontend/scripts/style-snapshot.js`:

```js
() => {
  // Computed styles of the draft/battle chrome (everything except the hero cards), keyed by tag and class.
  const ROOTS = ['.game-sidebar', '.action-bar', '.battle-layout', '.draft-phase', '.setup-phase',
    '.initiative-overlay', '.game-over-overlay', '.turn-timer-bar', '.floating-surrender-button',
    '.spectator-count-button', '.spectator-list-modal'];
  const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
    'borderTopStyle', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'textTransform',
    'textAlign', 'display', 'position', 'width', 'height', 'paddingTop', 'paddingLeft', 'marginTop',
    'marginLeft', 'opacity', 'zIndex', 'overflowY'];
  const out = {};
  const seen = new Set();
  for (const sel of ROOTS) {
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (seen.has(el) || el.closest('.hero-card')) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        const sig = PROPS.map(p => cs[p]).join('|');
        const cls = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
        (out[`${el.tagName.toLowerCase()}.${cls}`] ||= new Set()).add(sig);
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}
```

- [ ] **Step 2: Write the diff script**

Create `frontend/scripts/style-diff.mjs`:

```js
// Compares two style snapshots. Usage: node scripts/style-diff.mjs before.json after.json
import { readFileSync } from 'node:fs';

const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
  'borderTopStyle', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'textTransform',
  'textAlign', 'display', 'position', 'width', 'height', 'paddingTop', 'paddingLeft', 'marginTop',
  'marginLeft', 'opacity', 'zIndex', 'overflowY'];

const load = file => {
  const text = readFileSync(file, 'utf8');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
};
const [a, b] = [load(process.argv[2]), load(process.argv[3])];
let diffs = 0;
for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (!(key in a)) { console.log(`+ only after:  ${key}`); diffs++; continue; }
  if (!(key in b)) { console.log(`- only before: ${key}`); diffs++; continue; }
  const sa = new Set(a[key]);
  const sb = new Set(b[key]);
  const onlyA = [...sa].filter(s => !sb.has(s));
  const onlyB = [...sb].filter(s => !sa.has(s));
  if (!onlyA.length && !onlyB.length) continue;
  diffs++;
  const [x, y] = [(onlyA[0] || '').split('|'), (onlyB[0] || '').split('|')];
  const changed = PROPS.filter((p, i) => x[i] !== y[i]).map((p, i) => `${p}: ${x[PROPS.indexOf(p)]} -> ${y[PROPS.indexOf(p)]}`);
  console.log(`~ ${key}\n    ${changed.join('\n    ') || '(signature sets differ)'}`);
}
console.log(diffs ? `\n${diffs} difference(s)` : 'no differences');
process.exit(diffs ? 1 : 0);
```

- [ ] **Step 3: Capture baselines**

Start `npm run dev`. Record `git rev-parse HEAD` as `BASE_SHA`. Run Scenario D until the draft ban screen shows and in one tab run `browser_evaluate` with the contents of `style-snapshot.js` as `function` and `filename` `.playwright-mcp/snap-before-ban.json`; screenshot `.playwright-mcp/p3-before-ban.png`. Repeat for: the pick screen (`snap-before-pick`), the setup screen (`snap-before-setup`), the initiative overlay (`snap-before-initiative`), and the battle screen on your turn and on the opponent's turn (`snap-before-battle-mine`, `snap-before-battle-theirs`), plus a screenshot of each (get the battle snapshots from Scenario R, which is quicker). Then click Surrender in one tab: snapshot and screenshot the game-over overlay (`snap-before-gameover`). Resize one tab to 390x844 and 667x375 during battle and screenshot (`p3-before-battle-phone.png`, `p3-before-battle-landscape.png`).

Expected: 7 snapshots and 9 screenshots exist under `.playwright-mcp/`.

- [ ] **Step 4: Sanity-check the diff tool**

Run: `node scripts/style-diff.mjs ../.playwright-mcp/snap-before-ban.json ../.playwright-mcp/snap-before-ban.json`
Expected: `no differences`, exit code 0. Run it with `snap-before-ban.json` and `snap-before-battle-mine.json`; Expected: lines starting `+ only after` and `- only before`, exit code 1.

- [ ] **Step 5: Commit the tools**

```bash
git add frontend/scripts
git commit -m "chore(ui): computed-style snapshot and diff tools"
git push origin main
```

---

### Task 3: Carve the screen rules out of App.css (no visual change)

**Files:**
- Create: `frontend/scripts/carve-game-css.mjs` (deleted at the end of this task), `frontend/src/styles/GameScreens.css`
- Modify: `frontend/src/App.css`, `frontend/src/App.tsx` (import)

**Interfaces:**
- Produces: `GameScreens.css` holding every rule whose classes are rendered by the draft/battle components and are not card classes, plus the media-query wrappers around them. `App.css` keeps everything else.

- [ ] **Step 1: Write the carve script**

Create `frontend/scripts/carve-game-css.mjs`:

```js
// One-time: moves the draft/setup/battle screen rules out of App.css into GameScreens.css.
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

function chunks(css) {
  const out = [];
  let depth = 0, start = 0, inComment = false, paren = 0;
  for (let i = 0; i < css.length; i++) {
    const two = css.slice(i, i + 2);
    if (!inComment && two === '/*') { inComment = true; i++; continue; }
    if (inComment) { if (two === '*/') { inComment = false; i++; } continue; }
    const ch = css[i];
    if (ch === '(') paren++; else if (ch === ')') paren--;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; } }
    else if (ch === ';' && depth === 0 && paren === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
  }
  const tail = css.slice(start).trim();
  if (tail) out.push(tail);
  return out.map(c => c.trim()).filter(Boolean);
}

const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const headOf = c => strip(c).trim().split('{')[0].trim().replace(/\s+/g, ' ');
const classesOf = h => [...h.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]);

const GENERIC = new Set(['selected', 'active', 'disabled', 'dead', 'enemy', 'used', 'show', 'open', 'on', 'off', 'transitioning', 'completed']);
function classNamesIn(file) {
  const t = read(file);
  const s = new Set();
  for (const m of t.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})/g))
    for (const c of (m[1] || m[2] || m[3]).split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(c)) s.add(c);
  for (const m of t.matchAll(/['"`]([a-z][\w-]*(?: [a-z][\w-]*)*)['"`]/g))
    for (const c of m[1].split(' ')) if (/^[a-z][a-z0-9]*-[\w-]+$/.test(c)) s.add(c);
  return s;
}

const cardSet = new Set([...classNamesIn('src/components/HeroCard.tsx'), ...classNamesIn('src/components/BattleFX.tsx')].filter(c => !GENERIC.has(c)));
const CARD_PREFIX = /^(status|tooltip|keyword|companion|shaman|totem|poison|card)(-|$)/;
const screenSet = new Set(['src/components/DraftPhase.tsx', 'src/components/BattlePhase.tsx', 'src/components/TurnTimerBar.tsx', 'src/App.tsx']
  .flatMap(f => [...classNamesIn(f)]).filter(c => !GENERIC.has(c)));
const isCard = c => cardSet.has(c) || CARD_PREFIX.test(c);
const goesToScreens = h => {
  const cls = classesOf(h);
  return cls.length > 0 && cls.some(c => screenSet.has(c)) && !cls.some(isCard);
};

const keep = [];
const carved = [];
const mixed = [];
for (const c of chunks(read('src/App.css'))) {
  const h = headOf(c);
  if (h.startsWith('@media') || h.startsWith('@supports')) {
    const open = c.indexOf('{');
    const rules = chunks(c.slice(open + 1, c.lastIndexOf('}')));
    const mine = rules.filter(r => goesToScreens(headOf(r)));
    const rest = rules.filter(r => !goesToScreens(headOf(r)));
    const wrap = list => `${c.slice(0, open).trim()} {\n${list.map(r => '  ' + r.replace(/\n/g, '\n  ')).join('\n\n')}\n}`;
    if (mine.length) carved.push(wrap(mine));
    if (rest.length) keep.push(wrap(rest));
    continue;
  }
  if (h.startsWith('@')) { keep.push(c); continue; } // keyframes and font-face stay global in App.css
  if (goesToScreens(h)) carved.push(c);
  else {
    keep.push(c);
    if (classesOf(h).some(x => screenSet.has(x))) mixed.push(h.slice(0, 100));
  }
}

writeFileSync('src/App.css', keep.join('\n\n') + '\n');
writeFileSync('src/styles/GameScreens.css', `/* Draft, setup and battle screen rules, carved from App.css. */\n\n${carved.join('\n\n')}\n`);
console.log(`carved ${carved.length} blocks, kept ${keep.length}`);
console.log('kept in App.css although they mention a screen class (card or mixed rules):');
mixed.forEach(h => console.log('  ' + h));
```

- [ ] **Step 2: Run it and read the report**

Run: `node scripts/carve-game-css.mjs`
Expected: `carved N blocks` with N in the 100s and a short list of kept mixed rules. Read the list: it should contain card selectors (for example `.hero-card.current-turn`, `.action-button.silenced`). If an obviously screen-only rule is kept only because a generic word leaked into `cardSet`, add that word to `GENERIC`, restore with `git checkout src/App.css`, delete `src/styles/GameScreens.css` and rerun. Then run `grep -c "" src/App.css src/styles/GameScreens.css` (Expected: both non-empty; the sum of rules is about the original plus media wrappers).

- [ ] **Step 3: Import the carved file after App.css**

In `frontend/src/App.tsx` add `import './styles/GameScreens.css';` directly below `import './App.css';`.

- [ ] **Step 4: Style diff must be empty**

Restart `npm run dev`. Repeat Task 2 Step 3 with `after` names (`snap-after-ban`, ... `snap-after-gameover`) and compare each pair: `node scripts/style-diff.mjs ../.playwright-mcp/snap-before-X.json ../.playwright-mcp/snap-after-X.json`.
Expected: `no differences` for every pair. Differences from different random heroes show up only inside `.hero-card` (excluded), so any difference is a real cascade change: find the rule involved (`git diff --stat` and the property named in the output), and fix by adjusting the carve predicate or by moving that single rule back into `App.css`; rerun. Do not proceed until all pairs are empty.

- [ ] **Step 5: Delete the script, build, commit**

Run: `git rm -f scripts/carve-game-css.mjs 2>/dev/null; rm -f scripts/carve-game-css.mjs` then `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

```bash
git add -A frontend
git commit -m "refactor(css): carve draft and battle rules out of App.css"
git push origin main
```

---

### Task 4: The colour re-tokenizer and applying it

**Files:**
- Create: `frontend/scripts/retoken-css.mjs`, `frontend/scripts/retoken-css.test.mjs`
- Modify (in place by the script): `frontend/src/styles/GameScreens.css`, `BattlePhone.css`, `TurnTimerBar.css`, `RewardsDisplay.css`
- Modify: `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Produces: `parseColour(text)`, `tokenFor(r, g, b)`, `retokenColour(text, { shadow })`, `retokenDeclaration(prop, value)`, `retokenCss(css)` exported from `retoken-css.mjs`; CLI `node scripts/retoken-css.mjs file.css [...]` rewriting files in place.

- [ ] **Step 1: Write the failing tests**

Create `frontend/scripts/retoken-css.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { retokenColour, retokenDeclaration, retokenCss } from './retoken-css.mjs';

test('accent colours map to the right token families', () => {
  assert.equal(retokenColour('#007bff'), 'var(--brass)');
  assert.equal(retokenColour('#28a745'), 'var(--verdigris)');
  assert.equal(retokenColour('#dc3545'), 'var(--ember)');
  assert.equal(retokenColour('#ffd700'), 'var(--brass-hi)');
  assert.equal(retokenColour('#ff6b6b'), 'var(--ember-hi)');
});

test('neutrals map by lightness', () => {
  assert.equal(retokenColour('#ffffff'), 'var(--bone)');
  assert.equal(retokenColour('#fff'), 'var(--bone)');
  assert.equal(retokenColour('#aaa'), 'var(--bone-dim)');
  assert.equal(retokenColour('#333'), 'var(--leather)');
  assert.equal(retokenColour('#000'), 'var(--felt-deep)');
});

test('dark blue surfaces become walnut, not brass', () => {
  assert.equal(retokenColour('rgb(30, 45, 70)'), 'var(--leather)');
  assert.equal(retokenColour('rgba(20, 35, 60, 0.98)'), 'var(--walnut)');
});

test('alpha becomes color-mix', () => {
  assert.equal(retokenColour('rgba(0, 0, 0, 0.8)'), 'color-mix(in srgb, var(--felt-deep) 80%, transparent)');
  assert.equal(retokenColour('rgba(255, 255, 255, 0.1)'), 'color-mix(in srgb, var(--bone) 10%, transparent)');
});

test('shadows use the shade colour whatever the hue', () => {
  assert.equal(retokenDeclaration('box-shadow', '0 4px 15px rgba(0, 123, 255, 0.3)'), '0 4px 15px color-mix(in srgb, var(--felt-deep) 30%, transparent)');
  assert.equal(retokenDeclaration('text-shadow', '2px 2px 4px rgba(0, 0, 0, 0.5)'), '2px 2px 4px color-mix(in srgb, var(--felt-deep) 50%, transparent)');
});

test('gradients and named colours', () => {
  assert.equal(retokenDeclaration('background', 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)'), 'linear-gradient(135deg, var(--brass) 0%, var(--brass) 100%)');
  assert.equal(retokenDeclaration('color', 'white'), 'var(--bone)');
  assert.equal(retokenDeclaration('background', 'transparent'), 'transparent');
});

test('caps and fonts', () => {
  assert.equal(retokenDeclaration('text-transform', 'uppercase'), 'none');
  assert.equal(retokenDeclaration('text-transform', 'capitalize'), 'capitalize');
  assert.equal(retokenDeclaration('font-family', "'Orbitron', monospace"), 'var(--font-ui)');
  assert.equal(retokenDeclaration('font-family', '"Apple Color Emoji", sans-serif'), '"Apple Color Emoji", sans-serif');
});

test('whole stylesheet: selectors and media queries are left alone', () => {
  const css = '@media (max-width: 768px) {\n  .a:hover { color: #fff; border: 1px solid rgba(255, 0, 0, 0.5); }\n}\n.b { width: 10px; }';
  const out = retokenCss(css);
  assert.equal(out, '@media (max-width: 768px) {\n  .a:hover { color: var(--bone); border: 1px solid color-mix(in srgb, var(--ember) 50%, transparent); }\n}\n.b { width: 10px; }');
  assert.equal(retokenCss(out), out); // idempotent
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test scripts/`
Expected: FAIL: `Cannot find module './retoken-css.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/scripts/retoken-css.mjs`:

```js
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
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test scripts/`
Expected: all 8 tests pass. If `dark blue surfaces` fails, print `tokenFor(30,45,70)` and `tokenFor(20,35,60)` and adjust the lightness thresholds in `tokenFor` (not the tests) so that rgb(30,45,70) lands on `--leather` and rgb(20,35,60) on `--walnut`; rerun.

- [ ] **Step 5: Apply it to the four files and lint**

Run: `node scripts/retoken-css.mjs src/styles/GameScreens.css src/styles/BattlePhone.css src/styles/TurnTimerBar.css src/styles/RewardsDisplay.css`
Append to `MIGRATED` in `check-tokens.mjs`: `'styles/GameScreens.css'`, `'styles/BattlePhone.css'`, `'styles/TurnTimerBar.css'`, `'styles/RewardsDisplay.css'`.
Run: `npm run check:tokens`
Expected: `check-tokens: 15 files clean`. If a raw colour remains (an unusual form such as `rgb(from ...)`, a colour inside `content:` or a data URI), fix it by hand with the nearest token and note it.

- [ ] **Step 6: Build and look**

Run: `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success). Restart dev; run Scenario D and screenshot the ban screen, battle screen and game-over. They are now felt, bone and brass but unpolished (that is Task 5). Confirm nothing is unreadable (dark text on dark panels): list each such spot for Task 5.

- [ ] **Step 7: Commit**

```bash
git add -A frontend
git commit -m "feat(ui): re-token the draft and battle styles"
git push origin main
```

---

### Task 5: Identity overrides, floating controls and copy

**Files:**
- Create: `frontend/src/styles/GameTheme.css`
- Modify: `frontend/src/components/ui/Icon.tsx`, `frontend/src/components/BattlePhase.tsx`, `frontend/src/components/DraftPhase.tsx`, `frontend/src/App.tsx`, `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Consumes: `Icon`, primitives (`ui-btn`, `ui-btn--danger`, `ui-btn--block`, `ui-badge`, `ui-notice`).
- Produces: classes `battle-float`, `floating-surrender-button`, `spectator-count-button`, `spectator-list-modal`, `opponent-disconnect-notice`, `ui-btn` usage on the stop-spectating button; `IconName` gains `'eye' | 'user' | 'flag'`.

- [ ] **Step 1: Add the icons and the file to the lint list**

In `Icon.tsx` add to `PATHS` (after `unlock`):

```tsx
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  user: 'M5 20a7 7 0 0 1 14 0M8.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
```

Append to `MIGRATED`: `'styles/GameTheme.css'`.

- [ ] **Step 2: Write `GameTheme.css`**

```css
/* Draft and battle identity. Loaded after GameScreens.css, so these win at equal specificity. */

/* Halves of the board: the opponent's side is warm, yours is green */
.opponent-area { background: color-mix(in srgb, var(--ember) 14%, transparent); }
.player-area { background: color-mix(in srgb, var(--verdigris) 12%, transparent); }
.team-label { font-family: var(--font-display); font-weight: 400; color: var(--bone); text-shadow: none; }
.player-profile-icon img, .profile-icon-small { border: 1px solid var(--brass); border-radius: var(--radius-control); }

/* Sidebars: the log on the left, the actions on the right, both walnut with a brass edge */
.game-sidebar { background: var(--walnut); border-right: 1px solid var(--brass-dim); color: var(--bone); font-family: var(--font-ui); }
.action-bar { background: var(--walnut); border-left: 1px solid var(--brass-dim); color: var(--bone); font-family: var(--font-ui); }
.game-sidebar h3, .game-sidebar h4, .action-bar h3 { font-family: var(--font-display); font-weight: 400; color: var(--bone); text-shadow: none; }
.connection-status { background: var(--leather); color: var(--bone); border: 1px solid var(--brass-dim); }

/* Buttons everywhere on these screens read as brass; secondary ones as outlines */
.action-button {
  background: var(--brass);
  color: var(--felt-deep);
  border: 1px solid var(--brass-hi);
  border-radius: var(--radius-control);
  font: 700 var(--text-md) / 1.1 var(--font-ui);
  box-shadow: none;
}
.action-button:hover:not(:disabled) { background: var(--brass-hi); transform: none; box-shadow: none; }
.action-button:focus-visible, .return-to-lobby-button:focus-visible, .abandon-draft-button:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }
.action-button:disabled, .action-button.used {
  background: var(--leather);
  color: var(--bone-dim);
  border-color: var(--brass-dim);
  opacity: 0.7;
  cursor: not-allowed;
}
.action-button.end-turn-button, .action-button.cancel-ability-selection { background: transparent; color: var(--bone); border-color: var(--brass); }
.action-button.end-turn-button:hover:not(:disabled), .action-button.cancel-ability-selection:hover:not(:disabled) { background: var(--leather); }
.ability-option-button { background: var(--leather); color: var(--bone); border: 1px solid var(--brass-dim); border-radius: var(--radius-control); }
.ability-option-button:hover:not(:disabled) { border-color: var(--brass); background: var(--leather-hi); }
.abandon-draft-button { background: transparent; color: var(--ember-hi); border: 1px solid var(--ember); border-radius: var(--radius-control); text-transform: none; letter-spacing: 0; font-family: var(--font-ui); }
.abandon-draft-button:hover { background: var(--ember); color: var(--bone); transform: none; box-shadow: none; }

/* Turn banner and status lines */
.current-turn, .turn-status { color: var(--bone); font-weight: 700; }
.current-turn { color: var(--verdigris); }
.opponent-turn { color: var(--bone-dim); }
.spectator-turn, .spectator-label { color: var(--bone); }

/* Battle log */
.log-entry { background: var(--leather); border: 1px solid var(--brass-dim); border-left: 3px solid var(--brass-dim); border-radius: var(--radius-control); color: var(--bone); }
.log-entry.crit { border-left-color: var(--brass-hi); }
.log-entry.killed { border-left-color: var(--ember); }
.log-placeholder { color: var(--bone-dim); }
.log-entries .hero-name { color: var(--bone); font-weight: 700; }
.log-entries .ability-name, .log-entries .special-name { color: var(--brass-hi); }
.log-entries .special-name { font-style: italic; }
.log-entries .target-name { color: var(--bone); }
.log-entries .hit { color: var(--ember-hi); }
.log-entries .miss { color: var(--bone-dim); }
.log-entries .heal { color: var(--verdigris); }
.log-entries .crit { color: var(--brass-hi); font-weight: 700; }

/* Overlays: initiative roll and game over */
.initiative-overlay, .game-over-overlay { background: var(--scrim); backdrop-filter: none; }
.initiative-phase, .game-over-modal {
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  color: var(--bone);
  font-family: var(--font-ui);
}
.initiative-phase h2, .initiative-phase h3, .game-over-title { font-family: var(--font-display); font-weight: 400; text-shadow: none; }
.game-over-title { animation: none; filter: none; }
.game-over-title.winner { color: var(--verdigris); border-bottom-color: var(--verdigris); }
.game-over-title.loser { color: var(--ember-hi); border-bottom-color: var(--ember); }
.game-over-message { color: var(--bone-dim); }
.return-to-lobby-button {
  background: var(--brass);
  color: var(--felt-deep);
  border: 1px solid var(--brass-hi);
  border-radius: var(--radius-control);
  font: 700 var(--text-md) / 1.1 var(--font-ui);
  box-shadow: none;
}
.return-to-lobby-button:hover { background: var(--brass-hi); transform: none; box-shadow: none; }
.return-to-lobby-button.secondary { background: transparent; color: var(--bone); border-color: var(--brass); }
.return-to-lobby-button.danger { background: transparent; color: var(--ember-hi); border-color: var(--ember); }
.return-to-lobby-button.danger:hover { background: var(--ember); color: var(--bone); }

/* Draft and setup */
.current-team, .opponent-team { background: color-mix(in srgb, var(--leather) 70%, transparent); border: 1px solid var(--brass-dim); }
.draggable-hero-slot { cursor: grab; }
.position-badge { background: var(--brass); color: var(--felt-deep); border: 2px solid var(--walnut); font-family: var(--font-ui); }
.ready-status, .opponent-ready-indicator { background: color-mix(in srgb, var(--verdigris) 18%, transparent); border: 1px solid var(--verdigris); color: var(--bone); }
.ready-indicator, .opponent-ready-indicator span { display: inline-flex; align-items: center; gap: var(--space-2); }
.ready-button { background: var(--brass); }
.banned-cards-section h3 { color: var(--ember-hi); text-shadow: none; letter-spacing: 0; }

/* Floating controls in the corners of the battle screen */
.floating-surrender-button, .spectator-count-button, .spectator-list-modal, .opponent-disconnect-notice { position: fixed; z-index: 1000; }
.floating-surrender-button { right: 20px; bottom: 20px; }
.spectator-count-button {
  right: 220px;
  bottom: 20px;
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  font: 700 var(--text-sm) / 1 var(--font-ui);
  color: var(--bone);
  background: var(--walnut);
  border: 1px solid var(--brass);
  border-radius: 50%;
  box-shadow: var(--shadow-panel);
}
.spectator-count-button:hover { background: var(--leather); transform: none; }
.spectator-list-modal {
  right: 220px;
  bottom: 90px;
  min-width: 220px;
  max-width: 300px;
  max-height: 300px;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--walnut);
  color: var(--bone);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
}
.spectator-list-modal h3 { margin: 0 0 var(--space-3); padding-bottom: var(--space-2); font: 400 var(--text-lg) / 1.1 var(--font-display); border-bottom: 1px solid var(--brass-dim); }
.spectator-list-modal ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.spectator-list-modal li { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); background: var(--leather); border-radius: var(--radius-control); font-size: var(--text-sm); }
.opponent-disconnect-notice {
  right: 20px;
  bottom: 130px;
  min-width: 200px;
  padding: var(--space-3) var(--space-5);
  text-align: center;
  color: var(--bone);
  background: var(--walnut);
  border: 1px solid var(--ember);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.opponent-disconnect-notice .notice-title { display: flex; align-items: center; justify-content: center; gap: var(--space-2); font-size: var(--text-sm); margin-bottom: var(--space-1); }
.opponent-disconnect-notice .notice-count { font: 400 var(--text-2xl) / 1 var(--font-display); color: var(--ember-hi); }
.opponent-disconnect-notice .notice-hint { font-size: var(--text-xs); color: var(--bone-dim); margin-top: var(--space-1); }

@media (prefers-reduced-motion: reduce) {
  .turn-indicator, .game-over-title { animation: none; }
  .action-button, .return-to-lobby-button { transition: none; }
}
```

- [ ] **Step 3: Import it**

In `App.tsx` add `import './styles/GameTheme.css';` below the `GameScreens.css` import.

- [ ] **Step 4: Replace the inline-styled controls in `BattlePhase.tsx`**

Add `import Icon from './ui/Icon';` to the imports. Then make these replacements (each `old` is the current code; the inline `style` objects and `onMouseEnter`/`onMouseLeave` handlers are deleted):

1. Stop-spectating button inside the action bar becomes:

```tsx
              <button
                className="ui-btn ui-btn--danger ui-btn--block stop-spectating-button"
                onClick={onStopSpectating}
              >
                Stop spectating
              </button>
```
and the line above it, `<div className="spectator-label">👁️ Watching {currentPlayer.name}'s perspective</div>`, becomes `<div className="spectator-label"><Icon name="eye" /> Watching {currentPlayer.name}'s perspective</div>`; the following `<div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>You cannot interact with the game</div>` becomes `<div className="ui-hint">You cannot interact with the game</div>`.

2. Spectator count button:

```tsx
        <button
          className="spectator-count-button"
          onClick={() => setShowSpectatorList(!showSpectatorList)}
          aria-label={`Spectators: ${spectators.length}`}
        >
          <Icon name="eye" size={22} />
          <span>{spectators.length}</span>
        </button>
```

3. Spectator list modal:

```tsx
        <div className="spectator-list-modal">
          <h3>Spectators ({spectators.length})</h3>
          <ul>
            {spectators.map((spectator) => (
              <li key={spectator.socketId}>
                <Icon name="user" />
                <span>{spectator.username}</span>
              </li>
            ))}
          </ul>
        </div>
```

4. Disconnect countdown:

```tsx
        <div className="opponent-disconnect-notice" role="status">
          <div className="notice-title"><Icon name="warning" /> {opponent.name} disconnected</div>
          <div className="notice-count">{opponentDisconnectTime}s</div>
          <div className="notice-hint">Auto-forfeit in progress</div>
        </div>
```

5. Surrender button:

```tsx
        <button
          className="ui-btn ui-btn--danger floating-surrender-button"
          onClick={handleSurrenderClick}
        >
          <Icon name="flag" />
          Surrender
        </button>
```

6. In the surrender confirmation, `<button className="return-to-lobby-button" onClick={handleConfirmSurrender} style={{ backgroundColor: '#dc3545' }}>Yes, Surrender</button>` becomes `<button className="return-to-lobby-button danger" onClick={handleConfirmSurrender}>Yes, surrender</button>`.

Copy edits in the same file: `🎲 Tie! Both rolled {n}` becomes `Tie! Both rolled {n}`; `🎉 You won the starting roll!` becomes `You won the starting roll!`; `Roll Initiative` becomes `Roll initiative`; `Go First`/`Go Second` become `Go first`/`Go second`; `'You Win!'`/`'You Lose!'`/`'Tutorial Complete!'` become `'You win!'`/`'You lose!'`/`'Tutorial complete!'`.

- [ ] **Step 5: `DraftPhase.tsx` copy and icons**

Add `import Icon from './ui/Icon';`. Changes: `<span>✓ Opponent is ready</span>` becomes `<span><Icon name="check" /> Opponent is ready</span>`; `✓ You are ready - Waiting for opponent...` becomes `<Icon name="check" /> You are ready. Waiting for opponent...` (inside the existing span); `Your Team (0/3)` and `Your Team ({n}/3)` become `Your team (...)`; `Opponent's Team` becomes `Opponent's team`; `Ban Selected Card` becomes `Ban card`; `Pick Selected Card` becomes `Pick card`.

- [ ] **Step 6: `App.tsx` sidebar copy**

Replace, exactly: `🏆 Wins:` with `Wins:`; `💀 Losses:` with `Losses:`; `"● Your turn to pick"` with `"Your turn to pick"`; every `"⏳ Waiting for opponent"` with `"Waiting for opponent"`; `<h3>BANNED CARDS</h3>` with `<h3>Banned cards</h3>`; both `✕ ABANDON DRAFT` with `Abandon draft`; `"⚔️ Set your attack order"` with `"Set your attack order"`; `"✅ Both players ready!"` with `"Both players are ready"`; `👁️ Watching: {activePlayer.name}'s Turn` with `Watching: {activePlayer.name}'s turn`; `🔥 Your Turn` with `Your turn`; `⏳ Opponent's Turn` with `Opponent's turn`. In the log: `✨ <span className="special-name">...` becomes `<span className="special-name">...` (drop the `✨ `); `🔮 Twin Spell activated! Casting again...` becomes `Twin Spell activated. Casting again...`; drop `👼 ` and `💫 ` prefixes; `CRITICAL HIT! ` becomes `Critical hit! `.

- [ ] **Step 7: Lint, types, build**

Run: `npm run check:tokens` (Expected: `16 files clean`), `npx tsc --noEmit 2>&1 | grep -E "BattlePhase|DraftPhase|Icon.tsx"` (Expected: only errors that existed before this phase: none new), `git grep -n -E "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" -- src/components/BattlePhase.tsx src/components/DraftPhase.tsx` (Expected: no output other than comments or `console.` lines), `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

- [ ] **Step 8: Look, iterate, commit**

Run Scenarios D and R and screenshot each screen against the Task 2 baselines. Fix anything unreadable or ugly in `GameTheme.css` (not in the carved file), re-screenshot until each of these reads well: ban screen, pick screen, setup, initiative overlay, battle (both turns), game-over, surrender confirm. Then:

```bash
git add -A frontend
git commit -m "feat(ui): identity overrides for draft and battle, no emoji or inline styles"
git push origin main
```

---

### Task 6: Draft clock dial and the rotate prompt

**Files:**
- Create: `frontend/src/components/DraftClock.tsx`, `frontend/src/components/RotatePrompt.tsx`
- Modify: `frontend/src/types.ts`, `frontend/src/App.tsx`, `frontend/src/components/DraftPhase.tsx`, `frontend/src/components/ui/Icon.tsx`, `frontend/src/styles/GameTheme.css`, `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Consumes: server event `draft-timer` `{ gameId, round, durationMs, remainingMs }` from Task 1; `Icon`.
- Produces: `DraftClock` (`deadline: number; durationMs: number; action: 'ban' | 'pick'`), `RotatePrompt` (no props), `IconName` gains `'rotate'`, `DraftPhase` gains an optional prop `draftTimer?: { round: number; deadline: number; durationMs: number } | null`.

- [ ] **Step 1: Icon and lint list**

In `Icon.tsx` add to `PATHS` (after `flag`): `rotate: 'M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M20 12a8 8 0 0 1-14 5.3M6 21v-4h4',`
Append to `MIGRATED`: `'components/DraftClock.tsx'`, `'components/RotatePrompt.tsx'`.

- [ ] **Step 2: Write `DraftClock.tsx`**

```tsx
import React, { useEffect, useState } from 'react';

interface DraftClockProps {
  // Epoch milliseconds when the round ends
  deadline: number;
  durationMs: number;
  action: 'ban' | 'pick';
}

// The dial only appears for the last 10 seconds of a round
const SHOW_AT_MS = 10000;
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DraftClock: React.FC<DraftClockProps> = ({ deadline, action }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, deadline - now);
  // At zero the server has already played for you
  if (remaining > SHOW_AT_MS || remaining <= 0) return null;

  const seconds = Math.ceil(remaining / 1000);
  const fraction = remaining / SHOW_AT_MS;
  const verb = action === 'ban' ? 'banned' : 'picked';
  return (
    <div
      className={`draft-clock${seconds <= 3 ? ' draft-clock--urgent' : ''}`}
      role="timer"
      aria-label={`${seconds} seconds left. A random card will be ${verb} for you.`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="draft-clock-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="draft-clock-hand"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="draft-clock-seconds">{seconds}</span>
      <span className="draft-clock-note">{action === 'ban' ? 'Auto-ban' : 'Auto-pick'}</span>
    </div>
  );
};

export default DraftClock;
```

- [ ] **Step 3: Write `RotatePrompt.tsx`**

```tsx
import React from 'react';
import Icon from './ui/Icon';

// Shown by CSS only when the screen is narrow and upright (see GameTheme.css); the game keeps running behind it.
const RotatePrompt: React.FC = () => (
  <div className="rotate-prompt" role="alert">
    <Icon name="rotate" size={56} className="rotate-prompt-icon" />
    <h2>Rotate your phone</h2>
    <p>Hero's Call is played sideways. Your game is still running.</p>
  </div>
);

export default RotatePrompt;
```

- [ ] **Step 4: Types and `App.tsx`**

In `types.ts`, next to the `'turn-timer'` entry (line ~357) add: `'draft-timer': (data: { gameId: string; round: number; durationMs: number; remainingMs: number }) => void;`

In `App.tsx`:
1. Add `import RotatePrompt from './components/RotatePrompt';`.
2. Below the `turnTimer` state (line ~210) add: `const [draftTimer, setDraftTimer] = useState<{ round: number; durationMs: number; deadline: number } | null>(null);`
3. Next to the existing `socket.on('turn-timer', ...)` listener (line ~624) add, following exactly the same registration and cleanup pattern that listener uses:

```tsx
    socket.on('draft-timer', (data) => {
      setDraftTimer({ round: data.round, durationMs: data.durationMs, deadline: Date.now() + data.remainingMs });
    });
```
4. In the `<DraftPhase ... />` element (line ~2252) add the prop `draftTimer={draftTimer}`.
5. In the root `return (<div className="App">` after the `app-layout` div's closing tag, add: `{state.gameState && state.gameState.phase !== 'waiting' && <RotatePrompt />}`.

- [ ] **Step 5: `DraftPhase.tsx`**

Add `import DraftClock from './DraftClock';`. Add `draftTimer?: { round: number; deadline: number; durationMs: number } | null;` to `DraftPhaseProps` and `draftTimer` to the destructured props. In `renderBanPhase`, as the last child inside the root `<div className="draft-phase">`:

```tsx
        {draftTimer && draftTimer.round === gameState.currentDraftPhase && !currentPlayer.bannedCard && (
          <DraftClock key={draftTimer.round} deadline={draftTimer.deadline} durationMs={draftTimer.durationMs} action="ban" />
        )}
```
and in `renderPickPhase`, as the last child inside the root `<div className="draft-phase">` (after `draft-main-content`):

```tsx
        {draftTimer && draftTimer.round === gameState.currentDraftPhase && canPick() && (
          <DraftClock key={draftTimer.round} deadline={draftTimer.deadline} durationMs={draftTimer.durationMs} action="pick" />
        )}
```

- [ ] **Step 6: Styles (append to `GameTheme.css`)**

```css
/* Draft clock: a brass dial in the corner for the last 10 seconds of a round */
.draft-clock {
  position: fixed;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 900;
  width: 6rem;
  height: 6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--walnut);
  border: 1px solid var(--brass);
  border-radius: 50%;
  box-shadow: var(--shadow-panel), var(--inset-frame);
  color: var(--bone);
}
.draft-clock svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.draft-clock-track { fill: none; stroke: var(--leather); stroke-width: 6; }
.draft-clock-hand { fill: none; stroke: var(--brass-hi); stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 200ms linear; }
.draft-clock--urgent .draft-clock-hand { stroke: var(--ember-hi); }
.draft-clock-seconds { font: 400 var(--text-2xl) / 1 var(--font-display); }
.draft-clock-note { font-size: var(--text-xs); color: var(--bone-dim); }

/* Upright phones: ask for landscape. Narrow tall desktop windows get it too; the board is unusable there as well. */
.rotate-prompt { display: none; }
@media (orientation: portrait) and (max-width: 700px) {
  .rotate-prompt {
    position: fixed;
    inset: 0;
    z-index: 5000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    text-align: center;
    background: var(--felt-surface);
    color: var(--bone);
  }
  .rotate-prompt h2 { margin: 0; font: 400 var(--text-xl) / 1.1 var(--font-display); }
  .rotate-prompt p { margin: 0; max-width: 18rem; color: var(--bone-dim); }
  .rotate-prompt-icon { color: var(--brass-hi); animation: rotate-hint 900ms var(--ease) both; }
}
@keyframes rotate-hint { from { transform: rotate(-90deg); } to { transform: rotate(0deg); } }
@media (prefers-reduced-motion: reduce) {
  .draft-clock-hand { transition: none; }
  .rotate-prompt-icon { animation: none; }
}
```

- [ ] **Step 7: Lint, types, build**

Run: `npm run check:tokens` (Expected: `18 files clean`), `npx tsc --noEmit 2>&1 | grep -E "DraftClock|RotatePrompt|DraftPhase|Icon.tsx"` (Expected: no new errors), `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

- [ ] **Step 8: Look at it**

Run Scenario D. In the ban round do nothing for 20 seconds: from about the 20 second mark a brass dial with the seconds and "Auto-ban" appears top right in both tabs, its ring draining, turning ember for the last 3 seconds. Click "Ban card" in one tab: its dial disappears while the other tab's stays. At 30 seconds the untouched tab's hand drops to four cards on its own and the next round starts. Screenshot the dial and its urgent state. Resize a tab to 390x844: the rotate prompt covers the screen; resize to 667x375: it disappears.

- [ ] **Step 9: Commit**

```bash
git add -A frontend
git commit -m "feat(draft): 10 second dial for the draft clock and a rotate prompt for upright phones"
git push origin main
```

---

### Task 7: Verify every state

**Files:** none modified unless a check fails.

- [ ] **Step 1: Gates**

Run: `npm run check:tokens`, `node --test scripts/`, `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir`, and `cd ../backend && npm test`.
Expected: `18 files clean`, 8 tests pass, build success, backend `# pass 104` (the 96 existing plus the 8 draft clock tests) and `# fail 0`.

- [ ] **Step 2: Desktop states**

Using Scenarios D and R at 1280x800, screenshot and read each: ban, pick (own turn and waiting), setup (with and without the opponent ready), initiative (before roll, after roll, tie if it happens, choice), battle (own turn: attack, ability selection with `ability-options`, target selection; opponent turn), surrender confirm, game over (win and lose; rewards block visible if XP/coin data arrives).
For each, `browser_evaluate` `document.documentElement.scrollWidth <= innerWidth` is `true`.

- [ ] **Step 3: Cards keep all text**

On the ban and pick screens and in battle, `browser_evaluate` over every `.hero-card .card-details`: `d.scrollHeight - d.clientHeight` is `0` for all. If Blood Hunter appears, screenshot it.

- [ ] **Step 4: Phone and short landscape**

Resize to 390x844, 320x640 and 667x375 during a battle; screenshot each. The sidebar log, team rows, action bar, surrender, timer and spectator controls are all visible and none overlaps another. Compare with `p3-before-battle-phone.png` and `p3-before-battle-landscape.png`: layout is the same, only the look changed.

- [ ] **Step 5: Long names**

In a battle tab set `document.querySelector('.player-label').textContent = 'WWWWWWWWWWWW'` and the same for `.opponent-label` at 390x844 and 667x375; confirm `label.scrollWidth <= label.parentElement.clientWidth` or that it truncates without overlapping the cards.

- [ ] **Step 6: Forced states**

With a battle on screen use `browser_evaluate` to force three states and screenshot each:
1. Disconnect notice: append the markup `<div class="opponent-disconnect-notice"><div class="notice-title">Admin2 disconnected</div><div class="notice-count">12s</div><div class="notice-hint">Auto-forfeit in progress</div></div>` to `document.body`.
2. Spectator button and list: append `<button class="spectator-count-button"><span>2</span></button>` and a `.spectator-list-modal` with two `<li>` rows.
3. Survival block: append `<div class="survival-info"><div class="survival-stats"><div class="survival-wins">Wins: 3</div><div class="survival-losses">Losses: 1</div></div></div>` as the first child of `.game-sidebar`.
All three read on the felt with brass or ember borders and no raw red or blue. Record that these were forced, not live.

- [ ] **Step 7: Turn timer and reduced motion**

During your own turn wait for the `turn-timer-bar`; screenshot it. `browser_emulate_media` `reducedMotion: 'reduce'`, reload into a battle (Scenario R again) and check `getComputedStyle(document.querySelector('.game-over-title') ?? document.body).animationName` after game over is `none`, and that `.turn-indicator`, if present, has `animationName` `none`.

- [ ] **Step 8: Draft clock, live**

Scenario D, two tabs, no clicks for 20 seconds in the ban round. From about the 20 second mark both tabs show the dial (seconds and "Auto-ban"); screenshot it, and again in the last 3 seconds (ember ring). Repeat with one tab banning at the 22 second mark: that tab's dial disappears while the other's stays. At 30 seconds the idle tab's hand drops to four cards without any click and the next round starts (read the new sidebar text in both tabs). Do the same once in a pick round: the idle tab ends round 1 with exactly one hero on its team. `browser_evaluate` `document.querySelectorAll('.draft-clock').length` is `0` at 5 seconds into any round and `1` at 25 seconds for an idle player.

- [ ] **Step 9: Rotate prompt**

In a draft or battle tab resize to 390x844 and screenshot: the rotate prompt covers the screen. Resize to 667x375: it is gone. In the lobby at 390x844 there is no prompt. With `browser_emulate_media` `reducedMotion: 'reduce'` the icon does not animate (`getComputedStyle(document.querySelector('.rotate-prompt-icon')).animationName` is `none`).

- [ ] **Step 10: Copy and currency sweep**

Run: `git grep -n -iE "victory point|\bVP\b" -- src/components/BattlePhase.tsx src/components/DraftPhase.tsx src/styles/GameScreens.css src/styles/GameTheme.css` (Expected: no output). Run: `git grep -n -E "ABANDON|BANNED|Selected Card" -- src/components src/App.tsx` (Expected: no output).

- [ ] **Step 11: Record completion and clean up**

Append to the spec's Phases section: `Phase 3 complete (YYYY-MM-DD). Known follow-ups: <items>.` Include: the spec's bottom action tray was not built (action bar stays on the right; upright phones get a rotate prompt, a real portrait layout would be separate work); the setup screen has no clock; Tutorial overlay, Spectator list screen, Friends overlay and Messages still old styling (phases 4 and 5); anything from Steps 2 to 7 you could not fix. Stop the dev server, delete `.playwright-mcp`, confirm `git status` is clean and `frontend/dist` untouched, then:

```bash
git add docs
git commit -m "docs: record phase 3 completion"
git push origin main
```
