# Binder Redesign (Step 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the binder as option C v2: a leather book with six pockets per page, one brass filter button and an
X at the top, side arrows, a status-only bottom line, a real paper page turn as the only movement, and a new
closed-binder opening.

**Architecture:** Site only. `HeroCollection.tsx` stays the entry point with the same props, so `GameLobby` doesn't
change, but its insides are replaced:
- Pure rules (filter, sort, search, paging, status text, turn layout and queue) go in `binder/binderRules.ts`.
- Fetching and favourites go in the `binder/useBinderData.ts` hook.
- The view is split into `BinderPage`, `BinderBook` (owns the page turn through `useBinderTurn`), `BinderFilter`
  (the button and its panel), `BinderStatus` and `BinderOpening`.
- Pocket cards use the shared `HeroCard` with a new `tiny` prop, which forces today's tiny mode at any size.

**Tech Stack:** Vite + React 18 + TypeScript. Vitest + jsdom (`npm test` in `frontend`, helpers in
`src/testing/dom.ts`). Playwright for screenshots. Cloudflare Pages deploy (`npm run deploy`, only on the owner's
"go live").

**Spec:** `docs/superpowers/specs/2026-11-21-redesign-step5-binder-design.md`.
**Approved mockup:** `docs/superpowers/specs/2026-11-21-redesign-step5-binder-mockup.html`. Copy its CSS for the
book, pockets, filter button and panel, status line, and the page-turn leaf (`.turnleaf`, its faces and shadows).
The opening's look is the "Binder" screen of `docs/superpowers/specs/2026-11-17-redesign-mockups/packs-and-binder.html`.

**Models:** the owner's rule is that Fable does all drawing and animation and Opus does the rest. Tasks 5, 6 and 7 are
Fable's. Tasks 1, 2, 3, 4 and 8 are Opus's.

## Global Constraints

- Colours only from `frontend/src/styles/tokens.css`, with no new colour values. `npm run check:tokens` must pass.
  The card face is the live `HeroCard`; never use the old `card.html` dark panel.
- No server or `backend/` changes. Endpoints used as today:
  - `GET /api/heroes?userId=&showAll=true`
  - `GET /api/favorite-heroes/:id`
  - `GET /api/user/:id` (for `available_heroes` and `holo_heroes`)
  - `POST /api/toggle-favorite-hero` with `authHeaders`
- Six pockets per page, two pages per spread (12 heroes per spread), fixed on every screen size.
- Pocket cards show name, art and stats only (tiny mode) at every size. The large view shows the full card with
  `minTextPx={READ_TEXT_MIN_PX}` (from `src/draft/draftRules.ts`).
- The page turn is the only movement on a page change: no deal-in, no card re-animating. No riffle and no deal-in
  when the binder opens either.
- No card element is created or destroyed while the leaf is moving.
- With `cardMotionOff()` true (`src/cards/cardMotion.ts`, which covers reduced motion and "Battle animations: off"),
  pages swap instantly, filter changes don't fade, and the opening goes straight to the open book.
- The holo setting is respected (`HeroCard` already honours `getHoloEffects()`).
- Copy is sentence case with no emoji. Exact strings:
  - filter labels: `All`, `Owned`, `Favourites`, `Holographic`, `Not owned`, `Disabled`
  - sort labels: `Name`, `HP`, `Defense`, `Accuracy`, `Attack`
  - computer button label: `<Filter> · by <sort lowercase>`, for example `All · by name`, `Owned · by HP`
  - empty page: `No heroes match`
  - load failure: `Couldn't load the heroes.` with a `Try again` button
  - large-view button: `Add to favourites` / `Remove from favourites`
- No coin amount in the binder. On sideways phones the floating `.friends-icon` and `.message-icon` stay hidden while
  the binder is open, as the shop does.
- Out of scope: sound (step 6), the step 3 leftovers, the shop leftovers.

## Review Focus

