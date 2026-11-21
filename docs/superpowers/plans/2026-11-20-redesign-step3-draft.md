# Redesign step 3 (Draft table) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the draft screen with the approved draft table: steps strip and clock, both teams and bans always on
screen, cards readable at every size (five across, or the big-card layout), tap-to-swap attack order, dealing/ban/pick/
swap motion, and a reveal that faces the teams off centred and glides them onto the battle board, which no longer
reflows when battle starts.

**Architecture:** Every rule that can be wrong without a screen (which step, who has acted, which bans are visible,
layout choice, card fitting, order swaps, when the reveal plays) is a pure function in `frontend/src/draft/draftRules.ts`
with unit tests. `DraftPhase.tsx` keeps its props and socket calls but renders new presentational components under
`frontend/src/components/draft/`, sized by a `useDraftLayout` hook (ResizeObserver on the screen root). The reveal is an
overlay App renders above `BattlePhase` and measures the battle cards by their existing `data-anim-key`. Layout lands
first with no motion (Opus); motion and the reveal are layered on afterwards (Fable).

**Tech Stack:** React 18 + TypeScript + Vite 4, plain CSS with tokens, vitest 0.34 (node environment; pure-function
tests and `renderToStaticMarkup` markup tests, as in `BattleDetailsPanel.test.tsx` and `ModeCards.test.tsx`).
Playwright MCP browser for screenshots and measurements.

**Spec:** `docs/superpowers/specs/2026-11-20-redesign-step3-draft-design.md`. Visual reference (plays in a browser):
`docs/superpowers/specs/2026-11-17-redesign-mockups/draft-step3.html` — copy its look, sizes and timings, not its code.
Its card is drawn by hand; in the game use `HeroCard`.

## Global Constraints

