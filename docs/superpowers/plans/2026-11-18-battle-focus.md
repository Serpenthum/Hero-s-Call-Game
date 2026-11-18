# Battle Focus and Card Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In battle, tapping a card shows its details in a panel over the left column, and the turn's target is chosen
with a deliberate Focus button that the server enforces (switchable until the first action, then locked; a fallen
focus loses damaging actions but not non-damaging ones).

**Architecture:** The server stays the source of truth: a new pure `backend/abilityTargeting.js` classifies each
ability (enemy / ally / self / all, damaging or not); `gameManager` uses it in `useAbility`, adds `focusLocked` and
`selectedTargetSide` to the player, and sends `activeHero.abilityTargeting` in the game state. The client adds a pure
`frontend/src/battle/focus.ts` (gates, labels, Focus button state), a `BattleDetailsPanel` portalled into a slot inside
the left column, and rewires the action bar and the tutorial.

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
- Exact copy: "Focus an enemy first", "Focus an ally first", "Focus <Name>", "Focused", "Focus locked", "Taunted: focus <Name>", "Can't be targeted", "Attack <Name>", "<Ability> on <Name>", "<Name> has fallen". Existing suffixes ("(Used)", "(Silenced)", "(Stunned)", "(1/2)", "(Bribed)") still append.
- Deploy order when the owner approves: server first, then site. The client treats a missing `abilityTargeting` entry as `{ kind: 'enemy', damaging: true }`.
- Commands: backend `cd backend && npm test`; frontend `cd frontend && npm test && npm run build && npm run check:tokens`.

## Review Focus

1. **Mirror match** (both teams field Fighter): an ally focus on your Fighter heals yours, never theirs; enemy focus never resolves to your own hero. Tests: Task 1 `ally focus heals own hero in a mirror`; Task 2 `readFocus uses the side`.
2. **Reload mid-turn after acting**: the reconnected tab still shows the focus, the marker and the lock. Test: Task 1 `focus lock survives rekeyPlayer`; sign-off step in Task 7.
3. **Taunted hero taps a non-taunter**: Focus is disabled with "Taunted: focus Paladin"; the server still forces the taunter. Tests: Task 2 `focusButtonState taunt`; existing `mirror.test.js` taunt test keeps passing.
4. **Focus falls and nothing usable is left**: the turn auto-ends exactly as when actions run out (not stuck waiting). Test: Task 1 `hasNoActionsLeft after the focus falls`.
5. **Choosing Chrono Shift's ally**: while picking the ally, a tap on an ally picks it (old behaviour) instead of opening the panel, and Chrono Shift needs a live enemy focus. Tests: Task 4 render test `Chrono Shift on Warlock`; the tap itself is a Task 7 Step 3 check (no DOM in vitest).

---

### Task 1: Server focus rules and ability classification

**Files:**
- Create: `backend/abilityTargeting.js`
- Modify: `backend/gameManager.js` (`selectTarget` ~4749, `basicAttack` ~2424, `useAbility` ~2666, `useTimekeeperSelectedAbility` ~2937, `activateSpecial` ~4911, turn resets ~4694-4710 and ~5419-5441, `hasNoActionsLeft` ~5156, `resolveEffectTarget` ~4078, `getFullGameState` ~6103)
- Modify: `backend/gameServer.js` (`select-target` handler ~2372)
- Test: `backend/test/focus.test.js`

**Interfaces:**
- Produces:
  - `classifyAbility(ability, caster) -> { kind: 'enemy'|'ally'|'self'|'all', damaging: boolean }` and `heroHasAllyAbility(hero) -> boolean`, exported from `backend/abilityTargeting.js`. Rule exactly as in the spec's "Ability classification" paragraph.
  - `gameManager.selectTarget(playerId, targetId, side = 'enemy')`; errors `'Focus is locked for this turn'` (when `player.focusLocked && player.selectedTarget`) and `'This hero has no ability that targets an ally'`. Sets `player.selectedTargetSide`. Ally side ignores taunt and looks only in the player's own team.
  - `player.focusLocked: boolean` set true after any successful `basicAttack`, `useAbility`, `useTimekeeperSelectedAbility`, `activateSpecial`; reset with `selectedTargetSide = null` wherever `selectedTarget = null` is reset at turn change.
  - `gameManager.isFocusFallen(game, player) -> boolean` (a focus is set and that hero, on its side, has `currentHP <= 0`).
  - `getFullGameState`: `players[i].focusLocked`, `players[i].selectedTargetSide`, `activeHero.abilityTargeting: Array<{kind, damaging}>` (one per ability of the active hero, in order).
  - Socket: `select-target` payload `{ targetId, side? }`.
