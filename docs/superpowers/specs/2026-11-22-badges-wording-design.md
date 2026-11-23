# Hero's Call: battle badges, helper text, card wording and rule fixes: design

Date: 2026-11-22. Status: **approved by the owner on 22 November.** The healer question is settled (fix l) and every
call the designer made alone is accepted (see "Owner decisions" near the end). Branch: `redesign-badges` (from main b86095b).
Approved mockup: https://claude.ai/artifact/3rRuFwTcW4UZvMhbRtEqwE, kept in the repo as
`2026-11-22-badges-wording-mockup.html` (same folder). Owner decisions from 22 November are applied there.

## Intent

The small badges on battle cards (poison, taunt, turrets and so on) are emoji pills. Their helper text only shows
when a mouse hovers, so on phones and tablets nobody can read it. Many of the texts are wrong, and some badges stay
on the board after the hero that caused them has died. A check of the rules code also found real bugs, the worst
being a taunt from a dead Paladin that locks a hero out of its whole turn. The card texts are uneven: some say "you",
some "the Medic", some leave out the word "damage", and a few say something the game does not do.

The owner wants:

- every badge redrawn as a round token, using the drawings he approved;
- helper text that anyone can open, on any device, by tapping or hovering;
- five new badges, so players can see effects that are invisible today;
- the bugs fixed, so the game does what the cards say;
- the card texts rewritten in one plain style, without changing what any card does.

Success: on a sideways phone, a player taps a poison token and reads "Poison 3"; on a tablet the same tap shows the
whole sentence; opening a hero's details lists every badge with its sentence. Every badge appears when its effect
starts and goes away when it ends, and every card text matches what the game does.

## Goals

1. All buff and debuff badges become round tokens: green rim for a buff, red rim for a debuff, violet for poison, and a
   small number on the corner when the badge counts something. The pictures are the mockup's drawings.
2. Engineer's Turret badge is the golem's head, with the turret count. The card still says "Turret".
3. Shaman's Totem badge shows one carved head per Totem (1, 2 or 3). No number.
4. Helper text opens by tap or hover on every device. Phones show the short form, larger screens the full sentence,
   and the hero details view lists every badge with its full sentence.
5. New badges: Wind Wall, Taunt coming, Frenzy, Desperate Blows, Arcane mark. The dead "Inspired" badge goes.
6. The rule fixes listed below (a to l), each with a test.
7. New card texts for the 40 heroes in play (64 of 80 texts change), plus the switched-off heroes.
8. Ninja's Vanish works as its new card says, including "once per round".

## Non-goals

- No golem firing animation. The full golem drawing may later stand in for the turret when it shoots; not now.
- No per-card sounds.
- No badges for the 17 switched-off heroes' effects. Their card texts are updated (see step 2), their badges are not.
- No badges for team auras (Bless, Totemic Bond, Aura of Dread, Defend, Dark Pact, Haste). They already show in the
  card's numbers, and the mockup's badge list is the complete list for this work.
- No new heroes, no balance changes.

## Anti-goals

- Any rule change beyond the ones listed in "Rule fixes" below.
- Any card text or helper text that disagrees with what the game does.
- A wording change that changes what a card does.
- Helper text that only a mouse can open.
- A tap on a badge that also Focuses or selects the hero under it.
- A server deploy while people are playing.

## Approaches considered

- **A. Three steps, in this order (chosen).** Step 1: rule fixes on the server, each with a test. Step 2: card
  wording. Step 3: the new badges and helper text on the website. The badges and their texts then describe the game
  as it really works.
- B. Badges first. Rejected: the new helper text would describe buggy behaviour (for example, Vanish's
  "once per round" that the game does not yet enforce), and would need rewriting after the fixes.
- C. Everything in one big change. Rejected: too hard to review and too hard to find the cause if something breaks.

## Step 1: rule fixes (server)

Each fix gets a test in `backend/test/` that fails before the fix and passes after. One line per fix says what the
test does. "Ran" in the mockup means the bug was reproduced against the real rules code.

