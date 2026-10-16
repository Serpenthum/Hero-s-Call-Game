# UI Redesign Phase 1: Foundation, Shell and Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the "table" design system (tokens, fonts, icons, primitives), restyle the shared close button and app base, and rebuild the login and register pages on it.

**Architecture:** One `tokens.css` holds every colour, type, space, radius, shadow and motion value. A `primitives.css` builds reusable `ui-*` classes on tokens. A small `Icon` component replaces emoji. Login and register share one `auth.css` with new `auth-*` class names (the old global selectors such as `.form-group` and `.game-title` collide with other screens). A node script (`check-tokens.mjs`) fails if migrated files contain raw colour literals; it is the automated gate, and screenshots are the visual gate.

**Tech Stack:** React 18, Vite 4, plain CSS, `@fontsource/im-fell-english`, `@fontsource/alegreya-sans`, a Node 20 script, Playwright MCP tools for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-15-ui-redesign-design.md`

## Global Constraints

- Colours (verbatim): felt `#101b18`, walnut `#241a14`, leather `#33261d`, brass `#b08a45`, bone `#e6dfcf`, ember `#c4482f`, verdigris `#5fa08a`. No Bootstrap colours (`#007bff`, `#28a745`, `#dc3545`).
- Type: IM Fell English for titles and large numerals; Alegreya Sans for all UI text; sentence case; no all-caps eyebrow labels; no emoji icons (use `Icon`); body line length under 80 characters.
- Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow.
- Motion only in response to actions, plus one orchestrated moment per screen; `prefers-reduced-motion` respected.
- Quality floor: works down to phone width (320px), visible keyboard focus on every control, sufficient contrast.
- Copy: buttons say what happens ("Sign in", "Create account"); the same action keeps one name through the flow; errors say what went wrong and how to fix it.
- Currency (user rule): never name it. Show the coin image (`components/Coin.tsx`, leave its file as is) beside a number. No "VP", "victory points" or "coins" in UI text or server messages. Unaffordable: "Not enough to buy this." Done for server text on 2026-10-15 (commit after Task 3); later phases apply it to each screen they restyle.
- Hero cards: do NOT edit `HeroCard.tsx` or `HeroCard.css`. A card must still show its image as now, its stats, and ALL ability and special text.
- Push straight to `main` (project convention). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `frontend/dist` is tracked in git: never commit build output. Verification builds use `--outDir` in the temp directory.
- Existing `tsc --noEmit` errors are unrelated; the gates are `check:tokens`, `vite build`, and screenshots.

## Review Focus

- A 409 "account already active" or any long server message must wrap inside the book at 320px wide, not overflow (Task 4, step 4.5).
- Remember-me: saved credentials still prefill username and password, show the "loaded from saved data" notice, and unchecking still clears storage (Task 4, step 4.6).
- Keyboard only: Tab reaches every control in a sensible order, each shows a visible focus outline, and Enter submits (Task 4, step 4.7).
- `prefers-reduced-motion: reduce`: no clasp animation, the spinner does not rotate (Task 4, step 4.8).
- Short landscape phone (667x375): the book scrolls inside the page; the title and submit button are reachable (Task 4, step 4.3).

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/styles/tokens.css` (new) | Every design token. The only file allowed to contain raw colour literals. |
| `frontend/src/styles/primitives.css` (new) | `ui-btn`, `ui-input`, `ui-check`, `ui-panel`, `ui-badge`, `ui-tab`, `ui-modal*`, `ui-pill`, `ui-hpbar`, `ui-spinner`, `ui-notice` |
| `frontend/src/styles/auth.css` (new) | Login and register layout: the "book" on the felt |
| `frontend/src/components/ui/Icon.tsx` (new) | Inline-SVG icon set |
| `frontend/src/components/ui/UiKit.tsx` (new) | Dev-only gallery at `#ui-kit` to screenshot every primitive |
| `frontend/scripts/check-tokens.mjs` (new) | Lint: no raw colour literals in migrated files |
| `frontend/src/styles/CloseButton.css` (rewrite) | Shared close button on tokens |
| `frontend/src/index.css`, `frontend/src/main.tsx` (modify) | Import order, fonts, felt body, focus colour |
| `frontend/src/App.tsx` (modify) | `#ui-kit` dev route |
| `LoginPage.tsx`, `RegisterPage.tsx` (modify) | New markup classes, copy, icons; logic unchanged |
| `LoginPage.css`, `RegisterPage.css`, `AuthResponsive.css` (delete) | Replaced by `auth.css` |

