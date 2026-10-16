# UI Redesign Phase 4: Shop, Collection, Profile, Friends and the Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the Shop, the Collection/Binder, the Profile, Friends and Messages, the Settings, How-to-play, Quest-reward and Requirement modals, the pack opening and the tutorial overlay onto the "table" design system, with no emoji, sentence-case copy and the coin-and-number currency rule.

**Architecture:** Same method as phase 3. The standalone stylesheets (`Shop.css`, `HeroCollection.css`, `Binder.css`, `PackOpeningAnimation.css`, `ProfileModal.css`, `QuestRewardModal.css`, `SettingsModal.css`, `RulesModal.css`, `RequirementModal.css`, `Tutorial.css`) go through the unit-tested `retoken-css.mjs`. The Friends and Messages rules live inside `App.css`, so a carve script (now able to read class names inside template strings, which the phase 3 version missed) moves them into `Social.css` first, proven by a same-page old-versus-new computed-style comparison, then they are re-tokenized too. A hand-written `Panels.css` unifies the modal frame, overlays, headers and buttons. Rarely reached screens (quest reward, requirement, pack opening, tutorial, settings, how-to-play) get a dev-only gallery at `#screens/<name>` so each can be looked at without waiting for the game to produce it. Layout geometry is not changed.

**Tech Stack:** React 18, plain CSS on `tokens.css` / `primitives.css`, Node 20 scripts (`retoken-css.mjs`, `style-diff.mjs`), Playwright MCP tools (two tabs for the Friends scenario).

**Spec:** `docs/superpowers/specs/2026-10-15-ui-redesign-design.md`. Earlier plans: phases 1 to 3 in `docs/superpowers/plans/`.

## Global Constraints

- Colours (verbatim): felt `#101b18`, walnut `#241a14`, leather `#33261d`, brass `#b08a45`, bone `#e6dfcf`, ember `#c4482f`, verdigris `#5fa08a`; all in `tokens.css`. No Bootstrap colours.
- Type: IM Fell English for titles and large numerals; Alegreya Sans for UI text; sentence case; no all-caps labels; no emoji icons (use `Icon`); lines under 80 characters.
- Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow.
- Motion only in response to actions, plus one orchestrated moment per screen; `prefers-reduced-motion` respected.
- Quality floor: works from 320px up, visible keyboard focus, sufficient contrast.
- Copy: buttons say what happens; errors say how to fix them; one name per action.
- Currency (user rule): never named; coin image beside a number; no "VP", "victory points" or "coins" in UI text.
- Hero cards (user rule): a card must show its image, stats and ALL ability and special text. Card rules stay in `App.css`/`HeroCard.css`; the Shop, Collection, Profile and pack opening show cards, so check text fit there.
- Geometry of these screens does not change; only visual properties.
- `SpectatorView` is not used anywhere (dead code) and is out of scope. `legacy-base.css` stays until phase 5.
- The Friends scenario writes a friendship and chat messages to the local dev database. Remove the friendship with the "Remove friend" button at the end. Do not buy heroes or packs in the Shop (it spends coins in the dev database); use the dev gallery for the pack opening.
- Push straight to `main`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `frontend/dist`; verification builds use `--outDir "$TEMP/hc-dist"`. Revert point for the redesign: tag `ui-before-redesign`.
- Existing `tsc --noEmit` errors are unrelated. Gates: `npm run check:tokens`, `node --test scripts/retoken-css.test.mjs`, `vite build`, backend `npm test` (no backend change expected: 104 pass), style diff, screenshots.
- If Vite serves an empty or stale CSS file after a rewrite, restart `npm run dev`. Write long scripts to files; shell one-liners with `$` characters corrupt replacement text.

## Review Focus

- A Shop message in its error state (force it in the page) reads on walnut with no emoji and says what to do (Task 6).
- The Collection with a favourite hero: the star is an icon, the toggle says "Add to favorites" or "Remove from favorites", and cards still show all their text (Task 6).
- The Profile icon picker: locked icons show a lock icon and stay clearly different from owned ones (Task 6).
- Friends with no friends, with a pending request, with a friend online, and the message chat window; the player tooltip actions all have icons and sentence-case labels (Task 6, Friends scenario).
- Binder opening: the cover animation still plays, and is skipped with reduced motion (Task 6).
- Pack opening shows three cards with all their text on the walnut overlay (Task 6, gallery).
- The same screens at 390x844 and 667x375 (Task 6).

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/ui/DevScreens.tsx` (new) | Dev-only gallery: one rarely reached screen per `#screens/<name>` hash |
| `frontend/src/components/ui/Icon.tsx` (modify) | New icons `star chat userPlus userMinus` |
| `frontend/scripts/carve-social-css.mjs` (new; deleted in Task 3) | Moves Friends and Messages rules out of `App.css` |
| `frontend/scripts/ab-compare.js`, `ab-diff.mjs` (new; deleted in Task 3) | Same-page old-versus-new computed-style comparison |
| `frontend/src/styles/Social.css` (new, retokened) | Friends overlay, friends icon, messages |
| `Shop.css`, `HeroCollection.css`, `Binder.css`, `PackOpeningAnimation.css`, `ProfileModal.css`, `QuestRewardModal.css`, `SettingsModal.css`, `RulesModal.css`, `RequirementModal.css`, `Tutorial.css` (retokened in place) | Existing screens on tokens |
| `frontend/src/styles/Panels.css` (new) | Modal frame, overlays, headers and buttons shared by all of the above |
| `Shop.tsx`, `HeroCollection.tsx`, `ProfileModal.tsx`, `FriendsOverlay.tsx`, `QuestRewardModal.tsx`, `SettingsModal.tsx`, `RequirementModal.tsx` (modify) | Icons instead of emoji, sentence-case copy |
| `frontend/scripts/check-tokens.mjs` (modify) | Add migrated files |

