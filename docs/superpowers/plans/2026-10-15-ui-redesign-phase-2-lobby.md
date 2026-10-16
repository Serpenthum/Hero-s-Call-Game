# UI Redesign Phase 2: The Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the lobby (header, ledger, hero stage, mode placards, unlock toast, XP bar) on the "table" design system, and retire the 2.5k-line `GameLobby.css` without breaking the other screens that borrow from it.

**Architecture:** `GameLobby.css` is carved up first: the global bits other screens need (font import, `:root` colour variables, `*` reset, `.modal-overlay`), plus the Quest-reward, Rules and Settings modal rules, are copied into small files that their own components import. Then the lobby gets new markup and a new tokens-only `Lobby.css`, `XPBar.css` is rewritten on tokens, the How-to-play modal moves out of `GameLobby.tsx` into its own component, and finally `GameLobby.css` is deleted. Game logic in `GameLobby.tsx` (unlock reveal, quest reveal, search state, handlers) does not change.

**Tech Stack:** React 18, plain CSS on `tokens.css` / `primitives.css`, Node 20 lint script, Playwright MCP tools for screenshots (the backend runs locally on port 3001, so Quick admin login works).

**Spec:** `docs/superpowers/specs/2026-10-15-ui-redesign-design.md` (phase 1 plan: `docs/superpowers/plans/2026-10-15-ui-redesign-phase-1-foundation.md`)

## Global Constraints

- Colours (verbatim): felt `#101b18`, walnut `#241a14`, leather `#33261d`, brass `#b08a45`, bone `#e6dfcf`, ember `#c4482f`, verdigris `#5fa08a`; all live in `tokens.css`. No Bootstrap colours.
- Type: IM Fell English for titles and large numerals; Alegreya Sans for UI text; sentence case; no all-caps eyebrow labels; no emoji icons (use `Icon`); lines under 80 characters.
- Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow.
- Motion only in response to actions, plus one orchestrated moment per screen (the lobby's is the unlock reveal and the hero swapping on the felt); `prefers-reduced-motion` respected.
- Quality floor: works from 320px wide up to desktop, visible keyboard focus, sufficient contrast.
- Copy: buttons say what happens; the same action keeps one name through the flow ("Sign in" and "Sign out"); errors say how to fix them.
- Currency (user rule): never named. Show `Coin` beside a number. No "VP", "victory points" or "coins" in UI text.
- Hero cards: cards use the UI font now (retuned in commit dd8c033). Do not edit `HeroCard.tsx`/`HeroCard.css` here. A card must show its image, stats and ALL ability and special text.
- Push straight to `main`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never commit `frontend/dist`; verification builds use `--outDir "$TEMP/hc-dist"`.
- Gauntlet stays hidden in the lobby (`SHOW_GAUNTLET = false`); phase 5 turns it on.
- Existing `tsc --noEmit` errors are unrelated. Gates: `npm run check:tokens`, `vite build`, backend `npm test`, screenshots.
- Dev server note: if a CSS file served by Vite looks empty or stale after a rewrite, restart `npm run dev` (it happened once in phase 1).

## Review Focus

- A player with no quests today: the ledger shows a line saying so, not an empty box (Task 3).
- A very long username (12 characters of wide letters, such as `WWWWWWWWWWWW`) wraps inside the ledger and header, no overflow at 320px (Task 5).
- Searching: the placard of the mode being searched shows the finding-opponent state with a Leave queue button; pressing it returns the placard to normal (Task 5).
- Unlock reveal: with `heroscall.seenModes.<id>` cleared, the toast appears and the unlocked placard rises in once (Task 5).
- Short landscape phone (667x375) and tablet portrait (768x1024): every placard, the ledger and the Sign out button are reachable by scrolling; the page never scrolls sideways (Task 5).
- The tutorial's lobby step still finds `[data-tutorial="collection"]` (the Binder tile) (Task 5).
- Reduced motion: placard rise, hero swap, quest pop, coin bump and dots do not animate (Task 5).

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/scripts/carve-lobby-css.mjs` (new; deleted in Task 4) | One-time script that copies shared rules out of `GameLobby.css` |
| `frontend/src/styles/legacy-base.css` (new) | `@import` of Orbitron/Rajdhani, old `:root` variables, `*` reset, `.modal-overlay`. Dropped in phase 5 when no screen uses them. |
| `frontend/src/styles/QuestRewardModal.css`, `RulesModal.css`, `SettingsModal.css` (new, carved) | Existing modal rules, unchanged; restyled in phase 4 |
| `frontend/src/components/HowToPlayModal.tsx` (new) | The How-to-play modal, moved out of `GameLobby.tsx` |
| `frontend/src/styles/Lobby.css` (new) | All lobby layout and styling, tokens only |
| `frontend/src/styles/XPBar.css` (rewrite) | XP bar on tokens |
| `frontend/src/components/ui/Icon.tsx` (modify) | New icons: `dice swords flame tower logout unlock` |
| `frontend/src/components/GameLobby.tsx` (modify) | New markup; logic unchanged |
| `frontend/src/styles/GameLobby.css` (delete) | Replaced by the files above |
| `frontend/scripts/check-tokens.mjs` (modify) | Add migrated files |

All commands run from `frontend/` unless a path says otherwise. Start the dev server with `npm run dev` (port 5173, or the next free one; read the port from the output) and stop it when finished.

---

### Task 1: Carve the shared rules out of GameLobby.css (no visual change)

**Files:**
- Create: `frontend/scripts/carve-lobby-css.mjs`, `frontend/src/styles/legacy-base.css`, `frontend/src/styles/QuestRewardModal.css`, `frontend/src/styles/RulesModal.css`, `frontend/src/styles/SettingsModal.css`
- Modify: `frontend/src/main.tsx`, `frontend/src/components/QuestRewardModal.tsx`, `frontend/src/components/SettingsModal.tsx`

**Interfaces:**
- Produces: the five CSS files above. `GameLobby.css` is left untouched in this task (the new files hold copies), so nothing changes on screen.

- [ ] **Step 1: Baseline screenshots**

Start the dev server. With Playwright MCP: resize 1280x800, open the app, Quick admin login, wait 3 s, screenshot `.playwright-mcp/p2-baseline-lobby.png`. Open the profile (click `.profile-avatar-btn`), click the gear (settings) and screenshot `p2-baseline-settings.png`; close it, reopen the profile, click the `?` button and screenshot `p2-baseline-rules.png`. Resize to 390x844 and screenshot the lobby as `p2-baseline-lobby-phone.png`. Record `git rev-parse HEAD` as `BASE_SHA`.

- [ ] **Step 2: Write the carve script**

Create `frontend/scripts/carve-lobby-css.mjs`:

```js
// One-time: copies the rules other screens still need out of GameLobby.css into their own files.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/styles/GameLobby.css', 'utf8').replace(/\r\n/g, '\n');

// Split into top-level chunks (a rule or at-rule with balanced braces, or an @import).
function chunks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  for (let i = 0; i < css.length; i++) {
    const two = css.slice(i, i + 2);
    if (!inComment && two === '/*') { inComment = true; i++; continue; }
    if (inComment) { if (two === '*/') { inComment = false; i++; } continue; }
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
    } else if (ch === ';' && depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
  }
  return out.map(c => c.trim()).filter(Boolean);
}

