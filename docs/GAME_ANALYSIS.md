# Hero's Call — Game Mechanics Analysis

Snapshot of how the game *actually* works in code as of commit `65021fc` (2026-10-15). Use it as the reference before changing rules, adding heroes, or tuning balance. Where the code and the card text disagree, the code is described and the mismatch is flagged.

Line numbers drift, so look up the function by name if a line looks wrong.

---

## 1. Architecture at a glance

| Piece | File | Role |
|---|---|---|
| Rules engine | [backend/gameManager.js](../backend/gameManager.js) (~8.8k lines, one class) | All game state, draft, battle resolution, modes, rewards |
| Dice & status helpers | [backend/utils.js](../backend/utils.js) | d20 rolls, damage dice, status application, end-of-turn ticks |
| Hero data | [backend/heros.json](../backend/heros.json) | 57 heroes (40 enabled, 17 `disabled: true`) |
| Server / sockets / REST | [backend/server.js](../backend/server.js) | Socket handlers, turn timer, auto end-turn, tutorial bot, shop API, reward emission |
| Persistence | [backend/database.js](../backend/database.js) | SQLite: users, player_stats, quests, friends, messages, gauntlet saves; XP/level math |
| Daily quests | [backend/quests.js](../backend/quests.js) | 3 fixed daily quests |
| Battle animation events | [backend/battleEvents.js](../backend/battleEvents.js) | Before/after snapshots → FX events |
| Client | [frontend/src/](../frontend/src/) | React/Vite. Renders server state; no rules logic found client-side |

**State lives only in memory** (`this.games`, `this.gauntletRuns`, queues). A server restart kills every match in progress. Survival progress and Gauntlet saves go to the DB; matches do not.

**The server is the authority for combat rolls.** Account actions are protected by a login token (`auth.js`), and Survival teams, Gauntlet saves, shop purchases and turn order are validated server-side. A few trust gaps remain (§9 "Still open").

**Most hero mechanics are hardcoded by name** (`if (hero.name === 'Monk')`, `special.name === 'Arcane Shield'`, etc.). The JSON `effects` blocks are only partly data-driven. **Adding a hero almost always needs engine code**, not only JSON. See §10.

---

## 2. Core rules

### 2.1 Stats
- **HP**: 14–25 (enabled median 18, mean 17.8)
- **Defense (AC)**: 5–11 (median 7, mean 7.15)
- **Accuracy**: +1 to +3, added to the d20
- **BasicAttack**: a dice string (`1D6`, `2D4`), or `—` for no basic attack