All commands run from `frontend/` unless a path says otherwise. Start the dev server with `npm run dev` (read the port from its output) and the backend is already running on port 3001 (`npm start` in `backend/` if not).

---

### Task 1: Icons, dev screens gallery and baselines

**Files:**
- Modify: `frontend/src/components/ui/Icon.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/components/ui/DevScreens.tsx`

**Interfaces:**
- Produces: `IconName` gains `'star' | 'chat' | 'userPlus' | 'userMinus'`; dev routes `/#screens/quest-reward`, `requirement`, `settings`, `how-to-play`, `pack-opening`, `tutorial`.

- [ ] **Step 1: Add the icons**

In `Icon.tsx` add to `PATHS` after `rotate`:

```tsx
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  chat: 'M4 5h16v11H9l-5 4z',
  userPlus: 'M4 20a6 6 0 0 1 12 0M7 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M19 8v6M16 11h6',
  userMinus: 'M4 20a6 6 0 0 1 12 0M7 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M16 11h6',
```

- [ ] **Step 2: Write `DevScreens.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import QuestRewardModal from '../QuestRewardModal';
import RequirementModal from '../RequirementModal';
import SettingsModal from '../SettingsModal';
import HowToPlayModal from '../HowToPlayModal';
import PackOpeningAnimation from '../PackOpeningAnimation';
import TutorialOverlay from '../tutorial/TutorialOverlay';
import config from '../../config';

// Dev only: shows one rarely reached screen with sample data, e.g. /#screens/quest-reward
const DevScreens: React.FC = () => {
  const name = window.location.hash.replace('#screens/', '');
  const [heroes, setHeroes] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${config.API_BASE_URL}/api/heroes`)
      .then(r => r.json())
      .then(list => setHeroes(list.slice(0, 3)))
      .catch(() => undefined);
  }, []);
  const noop = () => undefined;

  switch (name) {
    case 'quest-reward':
      return (
        <QuestRewardModal
          reward={{ completed: [{ id: 1, text: 'Win 1 battle with Ninja' }, { id: 2, text: 'Win 1 battle going 2nd' }], xpGained: 40, vpGained: 8, leveledUp: true } as any}
          onOk={noop}
        />
      );
    case 'requirement':
      return <RequirementModal isOpen onClose={noop} message="You need at least 21 heroes to play Survival Mode." currentCount={12} requiredCount={21} type="heroes" />;
    case 'settings':
      return <SettingsModal onClose={noop} />;
    case 'how-to-play':
      return <HowToPlayModal onClose={noop} />;
    case 'pack-opening':
      return heroes.length ? <PackOpeningAnimation heroes={heroes} onComplete={noop} /> : null;
    case 'tutorial':
      return <TutorialOverlay step={{ key: 'dev', text: 'This is your Binder. Every hero you own lives here.', showNext: true, nextLabel: 'Got it', anchor: 'center' }} onNext={noop} />;
    default:
      return <div style={{ padding: 'var(--space-7)', color: 'var(--bone)' }}>Screens: quest-reward, requirement, settings, how-to-play, pack-opening, tutorial</div>;
  }
};

export default DevScreens;
```

In `App.tsx` add `import DevScreens from './components/ui/DevScreens';` beside the `UiKit` import, and in `renderGameContent` directly after the `#ui-kit` block add:

```tsx
    if (import.meta.env.DEV && window.location.hash.startsWith('#screens')) {
      return <DevScreens />;
    }
```

- [ ] **Step 3: Check the gallery renders (before any restyle)**