const head = c => c.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('{')[0].trim();

const legacy = [];
const quest = [];
const rules = [];
const settings = [];
for (const c of chunks(src)) {
  const h = head(c);
  if (h.startsWith('@import') || h === ':root' || h === '*' || h === '.modal-overlay') legacy.push(c);
  else if (/^@keyframes quest/.test(h) || /^\.quest-reward/.test(h)) quest.push(c);
  else if (/^\.rules-modal/.test(h)) rules.push(c);
  else if (/^\.settings-/.test(h)) settings.push(c);
  else if (h.startsWith('@media') && /\.rules-modal/.test(c) && !/\.friendly|\.game-lobby-modern/.test(c)) rules.push(c);
}

// @import must come first in a stylesheet.
legacy.sort((a, b) => Number(b.startsWith('@import')) - Number(a.startsWith('@import')));

quest.push(`@media (prefers-reduced-motion: reduce) {
  .quest-reward-overlay,
  .quest-reward-modal,
  .quest-reward-star,
  .quest-reward-levelup {
    animation: none;
  }
  .quest-reward-list li,
  .quest-reward-chip,
  .quest-reward-ok {
    animation: none;
    opacity: 1;
  }
}`);

const write = (file, note, list) => {
  writeFileSync(`src/styles/${file}`, `/* ${note} Carved from GameLobby.css unchanged; restyled in phase 4. */\n\n${list.join('\n\n')}\n`);
  console.log(`${file}: ${list.length} blocks`);
};
write('legacy-base.css', 'Global base the older screens still rely on (fonts, variables, reset, overlay). Removed in phase 5.', legacy);
write('QuestRewardModal.css', 'Quest reward modal.', quest);
write('RulesModal.css', 'How-to-play and settings modal frame.', rules);
write('SettingsModal.css', 'Settings modal.', settings);
```

- [ ] **Step 3: Run it and check the counts**

Run: `node scripts/carve-lobby-css.mjs`
Expected: four lines printed; `legacy-base.css` has 4 blocks (`@import`, `:root`, `*`, `.modal-overlay`), `QuestRewardModal.css` has about 17 blocks, `RulesModal.css` about 7, `SettingsModal.css` about 17. If `legacy-base.css` shows a different count, open it and confirm it contains the `@import`, `:root`, `*` and `.modal-overlay` rules; fix the predicate in the script and rerun. Then run `grep -c "friendly\|game-lobby-modern" src/styles/QuestRewardModal.css src/styles/RulesModal.css src/styles/SettingsModal.css src/styles/legacy-base.css`; Expected: every count is `0`.

- [ ] **Step 4: Import the carved files**

In `frontend/src/main.tsx`, add `import './styles/legacy-base.css';` as the first style import (before the fontsource imports). In `QuestRewardModal.tsx` add `import '../styles/QuestRewardModal.css';` beside its other imports. In `SettingsModal.tsx` add `import '../styles/SettingsModal.css';` and `import '../styles/RulesModal.css';` (it uses the `rules-modal` frame classes). `RulesModal.css` is also imported by `HowToPlayModal.tsx` in Task 2.

- [ ] **Step 5: Verify nothing changed**

Run: `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success). Repeat the Step 1 screenshots as `p2-task1-*.png` and compare: lobby, settings and rules modal look identical to the baseline.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts frontend/src
git commit -m "refactor(css): carve shared lobby rules into their own files"
git push origin main
```

---

### Task 2: New icons and the How-to-play modal component

**Files:**
- Modify: `frontend/src/components/ui/Icon.tsx`, `frontend/scripts/check-tokens.mjs`
- Create: `frontend/src/components/HowToPlayModal.tsx`

**Interfaces:**
- Consumes: `CloseButton` (`onClick`, `label?`), `RulesModal.css` from Task 1.
- Produces: `IconName` gains `'dice' | 'swords' | 'flame' | 'tower' | 'logout' | 'unlock'`; `HowToPlayModal` with props `{ onClose: () => void }`.

- [ ] **Step 1: Add the icons**

In `Icon.tsx`, add these entries to `PATHS` (after `info`):

```tsx
  dice: 'M5 5h14v14H5zM9 9v.01M15 9v.01M12 12v.01M9 15v.01M15 15v.01',
  swords: 'M5 19L19 5M14 5h5v5M19 19L5 5M10 5H5v5',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 1-8.5z',
  tower: 'M5 20V6h3v2h2V6h4v2h2V6h3v14zM10 20v-4h4v4',
  logout: 'M10 5H5v14h5M14 8l4 4-4 4M18 12H9',
  unlock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.6-1.5',
