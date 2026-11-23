# Hero's Call redesign step 6: sound and music: design

Date: 2026-11-22. Status: written for owner approval. Branch: `redesign-sound` (from main 12075c5).
Parent spec: `2026-11-17-card-lobby-packs-redesign-design.md`, section 7 "Sound and music".

## Intent

The owner wants the game to feel alive and tense: a low, tense, harp-like harmony that always plays in the background,
a darker track in battles, and battle sounds that fit the hero making them (an archer sounds like a bow, a fire mage
like fire, a monk like fists). Sounds must feel equally loud, so no file jumps out, with crits a little bigger. A few
menu moments (coins, level up, quest complete, binder, holo card) get sounds too. Every file was chosen by the owner by
ear from free-licence packs.

Success: on a sideways phone, the harp starts on the first tap and never stops in menus, fades into the battle track
when a battle starts and back afterwards, and in battle each hero's attacks, abilities, misses, crits and heals sound
like that hero, at an even volume, with the existing settings controlling all of it.

## Goals

1. Background music in all menus, battle music in battles, with crossfades.
2. File-based battle sounds chosen per hero "sound family", replacing the synthesized hit, crit, miss, cast and heal.
3. Equal loudness across all effects (crits slightly louder), and music balanced underneath.
4. Menu sounds for coin gain, level up, quest complete, binder opening, binder page turn, pack opening, holo card turn.
5. Music on/off and music volume settings; a Credits line.
6. One general sound module that the battle, menus, shop and binder all use.
7. A small server addition so commanded attacks (Diplomat, Timekeeper) and turret shots can be told apart.

## Non-goals

