# Shop Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shop as direction B ("Showcase split"): a still holographic pack and a brass dial on the left, and
big readable sale cards on the felt on the right (two rows on bigger screens). Unaffordable prices are greyed out, and
every shop window stays readable at 640x360 and up.

**Architecture:** Site only. `Shop.tsx` keeps its data flow and purchase handling (purchase lock, balance from the
reply, pack opening). Its markup and CSS are replaced. Small pure helpers are split out so they can be tested:
`shop/shopRules.ts` (prices, message text, dial time, owned count), `calculateShopGrid` in `useCardGrid.ts` (card
fitting), and `shop/HoloPack.tsx` (the still foil pack). `PackOpening` and the card reader are untouched.

**Tech Stack:** Vite + React 18 + TypeScript; Vitest + jsdom (`npm test` in `frontend`, helpers in
`src/testing/dom.ts`); Playwright for screenshots; Cloudflare Pages deploy (`npm run deploy`, only on the owner's
"go live").

**Spec:** `docs/superpowers/specs/2026-11-21-redesign-shop-design.md`.
**Approved mockup:** `.superpowers/brainstorm/18564-1795293616/content/shop-b-v3.html`. On disk it is under
`C:\c\Users\David\...\Hero's Call\Game\.superpowers\...`, because of the msys path quirk. It holds the CSS to copy
from: the dial, the card turn, greyed tags, the pack foil and the toast.

**Models:** the owner's rule is that Fable does all drawing and animation and Opus does the rest. Tasks 3 and 5 are
Fable's. Tasks 1, 2, 4 and 6 are Opus's.

## Global Constraints

- Colours only from `frontend/src/styles/tokens.css`, with no new colour values. `npm run check:tokens` must pass.
  The card face is the live `HeroCard`; never use the old `card.html` dark panel.
- Prices: hero 5, pack 12, unchanged. No server or `backend/` changes.
- Every `HeroCard` in the shop and its inside window gets `minTextPx={READ_TEXT_MIN_PX}` (12, from
  `src/draft/draftRules.ts`).
- Every card is at least 222px wide at 640x360 and at 844x390. No text clips, overflows or overlaps at either size.
- The pack never moves on its own. No rainbow ring or border around the pack. The lean on hover only happens on
  `(hover: hover) and (pointer: fine)`.
- No "not enough" text anywhere in the shop. The not-enough message is exactly `You don't have enough coins.` and
  lasts 2000 ms. Server and connection errors last 3000 ms.
- All shop motion stops under `prefers-reduced-motion: reduce`.
- With `getHoloEffects()` false (`src/holoSetting.ts`), the pack is drawn plain.
- On sideways phones the floating `.friends-icon` and `.message-icon` stay hidden while the shop is open.
- `PackOpening` and `CardReader` are not changed.
- Out of scope: the step 3 leftovers and the battle name tags. The owner said "Do the fixes later."

## Review Focus

1. **The balance drops while the shop is open,** for example after buying a hero. Tags that are now unaffordable
   grey out at once. Covered in Task 4: `greys the pack tag after a hero purchase drops the balance below 12`.
2. **Tapping a greyed tag, even twice,** never sends a purchase request. It only shows the message. Covered in
   Task 4: `a greyed tag sends no request and shows the coins message`.
3. **A rotation change or resize while on a later sale page.** The page clamps into range, so it is never empty.
   Covered in Task 4: `the sale page clamps when the rotation shrinks`.
4. **Every sale hero bought.** The empty "You own every hero" state shows in the new layout and the pack still sells.
   Covered in Task 4: `shows the all-owned state and keeps the pack for sale`.
5. **Holo effects switched off.** The pack is plain and owned holo heroes in the inside window are plain. Covered in
   Task 3: `draws plain when holo effects are off`. The inside window relies on `HeroCard` already honouring the
   setting.

---

### Task 1: Shop rules (Opus)

**Files:**
- Create: `frontend/src/components/shop/shopRules.ts`
- Test: `frontend/src/components/shop/shopRules.test.ts`