- `useAbility` by kind: **self** needs no focus, ignores taunt/dead/untargetable checks, primary target = caster. **all** needs no focus, AoE path as today. **enemy** needs `selectedTargetSide === 'enemy'` (else `'Focus an enemy first'`), dead focus → `'Your focused target has fallen'`, lookup only in the opponent's team, Bribe check against the focus. **ally** needs `selectedTargetSide === 'ally'` (else `'Focus an ally first'`), lookup only in the player's team, dead → `'Your focused target has fallen'`. `basicAttack` with no enemy focus → `'Focus an enemy first'`. Add `case 'chosen_ally':` in `resolveEffectTarget` returning `primaryTarget`.

- [ ] **Step 1: Write the failing tests** in `backend/test/focus.test.js` using `makeManager, startBattle, hero, setD20, setRandom, resetDice, select` from `./support/battle` (`beforeEach`: `setD20(15); setRandom(0.5)`; `afterEach(resetDice)`). Enemy team everywhere unless stated: `['Warlock', 'Shroomguard', 'Plague Spreader']`.

```js
test('classifyAbility matches the design table', () => {
  // SELF_NO: Druid/Wildshape, Champion/Inspiring Crowd, Berserker/Bloodbath, Engineer/Call Turret, Medic/Med Bots,
  //          Beast Tamer with statusEffects.beast_active falsy
  // ALL_DMG: Wizard/Fireball, Bomber/Bomb Toss
  // ALLY_NO (disabled): Healer/Heal, Pixie/Wish, Blacksmith/Sharpen, Blacksmith/Reinforce
  // Beast Tamer with beast_active: { kind: 'enemy', damaging: true }
  // every other ability of every hero not disabled: { kind: 'enemy', damaging: true }
});
test('focus can switch before acting');            // select Warlock, select Shroomguard -> selectedTarget 'Shroomguard'
test('focus locks after the first attack');        // Barbarian team; select Shroomguard; basicAttack; selectTarget('p0','Warlock')
                                                   // -> { success: false, error: 'Focus is locked for this turn' }; selectedTarget 'Shroomguard'
test('focus locks after the first ability');       // same, with useAbility('p0', 0, 'Shroomguard')
test('damaging ability is refused after the focus falls');
  // Barbarian; Warlock.currentHP = 1; setD20(20); select Warlock; basicAttack -> Warlock dead;
  // useAbility('p0',0,'Warlock') -> { success: false, error: 'Your focused target has fallen' }
test('self ability works after the focus falls');  // Druid team, Druid.currentHP = 5, same kill; useAbility('p0',0,'') succeeds; Druid.currentHP > 5
test('self ability needs no focus, and a first focus is still allowed after it');
  // Druid: useAbility('p0',0,'') succeeds with selectedTarget null; select Warlock succeeds; select Shroomguard -> locked error
test('all-enemies ability needs no focus');        // Wizard: useAbility('p0',0,'') succeeds; every enemy currentHP < its HP
test('damaging ability and attack need a focus');  // Barbarian: useAbility -> 'Focus an enemy first'; basicAttack('p0','Warlock') -> 'Focus an enemy first'
test('Beast Tamer summons without a focus, commands only with one');
  // beast inactive: useAbility('p0',0,'') succeeds, statusEffects.beast_active === true
  // fresh battle with beast_active = true: useAbility('p0',0,'') -> 'Focus an enemy first'
test('ally focus heals own hero in a mirror');
  // ['Healer','Fighter','Cleric'] vs ['Fighter','Warlock','Cleric']; own Fighter.currentHP = 5;
  // select(gm,'p0','Fighter','ally') -> selectedTargetSide 'ally'; useAbility('p0',0,'Fighter') succeeds;
  // own Fighter.currentHP > 5; enemy Fighter.currentHP === its HP; basicAttack -> 'Focus an enemy first'
test('ally focus is refused without an ally ability'); // Barbarian: selectTarget('p0','Fighter','ally') -> 'This hero has no ability that targets an ally'
test('hasNoActionsLeft after the focus falls');
  // Barbarian kill as above -> gm.hasNoActionsLeft(game) === true
  // Druid kill -> false; after Wildshape -> true
test('focus lock resets at turn change');          // after attack, gm.endTurn('p0'); players[0].focusLocked === false; p1 can select
test('focus lock survives rekeyPlayer');           // after attack, gm.rekeyPlayer(game,'p0','p0b'); selectTarget('p0b','Shroomguard') -> locked error
test('game state carries focus and targeting');
  // Barbarian: state.activeHero.abilityTargeting deepEqual [{ kind: 'enemy', damaging: true }];
  // players[0].focusLocked false, then true after basicAttack; players[0].selectedTargetSide 'enemy'
```