- Branch `redesign-card-lobby-packs` in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`, from HEAD `fac2f2c`. Commit per task. Never push; deploy only after the owner's OK. **Site deploy only** — no `backend/` change.
- Models: **[Fable]** tasks (animation) on Fable; all other tasks and every review on Opus.
- No change to draft rules, hand sizes, swap order, the 30 s clock, or socket calls (`banCard`, `pickCard`, `setAttackOrder`, `abandonDraft`). `DraftPhase` keeps its props.
- **Readable cards:** a card shown to be read must have rules text ≥ 12px. Layout A (five across) only when each hand card can be ≥ **222px** wide; otherwise layout B (big card).
- **Their ban stays hidden until both players have banned.** **No "Hands swap" text.**
- Holographic: pass `holo={!!hero.holo}` to every `HeroCard` this screen draws; portraits and ban portraits get a turning rainbow rim (`.draft-portrait--holo`). Add `holo?: boolean` to `Hero` in `frontend/src/types.ts` (the server sets it from step 4; until then nothing shows).
- Stills: `getAnimSpeed() === 'off'` (`battleAnimations.ts`; already true under `prefers-reduced-motion`) turns off all movement on this screen and in the reveal; root class `.draft--still`.
- Raw colours only in `frontend/src/styles/tokens.css`; new files go in `MIGRATED` in `frontend/scripts/check-tokens.mjs`; `npm run check:tokens` passes.
- Text never below 12px except inside tiny cards (which are read on demand); tap targets ≥ 40px on phones; nothing important under `env(safe-area-inset-*)`.
- Sizes for every visual check: 1440x900, 1280x720, 1024x640, 844x390, 640x360.
- Frontend commands run in `frontend/`: `npm test`, `npm run build`, `npm run check:tokens`, `npm run lint`.

## Review Focus

1. **Refresh or reconnect mid-draft, mid-order, or straight into `initiative`** (and tutorial games, which start in `initiative`): the screen shows the current state with no dealing and no reveal; their ban is still hidden if only they had banned; a player who already pressed Ready sees "Done ✓". Test: Task 1 `shouldPlayReveal` and `playerStatus` cases; Task 7 Step 3.
2. **The clock runs out while the player has a card chosen, or during the swap slide:** the server picks; the screen must follow the server's team and hand, never the local choice. Test: Task 3 Step 1 markup case (server team wins over `chosen`); Task 7 Step 3.
3. **Window resized or phone rotated mid-round across the 222px line:** the layout switches without losing the chosen card or the order in progress. Test: Task 1 `chooseLayout` boundary cases; Task 3 Step 7 resize check.
4. **Opponent drops out during the draft or order step:** the away banner with countdown shows on both layouts; Leave still works. Test: Task 4 Step 4.
5. **Heroes with long rules text (Monk, Engineer, Dragon Rider) on the smallest big card (640x360):** `HeroCard`'s fitting can shrink text toward 0.8em; measure. If below 12px, stop and bring screenshots to the owner (options: a taller big card with less band, or a larger text panel share for the big card only). Test: Task 3 Step 7 measurement.

---

### Task 1: Draft rules (pure functions)

**Files:**
- Create: `frontend/src/draft/draftRules.ts`
- Test: `frontend/src/draft/draftRules.test.ts`
- Modify: `frontend/scripts/check-tokens.mjs` (add the new file to `MIGRATED`), `frontend/src/types.ts` (`holo?: boolean` on `Hero`)

**Interfaces:**
- Produces (all exported from `draftRules.ts`):
  - `type DraftStep = 0 | 1 | 2 | 3 | 4` (0 Ban, 1–3 Pick, 4 Order) and `draftStep(phase: string, currentDraftPhase: number): DraftStep` — `'setup'` → 4; otherwise `currentDraftPhase` clamped to 0–3.
  - `STEP_LABELS = ['Ban', 'Pick 1', 'Pick 2', 'Pick 3', 'Order'] as const`.
  - `playerStatus(p: { bannedCard?: string | null; team?: unknown[]; attackOrder?: string[]; isReady?: boolean }, step: DraftStep): 'choosing' | 'done'` — step 0: done when `bannedCard`; 1–3: done when `team.length >= step`; 4: done when `isReady` or `attackOrder.length === 3`.
  - `visibleBans(mine: string | null | undefined, theirs: string | null | undefined): { mine: string | null; theirs: string | null }` — `theirs` is `null` unless both are set.
  - `swapInOrder(order: string[], a: string, b: string): string[]` — new array with `a` and `b` exchanged; unchanged copy if either is missing.
  - `READABLE_CARD_MIN_WIDTH = 222`, `TABLE_CHROME = { bar: 56, band: 190, hint: 30, foot: 76, handPadY: 24, handPadX: 44, gap: 18 }` (CSS must use the same numbers; Task 3 sets them as custom properties from this object).
  - `tableFiveCardWidth(w: number, h: number): number` = `floor(min((w - handPadX - 4*gap) / 5, (h - bar - band - hint - foot - handPadY) / 1.46))`.
  - `chooseLayout(w: number, h: number): 'table' | 'focus'` — `'table'` when `tableFiveCardWidth(w, h) >= READABLE_CARD_MIN_WIDTH`.
  - `bigCardWidth(w: number, h: number): number` = `floor(min((h - 16) / 1.46, w * 0.4))`.
  - `fitCards(n: number, box: { width: number; height: number }, gap: number): { width: number; perRow: number; rows: 1 | 2 }` — try 1 row and 2 rows (`perRow = ceil(n / rows)`), width = `floor(min((box.width - gap*(perRow-1)) / perRow, ((box.height - gap*(rows-1)) / rows) / 1.46))`; return the larger; `n` of 0 is treated as 1.
  - `shouldPlayReveal(sawSetupInThisTab: boolean, prevPhase: string | null, phase: string): boolean` — true only when `sawSetupInThisTab && prevPhase === 'setup' && phase === 'initiative'`.

- [ ] **Step 1: Write the failing tests** in `draftRules.test.ts`:
  - `draftStep('draft', 0) === 0`, `draftStep('draft', 3) === 3`, `draftStep('setup', 3) === 4`.
  - `playerStatus({ bannedCard: null }, 0) === 'choosing'`, `({ bannedCard: 'Monk' }, 0) === 'done'`, `({ team: [1] }, 2) === 'choosing'`, `({ team: [1, 2] }, 2) === 'done'`, `({ attackOrder: ['a','b','c'] }, 4) === 'done'`, `({ attackOrder: [], isReady: false }, 4) === 'choosing'`.
  - `visibleBans('Monk', null)` → `{ mine: 'Monk', theirs: null }`; `visibleBans(null, 'Druid')` → `{ mine: null, theirs: null }`; `visibleBans('Monk', 'Druid')` → `{ mine: 'Monk', theirs: 'Druid' }`.
  - `swapInOrder(['a','b','c'], 'a', 'c')` → `['c','b','a']`; `swapInOrder(['a','b','c'], 'a', 'x')` → `['a','b','c']` (and not the same array object).
  - `chooseLayout(1280, 720) === 'table'`, `chooseLayout(1024, 640) === 'focus'`, `chooseLayout(844, 390) === 'focus'`, `chooseLayout(1440, 900) === 'table'`; `tableFiveCardWidth(1280, 720) === 232`.
  - `bigCardWidth(844, 390) === 256`, `bigCardWidth(640, 360) === 235`, `bigCardWidth(1024, 640) === 409`.
  - `fitCards(5, { width: 593, height: 462 }, 10)` → `{ width: 154, perRow: 3, rows: 2 }`; `fitCards(5, { width: 1236, height: 340 }, 18).rows === 1`; `fitCards(2, ...)` width ≥ `fitCards(5, ...)` width for the same box.
  - `shouldPlayReveal(true, 'setup', 'initiative') === true`; `(false, 'setup', 'initiative') === false`; `(true, null, 'initiative') === false`; `(true, 'initiative', 'battle') === false`.
- [ ] **Step 2: Run** `npm test -- draftRules` → FAIL (module missing).
- [ ] **Step 3: Implement** `draftRules.ts` to the interfaces; add `holo?: boolean` to `Hero` in `types.ts`.
- [ ] **Step 4: Run** `npm test` → all pass; `npm run check:tokens` passes.
- [ ] **Step 5: Commit** `feat(frontend): draft rules (steps, status, bans, layout fit, reveal trigger)`.

### Task 2: Roll screen gets the battle layout

**Files:**
- Modify: `frontend/src/App.tsx` (`renderSidebar`, the `state.gameState.phase === 'battle'` block at ~line 2753)
- Test: `frontend/src/components/sidebarBattleInfo.test.tsx` (new; if the sidebar block can't be rendered alone, extract it first — see Step 3)

**Interfaces:**
- Produces: during `initiative` the sidebar renders `.battle-combined-info` (with `#battle-details-slot`, the "Battle" heading and the empty log "Battle actions will appear here"); its turn line reads **"Starting roll"** instead of "Your turn"/"Opponent's turn". The existing `:has(.battle-combined-info)` rules in `BattleLog.css`, `BattleDetails.css` and `BattlePhone.css` then give the board its battle geometry from the first frame of `initiative`.