| # | Fix | Test scenario |
|---|---|---|
| a | **A waiting Paladin taunt is dropped when Paladin dies.** Today the taunt still lands at the end of the turn and points at the dead Paladin, so the taunted hero can't attack or use its ability next turn. | Enemy damages Paladin's neighbour, then kills Paladin in the same turn. Next turn that enemy can Focus, attack and use its ability normally, and has no taunt. |
| b | **Dark Pact stays after Warlock dies, always.** Today it vanishes when the bonuses are recounted (a Fighter, Berserker or Dragon Rider crossing an HP mark) because the dead Warlock is skipped. The "Dark Pact activated" log line also repeats on every recount; it should appear once, at battle start. | Warlock dies; then Fighter drops below 10 HP. Warlock's neighbours still deal +1 damage, and the log has exactly one "Dark Pact" battle-start line. |
| c | **A hero revived by Angel and killed again in the same turn dies properly.** Today its death is never processed: its aura stays all game, and Hoarder, Last Stand and Bomber's Explosion ignore it. | Shaman is revived by Angel, then killed again in the same turn (e.g. Brawler's second attack). Shaman's allies lose the +1 Defense, Hoarder gains Shaman's attack dice, Champion's Last Stand counts it. |
| d | **Ranger's Piercing Shot -1 Defense ends when Ranger dies.** Today it lasts forever if Ranger dies before its next turn. | Ranger hits an enemy with Piercing Shot, then Ranger dies before its next turn. The enemy's Defense is back to normal right away. |
| e | **When Piercing Shot's -1 Defense ends, the shown Defense goes back up.** Today the badge goes but the lowered Defense keeps working until someone uses an ability. | Piercing Shot, then Ranger's next turn starts. The enemy's Defense (shown and used in rolls) is back to normal with no other action. |
| f | **Correct numbers in helper texts.** Arcane Shield is "more than 5" (today ">6"), Turrets "each deals 1D4" (today reads as 2D4 each), Totems describe the strike that adds a Totem first. These are site texts, done in step 3; listed here so nothing is missed. | Site tests in step 3 check the three texts. |
| g | **A hero revived after Cavalier's killing blow does not carry Ride Down.** | Cavalier kills an enemy whose Angel revives it. The revived hero has no Ride Down. Same for a kill by Cavalier's ability. |
| h | **A revived Wizard does not get a second Arcane Shield.** Today the revive wipes the "shield used" mark, so the shield works again, with no badge. **Accepted by the owner: no second shield.** | Wizard uses Arcane Shield, dies, is revived. A hit of 6 damage is not blocked. |
| i | **Vanish is once per round.** Today it triggers on every hit, and each new hit changes who may still Focus Ninja to the newest attacker. | Two enemies hit Ninja one after another. Vanish triggers once; the first attacker keeps its exception; the second gets none. After Ninja's next turn starts, Vanish can trigger again. |
| j | **Every heal to full HP clears Ride Down.** Druid's Healing Word and Medic's Emergency Heal miss it today. | A Ride Down hero is healed to full by Healing Word, then by Emergency Heal (two tests). Ride Down is gone. |
| k | **Leftover badges go when their source dies.** Hoarder's Bribe (also stops saying "1 turns left"), Angel's Health Link, and the Beast paw on a dead Beast Tamer. | Hoarder bribes an enemy, then dies: no Bribe. Angel links an enemy, then dies: no Health Link. Beast Tamer with a Beast dies: no Beast. |
| l1 | **Druid's Healing Word heals the hurt ally with the fewest HP, Druid included.** Today it picks the smallest *share* of HP left. | Druid's team: Druid 9/17, Warden 10/21, Cleric full. Druid ends its turn: Druid gains 1D4, Warden is unchanged (today Warden, 48%, is healed). Owner's example: an ally at 5/5 and an ally at 6/20: the 6/20 ally is healed. |
| l2 | **Medic's Emergency Heal: same rule.** It already picks the fewest HP, Medic included; the test pins it so the shared code can't break it. | Medic with 1 Med Bot, Medic 6/16, Warden 7/21 (33%), Cleric full. Medic ends its turn: Medic is healed, Warden unchanged. Owner's example: 5/5 and 6/20 allies: the 6/20 ally is healed. |
| l3 | **Paladin's Divine Smite heals the hurt ally with the fewest HP, Paladin included.** Today it picks by smallest share and never heals Paladin unless Paladin is alone. | Paladin 5/19, Warden 10/21, Cleric full. Divine Smite hits: Paladin gains 1D4, Warden unchanged. Second test: everyone on Paladin's team full: the enemy still takes 1D4 damage, nobody is healed and no heal line is logged. Owner's example: 5/5 and 6/20 allies: the 6/20 ally is healed. |

Healers after fix l (one shared rule for all three). The owner's rule, word for word: **the heal goes to the DAMAGED
ally with the lowest current HP. A hero at full HP is never picked over a damaged one.** His example: an ally at 5/5
HP must not be chosen over an ally at 6/20 HP; the 6/20 ally gets the heal. It applies to Druid's Healing Word,
Medic's Emergency Heal and Paladin's Divine Smite, healer included. Each of the three has this exact scenario as a test.

- "Hurt" means alive and below full HP. The heal goes to the hurt ally with the fewest HP left (raw HP, not share), and
  the healer counts as an ally.
