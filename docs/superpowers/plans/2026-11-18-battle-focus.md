# Battle Focus and Card Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In battle, tapping a card shows its details in a panel over the left column, and Focus on an enemy is the
mandatory first action of every turn, enforced by the server and visible to both players and spectators (switchable
until the first action, then locked; a fallen focus loses damaging actions but not non-damaging ones; a revived focus
works again).

**Architecture:** The server stays the source of truth: a new pure `backend/abilityTargeting.js` classifies each
ability (kind enemy / self / all; damaging or not); `gameManager` requires a focus for every action, adds
`focusLocked`, and sends `activeHero.abilityTargeting` in the game state, which already carries every player's
`selectedTarget` to the whole room. The client adds a pure `frontend/src/battle/focus.ts` (gates, labels, Focus button
state, whose focus to draw), a `BattleDetailsPanel` portalled into a slot in the left column, and rewires the action
bar and the tutorial.

**Tech Stack:** Node (CommonJS, `node:test`) backend; React 18 + TypeScript + Vite, vitest (node env,
`renderToStaticMarkup`, no DOM), plain CSS with tokens. Playwright (MCP browser tools) for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-18-battle-focus-design.md`

## Global Constraints

- Branch `redesign-card-lobby-packs` in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`. Commit per task; never push; never deploy without the owner's OK.
- Models: tasks marked **[Fable]** are drawing/animation and run on Fable; all others on Opus. Layout and CSS are not drawing.
- Raw colours only in `frontend/src/styles/tokens.css`; every new stylesheet goes in `MIGRATED` in `frontend/scripts/check-tokens.mjs`; `npm run check:tokens` passes.
- No CSS `zoom`. Short-screen rules go in the commented `@media (max-height: 500px)` block at the end of each stylesheet.
- Text in the details panel and Actions sidebar is never under 12px; every control is a 40px tap target on a sideways phone.
- The disconnect/reconnect behaviour that just landed must keep working: `backend/test/reconnect.test.js` passes unchanged; a reloaded tab mid-turn sees its focus and lock.
- Focus is only ever on an enemy of the active hero. There is no ally focus anywhere (no `side` parameter).
- Start-of-turn and passive specials keep running before focus, exactly as today.
- Exact copy: "Focus an enemy first", "Focus <Name>", "Focused", "Focus locked", "Taunted: focus <Name>", "Can't be targeted", "Attack <Name>", "<Ability> on <Name>", "<Name> has fallen". Existing suffixes ("(Used)", "(Silenced)", "(Stunned)", "(1/2)", "(Bribed)") still append.
- Deploy order when the owner approves: server first, then site. The client treats a missing `abilityTargeting` entry as `{ kind: 'enemy', damaging: true }`.
- Commands: backend `cd backend && npm test`; frontend `cd frontend && npm test && npm run build && npm run check:tokens`.

## Review Focus

The owner's four answers are pinned by named tests: no action before focus (Task 1 `every action needs a focus`,
Task 4 render tests), opponent and spectators see the focus (Task 1 `game state carries focus`, Task 4 `opponent and
spectator see the marker`), revived hero stays focused (Task 1 `a revived focus is still focused`), Wildshape after
the focus died (Task 1 `non-damaging actions survive a fallen focus`, Task 4 fallen render test). Beyond those:

1. **Mirror match** (both teams field Warlock): the marker lands on the defending side's Warlock for every viewer, never the attacker's own. Tests: Task 2 `readFocus looks only at the defender`; Task 4 opponent-view render test with a mirror team.
2. **No focusable enemy** (every living enemy untargetable after Vanish, or the taunter is the only option): Focus is refused, so the hero can only End Turn and auto end-turn applies. Tests: Task 1 `untargetable enemies cannot be focused` and `no focusable enemy leaves no actions`.
3. **Reload mid-turn after acting**: the reconnected tab still shows the focus, the marker and the lock. Test: Task 1 `focus lock survives rekeyPlayer`; Task 7 Step 3.
4. **Taunted hero taps a non-taunter**: Focus is disabled with "Taunted: focus Paladin"; the server still forces the taunter. Tests: Task 2 `focusButtonState` taunt case; existing `mirror.test.js` taunt test keeps passing.
5. **Choosing Chrono Shift's ally**: after a live focus, pressing Chrono Shift still enters the ally-pick sub-step, where a tap on an ally picks it instead of opening the panel. Tests: Task 4 `Chrono Shift on Warlock` render test; the tap itself is a Task 7 Step 3 check (no DOM in vitest).

