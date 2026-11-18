# Hero's Call: battle Focus and card details: design

Date: 2026-11-18. Status: owner's rules approved in conversation; the rulings below are the planner's calls, open to
correction.

## Intent

In battle a player cannot read a card well, and the first enemy they tap becomes the target by accident. Tapping a card
should only show it (large and readable, in the left column), and choosing a target should be a separate, deliberate
press: **Focus**. Reference: `.superpowers/sdd/2026-11-17-redesign-step1-foundation/signoff/battle-target-selected-844x390.png`
(left column = turn, active hero, battle log; centre = cards; right = Actions).

## Rules (owner, binding)

1. Tapping any hero card in battle shows its full details in a panel covering the left column (over the battle log).
   It closes on a tap on empty space, on taking an action (attack, ability, special), or when the turn changes.
2. On your turn, tapping an **enemy** shows it and adds a **Focus** button to the Actions sidebar. Nothing is targeted yet.
3. Focus locks that enemy as this turn's target: a clear marker on its card (red glow, crosshair) and the action
   buttons name it ("Attack Warlock").
4. Until something is focused, Attack and damaging-ability buttons are disabled and read "Focus an enemy first". The old
   auto-target on first tap is gone.
5. Focus can be switched freely until the player's first action that turn; then it is locked for the rest of the turn.
6. If the focused enemy dies you cannot refocus; further damaging actions are lost. Abilities that deal no damage
   (heals, buffs, Wildshape, summons) stay usable. Today the server refuses any ability once the selected target is
   dead, even self-only ones; that changes.
7. Abilities that target an ally use the same flow (tap the ally, press Focus). Abilities that hit everyone, or only the
   user, need no focus.
8. On the opponent's turn a tap only shows details (no Focus). Your own heroes can always be tapped for details.
9. No press-and-hold reader in battle; the panel replaces it.
10. The battle tutorial teaches tap → Focus → Attack.

## Rulings (planner; owner may correct)

- **One behaviour everywhere.** Focus and the panel apply at every screen size. On a computer the panel also covers the
  left column. Spectators get the panel too, never a Focus button.
- **Server enforces rules 4–7.** The protocol already supports it: the server keeps `player.selectedTarget` and uses it
  for every action. Minimum change: `select-target` gains `side: 'enemy' | 'ally'`; the server adds `focusLocked`
  (set by the first successful attack, ability, Chrono Shift pick or special; cleared at turn change) and refuses a
  switch once locked; `useAbility` classifies the ability and only demands a live focus for enemy/ally kinds. The
  server sends the classification (`activeHero.abilityTargeting`), so the client never re-derives it. Deploy the
  server before the site.
- **Acting with nothing focused** (e.g. Wildshape first) does not lock an empty focus: the player may still focus once
  afterwards, then it is locked.
- **Commands count as damaging.** Chrono Shift (Timekeeper) and Declare War (Diplomat) act against the focused enemy,
  so they need a live focus, even when the commanded ally's ability would not deal damage.
- **Beast Tamer** is classified from its state: before the beast is summoned the ability only summons (self, no focus);
  once it is summoned it commands an attack (enemy, damaging).
- **One focus slot.** An ally focus and an enemy focus are the same slot. Attack always needs an enemy focus.
- **Panel layout.** The panel shows a header (name, "Enemy"/"Your hero", "Focused" tag, close X), the live `HeroCard`
  at a size that takes at most about half the panel's height (it may be in tiny mode on a sideways phone), and below
  it every ability and special as plain text at the sidebar font size (never under 12px), scrolling if long.
- Labels: "Focus Warlock", "Focused", "Focus locked", "Taunted: focus Paladin", "Can't be targeted",
  "Attack Warlock", "Poison Strike on Warlock", "Warlock has fallen", "Focus an enemy first", "Focus an ally first".
- When the focus has fallen and nothing usable is left, the existing auto end-turn applies.

## Ability classification (derived from `backend/heros.json`)

Rule, in order: **all** if `target_type` is `all_enemies` or an effect targets `all_enemies`; **self** if `target_type`
is `self_only`; **ally** if `target_type` is `single_ally`; **enemy** if any effect targets the focused enemy
(`target`, `chosen_enemy`, `adjacent_enemy*`, `against: target`, `source: chosen_enemy`); otherwise **self**.
**Damaging** if any effect is `damage`, `lifesteal_damage`, `conditional_damage`, `command_ally`,
`command_adjacent_allies`, `take_turn_as_enemy` or `copy_and_use_ability`. Beast Tamer's `conditional_action` effects
count only when their condition (`beast_active` / `beast_inactive`) holds.

| Kind / damaging | Enabled abilities (40 heroes; Brawler has none) |
|---|---|
| self / no focus, no damage | Druid Wildshape, Champion Inspiring Crowd, Berserker Bloodbath, Engineer Call Turret, Medic Med Bots, Beast Tamer (beast not summoned) |
| all / damaging, no focus | Wizard Fireball, Bomber Bomb Toss |
| enemy / damaging | Barbarian Reckless Swing, Assassin Poison Strike, Paladin Divine Smite, Sorcerer Chromatic Orb, Cleric Guiding Bolt, Monk One-Two Punch, Cavalier Trample, Piercer Piercing Strike, Silencer Silence, Fighter Cleave, Warlock Vitality Drain, Warden Compel Duel, Ranger Piercing Shot, Blood Hunter Crimson Rite and Sanguine Renewal, Shaman Elemental Strike, Timekeeper Chrono Shift, Ninja Sharpened Shuriken, Dragon Rider Fire Breath, Beast Tamer (beast summoned), Reaper Soul Harvest, Plague Spreader Poison Touch, Dual Defender Stun, Swordsman Colossal Strike, Ace Stacked Deck, Elementalist Thunderclap, Mech Charged Fist, Diplomat Declare War, Arcane Archer Far Shot, Shroomguard Cleansing Spores, Angel Health Link, Pyromancer Incinerate, Hoarder Offer Bribe |
| ally / no damage | none enabled; disabled Healer Heal, Pixie Wish, Blacksmith Sharpen and Reinforce |

Disabled heroes otherwise classify as enemy / damaging. Activated specials (Mech Self Destruct, Diplomat Peace Treaty)
hit everyone and never need a focus. Paladin's heal and Reaper's self-heal are side effects of damaging abilities.

## Non-goals

- No rules, balance, damage or turn-order changes beyond the focus rules above.
- No change to how Chrono Shift picks its ally or to the Timekeeper ability picker, beyond requiring a live focus.
- No card reader changes outside battle; draft, binder, shop and gauntlet keep tap / press reading.
- No new hero art; the crosshair marker is the only drawing.
- No AI changes: the tutorial bot keeps selecting then acting through the same server calls.