Extend `select(gm, playerId, targetName, side)` in `backend/test/support/battle.js` to pass `side` through.

- [ ] **Step 2: Run** `cd backend && node --test test/focus.test.js`. Expected: FAIL (`Cannot find module '../abilityTargeting'` and assertion failures).
- [ ] **Step 3: Implement** `backend/abilityTargeting.js` and the `gameManager` / `gameServer` changes above. `hasNoActionsLeft`: when `isFocusFallen`, attack counts as unavailable and an ability counts only if an unused one is not damaging or is kind `all`. Leave `canHeroAttack(player, hero)` / `canHeroUseAbility(player, hero)` signatures unchanged (the tutorial bot calls them).
- [ ] **Step 4: Run** `cd backend && npm test`. Expected: all suites PASS, including `reconnect`, `mirror`, `damage`, `turnorder`, `gameServer`.
- [ ] **Step 5: Commit** `feat(server): focus rules for battle targeting`.

### Task 2: Client focus rules (pure)

**Files:**
- Create: `frontend/src/battle/focus.ts`
- Test: `frontend/src/battle/focus.test.ts`
- Modify: `frontend/src/types.ts` (Player: `focusLocked?: boolean; selectedTargetSide?: 'enemy' | 'ally' | null`; GameState.activeHero: `abilityTargeting?: AbilityTargeting[]`), `frontend/src/socketService.ts` (`selectTarget(targetId: string, side: FocusSide = 'enemy')` emits `{ targetId, side }`)

**Interfaces:**
- Consumes: Task 1's state fields.
- Produces (all exported from `frontend/src/battle/focus.ts`):
  - `type AbilityTargetKind = 'enemy' | 'ally' | 'self' | 'all'`; `interface AbilityTargeting { kind: AbilityTargetKind; damaging: boolean }`; `const UNKNOWN_TARGETING: AbilityTargeting = { kind: 'enemy', damaging: true }`
  - `type FocusSide = 'enemy' | 'ally'`; `interface Focus { name: string; side: FocusSide; alive: boolean }`; `interface InspectedCard { name: string; side: FocusSide }`
  - `readFocus(me: Player, opponent: Player | null): Focus | null` (side defaults to `'enemy'`; hero looked up on that side only; `alive` via `isHeroAlive`)
  - `type Gate = { ok: true } | { ok: false; reason: 'need-enemy' | 'need-ally' | 'fallen' }`
  - `attackGate(focus: Focus | null): Gate`; `abilityGate(t: AbilityTargeting, focus: Focus | null): Gate`
  - `attackLabel(focus: Focus | null, gate: Gate): string`; `abilityLabel(name: string, t: AbilityTargeting, focus: Focus | null, gate: Gate): string`
  - `tauntTargetFor(active: Hero, opponent: Player | null): string | null` (null when the hero ignores taunt or the taunter is dead; moved out of `BattlePhase.getTargetableEnemies`)
  - `interface FocusButtonInput { isMyTurn: boolean; isSpectating: boolean; inspected: { hero: Hero; side: FocusSide }; focus: Focus | null; focusLocked: boolean; tauntTarget: string | null; activeHeroName: string; activeHeroHasAllyAbility: boolean }`
  - `type FocusButtonState = { show: false } | { show: true; enabled: boolean; label: string }`; `focusButtonState(input: FocusButtonInput): FocusButtonState`

- [ ] **Step 1: Write the failing tests** (`warlock = { name: 'Warlock', side: 'enemy', alive: true }`, `fallen = { ...warlock, alive: false }`):

