# Economy Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-hero packs at 20 coins, repeats that give shards, crafting in the binder, coins for every battle (losses too), levels without an end, and a tutorial worth 80 coins, so the collection takes about 40 battles to Survival and about 300 to all 40 heroes.

**Architecture:** Every number lives in two small rule modules: `backend/packs.js` (pack roll, craft price) and a new `backend/economy.js` (levels, battle coins and XP, quest, Survival and tutorial amounts). The database, shop router, game manager and game server call those functions, and a seeded simulation test plays them to check the pace. The site reads one new `shards` field on the account and shows it in the shop's pack opening and the binder, after the owner approves mockups.

**Tech Stack:** Node backend (`npm test` in `backend/` = `node --test "test/**/*.test.js"`), one `Database` class for the Cloudflare Durable Object and local SQLite; React 18 + TypeScript + Vite site (`npm test` = `vitest run src`, `npm run check:tokens`).

**Spec:** `docs/superpowers/specs/2026-11-23-economy-core-design.md` (the numbers table and pack outcome table are there; tasks repeat only the values they test).

## Global Constraints

- Branch `economy-core`, created from `redesign-badges` (the live code, not merged to main). Never commit the unrelated `frontend/src/components/lobby/ModeCards.tsx` or `frontend/src/styles/Lobby.css` changes.
- Nothing from the spec's Non-goals: no rotating quests, weekly quest, achievements, first-win or streak bonus, level road, titles, ranked, Survival entry fee, card backs, mastery.
- No reward changes a hero's stats or a battle's rules. Every enabled hero has the same pack chance and the same craft price. A holographic is never crafted.
- `SURVIVAL_UNLOCK_HEROES` stays 21 and looks only at heroes owned. Gauntlet payouts, Survival run XP, tie XP (10), quest XP (15) and friend rooms (XP only, no coins) are unchanged.
- Nothing is taken from an existing account; the only data change is a `shards` column, default 0.
- Every route needs a login token and acts only on the token's account; coin and shard spending is one guarded `UPDATE ... WHERE ... >= ?`, inside the shop's per-account `runExclusive`.
- Player-facing text says "coins" and "shards", never "VP", in plain English in the game's voice.
- Site colours only from `frontend/src/styles/tokens.css` (`npm run check:tokens` passes). Motion respects animation speed `off` (`getAnimSpeed()`, which also follows `prefers-reduced-motion`).
- Every new server field is optional to the site: `shards` missing means 0, a pack reply without `shardsGained` shows as today, a 404 from the craft route shows a message.
- Site tasks (12 onward) do not start until the owner approves the Task 11 mockups; the approved mockups then define layout and motion.
- **Model:** drawing and animation run on Fable, everything else (code, tests, reviews) on Opus, as labelled per task.
- Deploy only on the owner's "go live", the server only when nobody is playing (Task 18).

## Review Focus

1. **Old page, new server** (the minutes between deploys, or a tab left open): an old shop asks for `/rotation` and gets 404, so its sale grid is empty but packs still open; the pack reply still has `cards`, `coinsBack` and `heroesReceived`. Test in Task 4.
2. **New page, old server** (rollback or cached API): no `shards` field, a three-card pack reply, a 404 from craft. The binder shows 0 shards, the opening still works, Craft shows "Crafting isn't available right now." Tests in Tasks 12, 14 and 16.
3. **Double tap or two tabs crafting** with 100 shards: exactly one hero, never negative shards. Test in Task 4.
4. **Surrender or disconnect in the first turn**: the quitter gets no coins and no XP, the winner gets the surrender amount and win XP, the end screen shows +0 for the quitter without an error. Tests in Task 5.
5. **A level-20 account with XP piled up** (the old clamp left up to 475 XP): it logs in unchanged, then levels on as XP arrives; the XP bar shows 500 per level. Tests in Tasks 6 and 12.

---

### Task 1: One-card pack rule — Model: Opus

**Files:** Modify `backend/packs.js`; Test `backend/test/packs.test.js` (rewrite the `rollPack` cases).