1. **The list changes while a page is turning or turns are queued** (filter, sort or search, or a favourite removed
   under the Favourites filter). The queue clears, the turn in flight finishes or is dropped, and the spread clamps
   into range with no blank spread. Covered in Task 1 `clampSpread` tests and Task 6
   `a filter change during a turn clears the queue and lands on spread 0`.
2. **Removing a favourite in the large view while the Favourites filter is on.** The large view stays open on that
   hero (it's tracked by name, not by list index), and the hero leaves the page when the view closes. Covered in
   Task 4 `the large view stays on the hero after unfavouriting under the Favourites filter`.
3. **No matches, or fewer than 12 heroes.** The page shows `No heroes match` (or partly empty pockets), the arrows
   are hidden, and the status line reads `Page 1 of 1`. Covered in Task 1 `spreadCount` and Task 4
   `shows No heroes match and hides the arrows`.
4. **Opening on a hero the default view hides** (a disabled hero, from the lobby's featured card). It switches to
   the `Disabled` filter and turns to that hero's spread. Covered in Task 1 `filterForHero` and Task 4
   `opens on a disabled hero's spread`.
5. **Fast repeated arrow taps.** Up to two extra turns queue and the rest are dropped. The book ends on the right
   spread with no stuck leaf. Covered in Task 1 `queueTurn` tests and Task 6 `five quick taps end three spreads on`.

---

### Task 1: Binder rules (Opus)

**Files:**
- Create: `frontend/src/components/binder/binderRules.ts`
- Test: `frontend/src/components/binder/binderRules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BinderHero { name: string; HP: number; Defense: number; Accuracy: string; BasicAttack: string;
    Ability: unknown[]; Special: unknown; disabled?: boolean }
  export type BinderFilter = 'all' | 'owned' | 'favourites' | 'holo' | 'not-owned' | 'disabled';
  export type BinderSort = 'name' | 'hp' | 'defense' | 'accuracy' | 'attack';
  export interface BinderView { filter: BinderFilter; sort: BinderSort; query: string }
  export interface Collection { owned: string[]; favourites: string[]; holo: string[] }
  export const PER_PAGE = 6; export const PER_SPREAD = 12;
  export const DEFAULT_VIEW: BinderView; // { filter: 'all', sort: 'name', query: '' }
  export const FILTER_LABELS: Record<BinderFilter, string>; export const SORT_LABELS: Record<BinderSort, string>;
  export function matchesFilter(h: BinderHero, f: BinderFilter, c: Collection): boolean;
  export function binderList(heroes: BinderHero[], v: BinderView, c: Collection): BinderHero[];
  export function spreadCount(listLength: number): number;           // min 1
  export function spreadPages(list: BinderHero[], spread: number): [(BinderHero | null)[], (BinderHero | null)[]];
  export function clampSpread(spread: number, listLength: number): number;
  export function spreadOfHero(list: BinderHero[], name: string): number | null;
  export function filterForHero(h: BinderHero, c: Collection, current: BinderFilter): BinderFilter;
  export function isFiltered(v: BinderView): boolean;
  export function buttonLabel(v: BinderView): string;
  export function statusLine(a: { filter: BinderFilter; spread: number; spreads: number;
    ownedCount: number; enabledCount: number; holoCount: number }): string;
  export type TurnDir = 1 | -1;
  export interface PageRef { spread: number; side: 0 | 1 }        // 0 = left page, 1 = right page
  export function turnLayout(from: number, to: number, dir: TurnDir):
    { underLeft: PageRef; underRight: PageRef; leafFront: PageRef; leafBack: PageRef };
  export function turnTarget(spread: number, dir: TurnDir, spreads: number): number; // wraps
  export function queueTurn(queue: TurnDir[], dir: TurnDir, max?: number): TurnDir[]; // max default 2
  ```

- [ ] **Step 1: Write the failing tests** in `binderRules.test.ts`. Use a fixture of 14 heroes, with 2 disabled.
  `owned` holds 5 enabled heroes plus 1 disabled hero, `holo` holds 2 owned heroes plus 1 unowned name (from stale
  data), and `favourites` holds 1 owned, 1 unowned and 1 disabled hero.

```ts
it('matchesFilter: all = enabled; owned = owned and enabled; holo = owned holo; not-owned = enabled unowned; disabled; favourites = any favourite', ...)
it('binderList sorts by name A-Z, and by HP, Defense, Accuracy (+N), Attack (dice max, "—" counts as 0) highest first, ties by name', ...)
it('binderList search is case-insensitive on name and applies after the filter', ...)
it('spreadCount', () => { expect(spreadCount(0)).toBe(1); expect(spreadCount(12)).toBe(1); expect(spreadCount(13)).toBe(2); expect(spreadCount(40)).toBe(4); });
it('spreadPages pads with null to 6 + 6', () => { const [l, r] = spreadPages(list13, 1); expect(l[0]?.name).toBe(list13[12].name); expect(l.slice(1).every(x => x === null)).toBe(true); expect(r).toEqual([null, null, null, null, null, null]); });
it('clampSpread', () => { expect(clampSpread(3, 13)).toBe(1); expect(clampSpread(2, 0)).toBe(0); });
it('spreadOfHero', () => { expect(spreadOfHero(list13, list13[12].name)).toBe(1); expect(spreadOfHero(list13, 'Nobody')).toBeNull(); });
it('filterForHero keeps the current filter if it shows the hero, else disabled for a disabled hero, else all', ...)
it('isFiltered', () => { expect(isFiltered(DEFAULT_VIEW)).toBe(false); expect(isFiltered({ ...DEFAULT_VIEW, sort: 'hp' })).toBe(true); expect(isFiltered({ ...DEFAULT_VIEW, query: '  ' })).toBe(false); expect(isFiltered({ ...DEFAULT_VIEW, query: 'an' })).toBe(true); });
it('buttonLabel', () => { expect(buttonLabel(DEFAULT_VIEW)).toBe('All · by name'); expect(buttonLabel({ filter: 'not-owned', sort: 'hp', query: '' })).toBe('Not owned · by HP'); });
it('statusLine', () => {
  expect(statusLine({ filter: 'all', spread: 0, spreads: 4, ownedCount: 27, enabledCount: 40, holoCount: 5 })).toBe('Page 1 of 4 · 27 of 40 heroes · 5 holographic');
  expect(statusLine({ filter: 'favourites', spread: 0, spreads: 1, ownedCount: 27, enabledCount: 40, holoCount: 5 })).toBe('Favourites · Page 1 of 1 · 27 of 40 heroes · 5 holographic');
});
it('turnLayout next: under = from.left + to.right, leaf front = from.right, back = to.left', () => {
  expect(turnLayout(0, 1, 1)).toEqual({ underLeft: { spread: 0, side: 0 }, underRight: { spread: 1, side: 1 }, leafFront: { spread: 0, side: 1 }, leafBack: { spread: 1, side: 0 } });
});
it('turnLayout prev: under = to.left + from.right, leaf front = from.left, back = to.right', () => {
  expect(turnLayout(1, 0, -1)).toEqual({ underLeft: { spread: 0, side: 0 }, underRight: { spread: 1, side: 1 }, leafFront: { spread: 1, side: 0 }, leafBack: { spread: 0, side: 1 } });
});
it('turnTarget wraps', () => { expect(turnTarget(3, 1, 4)).toBe(0); expect(turnTarget(0, -1, 4)).toBe(3); });
it('queueTurn keeps at most 2 waiting', () => { expect(queueTurn([1, 1], 1)).toEqual([1, 1]); expect(queueTurn([], -1)).toEqual([-1]); });
```

- [ ] **Step 2: Run** `npx vitest run src/components/binder/binderRules.test.ts` in `frontend`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `binderRules.ts` to the interfaces. Reuse the dice and accuracy parsing from today's
  `HeroCollection.tsx`: dice max is count × sides, accuracy is the signed number.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): binder rules (filter, sort, paging, status, turn layout)`.

### Task 2: Binder data hook (Opus)

**Files:**
- Create: `frontend/src/components/binder/useBinderData.ts`
- Test: `frontend/src/components/binder/useBinderData.test.tsx` (`@vitest-environment jsdom`)

**Interfaces:**
- Consumes: `BinderHero`, `Collection` from Task 1.
- Produces:
  ```ts
  export interface BinderData { heroes: BinderHero[]; collection: Collection; loading: boolean; error: boolean;
    retry: () => void; toggleFavourite: (name: string) => Promise<void> }
  export default function useBinderData(userId: number | undefined,
    onFavoritesChange?: (favs: string[]) => void): BinderData;
  ```

- [ ] **Step 1: Write the failing tests** with `window.fetch` stubbed:
  - `loads heroes, owned, holo and favourites for a signed-in player`
  - `signed out: fetches only heroes; collection is empty`
  - `a failed heroes request sets error, and retry refetches and clears it` (no fallback heroes ever appear)
  - `toggleFavourite posts { userId, heroName } with auth headers, takes favourites from the reply and calls onFavoritesChange`
  - `a failed toggle leaves favourites unchanged`
- [ ] **Step 2: Run** `npx vitest run src/components/binder/useBinderData.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with the endpoints from Global Constraints. `collection.owned` comes from
  `available_heroes`, and `holo` from `holo_heroes`. Requests run in parallel.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): binder data hook`.

### Task 3: Tiny card at any size (Opus)

**Files:**
- Modify: `frontend/src/components/HeroCard.tsx` (props near line 20-42 and the root class list)
- Modify: `frontend/src/styles/HeroCard.css` (the tiny-mode block at about line 874, and the stronger tiny holo at
  about line 666)
- Test: `frontend/src/components/HeroCard.test.tsx` (add to it if it exists, otherwise create it with
  `@vitest-environment jsdom`)

**Interfaces:**
- Produces: `HeroCard` prop `tiny?: boolean`. When true, the root gets class `card-tiny`, and the face looks exactly
  as it does under `@container (max-width: 129px)` at any width. That means no `.card-details` or `.card-rule`, the
  bigger name and stats, and the stronger holo.

- [ ] **Step 1: Write the failing test** `tiny adds card-tiny and keeps no rules text in the DOM flow`. Assert the
  class is present, and that `.card-details` gets `display: none` from the stylesheet (or, if jsdom can't apply CSS,
  assert the class only).
- [ ] **Step 2: Run** `npx vitest run src/components/HeroCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the prop and the class, and give each rule in the two tiny blocks a matching
  `.hero-card.card-tiny ...` selector so both stay identical. No other screen passes `tiny`, so nothing else changes.
