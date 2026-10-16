# UI Redesign Phase 5: Survival, Gauntlet and the Gauntlet backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Survival and the Gauntlet on the "table" design system, fix the Gauntlet so it works end to end (HP persists, roster is never corrupted, client and server speak one protocol), show it in the lobby, and delete `legacy-base.css`.

**Architecture:** Backend first, test-driven (`backend/test/gauntlet.test.js`, node:test, same helpers as `trust.test.js`). Survival keeps its components and layout; its five stylesheets go through `retoken-css.mjs` plus a hand-written `Survival.css` identity layer and an emoji/copy pass. The Gauntlet UI is rewritten (its current client emits `{type, data}` while the server reads flat `{action, heroIndex...}`, the offer Select/Reroll buttons have no handlers, the battle gets `playerId` from `players[0]`) as small components on tokens: `GauntletMode` (state machine and sockets), `TrialMap`, `RosterSheet`, `TeamSlots`, `CampPanel` (five choices), `OfferPanel` (offer, reroll, sacrifice, skip), `GauntletResults`. Old Gauntlet stylesheets and `GauntletPreparation.tsx` (unused) are deleted.

**Tech Stack:** Node 20 + node:test, React 18, plain CSS on `tokens.css`/`primitives.css`, `Icon`, `Coin`, `HeroCard`, Playwright MCP (two tabs = two players).

**Spec:** `docs/superpowers/specs/2026-10-15-ui-redesign-design.md` (Gauntlet backend work, phase 5). Earlier plans: phases 1 to 4 in `docs/superpowers/plans/`. Mechanics reference: `docs/GAME_ANALYSIS.md`.

## Global Constraints

- Colours, type, shape, motion, copy: as in the phase 4 plan (tokens only; IM Fell English titles, Alegreya Sans UI; sentence case; no emoji icons; 4px/8px radii; reduced motion respected; works from 320px).
- Currency: never named; `<Coin />` beside a number; no "VP", "victory points", "coins" in UI text or server messages. Field names (`victory_points`) stay.
- Hero cards (user rule): image as now, stats, ALL ability and special text. Gauntlet roster and team slots render the real `HeroCard`; its CSS is not edited.
- Gauntlet rules (user): PvP against other players in the same bracket; HP persists across trials; `buy_pack` is a fifth shop action; shown in the lobby; untimed.
- Brackets: trial 1 A; 2-4 B; 5-7 C; 8-10 D; 11-13 E. Roster of 6; team of 3; run ends with fewer than 3 usable heroes or after trial 13; skip trial only before trial 10; 3 rerolls per run; one camp action per trial; the free hero offer after each battle is separate from the camp action.
- Do not change hero stats or Survival rules. Backend changes are limited to the Gauntlet.
- Push straight to `main`; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `frontend/dist`; verification builds use `--outDir "$TEMP/hc-dist"`. Revert point: tag `ui-before-redesign`.
- Gates: backend `npm test` (104 pass today, must stay green and grow), `npm run check:tokens`, `node --test scripts/retoken-css.test.mjs`, `vite build`. `tsc --noEmit` has unrelated errors and is not a gate (check only that touched files add none).
- Gauntlet scenarios need two logged-in players in the same bracket (two Playwright tabs, Quick admin login). They write Gauntlet saves and rewards to the dev database; do not buy heroes or packs in the Shop.

## Review Focus

- Heroes that finish a battle at 4 HP start the next trial at 4 HP; Heal restores them (Task 1).
- Temp-resurrected heroes leave the roster after the battle without disturbing which heroes were on the team (Task 1).
- An offer never contains a hero already on the roster, and the server rejects a pick that was not offered (Task 2).
- Seeing the buy-pack offer does not use up the camp action; choosing a hero does (Task 3).
- A team with a repeated or out-of-range index is rejected (Task 1).
- Run end shows what was won with the coin and XP, once (Task 4, Task 9).
- Gauntlet at 390x844 and 667x375, roster of six with HP bars readable (Task 9).

---

### Task 1: Backend, HP persists and the roster stays sound

**Files:** modify `backend/gameManager.js` (`tryMatchGauntletPlayers`, `processGauntletPostBattle`, `setGauntletBattleTeam`); create `backend/test/gauntlet.test.js`.