```ts
expect(attackGate(null)).toEqual({ ok: false, reason: 'need-enemy' });
expect(attackLabel(null, attackGate(null))).toBe('Focus an enemy first');
expect(attackLabel(warlock, attackGate(warlock))).toBe('Attack Warlock');
expect(attackLabel(fallen, attackGate(fallen))).toBe('Warlock has fallen');
expect(attackGate({ name: 'Fighter', side: 'ally', alive: true })).toEqual({ ok: false, reason: 'need-enemy' });
const self = { kind: 'self', damaging: false }, all = { kind: 'all', damaging: true }, enemy = { kind: 'enemy', damaging: true }, ally = { kind: 'ally', damaging: false };
expect(abilityLabel('Wildshape', self, fallen, abilityGate(self, fallen))).toBe('Wildshape');
expect(abilityGate(all, null)).toEqual({ ok: true });
expect(abilityLabel('Fireball', all, fallen, abilityGate(all, fallen))).toBe('Fireball');
expect(abilityLabel('Poison Strike', enemy, null, abilityGate(enemy, null))).toBe('Focus an enemy first');
expect(abilityLabel('Poison Strike', enemy, warlock, abilityGate(enemy, warlock))).toBe('Poison Strike on Warlock');
expect(abilityGate(enemy, fallen)).toEqual({ ok: false, reason: 'fallen' });
expect(abilityLabel('Heal', ally, warlock, abilityGate(ally, warlock))).toBe('Focus an ally first');
// readFocus uses the side: both teams have 'Fighter'; me.selectedTarget 'Fighter', selectedTargetSide 'ally',
// own Fighter at 0 HP, enemy Fighter alive -> { name: 'Fighter', side: 'ally', alive: false }
// focusButtonState (base: my turn, not spectating, inspected alive enemy Warlock, no focus, not locked, no taunt):
//   base -> { show: true, enabled: true, label: 'Focus Warlock' }
//   isMyTurn false -> { show: false };  isSpectating -> { show: false };  inspected dead -> { show: false }
//   focus = warlock -> { show: true, enabled: false, label: 'Focused' }
//   focus = Shroomguard, focusLocked -> { show: true, enabled: false, label: 'Focus locked' }
//   focus null, focusLocked -> enabled true (a first focus after a no-focus action)
//   statusEffects.untargetable -> { enabled: false, label: "Can't be targeted" }, unless untargetableAttacker === activeHeroName
//   tauntTarget 'Paladin' -> { enabled: false, label: 'Taunted: focus Paladin' }
//   inspected ally, activeHeroHasAllyAbility false -> { show: false }; true -> label 'Focus Fighter'
// tauntTargetFor: taunted by a living Paladin -> 'Paladin'; Barbarian (ignore_taunt) -> null; Paladin dead -> null
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/battle/focus.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `focus.ts`, the type fields and `socketService.selectTarget`.
- [ ] **Step 4: Run** `cd frontend && npm test`. Expected: PASS. Then `npx tsc --noEmit -p .` (the build uses `--noCheck`, so this is the only type check): no errors in `battle/focus.ts`, `types.ts` or `socketService.ts` (pre-existing errors elsewhere are noted, not fixed).
- [ ] **Step 5: Commit** `feat(frontend): focus rules for battle actions`.

### Task 3: Details panel over the left column

**Files:**
- Create: `frontend/src/components/BattleDetailsPanel.tsx`, `frontend/src/styles/BattleDetails.css`, `frontend/src/components/BattleDetailsPanel.test.tsx`
- Modify: `frontend/src/cards/cardRules.ts` + `cardRules.test.ts` (`ruleSections`), `frontend/src/components/HeroCard.tsx` (`onInspect`, `isFocused`; `renderCardDetails` uses `ruleSections`), `frontend/src/components/BattlePhase.tsx`, `frontend/src/App.tsx` (slot inside `.battle-combined-info`; `battleInspect` state), `frontend/scripts/check-tokens.mjs` (add `styles/BattleDetails.css`)

**Interfaces:**
- Consumes: `InspectedCard`, `FocusSide` from Task 2.
- Produces:
  - `ruleSections(hero: { name: string; Ability?: {name: string; description: string}[]; Special?: ... }): Array<{ label: 'Ability' | 'Special'; name: string; description: string }>`: abilities first, then specials; Bomber's special is named `'Explosion'`.
  - `HeroCard` props `onInspect?: () => void` (when set, read mode is `'none'`; a click that does not choose the card calls `onInspect` and stops propagation; dead cards are inspectable) and `isFocused?: boolean` (adds class `focused` and `data-focused="true"`).
  - `BattleDetailsPanel` props `{ hero: Hero; side: FocusSide; isFocused: boolean; onClose: () => void }`; root `<aside className="battle-details" data-side={side} data-keep-details data-tutorial="details-panel" role="dialog" aria-label={hero.name}>`; close X via `CloseButton` with `aria-label="Close details"`; tags "Enemy" / "Your hero", "Focused", "Fallen".
  - Slot: App renders `<div id="battle-details-slot" />` as the first child of `.battle-combined-info` (which becomes `position: relative`); BattlePhase portals the panel there (renders nothing if the slot is absent).
  - `BattlePhase` prop `onInspectChange?: (inspected: InspectedCard | null) => void`; App keeps `battleInspect` for Task 6.
- Panel layout: `position: absolute; inset: 0` over the whole `.battle-combined-info`, opaque panel token background, `container-type: size`; card box `--card-w: min(92cqw, 48cqh * 260 / 391)`; rules text at `var(--phone-sidebar-font)` on phones, 15px on desktop, `overflow-y: auto`. Short-screen block: card at most `40cqh` tall, header 40px.
- Closing: a document `click` whose target is not inside `.hero-card, [data-keep-details]`; Escape; `closeDetails()` in every action handler (attack, ability, special, end turn); a change of `currentTurn` / `activeHero.playerIndex` / `activeHero.heroIndex`; `phase === 'ended'`.
- In this task enemy cards still auto-target on tap as today (so battles stay playable); Task 4 removes that.

- [ ] **Step 1: Write the failing tests.** `cardRules.test.ts`: `ruleSections` of a hero with one ability and one special returns `[{label:'Ability',...},{label:'Special',...}]` in that order; Bomber's special `name === 'Explosion'`. `BattleDetailsPanel.test.tsx` (mock `../config` and `../battleAnimations` as `DisconnectBadge.test.tsx` does): markup contains the hero name, `Ability:` and the ability description, `data-side="enemy"`, `Enemy`, `aria-label="Close details"`; `isFocused` adds `Focused`; a hero at 0 HP adds `Fallen`; side `ally` shows `Your hero`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/cards src/components/BattleDetailsPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the panel, the `HeroCard` props, the slot, `inspected` state in `BattlePhaseView` (`useState<InspectedCard | null>`; hero looked up on its side by name) and the closing rules. All battle cards get `onInspect`.
- [ ] **Step 4: Verify** `npm test`, `npm run build`, `npm run check:tokens`; in the browser at 844x390 and 1440x900, tapping any card (own, enemy, dead) shows the panel over the left column, and each closing rule closes it.
- [ ] **Step 5: Commit** `feat(frontend): battle card details panel`.

### Task 4: Focus button and action bar

**Files:**
- Modify: `frontend/src/components/BattlePhase.tsx`, `frontend/src/styles/BattlePhone.css`, `frontend/src/styles/HeroCard.css` (`.hero-card.focused`), `frontend/src/styles/tokens.css` (`--focus-c`, `--focus-glow`)
- Test: `frontend/src/components/BattlePhase.focus.test.tsx`

**Interfaces:**
- Consumes: everything in Task 2's Produces; Task 3's `inspected` state, `closeDetails()`, `HeroCard.isFocused`.
- Changes: remove `getTargetableEnemies`'s auto-target tap and the "Select an enemy to target first!" early return; the action bar always shows the active hero, then a `Focus: <Name>` / `Focus: none` line, then the Focus button (when `focusButtonState(...).show`, with `activeHeroHasAllyAbility = abilityTargeting.some(t => t.kind === 'ally')` and `tauntTarget = tauntTargetFor(activeHero, opponent)`; `className="action-button focus-button" data-tutorial="focus" data-keep-details`; click → `socketService.selectTarget(name, side)`), then Attack / abilities / special / End Turn. Attack label and disabled state come from `attackGate`/`attackLabel`; each ability from `gameState.activeHero.abilityTargeting?.[index] ?? UNKNOWN_TARGETING` via `abilityGate`/`abilityLabel`, combined with the existing used/silenced/bribed rules (drop the old "(Target Dead)" suffixes). Self/all abilities call `socketService.useAbility(index, focus?.name ?? '')`. Chrono Shift and `requires_ally_target` keep their ally-pick sub-step, during which ally cards stay `isSelectable` and a tap picks rather than inspects. `isFocused` on the focused card (by side); `isSelected` no longer marks targets. Enemy `isBlocked` = my turn and Focus would be disabled by taunt or untargetable.
- `.hero-card.focused`: static outline and glow from `--focus-c` / `--focus-glow` (CSS only; the crosshair and its motion are Task 5).

- [ ] **Step 1: Write the failing tests** with `renderToStaticMarkup(<BattlePhase …/>)` and a canned `GameState` (mock `../socketService`, `../config`, `../battleAnimations`; my turn; enemy team Warlock, Shroomguard, Plague Spreader):
  - Barbarian active, no focus: markup contains `Focus an enemy first` inside a `disabled` attack button; Reckless Swing button disabled with the same label.
  - `selectedTarget: 'Warlock'`: contains `Attack Warlock` and `Reckless Swing on Warlock`, both enabled; the Warlock card has `data-focused="true"`.
  - Druid active, Warlock at 0 HP, `focusLocked: true`, `hasUsedAttack: true`: contains `Warlock has fallen` (disabled) and an enabled `Wildshape` button.
  - Opponent's turn: no `data-tutorial="focus"` in the markup.
  - Timekeeper active: Chrono Shift reads `Focus an enemy first` (disabled) with no focus, and `Chrono Shift on Warlock` (enabled) with a live Warlock focus.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/BattlePhase.focus.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring and CSS. Focus button and labels fit the Actions sidebar at 844x390 and 667x375 (long names wrap, no overflow; short-screen rules in the end block of `BattlePhone.css`).
- [ ] **Step 4: Verify** `npm test`, `npm run build`, `npm run check:tokens`; a local friendly battle (two admin tabs): tap enemy → panel + Focus; Focus → marker + "Attack <Name>"; switching works until the first action, then "Focus locked".
- [ ] **Step 5: Commit** `feat(frontend): focus an enemy before attacking`.

### Task 5: Focus marker [Fable]

Purely visual drawing and animation: runs on Fable.

**Files:** `frontend/src/components/HeroCard.tsx` (an `aria-hidden` `.card-focus-mark` element rendered when `isFocused`), `frontend/src/styles/HeroCard.css`, `frontend/src/styles/tokens.css`

**Interfaces:** consumes `HeroCard.isFocused` and `.hero-card.focused` from Task 4; no new props.

- [ ] **Step 1: Draw** a crosshair mark over the focused card's art (inline SVG, colours from tokens) and a slow red pulse on the glow. Readable on a 78px tiny card and a 260px card; does not cover the HP/Defense gems or the name.
- [ ] **Step 2: Respect motion settings:** no pulse with `prefers-reduced-motion: reduce` or "Battle animations: off" (reuse `cardMotionOff`); the mark itself stays.
- [ ] **Step 3: Verify** `npm run check:tokens`, `npm run build`; screenshots of a focused card at 78px and 234px, 844x390 and 1440x900.
- [ ] **Step 4: Commit** `feat(frontend): crosshair marker on the focused card`.

### Task 6: Battle tutorial teaches tap → Focus → Attack

**Files:**
- Create: `frontend/src/components/tutorial/battlePrompts.ts`, `frontend/src/components/tutorial/battlePrompts.test.ts`
- Modify: `frontend/src/components/tutorial/BattleTutorial.tsx` (uses `pickBattlePrompt`; new prop `inspected: InspectedCard | null`), `frontend/src/App.tsx` (passes `battleInspect`)

**Interfaces:**
- Consumes: `InspectedCard`, `AbilityTargeting` (Task 2); `data-tutorial="focus"` and `data-tutorial="details-panel"` (Tasks 3–4).
- Produces (`LogEntryLike` and `Prompt` move here from `BattleTutorial.tsx`; `OverlayStep` from `TutorialOverlay.tsx`): `type PromptKind = 'poison' | 'crit' | 'log' | 'inspect' | 'focus' | 'attack' | 'ability' | 'endturn'`; `interface BattlePromptInput { me: Player; myTurn: boolean; battleLog: LogEntryLike[]; shown: ReadonlySet<PromptKind>; inspected: InspectedCard | null; attackReady: boolean; abilityReady: boolean; activeTargeting: AbilityTargeting | null }`; `pickBattlePrompt(input: BattlePromptInput): { kind: PromptKind; step: OverlayStep } | null`; `promptFinished(kind: PromptKind, s: { focused: boolean; inspectedEnemy: boolean; usedAttack: boolean; usedAbility: boolean; myTurn: boolean }): boolean`.
- Copy (exact):
  - intro `image`: "Your hero's abilities and specials are written on the card. Tap any card to read it in the panel on the left. Each turn, your hero can use 1 attack and 1 ability."
  - `inspect` (my turn, no focus, no enemy inspected), target `.opponent-area .team-display`, interactive: "Tap an enemy hero to see its card."
  - `focus` (my turn, no focus, enemy inspected), target `[data-tutorial="focus"]`, interactive: "Press Focus to make this enemy your target. You can switch until you attack or use an ability."
  - `attack`: "Now press Attack to strike the enemy you focused!"
  - `ability` when `activeTargeting.kind` is `enemy`/`ally`: "Your ability hits your focused target too. Press it!"; when `self`/`all`: "This ability doesn't need a focus. Press it!"
  - `poison`, `crit`, `log`, `endturn`: unchanged.
- Finished: `inspect` when an enemy is inspected; `focus` when `me.selectedTarget` is set; others as today.

- [ ] **Step 1: Write the failing tests:** no focus + nothing inspected → kind `inspect`; enemy inspected → kind `focus` whose `step.target` is `['[data-tutorial="focus"]']`; focused and `attackReady` → `attack`; used attack, Druid (`{ kind: 'self', damaging: false }`) → `ability` with "This ability doesn't need a focus. Press it!"; enemy-kind → "Your ability hits your focused target too. Press it!"; not my turn → `null` once `log` has been shown; `promptFinished('inspect', {inspectedEnemy: true, ...})` is true; `promptFinished('focus', {focused: true, ...})` is true.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/tutorial`. Expected: FAIL.
- [ ] **Step 3: Implement** `battlePrompts.ts` (move today's `pickPrompt` logic there) and wire `BattleTutorial` + App.
- [ ] **Step 4: Verify** `npm test`, `npm run build`; play the tutorial at 844x390 to the first end turn: every pointer lands on its target and the prompts appear in order inspect → focus → attack → ability → end turn.
- [ ] **Step 5: Commit** `feat(frontend): tutorial teaches tap, Focus, Attack`.

### Task 7: Sign-off

**Files:** none new (fixes only). Screenshots in `.superpowers/sdd/2026-11-18-battle-focus/signoff/` named `<shot>-<w>x<h>.png`, at **844x390, 667x375 and 1440x900**.

- [ ] **Step 1:** `cd backend && npm test`; `cd frontend && npm test && npm run build && npm run check:tokens && npm run lint` (note pre-existing lint failures, don't fix unrelated code).
- [ ] **Step 2: Shots from a local friendly battle** (two admin tabs; draft a Druid or Champion so a non-damaging ability is on hand):
  - `tap-enemy-panel-focus`: my turn, enemy tapped, panel over the left column, Focus button in Actions.
  - `focused-attack-named`: after Focus: crosshair on the card, "Attack <Name>" and "<Ability> on <Name>".
  - `focus-fallen-heal-enabled`: the focused enemy killed by the attack; Attack reads "<Name> has fallen" (disabled), Wildshape/Inspiring Crowd enabled. (Let the other tab end turns until the kill lines up.)
  - `opponent-turn-panel`: opponent's turn, a card tapped, panel shown, no Focus button.
  - `tutorial-inspect`, `tutorial-focus`, `tutorial-attack`, `tutorial-ability`: the four tutorial prompts.
- [ ] **Step 3: Checks** at each size: panel text ≥12px (`getComputedStyle`), no horizontal page scroll, Focus and action buttons ≥40px tall on 844x390 and 667x375; tapping empty space, acting and turn change each close the panel; reload the acting tab mid-turn after an attack: focus marker and "Focus locked" still shown; Chrono Shift ally pick still works; reduced-motion pass shows the mark without the pulse.
- [ ] **Step 4:** Put the screenshot set in front of the owner and wait for his OK. After the OK: deploy the server, then the site; spot-check on 844x390 emulation.