**Interfaces:**
- Produces:
  - `HERO_PRICE = 5`
  - `PACK_PRICE = 12`
  - `NOT_ENOUGH_COINS = "You don't have enough coins."`
  - `NOT_ENOUGH_MS = 2000`
  - `ERROR_MS = 3000`
  - `shopErrorText(serverMessage: unknown): string`
  - `saleTimeLeft(now: Date): { label: string; fraction: number; seed: number }`
  - `packOwnedCount(packHeroes: { name: string }[], owned: string[]): { owned: number; total: number }`

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps the known server texts', () => {
  for (const t of ['Not enough to buy this.', 'Hero already owned', 'Hero not available',
    'That hero is no longer in the shop. The rotation has changed.'])
    expect(shopErrorText(t)).toBe(t);
});
it('replaces any other server text', () => {
  expect(shopErrorText('SQLITE_BUSY: database is locked')).toBe('Purchase failed. Please try again.');
  expect(shopErrorText(undefined)).toBe('Purchase failed. Please try again.');
});
it('counts down to the next quarter hour', () => {
  const t = saleTimeLeft(new Date(2026, 10, 21, 10, 7, 30));
  expect(t.label).toBe('7m 30s');
  expect(t.fraction).toBeCloseTo(0.5);          // share of the 15 minutes still left
  expect(t.seed).toBe(Math.floor(new Date(2026, 10, 21, 10, 7, 30).getTime() / 900000));
});
it('rolls over the hour', () => {
  expect(saleTimeLeft(new Date(2026, 10, 21, 10, 59, 59)).label).toBe('0m 1s');
});
it('counts owned pack heroes', () => {
  expect(packOwnedCount([{ name: 'A' }, { name: 'B' }, { name: 'C' }], ['B', 'Fighter'])).toEqual({ owned: 1, total: 3 });
});
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/shop/shopRules.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `shopRules.ts`.** The known texts are exactly the four above. `saleTimeLeft` keeps today's
  `Xm Ys` label from `Shop.tsx` (lines ~107-140).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): shop rules for prices, messages, sale clock and owned count`.

### Task 2: Shop card fitting (Opus)

**Files:**
- Modify: `frontend/src/hooks/useCardGrid.ts` (add `calculateShopGrid` beside `calculatePackGrid`, and a `shopCount` option)
- Test: `frontend/src/hooks/useCardGrid.test.ts`

**Interfaces:**
- Produces:
  - `calculateShopGrid(width: number, height: number, count: number, minCardWidth = 222, maxRows = 3, gap = 18): { columns: number; rows: number; scale: number }`
  - `useCardGrid({ shopCount })` uses it in place of `calculateCardGrid`. It returns the same `{ ref, style, pageSize }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('fits two cards of at least 222px on a 640x360 phone table', () => {
  const g = calculateShopGrid(470, 348, 6);
  expect([g.columns, g.rows]).toEqual([2, 1]);
  expect(260 * g.scale).toBeGreaterThanOrEqual(222);
});
it('fits the 844x390 phone table at two cards of about 246px', () => {
  const g = calculateShopGrid(560, 378, 6);
  expect([g.columns, g.rows]).toEqual([2, 1]);
  expect(260 * g.scale).toBeGreaterThanOrEqual(240);
});
it('lays the six sale heroes 3 over 3 on a desktop table', () => {
  expect(calculateShopGrid(1500, 1000, 6)).toMatchObject({ columns: 3, rows: 2 });
});
it('uses two rows for the inside window on a desktop table', () => {
  expect(calculateShopGrid(1500, 1000, 30).rows).toBe(2);
});
it('shows one big card when one is left', () => {
  expect(calculateShopGrid(1500, 1000, 1)).toMatchObject({ columns: 1, rows: 1 });
});
it('never makes a second row whose cards would be under 222px', () => {
  expect(calculateShopGrid(1500, 600, 6).rows).toBe(1);
});
```

- [ ] **Step 2: Run** `npx vitest run src/hooks/useCardGrid.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Card shape 260:391, scale capped at 1.2 (as in `calculateCardGrid`):