Run `npm run dev`. With Playwright MCP at 1280x800 open each of `http://localhost:<port>/#screens/quest-reward`, `requirement`, `settings`, `how-to-play`, `pack-opening` (wait 8 s for the animation), `tutorial` (hard reload each; a hash change alone does not reload) and screenshot as `.playwright-mcp/p4-before-<name>.png`. Expected: each screen renders in its current (old) style; the console shows no new errors other than network ones for the Settings ping. If `settings` throws because the socket is not connected, wrap nothing in the component: log in first with Quick admin login in the same tab, then navigate to `#screens/settings` using `browser_evaluate` `location.hash = '#screens/settings'` followed by a reload.

- [ ] **Step 4: Baselines of the real screens**

Quick admin login (tab 1). Screenshot the lobby with each of these open (at 1280x800), as `p4-before-<name>.png`: `shop` (click Shop), `collection` (click Binder, wait for the opening animation to finish), `profile` (click the avatar), `profile-icons` (Change Icon), `friends` (click the friends icon bottom-left). Resize to 390x844 and repeat `shop`, `collection` and `profile`. Record `git rev-parse HEAD` as `BASE_SHA`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "chore(ui): icons and a dev-only screens gallery for rarely reached modals"
git push origin main
```

---

### Task 2: Carve Friends and Messages out of App.css (no visual change)

**Files:**
- Create: `frontend/scripts/carve-social-css.mjs`, `frontend/scripts/ab-compare.js`, `frontend/scripts/ab-diff.mjs`, `frontend/src/styles/Social.css`, `frontend/public/__orig_app.css` (temporary, git-excluded)
- Modify: `frontend/src/App.css`, `frontend/src/App.tsx` (import)

**Interfaces:**
- Produces: `Social.css` holding every rule for classes rendered by `FriendsOverlay`, `FriendsIcon`, `MessageChat`, `MessageIcon` (and not by cards), plus media-query wrappers around them.

- [ ] **Step 1: Keep the original CSS for the comparison**

Run: `cp src/App.css public/__orig_app.css` and add `frontend/public/__orig_app.css` to `.git/info/exclude` (from the repo root: `echo "frontend/public/__orig_app.css" >> .git/info/exclude`). Expected: `git status --short` does not list the file.

- [ ] **Step 2: Write the carve script**

Create `frontend/scripts/carve-social-css.mjs`:

```js
// One-time: moves the Friends and Messages rules out of App.css into Social.css.
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