- [ ] **Step 1: Write failing tests.** Helper: `makeManager(database)`, `gm.setUserSession`, `initializeGauntletRun('sock','Alice')` (see `trust.test.js` for `createUser`/database setup; for these tests `makeManager()` with no database works, then `availableHeroPool` is every hero). Tests:
  - `HP carries into the next trial`: set `run.roster[0].current_hp = 4`, `battle_team_indices = [0,1,2]`; two runs queued via `queueForGauntletTrial` for two sockets in the same bracket; the created game's team for socket one has `currentHP === 4` for that hero and full HP for the others.
  - `post-battle HP is saved from the heroes that fought`: call `processGauntletPostBattle('sock', true, teamUsed)` with a hero at 3 HP: roster instance `current_hp === 3` and `alive`; a hero at 0 is `alive === false` and in `dead_hero_ids`.
  - `temp resurrection removes only the revived hero`: roster of 6, indices `[0,5,3]`, hero 5 is temp-res; after post-battle the roster has 5 heroes, hero 5 is gone, heroes 0 and 3 kept their HP and `alive` state (today the splice shifts later indices).
  - `team indices must be three distinct whole roster slots`: `setGauntletBattleTeam('sock',[0,0,1])`, `[0,1,1.5]`, `[0,1,'2']`, `[0,1,9]` all fail; `[0,1,2]` succeeds.