---

### Task 1: Server focus rules and ability classification

**Files:**
- Create: `backend/abilityTargeting.js`
- Modify: `backend/gameManager.js` (`selectTarget` ~4749, `basicAttack` ~2424, `useAbility` ~2666, `useTimekeeperSelectedAbility` ~2937, `activateSpecial` ~4911, turn resets ~4694-4710 and ~5419-5441, `hasNoActionsLeft` ~5156, `getFullGameState` ~6103)
- Test: `backend/test/focus.test.js`

**Interfaces:**
- Produces:
  - From `backend/abilityTargeting.js`: `classifyAbility(ability, caster) -> { kind: 'enemy'|'self'|'all', damaging: boolean }` (rule exactly as in the spec's "Ability classification" paragraph) and `specialDamaging(special) -> boolean` (`category === 'activated_aoe'`).
  - `gameManager.selectTarget(playerId, targetId)` (signature unchanged). New refusals: `'Focus is locked for this turn'` when `player.focusLocked`; `"Can't be targeted"` when the enemy is untargetable and its `untargetableAttacker` is not the active hero. Taunt forcing unchanged.
  - `player.focusLocked: boolean`: set true after any successful `basicAttack`, `useAbility`, `useTimekeeperSelectedAbility`, `activateSpecial`; reset to false wherever `selectedTarget = null` is reset at turn change.
  - `gameManager.focusedHero(game, player) -> hero | null` (looks only in the opponent's team) and `gameManager.isFocusFallen(game, player) -> boolean` (focus set and that hero's `currentHP <= 0`). A hero revived by Angel has `currentHP > 0`, so it is simply focused again; nothing clears `selectedTarget` on death.
  - `getFullGameState`: `players[i].focusLocked`; `activeHero.abilityTargeting: Array<{kind, damaging}>` (one per ability of the active hero, in order). `players[i].selectedTarget` is already sent and broadcast with `target-selected` to the game room, which spectators join.
- Every action: no focus → `'Focus an enemy first'` (attack, every ability kind, Chrono Shift pick, activated specials). Focus fallen and the action is damaging (attack; `classifyAbility(...).damaging`; Chrono Shift; `specialDamaging`) → `'Your focused target has fallen'`. Otherwise, by kind: **self**: primary target = caster, skip taunt/untargetable checks; **all**: AoE path as today; **enemy**: as today but looked up only in the opponent's team. The Bribe check uses the focus. `hasNoActionsLeft`: true also when no focus is set and no living enemy can be focused, and when the focus has fallen and only damaging actions remain. Keep `canHeroAttack(player, hero)` / `canHeroUseAbility(player, hero)` signatures (the tutorial bot calls them).

- [ ] **Step 1: Write the failing tests** in `backend/test/focus.test.js` using `makeManager, startBattle, hero, setD20, setRandom, resetDice, select` from `./support/battle` (`beforeEach`: `setD20(15); setRandom(0.5)`; `afterEach(resetDice)`). Enemy team unless stated: `['Warlock', 'Shroomguard', 'Plague Spreader']`. "Kill the focus" = `hero(game,1,'Warlock').currentHP = 1; setD20(20); select(gm,'p0','Warlock'); gm.basicAttack('p0','Warlock')`.

```js
test('classifyAbility matches the design table', () => {
  // { kind: 'self', damaging: false }: Druid/Wildshape, Champion/Inspiring Crowd, Berserker/Bloodbath,
  //   Engineer/Call Turret, Medic/Med Bots, Beast Tamer with statusEffects.beast_active falsy
  // { kind: 'all', damaging: true }: Wizard/Fireball, Bomber/Bomb Toss
  // Beast Tamer with beast_active: { kind: 'enemy', damaging: true }
  // every other ability of every hero not disabled: { kind: 'enemy', damaging: true }
  // specialDamaging: Mech Self Destruct true, Diplomat Peace Treaty false
});
test('every action needs a focus');
  // each refuses with { success: false, error: 'Focus an enemy first' } and leaves focusLocked false:
  // Barbarian basicAttack; Barbarian useAbility; Druid Wildshape; Berserker Bloodbath; Wizard Fireball;
  // Beast Tamer summon; Mech activateSpecial; Diplomat activateSpecial (Peace Treaty)
test('focus can switch before acting');            // select Warlock, select Shroomguard -> selectedTarget 'Shroomguard'
test('focus locks after the first action');        // Barbarian: select Shroomguard; basicAttack; selectTarget('p0','Warlock')
                                                   // -> 'Focus is locked for this turn'; selectedTarget 'Shroomguard'.
                                                   // Same after useAbility, and after Mech activateSpecial.
test('damaging actions are lost when the focus falls');
  // Barbarian, kill the focus; useAbility -> 'Your focused target has fallen'
  // Wizard, kill the focus; Fireball -> 'Your focused target has fallen'
  // Mech, kill the focus; activateSpecial -> 'Your focused target has fallen'
  // Timekeeper, kill the focus; useAbility (Chrono Shift, allyTargetId 'Fighter') -> 'Your focused target has fallen'
test('non-damaging actions survive a fallen focus');
  // Druid (Druid.currentHP = 5), kill the focus; Wildshape succeeds; Druid.currentHP > 5
  // Berserker, kill the focus; Bloodbath succeeds
  // Diplomat, kill the focus; activateSpecial (Peace Treaty) succeeds
  // Beast Tamer (beast not summoned), kill the focus; ability succeeds; statusEffects.beast_active === true
test('a revived focus is still focused');
  // Barbarian vs ['Fighter', 'Angel', 'Cleric']; Fighter.currentHP = 1; setD20(20); select Fighter; basicAttack
  // -> Fighter.currentHP > 0 and Fighter.resurrected === true; players[0].selectedTarget === 'Fighter';
  // gm.isFocusFallen(game, players[0]) === false; useAbility('p0', 0, 'Fighter') succeeds
test('untargetable enemies cannot be focused');    // Warlock.statusEffects.untargetable = true -> selectTarget error "Can't be targeted"
test('no focusable enemy leaves no actions');      // all three enemies untargetable -> gm.hasNoActionsLeft(game) === true
test('hasNoActionsLeft after the focus falls');    // Barbarian kill -> true; Druid kill -> false, after Wildshape -> true
test('focus lock resets at turn change');          // after attack, gm.endTurn('p0'); players[0].focusLocked === false; p1 can select
test('focus lock survives rekeyPlayer');           // after attack, gm.rekeyPlayer(game,'p0','p0b'); selectTarget('p0b','Shroomguard') -> locked error
test('game state carries focus and targeting');
  // Barbarian: select Warlock; state = gm.getFullGameState(game):
  // state.players[0].selectedTarget === 'Warlock' (the same object goes to the opponent and spectators);
  // state.activeHero.abilityTargeting deepEqual [{ kind: 'enemy', damaging: true }];
  // players[0].focusLocked false, then true after basicAttack
```

- [ ] **Step 2: Run** `cd backend && node --test test/focus.test.js`. Expected: FAIL (`Cannot find module '../abilityTargeting'` and assertion failures).
- [ ] **Step 3: Implement** `backend/abilityTargeting.js` and the `gameManager` changes above.
- [ ] **Step 4: Run** `cd backend && npm test`. Expected: all suites PASS, including `reconnect`, `mirror`, `damage`, `turnorder`, `gameServer`. Existing tests that act without selecting first get a `select(...)` added, never a weakened rule.
- [ ] **Step 5: Commit** `feat(server): focus is the first action in battle`.

### Task 2: Client focus rules (pure)

**Files:**
- Create: `frontend/src/battle/focus.ts`
- Test: `frontend/src/battle/focus.test.ts`
- Modify: `frontend/src/types.ts` (Player: `focusLocked?: boolean`; GameState.activeHero: `abilityTargeting?: AbilityTargeting[]`)

**Interfaces:**
- Consumes: Task 1's state fields.
- Produces (all exported from `frontend/src/battle/focus.ts`):
  - `type AbilityTargetKind = 'enemy' | 'self' | 'all'`; `interface AbilityTargeting { kind: AbilityTargetKind; damaging: boolean }`; `const UNKNOWN_TARGETING: AbilityTargeting = { kind: 'enemy', damaging: true }`; `specialTargeting(category: string | undefined): AbilityTargeting` (`{ kind: 'all', damaging: category === 'activated_aoe' }`)
  - `type CardSide = 'enemy' | 'ally'` (viewer-relative, for the panel only); `interface InspectedCard { name: string; side: CardSide }`
  - `interface Focus { name: string; alive: boolean }`; `readFocus(attacker: Player | undefined, defender: Player | null | undefined): Focus | null` (looks only in `defender.team`; `alive` via `isHeroAlive`)
  - `turnFocus(gameState: GameState): { focus: Focus; defenderId: string } | null`: the active player's focus resolved on the other team; used to draw the marker for the acting player, the opponent and spectators alike.
  - `type Gate = { ok: true } | { ok: false; reason: 'need-focus' | 'fallen' }`
  - `attackGate(focus: Focus | null): Gate`; `actionGate(t: AbilityTargeting, focus: Focus | null): Gate` (no focus → `need-focus`; dead focus and `t.kind === 'enemy' && t.damaging` → `fallen`. Owner 2026-11-18: area attacks (kind `all`: Fireball, Bomb Toss, Self Destruct) still work after the focus falls; single-target attacks, including ones that splash adjacent enemies like Cleave or the Elementalist's ability, do not)
  - `attackLabel(focus: Focus | null, gate: Gate): string`; `actionLabel(name: string, t: AbilityTargeting, focus: Focus | null, gate: Gate): string` (`ok` and kind `enemy` → `"<name> on <Focus>"`; `ok` otherwise → name)
  - `tauntTargetFor(active: Hero, opponent: Player | null): string | null` (null when the hero ignores taunt or the taunter is dead; moved out of `BattlePhase.getTargetableEnemies`)
  - `interface FocusButtonInput { isMyTurn: boolean; isSpectating: boolean; inspected: { hero: Hero; side: CardSide }; focus: Focus | null; focusLocked: boolean; tauntTarget: string | null; activeHeroName: string }`
  - `type FocusButtonState = { show: false } | { show: true; enabled: boolean; label: string }`; `focusButtonState(input: FocusButtonInput): FocusButtonState`

- [ ] **Step 1: Write the failing tests** (`warlock = { name: 'Warlock', alive: true }`, `fallen = { name: 'Warlock', alive: false }`, `self = { kind: 'self', damaging: false }`, `all = { kind: 'all', damaging: true }`, `enemy = { kind: 'enemy', damaging: true }`):

```ts
expect(attackGate(null)).toEqual({ ok: false, reason: 'need-focus' });
expect(attackLabel(null, attackGate(null))).toBe('Focus an enemy first');
expect(attackLabel(warlock, attackGate(warlock))).toBe('Attack Warlock');
expect(attackLabel(fallen, attackGate(fallen))).toBe('Warlock has fallen');
expect(actionLabel('Wildshape', self, null, actionGate(self, null))).toBe('Focus an enemy first');
expect(actionLabel('Wildshape', self, fallen, actionGate(self, fallen))).toBe('Wildshape');
expect(actionGate(all, fallen)).toEqual({ ok: true }); // owner: area attacks still work after the focus falls
expect(actionLabel('Fireball', all, warlock, actionGate(all, warlock))).toBe('Fireball');
expect(actionLabel('Poison Strike', enemy, warlock, actionGate(enemy, warlock))).toBe('Poison Strike on Warlock');
expect(actionLabel('Poison Strike', enemy, fallen, actionGate(enemy, fallen))).toBe('Warlock has fallen');
expect(actionGate(specialTargeting('activated_aoe_heal'), fallen)).toEqual({ ok: true });
expect(actionGate(specialTargeting('activated_aoe'), fallen)).toEqual({ ok: true }); // Self Destruct is an area attack
// readFocus looks only at the defender: both teams have 'Warlock'; attacker.selectedTarget 'Warlock';
//   attacker's own Warlock at 0 HP, defender's alive -> { name: 'Warlock', alive: true }
// turnFocus: currentTurn 1, players[1].selectedTarget 'Druid' -> { focus: { name: 'Druid', alive: true }, defenderId: players[0].id }
// focusButtonState (base: my turn, not spectating, inspected alive enemy Warlock, no focus, not locked, no taunt):
//   base -> { show: true, enabled: true, label: 'Focus Warlock' }
//   isMyTurn false -> { show: false };  isSpectating -> { show: false };  inspected dead -> { show: false };
//   inspected side 'ally' -> { show: false }
//   focus = warlock -> { show: true, enabled: false, label: 'Focused' }
//   focus = Shroomguard, focusLocked -> { show: true, enabled: false, label: 'Focus locked' }
//   statusEffects.untargetable -> { enabled: false, label: "Can't be targeted" }, unless untargetableAttacker === activeHeroName
//   tauntTarget 'Paladin' -> { enabled: false, label: 'Taunted: focus Paladin' }
// tauntTargetFor: taunted by a living Paladin -> 'Paladin'; Barbarian (ignore_taunt) -> null; Paladin dead -> null
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/battle/focus.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `focus.ts` and the type fields.
- [ ] **Step 4: Run** `cd frontend && npm test`. Expected: PASS. Then `npx tsc --noEmit -p .` (the build uses `--noCheck`, so this is the only type check): no errors in `battle/focus.ts` or `types.ts` (pre-existing errors elsewhere are noted, not fixed).
- [ ] **Step 5: Commit** `feat(frontend): focus rules for battle actions`.

### Task 3: Details panel over the left column

**Files:**
- Create: `frontend/src/components/BattleDetailsPanel.tsx`, `frontend/src/styles/BattleDetails.css`, `frontend/src/components/BattleDetailsPanel.test.tsx`
- Modify: `frontend/src/cards/cardRules.ts` + `cardRules.test.ts` (`ruleSections`), `frontend/src/components/HeroCard.tsx` (`onInspect`, `isFocused`; `renderCardDetails` uses `ruleSections`), `frontend/src/components/BattlePhase.tsx`, `frontend/src/App.tsx` (slot inside `.battle-combined-info`; `battleInspect` state), `frontend/scripts/check-tokens.mjs` (add `styles/BattleDetails.css`)

**Interfaces:**
- Consumes: `InspectedCard`, `CardSide` from Task 2.
- Produces:
  - `ruleSections(hero: { name: string; Ability?: {name: string; description: string}[]; Special?: ... }): Array<{ label: 'Ability' | 'Special'; name: string; description: string }>`: abilities first, then specials; Bomber's special is named `'Explosion'`.
  - `HeroCard` props `onInspect?: () => void` (when set, read mode is `'none'`; a click that does not choose the card calls `onInspect` and stops propagation; dead cards are inspectable) and `isFocused?: boolean` (adds class `focused` and `data-focused="true"`).
  - `BattleDetailsPanel` props `{ hero: Hero; side: CardSide; isFocused: boolean; onClose: () => void }`; root `<aside className="battle-details" data-side={side} data-keep-details data-tutorial="details-panel" role="dialog" aria-label={hero.name}>`; close X via `CloseButton` with `aria-label="Close details"`; tags "Enemy" / "Your hero", "Focused", "Fallen".
  - Slot: App renders `<div id="battle-details-slot" />` as the first child of `.battle-combined-info` (which becomes `position: relative`); BattlePhase portals the panel there (renders nothing if the slot is absent).
  - `BattlePhase` prop `onInspectChange?: (inspected: InspectedCard | null) => void`; App keeps `battleInspect` for Task 6.
- Panel layout: `position: absolute; inset: 0` over the whole `.battle-combined-info`, opaque panel token background, `container-type: size`; card box `--card-w: min(92cqw, 48cqh * 260 / 391)`; rules text at `var(--phone-sidebar-font)` on phones, 15px on desktop, `overflow-y: auto`. Short-screen block: card at most `40cqh` tall, header 40px.
- Closing: a document `click` whose target is not inside `.hero-card, [data-keep-details]`; Escape; `closeDetails()` in every action handler (attack, ability, special, end turn); a change of `currentTurn` / `activeHero.playerIndex` / `activeHero.heroIndex`; `phase === 'ended'`.
- In this task enemy cards still auto-target on tap as today (so battles stay playable); Task 4 removes that.

- [ ] **Step 1: Write the failing tests.** `cardRules.test.ts`: `ruleSections` of a hero with one ability and one special returns `[{label:'Ability',...},{label:'Special',...}]` in that order; Bomber's special `name === 'Explosion'`. `BattleDetailsPanel.test.tsx` (mock `../config` and `../battleAnimations` as `DisconnectBadge.test.tsx` does): markup contains the hero name, `Ability:` and the ability description, `data-side="enemy"`, `Enemy`, `aria-label="Close details"`; `isFocused` adds `Focused`; a hero at 0 HP adds `Fallen`; side `ally` shows `Your hero`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/cards src/components/BattleDetailsPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the panel, the `HeroCard` props, the slot, `inspected` state in `BattlePhaseView` (`useState<InspectedCard | null>`; hero looked up on its side by name) and the closing rules. All battle cards, for players and spectators, get `onInspect`.
- [ ] **Step 4: Verify** `npm test`, `npm run build`, `npm run check:tokens`; in the browser at 844x390 and 1440x900, tapping any card (own, enemy, dead) shows the panel over the left column, and each closing rule closes it.
- [ ] **Step 5: Commit** `feat(frontend): battle card details panel`.

### Task 4: Focus button, marker for everyone, action bar

**Files:**
- Modify: `frontend/src/components/BattlePhase.tsx`, `frontend/src/styles/BattlePhone.css`, `frontend/src/styles/HeroCard.css` (`.hero-card.focused`), `frontend/src/styles/tokens.css` (`--focus-c`, `--focus-glow`)
- Test: `frontend/src/components/BattlePhase.focus.test.tsx`

**Interfaces:**
- Consumes: everything in Task 2's Produces; Task 3's `inspected` state, `closeDetails()`, `HeroCard.isFocused`; `socketService.selectTarget(targetId)` (unchanged).
- Changes:
  - Remove `getTargetableEnemies`'s auto-target tap and the "Select an enemy to target first!" early return.
  - Marker: `turnFocus(gameState)` sets `isFocused` on that hero's card on the defender's side, on every client (acting player, opponent, spectator). `isSelected` no longer marks targets.
  - My turn: the action bar shows the active hero, a `Focus: <Name>` / `Focus: none` line, the Focus button (when `focusButtonState(...).show`, with `tauntTarget = tauntTargetFor(activeHero, opponent)`; `className="action-button focus-button" data-tutorial="focus" data-keep-details`; click → `socketService.selectTarget(name)`), then Attack, abilities, special, End Turn. Attack uses `attackGate`/`attackLabel`; each ability uses `gameState.activeHero.abilityTargeting?.[index] ?? UNKNOWN_TARGETING` with `actionGate`/`actionLabel`; the activated special uses `specialTargeting(special.category)`; all combined with the existing used/silenced/bribed/stunned rules (drop the old "(Target Dead)" suffixes). End Turn is always enabled.
  - Opponent's turn: the waiting prompt adds `Focus: <Name>` when the opponent has focused one of my heroes.
  - Chrono Shift and `requires_ally_target` keep their ally-pick sub-step after a live focus; during it ally cards stay `isSelectable` and a tap picks rather than inspects.
  - Enemy `isBlocked` = my turn and Focus would be disabled by taunt or untargetable.
- `.hero-card.focused`: static outline and glow from `--focus-c` / `--focus-glow` (CSS only; the crosshair and its motion are Task 5).

- [ ] **Step 1: Write the failing tests** with `renderToStaticMarkup(<BattlePhase …/>)` and a canned `GameState` (mock `../socketService`, `../config`, `../battleAnimations`; enemy team Warlock, Shroomguard, Plague Spreader):
  - No action before focus: Barbarian active, no focus: the attack and Reckless Swing buttons are `disabled` and read `Focus an enemy first`; Druid active, no focus: Wildshape `disabled`, `Focus an enemy first`; Mech active: the special button `disabled`, `Focus an enemy first`; End Turn enabled.
  - `selectedTarget: 'Warlock'`: `Attack Warlock` and `Reckless Swing on Warlock` enabled; the Warlock card has `data-focused="true"`.
  - Wildshape after the focus died: Druid active, Warlock at 0 HP, `focusLocked: true`, `hasUsedAttack: true`: attack reads `Warlock has fallen` (disabled), `Wildshape` enabled, Warlock card still `data-focused="true"`.
  - Opponent and spectator see the marker: mirror teams (both sides have Warlock); opponent's turn with `opponent.selectedTarget: 'Warlock'`: exactly one `data-focused="true"`, inside `.player-area`; no `data-tutorial="focus"`; prompt contains `Focus: Warlock`. Same gameState with `isSpectating`: the same card is marked.
  - Timekeeper active: Chrono Shift reads `Focus an enemy first` (disabled) with no focus, `Chrono Shift on Warlock` (enabled) with a live Warlock focus.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/BattlePhase.focus.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring and CSS. Focus button and labels fit the Actions sidebar at 844x390 and 667x375 (long names wrap, no overflow; short-screen rules in the end block of `BattlePhone.css`).
- [ ] **Step 4: Verify** `npm test`, `npm run build`, `npm run check:tokens`; a local friendly battle (two admin tabs plus a spectator tab): tap enemy → panel + Focus; Focus → marker on all three tabs + "Attack <Name>"; switching works until the first action, then "Focus locked".
- [ ] **Step 5: Commit** `feat(frontend): focus an enemy before acting`.

### Task 5: Focus marker [Fable]

Purely visual drawing and animation: runs on Fable.

**Files:** `frontend/src/components/HeroCard.tsx` (an `aria-hidden` `.card-focus-mark` element rendered when `isFocused`), `frontend/src/styles/HeroCard.css`, `frontend/src/styles/tokens.css`

**Interfaces:** consumes `HeroCard.isFocused` and `.hero-card.focused` from Task 4; no new props.

- [ ] **Step 1: Draw** a crosshair mark over the focused card's art (inline SVG, colours from tokens) and a slow red pulse on the glow. Readable on a 78px tiny card and a 260px card, on either side of the board (the opponent sees it on their own hero); does not cover the HP/Defense gems or the name.
- [ ] **Step 2: Respect motion settings:** no pulse with `prefers-reduced-motion: reduce` or "Battle animations: off" (reuse `cardMotionOff`); the mark itself stays.
- [ ] **Step 3: Verify** `npm run check:tokens`, `npm run build`; screenshots of a focused card at 78px and 234px, 844x390 and 1440x900, from the acting player's and the opponent's view.
- [ ] **Step 4: Commit** `feat(frontend): crosshair marker on the focused card`.

### Task 6: Battle tutorial teaches tap → Focus → Attack

**Files:**
- Create: `frontend/src/components/tutorial/battlePrompts.ts`, `frontend/src/components/tutorial/battlePrompts.test.ts`
- Modify: `frontend/src/components/tutorial/BattleTutorial.tsx` (uses `pickBattlePrompt`; new prop `inspected: InspectedCard | null`), `frontend/src/App.tsx` (passes `battleInspect`)

**Interfaces:**
- Consumes: `InspectedCard` (Task 2); `data-tutorial="focus"` and `data-tutorial="details-panel"` (Tasks 3–4).
- Produces (`LogEntryLike` and `Prompt` move here from `BattleTutorial.tsx`; `OverlayStep` from `TutorialOverlay.tsx`): `type PromptKind = 'poison' | 'crit' | 'log' | 'inspect' | 'focus' | 'attack' | 'ability' | 'endturn'`; `interface BattlePromptInput { me: Player; myTurn: boolean; battleLog: LogEntryLike[]; shown: ReadonlySet<PromptKind>; inspected: InspectedCard | null; attackReady: boolean; abilityReady: boolean }`; `pickBattlePrompt(input: BattlePromptInput): Prompt | null`; `promptFinished(kind: PromptKind, s: { focused: boolean; inspectedEnemy: boolean; usedAttack: boolean; usedAbility: boolean; myTurn: boolean }): boolean`.
- Copy (exact):
  - intro `image`: "Your hero's abilities and specials are written on the card. Tap any card to read it in the panel on the left. Each turn, your hero can use 1 attack and 1 ability."
  - `inspect` (my turn, no focus, no enemy inspected), target `.opponent-area .team-display`, interactive: "Tap an enemy hero to see its card."
  - `focus` (my turn, no focus, enemy inspected), target `[data-tutorial="focus"]`, interactive: "Press Focus to choose who your hero attacks. Your hero can't do anything until it has a focus. You can switch until you act."
  - `attack`: "Now press Attack to strike the enemy you focused!"
  - `ability`: "Your hero can also use its ability this turn. Press it!"
  - `poison`, `crit`, `log`, `endturn`: unchanged.
- Finished: `inspect` when an enemy is inspected; `focus` when `me.selectedTarget` is set; others as today.

- [ ] **Step 1: Write the failing tests:** no focus + nothing inspected → kind `inspect`; enemy inspected → kind `focus` whose `step.target` is `['[data-tutorial="focus"]']`; an inspected ally (`side: 'ally'`) still gives `inspect`; focused and `attackReady` → `attack`; used attack and `abilityReady` → `ability`; not my turn → `null` once `log` has been shown; `promptFinished('inspect', {inspectedEnemy: true, ...})` and `promptFinished('focus', {focused: true, ...})` are true.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/tutorial`. Expected: FAIL.
- [ ] **Step 3: Implement** `battlePrompts.ts` (move today's `pickPrompt` logic there) and wire `BattleTutorial` + App.
- [ ] **Step 4: Verify** `npm test`, `npm run build`; play the tutorial at 844x390 to the first end turn: every pointer lands on its target and the prompts appear in order inspect → focus → attack → ability → end turn; on the bot's turn the bot's focus marker shows on your hero.
- [ ] **Step 5: Commit** `feat(frontend): tutorial teaches tap, Focus, Attack`.

### Task 7: Sign-off

**Files:** none new (fixes only). Screenshots in `.superpowers/sdd/2026-11-18-battle-focus/signoff/` named `<shot>-<w>x<h>.png`, at **844x390, 667x375 and 1440x900**.

- [ ] **Step 1:** `cd backend && npm test`; `cd frontend && npm test && npm run build && npm run check:tokens && npm run lint` (note pre-existing lint failures, don't fix unrelated code).
- [ ] **Step 2: Shots from a local friendly battle** (two admin tabs and a spectator tab; draft a Druid and an Angel so a non-damaging ability and a revive are on hand):
  - `no-focus-all-disabled`: my turn, nothing focused, every action reads "Focus an enemy first".
  - `tap-enemy-panel-focus`: enemy tapped, panel over the left column, Focus button in Actions.
  - `focused-attack-named`: after Focus: crosshair on the card, "Attack <Name>" and "<Ability> on <Name>".
  - `opponent-sees-focus` and `spectator-sees-focus`: the same moment from the other two tabs.
  - `focus-fallen-wildshape-enabled`: the focused enemy killed by the attack; "<Name> has fallen" (disabled), Wildshape enabled. (Let the other tab end turns until the kill lines up.)
  - `opponent-turn-panel`: opponent's turn, a card tapped, panel shown, no Focus button.
  - `tutorial-inspect`, `tutorial-focus`, `tutorial-attack`, `tutorial-ability`: the four tutorial prompts.
- [ ] **Step 3: Checks** at each size: panel text ≥12px (`getComputedStyle`), no horizontal page scroll, Focus and action buttons ≥40px tall on 844x390 and 667x375; tapping empty space, acting and turn change each close the panel; reload the acting tab mid-turn after an attack: marker and "Focus locked" still shown; a focused hero revived by Angel keeps its marker and Attack works again; Chrono Shift ally pick still works; reduced-motion pass shows the mark without the pulse.
- [ ] **Step 4:** Put the screenshot set in front of the owner and wait for his OK. After the OK: deploy the server, then the site; spot-check on 844x390 emulation.