```

- [ ] **Step 2: Write `HowToPlayModal.tsx`** (content is the existing modal from `GameLobby.tsx`, emoji removed from headings, frame classes unchanged)

```tsx
import React from 'react';
import CloseButton from './CloseButton';
import '../styles/RulesModal.css';

interface HowToPlayModalProps {
  onClose: () => void;
}

const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ onClose }) => (
  <div className="modal-overlay">
    <div className="rules-modal" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="rules-modal-header">
        <h3>How to play</h3>
        <CloseButton onClick={onClose} />
      </div>

      <div className="rules-modal-content">
        <div className="rules-category">
          <h4>Game objective</h4>
          <div className="rule-text">Defeat all enemy heroes to win the battle</div>
          <div className="rule-text">Last team standing wins</div>
        </div>

        <div className="rules-category">
          <h4>Combat basics</h4>
          <div className="rule-item">
            <span className="rule-label">Turn structure:</span>
            <span className="rule-value">Each turn you can use a Basic Attack OR an Ability, then End Turn</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">First turn restriction:</span>
            <span className="rule-value">The player who starts CANNOT use their first hero's ability on turn 1</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Attack rolls:</span>
            <span className="rule-value">Roll 1D20 + Accuracy vs enemy Defense to hit</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Critical hits:</span>
            <span className="rule-value">Natural 20 = Critical (max damage)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Damage:</span>
            <span className="rule-value">Roll dice for damage (e.g., 2D6 = roll two 6-sided dice)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Defense:</span>
            <span className="rule-value">Higher Defense = harder to hit</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Special mechanics</h4>
          <div className="rule-item">
            <span className="rule-label">Advantage:</span>
            <span className="rule-value">Roll twice, take the higher result</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Disadvantage:</span>
            <span className="rule-value">Roll twice, take the lower result</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Taunt:</span>
            <span className="rule-value">Forces enemy to target a specific hero</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Poison:</span>
            <span className="rule-value">Takes damage at start of each turn</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Silence:</span>
            <span className="rule-value">Cannot use abilities</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Game modes</h4>
          <div className="rule-item">
            <span className="rule-label">Draft mode:</span>
            <span className="rule-value">Take turns picking heroes (ban 1, pick 3)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Random mode:</span>
            <span className="rule-value">Both players get random teams instantly</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Survival mode:</span>
            <span className="rule-value">Fight other players using Survival Mode decks. Heroes that win in this battle cannot be used again</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Friend challenges:</span>
            <span className="rule-value">Challenge an online friend from your friends list to a draft battle. XP only</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Hero abilities</h4>
          <div className="rule-text">Each hero has a unique <strong>Ability</strong> and <strong>Special</strong></div>
          <div className="rule-text">Abilities cost your action for the turn</div>
          <div className="rule-text">Specials are passive or triggered automatically</div>
          <div className="rule-text">Check the Binder to learn each hero's abilities</div>
        </div>

        <div className="rules-category">
          <h4>Tips</h4>
          <div className="rule-item">
            <span className="rule-label">Team composition:</span>
            <span className="rule-value">Build your team carefully - synergy between heroes is crucial</span>
          </div>
          <div className="rule-text">Position matters - some abilities affect adjacent allies/enemies</div>
          <div className="rule-text">Team synergy is key - combine hero abilities strategically</div>
          <div className="rule-text">Pay attention to turn order - some heroes shine when going first/second</div>
          <div className="rule-text">Read enemy abilities carefully to plan your strategy</div>
        </div>
      </div>
    </div>
  </div>
);

