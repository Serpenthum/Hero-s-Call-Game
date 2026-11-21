# Redesign step 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new full-art hero card everywhere (all battle and draft states), tap/long-press to read any card,
tiny mode, the Grenze Gotisch font, the rotate screen on every screen, sideways-phone layouts for the screens that are
not rebuilt later, and an installable app.

**Architecture:** `HeroCard.tsx` keeps every hook and every state calculation; only its returned markup and its
stylesheet are replaced by the new face. Card size moves from CSS `zoom` to a width variable (`--card-w`) derived from
the existing `--hero-card-scale` / `--hero-card-height-scale` variables, so every existing scale override keeps working;
everything inside the card is sized in `em` from `font-size: calc(var(--card-w) / 20)`. A single card reader overlay
(React context at the app root) shows any card large.

**Tech Stack:** React 18 + TypeScript + Vite 4, plain CSS with tokens, vitest 0.34 (node environment, no DOM),
Cloudflare Pages. Playwright (the MCP browser tools) for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-17-card-lobby-packs-redesign-design.md` (parts 1, 2, 8, 10, 11 and
"Order of work" step 1). Visual reference: `docs/superpowers/specs/2026-11-17-redesign-mockups/card.html` and the card
inside `packs-and-binder.html` (that one has the approved light text panel).

## Global Constraints

- Branch `redesign-card-lobby-packs` in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`. Commit per task. Never push, never deploy without the owner's OK.
- Models: tasks marked **[Fable]** are drawing/animation and run on Fable; every other task runs on Opus. Reviews on Opus.
- No change to `backend/`, game rules, socket events, or what `HeroCard` calculates (HP animation, poison glow, Dragon Rider dismount, stat buff/debuff logic, attack display, tooltips).
- Raw colours only in `frontend/src/styles/tokens.css`; add every new file to `MIGRATED` in `frontend/scripts/check-tokens.mjs`; `npm run check:tokens` passes.
- Currency is the coin image plus a number; never "VP", "coins" or "victory points" in UI text.
- Card proportions stay 260 x 391 (ratio 391/260), so `useCardGrid`'s `CARD_WIDTH`/`CARD_HEIGHT` stay correct.
- Text on the card is never smaller than today's card at the same card width, except where today's card also shrinks long text.
- Check sizes: 640x360, 844x390, 1440x900, plus one pass with `prefers-reduced-motion: reduce`.
- Upright touch screens (phones and tablets) show the rotate screen; computers never do.
- `prefers-reduced-motion` and the in-game "Battle animations: off" setting stop glint, tilt and holographic drift.
- Frontend commands run in `frontend/`: `npm test`, `npm run build`, `npm run check:tokens`.

## Review Focus

1. **Long rules text on a small card** (e.g. Arcane Archer, Ninja, Shroomguard at 143–195px): the text panel must not cover the stat gems or run off the card; it shrinks text only as far as today's card does. Test: `pickTextSize` cases in Task 1; screenshot of the three heroes at 143px and 195px in Task 2.
2. **Tapping a card that already does something** (draft ban/pick, battle targeting, gauntlet roster/offer, survival builder, profile icon picker, binder grid): a tap must still do only its old job; reading is long press. Test: `resolveReadMode` cases in Task 1 and the call-site table in Task 3.
3. **A card with many status effects at once in battle** (poison + taunt + silenced + stat modifiers + totems) at the smallest battle size (~78px): every state stays visible and tooltips still work on a computer. Test: Task 2 adds a "busy card" fixture to `CardLayoutTest` and screenshots it at 78px and 234px.
4. **Installed app after a new deploy** shows the new version on next launch, never a cached old one. Test: Task 5 checks `_headers` and the absence of any caching service worker.
5. **Notched iPhone held sideways**: nothing important under the notch or the home bar. Test: Task 5 safe-area padding, screenshot with an emulated inset in Task 9.

---

### Task 1: Card helpers, tokens and font

**Files:**
- Create: `frontend/src/cards/cardRules.ts`
- Test: `frontend/src/cards/cardRules.test.ts`
- Modify: `frontend/src/styles/tokens.css`, `frontend/src/main.tsx`, `frontend/package.json`, `frontend/scripts/check-tokens.mjs`

