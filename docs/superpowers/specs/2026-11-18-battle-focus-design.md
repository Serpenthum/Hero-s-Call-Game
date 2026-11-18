# Hero's Call: battle Focus and card details: design

Date: 2026-11-18. Status: owner's rules approved in conversation, including his answers of 2026-11-18 (below). The
rulings are the planner's calls, open to correction.

## Intent

In battle a player cannot read a card well, and the first enemy they tap becomes the target by accident. Tapping a card
should only show it (large and readable, in the left column). Choosing who the active hero attacks becomes a
deliberate first step, **Focus**, that both players and spectators can see. Reference:
`.superpowers/sdd/2026-11-17-redesign-step1-foundation/signoff/battle-target-selected-844x390.png` (left column =
turn, active hero, battle log; centre = cards; right = Actions).

## Rules (owner, binding)

1. Tapping any hero card in battle shows that card, large, at the top of the left column (over the battle log); on
   phones it grows over the board to the screen height so its own face carries the ability and special text. Only
   the card is drawn: no box, header, tags or close button (owner, 2026-11-18). A fallen hero shows dead on the card;
   the focused enemy wears the focus ring. It closes on a tap on the card itself or on empty space, Escape, taking
   an action (attack, ability, special), or when the turn changes.
2. On your turn, tapping an **enemy** shows it and puts a **Focus** button in the Actions sidebar. Nothing is
   targeted yet.
3. Focus makes that enemy this turn's target: a clear marker on its card (a thick red ring and a pulsing red halo, faint
   and still once the focus has fallen; no crosshair, owner 2026-11-18). The action buttons
   keep their own labels ("Attack (1D6)", "Fireball"); the marker shows whom they hit (owner, 2026-11-18).
4. **Focus is the first action.** Until an enemy is focused, the Actions sidebar shows only the Focus button, or
   "Tap an enemy to focus" when no enemy is shown: no hero name, attack, abilities, specials or End Turn (owner,
   2026-11-18). Passive and start-of-turn specials still run before focus, as today. The old auto-target is gone.
   Once focused, the Focus button goes away and every normal button, End Turn included, comes back.
5. **Focus is final once chosen** (owner, 2026-11-18): the server locks it on the select itself, and a second select
   that turn is refused ("Focus is locked for this turn").
6. If the focused enemy dies you cannot refocus. Lost actions keep their label plus " (Target Dead)" and are
   disabled. Damaging actions are lost; non-damaging ones (heals, Bloodbath,
   Wildshape, summons, Peace Treaty) stay usable. Today the server refuses any ability once the target is dead; that
   changes.
7. **You never focus an ally.** Focus only says whom the active hero is attacking.
8. **Everyone sees the focus.** The opponent sees the marker on their own hero that is focused; spectators see it too.
9. **A revived hero stays focused.** If the focused hero is resurrected when reduced to 0 (today: Angel's
   Resurrection), it keeps the focus and damaging actions work again. Commands (Chrono Shift, Declare War) aimed at a
   dead focus have no effect, so they are lost like any damaging action.
10. On the opponent's turn a tap only shows details (no Focus). Your own heroes can always be tapped for details.
11. No press-and-hold reader in battle; the panel replaces it.
12. The battle tutorial teaches tap → Focus → Attack.

## Rulings (planner; owner may correct)

- **One behaviour everywhere.** Focus, the marker and the panel apply at every screen size; on a computer the panel
  also covers the left column. Spectators get the panel and the marker, never a Focus button.
- **The server enforces rules 4–9.** The protocol already carries it: the server keeps `player.selectedTarget`, uses
  it for every action, sends it in every game state, and broadcasts `target-selected` to the game room (players and
  spectators). Additions: `focusLocked` (set when the focus is chosen, including a taunt-forced one; cleared at turn
  change, kept across `rekeyPlayer`), refusal of a second select that turn, refusal of any action without a focus, refusal of
  damaging actions while the focus is dead, refusal to focus an untargetable enemy, and `activeHero.abilityTargeting`
  in the state so the client never re-derives the classification. Deploy the server before the site.
- **Area attacks survive a fallen focus (owner, 2026-11-18).** Fireball, Bomb Toss and every activated special
  (Self Destruct, Peace Treaty) still work once the focus is dead; they still need a focus first. Only single-target
  damaging actions are lost: basic attack and enemy-kind damaging abilities, including ones that splash adjacent
  enemies (Cleave, Thunderclap), Chrono Shift and Declare War.
