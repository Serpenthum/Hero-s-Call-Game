# Redesign Step 4: Holographics and Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holographic cards (stored on the server, won from packs, shown to both players) and a new pack rule with a new code-drawn pack opening.

**Architecture:** A `holo_heroes` JSON column next to `available_heroes`. A pure `rollPack` function decides a pack's cards; the shop route saves it in one guarded update. `gameManager.js` stamps `holo: true` on hero copies when it builds a match's heroes from a player's collection, so the flag rides every emit. On the site, `HeroCard` already draws holo; a new `heroscall.holo` setting turns the effect off in one place, and a new `PackOpening` component replaces `PackOpeningAnimation`.

**Tech Stack:** Node (`node --test`, SQLite via `backend/sql/compat`), Cloudflare Durable Object; Vite + React + TypeScript (`vitest run src`); Playwright for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-21-redesign-step4-holo-packs-design.md` (step design) and `docs/superpowers/specs/2026-11-17-card-lobby-packs-redesign-design.md` parts 4 and 5 (rules and look). Visual source for the pack opening: `docs/superpowers/specs/2026-11-17-redesign-mockups/packs-and-binder.html` (round 2).

## Global Constraints

- Pack price coin 12; base cards 3; repeat refund coin 2 each; bonus holographic chance 20% (one roll per pack).
- Currency shown as the coin image plus a number, never the words "VP", "coins" or "victory points" in the interface.
- No change to rules, balance, the draft clock or matchmaking.
- AI players (tutorial bot) never holo. Starter heroes, existing collections, single-hero purchases and Gauntlet picks never become holo; only packs grant holo.
- The server ignores any client-sent `holo` flag; holo comes only from `users.holo_heroes`.
- Never stamp the shared templates in `this.heroes` / `getHeroes()`; stamp copies.
- Settings key `heroscall.holo` (`'off'` = off, anything else = on; default on).
- Reduced motion and "Battle animations: off" turn pack-opening flourishes into simple fades; cards still turn on tap.
- Models (owner's rule): Task 7 (pack opening look and motion) runs on Fable; every other task on Opus.
- Screens checked at 640x360, 844x390, 1440x900, and once with reduced motion.
- Nothing pushed, merged or deployed without the owner's "go live". Server deploy only when nobody is playing.
- Out of scope: the four step 3 leftovers, the shop page redesign (its own later step), binder (step 5), sound (step 6).

## Review Focus

1. **Double buy:** a fast double tap on Buy / "Buy another" while a request is in flight must charge once. (Task 6 test: second click while `purchasing` sends no request.)
2. **Owns everything, all holo:** pack gives 3 repeats, no bonus, coin back 6, balance -6 net. (Task 2 test.)
3. **One or two unowned left:** pack mixes `new` and `repeat`, never the same hero twice, bonus never one of the three. (Task 2 tests.)
4. **Mirror draft:** both players own Monk, only one as holo; each draft hand card shows the holo status of the collection it came from, on both screens. (Task 4 test in `mirror.test.js` or `draft.test.js`.)
5. **Reconnect mid-match:** `getFullGameState` after a reconnect still carries `holo` on the same heroes. (Task 4 test.)

---

### Task 1: Storage: `holo_heroes` column and user objects

**Files:**
- Modify: `backend/database.js` (`createTables`, `getUserById`, the login/user-by-name reads near lines 224-288, new `savePack`)
- Modify: `backend/gameServer.js` (user objects returned near lines 146, 248, 478: add `holo_heroes`)
- Test: `backend/test/holo.test.js` (new)

**Interfaces:**
- Produces: `user.holo_heroes: string[]` on every object from `getUserById` and on login / admin login / `/api/user/:id` responses.
- Produces: `database.savePack(userId, { cost, refund, addHeroes, addHolo }) -> Promise<{ success: true, newVP, available_heroes, holo_heroes } | { success: false, error }>`. One `UPDATE users SET victory_points = victory_points - ? + ?, available_heroes = ?, holo_heroes = ? WHERE id = ? AND victory_points >= ?`; `changes !== 1` → `{ success: false, error: 'Not enough to buy this.' }`. Any hero in `addHolo` is also added to `available_heroes`.

- [ ] **Step 1: Write failing tests** in `backend/test/holo.test.js` using `createTestDatabase` / `createUser` from `test/support/db.js`:
  - `new users start with no holographics`: `(await database.getUserById(id)).holo_heroes` deep-equals `[]`.
  - `the column is added to a database made before it existed`: create a raw node-driver DB with the old `users` schema (copy the CREATE TABLE without `holo_heroes`), insert a user, then construct `new Database(...)` on it, wait for `createTables` to finish, and assert `getUserById` returns `holo_heroes: []`.
  - `constructing the database twice does not fail`: second `new Database` on the same file logs no error and `holo_heroes` still reads.
  - `savePack spends, refunds and adds heroes and holographics together`: user with 20, `['Fighter']`; `savePack(id, { cost: 12, refund: 2, addHeroes: ['Bard'], addHolo: ['Monk'] })` → `newVP 10`, `available_heroes` contains Fighter, Bard, Monk, `holo_heroes` `['Monk']`.
  - `savePack refuses when the player cannot afford it`: user with 11 → `success false`, balance still 11.
- [ ] **Step 2: Run** `cd backend && node --test test/holo.test.js`. Expected: FAIL (no `holo_heroes`, no `savePack`).
- [ ] **Step 3: Implement.** Add `holo_heroes TEXT DEFAULT '[]'` to the `CREATE TABLE users` text, and after it run `ALTER TABLE users ADD COLUMN holo_heroes TEXT DEFAULT '[]'`, ignoring an error whose message contains `duplicate column` (log any other). It must run after the users table exists on both drivers (`sql/nodeDriver.js`, `worker/doSqlDriver.js`); check how `compat` serialises `run` calls and confirm on both. Parse `holo_heroes` alongside `available_heroes` wherever the user row is parsed. Add `savePack`. Add `holo_heroes` to the user objects in `gameServer.js`.
- [ ] **Step 4: Run** `node --test test/holo.test.js` then the full `npm test` in `backend`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(backend): holo_heroes column, savePack, holo on user objects`.