- [ ] **Step 1: Write the failing test:** render the battle info block for `phase: 'initiative'` → markup contains `battle-combined-info` and `Starting roll`; for `phase: 'battle'` with my turn → `Your turn`; for `phase: 'setup'` → no `battle-combined-info`.
- [ ] **Step 2: Run** `npm test -- sidebarBattleInfo` → FAIL.
- [ ] **Step 3: Implement:** extract the block into `frontend/src/components/SidebarBattleInfo.tsx` (props: `phase`, `isMyTurn`, `isSpectating`, `activePlayerName`, plus whatever the log section already reads) if that is the simplest way to test it; render it for `initiative` as well as `battle`.
- [ ] **Step 4: Run** `npm test` → pass.
- [ ] **Step 5: Verify card positions don't move:** two accounts on the local server (vite preview + local wrangler, as in step 2), play a draft (old screen is fine) into `initiative`. In the page, record `getBoundingClientRect()` of the six `[data-anim-key]` cards during `initiative` and again right after the go-first choice (first frame of `battle`). All six rectangles equal (±1px) at 1440x900, 1280x720, 1024x640, 844x390, 640x360. Spectator view: initiative still renders.
- [ ] **Step 6: Commit** `feat(frontend): the starting roll shows the battle log panel so the board keeps its battle layout`.