- [ ] **Step 2: Run** `cd backend && node --test test/gauntlet.test.js`. Expected: the four tests fail.
- [ ] **Step 3: Implement.** In `tryMatchGauntletPlayers`, build each team with a helper `buildGauntletTeam(run)` that does `const hero = this.resetHeroToOriginalState(instance.heroData); hero.currentHP = Math.max(1, Math.min(instance.current_hp, hero.maxHP)); return hero;`. In `processGauntletPostBattle`, collect `toRemove = []` while iterating `battle_team_indices`, then after the loop remove those instances by identity (`runState.roster = runState.roster.filter(r => !toRemove.includes(r))`). In `setGauntletBattleTeam`, require `Array.isArray`, every entry `Number.isInteger`, in range, `new Set(teamIndices).size === 3`.
- [ ] **Step 4: Run** the new file and `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `fix(gauntlet): hero HP persists across trials, temp resurrection no longer shifts the team, teams reject duplicate slots`.

### Task 2: Backend, offers exclude the roster and are remembered

**Files:** modify `backend/gameManager.js` (`generateGauntletHeroOffer`, `gauntletShopBuyPack`, `completeGauntletHeroOffer`, `serializeGauntletRunState`, `processGauntletPostBattle`); modify `backend/server.js` (`checkGauntletGameCompletion`); extend `backend/test/gauntlet.test.js`.

- [ ] **Step 1: Write failing tests:**
  - `an offer never contains a hero already on the roster` (run it 50 times; roster names and offered names are disjoint, offer has 2 entries, no duplicates).
  - `the offer is remembered and only an offered hero can be taken`: `completeGauntletHeroOffer` with `{}` returns `action: 'show_offer'` and stores `run.pending_offer` (array of names); choosing a name outside it fails with `error` matching `/offered/`; choosing an offered name adds it and clears `pending_offer`.
  - `a full roster needs a sacrifice and a dead or already sacrificed slot is refused`: roster 6, choose offered hero without `sacrificeIndex` returns `action: 'need_sacrifice'` and keeps `pending_offer`; with a valid living `sacrificeIndex` the roster stays 6 and the sacrificed name is in `dead_hero_ids`.
  - `a reroll costs one of three and makes a new offer`: `useReroll: true` lowers `rerolls_remaining`; with 0 left it fails.
  - `after a battle the run holds the offer for the player`: `processGauntletPostBattle` sets `phase 'hero_offer'` and `pending_offer`; `serializeGauntletRunState` exposes it as `pending_offer` (hero templates, `{name, data}`) so a reloaded client can show it.
- [ ] **Step 2: Run.** Expected: failures.
- [ ] **Step 3: Implement.** `generateGauntletHeroOffer` excludes `runState.roster.map(r => r.hero_id)` as well as `dead_hero_ids`, stores `runState.pending_offer = names`, returns `{name, data}` entries (return `null` when fewer than 2 candidates). `gauntletShopBuyPack`: when `selectedHeroId` is given, require `runState.pending_offer?.includes(selectedHeroId)` else `{success:false, error:'That hero was not offered'}`; clear `pending_offer` after a successful add. `processGauntletPostBattle` generates the offer itself when the run continues and returns it as `heroOffer`; `server.js` stops calling `generateGauntletHeroOffer` and uses `winnerResult.heroOffer` / `loserResult.heroOffer`. `serializeGauntletRunState` adds `pending_offer` as described.
- [ ] **Step 4: Run** the file and `npm test`. **Step 5: Commit** `fix(gauntlet): offers exclude the roster and the server only accepts a hero it offered`.

### Task 3: Backend, one camp action, one protocol

**Files:** modify `backend/gameManager.js` (`performGauntletShopAction`, `queueForGauntletTrial`, `restoreGauntletRun`); modify `backend/server.js` (`gauntlet-shop-action`, `checkGauntletGameCompletion`, `announceGauntletPayout` wording); modify `frontend/src/types.ts` (Gauntlet types); extend tests.

- [ ] **Step 1: Write failing tests:**
  - `viewing the pack offer keeps the camp action`: `performGauntletShopAction('sock','buy_pack',{})` returns `action: 'show_offer'` and `shop_actions_remaining` is still 1; with `selectedHeroId` from the offer the action drops to 0.
  - `heal, temp_res and skip use the action; a second action is refused`.
  - `an unknown action or one with bad data fails without using the action` (`heroIndex: -1`, `heroId` of a living hero for `temp_res`).
  - `queueing is refused while queued or in battle`: second `queueForGauntletTrial` returns `error` ('Already in queue'); with `phase === 'battle'` it fails.
  - `a restored run keeps pending_offer empty and phase preparation` (existing behaviour, pinned).
- [ ] **Step 2: Run.** Expected: first test fails (action is consumed by `show_offer`).
- [ ] **Step 3: Implement.** `performGauntletShopAction`: only set `shop_actions_remaining = 0` when `result.success && result.action !== 'show_offer' && result.action !== 'need_sacrifice'`. `queueForGauntletTrial`: refuse when `runState.phase` is `queueing` or `battle`. In `server.js` the shop handler reads the flat fields (`action`, `heroIndex`, `heroId`, `selectedHeroId`, `sacrificeIndex`, `useReroll`) exactly as `types.ts` declares (`GauntletSocketEvents`); remove the nested `GauntletShopAction` shape from `types.ts` so there is one definition. Payout text: no amounts as words ("Run complete. Rewards paid.").
- [ ] **Step 4: Run** the file and `npm test`. **Step 5: Commit** `fix(gauntlet): showing an offer no longer uses the camp action; one shop-action protocol`.

### Task 4: Backend, results travel with the battle result

**Files:** modify `backend/server.js` (`checkGauntletGameCompletion`); extend `backend/test/gauntlet.test.js`.

- [ ] **Step 1: Write failing test** `a run that ends pays once and reports what it paid`: after `processGauntletPostBattle` returns `runEnded` for a run with `trials_won = 2`, `settleGauntletRun` returns `{xp > 0, victoryPoints > 0}` and a second `settleGauntletRun` returns zeros.
- [ ] **Step 2: Run.** Expected: it should already pass (pinning existing behaviour); if so, record it as a guard test.
- [ ] **Step 3: Implement** in `checkGauntletGameCompletion`: settle first, then emit `gauntlet-battle-complete` including `rewards: { xp, victoryPoints }` for a run that ended (field name stays `victoryPoints`), so the results screen shows them.
- [ ] **Step 4: Run** `npm test` (expect 104 + new). **Step 5: Update `docs/GAME_ANALYSIS.md`** (§Gauntlet rows and "Still open" item [C]: now fixed, add the new test file). **Step 6: Commit and push** `fix(gauntlet): results ride with the battle result; docs updated`.

### Task 5: Survival on the table

**Files:** `frontend/src/styles/SurvivalMode.css`, `SurvivalProgress.css`, `SurvivalTeamBuilder.css`, `SurvivalUsedHeroes.css`, `SurvivalBattleTransition.css` (retokenize); create `frontend/src/styles/Survival.css`; modify `frontend/src/components/Survival*.tsx` (emoji to `Icon`, sentence case, coin rule); modify `frontend/src/App.tsx` (import `Survival.css`); modify `frontend/scripts/check-tokens.mjs`.

- [ ] **Step 1:** `node scripts/retoken-css.mjs` on the five stylesheets; add them and `Survival.css` to MIGRATED.
- [ ] **Step 2:** Write `Survival.css` for the identity: the campaign ledger (sidebar in walnut with brass hairline, progress as numbered stops using display numerals, used heroes as struck-through names), the team builder as a roster sheet (leather rows, brass selected state), end modals in the Panels frame, buttons `survival-btn primary/secondary/danger` mapped to the shared brass, outline and ember styles.
- [ ] **Step 3:** Replace emoji and ALL CAPS copy in the Survival components; end modal shows the coin and number.
- [ ] **Step 4:** `npm run check:tokens`, `vite build`; look at the Survival screens at 1280x800 and 390x844 (enter Survival from the lobby; the admin test accounts own 21+ heroes). Fix anything unreadable in `Survival.css` only.
- [ ] **Step 5: Commit and push** `feat(ui): survival campaign ledger and roster sheet on the table palette`.

### Task 6: Gauntlet client core (state machine and protocol)

**Files:** rewrite `frontend/src/components/GauntletMode.tsx`; modify `frontend/src/types.ts`; delete `GauntletPreparation.tsx`, `GauntletContent.tsx`, `GauntletBattleTransition.tsx` and their stylesheets when replaced.

- [ ] **Step 1:** `GauntletMode` owns `runState`, `phase` (`camp | queueing | battle | offer | results`), `message`, `rewards`, and one socket effect that registers every `gauntlet-*` listener once and cleans up. It sends flat events (`gauntlet-shop-action {action, ...}`, `set-gauntlet-battle-team`, `queue-for-gauntlet-trial`, `complete-gauntlet-hero-offer`, `cancel-gauntlet-queue`, `abandon-gauntlet-run`, `save-and-return-to-lobby`). The player id for `BattlePhase` is `socket.id`, never `players[0]`. Server `pending_offer` on `runState` restores the offer screen after a reload.
- [ ] **Step 2:** Compose the screens from the components of Tasks 7 and 8; the phase-to-screen mapping is the single source of truth.
- [ ] **Step 3:** `vite build`; commit with Task 7 once the screen compiles.

### Task 7: Gauntlet camp screen (map, roster, team, camp choices)

**Files:** create `frontend/src/components/gauntlet/TrialMap.tsx`, `RosterSheet.tsx`, `TeamSlots.tsx`, `CampPanel.tsx`; create `frontend/src/styles/Gauntlet.css` (added to MIGRATED).

- [ ] **Step 1: TrialMap:** 13 stops in five brackets (A, B, C, D, E), the current stop highlighted, won stops marked, the bracket name shown; reads `current_trial`, `trials_won`.
- [ ] **Step 2: RosterSheet:** six slots of the real `HeroCard` with an HP bar under each (verdigris, ember when low), dead heroes dimmed with a skull icon label "Fallen", temp-resurrected marked "Returns for one battle". Heroes are chosen with a click (add to team); drag and drop is kept as a second way on desktop.
- [ ] **Step 3: TeamSlots:** three numbered slots (order is turn order), click a slot hero to remove, "Start trial N" is a primary button enabled at three heroes; while searching it shows "Looking for an opponent in bracket X" with the three-dot indicator and a cancel button.
- [ ] **Step 4: CampPanel:** five choices as buttons with icons and one-line descriptions: Heal a hero, Revive a fallen hero (one battle), Hire a hero (the pack offer, "2 heroes to choose from"), Skip this trial (disabled from trial 10), and the rerolls counter; picking Heal or Revive asks to click a hero in the roster (hint line, cancel). The free offer after a battle is not a camp choice.
- [ ] **Step 5:** `npm run check:tokens`, `vite build`; look at the camp at 1280x800 and 390x844 with a fresh run (start from the lobby once Task 10 un-hides it; during development enter via a dev-only `#screens/gauntlet` gallery route using sample state).
- [ ] **Step 6: Commit** `feat(ui): gauntlet camp screen on the table palette`.