All commands run from `frontend/` unless a path says otherwise. Dev server: `npm run dev` (port 5173); stop it when finished.

---

### Task 1: Tokens, fonts, base and the token lint

**Files:**
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/primitives.css`, `frontend/scripts/check-tokens.mjs`
- Modify: `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/package.json`

**Interfaces:**
- Produces: CSS custom properties used by every later task: `--felt --felt-deep --walnut --leather --leather-hi --brass --brass-hi --brass-dim --bone --bone-dim --ember --ember-hi --verdigris --scrim --shade --font-display --font-ui --text-xs --text-sm --text-md --text-lg --text-xl --text-2xl --text-3xl --space-1..--space-9 --radius-control --radius-panel --shadow-panel --inset-frame --focus-outline --ease --dur --felt-surface`; npm script `check:tokens`; the `MIGRATED` list in `check-tokens.mjs` that each task extends.

- [ ] **Step 1: Capture baseline screenshots (before any change)**

Start `npm run dev` in the background. With the Playwright MCP tools: `browser_resize` 1280x800, `browser_navigate` to `http://localhost:5173`, `browser_take_screenshot` (filename `baseline-login-desktop.png`). Click "Open Card Layout Test", `browser_take_screenshot` (`baseline-cards-desktop.png`). Resize to 390x844 and take `baseline-cards-phone.png`. These prove cards are unchanged later. Record the current commit with `git rev-parse HEAD` as `BASE_SHA` for Task 6.

- [ ] **Step 2: Write the lint script**

Create `frontend/scripts/check-tokens.mjs`:

```js
// Fails when a migrated file contains a raw colour literal. Colours live in tokens.css only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Each task appends the files it migrates; later phases extend this list.
const MIGRATED = [
  'styles/primitives.css',
];

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
let failures = 0;

for (const file of MIGRATED) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const hits = line.match(RAW_COLOUR);
    if (hits) {
      failures += hits.length;
      console.error(`${file}:${i + 1}: raw colour ${hits.join(', ')}`);
    }
  });
}

if (failures) {
  console.error(`\n${failures} raw colour literal(s). Use a token from styles/tokens.css.`);
  process.exit(1);
}
console.log(`check-tokens: ${MIGRATED.length} files clean`);
```

Add to `package.json` scripts: `"check:tokens": "node scripts/check-tokens.mjs"`.

- [ ] **Step 3: Run it and confirm it fails (file missing)**

Run: `npm run check:tokens`
Expected: FAIL with `ENOENT ... styles/primitives.css`. This proves the gate reads the file list.

- [ ] **Step 4: Install fonts**

Run: `npm install @fontsource/im-fell-english @fontsource/alegreya-sans`
Expected: both added to `dependencies`; `package-lock.json` updated.

- [ ] **Step 5: Create `frontend/src/styles/tokens.css`**

```css
/* Design tokens for the "table" identity. The ONLY file allowed to hold raw colour values. */
:root {
  /* Surfaces */
  --felt: #101b18;
  --felt-deep: #0b1311;
  --walnut: #241a14;
  --leather: #33261d;
  --leather-hi: #40322a;

  /* Metal and text */
  --brass: #b08a45;
  --brass-hi: #cfa95f;
  --brass-dim: #6e5629;
  --bone: #e6dfcf;
  --bone-dim: #a89f8c;

  /* Signals */
  --ember: #c4482f;
  --ember-hi: #dc6246;
  --verdigris: #5fa08a;

  --scrim: rgb(5 9 8 / 0.72);
  --shade: rgb(0 0 0 / 0.45);

  /* The table: a soft vignette over felt plus a faint woven grain */
  --felt-weave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  --felt-surface:
    radial-gradient(ellipse at 50% 28%, color-mix(in srgb, var(--verdigris) 9%, var(--felt)), var(--felt) 58%, var(--felt-deep)),
    var(--felt-weave),
    var(--felt);

  /* Type */
  --font-display: 'IM Fell English', Georgia, 'Times New Roman', serif;
  --font-ui: 'Alegreya Sans', 'Segoe UI', system-ui, sans-serif;
  --text-xs: 0.8125rem;
  --text-sm: 0.9375rem;
  --text-md: 1.0625rem;
  --text-lg: 1.25rem;
  --text-xl: 1.625rem;
  --text-2xl: 2.25rem;
  --text-3xl: 3.25rem;

  /* Space (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-7: 2rem;
  --space-8: 2.5rem;
  --space-9: 3.5rem;

  /* Shape */
  --radius-control: 4px;
  --radius-panel: 8px;
  --shadow-panel: 0 18px 40px var(--shade);
  --inset-frame: inset 0 0 0 4px var(--walnut), inset 0 0 0 5px var(--brass-dim);

  /* Interaction */
  --focus-outline: 2px solid var(--brass-hi);
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --dur: 160ms;
}
```