**Interfaces:**
- Produces: `PACK_PRICE = 20`, `REPEAT_SHARDS = 10`, `HOLO_CHANCE = 0.1`, `CRAFT_PRICE = 100`; `PACK_SIZE` and `REPEAT_REFUND` are removed.
- Produces: `rollPack({ heroes, owned, holo, random }) -> { card: { name: string, kind: 'new' | 'repeat' | 'holo' | 'holo_upgrade', holo: boolean }, shards: number }`. Exactly two `random()` calls, in order: hero `enabled[Math.floor(random() * enabled.length)]`, then `random() < HOLO_CHANCE`. `card.holo` is the roll itself (drawn holographic or not).

- [ ] **Step 0:** `git switch -c economy-core redesign-badges`.
- [ ] **Step 1: Write the failing tests** (a `seq(...values)` random helper):
  - `exports the pack constants`: 20, 10, 0.1, 100; `PACK_SIZE` undefined.
  - `normal, not owned → new, 0 shards`; `normal, owned → repeat, 10 shards, holo false`.
  - `holo, not owned → holo, 0 shards`; `holo, owned plain → holo_upgrade, 0 shards`; `holo, already holo → repeat, 10 shards, holo true`.
  - `a roll of exactly 0.1 is not holographic`; `random is called exactly twice, hero first` (seq `[0.5, 0.05]` on 40 heroes gives index 20, holo).
  - `owned heroes can be drawn` (owns all 40: always repeat); `disabled heroes never appear` (1000 draws).
- [ ] **Step 2: Run** `node --test test/packs.test.js` in `backend/`. Expected: FAIL.
- [ ] **Step 3: Implement** `rollPack` and the constants; update the file's header comment.
- [ ] **Step 4: Run** the test. Expected: PASS (shop tests fail until Task 4; that is expected).
- [ ] **Step 5: Commit** `feat(packs): one fully random card, holo replaces it, repeats give shards`

### Task 2: Economy rule module — Model: Opus

**Files:** Create `backend/economy.js`, `backend/test/economy.test.js`.

**Interfaces (Produces):**
- `LEVEL_UP_COINS = 20`, `TUTORIAL_REWARD_COINS = 80`, `QUEST_COINS = 5`, `SURVIVAL_PRIZE = { 1: 2, 2: 4, 3: 7, 4: 10, 5: 15, 6: 20, 7: 27 }`.
- `xpForNextLevel(level: number) -> number` = `Math.min(level, 20) * 25`.
- `applyXP({ level, xp }, gain) -> { level, xp, levelsGained, coinsGained }` (carry-over loop, no cap, `coinsGained = levelsGained * LEVEL_UP_COINS`).
- `type Ending = 'win' | 'win_by_surrender' | 'loss' | 'quit_early' | 'tie'`; `endingFor({ reason, isWinner, ownHeroesDown }) -> Ending` where `reason` is `'victory' | 'surrender' | 'disconnect' | 'tie'`. A winner by surrender or disconnect gets `win_by_surrender`; a loser by surrender or disconnect with `ownHeroesDown === 0` gets `quit_early`.
- `battleCoins(mode: 'random' | 'draft', ending, heroesAlive) -> number`; `battleXP(ending) -> number` (win kinds 10, loss 5, tie 10, quit_early 0).

- [ ] **Step 1: Write the failing tests:**
  - `xpForNextLevel`: 1→25, 19→475, 20→500, 57→500.
  - `applyXP({level:1,xp:0}, 75)` → `{level:3, xp:0, levelsGained:2, coinsGained:40}`; `applyXP({level:20,xp:475}, 25)` → `{level:21, xp:0, levelsGained:1, coinsGained:20}`; `applyXP({level:20,xp:475}, 10)` → level 20, xp 485, 0 coins.
  - `battleCoins('random','win',1..3)` → 3,4,5; `('draft','win',1..3)` → 4,5,6; `win_by_surrender` → random 3, draft 4; `loss` 2 in both; `tie` 2; `quit_early` 0.
  - `endingFor`: surrender loser with 0 down → `quit_early`, with 1 down → `loss`; disconnect loser with 0 down → `quit_early`; disconnect winner → `win_by_surrender`.
  - `battleXP`: 10, 10, 5, 0, 10 for win, win_by_surrender, loss, quit_early, tie.