```
for rows = maxRows down to 1:
  hW = min(312, ((height - gap*(rows-1)) / rows) * 260/391)    // width the height allows
  if rows > 1 and hW < minCardWidth: continue
  columns = max(1, floor((width+gap)/(hW+gap)), floor((width+gap)/(minCardWidth+gap)))
  columns = min(columns, ceil(count/rows));  rows = min(rows, ceil(count/columns))
  cardW = min(hW, (width - gap*(columns-1)) / columns)
  return { columns, rows, scale: floor(cardW/260*1000)/1000 }
```

  In the hook, `shopCount` goes in the effect's dependency list. Existing callers are unchanged.
- [ ] **Step 4: Run** the same file. Expected: PASS, and the old tests still pass.
- [ ] **Step 5: Commit** `feat(frontend): shop card fitting, up to two rows, cards at least 222px`.

### Task 3: The still holographic pack (Fable)

**Files:**
- Create: `frontend/src/components/shop/HoloPack.tsx`, `frontend/src/styles/HoloPack.css`
- Test: `frontend/src/components/shop/HoloPack.test.tsx`

**Interfaces:**
- Produces: `<HoloPack width: string /* CSS length, e.g. "112px" */ name?: string /* default "Adventure Pack" */ />`.
  It renders `.holo-pack`, plus `.holo-pack--foil` when `getHoloEffects()` is true. It uses `/pack1.png` (the same
  image as `PackOpening`).

- [ ] **Step 1: Write the failing tests**

```tsx
it('draws the foil when holo effects are on', () => { /* localStorage heroscall.holo unset */
  expect(render(<HoloPack width="112px" />).querySelector('.holo-pack--foil')).not.toBeNull();
});
it('draws plain when holo effects are off', () => {
  localStorage.setItem('heroscall.holo', 'off');
  expect(render(<HoloPack width="112px" />).querySelector('.holo-pack--foil')).toBeNull();
});
it('the foil follows the pointer', () => {
  const el = render(<HoloPack width="112px" />).querySelector('.holo-pack') as HTMLElement;
  // jsdom: stub getBoundingClientRect to {left:0, top:0, width:100, height:150}
  el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 25, clientY: 150 }));
  expect(el.style.getPropertyValue('--card-mx')).toBe('25%');
  expect(el.style.getPropertyValue('--card-my')).toBe('100%');
});
it('has no ring element', () => {
  expect(render(<HoloPack width="112px" />).querySelector('.pk-foil')).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/shop/HoloPack.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Build it** from the mockup's `.pack.holo`, `.pk-sheen` and `.pk-spark` rules, at the small-card foil
  strength from `HeroCard.css`. Leave out `.pk-foil` (the rainbow ring) and every float, mote, glow pulse and sweep.
  The pointer handler sets `--card-mx`/`--card-my` as percentages and, only under `(hover: hover) and (pointer: fine)`,
  `--card-rx`/`--card-ry` for the lean (a few degrees, as `HeroCard`'s `tilt`). On `pointerleave` it resets all four.
  The idle drift is `card-holo-drift`/`card-holo-mask`, reused from `HeroCard.css` and off under reduced motion.
- [ ] **Step 4: Run** the same file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): still holographic shop pack`.

### Task 4: Shop markup and behaviour (Opus)