- **Tie-break (builder's call, matches the engine today):** when two hurt allies have the same HP, the one further
  left in the team row (earlier in team order) is healed. All three heals already keep the first of equal values.
- **Nobody hurt (builder's call, matches Druid and Medic today):** no heal and no heal line in the battle log. Divine
  Smite still deals its damage. (Today Divine Smite "heals" a full ally for nothing and logs it; that goes.)
- The heal still needs Divine Smite to hit, as now. Full-HP clearing of Ride Down (fix j) applies to all three.

Ninja's Vanish, in full (fix i plus the new card):

- Trigger: an enemy damages Ninja and Ninja survives. **Accepted by the owner:** only an enemy, as the card says. Today damage from
  an ally (Mech's Self Destruct) also triggers it.
- While it lasts, no enemy can Focus Ninja, until the start of Ninja's next turn.
- **The hero that hit Ninja can finish its turn attacking it** (a second basic attack, a second ability). **This
  exception ends when that turn ends** (owner: "can finish its turn"; accepted). Today it lasts until Ninja's next turn, so the
  attacker could also Focus Ninja on its own next turn.
- Area abilities still hit Ninja.
- Once per round: once Vanish triggers, it can't trigger again until Ninja's next turn starts.

Cavalier's Ride Down after the fixes: it fades when Cavalier dies (as now), it is cleared by any heal to full HP, and
a revived hero never starts with it. **Owner: neither the fade nor the full-heal clearing is written on the card or the
badge.** They stay as game rules only. The same goes for Vanish: the card and badge say only that Ninja can't be
Focused; the attacker's exception and area damage are game rules, not text.

Also in step 1: the "poison" line in How to Play says poison hurts "at start of each turn". The game deals it at the
**end** of the poisoned hero's turn. The text changes, not the rule (website, done with step 2).

## Step 2: card wording

Card texts live in the server's hero list, so this step is a server change. The owner approved the proposed texts in
the mockup. Where the mockup and the earlier audit differ, the mockup wins.

### The style the texts follow

- **Damage:** "Deal 1D6 damage." Always the word "damage", always a capital D. Extra damage is "an extra 1D4 damage".
- **Who:** the hero's own name, then "it". No "you", "he", "she" or "the Medic".
- **Sides:** "enemy" and "ally" only. "The target" is the Focused enemy. "All heroes" means both teams. "Ally"
  includes the hero itself unless the card says otherwise (that is how the game treats Bless, Totemic Bond and Deflect).
- **Attack:** "attack" means a basic attack; "attacks and abilities" means both. This is how the game works.
- **Focus:** cards say "Focus", never "target" or "untargetable". Taunt reads "it must Focus Warden on its next turn".
- **Key words get a capital:** Focus, Taunt, Poison, Silence, Defense, Accuracy, HP, Turret, Totem, Beast, Med Bot.
- **Stats:** "+1 Defense", "-1 Defense", "+1 Accuracy". Never "+1 to hit". Always "HP", never "health".
- **How long:** "on its next turn", "until Ranger's next turn", "once per round", "once per game", or "permanently"
  when it outlasts the hero.
- **Form:** short sentences with a period. No semicolons. "Can't", not "cannot". Numbers as digits.

### Questions in the audit, checked against the game

None of these change the approved text:

- Barbarian's Reckless Swing: the 2D4 to Barbarian happens only on a hit. Both parts happen on a hit, like every card.
- Engineer's turrets: each Turret picks its own random enemy. "1D4 damage to a random enemy per Turret" is right.
- Engineer's Protective Gear: automatic, the first time Engineer takes damage that can be blocked. Poison and recoil
  can't be blocked.
- Paladin's Shield of Faith: triggers when an enemy **damages** an adjacent ally, not on a miss. "Damages" is right.
- Sorcerer's Twin Spell: no roll; every hit grants one more use, once per round. The new text is right.
- Monk's Deflect: protects Monk too ("ally" includes Monk itself), once per round per team.
- Left and right (Fighter, Elementalist, Dual Defender): as the cards are shown on screen. Both players see both rows
  in the same order. Fighter's and Elementalist's splash skips fallen heroes.
- Warden's Shield Bash: only a missed basic attack triggers it, which is what "attack" means.
- Elementalist's Wind Wall: it stacks, +1 per hit, until its next turn. "Each time" is right. The badge shows the total.
- Shroomguard's Poison Aura: "all heroes" includes Shroomguard.
- Hoarder's Offer Bribe: the target can't use an ability while Focused on Hoarder. An area ability Focused on someone
  else still hits Hoarder. "Can't use its ability on Hoarder" is right.
- Healers' "lowest-HP ally": did not match the game. Settled by fix l: the game changes, the approved text stands.

### New texts, heroes in play

64 texts change. Unchanged (16): Assassin Poison Strike, Sorcerer Chromatic Orb, Druid Wildshape, Cavalier Trample,
Berserker Frenzy, Wizard Fireball, Fighter Desperate Blows, Blood Hunter Sanguine Renewal, Shaman Totemic Bond, Ninja
Sharpened Shuriken, Dragon Rider Fire Breath, Bomber Bomb Toss, Plague Spreader Aura of Death, Swordsman Colossal
Strike, Swordsman Critical Strikes, Pyromancer Endless Burn.

| Hero | Card | New text |
|---|---|---|
| Barbarian | Reckless Swing | Deal 2D6 damage. Barbarian takes 2D4 damage. |
| Barbarian | Break the Line | Barbarian's attacks and abilities ignore Taunt and deflections. |
| Engineer | Call Turret | Summon a Turret (max 2). At the end of Engineer's turn, deal 1D4 damage to a random enemy per Turret. |
| Engineer | Protective Gear | When Engineer takes damage, sacrifice a Turret to block it. |
| Assassin | Twin Daggers | No basic attack. Can use its ability twice per turn. |
| Paladin | Divine Smite | Deal 1D4 damage and heal the lowest-HP ally for 1D4. |
| Paladin | Shield of Faith | When an enemy damages an ally adjacent to Paladin, Taunt that enemy: it must Focus Paladin on its next turn. |
| Sorcerer | Twin Spell | Once per round, when Sorcerer's ability hits, it can use its ability again. |
| Druid | Healing Word | At the end of Druid's turn, heal the lowest-HP ally for 1D4. |
| Cleric | Guiding Bolt | Deal 1D4 damage. The next attack or ability against the target has advantage. |
| Cleric | Bless | While Cleric is alive, all allies gain +1 Accuracy. |
| Monk | One-Two Punch | Deal 1D6 damage, then make a basic attack. |
| Monk | Deflect | Once per round, when an enemy hits an ally with a roll lower than Monk's Defense, block the damage and deal 1D4 damage to the attacker. |
| Cavalier | Ride Down | Attacks against enemies hit by Cavalier have advantage. |
| Piercer | Piercing Strike | Deal 1D4 damage. If the target has more than 8 Defense, deal an extra 1D6 damage. |
| Piercer | Armor Breaker | Piercer has advantage against enemies with more than 8 Defense. |
| Silencer | Silence | Deal 1D6 damage and Silence the target on its next turn. |
| Silencer | Anti-Magic Field | Enemy abilities against Silencer have disadvantage. |
| Berserker | Bloodbath | Gain 1 Bloodbath stack (max 2). Each stack gives Berserker's attacks +1 damage. |
| Wizard | Arcane Shield | Once per game, when Wizard would take more than 5 damage, block it. |
| Fighter | Cleave | Deal 1D6 damage to the target and 1D6 damage to the enemy on its left. |
| Warlock | Vitality Drain | Deal 1D6 damage and heal Warlock for that amount. |
| Warlock | Dark Pact | Adjacent allies permanently deal +1 damage with attacks and abilities. |
| Warden | Compel Duel | Deal 1D4 damage and Taunt the target: it must Focus Warden on its next turn. |
| Warden | Shield Bash | When an attack misses Warden, the attacker takes 1D6 damage. |
| Champion | Inspiring Crowd | Heal Champion for 1D4 (1D6 if below 11 HP). |
| Champion | Last Stand | For each fallen ally, Champion gains +1 Defense and deals an extra 1D6 damage. |
| Ranger | Piercing Shot | Deal 1D6 damage. The target has -1 Defense until Ranger's next turn. |
| Ranger | Eagle Eye | Ranger's attacks and abilities have advantage. |
| Blood Hunter | Crimson Rite | Deal 3D4 damage. Blood Hunter takes 2D4 damage. |
| Blood Hunter | Blood Price | No basic attack. Can use each ability once per turn. |
| Shaman | Elemental Strike | Summon a Totem (max 3), then deal 1D4 damage per Totem. |
| Timekeeper | Chrono Shift | Choose an ally to use its ability on the target. |
| Timekeeper | Haste | Adjacent allies' abilities have advantage. |
| Ninja | Vanish | Once per round, after an enemy damages Ninja, it can't be Focused until its next turn. |
| Dragon Rider | Dismount | When Dragon Rider drops below 9 HP, it permanently loses 3 Defense and can't use its ability. |
| Bomber | Explosion | When Bomber dies, deal 1D6 damage to its killer. |
| Beast Tamer | Call Beast / Command Attack | Summon the Beast. If the Beast is already summoned, it deals 2D8 damage to the target instead. |
| Beast Tamer | Pack Tactics | While the Beast is summoned, Beast Tamer's attacks have advantage. |
| Brawler | Iron Fists | Brawler makes 2 basic attacks per turn. No ability. |
| Reaper | Soul Harvest | Deal 1D8 damage. If this kills the target, heal Reaper to full HP. |
| Reaper | Aura of Dread | While Reaper is alive, all enemies have -1 Defense. |
| Plague Spreader | Poison Touch | Deal 1D4 damage and give the target that many Poison stacks. |
| Dual Defender | Stun | Deal 1D4 damage. The target can't attack on its next turn. |
| Dual Defender | Defend | While Dual Defender is alive, the ally to its right uses Dual Defender's Defense. |
| Ace | Stacked Deck | Deal 2D4 damage. On a crit, deal an extra 1D4 damage. |
| Ace | Ace Up The Sleeve | When Ace rolls a 1 on an attack or ability, it automatically hits and crits. |
| Elementalist | Thunderclap | Deal 1D4 damage to the target and 1D4 damage to the enemy on its right. |
| Elementalist | Wind Wall | Each time Elementalist hits with an attack or ability, it gains +1 Defense until its next turn. |
| Mech | Charged Fist | Deal 1D6 damage and Taunt the target: it must Focus Mech on its next turn. |
| Mech | Self Destruct | Mech can destroy itself to deal 2D6 damage to all heroes, including allies. |
| Diplomat | Declare War | Adjacent allies make a basic attack on the target. |
| Diplomat | Peace Treaty | Once per game: Diplomat can heal all heroes for 2D6, including enemies. |
| Arcane Archer | Far Shot | Deal 1D4 damage. If Arcane Archer is at full HP, deal an extra 1D8 damage. |
| Arcane Archer | Arcane Arrows | Arcane Archer's attacks and abilities deal an extra 1D4 damage to enemies it has already damaged. |
| Shroomguard | Cleansing Spores | Deal 1D4 damage and remove all Poison from a random Poisoned ally. |
| Shroomguard | Poison Aura | When Shroomguard takes damage, give all heroes 1 Poison stack. |
| Angel | Health Link | Deal 1D4 damage and link the target to Angel. The next time Angel takes damage, the target takes the same damage. |
| Angel | Resurrect | Once per game: when an ally dies, revive it at half HP. |
| Pyromancer | Incinerate | Deal 1D6 damage. If this kills the target, deal 1D6 damage to enemies adjacent to it. |
| Medic | Med Bots | Summon a Med Bot (max 3). |
| Medic | Emergency Heal | At the end of Medic's turn, heal the lowest-HP ally for 1D4 per Med Bot. |
| Hoarder | Offer Bribe | Deal 1D4 damage. The target can't use its ability on Hoarder until Hoarder's next turn. |
| Hoarder | Collect Weapons | When any hero dies, Hoarder adds its basic attack dice to its own. |

### Switched-off heroes

**Accepted by the owner:** their rewrites go in now too, because nobody plays them, and their cards then match the style when they
come back. Where the audit flagged a clash between card and hero data, the text follows the data (what the game would
do). They are not checked in play; that happens when each hero comes back.

| Hero | Card | New text |
|---|---|---|
| Bard | Song of Valor | Deal 1D4 damage. The ally to Bard's right has advantage on its next ability. |
| Bard | Encore | Once per round, when an ally misses with an attack or ability, it rerolls. |
| Witch Doctor | Voodoo Ritual | At the end of Witch Doctor's turn, deal 1D4 damage to the lowest-HP enemy. |
| Pixie | Wish | Choose an ally. It gains +1 Accuracy and +1 Defense, and heals for 1D4. |
| Pixie | Fey Magic | While Pixie has a living ally, it gains +6 Defense. |
| Serpent | Poison Strike | Deal 1D6 damage and give the target that many Poison stacks. |
| Serpent | Absorb Venom | Once per round, Serpent can remove all Poison from all heroes and heal 1 HP per stack removed. |
| Venom | Plant Growth | Deal 1D4 damage and summon a Poisonous Plant (max 2). |
| Venom | System Failure | At the start of Venom's turn, give a random enemy 1D4 Poison stacks per Poisonous Plant. |
| Knight | Iron Will | Deal 1D6 damage. If all of Knight's allies have fallen, deal an extra 1D6 damage. |
| Knight | Tank Buster | Knight's attacks have advantage against enemies with more Defense than Knight. |
| Hacker | Hack | Choose an enemy and take an extra turn as that enemy. It can't attack itself. |
| Hacker | System Failure | When Hacker dies, its killer loses its special. |
| Shadow | Surprise Attack | Deal 1D4 damage. If Shadow has never hit this target, deal an extra 1D4 damage. |
| Shadow | Shadow Form | Enemies Shadow hasn't damaged have disadvantage on attacks and abilities against Shadow. |
| Guardian | Revenge | Deal 1D4 damage. If the target attacked Guardian this round, deal an extra 1D6 damage. |
| Guardian | Protect | When an enemy attacks an ally adjacent to Guardian, Taunt that enemy: it must Focus Guardian on its next turn. |
| Phoenix | Rebirth | Once per game: when Phoenix dies, revive it at half HP. |
| Blacksmith | Sharpen | Choose an ally. Its next attack deals an extra 1D8 damage. |
| Blacksmith | Reinforce | Choose an ally. It gains +2 Defense. |
| Healer | Heal | Heal an ally for 2D4. |
| Healer | Cleanse | Once per round, remove all debuffs from an ally. |
| Sniper | Smoke Shot | Deal 1D4 damage. Sniper gains +5 Defense until its next turn. |
| Sniper | Lock In | Sniper can skip its attack. If it does, its next attack deals an extra 3D6 damage. |
| Agent | Plan Ahead | Deal 1D4 damage and summon a Spy. |
| Agent | Master Plan | Remove 2 Spies to set an enemy's Defense to 0. |
| Mime | Copy | Choose an enemy and use its ability as Mime's own. |
| Mime | Unique Duplicate | At the start of the battle, choose an enemy and copy its special. |
| Gambler | Luck of the Dice | Deal 1D6 damage. If the roll was above 14, Gambler's next attack has advantage. |
| Gambler | Rigged Dice | Gambler's abilities have advantage. |
| Arcanist | Enhance Ability | Deal 1D4 damage. The ally to Arcanist's left has advantage on its next ability. |
| Arcanist | Enhance Attack | Deal 1D4 damage. The ally to Arcanist's right has advantage on its next attack. |
| Arcanist | Tether Ally | Once per round, when an ally hits with an attack or ability, Arcanist makes a basic attack on the same target. |

Unchanged: Witch Doctor Hexburst Mending, Phoenix Flamestrike, Blacksmith's "No special."

### Other texts in this step

- The server's Vanish messages say "can't be Focused" instead of "untargetable" / "can't be targeted": the Focus
  refusal, the two refusals when choosing an attack or ability on a Vanished Ninja, the Vanish log line and the battle
  log reaction.
- How to Play, Poison: "Takes damage at the end of its turn."

## Step 3: badges and helper text (website)

### The tokens

Round tokens replace the emoji pills. Green rim: buff. Red rim: debuff. Violet: poison. A small number on the
corner when the badge counts something. "Taunt coming" is the Taunted token with a dashed rim and a faded picture.
The pictures are the SVG drawings in the approved mockup, copied from there (`<symbol>` ids below).

### Every badge

"Short" is what a phone shows. "Full" shows wherever there is room and always in the details view. Names in angle
brackets are filled in by the game (the taunting hero, a count).

| Badge | Picture | Rim, number | Short | Full | Shows / goes |
|---|---|---|---|---|---|
| Turrets (Engineer) | `i-golem` | buff, count | Turrets 2/2 | 2 of 2 Turrets. At the end of Engineer's turn each deals 1D4 damage to a random enemy. One is given up to block damage. | While Engineer has Turrets. Goes when none are left or Engineer dies. |
| Totems (Shaman) | `i-totem1`, `i-totem2`, `i-totem3` (one head per Totem) | buff, no number | Totems 2/3 | 2 of 3 Totems. Elemental Strike adds a Totem, then deals 1D4 damage per Totem. | While Shaman has Totems. Goes when Shaman dies. |
| Med Bots (Medic) | `i-bot` | buff, count | Med Bots 2/3 | 2 of 3 Med Bots. At the end of Medic's turn, the lowest-HP ally heals for 2D4. | While Medic has Med Bots. Goes when Medic dies. |
| Beast (Beast Tamer) | `i-paw` | buff | Beast out | The Beast is out. Beast Tamer's attacks have advantage. | While the Beast is summoned. Goes when Beast Tamer dies (fix k). |
| Bloodbath (Berserker) | `i-blood` | buff, stacks | Bloodbath +2 | +2 damage to attacks (max 2). | From the first stack. Stays all battle. |
| Frenzy (Berserker), new | `i-flame` | buff | Frenzy | Below 10 HP: Berserker can attack twice per turn. | While Berserker is below 10 HP. Goes if healed to 10 or more. |
| Desperate Blows (Fighter), new | `i-blows` | buff | Desperate Blows | Below 10 HP: Fighter's attacks have advantage. | While Fighter is below 10 HP. Goes if healed to 10 or more. |
| Hidden (Ninja, Vanish) | `i-hidden` | buff | Hidden | Can't be Focused until Ninja's next turn. | When Vanish triggers. Goes at the start of Ninja's next turn. |
| Arcane Shield (Wizard) | `i-ashield` | buff | Arcane Shield | The first hit of more than 5 damage is reduced to 0. | From battle start. Goes once used (and never comes back, fix h). |
| Wind Wall (Elementalist), new | `i-wind` | buff, "+N" | Wind Wall +1 | +1 Defense until Elementalist's next turn. (The number is the current total.) | After each hit by Elementalist. Goes at the start of its next turn. |
| Poison | `i-poison` | poison, stacks | Poison 3 | Takes 3 damage at the end of its turn. | While it has Poison. Never wears off by itself. |
| Taunted | `i-taunt` | debuff | Taunted: \<Warden\> | Must Focus \<Warden\> with attacks and abilities on its next turn. | When the taunt lands. Goes after its next turn, or when the taunter dies. |
| Taunt coming (Paladin), new | `i-taunt`, dashed | debuff | Taunt coming | Will be taunted by \<Paladin\> at the end of this turn. | When Shield of Faith queues a taunt. Goes when it lands (becomes Taunted) or Paladin dies (fix a). |
| Silenced | `i-silence` | debuff, turns | Silenced 1 | Can't use abilities for 1 more turn. | Silencer's Silence or the first-pick rule. Goes when it runs out. |
| Stunned | `i-stun` | debuff, turns | Stunned 1 | Can't make basic attacks for 1 more turn. | Dual Defender's Stun. Goes when it runs out. |
| Bribed | `i-bribe` | debuff | Bribed | Can't use its ability on Hoarder until Hoarder's next turn. | Offer Bribe. Goes at Hoarder's next turn or when Hoarder dies (fix k). No turn count. |
| Guiding Bolt | `i-exposed` | debuff | Guiding Bolt | The next attack or ability roll against this hero has advantage. | Guiding Bolt hit. Goes when used up. |
| Ride Down | `i-shoe` | debuff | Ride Down | Attacks against this hero have advantage. | Cavalier hits it. Goes when healed to full or Cavalier dies (fixes g, j). |
| Health Link | `i-link` | debuff | Health Link | The next time Angel takes damage, this hero takes it too. | Health Link hit. Goes once used, or when Angel dies (fix k). |
| Defense down (Ranger) | `i-defdown` | debuff, "-1" | Defense -1 | Piercing Shot: -1 Defense until Ranger's next turn. | Piercing Shot. Goes at Ranger's next turn or when Ranger dies (fixes d, e). |
| Arcane mark (Arcane Archer), new | `i-mark` | debuff | Arcane mark | Arcane Archer deals +1D4 to this hero. | On each enemy Arcane Archer has damaged. Hidden while Arcane Archer is dead (accepted by the owner: the bonus can't happen then). |
| Inspired | none | removed | | | No hero gives it. Remove. |

**Accepted by the owner:** "Turrets", "Med Bots": capital and "HP" per the style; "1 more turn" becomes "2 more turns"
when the count is 2. A fallen hero shows no badges (its card already shows it as fallen).

### Helper text, by screen

- **Computer with a mouse:** hover opens the name and the full sentence beside the token; moving away closes it. A
  click also opens it, and it stays until a click elsewhere.
- **Tablet and larger touch screens:** a tap opens the name and the full sentence. A tap on the same token, another
  token, or anywhere else closes it. One open at a time.
- **Phone:** a tap opens the short form only (keyword and number, like "Poison 3" or "Taunted: Warden"). Keywords like
  Poison and Taunt don't need the full description on a phone.
- **Every device, hero details:** opening a hero's details lists every badge on it: token, short form, full sentence.
  This is where a phone player reads the whole sentence.
- A tap on a token only opens its text. It never Focuses, selects or opens the hero underneath.
- Tokens can be reached by keyboard and read by a screen reader (name and full sentence).
- An open text closes when the turn changes or its badge goes away.

## Server state the new badges need

The website already receives each hero whole, so most of what the badges need is already there. Checked in
`getFullGameState`:

| Badge | Needs | Already sent? |
|---|---|---|
| Wind Wall | `statusEffects.windWallAC.bonus` | Yes, on the hero. |
| Frenzy, Desperate Blows | `conditionalEffects.Frenzy` / `conditionalEffects['Desperate Blows']` | Yes, on the hero. |
| Arcane mark | Arcane Archer's `damagedEnemies` | Yes, on the Archer. The site marks enemies of that Archer by name. |
| Taunt coming | `game.pendingTaunts` | **No.** It lives on the game, not on a hero. Add it to the game state (or put a small "taunt coming" mark on the hero; builder's call). Optional field, so the old site keeps working. |

## Deployment

Server and website, from branch `redesign-badges`. Step 1 and step 2 are server changes (step 2 also touches How to
Play on the site); step 3 is the website plus the one new field. The owner sees it before it goes live (a local run
or preview). Deploy only on his "go live", and the server only when nobody is playing: server first, poll
`/api/user/1` until the new code answers, then the site. The new site must work against the old server and the old
site against the new server for the minutes in between (every new field is optional).

## Who does what

Drawing and animation work (copying and fitting the badge drawings, the totem heads, the golem, any drawing tweak)
is done by Fable. Everything else (planning, rules, tests, wording, website code, reviews) by Opus.

## Left to the builder

The exact sizes, colours and spacing of the tokens on each card size; where the tip opens so it stays on screen; the
phone breakpoint (use the existing card-size media queries); whether "Taunt coming" is sent as `pendingTaunts` or as a
mark on the hero; how the details view lays out the badge list; how fix c is done (see below); which tests are unit
tests and which run a whole battle.

## Owner decisions (22 November)

All accepted; nothing is open.

1. **Healers:** Option 1. Druid, Medic and Paladin all heal the hurt ally with the fewest HP, healer included (fix l).
   The approved "lowest-HP ally" card texts stand.
2. Vanish triggers only on damage from an enemy.
3. The hero that hit Ninja may Focus Ninja only until the end of that turn.
4. A revived Wizard gets no second Arcane Shield (fix h).
5. A fallen hero shows no badges.
6. The Arcane mark is hidden while Arcane Archer is dead.
7. The switched-off heroes' card texts are rewritten now.
8. The text calls in the badge table ("Turrets", "Med Bots", "1 more turn" / "2 more turns").

## For the builder

Paths are under `Game/`. GM = `backend/gameManager.js`, U = `backend/utils.js`, HC =
`frontend/src/components/HeroCard.tsx`. Line numbers are from main b86095b and approximate.

**Tests.** `node --test` in `backend/test/`; build battles with `backend/test/support/battle.js` (`startBattle`, dice
rigging via `rig`). `mirror.test.js` exists: the same hero can be on both teams, so match heroes by `id`, not `name`,
in every new or touched check (Vanish's exception `untargetableAttacker`, Ride Down `source`, pending taunts, Bribe,
Health Link). Website tests are vitest (`HeroCard.test.tsx`, `BattleDetailsPanel.test.tsx`).

**Fix a (dead Paladin's taunt).** Taunts are queued in `checkPaladinShieldOfFaith` (GM ~4916-4930) and applied at the
end of the turn (GM ~5565-5625). Drop the dead Paladin's entries in `updatePassiveEffectsOnDeath` (where taunts from a
dead source are removed, GM ~2366) and also skip any entry whose taunter is dead when applying. Check the Focus refusal
path (GM ~4820-4851, ~2801) with a taunt pointing at a fallen hero.

**Fix b (Dark Pact).** `applyPassiveEffects` (GM 1278) resets `passiveBuffs` and pass 1 skips dead sources (GM ~1298),
so the `battle_start` buff (pushed with `permanent: true` at GM ~1517-1531) is lost on any recount; recounts come from
`checkHPConditions` (GM ~4620). Keep battle-start buffs on recount whatever the source's state (e.g. store them once at
battle start and re-add them), and log the battle-start entry once.

**Fix c (revived and killed again).** `processAngelResurrection` (GM ~6760-6830) sets `justResurrected`, which
`dealDamage` (GM ~6692) and other places (GM 2594, 3940, 4095, 6330) use to skip death handling; it is only cleared at
turn end (GM ~4713). A second death in the same turn is then never processed. Make the guard skip only the death that
caused the revive (e.g. mark that one death as handled), so a later death runs `updatePassiveEffectsOnDeath` normally.
Angel can't revive twice anyway (`resurrectUsed`).

**Fixes d, e (Piercing Shot).** Expiry is in `processCasterDurationEffects` (GM ~4334-4370); it deletes the modifier
but never calls `updateHeroDisplayStats` (GM 1659), so `modifiedDefense` stays low. Call it for each hero touched. On
Ranger's death, remove modifiers whose `statModifierCasterIds` is the dead Ranger, and update display stats. The
countdown in U ~419-437 (`statModifierDurations`) looks unused; confirm and remove it.

**Fixes g, j (Ride Down).** Applied after the hit at GM ~2584 (basic attack), ~3465 (ability), ~7676 (commanded
attack); don't apply it if this hit killed the target and Angel revived it (use the `dealDamage` result or the revive
mark). Full-heal clearing exists at GM ~3527-3735 and ~5145; add it to Healing Word (GM ~5338-5390) and Emergency Heal
(GM ~5440-5490). Better: one small helper called after every heal.

**Fix l (healers).** Druid: the end-of-turn block at GM ~5338-5390 (share-based reduce). Medic: GM
~5440-5495 (already fewest HP among hurt allies). Paladin: `resolveEffectTarget` case `lowest_health_ally` (GM
~4130-4148, share-based, excludes the caster). `getTargetsForEffect` has another share-based `lowest_health_ally`
(GM ~1637); make it use the same helper. One helper (e.g. `pickHurtAllyWithFewestHP(team)` returning the hero or
`null`) for all of them; a `null` from `resolveEffectTarget` already makes the heal effect skip (GM ~3414).

**Fix h (Wizard).** The revive replaces `statusEffects` with `{ justResurrected: true }` (GM ~6811), wiping
`arcaneShieldUsed`. Keep `arcaneShieldUsed` (and `arcaneShieldAvailable: false`) across the revive. Check the battle
log's Arcane Shield reaction (`backend/battleLog.js` ~416) does not fire on the revive.

**Fix i (Vanish).** Trigger in `processAfterDamageEffects` (GM ~6438-6495), called from `dealDamage` for any attacker
other than the target. Add a used-this-round flag set on trigger and cleared at the start of Ninja's turn
(`processCasterDurationEffects`, GM ~4324-4330); require the attacker to be on the other team; store the attacker's
`id`; clear the exception at the end of the current turn. Checks that read the exception: GM ~2521, ~2812, ~4845,
~5273.

**Fix k (leftovers).** Bribe (`cannotTargetWithAbility`, set GM ~3805) is only cleared at Hoarder's turn start
(GM ~4445-4455); also clear it on Hoarder's death by `ownerId`. Health Link (`health_link`, set GM ~3816) by
`sourceId` on Angel's death. `beast_active` on Beast Tamer's death. All in `updatePassiveEffectsOnDeath` (GM ~2340-2400).

**Vanish strings (step 2).** `FOCUS_UNTARGETABLE` (GM 35), the refusals at GM ~2524 and ~2815, the log message at GM
~6460 and the reaction in `battleLog.js` ~418. Update any test that checks the old wording.

**Card texts (step 2).** `"description"` fields in `backend/heros.json` (line numbers are in the audit; search by card
name). The data unit stays "Mechanical Turret"; only the card text says "Turret". The website prints these strings as
they are (`frontend/src/cards/cardRules.ts` → HC ~L928). `SurvivalTeamBuilder.tsx` ~L210-300 has old fallback hero
texts shown only if the API fails; update or drop them. How to Play poison line: `HowToPlayModal.tsx` ~L68.

**Badges (step 3).** Today's badges are in `renderStatusEffects` (HC ~L321-620): most use a hover-only
`.status-tooltip-text`, and six use a native `title=` (taunt, silenced, bribed, grant-advantage, ride-down,
stat-modifier). Styles: `frontend/src/App.css` (`.status-effect`, ~L119-375) and `frontend/src/styles/HeroCard.css`
(~L440-480, ~890-940). Replace them with one token component driven by a badge list (key, symbol, rim, number, short,
full), with the texts above. Copy the `<symbol>` drawings from the mockup (one shared sprite). Remove the
`inspiration` badge and its CSS/type entries (`types.ts`, `CardLayoutTest.tsx`). The details view
(`BattleDetailsPanel.tsx`) closes on a tap on itself; the badge list there is read-only text, so it needs no taps.
Stop a token tap from reaching the card's own tap handler (Focus/details).