**Interfaces:**
- Produces:
  - `export type ReadMode = 'tap' | 'press' | 'none'`
  - `export function resolveReadMode(opts: { readable?: ReadMode; isSelectable?: boolean }): ReadMode` — explicit `readable` wins; otherwise `'press'` when `isSelectable`, else `'tap'`.
  - `export const TINY_CARD_MAX_WIDTH = 129` (px; at or below this width the card is in tiny mode)
  - `export function pickTextSize(fits: (sizeEm: number) => boolean, maxEm = 1.06, minEm = 0.8, stepEm = 0.02): number` — largest size from `maxEm` down to `minEm` (inclusive, in `stepEm` steps) for which `fits` returns true; returns `minEm` if none fit.
  - Tokens (names fixed, values from the spec): `--stat-hp: #d2543c; --stat-defense: #7fa3c9; --stat-accuracy: #67b39a; --stat-attack: #d7b061; --fav-gold: #f6cf57; --holo-pink: #ff3c8c; --holo-yellow: #ffd63c; --holo-mint: #3cffbe; --holo-blue: #5a82ff; --holo-violet: #c85aff; --holo-rim: #f4e2a8;` and `--font-display: 'Grenze Gotisch', Georgia, serif; --font-label: 'IM Fell English', Georgia, serif;`

- [ ] **Step 1: Write the failing tests** in `cardRules.test.ts`:
  - `resolveReadMode({})` → `'tap'`; `({ isSelectable: true })` → `'press'`; `({ readable: 'none', isSelectable: true })` → `'none'`; `({ readable: 'tap', isSelectable: true })` → `'tap'`.
  - `pickTextSize(() => true)` → `1.06`; `pickTextSize(() => false)` → `0.8`; `pickTextSize(s => s <= 0.9)` → `0.9` (compare with `toBeCloseTo(0.9, 5)`); never returns a value above `maxEm` or below `minEm`.
- [ ] **Step 2: Run** `npm test -- cardRules` → FAIL (module not found).
- [ ] **Step 3: Implement** `cardRules.ts` (iterate in integer hundredths to avoid float drift).
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Font and tokens.** `npm install @fontsource/grenze-gotisch@^5.3.0`; in `main.tsx` import `@fontsource/grenze-gotisch/500.css` and `/600.css` (keep the IM Fell English and Alegreya imports). In `tokens.css` set `--font-display` to the Grenze value above, add `--font-label` and the colour tokens. Add `cards/cardRules.ts` to `MIGRATED`.
- [ ] **Step 6: Run** `npm run build` and `npm run check:tokens` → both succeed. Open the login screen at 844x390 in the browser: titles render in Grenze Gotisch.
- [ ] **Step 7: Commit** `feat(frontend): card read-mode and text-size rules, Grenze Gotisch display font, card tokens`.

### Task 2: The new card face [Fable]

**Files:**
- Modify: `frontend/src/components/HeroCard.tsx` (props, the `fitText` layout effect, and the returned JSX from line ~877 only)
- Replace: `frontend/src/styles/HeroCard.css` (rewrite; keep every class name that other stylesheets or the battle animation layer use: `hero-card`, `hero-layout-card`, `dead`, `selectable`, `selected`, `target-blocked`, `banned`, `enemy`, `ally`, `current-turn`, `tutorial-hidden`, `tutorial-grow`, `card-flip`, `status-effect*`, `poison-glow-increase`, `poison-glow-cleanse`, `stat-buffed`, `stat-debuffed`, `buffed-stat`, `buff-tooltip*`, `status-tooltip-text`, `companion(s)`, `card-hero-name`, `card-details*`)
- Modify: `frontend/src/components/CardLayoutTest.tsx` (fixtures), every stylesheet that sets `zoom` or depends on it (from the grep: `App.css` `.hero-card.banned`/`.dead`, `BattlePhone.css:286`, `ResponsiveCardGrid.css`, `PackOpeningAnimation.css:36`, `ProfileModal.css:351`)

**Interfaces:**
- Consumes: `resolveReadMode`, `TINY_CARD_MAX_WIDTH`, `pickTextSize`, the tokens from Task 1.
- Produces: new optional `HeroCard` props, all default `false`/`undefined`:
  - `holo?: boolean`, `favorite?: boolean`, `glint?: boolean`, `tilt?: boolean`
  - `readable?: ReadMode` (wired to the reader in Task 3; in this task it only lands in a `data-read-mode` attribute on the root)