**Files:**
- Modify: `frontend/src/components/Shop.tsx` (whole render, purchase handlers ~176-262, pack contents ~78-105)
- Modify: `frontend/src/components/GameLobby.tsx:447-454` (pass `holoHeroes={user.holo_heroes}`)
- Modify: `frontend/src/components/Shop.pack.test.tsx` (selectors, and the "shop is closed" expectation)
- Create: `frontend/src/components/Shop.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`HERO_PRICE`, `PACK_PRICE`, `NOT_ENOUGH_COINS`, `NOT_ENOUGH_MS`, `ERROR_MS`, `shopErrorText`,
  `saleTimeLeft`, `packOwnedCount`), Task 2 (`useCardGrid({ shopCount })`), Task 3 (`<HoloPack>`).
- Produces the markup contract that Task 5 styles and the tests rely on:
  - `.shop-overlay > .shop-container.shop--b` is full screen.
  - `.shop-showcase` (left column) holds:
    - `h2` "Hero shop" and `.vp-amount`
    - `<HoloPack>`
    - `button.shop-buy-pack` with text `Buy pack` plus a coin and `12`
    - `button.shop-inside-btn` "See what's inside"
    - `.shop-foot` holding `.shop-dial` (inline style `--p` = `fraction`), `.shop-when` ("Next sale in" + label),
      and `.shop-pager` (prev/next buttons + `.shop-pip`s)
  - `.shop-table` holds `.shop-sale-grid` (`useCardGrid` ref and style). Each card is `.shop-slot`, containing the
    `HeroCard` and `button.shop-price-tag`, or a `.shop-stamp` "Purchased" once bought.
  - Unaffordable: a tag or pack button gets the class `is-poor` and `aria-disabled="true"`, and is **not** `disabled`,
    so a tap still fires.
  - `.shop-message[role=alert]` is inside `.shop-table`. The over-opening variant `.shop-message--over-opening` stays
    as it is today.
  - The inside window `.shop-inside` holds the title, the existing subtitle text, `.shop-meter` ("You own N of M" and a
    bar), an `.shop-inside-grid` (`useCardGrid({ shopCount })`), arrows, and `.shop-owned-chip` "Owned" on owned
    cards. Holo comes from `holoHeroes`.
  - `.shop-turn` is put on the sale grid for one cycle when the page or rotation changes, for Task 5's animation.

- [ ] **Step 1: Write the failing tests** in `Shop.test.tsx`. Reuse the `installFetch` and `ShopHarness` pattern from
  `Shop.pack.test.tsx`, with `vi.useFakeTimers()` where timing is asserted.
  - `a greyed tag sends no request and shows the coins message`: balance 3. Click `.shop-price-tag` twice. There are
    0 calls to `/api/shop/purchase-hero`, `.shop-message` has the text `You don't have enough coins.`, and it is gone
    after 2000 ms.
  - `the greyed pack button sends no request`: balance 8. `.shop-buy-pack` has `is-poor` and is not `disabled`.
    Clicking it sends no `/purchase-pack` call.
  - `greys the pack tag after a hero purchase drops the balance below 12`: balance 13, the hero reply is `newVP: 8`.
    After clicking the first tag, `.shop-buy-pack.is-poor` exists and the hero tags do not have `is-poor`.
  - `a server error shows the fallback text for 3 seconds`: the hero reply is `{ success: false, message: 'boom' }`.
    `.shop-message` shows `Purchase failed. Please try again.` and has gone after 3000 ms.
  - In this file, `vi.mock('./HeroCard')` with a stub that renders
    `<div class="hero-card" data-name={hero.name} data-holo={String(!!holo)} data-min-text={minTextPx}>`.
    `Shop.pack.test.tsx` keeps the real card.
  - `card text has a 12px floor`: every `.shop-table .hero-card` and `.shop-inside .hero-card` has `data-min-text="12"`.
  - `the inside window counts owned heroes and shows holo`: owned `['Ninja']`, `holoHeroes=['Ninja']`.
    `.shop-meter` text includes `You own 1 of 2`. The Ninja card has `data-holo="true"`, and its slot has
    `.shop-owned-chip`, not `.shop-hero-purchased-overlay`.
  - `the sale page clamps when the rotation shrinks`: page 2 of 3, then a rotation of 1 hero. One card shows.
  - `shows the all-owned state and keeps the pack for sale`: the rotation is empty. The "You own every hero" text
    shows and `.shop-buy-pack` works.
  - `the dial shows the time left`: fake time 10:07:30. `.shop-dial` has `--p` 0.5 and `.shop-when` has `7m 30s`.