const GENERIC = new Set(['selected', 'active', 'disabled', 'dead', 'enemy', 'used', 'show', 'open', 'on', 'off', 'transitioning', 'completed', 'error', 'loading', 'left', 'right', 'online', 'offline', 'count']);
// Class names from JSX, including the static parts of template strings: className={`a ${x ? 'b' : ''}`}
function classNamesIn(file) {
  const t = read(file);
  const s = new Set();
  const add = raw => raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach(c => { if (/^[a-zA-Z][\w-]*$/.test(c)) s.add(c); });
  for (const m of t.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})/g)) add(m[1] || m[2] || m[3]);
  for (const m of t.matchAll(/['"`]([a-z][a-z0-9]*-[\w-]+(?: [a-z][\w-]*)*)['"`]/g)) add(m[1]);
  return s;
}

const cardSet = new Set([...classNamesIn('src/components/HeroCard.tsx'), ...classNamesIn('src/components/BattleFX.tsx')].filter(c => !GENERIC.has(c)));
const CARD_PREFIX = /^(status|tooltip|keyword|companion|shaman|totem|poison|card)(-|$)/;
const socialSet = new Set(['FriendsOverlay', 'FriendsIcon', 'MessageChat', 'MessageIcon']
  .flatMap(n => [...classNamesIn(`src/components/${n}.tsx`)]).filter(c => !GENERIC.has(c)));
const isCard = c => cardSet.has(c) || CARD_PREFIX.test(c);
const goesToSocial = h => {
  const cls = classesOf(h);
  return cls.length > 0 && cls.some(c => socialSet.has(c)) && !cls.some(isCard);
};

const keep = [];
const carved = [];
const mixed = [];
for (const c of chunks(read('src/App.css'))) {
  const h = headOf(c);
  if (h.startsWith('@media') || h.startsWith('@supports')) {
    const open = c.indexOf('{');
    const rules = chunks(c.slice(open + 1, c.lastIndexOf('}')));
    const mine = rules.filter(r => goesToSocial(headOf(r)));
    const rest = rules.filter(r => !goesToSocial(headOf(r)));
    const wrap = list => `${c.slice(0, open).trim()} {\n${list.map(r => '  ' + r.replace(/\n/g, '\n  ')).join('\n\n')}\n}`;
    if (mine.length) carved.push(wrap(mine));
    if (rest.length) keep.push(wrap(rest));
    continue;
  }
  if (h.startsWith('@')) { keep.push(c); continue; } // keyframes stay global in App.css
  if (goesToSocial(h)) carved.push(c);
  else {
    keep.push(c);
    if (classesOf(h).some(x => socialSet.has(x))) mixed.push(h.slice(0, 100));
  }
}

writeFileSync('src/App.css', keep.join('\n\n') + '\n');
writeFileSync('src/styles/Social.css', `/* Friends overlay, friends icon and messages, carved from App.css. */\n\n${carved.join('\n\n')}\n`);
console.log(`carved ${carved.length} blocks, kept ${keep.length}`);
console.log('kept in App.css although they mention a social class (card, generic or mixed rules):');
mixed.forEach(h => console.log('  ' + h));
```

- [ ] **Step 3: Run it and read the report**

Run: `node scripts/carve-social-css.mjs`
Expected: `carved N blocks` (about 60 to 100) and a short kept list. `grep -c "" src/styles/Social.css` is non-zero. If a clearly social rule (for example `.friend-request-item`) is in the kept list only because of a generic word, add that word to `GENERIC`, restore with `git checkout src/App.css`, delete `src/styles/Social.css` and rerun.

- [ ] **Step 4: Import it and prove nothing changed**

In `App.tsx` add `import './styles/Social.css';` below the `GameScreens.css` import. Write `frontend/scripts/ab-compare.js` (same method as the phase 3 check, with social roots):

```js
async () => {
  // A/B inside one live page: snapshot with the current CSS, swap App.css + Social.css for the original
  // App.css (served at /__orig_app.css), snapshot again, restore. Same DOM and state, so any difference is CSS.
  const ROOTS = ['.friends-overlay-backdrop', '.friends-icon', '.message-icon', '.message-chat-window', '.minimized-chat-indicator'];
  const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
    'borderTopStyle', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'textTransform',
    'textAlign', 'display', 'position', 'width', 'height', 'paddingTop', 'paddingLeft', 'marginTop',
    'marginLeft', 'opacity', 'zIndex', 'overflowY'];
  const snap = () => {
    const out = {};
    const seen = new Set();
    for (const sel of ROOTS) {
      for (const root of document.querySelectorAll(sel)) {
        for (const el of [root, ...root.querySelectorAll('*')]) {
          if (seen.has(el)) continue;
          seen.add(el);
          const cs = getComputedStyle(el);
          const sig = PROPS.map(p => cs[p]).join('|');
          const cls = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
          (out[`${el.tagName.toLowerCase()}.${cls}`] ||= new Set()).add(sig);
        }
      }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
  };
  const mine = [...document.querySelectorAll('style[data-vite-dev-id]')].filter(s => /\/src\/App\.css$|\/styles\/Social\.css$/.test(s.getAttribute('data-vite-dev-id')));
  const A = snap();
  const orig = document.createElement('style');
  orig.textContent = await (await fetch('/__orig_app.css')).text();
  mine.forEach(s => { s.disabled = true; });
  document.head.appendChild(orig);
  await new Promise(r => setTimeout(r, 150));
  const B = snap();
  orig.remove();
  mine.forEach(s => { s.disabled = false; });
  return { swapped: mine.length, A, B };
}
```

and `frontend/scripts/ab-diff.mjs`:

```js
// Splits an ab-compare.js result file into A and B and diffs them. Usage: node scripts/ab-diff.mjs result.json
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const text = readFileSync(process.argv[2], 'utf8');
const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
console.log(`swapped stylesheets: ${data.swapped}, classes compared: ${Object.keys(data.A).length}`);
writeFileSync(`${process.argv[2]}.A.json`, JSON.stringify(data.A));
writeFileSync(`${process.argv[2]}.B.json`, JSON.stringify(data.B));
try {
  console.log(execFileSync('node', ['scripts/style-diff.mjs', `${process.argv[2]}.A.json`, `${process.argv[2]}.B.json`], { encoding: 'utf8' }));
} catch (e) {
  console.log(e.stdout);
  process.exit(1);
}
```

Restart `npm run dev`. Quick admin login in two tabs, open the Friends overlay in tab 1 (click the friends icon). Run `browser_evaluate` with the contents of `ab-compare.js` as `function` and `filename` `.playwright-mcp/ab-friends.json`, then `node scripts/ab-diff.mjs ../.playwright-mcp/ab-friends.json`.
Expected: `swapped stylesheets: 2` and `no differences`, with at least 8 classes compared. Repeat once with the message icon visible (send nothing; it shows only with unread or minimized chats, so skip it if not showing) and with the player tooltip open (click a player in the online list if one exists; the second tab provides one). Fix any difference by moving that single rule back into `App.css`.

- [ ] **Step 5: Delete the helpers, build, commit**

```bash
rm -f public/__orig_app.css scripts/carve-social-css.mjs scripts/ab-compare.js scripts/ab-diff.mjs
npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir
git add -A frontend
git commit -m "refactor(css): carve Friends and Messages rules out of App.css"
git push origin main
```
Expected: build succeeds; `git status --short` shows nothing left over.

---

### Task 3: Re-token the stylesheets

**Files:**
- Modify (in place by the script): `Shop.css`, `HeroCollection.css`, `Binder.css`, `PackOpeningAnimation.css`, `ProfileModal.css`, `QuestRewardModal.css`, `SettingsModal.css`, `RulesModal.css`, `RequirementModal.css`, `Tutorial.css`, `Social.css` (all in `frontend/src/styles/`)
- Modify: `frontend/scripts/check-tokens.mjs`

- [ ] **Step 1: Apply the re-tokenizer**

Run:
```bash
node scripts/retoken-css.mjs src/styles/Shop.css src/styles/HeroCollection.css src/styles/Binder.css src/styles/PackOpeningAnimation.css src/styles/ProfileModal.css src/styles/QuestRewardModal.css src/styles/SettingsModal.css src/styles/RulesModal.css src/styles/RequirementModal.css src/styles/Tutorial.css src/styles/Social.css
```
Expected: 11 `retokened` lines.

- [ ] **Step 2: Add them to the lint list and check**

Append to `MIGRATED` in `check-tokens.mjs` the eleven files as `'styles/<name>.css'`.
Run: `npm run check:tokens`
Expected: `check-tokens: 30 files clean` (19 existing plus 11). If a raw colour remains (a colour inside `content:` or an SVG data URI, or an unusual function), replace it by hand with the nearest token and note it.

- [ ] **Step 3: Build and look**

Run `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success). Restart `npm run dev`, then screenshot the same views as Task 1 steps 3 and 4 as `p4-retoken-<name>.png`. They are now on the felt palette but unpolished. List every spot where text is unreadable (dark on dark) or an element looks broken, for Task 4. Note in particular how the Binder illustration (brown leather and cream paper) came out.

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git commit -m "feat(ui): re-token the shop, collection, profile, friends and modal styles"
git push origin main
```

---

### Task 4: Panels identity layer

**Files:**
- Create: `frontend/src/styles/Panels.css`
- Modify: `frontend/src/App.tsx` (import), `frontend/scripts/check-tokens.mjs`

- [ ] **Step 1: Write `Panels.css`** (visual properties only; layout stays as it is)

```css
/* Panels: one frame, one overlay, one set of buttons for every modal and overlay in the game. */

/* Overlays dim the table */
.shop-overlay, .profile-modal-overlay, .friends-overlay-backdrop, .requirement-modal-overlay,
.quest-reward-overlay, .pack-opening-overlay, .icon-selector-overlay, .modal-overlay {
  background: var(--scrim);
  backdrop-filter: none;
}

/* The frame: walnut, brass hairline, inset frame */
.shop-container, .profile-modal, .friends-overlay, .message-chat-window, .settings-modal, .rules-modal,
.requirement-modal-container, .quest-reward-modal, .pack-contents-container, .icon-selector {
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  color: var(--bone);
  font-family: var(--font-ui);
}

/* Titles in the display face */
.shop-header h2, .profile-header h2, .friends-overlay-header h3, .rules-modal-header h3, .chat-title,
.requirement-title, .quest-reward-modal h3, .pack-contents-title, .icon-selector-header h3 {
  font-family: var(--font-display);
  font-weight: 400;
  color: var(--bone);
  text-shadow: none;
  letter-spacing: 0;
}
.shop-section-header h3, .online-players-header h3, .favorite-hero-section h3 { font-family: var(--font-display); font-weight: 400; color: var(--bone); text-shadow: none; }
.rules-modal-header, .friends-overlay-header, .chat-header, .profile-header, .shop-header {
  background: var(--leather);
  border-bottom: 1px solid var(--brass-dim);
}

/* Primary actions are brass */
.shop-buy-btn, .pack-buy-btn, .change-icon-btn, .send-request-button, .accept-button, .add-friend-button,
.requirement-modal-button, .quest-reward-ok, .send-button {
  background: var(--brass);
  color: var(--felt-deep);
  border: 1px solid var(--brass-hi);
  border-radius: var(--radius-control);
  font: 700 var(--text-md) / 1.1 var(--font-ui);
  box-shadow: none;
  text-shadow: none;
}
.shop-buy-btn:hover:not(:disabled), .pack-buy-btn:hover:not(:disabled), .change-icon-btn:hover:not(:disabled),
.send-request-button:hover:not(:disabled), .accept-button:hover:not(:disabled), .add-friend-button:hover:not(:disabled),
.requirement-modal-button:hover:not(:disabled), .quest-reward-ok:hover:not(:disabled), .send-button:hover:not(:disabled) {
  background: var(--brass-hi);
  transform: none;
  box-shadow: none;
}
/* Secondary actions are outlines */
.pack-info-btn, .cancel-button, .profile-tool-btn, .favorite-button, .tooltip-action {
  background: transparent;
  color: var(--bone);
  border: 1px solid var(--brass);
  border-radius: var(--radius-control);
  font-family: var(--font-ui);
  box-shadow: none;
  text-shadow: none;
}
.pack-info-btn:hover:not(:disabled), .cancel-button:hover:not(:disabled), .profile-tool-btn:hover:not(:disabled),
.favorite-button:hover:not(:disabled), .tooltip-action:hover:not(:disabled) { background: var(--leather); transform: none; box-shadow: none; }
/* Destructive actions are ember outlines */
.reject-button, .remove-friend-action {
  background: transparent;
  color: var(--ember-hi);
  border: 1px solid var(--ember);
  border-radius: var(--radius-control);
  box-shadow: none;
}
.reject-button:hover:not(:disabled), .remove-friend-action:hover:not(:disabled) { background: var(--ember); color: var(--bone); transform: none; }
.tooltip-action { display: flex; align-items: center; gap: var(--space-2); }
.tooltip-action:disabled, .tooltip-action.disabled { opacity: 0.5; cursor: not-allowed; }
.accept-button, .reject-button { display: inline-flex; align-items: center; justify-content: center; }
button:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }

/* Inputs */
.add-friend-input, .message-input, .search-input, .filter-dropdown, .sort-dropdown {
  background: var(--felt-deep);
  color: var(--bone);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-control);
  font-family: var(--font-ui);
  box-shadow: inset 0 2px 4px var(--shade);
}
.add-friend-input:focus-visible, .message-input:focus-visible, .search-input:focus-visible,
.filter-dropdown:focus-visible, .sort-dropdown:focus-visible { outline: var(--focus-outline); outline-offset: 1px; border-color: var(--brass-hi); }

/* Shop messages */
.shop-message { background: var(--leather); color: var(--bone); border: 1px solid var(--brass-dim); border-left-width: 4px; border-radius: var(--radius-control); text-shadow: none; }
.shop-message.error { border-color: var(--ember); }
.shop-message.success { border-color: var(--verdigris); }
.shop-hero-purchased-overlay { background: color-mix(in srgb, var(--felt-deep) 70%, transparent); }
.purchased-text { font: 400 var(--text-xl) / 1 var(--font-display); color: var(--brass-hi); text-shadow: none; }
.empty-icon { color: var(--verdigris); }

/* Icons that replaced emoji */
.favorite-star, .quest-reward-star { fill: currentColor; color: var(--brass-hi); }
.icon-lock { color: var(--bone-dim); }
.requirement-warning-icon { color: var(--ember-hi); }
.quest-reward-check { color: var(--verdigris); }