- [ ] **Step 2: Run** `node --test test/economy.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `economy.js` (CommonJS, like `packs.js`).
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(economy): level, battle, quest, survival and tutorial amounts in one module`

### Task 3: Shard balance in the database — Model: Opus

**Files:** Modify `backend/database.js` (users table, ALTER after the `holo_heroes` one, `createUser`, `authenticateUser`, `getUserById`, `savePack`, new `craftHero`, remove `purchaseHeroes`), `backend/gameServer.js` (register, login and `/api/user/:id` payloads, next to `holo_heroes`); Create `backend/test/shards.test.js`; Modify `backend/test/holo.test.js` (`savePack` cases).

**Interfaces (Produces):**
- Column `shards INTEGER DEFAULT 0`; every user object above carries `shards: number`.
- `savePack(userId, { cost = 0, shards = 0, addHeroes = [], addHolo = [] }) -> { success: true, newVP, shards, available_heroes, holo_heroes } | { success: false, error }` (`refund` removed; one guarded statement adds shards).
- `craftHero(userId, heroName, price) -> { success: true, shards, available_heroes } | { success: false, error: 'Not enough shards.' }`, guarded `WHERE id = ? AND shards >= ?`; adds to `available_heroes` only, never `holo_heroes`.

- [ ] **Step 1: Write the failing tests** in `shards.test.js` (pattern of `holo.test.js`):
  - `new users start with 0 shards`; `the column is added to a database made before it existed`; `constructing the database twice does not fail`.
  - `savePack spends 20 coins and adds 10 shards together`; `savePack refuses when the player cannot afford it` (shards unchanged).
  - `craftHero spends 100 shards and adds the hero, not a holographic`; `craftHero refuses with 99 shards`.
  - `register, login and /api/user/:id include shards` (through the router, as `holo.test.js` does).
- [ ] **Step 2: Run** `node --test test/shards.test.js test/holo.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): shard balance, packs that add shards, guarded crafting`

### Task 4: Shop routes: one-card pack, crafting, no sale heroes — Model: Opus

**Files:** Modify `backend/shop.js` (pack reply, new `POST /craft`, delete `/rotation`, `/purchase-hero`, `HERO_PRICE`, `currentRotation`), `backend/gameServer.js` (the shop comment at the `router.use('/api/shop', ...)` line); Test `backend/test/trust.test.js` (`describe('shop')`).

**Interfaces:**
- Consumes: `rollPack`, `PACK_PRICE`, `CRAFT_PRICE` (Task 1); `savePack`, `craftHero` (Task 3).
- Produces `POST /api/shop/purchase-pack` → `{ success, card: {...card, hero}, cards: [same], coinsSpent: 20, coinsBack: 0, shardsGained, shards, newVP, holo_heroes, available_heroes, heroCount, heroesReceived }` (`cards`, `coinsBack`, `heroesReceived` stay for old pages).
- Produces `POST /api/shop/craft` body `{ heroName }` → `{ success, heroName, hero, shards, available_heroes, heroCount }`; refusals 400: `Hero name is required`, `Hero not available` (unknown or disabled), `You already have this hero.`, `Not enough shards.`
- Module exports `{ createShopRouter, PACK_PRICE, CRAFT_PRICE }`.

- [ ] **Step 1: Write the failing tests** (replace the rotation and hero-purchase cases):
  - `every endpoint requires a login token` (purchase-pack, craft).
  - `buying a pack spends 20 coins and gives one card`; `a repeat gives 10 shards and no coins back`; `a pack needs 20 coins`.
  - `the pack reply keeps cards, coinsBack 0 and heroesReceived for old pages`.
  - `crafting spends 100 shards and the hero is owned`; one test per refusal above; `crafting ignores a holo flag in the body`.
  - `simultaneous crafts with 100 shards make exactly one hero` (two crafts of different heroes at once: one success, shards 0); keep `simultaneous purchases cannot overspend` for packs.
  - `the rotation and purchase-hero routes are gone` (both 404).