### Task 2: The pack rule

**Files:**
- Create: `backend/packs.js`
- Modify: `backend/shop.js` (`/purchase-pack`, router options)
- Test: `backend/test/packs.test.js` (new, pure rule), `backend/test/trust.test.js` (shop route section)

**Interfaces:**
- Consumes: `database.savePack` (Task 1).
- Produces: `rollPack({ heroes, owned, holo, random }) -> { cards: Array<{ name: string, kind: 'new'|'repeat'|'holo'|'holo_upgrade' }>, coinsBack: number }`. `heroes` is the full hero list (disabled ones ignored), `owned` and `holo` are name arrays, `random: () => number` in [0,1). Constants exported: `PACK_PRICE = 12`, `PACK_SIZE = 3`, `REPEAT_REFUND = 2`, `HOLO_CHANCE = 0.2`.
- Produces: `createShopRouter({ ..., random = Math.random })`.
- Produces (route response): `{ success, cards: Array<{ name, kind, hero }> (hero = the full template object), coinsSpent: 12, coinsBack, newVP, holo_heroes, available_heroes, heroCount, heroesReceived (names of cards with kind 'new' or 'holo'), message }`.

Algorithm (order of `random()` calls is fixed so tests are exact):
1. Fisher-Yates shuffle enabled unowned heroes with `random`; take up to 3 as `new`.
2. If fewer than 3, shuffle enabled owned heroes with `random` and fill the rest as `repeat`; `coinsBack = 2 × repeats`.
3. One `random() < 0.2` roll. On a hit, candidates = enabled heroes not in `holo` and not among the 3 base names; if any, pick `candidates[floor(random() × length)]`, kind `holo_upgrade` if owned else `holo`.