@media (prefers-reduced-motion: reduce) {
  .shop-buy-btn, .pack-buy-btn, .send-button, .quest-reward-ok { transition: none; }
}
```

- [ ] **Step 2: Import it and lint**

In `App.tsx` add `import './styles/Panels.css';` below the `BattleLog.css` import. Append `'styles/Panels.css'` to `MIGRATED`.
Run: `npm run check:tokens` (Expected: `31 files clean`) and `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

- [ ] **Step 3: Look and iterate**

Restart `npm run dev`. Screenshot every view from Task 1 steps 3 and 4 as `p4-new-<name>.png` and compare with the `p4-before-*` and `p4-retoken-*` shots. Fix anything unreadable, misaligned or off-palette in `Panels.css` (never in the retokened files) until each looks like part of the same game as the lobby. Record any selector you had to add or change.

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git commit -m "feat(ui): panel frame, overlays and buttons on the table palette"
git push origin main
```

---

### Task 5: Icons and sentence-case copy

**Files:**
- Modify: `Shop.tsx`, `HeroCollection.tsx`, `ProfileModal.tsx`, `FriendsOverlay.tsx`, `QuestRewardModal.tsx`, `SettingsModal.tsx`, `RequirementModal.tsx` (all in `frontend/src/components/`)

- [ ] **Step 1: Write the edit script to a file and run it**

Create `.superpowers/phase4-copy.cjs` in the repo root (git-excluded scratch) with this content, then run `node .superpowers/phase4-copy.cjs` from the repo root:

```js
const fs = require('fs');
const FE = 'frontend/src/components/';
function edit(file, fn) {
  let s = fs.readFileSync(FE + file, 'utf8');
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  s = fn(s);
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(FE + file, s);
}
// Plain string replace, every occurrence; throws if the text is missing
const all = (s, from, to, label) => {
  if (!s.includes(from)) throw new Error('missing: ' + label);
  return s.split(from).join(to);
};
// Same, but missing text is fine (optional copy tweaks)
const maybe = (s, from, to) => (s.includes(from) ? s.split(from).join(to) : s);
const withIcon = (s, after) => (s.includes("import Icon from './ui/Icon';") ? s : all(s, after, after + "\nimport Icon from './ui/Icon';", 'icon import'));