- [ ] **Step 2: Run** `node --test test/trust.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Craft reads the user inside `runExclusive`, checks hero (enabled), ownership, balance, then `craftHero`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS except the reward and tutorial tests Tasks 5-7 change.
- [ ] **Step 5: Commit** `feat(shop): one-card packs, crafting route, sale heroes removed`

### Task 5: Coins and XP for every battle — Model: Opus

**Files:** Modify `backend/gameManager.js` (`handleGameCompletion`, `handleSurvivalRunEnd`, new `getPayout`), `backend/gameServer.js` (`handleRegularGameCompletion`), `backend/database.js` (`updatePlayerStats` counts wins and losses only; XP moves to `battleXP`); Test `backend/test/rewards.test.js`, `backend/test/gameServer.test.js`.

**Interfaces:**
- Consumes: `endingFor`, `battleCoins`, `battleXP`, `SURVIVAL_PRIZE` (Task 2).
- Produces: `gameManager.getPayout(gameId) -> { endings: Record<playerId, Ending>, coins: Promise<Record<playerId, { coins: number, total: number | null }>> } | null`. `handleGameCompletion` fills `endings` synchronously (before its first `await`) for random, draft and friend-room games, then pays: each player `battleCoins(...)`, friend rooms 0, tie 2 each. Modes other than random and draft keep exactly today's path.
- Produces: `updatePlayerStats(userId, isWin) -> { winsAdded, lossesAdded }`.
- gameServer: XP per player = `battleXP(endings[id])`; after `await payout.coins`, each player (loser included) gets `victory-points-update` `{ oldVictoryPoints, newVictoryPoints, victoryPointsGained, totalVictoryPoints, pointsAwarded }` with the real amount (today's winner message hard-codes 1). A `quit_early` player gets no `xp-update` and a +0 coins update. Messages say "coins".

- [ ] **Step 1: Write the failing tests** in `rewards.test.js` (`describe('Battle coins')`, two mapped users as `finishedGame` does; update `repeated win checks do not pay again` to 5):
  - `random win with 3 alive pays the winner 5 and the loser 2`; `random win with 1 alive pays 3`; `draft win with 3 alive pays 6, loss 2`.
  - `random surrender after the loser lost a hero: winner 3, loser 2`; `draft surrender: winner 4`.
  - `surrender with no hero down: winner 3, quitter 0`; `disconnect forfeit with no hero down: winner 3, quitter 0` (via `finishDisconnectedGame`).
  - `a tie pays 2 each, once`; `a friend room pays no coins` (`game.roomName = 'r'`); `getPayout lists each player's ending`.
  - `a gauntlet-mode win pays what it paid before` (write and run this against the old code first, then keep it green).
  - `a perfect 7-win Survival run pays 27` (update the existing top-tier test).
  - In `gameServer.test.js`: `a player who surrenders at once gets no XP and no coins; the winner gets 10 XP and 3 coins` (two `loggedInClient`s in a random match).
- [ ] **Step 2: Run** `node --test test/rewards.test.js test/gameServer.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `ownHeroesDown` and `heroesAlive` come from `team.filter(h => h.currentHP <= 0)` / `> 0` at the end, as today.
- [ ] **Step 4: Run** `npm test`. Expected: PASS except Tasks 6-7 tests.
- [ ] **Step 5: Commit** `feat(rewards): every battle pays coins, quitting at once pays nothing, real amounts on the end screen`

### Task 6: Endless levels, level and quest coins — Model: Opus

**Files:** Modify `backend/database.js` (`updatePlayerXP`, `checkAndLevelUpPlayer` use `applyXP`; `getXPRequiredForLevel` returns `xpForNextLevel`; delete unused `calculateLevel`), `backend/quests.js` (`QUEST_REWARD = { xp: 15, vp: QUEST_COINS }`); Create `backend/test/levels.test.js`.

**Interfaces:** Consumes `applyXP`, `xpForNextLevel`, `QUEST_COINS` (Task 2). Both XP functions keep their return shapes (`vpGained` = `coinsGained`).

- [ ] **Step 1: Write the failing tests:**
  - `level 20 with 475 XP plus 25 reaches level 21 with 0 XP and 20 coins`.
  - `level 20 with 475 XP logs in unchanged` (`checkAndLevelUpPlayer`: `leveledUp` false, xp 475).
  - `level 25 with 1000 XP levels to 27 on login and gets 40 coins`.
  - `every level pays 20 coins` (level 1 + 75 XP → +40 coins).
  - `a finished quest pays 5 coins and 15 XP` (`QuestService.recordWin` with a fresh account).
  - `getXPRequiredForLevel(20) is 500`.
- [ ] **Step 2: Run** `node --test test/levels.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS except Task 7's test.
- [ ] **Step 5: Commit** `feat(levels): no level cap, 20 coins a level, 5 coins a quest`