- [ ] **Step 1: Write failing tests** in `backend/test/packs.test.js` (small fixture of 6 enabled + 1 disabled hero; `seq(...values)` helper returning values in turn, then repeating the last):
  - `three different unowned heroes when enough are left` (owned none, `random` always 0.99 → 3 `new`, no bonus, `coinsBack 0`).
  - `the 20% roll adds a bonus fourth card` (`random` always 0 → 4 cards, last kind `holo`, its name not among the first 3).
  - `a roll of exactly 0.2 misses` (shuffle values then 0.2 → 3 cards).
  - `repeats fill the pack and give 2 back each` (owned 5 of 6 enabled → 1 `new` + 2 `repeat`, all different, `coinsBack 4`).
  - `a player who owns everything still gets three repeats` (`coinsBack 6`).
  - `bonus upgrades an owned plain hero` (owned all, holo none, hit → 4th kind `holo_upgrade`).
  - `bonus skips heroes already holographic` (holo = all but one non-base hero → bonus is that hero).
  - `no bonus when every hero is holographic` (holo = all enabled, hit → 3 cards).
  - `disabled heroes never appear`.
- [ ] **Step 2: Run** `node --test test/packs.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `rollPack` in `backend/packs.js`.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Write failing route tests** in `trust.test.js`'s `shop` describe (pass `random` into `createShopRouter`; give the test app a `random` the test can set):
  - `a pack response lists each card with its kind and full hero data` (`cards[i].hero.HP` defined, `coinsSpent 12`).
  - `a player who owns every hero can buy a pack` (was refused before; now 200, 3 `repeat`, balance `start - 12 + 6`).
  - `a bonus holographic is saved` (hit → `getUserById(...).holo_heroes` contains the 4th card; it is also in `available_heroes`).
  - `heroesReceived is still sent for old pages`.
  - Keep the existing "cannot spend another user's" and login tests passing.
- [ ] **Step 6: Run** `node --test test/trust.test.js`. Expected: new tests FAIL.
- [ ] **Step 7: Change `/purchase-pack`** to read the user, call `rollPack` with `getHeroes()`, `user.available_heroes`, `user.holo_heroes`, the injected `random`, then `database.savePack(userId, { cost: 12, refund: coinsBack, addHeroes: names of kind new, addHolo: names of holo/holo_upgrade })`, all inside the existing `runExclusive`. Remove the "All heroes already owned" refusal. Update the header comment.
- [ ] **Step 8: Run** full backend `npm test`. Expected: PASS.
- [ ] **Step 9: Commit** `feat(backend): new pack rule with repeats and a 1 in 5 bonus holographic`.

### Task 3: Favourite fix

**Files:**
- Modify: `backend/gameServer.js:548-560` (`/api/toggle-favorite-hero`)
- Modify: the frontend callers that send `userId` in the body (grep `toggle-favorite-hero` in `frontend/src`); they may keep sending it, the server ignores it.
- Test: `backend/test/trust.test.js`

- [ ] **Step 1: Write failing test** `toggling a favourite acts on the logged-in user, not the body's userId`: users A and B; A's token with body `{ userId: B, heroName: 'Fighter' }` → B's `favorite_heroes` unchanged, A's now contains Fighter. Use the harness the file already uses for `gameServer` routes (see how other `/api/...` trust tests build their app; if none covers `gameServer.js` routes, test through the exported router setup the same way `gameServer.test.js` does).
- [ ] **Step 2: Run** it. Expected: FAIL (B changed).
- [ ] **Step 3: Use `req.userId`**; require only `heroName` (400 `Hero name is required` if missing).
- [ ] **Step 4: Run** backend `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(backend): favourites change only the logged-in player's list`.

### Task 4: Holo in game state