edit('Shop.tsx', s => {
  s = withIcon(s, "import Coin from './Coin';");
  s = all(s, '`❌ ${data.message}`', '`${data.message}`', 'shop error message');
  s = all(s, "'❌ Purchase failed. Please try again.'", "'Purchase failed. Check your connection and try again.'", 'purchase failed');
  s = all(s, "'❌ Pack purchase failed. Please try again.'", "'Pack purchase failed. Check your connection and try again.'", 'pack failed');
  s = all(s, '<h2>🏪 Hero Shop</h2>', '<h2>Hero shop</h2>', 'title');
  s = all(s, '<div className="empty-icon">🎉</div>', '<Icon name="check" size={40} className="empty-icon" />', 'empty icon');
  s = all(s, '<h3>All Heroes Unlocked!</h3>', '<h3>You own every hero</h3>', 'empty title');
  s = all(s, '<p>You own all available heroes in the game.</p>', '<p>New heroes will appear here when they are added.</p>', 'empty text');
  s = all(s, 'PURCHASED', 'Purchased', 'purchased');
  s = maybe(s, 'Buy Hero', 'Buy hero');
  s = maybe(s, 'Buy Pack', 'Buy pack');
  s = maybe(s, "See What's Inside", "See what's inside");
  s = maybe(s, '>Hero Sale<', '>Hero sale<');
  s = maybe(s, '>Hero Packs<', '>Hero packs<');
  return s;
});

edit('HeroCollection.tsx', s => {
  s = withIcon(s, "import BinderOpening from './BinderOpening';");
  s = all(s, '<div className="favorite-star">⭐</div>', '<Icon name="star" size={18} className="favorite-star" />', 'favorite star');
  s = all(s, "'⭐ Remove from Favorites' : '☆ Add to Favorites'", "'Remove from favorites' : 'Add to favorites'", 'favorite button');
  return s;
});

edit('ProfileModal.tsx', s => {
  s = withIcon(s, "import CloseButton from './CloseButton';");
  return all(s, '<span className="icon-lock" aria-hidden="true">🔒</span>', '<Icon name="lock" size={18} className="icon-lock" />', 'lock');
});

edit('FriendsOverlay.tsx', s => {
  s = withIcon(s, "import CloseButton from './CloseButton';");
  s = all(s, '                        ✓\n', '                        <Icon name="check" />\n', 'accept');
  s = all(s, '                        ✗\n', '                        <Icon name="close" />\n', 'reject');
  s = all(s, 'className="accept-button"\n', 'className="accept-button"\n                        aria-label="Accept request"\n', 'accept label');
  s = all(s, 'className="reject-button"\n', 'className="reject-button"\n                        aria-label="Decline request"\n', 'reject label');
  s = all(s, '💬 Message', '<Icon name="chat" /> Message', 'message');
  s = all(s, '⚔️ Challenge', '<Icon name="swords" /> Challenge', 'challenge');
  s = all(s, '👥 Add Friend', '<Icon name="userPlus" /> Add friend', 'add friend');
  s = all(s, '❌ Remove Friend', '<Icon name="userMinus" /> Remove friend', 'remove friend');
  s = all(s, '👁️ Watch Game', '<Icon name="eye" /> Watch game', 'watch');
  return s;
});

edit('QuestRewardModal.tsx', s => {
  s = withIcon(s, "import Coin from './Coin';");
  s = all(s, '<div className="quest-reward-star">★</div>', '<Icon name="star" size={36} className="quest-reward-star" />', 'star');
  s = all(s, '<h3>Quest Complete!</h3>', '<h3>Quest complete</h3>', 'title');
  s = all(s, '<span className="quest-reward-check">✓</span>', '<Icon name="check" className="quest-reward-check" />', 'check');
  return s;
});

edit('SettingsModal.tsx', s => all(s, '<h3>⚙️ Settings</h3>', '<h3>Settings</h3>', 'settings title'));

edit('RequirementModal.tsx', s => {
  s = all(s, "import React from 'react';", "import React from 'react';\nimport Icon from './ui/Icon';", 'react import');
  s = all(s, '<span className="requirement-warning-icon">⚠️</span>', '<Icon name="warning" size={24} className="requirement-warning-icon" />', 'warning');
  s = all(s, "'21 Heroes Required' : 'Level 3 Required'", "'21 heroes required' : 'Level 3 required'", 'titles');
  return s;
});