export default HowToPlayModal;
```

- [ ] **Step 3: Lint list and check**

In `check-tokens.mjs` append to `MIGRATED`: `'components/HowToPlayModal.tsx'`.
Run: `npm run check:tokens` (Expected: `check-tokens: 8 files clean`) and `npx tsc --noEmit 2>&1 | grep -E "Icon.tsx|HowToPlayModal"` (Expected: no output).

- [ ] **Step 4: Commit**

```bash
git add frontend/src frontend/scripts
git commit -m "feat(ui): lobby icons and How-to-play modal component"
git push origin main
```

---

### Task 3: Lobby markup, Lobby.css and XPBar on tokens

**Files:**
- Create: `frontend/src/styles/Lobby.css`
- Rewrite: `frontend/src/styles/XPBar.css`
- Modify: `frontend/src/components/GameLobby.tsx`, `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Consumes: `Icon` names from Task 2, `HowToPlayModal`, `Coin`, `XPBar` (props unchanged), `ShopIcon`/`BinderIcon` (kept, they are coloured SVG art like `Coin`), `useCardGrid` (its `ref`/`style` stay on `.lobby-hero-viewport`), `useQuestReveal`.
- Keeps these class names because other code styles or queries them: `game-lobby-modern` (root; the phone dock rules use `body:has(.game-lobby-modern)`), `profile-avatar-btn`, `lobby-tile`, `lobby-tile-icon`, `lobby-hero-viewport`, `random-hero-card` (+ `transitioning`), `mode-unlock-toast`, `vp-bump`, `completed`, `just-completed`, `data-tutorial="collection"`.

- [ ] **Step 1: Add the new files to the lint list and see it fail**

Append to `MIGRATED`: `'styles/Lobby.css'`, `'styles/XPBar.css'`, `'components/GameLobby.tsx'`.
Run: `npm run check:tokens`
Expected: FAIL: `ENOENT ... styles/Lobby.css` (new file) , which is the red step.

- [ ] **Step 2: Write `Lobby.css`**

```css
/* Lobby: the felt table. Ledger on the left, the featured hero and mode placards on the table. */
.lobby {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--felt-surface);
  color: var(--bone);
  font-family: var(--font-ui);
}

/* Top bar */
.lobby-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  background: var(--walnut);
  border-bottom: 1px solid var(--brass-dim);
  box-shadow: 0 6px 18px var(--shade);
}
.lobby-title {
  margin: 0;
  font: 400 var(--text-xl) / 1 var(--font-display);
  letter-spacing: 0.01em;
  color: var(--bone);
}
.lobby-status { display: flex; align-items: center; gap: var(--space-5); }
.lobby-coins .coin-icon { width: 1.25em; height: 1.25em; align-self: center; }
.lobby-coins-amount { display: inline-block; }
.lobby-coins-amount.vp-bump { animation: lobby-bump 420ms var(--ease); }
@keyframes lobby-bump {
  40% { transform: scale(1.3); color: var(--brass-hi); }
}
.lobby-level { display: flex; flex-direction: column; gap: var(--space-1); min-width: 11rem; }
.lobby-level-text { font: 700 var(--text-sm) / 1 var(--font-ui); color: var(--bone-dim); }

/* Layout */
.lobby-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
  gap: var(--space-6);
  padding: var(--space-6);
}

/* Ledger */
.lobby-ledger {
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
}
.lobby-player { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.lobby-player h2 {
  margin: 0;
  min-width: 0;
  font: 400 var(--text-xl) / 1.1 var(--font-display);
  overflow-wrap: anywhere;
}
.profile-avatar-btn {
  flex-shrink: 0;
  width: 3.5rem;
  height: 3.5rem;
  padding: 0;
  overflow: hidden;
  background: var(--felt-deep);
  border: 1px solid var(--brass);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.profile-avatar-btn:hover { transform: none; box-shadow: none; border-color: var(--brass-hi); }
.profile-avatar-btn:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }
.profile-avatar-btn img { display: block; width: 100%; height: 100%; object-fit: cover; }

.lobby-section-title {
  margin: 0;
  padding-bottom: var(--space-2);
  font: 700 var(--text-md) / 1 var(--font-ui);
  color: var(--bone);
  border-bottom: 1px solid var(--brass-dim);
}
.lobby-quests { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.lobby-quest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  font-size: var(--text-sm);
  line-height: 1.3;
  background: var(--leather);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-control);
}
.lobby-quest-text { min-width: 0; overflow-wrap: anywhere; }
.lobby-quest-progress {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brass-hi);
}
.lobby-quest.completed { border-color: var(--verdigris); color: var(--bone-dim); }
.lobby-quest.completed .lobby-quest-text { text-decoration: line-through; }
.lobby-quest.completed .lobby-quest-progress { color: var(--verdigris); }
.lobby-quest.just-completed { animation: lobby-quest-pop 600ms var(--ease); }
@keyframes lobby-quest-pop {
  50% { transform: scale(1.03); }
}
.lobby-empty { margin: 0; font-size: var(--text-sm); color: var(--bone-dim); }

/* Table */
.lobby-table { display: flex; flex-direction: column; gap: var(--space-6); min-width: 0; min-height: 0; }
.lobby-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr) 9rem;
  align-items: center;
  gap: var(--space-5);
}
.lobby-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  font: 700 var(--text-md) / 1 var(--font-ui);
  color: var(--bone);
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--inset-frame);
  cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.lobby-tile:hover { background: var(--leather); border-color: var(--brass); transform: none; box-shadow: var(--inset-frame); }
.lobby-tile:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }
.lobby-tile-icon { width: 3.5rem; height: 3.5rem; }

.lobby-hero-viewport { align-self: stretch; min-height: 20rem; display: flex; align-items: center; justify-content: center; }
.random-hero-card { transition: opacity 300ms var(--ease), transform 300ms var(--ease); }
.random-hero-card.transitioning { opacity: 0; transform: scale(0.97); }
.random-hero-card .hero-card,
.random-hero-card .hero-card:hover { transform: none !important; transition: none !important; z-index: auto !important; }

/* Mode placards */
.lobby-placards { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: var(--space-4); }
.placard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease);
}
.placard:hover { border-color: var(--brass); }
.placard-head { display: flex; align-items: center; gap: var(--space-3); }
.placard-icon { flex-shrink: 0; color: var(--brass-hi); }
.placard-title { flex: 1; margin: 0; font: 400 var(--text-lg) / 1.1 var(--font-display); }
.placard-text { margin: 0; min-height: 1.4em; font-size: var(--text-sm); color: var(--bone-dim); }
.placard--searching { border-color: var(--brass-hi); cursor: default; }
.placard-dots { display: inline-flex; gap: var(--space-1); }
.placard-dots .dot {
  width: 0.4rem;
  height: 0.4rem;
  background: var(--brass-hi);
  border-radius: 50%;
  animation: lobby-dot 1.2s var(--ease) infinite;
}
.placard-dots .dot:nth-child(2) { animation-delay: 0.2s; }
.placard-dots .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes lobby-dot {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}

/* An unlocked mode rises onto the table once */
.mode-unlock-reveal { animation: lobby-rise 700ms var(--ease) both; }
@keyframes lobby-rise {
  from { opacity: 0; transform: translateY(1rem); }
  to { opacity: 1; transform: none; }
}

.mode-unlock-toast {
  position: fixed;
  left: 50%;
  bottom: var(--space-7);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: max-content;
  max-width: min(28rem, calc(100vw - 2rem));
  padding: var(--space-4) var(--space-5);
  transform: translateX(-50%);
  background: var(--walnut);
  border: 1px solid var(--brass);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  cursor: pointer;
  animation: lobby-fade 400ms var(--ease) both;
}
.mode-unlock-toast-icon { color: var(--brass-hi); }
.mode-unlock-toast-text { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--bone-dim); }
.mode-unlock-toast-text strong { font-size: var(--text-md); color: var(--bone); }
@keyframes lobby-fade { from { opacity: 0; } }

/* Friends and messages dock: smaller on phones so it clears the placards */
@media (max-width: 768px), (max-width: 1000px) and (max-height: 600px) {
  body:has(.game-lobby-modern) .friends-icon,
  body:has(.game-lobby-modern) .message-icon {
    width: 36px;
    height: 36px;
    bottom: max(6px, env(safe-area-inset-bottom));
  }
  body:has(.game-lobby-modern) .friends-icon { left: 8px; }
  body:has(.game-lobby-modern) .message-icon { left: 50px; }
  body:has(.game-lobby-modern) .friends-icon-svg,
  body:has(.game-lobby-modern) .message-icon-svg { width: 18px; height: 18px; }
  body:has(.game-lobby-modern) .friends-icon .notification-badge,
  body:has(.game-lobby-modern) .message-icon .notification-badge {
    min-width: 14px;
    height: 14px;
    padding: 0 2px;
    top: -5px;
    right: -5px;
    font-size: 9px;
  }
  body:has(.game-lobby-modern) .friends-icon-tooltip,
  body:has(.game-lobby-modern) .message-icon-tooltip { bottom: 42px; }
}

/* Narrow or short windows: one column; the featured hero is decorative, so it steps aside */
@media (max-width: 1000px), (max-height: 700px) {
  .lobby-main { grid-template-columns: minmax(0, 1fr); padding: var(--space-4); gap: var(--space-4); }
  .lobby-ledger { align-self: stretch; }
  .lobby-stage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lobby-hero-viewport { display: none; }
  .lobby { padding-bottom: 3.5rem; }
}
@media (max-width: 600px) {
  .lobby-bar { flex-wrap: wrap; padding: var(--space-3) var(--space-4); }
  .lobby-status { width: 100%; justify-content: space-between; gap: var(--space-3); }
  .lobby-level { flex: 1; min-width: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .lobby-coins-amount.vp-bump,
  .lobby-quest.just-completed,
  .mode-unlock-reveal,
  .mode-unlock-toast,
  .placard-dots .dot { animation: none; }
  .random-hero-card,
  .placard,
  .lobby-tile { transition: none; }
}
```