### Task 7: Tutorial pays 80 coins — Model: Opus

**Files:** Modify `backend/gameServer.js` (`TUTORIAL_REWARD_VP` → `TUTORIAL_REWARD_COINS` from `economy.js`, including the no-account preview numbers); Test `backend/test/gameServer.test.js`.

- [ ] **Step 1: Write the failing test** `a new account that skips the tutorial lands at level 2 with 80 coins` (`loggedInClient`, `join-tutorial`, `tutorial-skip`, wait for `tutorial-skipped`: `newLevel` 2, `newVictoryPoints` 80; `/api/user/:id` agrees).
- [ ] **Step 2: Run** it. Expected: FAIL (100).
- [ ] **Step 3: Implement.** The top-up rule stays: `max(0, 80 - level-up coins)`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(tutorial): 80 coins in total`

### Task 8: Existing accounts carry over — Model: Opus

**Files:** Test `backend/test/gameServer.test.js`; no production code unless the test finds a fault.

- [ ] **Step 1: Write the test** `an account with all 40 heroes, 500 coins and level 20 loads unchanged, buys a pack and gains XP`: set the row directly (heroes, 3 holographics, 500 coins, level 20, xp 475); login returns those values and `shards: 0`; a pack costs 20 and gives 10 shards; 25 XP makes level 21.
- [ ] **Step 2: Run** it. Expected: PASS; if not, fix the cause and record it in the commit.
- [ ] **Step 3: Commit** `test: existing full collections carry over`

### Task 9: Pace simulation — Model: Opus

**Files:** Create `backend/test/economy.sim.test.js`.

**Interfaces:** Consumes `rollPack`, `PACK_PRICE`, `CRAFT_PRICE`, `REPEAT_SHARDS` (Task 1); `applyXP`, `battleCoins`, `battleXP`, `QUEST_COINS`, `TUTORIAL_REWARD_COINS` (Task 2); `QUEST_REWARD.xp` (`quests.js`); `GAUNTLET_STARTER_HEROES` (`database.js`, the new-account heroes); `backend/heros.json`. No copied numbers.

Model: 2,000 accounts, one seeded generator (mulberry32, seed `20261123`) for everything. Each account starts as the tutorial leaves it: level 2, 0 XP, `TUTORIAL_REWARD_COINS` coins, 0 shards, the starters, no holographics. Spend before the first battle and after every battle: buy packs while coins ≥ `PACK_PRICE` and not all owned, then craft any unowned hero while shards ≥ `CRAFT_PRICE`. A battle is Random: win with chance 0.5, heroes alive uniform 1-3, coins `battleCoins('random', ending, alive)`, XP `battleXP(ending)` through `applyXP` (level coins added). After every 6th battle, 2 quests: `2 × QUEST_COINS` coins and `2 × QUEST_REWARD.xp` XP. Record the battle count when owned first reaches 21 and 40.

- [ ] **Step 1: Write the test** `average player reaches Survival in 35-50 battles and the full collection in 250-350`: assert both means in band; print mean and 10th/90th percentile with `t.diagnostic`. Keep it under 5 seconds.
- [ ] **Step 2: Run** `node --test test/economy.sim.test.js`. Expected: PASS near 41 and 300.
- [ ] **Step 3:** If either mean misses its band, **stop**: change no number in the spec or the rule modules, and report the means and percentiles to the owner.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS. **Commit** `test: pace simulation through the real rules`

### Task 10: Server review — Model: Opus

- [ ] **Step 1:** Fresh reviewer reads the spec and `git diff redesign-badges..economy-core -- backend`; checks every number against the spec table and every spend path for a guard.
- [ ] **Step 2:** Fix findings with tests; commit `fix: server review findings`.

### Task 11: Mockups for approval — Model: Fable

**Files:** Create `docs/superpowers/specs/2026-11-23-economy-core-mockup.html` (one self-contained file, as `2026-11-21-redesign-step5-binder-mockup.html`); drafts under `.superpowers/brainstorm/`.

Contents, each framed at 844×390, 640×360 and desktop, colours copied from `tokens.css` under the same token names, with an "Animations off" switch that shows the end states without motion:
- (a) The shop without sale heroes: the pack, its 20-coin price, "See what's inside", the coin balance, the not-enough state.
- (b) The one-card pack opening: new hero; repeat with "+10 shards"; holographic new hero; holographic upgrade of an owned hero; holographic repeat with "+10 shards".
- (c) The binder with the shard balance at the top and a locked card's large view with "Craft" and the 100-shard price, in can-afford and cannot-afford states (disabled, shortfall shown, e.g. "40 more shards needed").
- (d) The crafting animation on the card, ending owned in its pocket.

- [ ] **Step 1:** Build the file; check each frame in a browser at the three sizes and with animations off.
- [ ] **Step 2:** Commit `docs: economy core mockups`, then show the owner.
- [ ] **Step 3:** **Stop until the owner approves.** Record his rulings at the top of the mockup file and commit. Tasks 12-17 follow the approved mockups for layout and motion.

### Task 12: Site data: shards, one-card pack type, endless XP — Model: Opus

**Files:** Modify `frontend/src/types.ts` (`shards?: number` on the user), `frontend/src/components/packs/packTypes.ts` (`PackResult { cards; coinsBack; newVP; shardsGained: number; shards?: number }`; `isHoloCard` uses `card.holo` when the server sent a boolean), `frontend/src/components/shop/shopRules.ts` (`PACK_PRICE = 20`; remove `HERO_PRICE`, `saleTimeLeft` and the rotation message), `frontend/src/useQuestReveal.ts` (export `xpForLevel`, `fromAbsoluteXP`; drop the `level < 20` limit), `frontend/src/components/XPBar.tsx` (comment only: 500 per level from 20, no cap); Create `frontend/src/useQuestReveal.test.ts`; Modify `frontend/src/components/shop/shopRules.test.ts`, `frontend/src/components/RewardsDisplay` test (create `RewardsDisplay.test.tsx`).

- [ ] **Step 1: Write the failing tests:** `fromAbsoluteXP goes past level 20` (absolute XP for level 22 → `{ level: 22, xp: 0 }`); `xpForLevel(20) and (30) are 500`; `PACK_PRICE is 20`; `a server card with holo false is not drawn holographic even if the hero is owned holo`; `a reply without holo flags falls back to today's rule`; `RewardsDisplay shows +2 coins for a loss and nothing for +0`.
- [ ] **Step 2: Run** `npx vitest run src/useQuestReveal.test.ts src/components/shop src/components/RewardsDisplay.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run check:tokens`. Expected: PASS (Shop tests fixed in Task 13).
- [ ] **Step 5: Commit** `feat(site): shards on the account, one-card pack type, endless XP`