- Produces: CSS contract — the root `.hero-card` has `width: var(--card-w)`, `height: calc(var(--card-w) * 391 / 260)`, `font-size: calc(var(--card-w) / 20)`, `container-type: inline-size`, where `--card-w: calc(260px * min(var(--hero-card-scale, 1), var(--hero-card-height-scale, var(--hero-card-scale, 1))))`. No `zoom` anywhere in the codebase afterwards. Elements of the face (all `em`-sized): `.card-art` (img), `.card-edge`, `.card-stats` (hex rail, order HP, Defense, Accuracy, Attack, each keeping its `data-tutorial` attribute), `.card-lower` (name, `.card-rule`, details), `.card-sheen`, `.card-glint`, `.card-fav-star`.

- [ ] **Step 1: Fixtures.** Add to `CardLayoutTest` a "Face states" section rendering, at widths 350, 260, 195, 143, 78 (set `--hero-card-scale` on a wrapper to width/260): plain, `favorite`, `holo`, `holo` + `favorite`, `glint` + `tilt`, and a **busy card** fixture (Shroomguard with `statusEffects: { poison: 3, taunt: { target: 'Paladin' }, silenced: { active: true, duration: 2 }, statModifiers: { Defense: -2 }, totem_count: 2, inspiration: 1 }`, `currentHP: 7`, `passiveBuffs: [{ stat: 'accuracy', value: 1, sourceHero: 'Bard', sourceName: 'Song' }]`), plus one each of `dead` (currentHP 0), `isBanned`, `isSelected`, `isCurrentTurn`, `isBlocked`, `isEnemy`, and Dragon Rider with `permanentDisables: { abilities: true }`. Also Arcane Archer, Ninja and Shroomguard (longest texts) at 195 and 143.
- [ ] **Step 2: Screenshot the fixtures before the change** at 1440x900 (keep for comparison of states).
- [ ] **Step 3: Rebuild the face** to match the spec's part 1 and the mockup card: full art (`object-position: 50% 12%`), brass border, inset hairline with corner brackets, hex stat gems 1.15x with the stat tokens, crosshair accuracy icon (copy the SVG from the mockup; replace the emoji stat icons with inline SVG), name in `--font-display` weight 600, brass rule, rules text in Alegreya with "Ability:"/"Special:" in `--font-label` italic brass, **light** text panel (transparent → 34% → 58% black) with dark text outline shadow, gold star for `favorite`, holographic sheen + sparkle + rim for `holo` (drifting animation; follows the pointer when `tilt` is on), glint sweep only when `glint`, pointer tilt only when `tilt`.
- [ ] **Step 4: Text fitting.** Replace the body of the `fitText` layout effect with one that uses `pickTextSize` to set `--card-text-size` (em) so the lower panel never exceeds 62% of the card height; keep the ResizeObserver. Delete the `card-details-compact` / `card-details-dense` classes.
- [ ] **Step 5: Tiny mode** with `@container (max-width: 129px)`: hide details and rule, name 1.25x, stat rail 1.5x.
- [ ] **Step 6: States on the new face.** Status buffs and debuffs as a column of small `em`-sized chips down the right edge (under the star), companions above the name on the right, `dead` = greyscale + darkened, `banned` keeps its cross overlay, `selected`/`current-turn`/`selectable`/`target-blocked` = frame glows as today's colours, `stat-buffed`/`stat-debuffed` = green/red ring on that hex gem, HP number takes `hpColor`, Dragon Rider flip keeps `card-flip` on the art. All existing tooltips still appear on hover. Under `prefers-reduced-motion` and `body.anim-off` (check how the "Battle animations: off" setting is exposed in `battleAnimations.ts` and use that hook) no glint, tilt or holo drift.
- [ ] **Step 7: Remove `zoom`.** Replace the `zoom` rule with the `--card-w` contract; fix the listed stylesheets so cards keep their sizes; delete the `.hero-layout-card.hero-layout-card` specificity hacks that only existed to beat `zoom`.
- [ ] **Step 8: Verify.** Screenshot the fixtures at 1440x900 and 844x390; screenshot a live random-mode battle (two Quick admin logins in two browser contexts) and a live draft at 1440x900, 844x390 and 640x360. Every state from Step 1 must be visible and distinguishable; the text of the three long-text heroes fits at 195 and 143. `npm test`, `npm run build`, `npm run check:tokens` pass. Grep: no `zoom:` left in `frontend/src`.
- [ ] **Step 9: Commit** `feat(frontend): full-art hero card face with holographic, favourite and tiny modes`.