### Task 3: Draft table layout, ban and pick (no motion)

**Files:**
- Create: `frontend/src/draft/useDraftLayout.ts`, `frontend/src/components/draft/DraftTopBar.tsx`, `DraftBand.tsx`, `DraftHand.tsx`, `DraftBigCard.tsx`, `DraftPortrait.tsx`, `frontend/src/styles/Draft.css`
- Modify: `frontend/src/components/DraftPhase.tsx` (rewrite the body; keep props, socket calls), `frontend/src/styles/tokens.css` (any new colour, e.g. the rainbow rim stops — reuse the `--holo-*` tokens), `frontend/scripts/check-tokens.mjs`
- Delete: the old `.draft-phase`, `.draft-cards`, `.teams-display` rules in `GameScreens.css` / `GameTheme.css` once nothing uses them
- Test: `frontend/src/components/draft/DraftBand.test.tsx`, `DraftHand.test.tsx`

**Interfaces:**
- Consumes: all of Task 1.
- Produces (props are the contract Tasks 4–6 build on; class names are the contract for Task 5's CSS):
  - `useDraftLayout(root: React.RefObject<HTMLElement>, handCount: number, step: DraftStep): { layout: 'table' | 'focus'; handCard: number; perRow: number; bigCard: number; slot: number }` — observes `root`; `layout = chooseLayout(w, h)`; hand box measured from `.draft-hand`; `handCard`/`perRow` from `fitCards(handCount, box, gap)` (gap 18 table, 10 focus); `bigCard = bigCardWidth(w, h)` (0 in table layout); `slot` = team slot width (table: from band height, `floor((band - 48) / 1.46)`; focus: portrait diameter that fits six portraits, VS and two bans without overlap). Recomputes on resize; sizes change only when `handCount` changes or the root resizes.
  - Root `.draft-table.draft-table--table|--focus` with `--draft-card-w`, `--draft-big-w`, `--draft-slot-w`, `--draft-hand-pad` set inline; each card wrapper sets `--hero-card-scale: calc(var(--draft-card-w) / 260px)` style so `HeroCard` sizes itself (tiny mode comes from its own container query at ≤129px).
  - `DraftTopBar` props `{ step: DraftStep; clock: React.ReactNode; connecting: boolean; onLeave(): void }`. Steps `.draft-step` (+ `--done`, `--now`, `--ban` on step 0). Leave button `.draft-leave` with title "Return to lobby without rewards". Labels `.draft-step-label` hide below 700px wide; "Draft" title hides at ≤ 640px.
  - `DraftBand` props `{ layout; me: { name: string; team: Hero[]; status: 'choosing' | 'done' }; them: { name; team; status }; bans: { mine: string | null; theirs: string | null }; banHolo: { mine: boolean; theirs: boolean }; onRead(hero: Hero): void }`. Your slots `.draft-slots--me`, theirs `.draft-slots--them` (mirrored). Table layout: filled slot = `HeroCard` (tiny), empty = dashed slot with its number. Focus layout: `DraftPortrait`s; names hidden. Ban portraits `.draft-ban` (+ `--set`), greyed with red slash. Status line `.draft-status` "Choosing…" / "Done ✓".
  - `DraftPortrait` props `{ hero: Hero; enemy?: boolean; onRead(hero: Hero): void }` — round art, brass rim (red when `enemy`), `.draft-portrait--holo` when `hero.holo`.
  - `DraftHand` props `{ cards: Hero[]; chosen: string | null; step: DraftStep; locked: boolean; onChoose(name: string): void }` — `.draft-hand` > `.draft-hand-card[data-name]` (+ `--chosen`); `HeroCard` with `isSelectable={!locked}`, `isSelected`, `readable="press"`, `holo`. Hint `.draft-hint`: step 0 "**Ban one.** Your opponent gets this hand next." / steps 1–3 "**Pick one** for your team." In focus layout: "**Ban one.** Tap a card to read it." / "**Pick one.** Tap a card to read it."
  - `DraftBigCard` props `{ hero: Hero | null; waiting: boolean }` — `HeroCard` at `--draft-big-w`, `readable="none"`, `holo`; when `hero` is null and `waiting`, "Waiting for your opponent…".
  - Button `.draft-act` (+ `--ban`): "Ban" / "Pick" disabled until chosen; "Ban {name}" / "Pick {name}" once chosen.

- [ ] **Step 1: Write the failing markup tests:**
  - `DraftBand`: with `bans: { mine: 'Monk', theirs: null }` the markup contains `Monk` and not the opponent's banned name passed elsewhere; status `'choosing'` renders `Choosing`; a hero with `holo: true` in focus layout renders `draft-portrait--holo`; your team of 1 renders one filled slot and slots `2` and `3` empty.
  - `DraftHand`: step 0 hint contains `Ban one.`; step 2 contains `Pick one`; `chosen: 'Wizard'` gives that card `draft-hand-card--chosen`; a hero with `holo: true` renders `card-holo` (from `HeroCard`); `locked: true` renders no selectable card.
  - Server wins (Review Focus 2): `DraftPhase` markup with `currentPlayer.team` = `['Monk']` after a timeout and local `chosen` 'Wizard' no longer in the hand → Monk is in your slot 1 and no card is chosen. (If `DraftPhase` can't render under `renderToStaticMarkup` because of hooks like ResizeObserver, guard them with `typeof ResizeObserver !== 'undefined'` and default to the table layout.)
- [ ] **Step 2: Run** `npm test -- draft` → FAIL.
- [ ] **Step 3: Build** the components and `useDraftLayout` to the interfaces. `DraftPhase` derives: `step = draftStep(...)`, statuses with `playerStatus`, bans with `visibleBans(currentPlayer.bannedCard, opponent?.bannedCard)`, hand = `currentPlayer.draftCards`. Chosen card: local state reset when the step or hand changes; in focus layout, when a round starts and nothing is chosen, choose the first card. Tapping a team portrait or ban in focus layout shows that card big (`peek` state) without changing the chosen card. Ban/pick call the existing socket functions. The clock is `DraftClock` (same props as today), placed in the top bar and hidden in step 4.
- [ ] **Step 4: Layout in `Draft.css`** to the spec's two sketches: table = column `bar | band | hint | hand | foot` with heights from `TABLE_CHROME`; focus = grid `big-card column (bigCard + 20px) | right column (bar, band, hint, hand, foot)`. Hand: `flex-wrap: wrap; align-content: center` with side padding `--draft-hand-pad` so exactly `perRow` cards fit per row (3 + 2, not 4 + 1). Copy colours, borders and type from the mockup.
- [ ] **Step 5: Reading:** hold (touch) or right-click any card or portrait on this screen opens the existing reader (`useCardReader().open(hero, { holo })`); tap still chooses. Right-click must not open the browser menu on cards.
- [ ] **Step 6: Run** `npm test` → pass; `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 7: Verify** (two accounts, local server): at all five sizes, screenshots of ban (nothing chosen, one chosen) and pick 2. Measure in the page: table layout hand cards ≥ 222px; focus big card rules text `getComputedStyle(.card-details).fontSize` ≥ 12px for Monk, Engineer and Dragon Rider at 640x360 (Review Focus 5); no element overlaps another in the band at 640x360. Resize the window from 1280x720 to 1024x640 mid-round: layout switches, chosen card kept (Review Focus 3).
- [ ] **Step 8: Commit** `feat(frontend): new draft table layout for ban and pick (table and big-card layouts)`.

### Task 4: Order step, sidebar contents, Friends

**Files:**
- Create: `frontend/src/components/draft/DraftOrder.tsx`
- Modify: `DraftPhase.tsx`, `Draft.css`, `frontend/src/App.tsx` (`renderSidebar`: return nothing during `draft` and `setup`; floating `FriendsIcon` / `MessageIcon` hidden during `draft`, `setup` and while the reveal plays)
- Test: `frontend/src/components/draft/DraftOrder.test.tsx`

**Interfaces:**
- Consumes: `swapInOrder`, `playerStatus` (Task 1); `DraftBand`, `DraftBigCard`, `useDraftLayout` (Task 3).
- Produces:
  - `DraftOrder` props `{ order: Hero[]; selected: string | null; ready: boolean; onTap(name: string): void }` — `.draft-order-card[data-name]` with `.draft-order-badge` 1–3 and "Attacks first" under 1; `--selected` on the tapped card.
  - `DraftPhase` order behaviour: first tap selects; tapping the selected card again cancels; tapping another swaps them (`swapInOrder`) and clears the selection; the band's team strip follows the order; in focus layout the big card shows the last tapped hero (first hero before any tap). Ready sends `setAttackOrder(order)` and locks taps; your status shows "Done ✓"; the opponent's shows "Done ✓" when `opponent.isReady`. After a refresh, a player whose `attackOrder` has 3 names is shown as ready.
  - `DraftPhase` new prop `away: React.ReactNode` (App passes today's `awayNotice`, the `DisconnectNotice`), shown as a banner across the hand area; `connecting: boolean` (App passes `!state.isConnected`) shown in the top bar.

- [ ] **Step 1: Write the failing tests:** `DraftOrder` with order `[Cleric, Fighter, Barbarian]` renders badges `1`, `2`, `3` in that order and `Attacks first` once, under Cleric; `selected: 'Fighter'` → that card has `draft-order-card--selected`; `ready: true` → no selectable card. `DraftPhase` in `setup` with `currentPlayer.attackOrder` of 3 names → button reads `Ready ✓` and is disabled.
- [ ] **Step 2: Run** `npm test -- DraftOrder` → FAIL.
- [ ] **Step 3: Implement** `DraftOrder`, the order behaviour, the `away` banner and `connecting` line; remove the drag-and-drop code and its console logging from `DraftPhase`; App changes as listed under Files.
- [ ] **Step 4: Verify** at 844x390 and 1280x720: order swaps by tap with a mouse and with emulated touch; Ready locks; refresh after Ready shows "Done ✓". Disconnect the opponent's tab during the order step: the away banner with countdown shows on both layouts; Leave returns to the lobby (Review Focus 4). Friends button absent during the draft at 640x360; back in the lobby and in battle. `npm test`, `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 5: Commit** `feat(frontend): draft order by tapping; sidebar contents move onto the draft table`.

### Task 5: Draft motion [Fable]

**Files:**
- Create: `frontend/src/draft/flyCard.ts`
- Modify: `Draft.css` (motion section), `DraftPhase.tsx`, `DraftHand.tsx`, `DraftBand.tsx`, `DraftTopBar.tsx` (classes and decorative elements only)

**Interfaces:**
- Consumes: class names and structure from Tasks 3–4. Do not change props or game behaviour.
- Produces: `flyCard(from: Element, to: Element, render: (width: number) => HTMLElement, ms?: number): Promise<void>` — a fixed-position copy that arcs from `from` to `to` (scaled to `to`'s width) and removes itself; resolves at once under stills. `.draft--still` on the root when `getAnimSpeed() === 'off'`.

- [ ] **Step 1: Motions** (timings from the mockup): hand dealt in from the left at the start of the ban round and the order step (70 ms apart); ban: "Banned" stamp slams on (0.3 s), card greys, then `flyCard` to your ban spot (0.62 s), ban spot pops; pick: `flyCard` to your next slot, slot pulses gold; opponent's pick: slot flips in (0.55 s); both bans revealed: their ban portrait pops when it first becomes visible; hands swap: remaining cards slide off toward the opponent's side (0.4 s), new hand slides in from that side (0.45 s) — **no text** — and the new cards are tappable from the first frame of the slide; clock turns red and ticks in the last 10 s; order swap: the two cards trade places with a short hop (0.42 s); big card (focus layout) eases in when it changes (0.22 s).
- [ ] **Step 2: Server first:** animations start from state changes the server sent; they never hold back a socket call or a state update. If the server's state changes mid-animation (clock ran out, opponent acted), the animation is cut and the screen shows the new state.
- [ ] **Step 3: Stills:** under `.draft--still` nothing moves; cards appear in place.
- [ ] **Step 4: Verify:** short recordings at 1280x720 and 844x390 of a full draft; one stills pass (Settings → Battle animations: off) shows no movement; let the clock run out once during a pick (Review Focus 2) and once during a swap slide — the screen ends on the server's state. Smooth at 4x CPU slowdown at 844x390. `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 5: Commit** `feat(frontend): draft motion (deal, ban stamp, picks fly, hands swap, order hop)`.

### Task 6: Reveal into the battle board [Fable]

**Files:**
- Create: `frontend/src/components/draft/DraftReveal.tsx`, `frontend/src/styles/DraftReveal.css`
- Modify: `frontend/src/App.tsx` (track the previous phase and whether this tab saw `setup` live; render the overlay above `BattlePhase`)

**Interfaces:**
- Consumes: `shouldPlayReveal` (Task 1); battle cards `[data-anim-key="<playerId>:<heroIndex>"]` from `BattlePhase`; the board geometry from Task 2.
- Produces: `DraftReveal` props `{ me: { id: string; team: Hero[] }; them: { id: string; team: Hero[] }; onDone(): void }`; App shows it only when `shouldPlayReveal(sawSetupRef.current, prevPhaseRef.current, phase)`.

- [ ] **Step 1: Sequence** (mockup timings): `BattlePhase` renders underneath at once (never delayed) but hidden behind the overlay. The overlay measures the six battle cards, then draws copies (`HeroCard`, `holo`, enemy rim for theirs) at the battle cards' sizes and heights, **each row centred horizontally on the whole screen**; their row drops in from the top and yours rises from the bottom (0.6 s, 90 ms apart); "VS" slams in on a glowing line between the rows with a white flash (~0.85 s); at ~2.2 s both rows glide sideways to the measured rectangles (0.75 s) while the overlay's background fades so the real board (row colours, name plates, log and actions panels) shows around them; then the overlay removes itself and calls `onDone`, leaving the real board and the Starting Roll box. Copies must land exactly on the battle cards (±1px).
- [ ] **Step 2: Skip and stills:** any tap ends the reveal at once (board shown, Starting Roll box visible). Under stills: a 0.3 s fade straight to the board. Rotate screen stays above it; the Friends button stays hidden until it ends.
- [ ] **Step 3: Never on rejoin:** a refresh into `initiative`, a reconnect, spectators and tutorial games do not see it (`shouldPlayReveal`).
- [ ] **Step 4: Verify** with two accounts at all five sizes: screenshot mid-VS and final board; measure copies vs battle cards at the end of the glide (±1px); no card moves when the overlay goes or when battle starts (Task 2). Tap-to-skip works; stills pass; refresh during `initiative` shows no reveal. `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 5: Commit** `feat(frontend): draft reveal faces the teams off and glides them onto the battle board`.

### Task 7: Step 3 sign-off

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm test`, `npm run build`, `npm run check:tokens`, `npm run lint` (note pre-existing lint failures; don't fix unrelated code).
- [ ] **Step 2:** Screenshot set at 1440x900, 1280x720, 1024x640, 844x390, 640x360: ban, a pick, hands swapping (mid-slide), order, reveal mid-VS, final board. Rules text ≥ 12px on the readable card at every size. Nothing overlaps at 640x360 (Leave, clock, band).
- [ ] **Step 3:** Full drafts between two accounts on the local server: one normal; one where the clock runs out once; one with a refresh mid-pick and one mid-order (Review Focus 1, 2). Holographic check: temporarily mark two heroes `holo: true` in the client state (devtools) and confirm the rim/foil in hand, slots, bans, big card, reader and reveal; revert.
- [ ] **Step 4:** Emulate a notched iPhone sideways (47px inset on one side): bar, band and big card clear of the notch. Stills pass with reduced motion.
- [ ] **Step 5:** Put the screenshots and a short recording in front of the owner and wait for his OK.
- [ ] **Step 6 (after the OK):** `npm run deploy:site` from the project root (site only). Spot-check `https://heroscall.pages.dev` at 844x390: login, lobby, no console errors.