### Task 13: Shop without sale heroes — Model: Opus

**Files:** Modify `frontend/src/components/Shop.tsx`, `frontend/src/styles/Shop.css`, `frontend/src/components/ui/DevScreens.tsx` (drop the rotation stub); Test `frontend/src/components/Shop.test.tsx`, `Shop.pack.test.tsx`.

Remove the sale grid, price tags, "Next sale in" dial, pager, `fetchShopRotation`, `handlePurchaseHero`, `TURN_MS`. Layout per mockup (a). `setPackResult` carries `shardsGained: data.shardsGained ?? 0`.

- [ ] **Step 1: Write the failing tests:** `the shop asks the server only for a pack` (no `/rotation` fetch); `no sale heroes, dial or pager render`; `the pack button greys below 20 coins`; `a pack reply without shardsGained still opens`; keep the not-enough and server-error message tests.
- [ ] **Step 2: Run** `npx vitest run src/components/Shop`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run check:tokens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shop): packs only, new layout`

### Task 14: One-card pack opening logic — Model: Opus

**Files:** Modify `frontend/src/components/packs/PackOpening.tsx`; Test `PackOpening.test.tsx`.

- [ ] **Step 1: Write the failing tests:** `one card shows one card`; `a repeat says "+10 shards"`; `a holo upgrade says it is now holographic and shows no shards`; `a holographic repeat shows holo and "+10 shards"`; `a three-card reply from an old server still shows all three`.
- [ ] **Step 2: Run** `npx vitest run src/components/packs`. Expected: FAIL.
- [ ] **Step 3: Implement** the one-card flow and text; remove the "bonus fourth card" heading. Keep today's motion untouched.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(packs): one-card opening with shards`