### Task 3: Card reader (tap / long press to read)

**Files:**
- Create: `frontend/src/cards/CardReader.tsx`, `frontend/src/cards/useLongPress.ts`, `frontend/src/styles/CardReader.css`
- Test: `frontend/src/cards/useLongPress.test.ts`
- Modify: `frontend/src/App.tsx` (wrap the app in `CardReaderProvider`), `frontend/src/components/HeroCard.tsx` (use `readable`), the call sites below

**Interfaces:**
- Consumes: `ReadMode`, `resolveReadMode` (Task 1); `HeroCard` props `holo`, `favorite`, `glint`, `tilt`, `readable` (Task 2).
- Produces:
  - `export function CardReaderProvider(props: { children: React.ReactNode }): JSX.Element`
  - `export function useCardReader(): { open(hero: HeroCardData, opts?: { holo?: boolean; favorite?: boolean; actions?: React.ReactNode }): void; close(): void }` — `actions` renders under the large card (the binder's favourite button uses it later).
  - `export function createLongPress(opts: { delayMs?: number; moveTolerancePx?: number; onLongPress: () => void }): { down(x: number, y: number): void; move(x: number, y: number): void; up(): boolean; cancel(): void }` — `up()` returns `true` when the long press fired (so the caller swallows the click). Defaults `delayMs = 450`, `moveTolerancePx = 10`.
  - `export function useLongPress(onLongPress: () => void): { onPointerDown; onPointerMove; onPointerUp; onPointerCancel; onClickCapture; onContextMenu }` — React wrapper over `createLongPress`; `onContextMenu` (right-click on computers) opens the reader too and prevents the browser menu.

- [ ] **Step 1: Write failing tests** for `createLongPress` with `vi.useFakeTimers()`: fires after 450 ms held; does not fire if `up()` at 300 ms (and `up()` returns `false`); does not fire if moved 11 px; `up()` returns `true` after it fired; `cancel()` stops it.
- [ ] **Step 2: Run** `npm test -- useLongPress` → FAIL.
- [ ] **Step 3: Implement** `createLongPress` and `useLongPress`.
- [ ] **Step 4: Run** `npm test` → pass.
- [ ] **Step 5: Implement the reader.** Dimmed full-screen overlay, the card rendered with `glint` and `tilt` at `width = min(430px, viewport width − 40px, (viewport height − 40px) × 260/391)`, pop-in 280 ms (fade only under reduced motion), closes on any tap, Escape, or back button; focus moves to the overlay and returns on close. In `HeroCard`: `'tap'` → root `onClick` opens the reader; `'press'` → spread `useLongPress` handlers; `'none'` → nothing. The original `onClick` for selectable cards is unchanged.
- [ ] **Step 6: Call sites.** Set `readable` explicitly where the default is wrong. Rule: if tapping the card or its wrapper already does something, `'press'`; if the card sits inside a bigger tap target that opens its own preview, `'none'`.

  | Call site | readable |
  |---|---|
  | `BattlePhase.tsx:386`, `:436` | default (`'press'` when selectable, `'tap'` otherwise); check a non-selectable battle card does not swallow taps the board needs |
  | `DraftPhase.tsx:210, 257, 270, 283, 348, 373` | `'press'` on cards the player bans or picks from; `'tap'` on team-slot cards |
  | `GameLobby.tsx:497` | `'tap'` (step 2 changes this) |
  | `HeroCollection.tsx:398` | `'none'` (the binder's own preview stays until step 5) |
  | `PackOpeningAnimation.tsx:79` | `'tap'` |
  | `ProfileModal.tsx:271` | `'press'` (picking an icon) |
  | `Shop.tsx:354`, `:450` | `'press'` if the card buys or selects, else `'tap'` |
  | `SurvivalTeamBuilder.tsx:454`, `gauntlet/OfferPanel.tsx:58`, `gauntlet/RosterSheet.tsx:48` | `'press'` |
  | `CardLayoutTest.tsx:130` | default |
- [ ] **Step 7: Verify** at 844x390 with touch emulation and at 1440x900: tap a lobby card → reader; long press a draft hand card → reader, and a plain tap still bans/picks; right-click a battle card on the computer → reader, no browser menu; Escape closes. `npm run build` passes.
- [ ] **Step 8: Commit** `feat(frontend): tap or long-press any card to read it large`.

### Task 4: App icon [Fable]

**Files:**
- Create: `frontend/public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180x180)

**Interfaces:**
- Produces: the five files above at those paths (Task 5 references them).

- [ ] **Step 1: Draw** `icon.svg`: the shield crest from the binder cover in `docs/superpowers/specs/2026-11-17-redesign-mockups/packs-and-binder.html` (gold gradient shield with sword) on the dark red leather background, readable at 48 px. Maskable variant keeps the crest inside the central 80% safe zone with the leather filling the full square.
- [ ] **Step 2: Render the PNGs** from the SVG with the browser (Playwright: set the viewport to the target size, screenshot an `<img>` of the SVG with no margins). Check each PNG's pixel size.
- [ ] **Step 3: Show** the 512 and 48-px-scaled versions in the summary for the reviewer.
- [ ] **Step 4: Commit** `feat(frontend): Hero's Call app icon`.

### Task 5: Installable app, rotate screen everywhere, safe areas

**Files:**
- Create: `frontend/public/manifest.webmanifest`, `frontend/src/install/installHint.ts`, `frontend/src/install/InstallHint.tsx`, `frontend/src/styles/InstallHint.css`
- Test: `frontend/src/install/installHint.test.ts`
- Modify: `frontend/index.html`, `frontend/public/_headers`, `frontend/src/App.tsx` (render `<RotatePrompt />` always; render `<InstallHint />` in the lobby), `frontend/src/styles/GameTheme.css` (rotate media query), `frontend/src/index.css` or the app root stylesheet (safe areas)

**Interfaces:**
- Consumes: icons from Task 4.
- Produces:
  - `export type InstallHintKind = 'android' | 'ios' | null`
  - `export function installHintKind(env: { isTouch: boolean; isStandalone: boolean; dismissed: boolean; userAgent: string; hasInstallPrompt: boolean }): InstallHintKind` — `null` if not touch, standalone, or dismissed; `'ios'` for iPhone/iPad user agents; `'android'` when `hasInstallPrompt`; otherwise `null`.
  - localStorage key `heroscall.installHintDismissed` (`'1'` when dismissed).

- [ ] **Step 1: Write failing tests** for `installHintKind`: desktop → `null`; standalone → `null`; dismissed → `null`; iPhone Safari UA, touch → `'ios'`; Android Chrome UA with `hasInstallPrompt: true` → `'android'`; Android without the prompt event → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → pass.
- [ ] **Step 5: Manifest:** `name` and `short_name` "Hero's Call", `start_url: "/"`, `scope: "/"`, `display: "fullscreen"`, `display_override: ["fullscreen", "standalone"]`, `orientation: "landscape"`, `background_color` and `theme_color` = the `--felt-deep` value `#0b1311` (manifest JSON cannot read tokens; add it to the check-tokens allow-list if it scans `public/`), icons 192, 512, maskable 512 (`"purpose": "maskable"`).
- [ ] **Step 6: `index.html`:** link the manifest; `theme-color`; `apple-touch-icon`; `apple-mobile-web-app-capable` and `mobile-web-app-capable` = `yes`; `apple-mobile-web-app-status-bar-style` = `black-translucent`; `apple-mobile-web-app-title` = "Hero's Call"; viewport `width=device-width, initial-scale=1.0, viewport-fit=cover`; replace the `vite.svg` favicon with `/icons/icon.svg`.
- [ ] **Step 7: `_headers`:** `/manifest.webmanifest` and `/index.html` and `/` → `Cache-Control: no-cache`. **No service worker.** Then check installability in Chrome DevTools (Application → Manifest) on the preview build; only if Chrome reports a missing service worker, add `public/sw.js` containing only an empty `fetch` listener (no `respondWith`, no caching), registered from `main.tsx`, with `/sw.js` also `no-cache`.
- [ ] **Step 8: Rotate screen:** render `<RotatePrompt />` unconditionally at the app root; change the media query to `(orientation: portrait) and (pointer: coarse)`; it covers the whole screen above everything, including modals and the card reader.
- [ ] **Step 9: Safe areas:** pad the app root with `env(safe-area-inset-left/right/bottom)` (top too, since the status bar is translucent); full-screen overlays (reader, rotate screen, modals) keep their backgrounds edge to edge but their content inside the insets.
- [ ] **Step 10: Install hint** (bottom of the lobby, dismissible ✕, shown once until dismissed): Android: "Play full screen: install Hero's Call." with an **Install** button that calls the saved `beforeinstallprompt` event's `prompt()`; iPhone: "Play full screen: tap Share, then Add to Home Screen." Never on computers or inside the installed app.
- [ ] **Step 11: Verify** with `npm run build && npx vite preview`: Chrome DevTools shows the manifest as installable with the icons; emulated iPhone 14 landscape and Pixel 7 landscape show the hint once; portrait emulation shows the rotate screen on login, lobby and shop; a desktop window resized tall and narrow does **not** show it. `npm test`, `npm run check:tokens` pass.
- [ ] **Step 12: Commit** `feat(frontend): installable app, rotate screen on every screen, safe areas`.

### Task 6: Sideways layout — login, profile, friends, messages, settings and modals

**Files:** the components and stylesheets for `LoginPage`/register (`auth.css`), `ProfileModal`, the friends and messages overlay, `SettingsModal`, `HowToPlayModal`/`RulesModal`, `RequirementModal`, `QuestRewardModal`, `Panels.css`/`primitives.css` modal shell.

**Interfaces:** none new.

- [ ] **Step 1: Audit.** Screenshot each screen and modal at 640x360 and 844x390 (and 1440x900 for comparison). Write the defects as a checklist in the commit body: content cut off, needs scrolling to reach the main button, overlapping, text under 12px, tap targets under 40px.
- [ ] **Step 2: Fix** each defect so the main action is reachable without scrolling at 640x360 and modals fit the screen height (scroll inside the modal body only). Use the shared modal shell where a modal has its own sizing.
- [ ] **Step 3: Verify** with the same screenshots; every checklist item fixed; 1440x900 unchanged apart from the font.
- [ ] **Step 4: Commit** `fix(frontend): login, profile, friends and modals fit a sideways phone`.

### Task 7: Sideways layout — shop page, survival, gauntlet

**Files:** `Shop.tsx`/`Shop.css` (the shop page, not the pack opening), `SurvivalTeamBuilder.tsx` and `Survival.css`, `components/gauntlet/*` and `Gauntlet.css`.

**Interfaces:** none new.

- [ ] **Step 1–4:** same audit, fix, verify and commit pattern as Task 6 for these screens (the gauntlet trial map, roster, camp and offer panels; the survival builder and its search state; the shop page with the hero rotation and pack tile). Commit `fix(frontend): shop, survival and gauntlet fit a sideways phone`.

### Task 8: Sideways layout — battle and spectating

**Files:** `BattlePhase.tsx`, `BattlePhone.css`, `GameScreens.css`, `SpectatorView`/spectator list, `TurnTimerBar`, game-over and initiative overlays.

**Interfaces:** none new.

- [ ] **Step 1: Audit** a live random-mode battle (two admin logins) at 640x360 and 844x390, including initiative, the action bar, the battle log, a game-over screen and the spectator list.
- [ ] **Step 2: Fix** the defects; cards use their existing scale variables (now driving `--card-w`).
- [ ] **Step 3: Verify** and run `node scripts/style-snapshot.js`-based comparison at 1440x900 if it is wired to a runner; otherwise a side-by-side screenshot against `main` at 1440x900 shows no unintended change.
- [ ] **Step 4: Commit** `fix(frontend): battle and spectating fit a sideways phone`.

### Task 9: Step 1 sign-off

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm test`, `npm run build`, `npm run check:tokens`, `npm run lint` (note pre-existing lint failures rather than fixing unrelated code).
- [ ] **Step 2:** Run the tutorial end to end at 844x390: every pointer lands on the right part of the new card (`data-tutorial` anchors on the stat gems).
- [ ] **Step 3:** One pass with reduced motion emulated: no glint, tilt or holo drift; reader opens with a fade.
- [ ] **Step 4:** Emulate a notched iPhone sideways (safe-area inset 47px on one side): nothing important hidden on login, lobby, battle.
- [ ] **Step 5:** Put the screenshot set (card states, draft, battle, lobby, shop, binder, login, at 844x390 and 1440x900) in front of the owner and wait for his OK.
- [ ] **Step 6 (after the OK):** `npm run deploy:site` from the project root. Site only; the server is untouched in step 1. Spot-check `https://heroscall.pages.dev` on 844x390 emulation.