- [ ] **Step 6: Wire imports and base in `main.tsx` and `index.css`**

In `frontend/src/main.tsx` replace `import './index.css';` with:

```tsx
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './styles/tokens.css';
import './styles/primitives.css';
import './index.css';
```

In `frontend/src/index.css`, in the `body` rule: set `font-family: var(--font-ui);`, replace `background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);` with `background: var(--felt-surface); color: var(--bone);`. In `input:focus { ... }` change `border-color: #007bff;` to `border-color: var(--brass-hi);`. Leave the other global `button`/`input` rules as they are (later phases migrate the screens that depend on them).

- [ ] **Step 7: Create `primitives.css` with the placeholder**

`frontend/src/styles/primitives.css` contains only `/* Reusable ui-* primitives built on tokens.css. */` (Task 2 fills it).

- [ ] **Step 8: Verify and commit**

Run: `npm run check:tokens` (Expected: `check-tokens: 1 files clean`).
Run: `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success, fonts bundled).
Run: `git status --short` and confirm nothing under `frontend/dist` changed.

```bash
git add frontend/src frontend/scripts frontend/package.json frontend/package-lock.json
git commit -m "feat(ui): design tokens, self-hosted fonts, token lint"
git push origin main
```

---

### Task 2: Icon set and primitives

**Files:**
- Create: `frontend/src/components/ui/Icon.tsx`, `frontend/src/components/ui/UiKit.tsx`
- Modify: `frontend/src/styles/primitives.css`, `frontend/scripts/check-tokens.mjs`, `frontend/src/App.tsx` (`renderGameContent`, around line 2123)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `Icon` (`name: IconName; size?: number; title?: string; className?: string`), `IconName = 'close'|'check'|'warning'|'key'|'back'|'lock'|'info'`; classes `ui-btn` (+ `--primary --danger --quiet --sm --block`), `ui-input`, `ui-field`, `ui-label`, `ui-hint`, `ui-check`, `ui-panel`, `ui-badge`, `ui-pill`, `ui-tab` (+ `[aria-selected=true]`), `ui-modal-overlay`, `ui-modal`, `ui-hpbar` (+ `__fill`, `--foe`), `ui-spinner`, `ui-notice` (+ `--error --success --info`).

- [ ] **Step 1: Write `Icon.tsx`**

```tsx
import React from 'react';

// 24x24 stroke icons. Add a path here before using a new name anywhere.
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  warning: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.01',
  key: 'M4.5 15a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M10.5 12.5L19 4M16 7l3 3M14 9l2 2',
  back: 'M14 6l-6 6 6 6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  info: 'M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M12 11v5M12 8v.01',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  // Provide when the icon carries meaning on its own; omitted icons are decorative
  title?: string;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 18, title, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path d={PATHS[name]} />
  </svg>
);

export default Icon;
```

- [ ] **Step 2: Write the primitives (replace the placeholder in `primitives.css`)**

```css
/* Reusable ui-* primitives built on tokens.css. */

/* Buttons. The global `button` rules in index.css set a hover lift; neutralised here. */
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 2.5rem;
  padding: 0 var(--space-5);
  font: 700 var(--text-md) / 1 var(--font-ui);
  color: var(--bone);
  background: var(--leather);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.ui-btn:hover:not(:disabled) { background: var(--leather-hi); border-color: var(--brass); transform: none; box-shadow: none; }
.ui-btn:active:not(:disabled) { transform: translateY(1px); }
.ui-btn:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }
.ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-btn--primary { background: var(--brass); border-color: var(--brass-hi); color: var(--felt-deep); }
.ui-btn--primary:hover:not(:disabled) { background: var(--brass-hi); border-color: var(--brass-hi); }
.ui-btn--danger { background: transparent; border-color: var(--ember); color: var(--ember-hi); }
.ui-btn--danger:hover:not(:disabled) { background: var(--ember); border-color: var(--ember); color: var(--bone); }
.ui-btn--quiet { background: transparent; border-color: transparent; color: var(--bone-dim); }
.ui-btn--quiet:hover:not(:disabled) { background: var(--leather); border-color: transparent; color: var(--bone); }
.ui-btn--sm { min-height: 2rem; padding: 0 var(--space-3); font-size: var(--text-sm); }
.ui-btn--block { width: 100%; }