### Task 15: One-card reveal and shard motion — Model: Fable

**Files:** Modify `PackOpening.tsx` (motion only), `frontend/src/styles/` pack-opening CSS; Test `PackOpening.motion.test.tsx`.

- [ ] **Step 1: Write the failing tests:** `the single card reveals with the approved timing`; `the shard gain counts up on a repeat`; `animation off shows the end state at once`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the reveal and shard-gain motion per mockup (b), colours from tokens.
- [ ] **Step 4: Run** `npm test`, `npm run check:tokens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(packs): one-card reveal and shard motion`

### Task 16: Binder shard balance and Craft button — Model: Opus

**Files:** Create `frontend/src/components/binder/craftRules.ts` (+ `craftRules.test.ts`); Modify `useBinderData.ts`, `BinderLargeView.tsx`, `BinderBook.tsx` (shard balance at the top per mockup (c)); Test `binder/Binder.test.tsx`, `useBinderData.test.tsx`.

**Interfaces (Produces):**
- `CRAFT_PRICE = 100`; `craftState(shards: number, owned: boolean) -> { canCraft: boolean; shortfall: number }`.
- `useBinderData` returns `shards: number` (from `/api/user/:id`, missing → 0) and `craft(name: string): Promise<{ ok: true } | { ok: false; message: string }>` (POST `/api/shop/craft`; on success updates `owned` and `shards` from the reply; 404 or network → "Crafting isn't available right now.").
- `BinderLargeView` new props: `shards: number`, `onCraft: (name) => Promise<...>`, `crafting: boolean`.

- [ ] **Step 1: Write the failing tests:** `craftState(100,false)` can craft, `(60,false)` shortfall 40, `(500,true)` cannot; `the binder shows the shard balance`; `a locked card's large view shows Craft with 100 shards`; `with 60 shards Craft is disabled and says 40 more are needed`; `crafting makes the pocket owned and lowers the balance`; `a refusal shows the server's message`; `a 404 shows "Crafting isn't available right now."`; `no shards field shows 0`; `a second tap while crafting sends nothing`.
- [ ] **Step 2: Run** `npx vitest run src/components/binder`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run check:tokens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(binder): shard balance and crafting`

### Task 17: Crafting animation — Model: Fable

**Files:** Modify `BinderLargeView.tsx` / `BinderPage.tsx` and binder CSS; Test `binder/Binder.test.tsx`.

- [ ] **Step 1: Write the failing tests:** `crafting plays the craft animation, then the card is owned`; `animation off makes it owned at once`; `a failed craft plays no animation`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the motion per mockup (d), colours from tokens.
- [ ] **Step 4: Run** `npm test`, `npm run check:tokens`, `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(binder): crafting animation`

### Task 18: Whole-branch review, local check, go-live — Model: Opus

- [ ] **Step 1:** Fresh reviewer on the whole branch against the spec; fix findings with tests.
- [ ] **Step 2:** Run backend and site locally. Self-check: tutorial ends at level 2 with 80 coins, 4 packs, a repeat gives shards, craft from the binder, a loss shows +2 coins, a quick surrender shows nothing gained, the shop and binder at 844×390 and 640×360 and with animations off. Give the owner the local URL and the same list.
- [ ] **Step 3:** **Wait for the owner's "go live".** Then, when nobody is playing: `npm run deploy:server`, poll `/api/user/1` until its user carries `shards`, then at once `npm run deploy:site`. Server first because the new site needs the craft route and shard fields, and an old page on the new server only loses its (removed) sale grid.
- [ ] **Step 4:** After go-live, a live check on a phone: buy a pack, open the binder, finish one battle. Report to the owner.
