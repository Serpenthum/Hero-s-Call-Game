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

1. Tapping any hero card in battle shows its full details in a panel covering the left column (over the battle log).
   It closes on a tap on empty space, on taking an action (attack, ability, special), or when the turn changes.
2. On your turn, tapping an **enemy** shows it and adds a **Focus** button to the Actions sidebar. Nothing is targeted yet.
3. Focus locks that enemy as this turn's target: a clear marker on its card (red glow, crosshair) and the action
   buttons name it ("Attack Warlock").
4. **Focus is the first action.** Until an enemy is focused, every action is disabled and reads "Focus an enemy
   first": attack, every ability (including Wildshape, Bloodbath, Fireball) and activated specials (Self Destruct,
   Peace Treaty). Passive and start-of-turn specials still run before focus, as today. The old auto-target is gone.
5. Focus can be switched freely until the player's first action that turn; then it is locked for the rest of the turn.
6. If the focused enemy dies you cannot refocus. Damaging actions are lost; non-damaging ones (heals, Bloodbath,
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
  spectators). Additions: `focusLocked` (set by the first successful attack, ability, Chrono Shift pick or activated
  special; cleared at turn change), refusal of a switch once locked, refusal of any action without a focus, refusal of
  damaging actions while the focus is dead, refusal to focus an untargetable enemy, and `activeHero.abilityTargeting`
  in the state so the client never re-derives the classification. Deploy the server before the site.
- **Damage to everyone counts as damaging.** Fireball, Bomb Toss and Self Destruct are lost once the focus is dead
  (they deal damage); Peace Treaty is not.
- **Beast Tamer** is classified from its state: before the beast is summoned the ability only summons (non-damaging);
  once summoned it commands an attack (damaging).
- **No focusable enemy** (every living enemy untargetable): the hero can only End Turn, and the existing auto end-turn
  applies, as it does when the focus has fallen and nothing non-damaging is left.
- **Panel layout.** Header (name, "Enemy"/"Your hero", "Focused", "Fallen", close X), the live `HeroCard` taking at
  most about half the panel's height (tiny mode on a sideways phone), then every ability and special as plain text at
  the sidebar font size (never under 12px), scrolling if long.
- Labels: "Focus Warlock", "Focused", "Focus locked", "Taunted: focus Paladin", "Can't be targeted", "Attack Warlock",
  "Poison Strike on Warlock" (abilities aimed at the focus), "Fireball" / "Wildshape" (others), "Warlock has fallen",
  "Focus an enemy first".

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
- No new hero art; the crosshair marker is the only drawing.
- No AI changes: the tutorial bot keeps selecting then acting through the same server calls.