- [ ] **Step 3: Rewrite `XPBar.css`** (class names match `XPBar.tsx`; other files such as `ProfileModal.css` may override `.xp-bar-container`)

```css
/* XP bar: brass fill in a recessed felt track, with the numbers printed over it */
.xp-bar-container { position: relative; width: 100%; }
.xp-bar {
  position: relative;
  height: 1.5rem;
  overflow: hidden;
  background: var(--felt-deep);
  border: 1px solid var(--brass-dim);
  border-radius: 999px;
  box-shadow: inset 0 2px 4px var(--shade);
}
.xp-fill {
  position: relative;
  height: 100%;
  background: var(--brass-dim);
  box-shadow: inset 0 1px 0 var(--brass);
  transition: width 300ms var(--ease);
}
.xp-fill.animating { transition: none; }
.xp-shine { display: none; }
.xp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font: 700 var(--text-xs) / 1 var(--font-ui);
  font-variant-numeric: tabular-nums;
  color: var(--bone);
  text-shadow: 0 0 3px var(--felt-deep), 0 0 3px var(--felt-deep);
}
.xp-separator { opacity: 0.7; }
.xp-label { margin-left: var(--space-1); color: var(--bone-dim); }
.xp-bar.level-up { animation: xp-level-up 2s var(--ease); }
@keyframes xp-level-up {
  30% { box-shadow: inset 0 2px 4px var(--shade), 0 0 0 3px var(--brass-hi); }
}
.xp-gain-popup {
  position: absolute;
  top: -1.5rem;
  right: 0;
  font: 700 var(--text-sm) / 1 var(--font-ui);
  color: var(--brass-hi);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.xp-gain-popup.show { opacity: 1; transform: translateY(-0.25rem); }
@media (prefers-reduced-motion: reduce) {
  .xp-bar.level-up { animation: none; }
  .xp-fill, .xp-gain-popup { transition: none; }
}
```