**Files:**
- Modify: `backend/gameManager.js`: new `stampHolo`, `getOwnedHeroes` (~734), random mode (~858-884), `prepareSurvivalTeam` (~8471), `queueForGauntletTrial` (~8883) and `tryMatchGauntletPlayers` (~8944).
- Modify: `backend/gameServer.js:2723` (pass the player's holo list into `queueForGauntletTrial`).
- Test: `backend/test/holo.test.js` (game-state section), using `makeManager` from `test/support/battle.js` and real users from `test/support/db.js`.

**Interfaces:**
- Consumes: `user.holo_heroes` (Task 1).
- Produces: `stampHolo(heroes: object[], holoNames: string[]) -> object[]`, module-level in `gameManager.js`: returns copies, each `{ ...hero, holo: true }` if its name is in `holoNames`, else the copy with any `holo` property deleted.
- Produces: `getOwnedHeroes(userId)` returns stamped copies (draft pools come from it, so each hand card carries its collection owner's status).
- Produces: `queueForGauntletTrial(playerId, holoHeroes = [])`; the queue entry stores `holoHeroes`; teams from `buildGauntletTeam` are stamped with it in `tryMatchGauntletPlayers`.
- Every hero object a match holds for a player has `holo: true` or no `holo` key; the tutorial bot's never does.

- [ ] **Step 1: Write failing tests** (`describe('holo in game state')`):
  - `draft hands mark cards from the owner's holographics`: user A owns 6 heroes with Monk holo, user B owns 6 others with none; start a draft; the hand built from A's collection has Monk `holo: true`, others no `holo`; B's collection cards none.
  - `a mirror hero is holo only on the side whose owner has it holo` (Review Focus 4): both own Monk, only A holo; whichever hand holds A's Monk has it holo; the hand built from B's collection has no holo Monk.
  - `picked draft heroes keep their holo into battle`: finish picks; `getFullGameState(game)` team entry for Monk has `holo: true`.
  - `random mode teams are marked from each player's own collection`.
  - `survival teams are marked from the account, ignoring client flags`: `prepareSurvivalTeam(sock, [{ name: 'Monk', holo: true }, ...])` for a user with no holos → no `holo` on any returned hero; for a user with Monk holo → Monk `holo: true`.
  - `gauntlet teams are marked from the holo list given when queueing`.
  - `the tutorial bot is never holo` (user with every tutorial hero holo; bot team has no `holo`).
  - `templates are never stamped`: after all the above, no entry of `gm.heroes` has a `holo` key.
  - `holo survives a reconnect` (Review Focus 5): after a reconnect via the existing helpers in `reconnect.test.js`, `getFullGameState` still shows Monk `holo: true`.
  - `spectators see the same holo flags` (use the path `spectate.test.js` uses).
- [ ] **Step 2: Run** `node --test test/holo.test.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `getOwnedHeroes` loads the user once and returns `stampHolo(owned, user.holo_heroes)`. Random mode switches to `getOwnedHeroes` for both players (same filtering it does now). `prepareSurvivalTeam` stamps its result with `user.holo_heroes`. Gauntlet as in Interfaces; in `gameServer.js` look up the socket's user (`userSessions`) and pass `user.holo_heroes || []`. Confirm `resetHeroToOriginalState` keeps `holo` (JSON copy) and that the draft-pick path copies from the hand card, not the template; if it re-looks-up the template, carry `holo` across.
- [ ] **Step 4: Run** full backend `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): mark holographic heroes in every match from their owner's collection`.

### Task 5: Site: holo data, settings switch, holo on every screen

**Files:**
- Create: `frontend/src/holoSetting.ts`
- Modify: `frontend/src/components/HeroCard.tsx` (~932-935), `frontend/src/components/SettingsModal.tsx`, `frontend/src/components/BattlePhase.tsx` (HeroCards ~446, ~477), `frontend/src/components/SpectatorView.tsx`, `frontend/src/components/lobby/FeaturedHero.tsx`, `frontend/src/components/GameLobby.tsx:390`, `frontend/src/components/HeroCollection.tsx`, `frontend/src/components/SurvivalTeamBuilder.tsx`, the Gauntlet picker under `frontend/src/components/gauntlet/`, the frontend user type (where `favorite_heroes` is declared; add `holo_heroes?: string[]`)
- Test: `frontend/src/holoSetting.test.ts`, `frontend/src/components/HeroCard` test (existing file if any, else `HeroCard.holo.test.tsx`), `BattlePhase.focus.test.tsx` or a new BattlePhase test

**Interfaces:**
- Produces: `getHoloEffects(): boolean`, `setHoloEffects(on: boolean): void` (key `heroscall.holo`, stores `'on'`/`'off'`, try/catch around storage, default true).
- Produces: `HeroCard` adds `card-holo` only when `holo && getHoloEffects()`.
- Produces: `isHolo(user: { holo_heroes?: string[] } | null, name: string): boolean` in `holoSetting.ts` for own-collection screens.

- [ ] **Step 1: Write failing tests:**
  - `holo effects default on, and off after setHoloEffects(false)`.
  - `HeroCard hides the holo layers when holo effects are off` (render `holo` card with setting off → no `card-holo`; on → `card-holo`).
  - `battle board cards show holo from the game state` (BattlePhase with a team hero `holo: true` → that card has `card-holo`).
  - `the lobby holo count comes from holo_heroes` (`collectionSummary(..., ['Monk'])` holo count 1; was `null`).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/holoSetting.test.ts src/components`. Expected: FAIL.
- [ ] **Step 3: Implement.** Settings row "Show holographic effects" as a switch styled like the Sound effects switch, placed under "Battle animations". Pass `holo={!!hero.holo}` in BattlePhase and SpectatorView; pass `holo={isHolo(user, hero.name)}` on the own-collection screens listed above. Remove the `as { holo_heroes?... }` cast in `GameLobby.tsx`.
- [ ] **Step 4: Run** `npx vitest run src` and `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(frontend): holographic cards on every screen, with a switch to hide the effect`.

### Task 6: Shop: new pack flow and pack opening behaviour (plain look)

**Files:**
- Create: `frontend/src/components/packs/PackOpening.tsx`, `frontend/src/components/packs/packTypes.ts`, `frontend/src/styles/PackOpening.css` (minimal, functional layout only; Task 7 draws it)
- Modify: `frontend/src/components/Shop.tsx` (purchase handling ~214-286, pack tile ~403-440, contents modal ~442-480), `frontend/src/components/ui/DevScreens.tsx` (dev screen: 3 cards and 4 with a holo)
- Delete: `frontend/src/components/PackOpeningAnimation.tsx`, `frontend/src/styles/PackOpeningAnimation.css`
- Test: `frontend/src/components/packs/PackOpening.test.tsx`, `frontend/src/components/Shop.pack.test.tsx`

**Interfaces:**
- Consumes: route response from Task 2; `getHoloEffects` (Task 5); `useCardReader` / `reader.open` as used in `HeroCard`.
- Produces (`packTypes.ts`): `type PackCardKind = 'new' | 'repeat' | 'holo' | 'holo_upgrade'`; `interface PackCard { name: string; kind: PackCardKind; hero: Hero }`; `interface PackResult { cards: PackCard[]; coinsBack: number; newVP: number }`.
- Produces: `<PackOpening result={PackResult} price={12} canBuyAnother={boolean} buying={boolean} onBuyAnother={() => void} onDone={() => void} />`. Internal stages `'pack' | 'opening' | 'cards'`; `data-stage` attribute on the root, `data-turned="true|false"` and `data-kind` on each card, so Task 7 can style and tests can read state.

Exact copy: "Tap the pack to open it"; heading "A bonus fourth card!" when 4 cards (else "Your heroes"); labels "New hero", "Already owned · " + `<Coin />` + "+2", "Holographic!", "Upgraded to holographic!"; buttons "Turn all over", "Buy another" + `<Coin />` + "12", "Done". Pack tile text: "3 random heroes, and a 1 in 5 chance of a bonus holographic card." Contents modal subtitle: "3 heroes from this list, and a 1 in 5 chance of a bonus holographic card." When every hero is owned, the contents modal instead says "You own every hero. Packs give repeats (" + `<Coin />` + "+2 each) and a chance of a holographic card."

- [ ] **Step 1: Write failing tests** (`PackOpening.test.tsx`, motion off via `heroscall.animSpeed = 'off'` so stages advance on tap without timers):
  - `tapping the pack opens it and lays out three face-down cards`.
  - `a pack with a bonus shows four cards and the bonus heading`.
  - `tapping a card turns it and shows its label` (one test per kind, exact copy above).
  - `turn all over turns every card, holographic last` (record turn order through `data-turned` changes or an `onTurn` test hook; holo/holo_upgrade card turns last).
  - `tapping a turned card opens the large view`.
  - `buy another is disabled when canBuyAnother is false, and calls onBuyAnother once per click`.
  - `done calls onDone`.
  - In `Shop.pack.test.tsx` (mock `fetch`): `buying a pack uses the cards from the reply without fetching /api/heroes`; `a second click while buying sends no second request` (Review Focus 1); `the buy button is enabled when every hero is owned`; `buy another starts a new opening with the new cards and the new balance`.
- [ ] **Step 2: Run** `npx vitest run src/components/packs src/components/Shop.pack.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement `PackOpening`** with plain placeholders (pack image `pack1.png`, a CSS card back, `HeroCard` faces with `holo` for holo kinds), stage logic, turn-all order, reader, buttons; under motion off or reduced motion use fades only. **Implement Shop changes:** keep `purchasing` as the single lock for Buy and Buy another; on success set the `PackResult`, apply `newVP` at once, call `onPurchaseComplete` when the opening closes; drop the `/api/heroes` fetch from the purchase path; packs are buyable whenever balance ≥ 12; new copy. `canBuyAnother = balance >= 12 && !buying`.
- [ ] **Step 4: Run** `npx vitest run src` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): new pack flow with 3 or 4 cards, buy another, and new shop text`.

### Task 7 (Fable): Pack opening look and motion

**Files:**
- Modify: `frontend/src/styles/PackOpening.css`, `frontend/src/components/packs/PackOpening.tsx` (markup for visual layers only)
- May create: small visual components under `frontend/src/components/packs/` (sparks, light column, card back)

**Interfaces:**
- Consumes: Task 6's component, its props, its `data-stage` / `data-turned` / `data-kind` attributes and copy. Do not change props, stage logic, button behaviour or copy; Task 6's tests must still pass unchanged.

Look and timing from `packs-and-binder.html` round 2 and parent spec part 5: pack spins in from below and floats with a slow shine; tap → shake harder and glow brighter (~0.9 s), sparks, a **straight horizontal cut** left to right along a line of light across the top, top flies off, screen jolts, column of light, rest of pack drops away; cards launch one at a time, spin, land face down in a slightly fanned row; turning → white flash, gold sparks, label pops in; face-down holo glows with cycling rainbow; turning a holo takes over (others dim, card to centre and grows, trembles as glow speeds up, turns with rotating rays, jolt, rainbow sparks, large banner), then settles back. Holo pack: cut line, sparks and light column rainbow instead of gold. **No spinning light beams behind the pack.** Holo effects off (`getHoloEffects() === false`): rainbow light, sparks and face-down glow become gold; takeover, banner and label still play. Card faces use the live `HeroCard` (light panel), never the old `card.html` dark panel. Reduced motion / animations off: simple fades.

- [ ] **Step 1: Build the look** in the dev screen (`DevScreens.tsx`, 3-card and 4-card holo cases).
- [ ] **Step 2: Run** `npx vitest run src` and `npx tsc --noEmit`. Expected: PASS (Task 6 tests unchanged).
- [ ] **Step 3: Screenshots** with Playwright at 640x360, 844x390, 1440x900 of: pack landed, mid-cut, cards face down, holo takeover, all turned (3-card and 4-card), holo effects off, reduced motion. Save under `.superpowers/sdd/2026-11-21-redesign-step4-holo-packs/shots/`.
- [ ] **Step 4: Commit** `feat(frontend): draw and animate the pack opening`.

### Task 8: Check, show the owner, deploy on "go live"

- [ ] **Step 1:** Backend `npm test`, frontend `npx vitest run src`, `npx tsc --noEmit`, `npm run build`. All pass.
- [ ] **Step 2:** Run locally (backend + frontend dev). As a test user with 12+ coins: buy packs until a bonus appears (or temporarily seed a holo in the local DB), play a draft and a random match against a second local user, and screenshot at the three sizes: shop pack tile and contents text, the pack opening (from Task 7), a draft hand with a holo card, a battle board with a holo card on each side, the settings switch, holo effects off. Reduced motion once.
- [ ] **Step 3:** Show the owner the screenshots. Fix what he asks for, re-shoot.
- [ ] **Step 4 (only on the owner's "go live"):** agree a time when nobody is playing; `npm run deploy:server`, confirm `/api/user/:id` returns `holo_heroes` and a pack buy works on the live site's old page (`heroesReceived`); then `npm run deploy:site`. Tell the owner both are done.
- [ ] **Step 5:** Update `.superpowers/sdd/.../progress.md` and the redesign memory (step 4 live, shop redesign step next).