/* Form fields */
.ui-field { display: flex; flex-direction: column; gap: var(--space-2); }
.ui-label { font: 700 var(--text-sm) / 1.2 var(--font-ui); color: var(--bone); }
.ui-hint { font-size: var(--text-xs); line-height: 1.35; color: var(--bone-dim); }
.ui-input {
  width: 100%;
  min-height: 2.75rem;
  padding: 0 var(--space-3);
  font: 400 var(--text-md) / 1.2 var(--font-ui);
  color: var(--bone);
  background: var(--felt-deep);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-control);
  box-shadow: inset 0 2px 4px var(--shade);
  transition: border-color var(--dur) var(--ease);
}
.ui-input::placeholder { color: var(--bone-dim); opacity: 0.7; }
.ui-input:hover:not(:disabled) { border-color: var(--brass); }
.ui-input:focus-visible { outline: var(--focus-outline); outline-offset: 1px; border-color: var(--brass-hi); }
.ui-input:disabled { opacity: 0.55; cursor: not-allowed; }
.ui-check { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); color: var(--bone); cursor: pointer; }
.ui-check input { width: 1.125rem; height: 1.125rem; margin: 0; padding: 0; accent-color: var(--brass); }
.ui-check input:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }

/* Surfaces */
.ui-panel {
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  color: var(--bone);
}
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.125rem var(--space-2);
  font: 700 var(--text-xs) / 1.4 var(--font-ui);
  color: var(--bone);
  background: var(--leather);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-control);
}
.ui-pill {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--felt-deep);
  border: 1px solid var(--brass-dim);
  border-radius: 999px;
  color: var(--bone);
  font: 700 var(--text-md) / 1 var(--font-ui);
  font-variant-numeric: tabular-nums;
}

/* Tabs */
.ui-tab {
  padding: var(--space-2) var(--space-4);
  font: 700 var(--text-md) / 1 var(--font-ui);
  color: var(--bone-dim);
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-control) var(--radius-control) 0 0;
}
.ui-tab:hover { color: var(--bone); background: var(--leather); transform: none; box-shadow: none; }
.ui-tab[aria-selected='true'] { color: var(--bone); border-bottom-color: var(--brass-hi); background: var(--leather); }
.ui-tab:focus-visible { outline: var(--focus-outline); outline-offset: 2px; }

/* Modal shell (the Modal component arrives with the phase that migrates the modals) */
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--scrim);
}
.ui-modal {
  position: relative;
  width: 100%;
  max-width: 32rem;
  max-height: 100%;
  overflow-y: auto;
  padding: var(--space-6);
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
  color: var(--bone);
}

/* HP bar: ally in verdigris, foe in ember. Set the fill width inline. */
.ui-hpbar { height: 0.5rem; background: var(--felt-deep); border: 1px solid var(--brass-dim); border-radius: 999px; overflow: hidden; }
.ui-hpbar__fill { height: 100%; background: var(--verdigris); transition: width 300ms var(--ease); }
.ui-hpbar--foe .ui-hpbar__fill { background: var(--ember); }

/* Feedback */
.ui-notice {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--bone);
  background: var(--leather);
  border: 1px solid var(--brass-dim);
  border-left-width: 4px;
  border-radius: var(--radius-control);
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.ui-notice svg { flex-shrink: 0; margin-top: 0.125rem; }
.ui-notice--error { border-color: var(--ember); }
.ui-notice--error svg { color: var(--ember-hi); }
.ui-notice--success { border-color: var(--verdigris); }
.ui-notice--success svg { color: var(--verdigris); }
.ui-notice--info svg { color: var(--brass-hi); }

.ui-spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--brass-dim);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: ui-spin 0.8s linear infinite;
}
@keyframes ui-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .ui-spinner { animation: none; }
  .ui-btn, .ui-input, .ui-hpbar__fill { transition: none; }
}
```

- [ ] **Step 3: Write `UiKit.tsx`** (dev gallery so every primitive can be screenshotted)

```tsx
import React from 'react';
import Icon from './Icon';
import CloseButton from '../CloseButton';