- [ ] **Step 4: Update the imports at the top of `GameLobby.tsx`**

Replace the import block lines 1 to 18 with exactly:

```tsx
import React, { useState, useEffect } from 'react';
import HeroCollection from './HeroCollection';
import HeroCard from './HeroCard';
import ProfileModal from './ProfileModal';
import { ShopIcon, BinderIcon } from './LobbyIcons';
import Coin from './Coin';
import XPBar from './XPBar';
import Icon from './ui/Icon';
import Shop from './Shop';
import RequirementModal from './RequirementModal';
import HowToPlayModal from './HowToPlayModal';
import { Hero, GameState, Quest, PendingQuestReward } from '../types';
import { socketService } from '../socketService';
import { useQuestReveal } from '../useQuestReveal';
import QuestRewardModal from './QuestRewardModal';
import SettingsModal from './SettingsModal';
import config from '../config';
import useCardGrid from '../hooks/useCardGrid';
import '../styles/Lobby.css';
```

(`CloseButton` is no longer imported here; the how-to-play modal owns it.) Below `const RANKED_MODE_NAMES ...` add:

```tsx
// Phase 5 turns this on once the Gauntlet backend fixes land.
const SHOW_GAUNTLET = false;
```

- [ ] **Step 5: Replace the component's `return (...)`**

In `GameLobby.tsx`, replace everything from `  return (` (the one that starts `<div className="game-lobby-modern">`) through the end of the component (`  );\n};`) with:

```tsx
  const renderPlacard = ({ mode, title, text, icon, tag, extraClass = '', onActivate, playLabel }: {
    mode: 'random' | 'draft' | 'survival' | 'gauntlet';
    title: string;
    text: string;
    icon: 'dice' | 'swords' | 'flame' | 'tower';
    tag: 'Normal' | 'Ranked';
    extraClass?: string;
    onActivate: () => void;
    playLabel: string;
  }) => {
    const searching = isSearching && searchMode === mode;
    return (
      <div
        key={mode}
        className={`placard${searching ? ' placard--searching' : ''}${extraClass}`}
        onClick={searching ? undefined : onActivate}
      >
        <div className="placard-head">
          <Icon name={icon} size={28} className="placard-icon" />
          <h3 className="placard-title">{title}</h3>
          <span className="ui-badge">{tag}</span>
        </div>
        {searching ? (
          <p className="placard-text" role="status">
            Finding an opponent
            <span className="placard-dots" aria-hidden="true">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </span>
          </p>
        ) : (
          <p className="placard-text">{text}</p>
        )}
        {searching ? (
          <button className="ui-btn ui-btn--danger ui-btn--block" onClick={(e) => { e.stopPropagation(); onCancelSearch?.(); }}>
            Leave queue
          </button>
        ) : (
          <button className="ui-btn ui-btn--primary ui-btn--block">{playLabel}</button>
        )}
      </div>
    );
  };

  return (
    <div className="game-lobby-modern lobby">
      <header className="lobby-bar">
        <h1 className="lobby-title">Hero's Call</h1>
        <div className="lobby-status">
          <div className="ui-pill lobby-coins">
            <Coin />
            <span className={`lobby-coins-amount${questReveal.counting ? ' vp-bump' : ''}`}>{questReveal.display.vp}</span>
          </div>
          <div className="lobby-level">
            <span className="lobby-level-text">Level {questReveal.display.level || 1}</span>
            <XPBar
              currentXP={questReveal.display.xp || 0}
              level={questReveal.display.level || 1}
              animated={false}
              leveledUp={questReveal.levelFlash}
            />
          </div>
          <button className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onLogout}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </header>

      <main className="lobby-main">
        <aside className="lobby-ledger ui-panel">
          <div className="lobby-player">
            <h2>{user.username}</h2>
            <button
              className="profile-avatar-btn"
              onClick={() => setShowProfileModal(true)}
              aria-label="Open profile"
              title="Profile"
            >
              {profileIcon && (
                <img
                  src={`${config.IMAGE_BASE_URL}/hero-images/${profileIcon.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`}
                  alt={profileIcon}
                />
              )}
            </button>
          </div>
          <h3 className="lobby-section-title">Quests</h3>
          {quests.length === 0 ? (
            <p className="lobby-empty">No quests today. New ones arrive at midnight UTC.</p>
          ) : (
            <ul className="lobby-quests">
              {quests.map(quest => {
                // Pending quests stay unchecked until the reveal starts.
                const revealed = !pendingQuestIds.has(quest.id) || questReveal.stage !== 'idle';
                const isDone = quest.completed && revealed;
                const justRevealed = pendingQuestIds.has(quest.id) && revealed;
                const shownProgress = quest.completed && !revealed ? quest.target - 1 : quest.progress;
                return (
                  <li key={quest.id} className={`lobby-quest${isDone ? ' completed' : ''}${justRevealed ? ' just-completed' : ''}`}>
                    <span className="lobby-quest-text">{quest.text}</span>
                    <span className="lobby-quest-progress">
                      {isDone ? <Icon name="check" title="Done" /> : `${shownProgress}/${quest.target}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="lobby-table">
          <div className="lobby-stage">
            <button className="lobby-tile shop-tile" onClick={handleShowShop}>
              <ShopIcon className="lobby-tile-icon" />
              <span>Shop</span>
            </button>
            <div className="lobby-hero-viewport" ref={previewGrid.ref} style={previewGrid.style}>
              {currentRandomHero && (
                <div className={`random-hero-card ${isTransitioning ? 'transitioning' : ''}`}>
                  <HeroCard
                    hero={{
                      name: currentRandomHero.name,
                      HP: currentRandomHero.HP,
                      Defense: currentRandomHero.Defense,
                      Accuracy: currentRandomHero.Accuracy,
                      BasicAttack: currentRandomHero.BasicAttack,
                      Ability: currentRandomHero.Ability,
                      Special: currentRandomHero.Special
                      // Only include base hero properties, no runtime modifications
                    }}
                    showFullInfo={false}
                    disableHPAnimations={true}
                  />
                </div>
              )}
            </div>
            <button className="lobby-tile binder-tile" data-tutorial="collection" onClick={handleShowCollection}>
              <BinderIcon className="lobby-tile-icon" />
              <span>Binder</span>
            </button>
          </div>

          <div className="lobby-placards">
            {renderPlacard({ mode: 'random', title: 'Random mode', text: 'Quick battle with random teams.', icon: 'dice', tag: 'Normal', onActivate: () => handleModeSelect('random'), playLabel: 'Play random' })}
            {draftVisible && renderPlacard({ mode: 'draft', title: 'Draft mode', text: 'Ban, then pick your team.', icon: 'swords', tag: 'Ranked', extraClass: modeAnimates('draft') || rankedAnimates ? ' mode-unlock-reveal' : '', onActivate: () => handleModeSelect('draft'), playLabel: 'Play draft' })}
            {survivalVisible && renderPlacard({ mode: 'survival', title: 'Survival mode', text: 'Win with each hero once.', icon: 'flame', tag: 'Ranked', extraClass: modeAnimates('survival') || rankedAnimates ? ' mode-unlock-reveal' : '', onActivate: handleSurvivalClick, playLabel: 'Enter survival' })}
            {SHOW_GAUNTLET && renderPlacard({ mode: 'gauntlet', title: 'Gauntlet', text: 'Face 13 trials with a roster of six.', icon: 'tower', tag: 'Ranked', onActivate: handleGauntletClick, playLabel: 'Enter gauntlet' })}
          </div>
        </section>
      </main>

      {/* Shop Modal */}
      {showShop && (
        <Shop
          onClose={handleCloseShop}
          userId={user.id}
          victoryPoints={victoryPoints}
          availableHeroes={user.available_heroes}
          onPurchaseComplete={handlePurchaseComplete}
        />
      )}

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection
          onClose={handleCloseCollection}
          userId={user.id}
          victoryPoints={victoryPoints}
          onFavoritesChange={onFavoritesChange}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        user={user}
        allHeroes={allHeroes}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onIconChange={setProfileIcon}
        onOpenHowToPlay={() => { setShowProfileModal(false); setShowRulesModal(true); }}
        onOpenSettings={() => { setShowProfileModal(false); setShowSettingsModal(true); }}
      />

      {showSettingsModal && <SettingsModal onClose={() => { setShowSettingsModal(false); setShowProfileModal(true); }} />}
      {showRulesModal && <HowToPlayModal onClose={() => { setShowRulesModal(false); setShowProfileModal(true); }} />}

      {/* Mode unlock notification */}
      {unlockToast && (
        <div className="mode-unlock-toast" role="status" onClick={() => setUnlockToast(null)}>
          <Icon name="unlock" size={24} className="mode-unlock-toast-icon" />
          <div className="mode-unlock-toast-text">
            <strong>New mode unlocked</strong>
            <span>{unlockToast.map(m => RANKED_MODE_NAMES[m]).join(' and ')} {unlockToast.length > 1 ? 'are' : 'is'} now available in Ranked.</span>
          </div>
        </div>
      )}

      {questReveal.stage === 'prompt' && pendingQuestReward && (
        <QuestRewardModal reward={pendingQuestReward} onOk={questReveal.claim} />
      )}

      <RequirementModal
        isOpen={showRequirementModal}
        onClose={() => setShowRequirementModal(false)}
        message={requirementModalData.message}
        currentCount={requirementModalData.currentCount}
        requiredCount={requirementModalData.requiredCount}
        type={requirementModalData.type}
      />
    </div>
  );
};