- **Beast Tamer** is classified from its state: before the beast is summoned the ability only summons (non-damaging);
  once summoned it commands an attack (damaging).
- **No focusable enemy** (every living enemy untargetable): the existing auto end-turn ends the turn. Where it does
  not run (gauntlet, tutorial, or auto end-turn switched off) the sidebar says "No enemy can be focused" and offers
  End Turn. Auto end-turn also applies when the focus has fallen and nothing non-damaging is left.
- **Panel layout.** Just the live `HeroCard`, fixed at the top-left of the left column: the largest card that fits
  the column's height. On a computer it stays within the column's width; on phones and short windows it may cover
  the board, so the full face (130px and up) is readable (about 210-220px wide on a sideways phone).
- **Opponent's turn.** The waiting prompt adds "Focus: Warlock" when the opponent has focused one of your heroes (it
  fits without crowding at 667x375 and 844x390).
- Labels: "Tap an enemy to focus", "Focus Warlock", "Taunted: focus Paladin", "Can't be targeted" (the last two on a
  disabled Focus button), "No enemy can be focused", the original action labels ("Attack (1D6)", "Poison Strike",
  "Fireball") with the existing suffixes "(Used)", "(Silenced)", "(Stunned)", "(1/2)", "(Bribed)", and
  "(Target Dead)" on an action lost with a fallen focus.

## Ability classification (derived from `backend/heros.json`)

Kind says where the ability lands (used for its label and on the server): **all** if `target_type` is `all_enemies` or
an effect targets `all_enemies`; **self** if `target_type` is `self_only` or no effect touches the focused enemy;
otherwise **enemy** (an effect targets `target`, `chosen_enemy`, `adjacent_enemy*`, or has `against: target` /
`source: chosen_enemy`). **Damaging** if any effect is `damage`, `lifesteal_damage`, `conditional_damage`,
`command_ally`, `command_adjacent_allies`, `take_turn_as_enemy` or `copy_and_use_ability`. Beast Tamer's
`conditional_action` effects count only when their condition (`beast_active` / `beast_inactive`) holds. Every kind
needs a focus.

| Damaging? / kind | Enabled abilities (40 heroes; Brawler has none) |
|---|---|
| no / self (usable after the focus falls) | Druid Wildshape, Champion Inspiring Crowd, Berserker Bloodbath, Engineer Call Turret, Medic Med Bots, Beast Tamer (beast not summoned) |
| yes / all | Wizard Fireball, Bomber Bomb Toss |
| yes / enemy | Barbarian Reckless Swing, Assassin Poison Strike, Paladin Divine Smite, Sorcerer Chromatic Orb, Cleric Guiding Bolt, Monk One-Two Punch, Cavalier Trample, Piercer Piercing Strike, Silencer Silence, Fighter Cleave, Warlock Vitality Drain, Warden Compel Duel, Ranger Piercing Shot, Blood Hunter Crimson Rite and Sanguine Renewal, Shaman Elemental Strike, Timekeeper Chrono Shift, Ninja Sharpened Shuriken, Dragon Rider Fire Breath, Beast Tamer (beast summoned), Reaper Soul Harvest, Plague Spreader Poison Touch, Dual Defender Stun, Swordsman Colossal Strike, Ace Stacked Deck, Elementalist Thunderclap, Mech Charged Fist, Diplomat Declare War, Arcane Archer Far Shot, Shroomguard Cleansing Spores, Angel Health Link, Pyromancer Incinerate, Hoarder Offer Bribe |

Activated specials: Mech Self Destruct (`activated_aoe`) is damaging; Diplomat Peace Treaty (`activated_aoe_heal`) is
not. Paladin's heal and Reaper's self-heal are side effects of damaging abilities. Disabled heroes whose abilities
target a chosen ally (Healer, Pixie, Blacksmith) are out of scope and need their own design before being enabled.

## Non-goals

- No rules, balance, damage or turn-order changes beyond the focus rules above.
- No ally targeting of any kind; Chrono Shift keeps its existing ally-pick sub-step (which picks the commanded ally,
  not a focus) and the Timekeeper ability picker.
- No card reader changes outside battle; draft, binder, shop and gauntlet keep tap / press reading.
- No new hero art; the red focus ring and halo are the only drawing.
- No AI changes: the tutorial bot keeps selecting once, then acting, through the same server calls.
