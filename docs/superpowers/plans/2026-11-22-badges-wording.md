# Battle badges, helper text, card wording and rule fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix twelve rule bugs on the server (each test-first), rewrite every card text in one plain style, then replace the emoji status pills with round SVG badge tokens whose helper text opens by tap or hover on every device and is listed in the hero details view.

**Architecture:** Three steps in order. Step 1 changes only `backend/gameManager.js` (plus `backend/battleLog.js` where a fix touches it), one test per fix in a new `backend/test/rulefixes.test.js`. Step 2 changes card `description` strings in `backend/heros.json`, the Vanish server strings, and a few site strings. Step 3 adds one optional server field (`pendingTaunts` in the game state), a pure badge list function on the site, a Fable-drawn token component and sprite, and the wiring that replaces `renderStatusEffects` in `HeroCard.tsx`.

**Tech Stack:** Node backend (`node --test`, `npm test` in `backend/`, 286 tests today), React 18 + TypeScript + Vite frontend (Vitest, `npm test` in `frontend/`, 554 tests today), Cloudflare (`deploy:server`, `deploy:site` from the repo root).

**Spec:** `docs/superpowers/specs/2026-11-22-badges-wording-design.md` (approved; fixes a to l, every card text, every badge text). Mockup with the approved drawings: `docs/superpowers/specs/2026-11-22-badges-wording-mockup.html`. This plan does not repeat the spec's text tables; tasks copy from them verbatim.

**Ledger:** `.superpowers/sdd/2026-11-22-badges-wording/` (`progress.md`, `global-constraints.md`, task briefs and reports), as in earlier steps.

## Who does each task

| Task | Model |
|---|---|
| 1-8 rule fixes, 9-10 wording, 11-12 badge state and logic, 14-15 wiring, 17 review, 18 go live | Opus (`model: "opus"`) |
| 13 badge sprite, token component and helper bubble look; 16 details-panel badge list look | **Fable** (`model: "fable"`) |