const UiKit: React.FC = () => (
  <div style={{ padding: 'var(--space-7)', display: 'grid', gap: 'var(--space-6)', maxWidth: '44rem', margin: '0 auto' }}>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>UI kit</h1>
    <div className="ui-panel" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="ui-btn ui-btn--primary">Primary</button>
        <button className="ui-btn">Secondary</button>
        <button className="ui-btn ui-btn--danger">Danger</button>
        <button className="ui-btn ui-btn--quiet">Quiet</button>
        <button className="ui-btn" disabled>Disabled</button>
        <button className="ui-btn ui-btn--sm">Small</button>
        <CloseButton onClick={() => undefined} />
      </div>
      <div className="ui-field">
        <label className="ui-label" htmlFor="kit-name">Hero name</label>
        <input id="kit-name" className="ui-input" placeholder="Enter a name" />
        <span className="ui-hint">3 to 12 characters.</span>
      </div>
      <label className="ui-check"><input type="checkbox" defaultChecked /> Keep me signed in</label>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="ui-badge">Level 12</span>
        <span className="ui-pill"><Icon name="check" /> 340 VP</span>
        <span className="ui-btn ui-btn--quiet ui-btn--sm"><span className="ui-spinner" /> Loading</span>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <button role="tab" aria-selected="true" className="ui-tab">Heroes</button>
        <button role="tab" aria-selected="false" className="ui-tab">Packs</button>
      </div>
      <div className="ui-hpbar"><div className="ui-hpbar__fill" style={{ width: '70%' }} /></div>
      <div className="ui-hpbar ui-hpbar--foe"><div className="ui-hpbar__fill" style={{ width: '35%' }} /></div>
      <div className="ui-notice ui-notice--error"><Icon name="warning" />Wrong username or password. Check both and try again.</div>
      <div className="ui-notice ui-notice--success"><Icon name="check" />Account created. You can sign in now.</div>
      <div className="ui-notice ui-notice--info"><Icon name="info" />Login information loaded from saved data.</div>
    </div>
    <div className="ui-modal" style={{ position: 'static' }}>Modal shell: walnut panel, brass frame.</div>
  </div>
);

export default UiKit;
```

- [ ] **Step 4: Add the dev route in `App.tsx`**

Add `import UiKit from './components/ui/UiKit';` beside the other component imports. In `renderGameContent`, before `if (showCardLayoutTest)`, insert:

```tsx
    if (import.meta.env.DEV && window.location.hash === '#ui-kit') {
      return <UiKit />;
    }
```

- [ ] **Step 5: Extend the lint list and run it**

In `check-tokens.mjs` append to `MIGRATED`: `'components/ui/Icon.tsx'`, `'components/ui/UiKit.tsx'`.
Run: `npm run check:tokens`
Expected: `check-tokens: 3 files clean`.

- [ ] **Step 6: Visual check**

Playwright MCP: navigate to `http://localhost:5173/#ui-kit` (reload), screenshot at 1280x800 and 390x844. Check that every variant is visible, text is readable, nothing overflows at 390px, and pressing Tab (`browser_press_key`) shows a brass outline on each control (screenshot after two presses).

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/scripts
git commit -m "feat(ui): icon set, primitives and dev UI kit"
git push origin main
```

---

### Task 3: Shared close button on tokens

**Files:**
- Rewrite: `frontend/src/styles/CloseButton.css`
- Modify: `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Consumes: tokens. `CloseButton.tsx` keeps its props (`onClick`, `label?`, `className?`) and class `game-close-btn`; no TSX change.

- [ ] **Step 1: Add the file to the lint list and see it fail**

Append `'styles/CloseButton.css'` to `MIGRATED`.
Run: `npm run check:tokens`
Expected: FAIL, listing `styles/CloseButton.css` lines containing `rgba(255, 71, 87, ...)` and `#fff`.

- [ ] **Step 2: Replace the file contents**

```css
/* Shared close button: a leather square with a brass hairline, used on every modal and panel */
.game-close-btn {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  border: 1px solid var(--brass-dim);
  background: var(--leather);
  color: var(--bone-dim);
  cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.game-close-btn svg {
  display: block;
}

.game-close-btn:hover {
  background: var(--leather-hi);
  border-color: var(--brass);
  color: var(--bone);
  transform: none;
  box-shadow: none;
}

.game-close-btn:active {
  transform: translateY(1px);
}

.game-close-btn:focus-visible {
  outline: var(--focus-outline);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .game-close-btn {
    transition: none;
  }
}
```

- [ ] **Step 3: Verify**