- [ ] **Step 2: Run** `npx vitest run src/components/Shop.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Rebuild the render.**
  - Keep every handler's lock, reply and `onPurchaseComplete` logic.
  - Replace `victoryPoints < X` early returns with a not-enough message: `showMessage(NOT_ENOUGH_COINS, NOT_ENOUGH_MS)`.
  - Route every error text through `shopErrorText`. Network failures keep their own fixed texts.
  - Delete the `'Not Enough'` labels and the dimmed purchased overlay in the inside window.
  - Remove `PACK_PRICE` and the literal `5` from `Shop.tsx` in favour of Task 1's constants.
  - Pass `holo={holoHeroes.includes(name)}` and `minTextPx={READ_TEXT_MIN_PX}` to every `HeroCard`.
  - Add prop `holoHeroes?: string[]` (default `[]`).
  - Keep the phone rule that hides the floating icons, using the same `body:has(.shop-overlay)` selector.
- [ ] **Step 4: Update `Shop.pack.test.tsx`.** Change `balanceShown` to `.shop-showcase .vp-amount`. Change the
  refused "Buy another" expectation to `Purchase failed. Please try again.`, because `'The shop is closed for now.'`
  is not a known text. Change any other changed selector the same way.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(frontend): shop rebuilt as the showcase split, greyed prices, readable cards`.

### Task 5: Shop look and motion (Fable)

**Files:**
- Modify: `frontend/src/styles/Shop.css` (rewrite against Task 4's markup; delete rules nothing uses any more)

**Interfaces:**
- Consumes: Task 4's markup contract, and Task 2's grid CSS variables (`--grid-columns`, `--grid-rows`,
  `--grid-card-width`, `--grid-card-scale`).

- [ ] **Step 1: Style it from the mockup.**
  - Full screen, with safe-area padding.
  - The showcase is leather on walnut with a brass edge. The table is `--felt-surface` with a brass inlay under each
    card.
  - The price tag is about 40px tall, sits on the art at top right, and shows coin, 5 and Buy. `.is-poor` uses grey
    leather, `--bone-dim` text and a greyscale coin.
  - The dial is a conic arc driven by `--p` with a hand; it ticks once a second.
  - The `.shop-turn` card turn uses rotateY out at 300 ms and in at 460 ms, staggered 90 and 120 ms per card.
  - The coin balance bumps when it changes. The "Purchased" stamp drops in.
  - The message strip slides down over the top of the table and is one line at 640.
  - The inside window has arrows either side, the meter, and the "Owned" chip.
  - Sizes at 640x360 and 844x390 follow the mockup's `.B.S` and `.B.L` rules. On bigger screens the showcase, pack and
    dial grow modestly. The table fills the rest and the grid lays out its rows.
  - Reduced motion turns every animation and transition off.
- [ ] **Step 2: Check** with `npm run check:tokens`, `npm run lint` and `npm test`. Expected: all pass.
- [ ] **Step 3: Commit** `feat(frontend): shop look and motion (direction B)`.

### Task 6: Readability check and owner screenshots (Opus; Fable fixes visual faults)

**Files:**
- Create: `frontend/scripts/shop-audit.mjs` (dev only, not shipped). It is a Playwright script that ports the
  mockup's `auditShop()`: it flags any text element whose `scrollWidth` or `scrollHeight` exceeds its box, and any two
  text boxes that overlap.

- [ ] **Step 1: Run locally** (backend and frontend dev). Use a test user with 23 coins, and again with 8 and 3.
  Audit the shop at 640x360, 844x390, 1366x768 and 1920x1080 for:
  - both sale pages
  - a bought hero
  - greyed tags with the message showing
  - a server error
  - every inside-window page, including the last
  - "all owned"
  Expected: no findings, apart from the coin bump while it is moving. Check that cards are at least 222px wide at
  the two phone sizes, that 1366x768 and up shows the sale 3 over 3, and that the Engineer card is fully readable.
- [ ] **Step 2: Fix any findings.** Visual faults go to Fable, logic faults to Opus. Re-run until clean.
- [ ] **Step 3: Check the bounds.** Run `npm run lint`, `npm test`, `npm run build` and `npm run check:tokens`.
  Expected: all pass. Confirm that `git diff main --stat` touches nothing under `backend/`.
- [ ] **Step 4: Screenshot for the owner** at the four sizes: the shop, greyed tags with the message, the inside
  window, and the pack opening over the new shop. Also take one shot with holo effects off and one with reduced motion
  on. Show the owner, fix what they ask for, and re-shoot. Deploy only on the owner's "go live" (`npm run deploy`,
  site only).
- [ ] **Step 5: Commit** `test(frontend): shop readability audit script`.