### 2.2 Attack roll — [utils.js `calculateAttackRoll`](../backend/utils.js#L74)
- `d20 + Accuracy ≥ target effective Defense` → hit.
- **No automatic miss on a natural 1, and no automatic hit on a natural 20.** (A natural 20 always hits in practice: max AC 11 + buffs.)
- **Crit** = natural roll ≥ crit threshold (20; Swordsman 17).
- **Crit = maximum damage on every die**, not double dice ([utils.js `calculateDamage`](../backend/utils.js#L133)). Champion's Last Stand d6s and Hoarder's collected dice also max out on a crit.
- **Advantage/disadvantage**: roll 2d20 and take the higher/lower. Sources are **counted**: net = (number of advantage sources) − (number of disadvantage sources). Two advantages beat one disadvantage. This differs from D&D, where any mix cancels. See `hasAdvantageDisadvantage` ([gameManager.js:1689](../backend/gameManager.js#L1689)).

### 2.3 Damage
`calculateDamage(dice, isCrit, advantage, caster, isBasicAttack)` adds, in order:
1. The rolled dice (or the max on a crit)
2. `statusEffects.damageStacks` (Berserker Bloodbath, max 2)
3. `passiveBuffs` with `stat: 'damage'` (Warlock Dark Pact +1)
4. `scalingBuffs.damage` × 1D6 (Champion Last Stand)
5. Basic attacks only: Hoarder's collected dice

Then, depending on the damage path: Arcane Arrows +1D4, damage reduction (Arcane Shield, Protective Gear), HP loss, and reactive triggers. **The paths are not consistent with each other** (§4).

### 2.4 Turn structure
- **A turn belongs to one hero.** That hero may take **1 basic attack + 1 ability, in either order**, plus a manual special if it has one (Mech, Diplomat). Overrides:
  - Assassin: no basic attack; ability twice
  - Blood Hunter: no basic attack; each of its 2 abilities once
  - Brawler: 2 basic attacks, no ability
  - Berserker below 10 HP: 2 basic attacks
  - Monk: One-Two Punch hit grants +1 basic attack
  - Sorcerer: Twin Spell hit grants a second cast
- **You must select a target before any action** (`selectTarget`), including self-only abilities.
- **Turn order is strict player alternation.** Each player cycles through their own living heroes left→right (`getCurrentTurnInfo`, `advanceToNextValidTurn`, [gameManager.js:4606](../backend/gameManager.js#L4606)).
  - ⚠️ **Key design property:** killing an enemy hero does **not** reduce the enemy's actions. A lone survivor acts *every* enemy turn. Focus fire removes HP, auras and abilities, but never tempo. The game has a strong built-in comeback mechanic, and low-hero-count teams concentrate all their actions on their best remaining hero.
- **"Round"** is informal. Most "once per round" flags reset at the start/end of the owning player's turn, not on a global round counter. Monk Deflect resets only when the Monk itself ends a turn.
- **First player penalty**: the first player's leftmost hero starts **silenced for its first turn** ("First Pick Disadvantage", [gameManager.js:1421](../backend/gameManager.js#L1421)). One daily quest rewards winning while going 2nd, which suggests going 2nd is considered harder.
- **Initiative**: each side rolls 1d20 (ties re-rolled up to 10 times). The winner chooses first or second; the server rejects a choice from anyone else. Draft/Random do this automatically after setup.
- **Turn timer**: 30 s, then auto end-turn ([server.js:932](../backend/server.js#L932)). **Disabled in Gauntlet and Tutorial.** A 3 s auto-end fires when the active hero has nothing left to do (opt-out per player).
- **Disconnect**: 30 s grace, then forfeit (battle phase only).
- **Win**: the side with no living heroes loses. Both sides dead at once = `'TIE'`. Surrender is allowed only in the battle phase.

### 2.5 Positioning
Team order (left→right = index 0→2) is chosen in the setup phase and matters for:
- Adjacency auras: Warlock, Timekeeper, Paladin, Dual Defender (ally to the right), Diplomat
- Who acts first
- The first-player silence (leftmost hero)
- Multi-target splash: Fighter hits the target's left neighbour, Elementalist the right one, Pyromancer both
- Enemy adjacency is computed on the **living** enemies only, so a dead hero closes the gap.

---

## 3. Status effects — real behaviour

| Effect | Applied by | How it actually expires / works |
|---|---|---|
| **Poison** (stacks) | Assassin, Plague Spreader, Shroomguard | Deals `stacks` damage at the **end of the poisoned hero's own turn**. **Stacks never decay** — only Shroomguard's Cleansing Spores (one random ally) or Angel's resurrection clear them. Poison kills skip the Bomber explosion (no killer). Mech is immune (`Immunities`). |
| **Taunt** | Warden, Mech (ability), Paladin (Shield of Faith, queued until end of the attacker's turn) | Forces target selection. Duration ticks down at the end of the taunted hero's turn. Removed if the taunter dies. |
| **Silence** | Silencer, First Pick Disadvantage | Blocks abilities. Ticks down at the end of the silenced hero's turn. |
| **Stun / disableAttack** | Dual Defender | Blocks basic attacks for the next turn. |
| **grantAdvantage** (Guiding Bolt) | Cleric | The next attack or ability roll against the target has advantage; consumed on use. |
| **rideDownDebuff** | Cavalier (any damaging hit) | **Basic attacks** (not abilities) against the target have advantage **until it is healed to full HP or the Cavalier dies.** Effectively permanent. |
| **Stat modifier** (Defense −1) | Ranger Piercing Shot | Expires at the start of the Ranger's next turn. Deleting it removes the whole `statModifiers.Defense` entry, so stacked sources would all vanish together. |
| **Untargetable** (Vanish) | Ninja | Single-target actions can't select it, **except by the hero that triggered it**. AOE ignores it. Ends at the start of the Ninja's turn. |
| **Health Link** | Angel | The next time Angel takes damage from an ability or basic-attack path, the same amount hits every linked hero; then the link is removed. Does not trigger from poison, turrets, burn or aura damage. |
| **cannotTargetWithAbility** (Bribe) | Hoarder | The target can't aim abilities at Hoarder until the start of Hoarder's next turn. |

---

## 4. The damage pipeline

**Fixed 2026-10-15.** Every HP loss from damage goes through one function, `dealDamage(game, target, amount, attacker, options)` ([gameManager.js](../backend/gameManager.js)). It always runs the same steps in the same order:

> damage negation (Arcane Shield, Protective Gear) → HP loss → HP-based conditions (Dragon Rider, Berserker…) → Health Link (Angel) → Paladin taunt (attacks only) → Vanish (needs another hero as attacker) → Poison Aura → death processing (Angel resurrection, Hoarder, auras, Bomber…)

It returns `{ dealt, final, negated, died, effects }` (HP actually lost, amount after negation, fully negated?, died?, log entries).

Options: `source` (label), `reducible: false` (poison ticks, self recoil, Health Link reflection), `isAttack: true` (basic attacks, abilities, Beast, Totems, splash: only these can trigger Shield of Faith), `reflect: false`, `killer` (who gets credit; `null` for aura/explosion kills so a Bomber can't chain), `cause`.

Paths now using it: basic attack, ability damage, lifesteal, recoil, Pyromancer splash and burn, Plague Spreader aura, Mech Self Destruct, Warden Shield Bash, Bomber explosion, Engineer turrets, Beast Tamer command, Shaman totems, Diplomat's commanded attacks, Monk Deflect counters, Health Link reflection, and poison ticks (`utils.processEndOfTurn` takes a callback).

The only remaining direct HP write is Mech's self-sacrifice (`currentHP = 0`), which is a cost, not damage.

**Monk Deflect** is a roll check, not damage, so it has its own shared helper, `tryMonkDeflect`, used by every rolled attack: basic attacks, abilities, Beast Tamer, Shaman, Pyromancer splash, Diplomat's commanded attacks.

Behaviour changes that came with this (worth knowing when tuning):
- Beast Tamer and Shaman now roll with `modifiedAccuracy` (Cleric's Bless helps them), roll damage once (no more best-of-two on advantage, no more triple roll), and can be negated, deflected, reflected and punished like any other attack.
- A Warden's Shield Bash no longer fires when its attacker was *deflected* by a Monk (a deflected hit isn't a miss).
- Turrets, burn, auras and counters can now trigger Vanish and Poison Aura consistently; they never trigger Paladin's taunt.

**Hero identity.** Both players can field the same hero, so nothing is looked up by name across teams any more. `getTeamIndex` / `getOwner` compare the hero objects; `findEnemyHeroByName` / `findAllyHeroByName` search one side only. Effects that must remember their source store a hero id (`sourceHeroId` on aura buffs, `ownerId` on Bribe, `sourceId` on Health Link, `statModifierCasterIds` on timed stat modifiers). Ids are `"<playerIndex>-<heroIndex>"`, assigned by `ensureHeroIds`. There is deliberately no `findHeroByName`.

---

## 5. Hero roster (40 enabled)

Stats are HP / AC / Accuracy / Basic attack. "Impl" notes how the code actually behaves.

| Hero | HP | AC | Acc | BA | Ability | Special | Impl notes |
|---|---|---|---|---|---|---|---|
| Barbarian | 25 | 8 | +1 | 1D6 | Reckless Swing 2D6, 2D4 recoil (on hit) | Ignores taunt & deflect | Taunt is ignored in both targeting and attack validation (fixed 2026-10-15). Highest HP in the game. |
| Engineer | 15 | 6 | +1 | 1D4 | Summon turret (max 2); each deals 1D4 to a random enemy at end of turn | Sacrifice a turret to negate a damage instance | Protective Gear eats a turret even on 1 damage. Only checked on paths with damage reduction. |
| Assassin | 18 | 9 | +3 | — | Poison Strike 1D6 + 1 poison | Ability twice/turn | 2 casts × 2 permanent poison stacks is strong over a long game. |
| Paladin | 19 | 10 | +1 | 1D4 | Divine Smite 1D4 + heal lowest ally 1D4 (on hit) | Taunt anyone who damages an adjacent ally | Taunt is queued to the end of the attacker's turn. |
| Sorcerer | 15 | 6 | +2 | 1D6 | Chromatic Orb 1D8 | Twin Spell: on hit, cast again | Implemented as a **guaranteed** second cast on hit (once/turn), not a roll. |
| Druid | 17 | 7 | +1 | 1D6 | Wildshape: heal self 1D4 | End of turn: heal lowest-% ally 1D4 | Healing Word **includes the Druid itself**, unlike `getTargetsForEffect('lowest_health_ally')`, which excludes self. |
| Cleric | 20 | 10 | +1 | 1D4 | Guiding Bolt 1D4 + advantage on next roll vs target | Bless: allies +1 accuracy | |
| Monk | 16 | 9 | +2 | 1D4 | One-Two Punch 1D6, +1 basic attack on hit | Deflect: ally hit by a roll < Monk AC → negate, 1D4 back | Deflect only matters for allies with AC < 9: it stops attack totals from their AC up to 8. Once per Monk turn, shared across the team. |
| Cavalier | 20 | 9 | +2 | 1D6 | Trample 1D6 | Ride Down: basic attacks vs hit enemies get advantage | Near-permanent debuff (until full heal). Strong with Brawler/Berserker/Fighter teams. |
| Piercer | 19 | 8 | +2 | 1D6 | 1D4, +1D6 if target AC > 8 | Advantage vs AC > 8 | Hard counter to the AC 9–11 tanks. |
| Silencer | 18 | 7 | +2 | 1D6 | 1D6 + silence | Enemy abilities aimed at Silencer have disadvantage | |
| Berserker | 18 | 7 | +2 | 1D8 | +1 dmg stack (max 2) | < 10 HP: two attacks | Ability does no damage. Bloodbath stacks also add to ability damage. |
| Wizard | 15 | 5 | +3 | 2D4 | Fireball 1D4 to all enemies | First instance of > 5 damage → 0 | Lowest AC in the game; Fireball rolls separately per target. |
| Fighter | 18 | 8 | +2 | 1D6 | Cleave 1D6 target + 1D6 left neighbour | < 10 HP: attacks have advantage | Separate roll per target. |
| Warlock | 16 | 6 | +2 | 1D4 | Lifesteal 1D6 | Adjacent allies +1 damage | Dark Pact adds to every damage roll, including per-target AOE rolls. |
| Warden | 21 | 11 | +1 | 1D4 | Compel Duel 1D4 + taunt | Basic attack misses on Warden → attacker takes 1D6 | Highest AC. Shield Bash also fires when a Monk deflects an attack aimed at the Warden. |
| Champion | 18 | 8 | +2 | 1D6 | Heal self 1D4 (1D6 below 11 HP) | Per fallen ally: +1 AC, +1D6 dmg | Scales into the late game; pairs with the action-economy property in §2.4. |
| Ranger | 18 | 7 | +3 | 1D8 | Piercing Shot 1D6, −1 AC until Ranger's next turn | Advantage on everything | Permanent advantage + top accuracy; ~98% hit rate vs AC 7. |
| Blood Hunter | 18 | 6 | +2 | — | Crimson Rite 3D4 (take 2D4) / Sanguine Renewal 1D4 lifesteal | Both abilities each turn | |
| Shaman | 18 | 6 | +2 | 1D6 | On hit: +1 totem (max 3), 1D4 per totem | Allies +1 AC | Totems only grow on a hit. Rolls with modified accuracy and goes through the shared damage pipeline (§4). |
| Timekeeper | 16 | 6 | +2 | 1D6 | Chrono Shift: on hit, an ally uses its ability | Adjacent allies: advantage on abilities | The commanded ability rolls normally (the "auto-hit" log text is stale). Commanding Fighter/Elementalist skips the splash (only `adjacent_enemy` is checked). ⚠️ `useTimekeeperSelectedAbility` doesn't check silence or "already used ability". |
| Ninja | 15 | 7 | +2 | 1D4 | Sharpened Shuriken 2D6 | After being hit, untargetable except by that attacker | Strong burst. Featured in a daily quest. |
| Dragon Rider | 20 | 10 | +2 | 1D6 | Fire Breath 3D4 | At ≤ 8 HP: −3 AC and ability lost, permanently | Top naive DPS and top-tier bulk until it dismounts. Card says "below 9" = code ≤ 8, consistent. |
| Bomber | 14 | 5 | +1 | 1D4 | Bomb Toss 1D6 to all enemies | On death: 1D6 to killer | Lowest HP. No explosion on poison/aura deaths, or when an Angel resurrects it. |
| Beast Tamer | 17 | 6 | +2 | 1D4 | 1st use: summon beast; after: beast 2D8 | Basic attacks have advantage while the beast is out | Command damage uses the shared pipeline (negation, deflect, Vanish, death triggers). Takes a full turn to set up. |
| Brawler | 18 | 8 | +2 | 2D4 | — | Two basic attacks, no ability | |
| Reaper | 17 | 6 | +1 | 1D8 | Soul Harvest 1D8; heal to full on kill | Enemies −1 AC | |
| Plague Spreader | 15 | 6 | +1 | 1D6 | 1D4 + that many poison | Start of turn: **all other heroes, including allies**, take 1D4 | Self-damaging aura; best with high-HP allies. |
| Dual Defender | 20 | 10 | +1 | 1D4 | 1D4 + target can't attack next turn | Ally to the right uses Dual Defender's AC | Copies AC *including* buffs at battle start. Restored on death. |
| Swordsman | 17 | 8 | +1 | 1D8 | Colossal Strike 1D8 | Crits on 17–20 | 20% crit rate; crits max the dice. |
| Ace | 18 | 7 | +2 | 1D6 | Stacked Deck 2D4 (+1D4 on crit) | Natural 1 → auto-hit crit | Effectively a 10% crit rate. |
| Elementalist | 17 | 6 | +2 | 1D6 | Thunderclap 1D4 target + 1D4 right neighbour | +1 AC per landed hit until next turn | |
| Mech | 22 | 5 | +2 | 1D6 | Charged Fist 1D6 + taunt | Manual, once: 2D6 to **all** heroes (each rolls to hit), Mech dies | Poison immune. |
| Diplomat | 17 | 7 | +1 | 1D4 | Declare War: adjacent allies basic-attack the target | Manual, once: heal **all** heroes 2D6 (one roll) | Stunned or attack-disabled allies are not commanded to attack (fixed 2026-10-15). |
| Arcane Archer | 16 | 6 | +2 | 1D4 | Far Shot 1D4 (+1D8 at full HP) | +1D4 vs enemies it already damaged | |
| Shroomguard | 19 | 6 | +2 | 1D8 | 1D4 + cleanse poison from a random poisoned ally | When damaged: **every** hero gets 1 poison | Poison Aura fires on every damage instance, including its own poison ticks. Very swingy: a team of Shroomguard + Mech + high HP turns it into a stall engine. |
| Angel | 16 | 6 | +2 | 1D4 | Health Link 1D4 + link | Once: resurrect the first ally that dies at half HP | Resurrection wipes **all** of the ally's `statusEffects`: poison, but also totem/turret/med-bot counts and Arcane Shield state. |
| Pyromancer | 22 | 6 | +1 | 1D6 | Incinerate 1D6; on kill, 1D6 splash to neighbours (chains) | End of turn: itself + all enemies take one shared 1D4 | The self-burn can kill it. |
| Medic | 16 | 6 | +1 | 1D4 | Summon med bot (max 3) | End of turn: heal lowest-HP damaged ally 1D4 per bot | Uses raw HP, not %, unlike Druid. |
| Hoarder | 16 | 6 | +1 | 1D4 | Offer Bribe 1D4 + bribe | Gains the basic attack dice of **any** hero that dies, either side | Late-game scaler. |

**Disabled (17):** Bard, Witch Doctor, Pixie, Serpent, Venom, Knight, Hacker, Shadow, Guardian, Phoenix, Blacksmith, Healer, Sniper, Agent, Mime, Gambler, Arcanist. Their JSON exists but much of their engine support is missing or partial. Treat re-enabling any of them as new-hero work.

**Starter heroes** (new accounts, and the Gauntlet starter pool): Assassin, Barbarian, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Sorcerer, Wizard ([database.js:1463](../backend/database.js#L1463)).

---

## 6. Balance analysis

### 6.1 The game is a high-hit-rate damage race
With median AC 7 and +2 accuracy, an attack needs a natural 5+: an **80% hit rate**. Each point of AC or accuracy moves that by only 5%. Effective HP against a +2 attacker:

- AC 11 Warden: 21 HP ÷ 0.60 = **35 effective HP**
- AC 5 Wizard: 15 ÷ 0.90 = **16.7 effective HP**

The tanks are worth about 2× a squishy, purely from AC + HP.

### 6.2 Naive per-turn damage
Basic attack + best ability, × hit chance vs AC 7. This ignores specials, so it under-rates Assassin, Brawler, Blood Hunter, Berserker and the summoners.

| Tier | Heroes (naive EV/turn) |
|---|---|
| High | Dragon Rider 8.8, Fighter 8.4 (2 targets), Barbarian 7.9, Ninja 7.6 |
| Mid | Ranger, Reaper, Swordsman, Ace, Elementalist ~6.8; Sorcerer, Wizard 6.4 |
| Low | Paladin / Cleric / Warden / Dual Defender ~3.8; Shaman, Timekeeper, Champion ~2.8 at start; Beast Tamer, Engineer, Diplomat, Medic ~2 |

A typical hero (~18 HP) dies to about **3 focused enemy turns**, so a match lasts roughly 9–15 player-turns.

### 6.3 Observations worth testing in playtests or a simulator
- **Dragon Rider** looks like the strongest all-rounder: top-3 bulk (20 HP, AC 10) **and** top damage until dismount at ≤ 8 HP. Dismounting still leaves 1D6 basic attacks.
- **Barbarian** has the best HP and good damage. If the taunt-ignore bug (§9) is fixed, it gets stronger.
- **Ranger**: permanent advantage at +3 means ~98% hits vs AC 7 (~88% even vs Warden). Likely the best starter.
- **Setup heroes are weak in a race this fast.** Beast Tamer, Engineer and Medic spend turn 1 doing nothing to the enemy. Shaman's totems only grow on hits. With ~3 turns per hero lifetime, many never pay off.
- **Comeback dynamics** (§2.4): Champion, Hoarder and Berserker scale as allies die *and* as their own action share grows. These heroes are better than their numbers suggest.
- **Poison** is permanent and stacks. In long games, Assassin (2 stacks/turn) and Plague Spreader quietly dominate. Consider decaying 1 stack per tick.
- **Shroomguard** spreads poison to its own team too. It is either a stall engine or a liability, depending on the comp.
- **First-player silence** only removes one ability use; going first still gets the extra action in odd-length games. The win rate by seat is worth logging.

### 6.4 Suggested tooling
A headless simulator (`node sim.js HeroA,HeroB,HeroC vs X,Y,Z × 10k`) that drives `GameManager` with a random or greedy policy would turn these hunches into numbers. The engine is already headless; the blockers are the `database` dependency in draft/random setup and the `setTimeout` in `applyStatusEffect('untargetable')`.

---

## 7. Game modes

| Mode | Unlock (client-side) | Team source | Notes |
|---|---|---|---|
| **Random** | Always | 3 random from **your own** collection | No draft. **Mirror matches are common** (everyone owns the 10 starters), which triggers the duplicate-name bugs in §9. VP = 1 per surviving hero. |
| **Draft** | Level 3 (enforced server-side; friend rooms and challenges are exempt) | Ban/pick | Needs 5+ heroes, and 10 different heroes between the two players. Each player bans 1 from 5 random heroes of the **opponent's** collection (the two hands never share a hero). Hands swap, so each player then picks from 4 heroes of their **own** collection; the swapping continues for 3 picks each. Players whose collections can't fill two separate hands aren't matched with each other and keep waiting. Then reorder and roll initiative. VP = 2 + 1 per surviving hero. |
| **Survival** | Own 21+ heroes (checked server-side) | Client names 3 heroes; the server validates ownership and rebuilds them | Up to 7 wins or 3 losses. **Winning heroes are banned for the rest of the run**; losing heroes stay available. 7 wins × 3 heroes = 21 heroes, which is why the unlock is 21. Ties count as a loss for both. **A run pays once, when it ends** (see §8.2). |
| **Gauntlet** | Visible in the lobby (since the 2026 UI redesign) | Roster of 6 random starters | 13 trials in brackets A–E, against other players in the same bracket. Hero HP carries from one trial to the next. Heroes that fall keep their slot (a fallen hero can be replaced when a new hero is taken); a loss doesn't end the run. The run ends when fewer than 3 heroes are usable. After each battle the player may take one of two offered heroes (3 rerolls per run, or skip). One camp action per trial: heal a hero, revive a fallen hero for one battle, hire (another two-hero offer), or skip a trial (before trial 10). No turn timer. |
| **Tutorial** | First login | Scripted | Rigged d20s (`rig`), bot opponent. Reward: level up + top-up to **100 VP** total (once). |
| **Friendly room / Challenge** | Friends | Draft | XP only, no VP. |
| **Spectator** | — | — | Read-only view of live games. |

---

## 8. Progression & economy

### 8.1 XP & levels ([database.js `updatePlayerXP`](../backend/database.js#L878))
- Level N → N+1 costs **25 × N XP**. The cap is level 20, which takes 4,750 XP total.
- **Each level-up grants 12 VP.**

| XP source | Amount |
|---|---|
| Draft | win 10 / loss 3 |
| Random | win 5 / loss 1 |
| Tie | 10 |
| Survival (by wins) | 1→5, 2→10, 3→17, 4→26, 5→37, 6→50, 7→80. Paid once when the run ends |
| Gauntlet (by battles won) | 5 … 150 (13 wins). Paid once when the run ends or is abandoned |
| Daily quest | 15 each (3 per day) |

### 8.2 Victory Points (currency)

| VP source | Amount |
|---|---|
| Tutorial | 100 (one-time) |
| Level-up | 12 per level (~228 total across 19 levels) |
| Draft win | 2 + surviving heroes (3–5) |
| Random win | surviving heroes (1–3); surrender win 1–2 |
| Tie (draft/random) | 1 each |
| Survival run end | by wins: 1→1, 2→2, 3→4, 4→6, 5→9, 6→12, 7→16. Paid **once**, when the run ends (3rd loss, 7th win, or abandoning); losses and wins mid-run pay nothing. The same moment pays the run's XP |
| Gauntlet run end | 1 … 15, by number of battles **won** (13 wins = 15 VP); skipped trials and a run with no wins pay nothing |
| Daily quest | 3 each |

| VP sink | Cost |
|---|---|
| Single hero from shop rotation (6 unowned heroes, rotates every **15 min** — the comment says 6 h; only heroes currently on sale can be bought) | 5 VP |
| Pack (3 random unowned heroes) | 12 VP (4 VP/hero) |

There is nothing to buy once you own all 40. **VP has no late-game sink.** A new player owns 10 heroes, so 30 are buyable for 120–150 VP. The tutorial's 100 VP alone buys ~8 packs' worth of heroes. Survival (21 heroes) unlocks almost immediately after the tutorial.

### 8.3 Daily quests ([quests.js](../backend/quests.js))
These are fixed, not rotating: win a Survival battle, win with Ninja, win going 2nd. 15 XP + 3 VP each, guarded against double-award in SQL.

---

## 9. Bugs & exploits

Confidence: **C** = confirmed by reading the code path end-to-end. **L** = likely, needs a repro.

### Fixed 2026-10-15 (covered by `npm test` in `backend/`, plus an end-to-end run against the live server)
1. ✅ **Gauntlet reward farming.** Rewards are now paid for battles actually *won* (`trials_won`), once per run (`settleGauntletRun`). Start-then-abandon pays 0, skipping a trial doesn't count. The "best trial" record also counts wins.
2. ✅ **Gauntlet run-end XP paid twice.** `calculateAndAwardGauntletRewards` pays and returns the XP update; the server only announces it.
3. ✅ **Gauntlet saves were client-authored.** The save is the server's own copy (`getGauntletSaveState`). Loading rebuilds the run on the server (`restoreGauntletRun`: heroes rebuilt from the hero list, unknown dropped, HP and counters clamped). Loading a save previously never restored server state at all.
4. ✅ **Survival teams were client-authored.** `prepareSurvivalTeam` takes only hero *names*, requires exactly 3 distinct enabled heroes the player owns, not used by a win this run, and 21+ owned heroes; stats are rebuilt from `heros.json`.
5. ✅ **Shop trusted `userId`.** Login now returns a token (`auth.js`). Shop endpoints (`shop.js`), profile icon, favourites, logout and the socket `authenticate` event require it, and refuse a different user id. Purchases are limited to the current rotation, run one at a time per user, and spend VP in a guarded SQL statement so they can't overspend. The client keeps the token in memory ([authSession.ts](../frontend/src/authSession.ts)).
6. ✅ **Survival loss XP on every loss.** A run now pays once, when it ends (`settleSurvivalRun`): VP table + XP table + highest-run record. Mid-run wins and losses pay nothing. Run-end messages state the real VP amount.
7. ✅ **A perfect 7-win Survival run paid no VP.** It now pays the 16 VP tier and 80 XP. Abandoning a run now also pays its XP (it used to pay VP only).
8. ✅ **Duplicate VP awards.** `handleGameCompletion` pays each finished game once (`game.rewardsSettled`); a finished Survival match is settled once.
9. ✅ **Barbarian ignores taunt** in `selectTarget` and in the client's target list.
10. ✅ **Duplicate hero names** (mirror matches): see §4, "Hero identity". Fixed for Silencer, Haste, Monk Deflect, Paladin, taunts, Cavalier, Dual Defender, Reaper-style auras, Hoarder Bribe, Ranger-style timed modifiers, Health Link, Timekeeper commands, Hoarder collection.
11. ✅ **Beast Tamer Command skipped death processing, negation and deflect**; fixed by the unified pipeline (§4).
12. ✅ **Diplomat's Declare War ignored stuns** (`disableAttack`/`stun`); also respects `disable_basic_attack`.
13. ✅ **Initiative loser could choose the turn order.** `chooseTurnOrder` now requires the caller to have won the roll.
14. ✅ **Fresh databases couldn't register users.** `createTables` ran `ALTER TABLE users ADD COLUMN …` in parallel with `CREATE TABLE users`, so on a brand-new database the columns were silently never added. Now serialized.
15. ✅ **`/api/admin-login` crashed when it had to create an admin** (`bcrypt` was never imported).
16. ✅ **Draft unlock was client-only.** The server now refuses a player below level 3 or with fewer than 5 heroes, with a message the client shows. Matchmaking also skips opponents the player can't be dealt two full, separate hands against (previously the second hand could silently come up short). Friend rooms/challenges keep no level requirement but still need dealable hands.
17. ✅ **Gauntlet HP never persisted.** Teams now start each trial with the HP the run holds (`buildGauntletTeam`); Heal means something.
18. ✅ **Gauntlet roster corruption.** Revive brings the fallen hero back in place (it used to add a duplicate slot) and the hero falls again after the battle without removing anyone, so team indices never shift. Offers never contain a hero on the roster or lost earlier, the server holds the offer and refuses a hero it did not offer, and `setGauntletBattleTeam` needs three distinct whole slots.
19. ✅ **Gauntlet camp action burned by looking.** Viewing the hire offer used up the one action. Only a carried-out action does now; queueing is refused while queued or in a battle; asking for the offer again is free but shows the same two heroes (it used to be an unlimited free reroll). A skipped free offer is dropped.
20. ✅ **Gauntlet results never reached the client.** The payout is settled before the battle result is sent and rides with it.

### Still open
- **[C] `useTimekeeperSelectedAbility` skips the silence and ability-used checks.**
- **[C] `autoDraft` calls an undefined `shuffle()`** and would throw if the `auto-draft` event is ever sent.
- **[C] `resolveEffectTarget('adjacent_enemy')`** references undefined variables (unreachable today).
- **[C] Information leak:** `getFullGameState` sends both players' `draftCards` to both clients.
- **[C] Stat-modifier expiry deletes the whole stat** (`delete statModifiers[stat]`), not one source's share.
- **[C] Inconsistent "lowest health" rules** (Druid %, Medic raw HP, `getTargetsForEffect` excludes self).
- **[C] Other trust gaps not yet closed:** read endpoints (`/api/user/:id`, `/api/player-stats/:id`) are public; `/api/admin-login` gives anyone an all-heroes, 1000 VP account.

---

## Testing

`cd backend && npm test` (Node's built-in runner, no extra dependencies). Files in `backend/test/`:

| File | What it pins down |
|---|---|
| `damage.test.js` | Every damage source triggers the same reactions; `dealDamage` contract |
| `mirror.test.js` | Same hero on both teams; Barbarian taunt; Diplomat stun |
| `rewards.test.js` | Survival and Gauntlet payouts, once-only match VP (real temp SQLite DB) |
| `trust.test.js` | Tokens, shop authorization and races, Survival team validation, Gauntlet saves |
| `gauntlet.test.js` | Gauntlet HP carries between trials, revive in place, honest hero offers (never a roster hero, only an offered hero can be taken), one camp action per trial, queue rules, bracket matching |
| `turnorder.test.js` | Only the initiative winner chooses |
| `draft.test.js` | Draft level 3 unlock, 5-hero minimum, ban hands, compatible matchmaking |

Helpers in `test/support/`: `battle.js` (build a battle from hero names, force d20s with `setD20`, control other dice with `setRandom`) and `db.js` (throw-away SQLite). `server.js` itself starts a real server on import, so it isn't unit-tested: new logic goes in modules or `GameManager` methods that tests can load, and `server.js` only wires them to sockets. A scripted end-to-end run (real HTTP + Socket.IO clients against a server on a temp database) was used to verify the wiring on 2026-10-15; it lives outside the repo.

---

## 10. Adding or changing a hero — checklist

Because so much is name-keyed, adding a hero means:
1. Add the JSON entry to `heros.json` (stats, `Ability[]` with `primary_effects` / `secondary_effects`, `Special` with `trigger` / `condition` / `effects`).
2. Check whether every `effect.type`, `trigger` and `condition` you used is **actually handled**. Grep `gameManager.js` for the string. Unknown effect types hit `default: console.log('Unhandled effect type')` and silently do nothing.
   - Generic, data-driven pieces that exist: `damage`, `lifesteal_damage`, `heal`, `heal_to_full`, `conditional_heal`, `apply_debuff` (poison / taunt / silence / stun / disable_attack / stat_modifier / grant_advantage / health_link), `apply_buff`, `remove_debuff`, `recoil_damage`, `on_kill_splash`, `conditional_damage: owner_at_full_hp`, aura `stat_modifier`, `passive_modifier` (ignore_taunt / ignore_deflect), `grant_advantage` with `scope`, `modify_crit_range`, `owner_turn_start` damage `all_others`, `owner_turn_end` damage `all_enemies`, `on_death` damage `killer`, `on_miss_by_ac` damage `attacker`, `self_hp_lt_N` conditions.
   - Name-keyed (copying the JSON won't work): Monk, Beast Tamer, Engineer, Medic, Shaman, Timekeeper, Diplomat, Druid, Sorcerer, Ace, Cavalier, Paladin, Wizard, Angel, Hoarder, Champion, Dual Defender, Elementalist, Shroomguard, Silencer, Ninja, Mech, Dragon Rider.
3. Decide which damage path it uses and confirm the §4 triggers you expect actually fire.
4. Make sure `canHeroAttack` / `canHeroUseAbility` reflect any action-economy change, or auto end-turn will cut the turn short.
5. Add art/card rendering on the client ([HeroCard.tsx](../frontend/src/components/HeroCard.tsx)) and check the FX classification in `battleEvents.js`.
6. Test a mirror match (same hero on both sides).

---

## 11. Improvement ideas (design)

- **Unify damage** (§4) and **key by hero id** (§9.12). These two refactors remove most of the bug classes.
- **Poison decay** (−1 stack per tick) or a cap, so poison is a pressure tool rather than an inevitability.
- **Give setup heroes a turn-1 payoff**: e.g. Beast Tamer summons *and* deals 1D4, or Engineer starts with 1 turret.
- **Late-game VP sink**: cosmetics, card backs, profile icons, hero skins, or a hero mastery track. Currently VP is worthless once all 40 heroes are owned (~150 VP).
- **Rotating daily quests** from a pool, using hero, mode and position conditions. The `QUESTS` array is already data-driven.
- **Seat balance**: log first vs second win rates before tuning First Pick Silence.
- **Gauntlet**: before un-hiding it, make HP persist, fix reward farming (award only after ≥ 1 battle, or only for trials actually *won*), add a turn timer, and validate saves server-side.
- **A headless balance simulator** (§6.4), then publish per-hero win rates internally.

---

## 12. Open questions for the designer

- Is permanent Ride Down (until full heal) intended, or should it last one turn?
- Should Twin Spell need a roll (as the card says) or always trigger on hit (as coded)?
- Is the "killing heroes doesn't reduce enemy actions" property intended? It is the single biggest driver of game feel.
- Should Druid and Medic heal themselves? The current behaviour differs between the two.
- Should Survival losses pay XP each time, or only when the run ends?
- Shop rotation: 15 minutes (code) or 6 hours (comment)?