Fable tasks only draw and style: they receive the class names and props from this plan and change no logic. Opus tasks write no SVG drawing and no visual CSS beyond layout-neutral hooks (a class name, `display: none` for the short/full switch is Fable's).

## Global Constraints

- No rule change beyond fixes a to l in the spec. No balance changes. No new heroes.
- No wording change that changes what a card does; every card and helper text says what the game does.
- Card text style (spec "The style the texts follow"): "Deal 1D6 damage."; the hero's own name then "it"; "enemy"/"ally"; "Focus", never "target"/"untargetable" in player-facing text; capital Focus, Taunt, Poison, Silence, Defense, Accuracy, HP, Turret, Totem, Beast, Med Bot; no semicolons; "Can't"; digits.
- The data unit stays `"Mechanical Turret"`; only text says "Turret".
- Match heroes by `id` (`"<playerIndex>-<heroIndex>"`), not `name`, in every new or touched server check (mirror matches: `backend/test/mirror.test.js`).
- Every new state field is optional. The new site must work against the old server and the old site against the new server for the minutes between deploys.
- Do not change the meaning of fields the live site reads: `statusEffects.untargetableAttacker` stays a hero **name** (the site compares it to `active.name` in `battle/focus.ts:115` and `BattlePhase.tsx:312`); add `untargetableAttackerId` beside it. `statusEffects.taunt.target` stays a name.
- Helper text never opens only by mouse. A tap on a token never Focuses, selects or opens the hero under it.
- Phone = the battle phone layout's query `@media (max-height: 500px)` (21 uses in `frontend/src/styles`); it shows the short form only.
- Colours only from `frontend/src/styles/tokens.css` (`npm run check:tokens` in `frontend/` must pass).
- Suites stay green after every task: `cd backend && npm test` (286 + new) and `cd frontend && npm test` (554 + new); `cd frontend && npm run lint` for site tasks.
- Server deploy only on the owner's "go live" and only when nobody is playing.

## Review Focus

1. **Mirror matches (same hero on both teams).** Every fix that names a source (Paladin taunt, Bribe, Health Link, Ride Down, Vanish attacker, Piercing Shot caster) must act on the right side. Test: Task 1 and Task 6 each add a mirror case.
2. **Deploy gap, old server + new site.** No `pendingTaunts`, no `untargetableAttackerId`: the badge list renders without "Taunt coming", Focus still works by name, nothing throws. Test in Task 12 (`getBadges` with an empty context) and Task 10 (focus without the id).
3. **Death and revive in one turn** (Angel revives, then the hero dies again; Bomber's Explosion kills the killer; Pyromancer's splash). Death handling runs once per death, never zero, never twice. Test in Task 3 (second death processes; first death is not processed twice: Hoarder gains the dice once per death).
4. **Fallen heroes and dead sources on the site.** A fallen hero shows no badges; an Arcane mark disappears while the Archer is dead and returns if Angel revives it; a Taunted badge whose taunter is dead is not shown. Test in Task 12.
5. **Taps on small cards and phones.** A token tap opens only the tip; the card does not Focus or open details; one tip open at a time; it closes on turn change and when its badge goes away. Test in Task 14.

---

## Step 1: rule fixes (server, Opus)

All tests go in `backend/test/rulefixes.test.js` (create in Task 1), one `describe` per fix, using `backend/test/support/battle.js`: `makeManager`, `startBattle(gm, teamA, teamB, { firstPlayer })`, `hero(game, playerIndex, name)`, `heroAt`, `setD20`, `setRandom`, `resetDice`, `select`. Standard setup as in `rules.test.js`: `beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); })`, `afterEach(resetDice)`, `attack = (pid, t) => { gm.selectTarget(pid, t); return gm.basicAttack(pid, t); }`. With `setRandom(0.5)` a 1D4 rolls 3, 1D6 rolls 4, 1D8 rolls 5. Line numbers are approximate (main b86095b); the spec's "For the builder" section names the functions.

Every task in this step: write the tests, run `node --test test/rulefixes.test.js` in `backend/` and see them FAIL for the stated reason, fix, run them to PASS, run `npm test` in `backend/` (all pass), commit.

### Task 1: Fix a, a dead Paladin's waiting taunt is dropped (Opus)

**Files:** Create `backend/test/rulefixes.test.js`. Modify `backend/gameManager.js`: `checkPaladinShieldOfFaith` (~4916-4930), the end-of-turn taunt apply (~5565-5625), `updatePassiveEffectsOnDeath` (~2340-2400).

**Interfaces:** Produces: each `game.pendingTaunts` entry gains `targetId: string` and `appliedById: string` (hero ids) beside the existing name fields. Task 11 sends these to the site.

- [ ] **Step 1: Tests**
  - `a dead Paladin's queued taunt never lands`: teams `['Fighter','Swordsman','Cleric']` vs `['Sorcerer','Paladin','Cleric']`; p0's Fighter damages Sorcerer (queues the taunt), then, in the same turn, kill Paladin through the engine's real death path (Paladin at 1 HP, hit by a splash that reaches it, e.g. Fighter's Cleave on the neighbour; the implementer picks the line-up that makes the splash reach Paladin), then `gm.endTurn('p0')`. Assert Fighter has no `statusEffects.taunt`, and `game.pendingTaunts` has no entry with `appliedById` of that Paladin. On Fighter's next turn: `gm.selectTarget` on Cleric succeeds, `basicAttack` and `useAbility` succeed.
  - `a taunt entry whose taunter is dead is skipped when applied` (set the Paladin dead after queueing without the death hook: `currentHP = 0` directly, then `endTurn`): no taunt applied.
  - `mirror: only the attacking side's hero is taunted` (both teams `['Fighter','Paladin','Cleric']`): the queued entry's `targetId` is p0's Fighter id and only that hero gets the taunt.
- [ ] **Step 2: Implement.** Queue with ids; in `updatePassiveEffectsOnDeath` remove entries with `appliedById === dead.id`; when applying, find target and taunter by id and skip when the taunter is dead.
- [ ] **Step 3: Commit** `fix(rules): a dead Paladin's queued taunt is dropped`

### Task 2: Fix b, Dark Pact stays after Warlock dies (Opus)

**Files:** Modify `backend/gameManager.js`: `applyPassiveEffects` (~1278, pass 1 skip of dead sources ~1298, battle-start buffs ~1517-1531), `checkHPConditions` (~4620). Test: `rulefixes.test.js`.

- [ ] **Step 1: Tests**
  - `Dark Pact survives a recount after Warlock dies`: Warlock's team `['Fighter','Warlock','Cleric']`; kill Warlock; then damage that Fighter below 10 HP (triggers the recount). Assert Fighter and Cleric still deal +1 damage (a fixed-dice hit from each does 1 more than the base roll; or assert their `passiveBuffs` contain the Dark Pact entry).
  - `the Dark Pact battle-start log line appears once`: after the recount, `game.battleLog` (or the log array the existing `battlelog.test.js` reads) holds exactly one Dark Pact battle-start entry.
- [ ] **Step 2: Implement.** Store battle-start (`permanent: true`) buffs once at battle start and re-add them on every recount whatever the source's state; log the battle-start entry only at battle start.
- [ ] **Step 3: Commit** `fix(rules): Dark Pact stays after Warlock dies and logs once`

### Task 3: Fix c, a hero revived and killed again in the same turn dies properly (Opus)

**Files:** Modify `backend/gameManager.js`: `processAngelResurrection` (~6760-6830), the `justResurrected` guards in `dealDamage` (~6692) and at ~2594, ~3940, ~4095, ~6330, the turn-end clear (~4713). Test: `rulefixes.test.js`.

**Interfaces:** Produces `statusEffects.reviveHandledDeath?: true` or an equivalent per-death mark (builder's call) that only the death that caused the revive carries. Later tasks (4, revive checks) use "`dealDamage` result says the target was revived by this hit"; expose that as `result.revived === true` on the `dealDamage` return value.

- [ ] **Step 1: Tests**
  - `a revived Shaman killed again loses its aura`: teams `['Brawler','Fighter','Hoarder']` vs `['Shaman','Angel','Champion']`; Shaman at 1 HP; Brawler's first attack kills it (Angel revives at half HP), set Shaman `currentHP = 1`, second attack kills it. Assert Shaman `currentHP <= 0`, Angel and Champion no longer have the Totemic Bond +1 Defense, p0's Hoarder `scalingBuffs.collectedDice` has exactly one more Shaman entry than it had after the first kill, and Champion's Last Stand counts one fallen ally.
  - `the death that caused the revive is not processed twice`: record Hoarder's Shaman entries after the first kill (today's count, 0 or 1); a later unrelated action in the same turn does not change it.
- [ ] **Step 2: Implement.** Mark the reviving death as handled instead of a turn-long `justResurrected` skip, so a later death runs `updatePassiveEffectsOnDeath`.
- [ ] **Step 3: Commit** `fix(rules): a hero revived and killed again in the same turn dies properly`

> Keep whatever the engine does today for the death that Angel reverses (Hoarder may or may not gain dice from it); the tests only require exactly one gain for the second death. Record today's count in the task report.

### Task 4: Fixes g and h, revive keeps no Ride Down and no second Arcane Shield (Opus)

**Files:** Modify `backend/gameManager.js`: Ride Down apply after the hit (~2584 basic attack, ~3465 ability, ~7676 commanded attack); revive `statusEffects` reset (~6811). Check `backend/battleLog.js` ~416 (Arcane Shield reaction). Test: `rulefixes.test.js`.

**Interfaces:** Consumes `dealDamage(...).revived` from Task 3.

- [ ] **Step 1: Tests**
  - `a hero revived after Cavalier's killing attack has no Ride Down`: Cavalier vs `['Wizard','Angel', ...]`, Wizard at 1 HP, Cavalier attacks: Wizard revived, `statusEffects.rideDownDebuff` undefined.
  - `same for Cavalier's ability` (Trample).
  - `a revived Wizard gets no second Arcane Shield`: Wizard blocks a hit of more than 5 (shield used), dies, Angel revives; then a 6-damage hit is not blocked (HP drops by 6); `statusEffects.arcaneShieldAvailable` is false; the battle log has no Arcane Shield reaction on the revive.
- [ ] **Step 2: Implement.** Skip applying Ride Down when the hit's result is `revived`; carry `arcaneShieldUsed` and `arcaneShieldAvailable: false` across the revive.
- [ ] **Step 3: Commit** `fix(rules): revived heroes carry no Ride Down and no second Arcane Shield`

### Task 5: Fixes d and e, Piercing Shot's -1 Defense ends properly (Opus)

**Files:** Modify `backend/gameManager.js`: `processCasterDurationEffects` (~4334-4370), `updatePassiveEffectsOnDeath`, `updateHeroDisplayStats` (1659). `backend/utils.js` ~419-437 (`statModifierDurations` countdown: confirm unused, remove if so). Test: `rulefixes.test.js`.

- [ ] **Step 1: Tests**
  - `Piercing Shot's -1 ends when Ranger dies`: Ranger hits an enemy with Piercing Shot (`modifiedDefense` drops by 1), Ranger is killed before its next turn: the enemy's `modifiedDefense` and the Defense used in rolls (`calculateEffectiveDefense`) are back to normal at once, and `statModifiers.defense` is gone.
  - `Piercing Shot's -1 ends at Ranger's next turn with no other action`: after Ranger's next turn starts, `modifiedDefense` is back to the base value.
  - `mirror: an enemy Ranger's death does not end our Ranger's -1` (both teams have Ranger).
- [ ] **Step 2: Implement.** On expiry and on the caster's death (match `statModifierCasterIds` to the dead hero's id), delete the modifier and call `updateHeroDisplayStats` for each hero touched.
- [ ] **Step 3: Commit** `fix(rules): Piercing Shot's -1 Defense ends on Ranger's turn or death and the shown Defense follows`

### Task 6: Fix i, Vanish once per round, enemy only, exception ends with the hitter's turn (Opus)

**Files:** Modify `backend/gameManager.js`: `processAfterDamageEffects` (~6438-6495), turn start clear (`processCasterDurationEffects` ~4324-4330), the end-of-turn path, the checks at ~2521, ~2812, ~4845, ~5273. Test: `rulefixes.test.js` (update `mirror.test.js` ~138 if it deletes `untargetableAttacker`).

**Interfaces:** Produces `statusEffects.untargetableAttackerId?: string` (checked by the server) beside the unchanged `untargetableAttacker` name (read by the live site); `statusEffects.vanishUsedThisRound?: boolean`.

- [ ] **Step 1: Tests**
  - `Vanish triggers once per round`: two enemies hit Ninja one after another (two turns before Ninja's next turn). After the first hit Ninja is `untargetable`; the second hit does not retrigger: `untargetableAttackerId` is not changed to the second attacker.
  - `the hitter may Focus Ninja only until its turn ends`: within the hitter's turn a second action on Ninja succeeds (use Brawler, two attacks); on the hitter's next turn (before Ninja's turn) `selectTarget` on Ninja fails.
  - `Vanish can trigger again after Ninja's next turn starts`.
  - `ally damage does not trigger Vanish`: Mech on Ninja's team uses Self Destruct; Ninja survives and is not `untargetable`.
  - `area abilities still hit a Vanished Ninja` (Wizard Fireball): Ninja loses HP.
  - `mirror: both teams have Ninja; only the hit Ninja vanishes`.
- [ ] **Step 2: Implement.** Require the attacker on the other team; set `vanishUsedThisRound` on trigger and clear it when Ninja's turn starts; store `untargetableAttackerId = attacker.id` and the name; at the end of the current turn delete both attacker fields (keep `untargetable` until Ninja's turn). All server checks compare by id.
- [ ] **Step 3: Commit** `fix(rules): Vanish triggers once per round on enemy damage; the hitter's exception ends with its turn`

### Task 7: Fix k, leftover badges go when their source dies (Opus)

**Files:** Modify `backend/gameManager.js` `updatePassiveEffectsOnDeath` (~2340-2400); Bribe set ~3805, Health Link ~3816. Test: `rulefixes.test.js`.

- [ ] **Step 1: Tests**
  - `Hoarder's death clears its Bribe`: Hoarder bribes an enemy, Hoarder dies: the enemy has no `cannotTargetWithAbility` (match `ownerId`).
  - `Angel's death clears its Health Link`: no `health_link` on the linked enemy (match the link's `sourceId`; add it when set if missing).
  - `Beast Tamer's death clears beast_active`.
  - `mirror: an enemy Hoarder's death does not clear our Hoarder's Bribe`.
- [ ] **Step 2: Implement** in `updatePassiveEffectsOnDeath`.
- [ ] **Step 3: Commit** `fix(rules): Bribe, Health Link and Beast end when their source dies`

### Task 8: Fixes j and l, healers heal the hurt ally with the fewest HP and clear Ride Down on full (Opus)

**Files:** Modify `backend/gameManager.js`: Druid Healing Word (~5338-5390), Medic Emergency Heal (~5440-5495), `resolveEffectTarget` case `lowest_health_ally` (~4130-4148), `getTargetsForEffect` case `lowest_health_ally` (~1637), the ability `heal` case (~3568) and the other full-heal spots (~3527-3735, ~5145). Test: `rulefixes.test.js`.

**Interfaces:** Produces in `gameManager.js`: `pickHurtAllyWithFewestHP(team: Hero[]): Hero | null` (alive and `currentHP < HP`; fewest `currentHP`; ties go to the earlier hero in team order; `null` when nobody is hurt) and `afterHeal(game, hero): void` (clears `rideDownDebuff` when `currentHP === HP`, then `checkHPConditions`). `resolveEffectTarget` returns `null` for `lowest_health_ally` when nobody is hurt, so the heal effect is skipped (the loop at ~3414 already `continue`s on `null`).

Owner's rule, word for word (spec fix l): the heal goes to the DAMAGED ally with the lowest current HP. A hero at full HP is never picked over a damaged one.

- [ ] **Step 1: Tests** (scenarios from spec fixes j, l1-l3; HP: Druid 17, Medic 16, Paladin 19, Warden 21, Cleric 20)
  - Owner's example, one test per healer: `Healing Word: a 5/5 ally is never picked over a 6/20 ally`, `Emergency Heal: ...` and `Divine Smite: ...`. Healer's team `[healer, 'Warden', 'Cleric']` with the healer full; set Warden `HP = 5, currentHP = 5` (full) and Cleric `currentHP = 6` (of 20). After the heal (Druid / Medic with `med_bot_count = 1` end their turn; Divine Smite hits): Cleric is 9, Warden still 5.
  - `Healing Word heals Druid when it has the fewest HP`: Druid's team `['Druid','Warden','Cleric']`, Druid 9, Warden 10, Cleric full; Druid ends its turn: Druid 12, Warden 10.
  - `Emergency Heal heals Medic when it has the fewest HP`: `['Medic','Warden','Cleric']`, `statusEffects.med_bot_count = 1`, Medic 6, Warden 7: Medic 9, Warden 7.
  - `Divine Smite heals Paladin when it has the fewest HP`: Paladin 5, Warden 10, Cleric full; Divine Smite hits: Paladin 8, Warden 10.
  - `Divine Smite with nobody hurt heals nobody`: whole team full; the enemy loses 3 HP; no result of `type: 'heal'` and no heal line in the log.
  - `ties go to the hero further left`: Druid's team with Warden 8 and Cleric 8 (Druid full): Warden is healed.
  - `Healing Word to full clears Ride Down` and `Emergency Heal to full clears Ride Down` (set `rideDownDebuff` by a Cavalier hit or directly, HP one below full).
- [ ] **Step 2: Run.** Expected: Druid, Paladin, nobody-hurt and the two Ride Down tests FAIL; the Medic and tie tests may already pass (they pin today's behaviour).
- [ ] **Step 3: Implement** the two helpers and use them in all five places.
- [ ] **Step 4: Commit** `fix(rules): healers heal the hurt ally with the fewest HP; every full heal clears Ride Down`

## Step 2: card wording (Opus)

### Task 9: Card texts and server Vanish strings (Opus)

**Files:** Modify `backend/heros.json` (`"description"` fields only; search by card name), `backend/gameManager.js` (`FOCUS_UNTARGETABLE` at 35, refusals ~2524 and ~2815, Vanish log ~6460), `backend/battleLog.js` (~378, ~418). Create `backend/test/cardtext.test.js`. Update any test asserting the old strings (`grep -rn "untargetable\|can't be targeted\|cannot be targeted" backend/test`).

- [ ] **Step 1: Tests in `cardtext.test.js`**
  - `every card text in the spec matches heros.json`: a table in the test of `[hero, card, text]` copied verbatim from the spec's two "New texts" tables (64 in play + the switched-off list) plus the 16 + 3 unchanged ones; for each, the `Ability[]`/`Special` entry with that `name` has exactly that `description`. Beast Tamer's row covers both abilities' cards as the spec shows.
  - `style rules hold for every description`: no `;`, no `\byou\b`, no `cannot`, no `untargetable`, no `\bhealth\b` (case-insensitive), no `to hit`; every `\d+D\d+` that is a damage roll is followed by ` damage` unless followed by ` for`, ` HP`, ` per`, `)` (heal and count forms); `D` is capital.
  - `Vanish strings say Focus`: `FOCUS_UNTARGETABLE` and the battle log reaction text contain `can't be Focused` and not `untargetable` / `targeted`.
- [ ] **Step 2: Run** `node --test test/cardtext.test.js` in `backend/`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy each text from the spec. Battle log reaction: `can't be Focused until its next turn`. Data names (`"Mechanical Turret"`, effect `target` values) unchanged.
- [ ] **Step 4: Run** `npm test` in `backend/`. Expected: all PASS.
- [ ] **Step 5: Commit** `content: card texts in one plain style; Vanish says "can't be Focused"`

### Task 10: Site strings (Opus)

**Files:** Modify `frontend/src/components/HowToPlayModal.tsx` (~68, poison: `Takes damage at the end of its turn.`), `frontend/src/components/SurvivalTeamBuilder.tsx` (~210-300 fallback texts: replace with the new texts from `heros.json` for the heroes listed there), `frontend/src/battle/focus.ts:115` (label `Can't be Focused`; when `untargetableAttackerId` is present compare it with the active hero's `id`, else the name as today), `frontend/src/components/BattlePhase.tsx:312` (same id-first rule), `frontend/src/types.ts` (`untargetableAttackerId?: string`). Tests: `frontend/src/battle/focus.test.ts`, any test asserting `Can't be targeted`.

- [ ] **Step 1: Tests** in `focus.test.ts`: `a Vanished enemy shows "Can't be Focused"`; `with untargetableAttackerId the matching active id may Focus`; `without untargetableAttackerId the name rule still works` (old server).
- [ ] **Step 2: Run** `npx vitest run src/battle/focus.test.ts` in `frontend/`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run lint` in `frontend/`. Expected: PASS.
- [ ] **Step 5: Commit** `content(site): poison timing, fallback card texts, "can't be Focused"`

## Step 3: badges and helper text (site)

### Task 11: Send pending taunts to the site (Opus)

**Files:** Modify `backend/gameManager.js` `getFullGameState` (6217). Modify `frontend/src/types.ts` (`GameState`). Test: `backend/test/rulefixes.test.js` (or a new `backend/test/badgestate.test.js`).

**Interfaces:** Produces `gameState.pendingTaunts?: Array<{ targetId: string; targetPlayerIndex: number; tauntTarget: string; appliedById: string }>` (empty array when none). Site type: `PendingTaunt` with the same fields, `GameState.pendingTaunts?: PendingTaunt[]`.

- [ ] **Step 1: Test** `game state lists a queued Shield of Faith taunt`: after p0's Fighter damages Paladin's neighbour, `gm.getFullGameState(game).pendingTaunts` has one entry with Fighter's id and `tauntTarget: 'Paladin'`; after `endTurn` it is empty.
- [ ] **Step 2: Run, implement, run** `npm test` in `backend/`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(state): send queued taunts to the site (optional field)`

### Task 12: Badge list logic (Opus)

**Files:** Create `frontend/src/battle/badges.ts`, `frontend/src/battle/badges.test.ts`.

**Interfaces:** Produces:
```ts
export type BadgeRim = 'buff' | 'debuff' | 'poison';
export type BadgeKey = 'turrets' | 'totems' | 'medBots' | 'beast' | 'bloodbath' | 'frenzy' | 'desperateBlows'
  | 'hidden' | 'arcaneShield' | 'windWall' | 'poison' | 'taunted' | 'tauntComing' | 'silenced' | 'stunned'
  | 'bribed' | 'guidingBolt' | 'rideDown' | 'healthLink' | 'defenseDown' | 'arcaneMark';
export interface Badge {
  key: BadgeKey;
  symbol: string;        // sprite id: 'i-golem', 'i-totem1'..'i-totem3', 'i-bot', ... (spec "Every badge")
  rim: BadgeRim;
  count?: string;        // corner number: '2', '+1', '-1'; absent for Totems, Beast, Hidden, ...
  dashed?: boolean;      // 'Taunt coming' only
  short: string;         // phone text
  full: string;          // full sentence
}
export interface BadgeContext {
  allies?: Hero[];       // the hero's own team
  enemies?: Hero[];      // the other team
  pendingTaunts?: PendingTaunt[];
}
export function getBadges(hero: Hero, ctx?: BadgeContext): Badge[];
```
Order: the spec table's order (buffs, then poison, then debuffs).

Sources (server fields): `turret_count` (max 2), `totem_count` (max 3, symbol `i-totem<count>`), `med_bot_count` (max 3), `beast_active`, `damageStacks`, `conditionalEffects.Frenzy`, `conditionalEffects['Desperate Blows']`, `untargetable`, `arcaneShieldAvailable`, `windWallAC.bonus`, `poison`, `taunt` (show only when the taunter in `enemies` is alive), `pendingTaunts` entry with `targetId === hero.id`, `silenced`, `disableAttack`, `cannotTargetWithAbility`, `grantAdvantage`, `rideDownDebuff`, `health_link`, `statModifiers.defense` from Piercing Shot, Arcane mark when an alive Arcane Archer in `enemies` has `hero.name` in its `damagedEnemies`. Texts: the spec's Short and Full columns verbatim, with `<Warden>`/`<Paladin>` and counts filled in; "1 more turn" / "2 more turns". Med Bots full text uses the bot count: "At the end of Medic's turn, the lowest-HP ally heals for <n>D4."

- [ ] **Step 1: Tests** (one per line, assert `key`, `symbol`, `rim`, `count`, `short`, `full` where named)
  - `a fallen hero has no badges` (even with poison and taunt set)
  - `Turrets 2/2 with count 2, golem symbol, buff rim`; full text names "each deals 1D4 damage"
  - `Totems: one head per Totem, no count` (count 1, 2, 3 → `i-totem1..3`)
  - `Poison 3: poison rim, count 3, "Takes 3 damage at the end of its turn."`
  - `Taunted: Warden, filled from statusEffects.taunt.target`; `no Taunted badge when the taunter is dead`
  - `Taunt coming from pendingTaunts by id, dashed, names the Paladin`; `none without pendingTaunts` (old server)
  - `Silenced 2 says "2 more turns"`; `Stunned 1 says "1 more turn"`
  - `Bribed has no turn count`
  - `Wind Wall +2 shows the total`
  - `Frenzy and Desperate Blows follow conditionalEffects`
  - `Arcane mark only while the Archer is alive`; `returns when the Archer is revived`
  - `Arcane Shield text says "more than 5"`
  - `no Inspired badge even if statusEffects.inspiration is set`
  - `getBadges(hero) with no context does not throw` and omits Taunt coming and Arcane mark
- [ ] **Step 2: Run** `npx vitest run src/battle/badges.test.ts` in `frontend/`. Expected: FAIL.
- [ ] **Step 3: Implement** `getBadges`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(badges): badge list from hero state, with short and full texts`

### Task 13: Badge sprite, token and helper bubble look (Fable)

**Files:** Create `frontend/src/components/badges/BadgeSprite.tsx` (one hidden `<svg>` holding every `<symbol>` copied from the mockup: `i-ashield i-blood i-blows i-bot i-bribe i-defdown i-exposed i-flame i-golem i-hidden i-link i-mark i-paw i-poison i-shoe i-silence i-stun i-taunt i-totem1 i-totem2 i-totem3 i-wind`), `frontend/src/components/badges/BadgeToken.tsx`, `frontend/src/styles/Badges.css`, `frontend/src/components/badges/BadgeToken.test.tsx`.

**Interfaces:**
- Consumes `Badge` from Task 12.
- Produces `BadgeSprite: React.FC` (render once per page; Task 14 mounts it in `BattlePhase`) and
  `BadgeToken: React.FC<{ badge: Badge; open: boolean; onToggle: () => void; onHoverChange?: (hovering: boolean) => void }>`.
  Markup: `<span class="badge-token badge-<rim>[ badge-dashed]" data-badge="<key>">` containing a `<button type="button" class="badge-token-btn" aria-expanded={open} aria-label="<short>. <full>">` with `<svg><use href="#<symbol>"/></svg>` and `<span class="badge-count">` when `count`; when `open`, a `<span role="tooltip" class="badge-tip">` with `<strong class="badge-tip-name">`, `<span class="badge-tip-short">` and `<span class="badge-tip-full">`. The button calls `onToggle` on click and `onHoverChange` on pointer enter/leave (mouse only). It does **not** stop propagation; Task 14 does.
- CSS hooks Fable owns: token size per card size (use the existing `@container` card-size queries in `HeroCard.css`), green/red/violet rims, dashed rim and faded picture for Taunt coming, corner number, bubble look and placement that stays inside the card's battle row, and the phone switch: under `@media (max-height: 500px)` hide `.badge-tip-full` and show `.badge-tip-short`; elsewhere show the name and `.badge-tip-full`.

- [ ] **Step 1: Tests:** `renders the symbol reference and rim class`; `shows the count only when given`; `Taunt coming has the dashed class`; `the button carries aria-label with short and full text`; `click calls onToggle`; `the tip renders only when open`.
- [ ] **Step 2: Run** `npx vitest run src/components/badges` in `frontend/`. Expected: FAIL, then implement, then PASS.
- [ ] **Step 3: Visual check:** a dev-only story in `frontend/src/components/ui/DevScreens.tsx` (or the existing `CardLayoutTest.tsx`) showing every badge on a card at 260px, 180px and 129px; screenshot with Playwright at 1280x800, 1024x768 (tablet) and 844x390 (sideways phone) and compare with the mockup.
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run check:tokens` in `frontend/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(badges): badge drawings, round token and helper bubble`

### Task 14: Tokens on the battle cards (Opus)

**Files:** Modify `frontend/src/components/HeroCard.tsx` (replace `renderStatusEffects` ~321-620 with a list of `BadgeToken`s from a new optional prop `badges?: Badge[]`, defaulting to `getBadges(hero)`), `frontend/src/components/BattlePhase.tsx` (build `BadgeContext` per card from both teams and `gameState.pendingTaunts`, pass `badges`; mount `BadgeSprite` once), create `frontend/src/components/badges/useBadgeTip.ts`. Remove: the old `.status-effect*` / `.status-tooltip-text` CSS in `frontend/src/App.css` (~119-375, also `.keyword.inspiration` ~393) and `frontend/src/styles/HeroCard.css` (~440-480, ~890-940) where only the old badges use it; `inspiration` in `types.ts` and `CardLayoutTest.tsx`. Tests: `frontend/src/components/HeroCard.test.tsx`, `frontend/src/components/badges/useBadgeTip.test.ts`, `BattlePhase.focus.test.tsx`.

**Interfaces:**
- Produces `useBadgeTip(resetKey: unknown): { openKey: BadgeKey | null; toggle(key: BadgeKey): void; hover(key: BadgeKey, on: boolean): void; close(): void }`: one tip open per card (and per page: opening one closes others, via a small module-level "current tip" so two cards cannot both be open); click or tap toggles and stays open until a click elsewhere; mouse hover opens and leaving closes unless it was clicked open; Escape closes; closes when `resetKey` changes (pass the current turn key) and when its badge is no longer in the list.
- Token taps: `onClick`, `onPointerDown`, `onPointerUp` on the token wrapper call `stopPropagation()` so the card's own tap (Focus, details, long-press reader) never fires.

- [ ] **Step 1: Tests**
  - `a poisoned hero shows one poison token and no emoji pill`
  - `tapping a token opens its tip and does not call onClick or onInspect`
  - `tapping another token closes the first`; `tapping outside closes it`; `Escape closes it`
  - `a hover opens and leaving closes`
  - `the tip closes when the turn changes` and `when its badge goes away`
  - `a fallen hero shows no tokens`
  - `tokens are reachable by Tab and have an accessible name`
  - `BattlePhase passes Taunt coming to the taunted hero's card from pendingTaunts`
  - existing HeroCard and BattlePhase tests updated where they looked for the old badge markup
- [ ] **Step 2: Run** `npx vitest run src/components/HeroCard.test.tsx src/components/badges` in `frontend/`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run check:tokens` in `frontend/`. Expected: PASS (554 + new).
- [ ] **Step 5: Commit** `feat(badges): round tokens with tap and hover helper text on battle cards`

### Task 15: Badge list in the hero details view (Opus)

**Files:** Modify `frontend/src/components/BattleDetailsPanel.tsx` (new optional prop `badges?: Badge[]`; renders `<ul class="badge-list">` of `<li class="badge-list-item">` with a non-interactive token picture (`<svg><use/></svg>` in `.badge-token badge-<rim>`), `<strong class="badge-list-short">` and `<span class="badge-list-full">`), `frontend/src/components/BattlePhase.tsx` (pass the same badges as the card). Test: `frontend/src/components/BattleDetailsPanel.test.tsx`.

- [ ] **Step 1: Tests:** `the details view lists every badge with short and full text`; `no list when the hero has no badges`; `a tap on the list still closes the panel as today` (the list is read-only).
- [ ] **Step 2: Run, implement, run** `npm test` and `npm run lint` in `frontend/`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(badges): hero details list every badge with its sentence`

### Task 16: Details-panel badge list look and final visual pass (Fable)

**Files:** Modify `frontend/src/styles/Badges.css` and/or `frontend/src/styles/BattleDetails.css` (look of `.badge-list`, `.badge-list-item`, `.badge-list-short`, `.badge-list-full`; token size in the list). No TSX changes except class names already given.

- [ ] **Step 1:** Style the list to match the mockup's details view; readable on a sideways phone (the panel grows over the board there).
- [ ] **Step 2:** Screenshots with Playwright of a local battle (backend `wrangler dev` in `backend/`, `npm run dev` in `frontend/`) at 1280x800, 1024x768 and 844x390 with poison, Taunted, Taunt coming, Turrets 2/2 and three Totems on screen; tip open on a phone (short form) and on a tablet (full sentence). Attach paths in the task report.
- [ ] **Step 3: Run** `npm test`, `npm run lint`, `npm run check:tokens` in `frontend/`. Expected: PASS.
- [ ] **Step 4: Commit** `style(badges): details-panel badge list`

### Task 17: Final whole-branch review (Opus)

- [ ] **Step 1:** Review `git diff b86095b..HEAD` against the spec: every fix a-l has its test; every card text matches the spec table; every badge appears and goes as the spec's "Shows / goes" column says; the Review Focus list above is covered; no `untargetableAttacker` meaning change; every new field optional.
- [ ] **Step 2: Run** `cd backend && npm test` and `cd frontend && npm test && npm run lint && npm run check:tokens && npm run build`. Expected: all PASS, build succeeds.
- [ ] **Step 3:** Fix findings (each with a test where it is a behaviour), re-run, commit `fix: final review findings`. Record parked minors in the ledger.

### Task 18: Owner check and go live (Opus). DO NOT EXECUTE WITHOUT THE OWNER SAYING "go live"

- [ ] **Step 1:** Local run for the owner (backend `npm run dev` in `backend/`, `npm run dev` in `frontend/` pointed at it). Give him a short check list: a dead Paladin's taunt, Vanish twice in a round, healers, poison token tap on a phone and a tablet, details list, a few card texts. Record his rulings in `.superpowers/sdd/2026-11-22-badges-wording/progress.md`.
- [ ] **Step 2:** Wait for the owner's "go live". Then confirm nobody is playing (no active battles) before touching the server.
- [ ] **Step 3:** From the repo root: `npm run deploy:server`. Poll `/api/user/1` until the new code answers, and wait about 4 minutes in all after the deploy.
- [ ] **Step 4:** `npm run deploy:site`.
- [ ] **Step 5:** Check one live battle start; merge `redesign-badges` to `main` only when the owner agrees (do not push without being asked).

## Old clients and the deploy gap

- New server, old site (during the gap, and anyone with a cached page): the old site ignores `pendingTaunts`, `untargetableAttackerId`, `vanishUsedThisRound`. It still reads `untargetableAttacker` as a name, which the server keeps writing, but after fix i the server clears it at the end of the hitter's turn: the old site then shows Ninja as blocked for that hitter, which is now correct. Old site badge text stays old until reload; card texts come from the server and update at once.
- New site, old server: no `pendingTaunts` (no Taunt coming badge), no `untargetableAttackerId` (focus falls back to the name). `getBadges` works with an empty context.
- No field is removed or renamed in the game state. `inspiration` is removed only from the site types.