console.log('phase 4 copy edits applied');
```

If `Shop.tsx`, `ProfileModal.tsx` or `FriendsOverlay.tsx` do not contain the exact import line used as an anchor (`import Coin from './Coin';`, `import CloseButton from './CloseButton';`), the script fails with `missing: icon import`; in that case change the anchor to any import line that file does have and rerun.

- [ ] **Step 2: Check the diff and the sweeps**

Run from the repo root: `git diff --stat` (Expected: the seven components changed, nothing else), then from `frontend/`:
`git grep -n -P "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B50}\x{2713}\x{2715}]" -- src/components/Shop.tsx src/components/HeroCollection.tsx src/components/ProfileModal.tsx src/components/FriendsOverlay.tsx src/components/QuestRewardModal.tsx src/components/SettingsModal.tsx src/components/RequirementModal.tsx | grep -v "console\."`
Expected: no output.
Run: `npm run check:tokens` (Expected: 31 files clean), `npx tsc --noEmit 2>&1 | grep -E "Shop|HeroCollection|ProfileModal|FriendsOverlay|QuestReward|SettingsModal|RequirementModal|Icon.tsx"` (Expected: no new errors), `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).

- [ ] **Step 3: Look and commit**

Restart dev, re-screenshot Shop, Collection (select a card and check the favorite button), Profile with the icon picker, Friends and the gallery screens as `p4-copy-<name>.png`; each icon renders and lines up with its text. Then:

```bash
git add -A frontend
git commit -m "feat(ui): icons instead of emoji and sentence-case copy on shop, collection, profile, friends and modals"
git push origin main
```

---

### Task 6: Verify every screen

**Files:** none modified unless a check fails.

- [ ] **Step 1: Gates**

Run: `npm run check:tokens`, `node --test scripts/retoken-css.test.mjs`, `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir`, and `cd ../backend && npm test`.
Expected: `31 files clean`, 8 tests pass, build success, backend `# pass 104` and `# fail 0`.

- [ ] **Step 2: Desktop inventory (1280x800)**

Screenshot and read each, `browser_evaluate` `document.documentElement.scrollWidth <= innerWidth` is `true` for each: Shop (sale grid, pack section, "See what's inside" modal), Collection (the binder, one card selected with the favorite button, filters and search), Profile (stats, icon picker open), Friends (empty), Settings, How to play, Quest reward, Requirement, Pack opening (after the animation completes), Tutorial overlay.
For cards shown in the Shop, Collection, Profile and pack opening, `browser_evaluate` over every `.hero-card .card-details`: `d.scrollHeight - d.clientHeight` is `0` for all.

- [ ] **Step 3: Forced states**

In the Shop append `<div class="shop-message error">Not enough to buy this.</div>` and a `success` one to `.shop-container`, screenshot: both read on walnut with a coloured left rule and no emoji. In the Collection with a card selected click the favorite button twice; the star icon appears on the card and the button text flips between "Add to favorites" and "Remove from favorites".

- [ ] **Step 4: Friends scenario (two tabs)**

Tab 1 (Admin1): open Friends, type `Admin2` in the add-friend input and send the request. Tab 2 (Admin2): Friends shows the request with accept and decline icon buttons (screenshot), accept it. Both: each other appear in the friends list as friends and online; click one to open the tooltip: Message, Challenge, Remove friend and Watch game, all with icons (screenshot). Click Message: the chat window opens (screenshot), type a message and send it; the other tab shows the message icon with a notification badge (screenshot). Minimize a chat: the minimized indicator shows. Finally click Remove friend in tab 1 to clean up the dev data.

- [ ] **Step 5: Binder opening and reduced motion**

Open the Binder with normal motion: the cover swing animation plays (screenshot mid-animation if possible) and ends on the open binder. With `browser_emulate_media` `reducedMotion: 'reduce'` reopen it: the intro is skipped and the pages show immediately. Reset to `no-preference` afterwards.

- [ ] **Step 6: Phone sizes**

At 390x844 and 667x375 screenshot Shop, Collection, Profile, Friends and Settings: no sideways scroll, every button reachable, text readable, cards showing all their text (or scrolling within the panel as before).

- [ ] **Step 7: Sweeps**

Run: `git grep -n -iE "victory point|\bVP\b" -- src/components/Shop.tsx src/components/HeroCollection.tsx src/components/ProfileModal.tsx src/components/FriendsOverlay.tsx src/components/QuestRewardModal.tsx src/styles/Panels.css src/styles/Shop.css` (Expected: only identifiers such as `vp-icon` class names, never visible text) and `git grep -n -E ">[A-Z][A-Z ]{5,}<|PURCHASED|ABANDON" -- src/components` (Expected: no output).

- [ ] **Step 8: Record completion and clean up**

Append to the Phases section of the spec: `Phase 4 complete (YYYY-MM-DD). Known follow-ups: <items>.` Include: `SpectatorView` is dead code (not restyled); the tutorial overlay was checked through the dev gallery only; anything from Steps 2 to 6 you could not fix. Stop the dev server, delete `.playwright-mcp`, confirm `git status` is clean and `frontend/dist` untouched, then:

```bash
git add docs
git commit -m "docs: record phase 4 completion"
git push origin main
```