Run: `npm run check:tokens` (Expected: `4 files clean`) and `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success). Screenshot `#ui-kit`; the close button now matches the other controls.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/CloseButton.css frontend/scripts
git commit -m "feat(ui): restyle shared close button on tokens"
git push origin main
```

---

### Task 4: Login page

**Files:**
- Create: `frontend/src/styles/auth.css`
- Modify: `frontend/src/components/LoginPage.tsx`, `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Consumes: `Icon`, primitives, tokens. `LoginPage` props unchanged (`onLogin`, `onShowRegister`, `onStartCardTest`).
- Produces: `auth-*` classes reused by Task 5: `auth-page` (+ `auth-page--login`, `auth-page--register`), `auth-backdrop`, `auth-book`, `auth-title`, `auth-lede`, `auth-form`, `auth-actions`, `auth-switch`, `auth-devtools`.

- [ ] **Step 1: Add both files to the lint list**

Append `'styles/auth.css'` and `'components/LoginPage.tsx'` to `MIGRATED`.

- [ ] **Step 2: Write `auth.css`**

```css
/* Login and register: a leather-bound book with a brass clasp, lying on the felt table */
.auth-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
    max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  background: var(--felt-surface);
  color: var(--bone);
  font-family: var(--font-ui);
}

.auth-backdrop {
  position: fixed;
  inset: 0;
  opacity: 0.16;
  filter: saturate(0.4);
  pointer-events: none;
}
.auth-page--login .auth-backdrop { background: var(--login-background-image); }
.auth-page--register .auth-backdrop { background: var(--register-background-image); }

.auth-book {
  position: relative;
  width: 100%;
  max-width: 26rem;
  margin: auto;
  padding: var(--space-8) var(--space-7) var(--space-7);
  background: var(--walnut);
  border: 1px solid var(--brass-dim);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), var(--inset-frame);
}

/* The clasp: the one moment on this screen. It drops into place when the book appears. */
.auth-book::before {
  content: '';
  position: absolute;
  top: -0.65rem;
  left: 50%;
  width: 3.5rem;
  height: 1.3rem;
  transform: translateX(-50%);
  background: var(--brass);
  border-radius: 3px 3px 7px 7px;
  box-shadow: inset 0 -3px 0 var(--brass-dim), 0 2px 6px var(--shade);
  animation: auth-clasp 520ms var(--ease) both;
}
.auth-book::after {
  content: '';
  position: absolute;
  top: -0.2rem;
  left: 50%;
  width: 0.4rem;
  height: 0.4rem;
  transform: translateX(-50%);
  background: var(--felt-deep);
  border-radius: 50%;
}
@keyframes auth-clasp {
  from { transform: translateX(-50%) translateY(1.1rem); }
  to { transform: translateX(-50%) translateY(0); }
}

.auth-title {
  margin: 0;
  text-align: center;
  font: 400 var(--text-3xl) / 1.05 var(--font-display);
  letter-spacing: 0.01em;
  color: var(--bone);
}
.auth-lede {
  margin: var(--space-2) 0 var(--space-6);
  text-align: center;
  font-size: var(--text-md);
  color: var(--bone-dim);
}

.auth-form { display: flex; flex-direction: column; gap: var(--space-5); }
.auth-actions { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); }
.auth-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--bone-dim);
}

.auth-devtools {
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--leather-hi);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.auth-devtools .ui-hint { text-align: center; }

@media (max-width: 480px) {
  .auth-book { padding: var(--space-8) var(--space-5) var(--space-6); }
  .auth-title { font-size: var(--text-2xl); }
}
@media (prefers-reduced-motion: reduce) {
  .auth-book::before { animation: none; }
}
```

- [ ] **Step 3: Update `LoginPage.tsx` (logic untouched; markup and copy only)**

Imports: remove `import '../styles/LoginPage.css';` and `import '../styles/AuthResponsive.css';`; add `import '../styles/auth.css';` and `import Icon from './ui/Icon';`.

Copy changes inside the existing handlers (conditions and fetch calls stay):
- empty-field message `'Please fill in all fields'` becomes `'Enter your username and password.'`
- the 409 message becomes `'This account is already signed in on another session. Close that session, or use a different account.'`
- `data.message || 'Login failed'` becomes `data.message || 'Sign in failed. Check your username and password.'`
- both `'Connection failed. Please try again.'` become `'Could not reach the server. Check your connection and try again.'`
- in `handleAdminLogin`, `data.message || 'Failed to login as admin'` becomes `data.message || 'Could not sign in as admin.'`

Replace the whole `return (...)` with:

```tsx
  return (
    <div className="auth-page auth-page--login">
      <div className="auth-backdrop" aria-hidden="true"></div>

      <main className="auth-book">
        <h1 className="auth-title">Hero's Call</h1>
        <p className="auth-lede">Sign in to continue your run.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="ui-field">
            <label className="ui-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Your username"
              className="ui-input"
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Your password"
              className="ui-input"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <div className="ui-field">
            <label className="ui-check" htmlFor="remember-me">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                disabled={isLoading}
              />
              Remember my login on this device
            </label>
            {autoFilled && (
              <div className="ui-notice ui-notice--info" role="status">
                <Icon name="check" />
                Login information loaded from saved data.
              </div>
            )}
          </div>

          {error && (
            <div className="ui-notice ui-notice--error" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--block" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="ui-spinner" aria-hidden="true"></span>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>

            <div className="auth-switch">
              <span>New here?</span>
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onShowRegister} disabled={isLoading}>
                Create account
              </button>
            </div>
          </div>
        </form>

        <div className="auth-devtools">
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={handleAdminLogin} disabled={isLoading}>
            <Icon name="key" />
            Quick admin login
          </button>
          <span className="ui-hint">Uses the next free admin account.</span>
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onStartCardTest}>
            Open card layout test
          </button>
        </div>
      </main>
    </div>
  );
```

- [ ] **Step 4: Lint and visual/behaviour checks (Playwright MCP, dev server running)**

Run: `npm run check:tokens` (Expected: `6 files clean`).

4.1 At 1280x800 on `http://localhost:5173`: screenshot; the book is centred with the brass clasp.
4.2 At 390x844 and 320x640: screenshot; `browser_evaluate` `document.documentElement.scrollWidth <= window.innerWidth` is `true`.
4.3 At 667x375: `browser_evaluate` `document.querySelector('.auth-page').scrollTo(0, 9999)`, screenshot; the dev tools row is reachable. Scroll back to top; the title and Sign in button are reachable by scrolling.
4.4 Submit the empty form: the error notice shows the warning icon and `Enter your username and password.`
4.5 With the backend stopped, enter any username and password and submit at 320px wide; the connection error wraps inside the book (screenshot).
4.6 `browser_evaluate` `localStorage.setItem('heroCallRememberMe', JSON.stringify({username:'tester',password:'secret1',expiry:Date.now()+1e9}))`, reload: both fields are prefilled and the info notice shows. Uncheck the box: `localStorage.getItem('heroCallRememberMe')` is `null`.
4.7 Keyboard: press Tab repeatedly with a screenshot after each press; order is username, password, remember, Sign in, Create account, Quick admin login, Open card layout test, each with the brass outline. Press Enter inside the password field: the form submits (the "Signing in..." state or an error appears).
4.8 `browser_emulate_media` with `reducedMotion: 'reduce'`, reload; `getComputedStyle(document.querySelector('.auth-book'), '::before').animationName` is `none`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/auth.css frontend/src/components/LoginPage.tsx frontend/scripts
git commit -m "feat(ui): rebuild login page as the leather book on the felt"
git push origin main
```

---

### Task 5: Register page, and remove the old auth CSS

**Files:**
- Modify: `frontend/src/components/RegisterPage.tsx`, `frontend/scripts/check-tokens.mjs`
- Delete: `frontend/src/styles/LoginPage.css`, `frontend/src/styles/RegisterPage.css`, `frontend/src/styles/AuthResponsive.css`

**Interfaces:**
- Consumes: `auth-*` classes, primitives, `Icon`. `RegisterPage` props unchanged (`onRegisterSuccess`, `onBackToLogin`).

- [ ] **Step 1: Add the file to the lint list**

Append `'components/RegisterPage.tsx'` to `MIGRATED`.

- [ ] **Step 2: Update imports and copy**

Remove the `RegisterPage.css` and `AuthResponsive.css` imports; add `import '../styles/auth.css';` and `import Icon from './ui/Icon';`. Keep every validation condition and fetch call exactly as is. Change only these strings in `validateForm`:
- `'Username is required'` becomes `'Enter a username.'`
- `'Username must be at least 3 characters long'` becomes `'Username needs at least 3 characters.'`
- `'Username must be at most 12 characters long'` becomes `'Username can have at most 12 characters.'`
- `'Username can only contain letters, numbers, and underscores'` becomes `'Use only letters, numbers and underscores in your username.'`
- `'Password is required'` becomes `'Enter a password.'`

Read the rest of `validateForm` and `handleSubmit` (about lines 28 to 90) and rewrite any other user-facing string the same way: sentence case, say what to fix, end with a period (for example a mismatch message becomes `'The two passwords do not match.'`, a network failure becomes `'Could not reach the server. Check your connection and try again.'`). Do not change any condition or request.

- [ ] **Step 3: Replace the `return (...)`**

```tsx
  return (
    <div className="auth-page auth-page--register">
      <div className="auth-backdrop" aria-hidden="true"></div>

      <main className="auth-book">
        <h1 className="auth-title">Join Hero's Call</h1>
        <p className="auth-lede">Create your account to build a roster.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="ui-field">
            <label className="ui-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Pick a username"
              className="ui-input"
              autoComplete="username"
              disabled={isLoading}
              maxLength={12}
            />
            <span className="ui-hint">3 to 12 characters: letters, numbers and underscores.</span>
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              className="ui-input"
              autoComplete="new-password"
              disabled={isLoading}
            />
            <span className="ui-hint">At least 6 characters.</span>
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="confirm-password">Confirm password</label>
            <input
              type="password"
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              className="ui-input"
              autoComplete="new-password"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="ui-notice ui-notice--error" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="ui-notice ui-notice--success" role="status">
              <Icon name="check" />
              <span>{success}</span>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--block" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="ui-spinner" aria-hidden="true"></span>
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>

            <div className="auth-switch">
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onBackToLogin} disabled={isLoading}>
                <Icon name="back" />
                Back to sign in
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
```

- [ ] **Step 4: Delete the old CSS after confirming nothing else imports it**

Run: `git grep -nE "LoginPage\.css|RegisterPage\.css|AuthResponsive\.css" -- src`
Expected: no matches. Then `git rm src/styles/LoginPage.css src/styles/RegisterPage.css src/styles/AuthResponsive.css`.

`LoginPage.css` also defined a global `.loading-spinner`. Run `git grep -n "\.loading-spinner" -- src/styles` and confirm `Binder.css`, `HeroCollection.css`, `ProfileModal.css` and `SurvivalTeamBuilder.css` each define their own. If a screen that uses the class has no definition left, copy that one rule from `git show HEAD:frontend/src/styles/LoginPage.css` into that screen's CSS file.

- [ ] **Step 5: Lint, build, visual checks**

Run: `npm run check:tokens` (Expected: `7 files clean`) and `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir` (Expected: success).
Playwright: from login click "Create account"; screenshots at 1280x800, 390x844, 320x640 (no horizontal scroll). Submit with a 2-character username, and again with mismatched passwords: the error notices read correctly and wrap. Click "Back to sign in": the login page returns. Register a real account only if the backend is running (`cd ../backend && npm start`); otherwise skip and say so in the report.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src frontend/scripts
git commit -m "feat(ui): rebuild register page, remove old auth styles"
git push origin main
```