export default GameLobby;
```

`renderPlacard` is declared just above `return (` inside the component (it closes over `isSearching`, `searchMode` and `onCancelSearch`).

- [ ] **Step 6: Check lint and the type errors the change could cause**

Run: `npm run check:tokens`
Expected: `check-tokens: 11 files clean`. (`GameLobby.tsx` contains no colour literals; `LobbyIcons.tsx` is not on the list because its gold art stays as colour constants.)
Run: `npx tsc --noEmit 2>&1 | grep GameLobby`
Expected: no output (the earlier `userRefreshTrigger` and `handleGauntletClick` unused warnings disappear because both are now used or were already referenced; if `userRefreshTrigger` is still reported unused, leave it: it was reported before this phase).

- [ ] **Step 7: Build and look**

Run: `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).
Start the dev server, Quick admin login at 1280x800 and screenshot `.playwright-mcp/p2-lobby-desktop.png`. Check against the design: the felt table, ledger left, Shop and Binder tiles flanking the featured hero, placards along the bottom, coin plus number, level bar legible. Fix spacing or overflow you see in `Lobby.css` and re-screenshot until it holds at 1280x800 without the page scrolling vertically.

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/scripts
git commit -m "feat(ui): rebuild the lobby as the felt table"
git push origin main
```

---

### Task 4: Retire GameLobby.css

**Files:**
- Delete: `frontend/src/styles/GameLobby.css`, `frontend/scripts/carve-lobby-css.mjs`

- [ ] **Step 1: Confirm nothing still imports it**

Run: `git grep -n "GameLobby.css" -- src`
Expected: no output (Task 3 replaced the only import).

- [ ] **Step 2: Delete and rebuild**

Run: `git rm src/styles/GameLobby.css scripts/carve-lobby-css.mjs` then `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

- [ ] **Step 3: Check the screens that borrowed from it**

With the dev server (restart it first so it drops the deleted file) and Quick admin login, screenshot each at 1280x800: the Shop (click Shop), the Binder, the Profile modal, the Settings modal (profile, gear), the How-to-play modal (profile, `?`), and a Survival placard click if the admin has 21 heroes (it shows the survival team builder). Compare each against its `p2-baseline-*` screenshot where one exists; the modal frames, fonts (Orbitron/Rajdhani from `legacy-base.css`) and colours must match the baseline. If a screen lost styling, find the missing rule with `git show BASE_SHA:frontend/src/styles/GameLobby.css | grep -n "<selector>"`, copy that rule into the file of the screen that uses it, and note it as a ruling.

Also confirm the global variables survived: `browser_evaluate` `getComputedStyle(document.documentElement).getPropertyValue('--text-primary')` returns `#ffffff` (Expected: non-empty).

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git commit -m "chore(css): retire GameLobby.css"
git push origin main
```

---

### Task 5: Verify the lobby in every state

**Files:** none modified unless a check fails.

- [ ] **Step 1: Lint, build, backend tests**

Run: `npm run check:tokens`, `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir`, and `cd ../backend && npm test`.
Expected: `11 files clean`, build success, `# pass 96`, `# fail 0`.

- [ ] **Step 2: Layouts**

Log in as admin. For each size, screenshot and run `browser_evaluate` `document.documentElement.scrollWidth <= innerWidth` (must be `true`):
- 1280x800 (no vertical page scroll; hero visible)
- 1024x768 (single column; hero hidden; placards and ledger reachable)
- 768x1024 (tablet portrait)
- 390x844 and 320x640 (phone; status row wraps under the title; friends and messages icons sit bottom-left and do not cover the Sign out button or the last placard: scroll to the bottom and screenshot)
- 667x375 (landscape phone; scroll to the bottom; every placard reachable)

- [ ] **Step 3: Long username and empty quests**

`browser_evaluate` to set the lobby's username text: `document.querySelector('.lobby-player h2').textContent = 'WWWWWWWWWWWW'` at 320x640; confirm it wraps inside the ledger (`ledger.scrollWidth <= ledger.clientWidth`). For empty quests, log in as an account with none, or `browser_evaluate` removing the `.lobby-quests` element and confirm the empty-state text is rendered by temporarily reading the component logic (the `quests.length === 0` branch) in the code; state in the report which of the two you did.

- [ ] **Step 4: Searching, unlock reveal and tutorial hook**

1. Click "Play random": the Random placard shows "Finding an opponent" with the three dots and a Leave queue button; click Leave queue: it returns to the normal placard.
2. `browser_evaluate` `Object.keys(localStorage).filter(k => k.startsWith('heroscall.seenModes')).forEach(k => localStorage.setItem(k, '[]'))` then reload and log in again: the "New mode unlocked" toast appears and the Draft placard rises in; the toast disappears after about 6 seconds or on click.
3. `browser_evaluate` `!!document.querySelector('[data-tutorial="collection"]')` is `true`.
4. Tab through the lobby with `browser_press_key`; every button (Sign out, avatar, tiles, placard buttons) shows the brass outline; Enter on a placard button starts that mode's search.

- [ ] **Step 5: Reduced motion**

`browser_emulate_media` `reducedMotion: 'reduce'`, reload, log in: `getComputedStyle(document.querySelector('.placard-dots .dot') ?? document.body).animationName` is `none` while searching, and `.random-hero-card` has `transition-duration` `0s`.

- [ ] **Step 6: Currency and copy sweep**

Run: `git grep -n -iE "victory point|\bVP\b|coins" -- src/components/GameLobby.tsx src/components/HowToPlayModal.tsx src/styles/Lobby.css`
Expected: no output. Run `git grep -n -E "Logout|Log out" -- src/components/GameLobby.tsx` (Expected: no output; the button reads "Sign out").

- [ ] **Step 7: Record completion and clean up**

Append to the Phases section of the spec: `Phase 2 complete (YYYY-MM-DD). Known follow-ups: <anything from Steps 2 to 6 you could not fix>.` Stop the dev server. Confirm `git status` is clean and `frontend/dist` is untouched, then:

```bash
git add docs
git commit -m "docs: record phase 2 completion"
git push origin main
```