- [ ] **Step 4: Run** the test and the full `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): HeroCard tiny prop for name-and-stats cards at any size`.

### Task 4: Binder structure, working with plain styles (Opus)

**Files:**
- Rewrite: `frontend/src/components/HeroCollection.tsx` (same props; keep `victoryPoints` in the props type for the
  lobby, but don't use it)
- Create: `frontend/src/components/binder/BinderPage.tsx`, `BinderFilter.tsx`, `BinderStatus.tsx`, `BinderBook.tsx`
  (no turn animation yet: `turn()` swaps spreads instantly), `BinderLargeView.tsx`
- Modify: `frontend/src/components/ui/DevScreens.tsx` (add `binder`)
- Test: `frontend/src/components/binder/Binder.test.tsx` (`@vitest-environment jsdom`, `stubBrowserApis`)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces (Tasks 5-7 style and animate these; keep the class names):
  ```ts
  // BinderPage: one page of 6 pockets. Memoised. Pockets keyed by hero name, empty ones by slot.
  export const BinderPage: React.FC<{ heroes: (BinderHero | null)[]; collection: Collection;
    spotlight: string | null; onOpen: (name: string) => void }>;
  // root .binder-page; pocket .binder-pocket (+ --empty, --spotlight); card <HeroCard tiny readable="none"
  //   holo favorite className="binder-card binder-card--locked | binder-card--disabled" />
  export const BinderBook: React.FC<{ list: BinderHero[]; collection: Collection; spread: number;
    onSpreadChange: (s: number) => void; spotlight: string | null; onOpen: (name: string) => void;
    viewKey: string /* changes when filter/sort/query change */ }>;
  // root .binder-book > .binder-spread > .binder-side--left, .binder-side--right, .binder-rings;
  //   arrows button.binder-arrow--prev / --next (hidden when spreadCount === 1)
  export const BinderFilter: React.FC<{ view: BinderView; onChange: (v: BinderView) => void; signedIn: boolean }>;
  // button.binder-filter-btn (aria-expanded, label span .binder-filter-label = buttonLabel, dot .binder-filter-dot
  //   when isFiltered); panel .binder-panel with input[type=search], filter buttons (aria-pressed), sort buttons
  //   (aria-pressed). 'favourites' and 'holo' are hidden when !signedIn. Escape or a tap outside closes the panel.
  export const BinderStatus: React.FC<{ text: string }>;            // p.binder-status
  export const BinderLargeView: React.FC<{ hero: BinderHero; collection: Collection; signedIn: boolean;
    onToggleFavourite: (name: string) => void; onClose: () => void }>;
  ```
  `HeroCollection` holds `view` (starts `DEFAULT_VIEW`), `spread`, `openHero: string | null` (by name), and
  `spotlight`. The spread shown is always `clampSpread(spread, list.length)`, so a list that shrinks without a view
  change (unfavouriting under Favourites) never shows a blank spread. The X (top right) uses `CloseButton`. While the binder is open it hides the floating friends and
  message icons on sideways phones, the same way `Shop` does.

- [ ] **Step 1: Write the failing tests:**
  - `opens on All, sorted by name, with 12 pockets and the status line` (assert exact `statusLine` text)
  - `the filter panel changes the filter, sort and search, and resets to spread 0`
  - `signed out: no Favourites or Holographic filter and no favourite button`
  - `the next arrow shows spread 2; prev from spread 1 wraps to the last`
  - `shows No heroes match and hides the arrows` (search `zzz`)
  - `tapping a pocket opens the large view; Escape closes it`
  - `the large view stays on the hero after unfavouriting under the Favourites filter`
  - `opens on initialHero's spread and lights its pocket` and `opens on a disabled hero's spread` (filter becomes Disabled)
  - `a failed load shows Couldn't load the heroes. and Try again refetches`
- [ ] **Step 2: Run** `npx vitest run src/components/binder/Binder.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the components to the interfaces. For now, keep today's `BinderOpening` as the intro
  (Task 7 replaces it). Delete the old `useCardGrid`, `flip` and fallback-hero code from `HeroCollection.tsx`.
  Remove the binder rules from `HeroCollection.css`/`Binder.css` that nothing uses any more. Add the
  `#screens/binder` dev screen: canned `/api/*` replies like `DevShop`. Its query has `signedin=0|1`,
  `owned=some|all|none`, `holo=N`, `hero=<name>` for initialHero, and `fail=1`. It also accepts
  `filter=<BinderFilter>`, which the dev screen passes to `HeroCollection` as a dev-only `initialView` prop.
  Defaults: signed in, 27 of 40 owned, 5 holographic, the mockup's favourites.
- [ ] **Step 4: Run** the binder tests and the full `npm test`, `npm run lint` and `npm run check:tokens`. Expected:
  all PASS.
- [ ] **Step 5: Commit** `feat(frontend): binder rebuilt from parts (filter panel, pages, status, large view)`.

### Task 5: Binder look (Fable)

**Files:**
- Create: `frontend/src/styles/BinderBook.css` (imported by `BinderBook`/`HeroCollection`)
- Modify: `frontend/src/components/binder/*.tsx` only for markup the look needs (keep Task 4's class names and
  tests passing)

**Interfaces:**
- Consumes: Task 4's class names.

- [ ] **Step 1: Copy the mockup's look** onto the real parts:
  - the table, the leather book and the brass rings;
  - pockets, and the locked card (dark, grey, padlock);
  - the disabled card (grey, ember stripes, crossed circle);
  - the spotlight glow;
  - the brass filter button, the red dot, and the panel dropping down from the button;
  - the X top right, the side arrows, and the status line.

  Phone layout: the button and X sit in the top corners beside the book, with no row spent and the label hidden.
  The red dot shows only when the label is hidden. Computer layout (`(min-width: 1000px) and (min-height: 560px)`):
  the label shows. The large view is restyled as in the mockup.
- [ ] **Step 2: Narrow phones.** At 640 x 360, tighten the gutters and pocket padding, and lay slimmer side arrows
  over the book's outer edge, so pocket cards are **at least 84 px wide**. At 740 x 360 they are at least 94 px, and
  at 1280 x 720 at least 158 px.
- [ ] **Step 3: Filter fade.** When `viewKey` changes for a filter or sort change, the spread fades in over 140 ms.
  Typing in search doesn't fade. No fade when `cardMotionOff()` is true.
- [ ] **Step 4: Check** in the browser at `/#screens/binder` at 640 x 360, 740 x 360, 844 x 390 and 1280 x 720, with the
  panel open and closed. Run `npm test`, `npm run lint` and `npm run check:tokens`. Expected: PASS, with nothing
  clipped or overlapping.
- [ ] **Step 5: Commit** `feat(frontend): binder look (leather book, brass filter panel, status line)`.

### Task 6: The page turn (Fable)

**Files:**
- Create: `frontend/src/components/binder/useBinderTurn.ts`
- Modify: `frontend/src/components/binder/BinderBook.tsx`, `frontend/src/styles/BinderBook.css`
- Test: `frontend/src/components/binder/useBinderTurn.test.tsx` (`@vitest-environment jsdom`, fake timers)

**Interfaces:**
- Consumes: `turnLayout`, `turnTarget`, `queueTurn`, `spreadPages`, `clampSpread` (Task 1).
- Produces:
  ```ts
  export const TURN_MS = 680;
  export interface TurnState { from: number; to: number; dir: TurnDir; phase: 'ready' | 'moving' }
  export default function useBinderTurn(a: { spread: number; spreads: number; viewKey: string;
    onSpreadChange: (s: number) => void; artFor: (spread: number) => string[] }):
    { turn: TurnState | null; request: (dir: TurnDir) => void };
  ```

- [ ] **Step 1: Write the failing tests:**
  - `a turn goes ready then moving, and commits the new spread after TURN_MS`
  - `five quick taps end three spreads on` (the first turn plus 2 queued; the rest are dropped)
  - `a filter change during a turn clears the queue and lands on spread 0` (`viewKey` changes)
  - `with cardMotionOff the spread changes at once and turn stays null`
- [ ] **Step 2: Run** `npx vitest run src/components/binder/useBinderTurn.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the hook and the leaf:**
  1. `request` mounts the leaf in phase `ready`, at 0° and not moving. Its faces are `BinderPage`s for
     `turnLayout(...).leafFront` and `.leafBack`. The pages underneath switch to `underLeft`/`underRight`.
  2. Two animation frames later, once that spread's art has decoded (`artFor` gives its image URLs; wait for
     `img.decode()`, but at most 150 ms), go to `moving`.
  3. On `animationend` (or after `TURN_MS` as a fallback), commit `onSpreadChange(to)`, unmount the leaf, then run
     the next queued turn.
  4. Preload the art for spreads `spread ± 1` whenever the spread changes.
  5. Copy the mockup's two-faced `.turnleaf`: `transform-style: preserve-3d`, `will-change: transform`, rotateY
     0 → −180° (next) or 0 → 180° (prev), and the three shadow opacities.
  6. Animate only transform and opacity.
  7. Add `.binder-book--turning` while moving, which pauses holo animations (`animation-play-state: paused` on the
     holo layers).
  8. Arrows stay clickable during a turn; their clicks go into the queue.
- [ ] **Step 4: Run** the tests and the full `npm test`. Then, in the browser at `/#screens/binder` at 740 x 360 and
  1280 x 720, record a turn with a Playwright trace or `requestAnimationFrame` timestamps. Expected: the page and its
  six cards are visible at 25%, 50% and 75% of the turn, and no frame gap is over 34 ms on desktop Chromium.
  Save screenshots to `.superpowers/sdd/2026-11-21-redesign-step5-binder/`.
- [ ] **Step 5: Commit** `feat(frontend): binder page turn as a real two-faced leaf`.

### Task 7: The opening (Fable)

**Files:**
- Rewrite: `frontend/src/components/BinderOpening.tsx`
- Modify: `frontend/src/styles/Binder.css` (opening rules only), `HeroCollection.tsx` (wiring)
- Test: `frontend/src/components/BinderOpening.test.tsx` (`@vitest-environment jsdom`)

**Interfaces:**
- Produces: `BinderOpening: React.FC<{ onOpened: () => void }>`. It covers the screen above the already-rendered
  book. `HeroCollection` renders the book underneath from the start, and the spotlight timer (1600 ms) starts on
  `onOpened`.

- [ ] **Step 1: Write the failing tests:**
  - `shows the closed binder and Tap the binder to open it`
  - `a tap calls onOpened after the opening finishes`
  - `with cardMotionOff, onOpened is called at once and nothing is shown`
- [ ] **Step 2: Run** `npx vitest run src/components/BinderOpening.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the look from the 2026-11-17 mockup's Binder screen:
  - the closed binder drops with a bounce and a puff of dust;
  - red-brown leather with grain, a stitched border, a brass frame line, brass corners, and a brass shield crest
    (reuse today's crest SVG);
  - "Hero's Call" in gold Grenze Gotisch;
  - a brass clasp that twitches every couple of seconds;
  - the tap prompt.

  On tap, the cover swings open, golden light spills out and the book grows to fill the screen. Then it fades,
  showing the real book with its cards already in place. No riffle, no deal-in.
- [ ] **Step 4: Run** the tests and the full `npm test`. Check it in the browser at 740 x 360 and 1280 x 720.
  Expected: PASS, and the hand-off to the real book has no jump in size or position.
- [ ] **Step 5: Commit** `feat(frontend): new binder opening (closed binder lands and opens)`.

### Task 8: Readability audit and owner screenshots (Opus)

**Files:**
- Create: `frontend/scripts/audit-binder.mjs` (Playwright, like the shop's readability audit script)

- [ ] **Step 1: Write the audit.** It opens `/#screens/binder` (with `vite preview` or the dev server) at 640 x 360,
  740 x 360, 844 x 390, 1280 x 720 and 1920 x 1080, then:
  - asserts the smallest pocket card width (≥ 84, ≥ 94, ≥ 94, ≥ 158 and ≥ 158 px);
  - asserts the hero name font is ≥ 11 px on phones;
  - asserts no element of `.binder-book`, `.binder-filter-btn`, `.binder-panel` (opened) or `.binder-status` is
    clipped or overlapping another;
  - asserts nothing scrolls horizontally;
  - saves screenshots of: closed and open panel, a locked card, a disabled card (`filter=disabled`), the large view,
    an empty search, and the opening.
- [ ] **Step 2: Run** `node scripts/audit-binder.mjs`. Expected: every check passes. Fix anything that fails in the
  owning task's files.
- [ ] **Step 3: Run** `npm test`, `npm run lint`, `npm run check:tokens` and `npm run build`. Expected: all pass.
- [ ] **Step 4: Copy the screenshots** to `.superpowers/sdd/2026-11-21-redesign-step5-binder/owner-shots/` for the
  owner's review. Nothing deploys until he says "go live".
- [ ] **Step 5: Commit** `test(frontend): binder readability audit script`.