- **No button sounds** (owner: "lets not do sound for buttons"). No mode-card hover sound.
- No pack shake, card launch, card land, card deal, searching or match-found sounds in this step (owner: "Im still
  missing pack sounds but lets leave it out for now"). The pack opening only gets the tear (K28) and the holo turn (U8).
- No per-card unique sounds. The owner plans "individual battle sounds later for cards in battle"; this step's
  families are the base those will build on.
- No rule, balance, timing or battle-engine change. The server change only adds information to the animation event.
- Sounds the synth already makes and nobody re-picked stay as they are: death, win, lose, the turn clock, the
  Settings volume preview. (`chatter` stays too.)

## Anti-goals

- A sound or music file with a licence the owner has not approved, or missing from `CREDITS.md`.
- Some sounds much louder than others (the raw picks differ by about 16 dB; that must not reach the game).
- Music that starts loud, cuts hard, stutters at the loop point, or keeps playing when the app is in the background.
- A battle that breaks or stalls because a sound file failed to load. Sound is always optional.
- Any change to how battles play out, or a server deploy while people are playing (owner confirmed nobody is on now,
  but still deploy only on his "go live").
- Raw downloads (`audio-source/`, ~70 MB) committed to git.

## Constraints

- From the parent spec: files served by Pages, not the Worker; formats that play on iPhone Safari and Android Chrome;
  small total download, loaded when first needed; music starts on first interaction, pauses in the background;
  settings keys `heroscall.sfx` / `heroscall.sfxVolume` stay, music gets its own on/off and volume in the same style;
  `frontend/public/audio/CREDITS.md` lists every file, source and licence.
- `prefers-reduced-motion` is about motion, not sound: it does not mute anything.
- The existing animation-speed setting (`off` / `fast` / `normal`): sounds follow the animation timing they are
  attached to today (they already fire from `BattleFX.tsx`). **With animations `off`, battle sounds still play (my
  call):** sound and motion are separate settings, and the Sound effects switch is how a player silences them. Today
  `BattleFX.play()` returns early when the speed is `off`, so the sound triggering moves into its own listener on the
  battle event bus with its own short timing; with animations on it lines up with the impact as today.
- Server: `backend/gameServer.js` `withBattleEvent()` builds one event per action through
  `backend/battleEvents.js` `buildBattleEvent()`. Backend tests: `node --test` in `backend/test/`. Server deploy
  restarts the Durable Object and logs everyone out; poll `/api/user/1` after `deploy:server` before deploying the site
  (the Durable Object kept serving old code for ~3 minutes last time).

## Approaches considered

- **A. Sound files processed once by a script, one general sound module, hero sound list in the website code, plus a
  small server addition (chosen).** The owner approved the processing script ("1, is perfect") and chose the server
  addition over guessing ("do A").
- B. Website only, guessing commanded allies: Diplomat/Timekeeper would play the first adjacent ally's sound once and
  turrets would keep the generic tick sound. Rejected by the owner: sounds would sometimes be wrong (a Declare War
  making a Ranger and a Monk attack would only play one of them).
- C. Sound tags inside `heros.json` on the server. Rejected: the hero list for sounds is a look-and-feel concern, and
  every sound tweak would need a server deploy.
- Keeping synthesized beeps: not what the owner asked for.

## The design

### 1. Source files and the processing script

Raw downloads live in `Game/audio-source/` (owner-downloaded, never committed; add `audio-source/` to `.gitignore`).
The listening page `audio-source/listen.html`, with `combat.js` and `menu.js`, is how the owner picked by number; the
numbers below are its labels.

A script (for example `frontend/scripts/build-audio.mjs`, run by hand, needs ffmpeg) reads the picks from a small
table, and writes processed files to `frontend/public/audio/`, which are committed. Per file:

- Trim leading silence. Cut long sounds: battle and menu effects end by about 2 s with a short fade-out (owner OK'd).
  Exceptions are the builder's call where a cut would ruin the sound (e.g. level up).
- Equal loudness: measure each effect's loudest moment (short-term loudness) and set all regular effects to one target,
  with crits about 2 to 3 dB louder ("slightly louder"). Music is normalised to about -20 LUFS integrated, all three
  tracks matched (Woods was 18 dB louder than the harp; that is what "hit hard" when it came in).
- Woods gets the owner-picked version **W4**: high-pass at 90 Hz plus a -10 dB bass shelf at 220 Hz, then the same
  loudness match.
- Output format and bitrate are the builder's call, within: plays on iPhone Safari and Android Chrome, music loops
  without an audible gap, total well under 5 MB. Short effects can be small mono files.
- `CREDITS.md` is written from the same table.

### 2. The picks

Licences (from the pack pages and licence files):

| Source | Licence | Credit |
|---|---|---|
| Soft Mysterious Harp Loop, VWolfdog (Jordy Hake), OpenGameArt | CC-BY 3.0 | required |
| Woods, OpenGameArt | CC-BY (author and exact version to confirm on the page) | required |
| Evil Awaits, bosslevelaudio, OpenGameArt | multi-licence, used under CC0 | none |
| Battle Sound Effects, OpenGameArt (`battle_sound_effects_0.zip`) | CC0 (confirm on the page) | none |
| 37 hits/punches, independent.nu ljudbank, OpenGameArt | CC0 | none |
| Healing Spell Impacts, lentikula, itch.io | CC0 | none |
| 150 Combat Sound Effects, untamedpixels, OpenGameArt (licence file: every file CC0, sources s01-s09 listed) | CC0 | none |
| Level up, Power up, Coin get (SoundPack01), WobbleBoxx, OpenGameArt | CC0 | none |
| RPG Audio, Kenney | CC0 (licence file) | none |

The builder confirms each "confirm" item on its page before the file ships. Any licence that turns out different goes
to the owner before that file is used.

**Music**

| Use | Pick | File in `audio-source/` |
|---|---|---|
| Menus (lobby, shop, binder, profile, everything outside battle), track 1 | #2 | `Harp.mp3` |
| Menus, track 2, alternates with track 1 (option A: they take turns, no jump on screen change) | #3, version W4 | `woods.wav` |
| Battles (draft is a menu; the battle track starts when the battle board starts) | #6 | `evil_awaits.mp3` |

Menu music plays track 1 then track 2 then track 1 and so on. Going into a battle crossfades (about 2 to 3 s) to the
battle track, which loops; leaving the battle crossfades back to the menu rotation. Whether menu music resumes where it
left off or restarts is the builder's call.

**Battle sound families**

| Family | Hit | Crit | Miss |
|---|---|---|---|
| Weapon (default) | S4 `battle_pack/battle_sound_effects/swish_4.wav` | H7 `hits_pack/hits/hit07.mp3.flac` | S2 `swish_2.wav` |
| Bow | S1 `battle_pack/battle_sound_effects/Bow.wav` | A1 = Bow + H7 layered (`preview/archer-crit-1.mp3`; recipe: H7 delayed 180 ms, 0.9 volume, mixed, limited) | S2 |
| Fists | H30 `hits/hit30.mp3.flac` | H31 `hits/hit31.mp3.flac` | S2 |
| Fire | P11 Fire Spell Impact 1 | P12 Fire Spell Impact 2 | L4 |
| Earth | P1 Earth Spell Impact 1 | P4 Earth Spell Impact 4 | L4 |
| Ice | P19 Ice Spell Impact 3 | P17 Ice Spell Impact 1 | L4 |
| Lightning | P23 Lightning Spell Impact 2 | P26 Lightning Spell Impact 5 | L4 |
| Plant | P27 Plant Spell Impact 1 | P30 Plant Spell Impact 4 | L4 |
| Water | P54 Water Spell Impact 1 | P55 Water Spell Impact 2 | L4 |
| Wind | P62 Wind Spell Impact 4 | P59 Wind Spell Impact 1 | L4 |
| Explosion | X13 explosion crunch 003 | X11 explosion crunch 001 | L4 |
| Laser pistol | R9 Laser Pistol 1 | R12 Laser Pistol 4 | L4 |
| Laser rifle | R14 Laser Rifle 1 | R18 Laser Rifle 5 | L4 |
| EMP | X9 ElectricExplosion | X9, louder | L4 |
| Holy (L1) / Dark (L2) / Arcane (L3) | L1 / L2 / L3 (`heal_pack/Impacts/Healing Spell Impact N.wav`) | the same sound, louder | L4 |

P, X and R files are in `combat_pack/04_magic_spells/`, `03_explosions_destruction/` and `02_combat_ranged/`; exact
file names by id are in `audio-source/combat.js`. Water and wind and laser rifle have no hero yet; they ship anyway, so
future heroes have them ("so sounds are fairly unique"). X9 is also meant as a crit for "some spells" the owner has
not chosen yet: no hero uses it as a crit in this step.

**Shared battle sounds**

| Moment | Pick |
|---|---|
| Any heal (heal abilities, heal specials, the heal part of lifesteal or mixed abilities) | L14 |
| A water hero's heal (none yet) | P58 Water Spell Impact 5 instead of L14 |
| Summon | L7 |
| Buff or activated special that is not damage or heal | L5 or L11 (builder picks per hero; self-buffs L11, other buffs/specials L5 is a fine default) |
| Weapon miss / spell miss | S2 / L4 (by the family's kind, as in the table) |

**Heroes** (enabled ones; disabled heroes get the weapon family until they come back)

| Hero | Attack | Ability | Notes |
|---|---|---|---|
| Arcane Archer, Ranger | Bow | Bow | |
| Monk, Brawler | Fists | Fists | |
| Mech | Weapon | Charged Fist: Fists | Self Destruct: Explosion |
| Engineer | Weapon | Call Turret: L7 | turret shots: Laser pistol |
| Wizard | Weapon | Fireball: Fire | |
| Pyromancer, Dragon Rider | Weapon | Fire | |
| Elementalist | Weapon | Thunderclap: Lightning | |
| Shaman | Weapon | Elemental Strike: Earth | |
| Shroomguard, Plague Spreader | Weapon | Plant | |
| Sorcerer | Weapon | Chromatic Orb: Ice | Twin Spell recast: Ice |
| Silencer | Weapon | Silence: EMP | |
| Bomber | Explosion | Bomb Toss: Explosion | death explosion special: Explosion |
| Cleric | Weapon | Guiding Bolt: Holy (L1) | |
| Warlock, Reaper | Weapon | Dark (L2) | heal parts: L14 |
| Angel | Weapon | Health Link: Arcane (L3) | Resurrect: L11 |
| Druid | Weapon | Wildshape: L14 | Healing Word (end of turn): L14 |
| Medic | Weapon | Med Bots: L7 | Emergency Heal: L14 |
| Diplomat | Weapon | Declare War: each commanded ally's own attack sound | Peace Treaty: L14 |
| Timekeeper | Weapon | Chrono Shift: the commanded ally's own ability sound | |
| Beast Tamer | Weapon | Call Beast: L7; beast's command attack: Weapon | |
| Berserker | Weapon | Bloodbath: L11 | |
| Paladin, Blood Hunter, Champion | Weapon | damage: Weapon; heal: L14 | |
| Barbarian, Cavalier, Piercer, Fighter, Warden, Swordsman, Assassin, Ninja, Dual Defender, Hoarder, Ace | Weapon | Weapon | |

"Ability: X" means the ability's hit, crit and miss come from family X. Spell crit means the family's crit file.

Owner-confirmed rules: the swing sound that plays before every attack today goes away (the hit files carry it);
poison ticks, auras and other end-of-turn damage keep today's sound; the attack sound plays at impact as today.

### 3. Menu sounds

| Moment | Pick | Where it fires (builder confirms the exact hook) |
|---|---|---|
| Coins gained (battle rewards, quest rewards, anywhere the coin total goes up) | U2 Coin01 | |
| Level up | U9 Rise03 | the level-up display |
| Quest complete | U12 Rise06 | `QuestRewardModal` |
| Binder opening | K7 bookOpen, then K4 bookFlip1 right after it | `BinderOpening` (the opening that now plays by itself after landing) |
| Binder page turn | K5 bookFlip2 | `useBinderTurn` / the page turn |
| Pack opening | K28 drawKnife2 (owner: "maybe not the best", a stand-in) | the tear in `PackOpening` |
| Holographic card turned over in a pack | U8 Rise02 | the tap that turns the holo card in `PackOpening` |

U files are `ui_pack/*.aif` (FX02 was split in two; not picked). K files are `rpg_pack/Audio/*.ogg`.

### 4. The sound module

A new general module (for example `frontend/src/sound/`) owns the shared audio context, settings, effect playback and
music. `battleAnimations.ts` keeps its synthesized sounds that are still used and imports the shared context and
settings from the new module; everything else in `battleAnimations.ts` stays where it is.

- Effects load on first need, by group: battle effects when a battle starts, binder sounds when the binder opens, and
  so on. A sound whose file is not loaded yet, or failed, is skipped silently. Nothing waits on audio.
- Overlap: a new effect does not cut off an earlier one, but the builder may cap simultaneous effects to avoid noise
  (e.g. a Fireball hitting four heroes plays its hit once, not four times; today `sfx.hit` already plays once per event).
- **Plays even when the phone is on silent (owner: "play the sound even if on silent").** On iPhone this means asking
  for playback mode (`navigator.audioSession.type = 'playback'` where supported) and/or playing through a media
  element, so the ringer switch does not mute the game; the in-game switches and the phone's volume buttons still
  control it. The builder checks this on Safari behaviour as far as possible without a real iPhone and says what is
  unverified.
- Music starts on the first tap or key press anywhere, pauses when the page is hidden (`visibilitychange`), resumes
  when it comes back, and follows the Music setting live.
- Settings (in `SettingsModal`): keep "Sound effects" on/off + volume (its small text becomes general, not "Attack,
  hit, heal and victory sounds"); add "Music" on/off + "Music volume", same style. New keys follow the existing
  pattern, e.g. `heroscall.music` and `heroscall.musicVolume`. Defaults: music on, at a moderate volume (builder's call,
  quieter than effects).
- Credits: a short "Credits" line or section at the bottom of Settings that names the two CC-BY authors (VWolfdog /
  Jordy Hake for the harp, the Woods author) with links or titles, as their licences require.

### 5. Server addition

Add information to the animation event only; no rule changes.

- **Commanded actions:** when an action makes other heroes attack or use an ability (Diplomat's Declare War,
  Timekeeper's Chrono Shift, including the Chrono Shift pick follow-up `useTimekeeperSelectedAbility`), the event
  carries a list of the commanded heroes, in order, each with its hero key, attack or ability, hit, and crit. The
  website plays each one's own sound in that order, slightly spaced so they don't stack into one noise.
- **Turret shots:** the end-of-turn event marks which damage came from Engineer turrets, so the website can play the
  laser pistol for those and today's tick sound for the rest.
- **Ability name:** the event also carries the ability's name (the server already has it in `withBattleEvent`), so
  heroes with two abilities (Blood Hunter) or a mixed ability (Paladin) map cleanly. Activated specials already reach
  the website through `special-activated`; that is enough to play their sound by hero.
- **Triggered specials (my call, in line with the owner's "do A"):** specials that fire inside another action
  (Bomber's death Explosion, Angel's Resurrect, Sorcerer's Twin Spell recast, and any other `on_death`,
  `on_ally_death`, `on_ability_hit` style trigger) are tagged in that action's event (which hero, which special), so
  the website plays them instead of guessing. The manual `activate-special` button (Mech Self Destruct, Diplomat Peace
  Treaty) plays its sound from `special-activated` by hero.
- Old clients and the tutorial must keep working: every new field is optional.
- Tests in `backend/test/` for the new event fields.

## Left to the builder

The exact file format and bitrate; the exact loudness targets within "equal, crits slightly louder"; trim lengths;
how the hero list is stored in code (a hero name to family table is the obvious shape); crossfade lengths; music
default volume; how many effects may overlap; the exact hooks for menu sounds; whether menu music resumes or restarts
after a battle; L5 vs L11 per buff where the table says "L5 or L11".

## Release

Site and server, from branch `redesign-sound`. Shown to the owner before it goes live (a preview he can listen to in a
browser). **Preview (my call):** run the branch locally, website and server together, so the owner hears the commanded
ally sounds, turret lasers and triggered specials before anything is deployed; the website must also degrade cleanly
(no errors, generic sounds) against a server without the new fields, since the live site and server deploy minutes
apart. Deploy only on his "go live": server first, poll `/api/user/1` for the new code, then the site.