### Task 8: Gauntlet offer and results

**Files:** create `frontend/src/components/gauntlet/OfferPanel.tsx`, `GauntletResults.tsx`.

- [ ] **Step 1: OfferPanel:** shows the two offered heroes as real `HeroCard`s with "Choose hero"; reroll button with count; "Keep my roster" skips (`complete-gauntlet-hero-offer {skip: true}` is NOT added; skipping just continues to the camp since the server leaves `phase` open); a full roster shows the roster and asks which living hero to let go ("Replace which hero?").
- [ ] **Step 2: GauntletResults:** a results scroll: trials won of 13, the bracket reached, the coin and number earned, XP earned, personal best; one button "Back to lobby".
- [ ] **Step 3:** Both built into `GauntletMode`; `vite build`; commit `feat(ui): gauntlet offer and results screens`.

### Task 9: Verify the Gauntlet with two players

- [ ] **Step 1:** Temporarily set `SHOW_GAUNTLET = true`. Two tabs, two admin accounts: start a run on each; check roster of six with HP bars, set teams, queue both, battle (bot interval auto-play helper), read the battle result for both, check HP persisted (Heal available for the hurt hero), check the offer for both (reroll, choose, sacrifice when full), take one camp action, play again; end a run by abandon and read the results scroll with coin and XP.
- [ ] **Step 2:** Same screens at 390x844 and 667x375.
- [ ] **Step 3:** Clean up: abandon or complete runs; no friendships created.

### Task 10: Un-hide Gauntlet, retire the legacy base, close out

- [ ] **Step 1:** `SHOW_GAUNTLET = true` in `GameLobby.tsx`; check the lobby placard row at 1280x800 and 390x844.
- [ ] **Step 2:** Retire `legacy-base.css`: grep each selector and variable it defines; move what is still used (`.modal-overlay`, fonts import) into `primitives.css`/`tokens.css`; delete the file and its import; `npm run check:tokens`, `vite build`, and a sweep through lobby, shop, profile, Survival and the gallery screens.
- [ ] **Step 3:** Add "Phase 5 complete" to the spec; push. Final: self-review the whole branch diff since `ui-before-redesign` for missed raw colours, emoji and the word "VP" in UI text.