---

### Task 6: Phase verification: cards unchanged, shell sane

**Files:** none modified unless a regression is found.

- [ ] **Step 1: Compare the card test screens to the baseline**

With the dev server running, open "Open card layout test" and screenshot at 1280x800 (`after-cards-desktop.png`) and 390x844 (`after-cards-phone.png`). Compare with the baselines from Task 1. The cards must show the same image, the same stats and all ability and special text; only the page background around them may change. Run `git diff BASE_SHA -- frontend/src/components/HeroCard.tsx frontend/src/styles/HeroCard.css` (BASE_SHA from Task 1, step 1); it must print nothing.

- [ ] **Step 2: Sweep the logged-in screens for breakage from the new body background and close button**

If the backend runs, use "Quick admin login" and screenshot the lobby, Profile modal, Shop, Collection, Settings and Friends. List every screen where text became unreadable or a layout broke because the body changed from blue to felt. Later phases restyle those screens, so record them in the final report. Fix inline only a regression that makes a screen unusable (for example dark text on the new dark body), by giving that screen's root a background in its own CSS file. If the backend cannot run, say so explicitly and record that this sweep did not happen.

- [ ] **Step 3: Final gates**

Run: `npm run check:tokens`, `npx vite build --outDir "$TEMP/hc-dist" --emptyOutDir`, and `cd ../backend && npm test`. Expected: all pass (backend: 96 tests). Stop the dev server. Confirm `git status` is clean and `frontend/dist` is untouched.

- [ ] **Step 4: Record completion in the spec**

Append to the Phases section of `docs/superpowers/specs/2026-10-15-ui-redesign-design.md`: `Phase 1 complete (YYYY-MM-DD). Known follow-ups: <screens from Step 2>.` Then:

```bash
git add docs
git commit -m "docs: record phase 1 completion"
git push origin main
```
