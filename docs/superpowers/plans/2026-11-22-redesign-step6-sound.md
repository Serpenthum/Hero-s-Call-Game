# Step 6: Sound and Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu and battle music with crossfades, per-hero file-based battle sounds at even loudness, seven menu sounds, music settings and credits, and a small server addition so commanded attacks, turret shots and triggered specials get the right sound.

**Architecture:** A one-time node script turns the owner's picks in `audio-source/` into small, loudness-matched files in `frontend/public/audio/` and writes a typed manifest. A new `frontend/src/sound/` module owns the shared AudioContext, settings, effect playback and music. A pure function maps each battle event to sound cues using a hero-to-family table; the server adds `actor.name`, `abilityName`, `commands`, `triggers` and `turretKeys` to the battle event from "sound notes" the game logic records.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest (`npm test` in `frontend/`), Web Audio API, ffmpeg 9.1 (winget, not on PATH: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.1-full_build\bin`), Node backend with `node --test` (`npm test` in `backend/`).

**Spec:** `docs/superpowers/specs/2026-11-22-redesign-step6-sound-design.md` (all picks, the hero table and the licence table are there; this plan does not repeat them except where a task needs exact values).

## Global Constraints

- No rule, balance, timing or battle-engine change. Server work only adds optional fields to the battle event.
- No button sounds; no mode-card hover; no pack shake, card launch, card land, card deal, searching or match-found sounds.
- Keep synthesized: death, win, lose, turn clock (`startClockSound`), `chatter`, the Settings volume preview. Remove: `swing` (owner: the swing before every attack goes away), and file sounds replace `hit`, `miss`, `cast`, `heal` in battle. Poison ticks, auras and other end-of-turn damage keep today's synthesized hit.
- Settings keys `heroscall.sfx`, `heroscall.sfxVolume` keep their meaning; new keys `heroscall.music` (`'on'|'off'`, default on) and `heroscall.musicVolume` (0..1, default 0.5).
- Sound plays even when the iPhone is on silent (owner).
- Battle sounds play even with animation speed `off`.
- `prefers-reduced-motion` mutes nothing.
- Every new battle-event field is optional; the website must work against a server without them (they deploy minutes apart).
- A missing or failed sound file is skipped silently; nothing awaits audio.
- `audio-source/` is never committed (already in `.gitignore`). `frontend/public/audio/` is committed, total under 5 MB.
- Every shipped file appears in `frontend/public/audio/CREDITS.md`; Settings shows a Credits line naming VWolfdog (Jordy Hake) for the harp and the Woods author, both CC-BY.
- Colours only from `frontend/src/styles/tokens.css` (`npm run check:tokens` must pass).
- Server deploy only on the owner's "go live": `deploy:server` first, poll `/api/user/1` until the new code answers, then the site.

## Review Focus

1. **Server without the new fields** (old live server during the deploy gap, tutorial rig, bots): every event still produces sensible sounds and nothing throws. Test in Task 6.
2. **Audio not loaded yet or failed to load** (slow phone, 404): the cue is skipped, later cues still play. Test in Task 2.
3. **Settings changed while sound is playing**: Music off stops music within one fade; Sound effects off or volume 0 means the next cue is silent. Tests in Tasks 2 and 3.
4. **App hidden or no tap yet**: no music before the first pointer or key event; music pauses on `visibilitychange` hidden and resumes on visible. Test in Task 3.
5. **Busy events** (Fireball on four heroes, Declare War with two allies plus a Twin Spell): one hit cue per hero action, commanded cues spaced, at most 6 effects at once. Tests in Tasks 2 and 6.

---

### Task 1: Audio build script, processed files, credits, manifest

**Files:**
- Create: `frontend/scripts/audio-picks.mjs` (the picks table, exported)
- Create: `frontend/scripts/build-audio.mjs` (runs ffmpeg, writes files, manifest and credits)
- Create: `frontend/scripts/audio-picks.test.mjs`
- Create (generated, committed): `frontend/public/audio/sfx/*.mp3`, `frontend/public/audio/music/*.m4a`, `frontend/public/audio/CREDITS.md`, `frontend/src/sound/manifest.ts`
- Modify: `frontend/package.json` (add `"build:audio": "node scripts/build-audio.mjs"`)

**Interfaces:**
- Produces `frontend/src/sound/manifest.ts`:
  - `export type SoundGroup = 'battle' | 'menu' | 'binder' | 'pack'`
  - `export type SoundId =` the ids below (string union)
  - `export const SOUNDS: Record<SoundId, { file: string; group: SoundGroup }>` (file relative to `/audio/`)
  - `export const MUSIC: { menu: [string, string]; battle: string }`

**Sound ids and sources** (ids are fixed; source paths are under `audio-source/`, letters/numbers as in the spec):

| id | source | kind |
|---|---|---|
| `weapon.hit` / `weapon.crit` / `weapon.miss` | S4 / H7 / S2 | hit / crit / hit |
| `bow.hit` / `bow.crit` | S1 / A1 (`preview/archer-crit-1.mp3`, or rebuild: Bow + H7 delayed 180 ms at 0.9, amix normalize=0, limiter 0.95) | hit / crit |
| `fists.hit` / `fists.crit` | H30 / H31 | hit / crit |
| `fire.*`, `earth.*`, `ice.*`, `lightning.*`, `plant.*`, `water.*`, `wind.*`, `explosion.*`, `laserPistol.*`, `laserRifle.*` (`.hit` and `.crit`) | per the spec's family table | hit / crit |
| `emp.hit` / `emp.crit` | X9 / X9 | hit / crit |
| `holy.hit`/`.crit`, `dark.hit`/`.crit`, `arcane.hit`/`.crit` | L1, L2, L3 (crit = same source) | hit / crit |
| `spell.miss` | L4 | hit |
| `heal` / `heal.water` | L14 / P58 | hit |
| `summon` | L7 | hit |
| `buff.self` / `buff.other` | L11 / L5 | hit |
| `coin` / `levelup` / `quest` | U2 / U9 / U12 (`ui_pack/.../*.aif`) | menu |
| `binder.open` | K7 then K4 joined into one file (K4 starts when K7 ends) | menu |
| `binder.page` / `pack.tear` / `pack.holo` | K5 / K28 / U8 | menu |

Groups: every family, miss, heal, summon, buff id is `battle`; `coin`, `levelup`, `quest` are `menu`; `binder.*` are `binder`; `pack.*` are `pack`.
Music: `music/harp.m4a` (Harp.mp3), `music/woods.m4a` (woods.wav, W4: `highpass=f=90,bass=g=-10:f=220:w=0.8`), `music/evil-awaits.m4a` (evil_awaits.mp3).

- [ ] **Step 1: Write the failing test** `frontend/scripts/audio-picks.test.mjs` (run with `node --test`):
  - `every pick has an existing source file` (skip with `t.skip` when `audio-source/` is absent, so CI without raw files passes)
  - `ids are unique and match /^[a-z]+(\.[a-zA-Z]+)?$/`
  - `every family id has both .hit and .crit`: for each of `weapon bow fists fire earth ice lightning plant water wind explosion laserPistol laserRifle emp holy dark arcane`
  - `every pick has a licence entry`: each pick's `source` key maps into a `LICENCES` table with `title`, `author`, `licence`, `url`, `creditRequired`
- [ ] **Step 2: Run** `node --test scripts/audio-picks.test.mjs` in `frontend/`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `audio-picks.mjs`** exporting `PICKS: Array<{ id, source, kind: 'hit'|'crit'|'menu', group, join?: string[] }>`, `MUSIC_PICKS`, `LICENCES` (values from the spec's licence table).
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Implement `build-audio.mjs`.** ffmpeg path from `process.env.FFMPEG` or the winget path above. Per effect: trim leading silence (`silenceremove=start_periods=1:start_threshold=-50dB`), cut to 2.0 s with a 0.3 s fade-out when longer (`levelup` and `quest` may run to 2.5 s), mono, 44.1 kHz, `libmp3lame` 96 kbps. Loudness: measure the max short-term (3 s window is too long for short sounds, so use momentary max, `ebur128` M values, padded with 0.5 s silence) and apply gain so `hit`/`menu` sounds reach **-14 LUFS momentary max** and `crit` sounds **-11.5**; then `alimiter=limit=0.95`. Music: two-pass `loudnorm=I=-20:TP=-2:LRA=11`, AAC 128 kbps stereo `.m4a`. Then write `manifest.ts` (with a "generated by build-audio.mjs, do not edit" header) and `CREDITS.md` (one row per shipped file: file, title, author, source URL, licence).
- [ ] **Step 6: Run** `npm run build:audio`, then measure: re-run the momentary-max measurement over `public/audio/sfx/*.mp3` and print min/max. Expected: hit/menu within -14 ± 1, crits within -11.5 ± 1; `du -sh public/audio` under 5 MB.
- [ ] **Step 7: Commit**
```bash
git add frontend/scripts/audio-picks.mjs frontend/scripts/build-audio.mjs frontend/scripts/audio-picks.test.mjs frontend/public/audio frontend/src/sound/manifest.ts frontend/package.json
git commit -m "feat(audio): build script, processed sounds and music, credits, manifest"
```

### Task 2: Sound core (settings, shared context, silent-mode unlock, effect player)

**Files:**
- Create: `frontend/src/sound/settings.ts`, `frontend/src/sound/context.ts`, `frontend/src/sound/effects.ts`, `frontend/src/sound/index.ts`
- Create: `frontend/src/sound/effects.test.ts`, `frontend/src/sound/testAudio.ts` (a fake AudioContext for tests)
- Modify: `frontend/src/battleAnimations.ts` (settings and `audioCtx` move out; it re-exports the moved settings so existing importers keep working; `tone()` and `startClockSound()` use `getAudioContext()`)

**Interfaces:**
- `settings.ts`: `getSfxEnabled(): boolean`, `setSfxEnabled(on)`, `getSfxVolume(): number`, `setSfxVolume(v)` (moved unchanged), plus `getMusicEnabled()`, `setMusicEnabled(on)`, `getMusicVolume()`, `setMusicVolume(v)`, and `onSoundSettingsChange(fn: () => void): () => void` (fired by every setter).
- `context.ts`: `getAudioContext(): AudioContext | null` (lazy, null when unsupported), `installAudioUnlock(): void` (once: on first `pointerdown`/`keydown` resumes the context, sets `navigator.audioSession.type = 'playback'` when present, and on iOS without `audioSession` plays a muted 0.1 s silent `<audio>` once to switch the session; dispatches an internal `unlocked` callback), `onAudioUnlocked(fn): () => void`, `isAudioUnlocked(): boolean`.
- `effects.ts`: `loadSoundGroup(group: SoundGroup): Promise<void>` (fetch + `decodeAudioData` each file once, cache buffers, swallow errors per file), `playSound(id: SoundId, opts?: { delayMs?: number }): void`, `MAX_VOICES = 6`.

- [ ] **Step 1: Write the failing tests** in `effects.test.ts` using the fake context:
  - `playSound skips a sound that is not loaded and does not throw`
  - `a failed file does not stop the rest of its group loading` (one fetch rejects, others decode; `playSound` of a good id starts one source)
  - `sfx off means no source starts`; `volume 0 means no source starts`
  - `gain follows getSfxVolume at start time` (volume 0.5 → gain node value 0.5 × base)
  - `no more than 6 sources play at once` (start 8 quickly; the 2 oldest are stopped or the 2 newest dropped, assert active ≤ 6)
  - `delayMs schedules the start at currentTime + delay/1000`
- [ ] **Step 2: Run** `npx vitest run src/sound/effects.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** settings, context and effects as above. `battleAnimations.ts` keeps `export { getSfxEnabled, setSfxEnabled, getSfxVolume, setSfxVolume } from './sound/settings'`.
- [ ] **Step 4: Run** the new tests plus the full suite `npm test`. Expected: all PASS (existing SettingsModal, TurnTimerBar and BattleFX tests unchanged).
- [ ] **Step 5: Commit** `feat(sound): shared audio core with settings, unlock and effect player`

### Task 3: Music

**Files:**
- Create: `frontend/src/sound/music.ts`, `frontend/src/sound/music.test.ts`

**Interfaces:**
- `setMusicMode(mode: 'menu' | 'battle' | 'none'): void` (`none` until the app knows; App sets it in Task 7)
- `CROSSFADE_MS = 2500`
- Internals the tests can see: `__musicStateForTests(): { mode; playing: string | null; gain: number }`

Behaviour: music plays through `<audio>` elements routed via `createMediaElementSource` into a per-track GainNode (iOS ignores `element.volume`). Menu mode plays `MUSIC.menu[0]` then `[1]` then `[0]`… on `ended`; battle mode loops `MUSIC.battle`. Mode change crossfades over `CROSSFADE_MS`. Leaving battle restarts the menu rotation at the track after the one last heard (my call; the spec leaves resume vs restart open). Nothing plays until `onAudioUnlocked`. `visibilitychange` hidden pauses all, visible resumes the current track. `onSoundSettingsChange`: Music off fades out and pauses; on fades in; volume applies within 100 ms.

- [ ] **Step 1: Write the failing tests** (fake context and a fake `HTMLAudioElement` with `play/pause/ended`):
  - `nothing plays before the first tap`, then `menu track 1 starts after unlock`
  - `menu rotation: track 1 ended → track 2 → track 1`
  - `battle mode crossfades: old gain ramps to 0 and new to the music volume over 2500 ms`
  - `battle track loops`
  - `hidden pauses, visible resumes the same track`
  - `music off pauses after the fade; on resumes`
  - `music volume change updates the active gain`
- [ ] **Step 2: Run** `npx vitest run src/sound/music.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `music.ts`.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sound): menu rotation and battle music with crossfades`

### Task 4: Settings: music controls and credits

**Files:**
- Modify: `frontend/src/components/SettingsModal.tsx` (import settings from `../sound/settings`), its CSS if needed
- Test: `frontend/src/components/SettingsModal.test.tsx` (create if absent)

Copy: the Sound effects row's small text becomes **"Battle and menu sounds"**. New rows in the same style right under the effects volume: **"Music"** switch (`aria-label="Music"`, small text **"Background music in menus and battles"**) and **"Music volume"** slider (`aria-label="Music volume"`, disabled when Music is off, like the effects slider). At the bottom, a small **Credits** section: "Music: Soft Mysterious Harp Loop by VWolfdog (Jordy Hake), CC-BY 3.0. Woods by {author}, {licence}. Sound effects: Kenney, lentikula, independent.nu, WobbleBoxx, untamedpixels and OpenGameArt contributors, CC0." Fill `{author}`/`{licence}` from `audio-picks.mjs` `LICENCES` (confirmed in Task 1).

- [ ] **Step 1: Write the failing tests:** `Music switch toggles heroscall.music`, `Music volume writes heroscall.musicVolume and is disabled when Music is off`, `Credits names VWolfdog`.
- [ ] **Step 2: Run** `npx vitest run src/components/SettingsModal.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npm run check:tokens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(settings): music switch, music volume and credits`

### Task 5: Server: sound information on the battle event

**Files:**
- Modify: `backend/battleEvents.js` (add `noteSound(game, note)`, read notes in `buildBattleEvent`)
- Modify: `backend/gameServer.js` `withBattleEvent()` (clear `game.soundNotes = []` before `run()`; pass `abilityName`; add `actor.name`)
- Modify: `backend/gameManager.js` at the command, turret and trigger sites (call `noteSound`)
- Create: `backend/test/soundnotes.test.js`

**Interfaces (event additions, all optional):**
```ts
actor: { playerId; heroIndex; key; name?: string }
abilityName?: string | null
commands?: Array<{ key: string; name: string; kind: 'attack' | 'ability'; abilityName?: string; hit: boolean; crit: boolean }>
triggers?: Array<{ key: string; name: string; special: string }>
turretKeys?: string[]   // tick events: targets damaged by Engineer turrets
```
- `noteSound(game, note)` where `note` is `{ type: 'command', hero, playerId, kind, abilityName?, hit, crit }`, `{ type: 'trigger', hero, playerId, special }` or `{ type: 'turret', targetHero, targetPlayerId }`; it pushes onto `game.soundNotes` when that array exists (so callers outside `withBattleEvent` cost nothing). `buildBattleEvent` turns notes into the fields above via `heroKey`, keeping order, and omits empty lists.

Note sites (find by the names; line numbers drift):
- Diplomat `processDiplomatAbility`: one `command` note per adjacent ally that actually attacks (not `attack_prevented`), with that attack's hit and crit.
- Timekeeper Chrono Shift (`processTimekeeperAbility` area, ~line 6950-7120, and `useTimekeeperSelectedAbility`): one `command` note for the commanded ally, `kind: 'ability'`, `abilityName` = the ally's ability, hit/crit from the ally's results (`commandResults`, flagged `wasCommanded`).
- Engineer turret damage at end of turn (~line 5378, `turret_count`): one `turret` note per target damaged.
- Triggered specials: Bomber `on_death` Explosion (~line 2106), Angel resurrection (`processAngelResurrection`, ~line 2072), Sorcerer Twin Spell recast (~line 3926): one `trigger` note each, `special` = the special's name.

- [ ] **Step 1: Write the failing tests** in `soundnotes.test.js` using `test/support/battle.js` (`makeManager`, `startBattle`, `setD20`, `select`) and `snapshotBattle`/`buildBattleEvent` around the action with `game.soundNotes = []`:
  - `Declare War lists both adjacent allies in order with hit and crit` (Diplomat between Ranger and Monk; `commands` names `['Ranger','Monk']`, kinds `attack`)
  - `Chrono Shift lists the commanded ally ability` (`kind: 'ability'`, `abilityName` is the ally's)
  - `turret damage at end of turn is in turretKeys` (Engineer with 1 turret)
  - `Bomber death explosion is a trigger` (`special: 'Explosion'`)
  - `Twin Spell recast is a trigger` (`special: 'Twin Spell'`, force the recast roll)
  - `a plain attack has no commands, triggers or turretKeys fields`
  - In `gameServer.test.js` (or the new file if `withBattleEvent` is not reachable): `battle event carries actor.name and abilityName`
- [ ] **Step 2: Run** `node --test test/soundnotes.test.js` in `backend/`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm test` in `backend/`. Expected: all PASS, including every existing test.
- [ ] **Step 5: Commit** `feat(server): battle events carry hero names, commanded allies, turret shots and triggered specials`

### Task 6: Hero sound map and event-to-cue mapping

**Files:**
- Create: `frontend/src/sound/heroSounds.ts`, `frontend/src/sound/heroSounds.test.ts`
- Modify: `frontend/src/battleAnimations.ts` (`BattleEvent` gains the Task 5 optional fields)

**Interfaces:**
- `export type Family = 'weapon'|'bow'|'fists'|'fire'|'earth'|'ice'|'lightning'|'plant'|'water'|'wind'|'explosion'|'laserPistol'|'laserRifle'|'emp'|'holy'|'dark'|'arcane'`
- `export type Cue = { sound: SoundId | 'synth.tick'; delayMs: number }`
- `export function soundsForEvent(ev: BattleEvent, speed: AnimSpeed): Cue[]`
- `export function soundForSpecial(heroName: string): SoundId` (manual `activate-special`: Mech → `explosion.hit`, Diplomat → `heal`, others → `buff.other`)
- `HERO_SOUNDS: Record<string, { attack: Family; ability?: Family | 'heal' | 'summon' | 'buff.self' | 'buff.other' | 'command'; abilities?: Record<string, Family | 'heal' | 'summon'>; triggers?: Record<string, SoundId> }>`: values from the spec's hero table. Unlisted or disabled heroes: `{ attack: 'weapon', ability: 'weapon' }`. Blood Hunter: `abilities: { 'Crimson Rite': 'weapon', 'Sanguine Renewal': 'weapon' }` (its heal part follows the mixed rule). Triggers: Bomber `Explosion` → `explosion.hit`, Angel `Resurrect` → `buff.self`, Sorcerer `Twin Spell` → `ice.hit`.
- Spell families (`fire earth ice lightning plant water wind explosion laserPistol laserRifle emp holy dark arcane`) miss with `spell.miss`; `weapon bow fists` miss with `weapon.miss`.

Rules:
- Impact delay (matches `BattleFX.tsx` today): attack 160 ms, ability 300 ms, tick 80 ms, times `speedFactor(speed)`; for `off` use the `fast` factor.
- `attack`: family = `HERO_SOUNDS[actor.name].attack` (`variant === 'beast_attack'` → `weapon`); crit → `.crit`, hit → `.hit`, miss → the family's miss.
- `ability` with `commands`: one cue per command, the first at the ability delay, each next +350 ms, using that command hero's attack family (kind `attack`) or ability family (kind `ability`, using `abilityName` when the hero has `abilities`).
- `ability` otherwise, by `cast`: `heal` → `heal` (`heal.water` when the family is `water`); `summon` → `summon`; `buff`/`debuff`/`generic` → the hero's `ability` entry if it is a sound id, else `buff.other`; `damage` → family hit/crit/miss. If a damage ability also raised any target's HP (`delta > 0`, e.g. Paladin, Warlock), add `heal` +150 ms.
- `tick`: if `turretKeys` has entries, one `laserPistol.hit`; if any other target lost HP, one `synth.tick`.
- `triggers`: each adds its sound +400 ms after the main cue.
- Fallbacks: no `actor.name` → family `weapon`; no `abilityName` with `abilities` → the first entry.
- At most one main hit cue per event, however many targets.

- [ ] **Step 1: Write the failing tests** (one per line):
  - `Ranger attack hit → bow.hit; crit → bow.crit; miss → weapon.miss`
  - `Monk ability crit → fists.crit`
  - `Wizard Fireball on four heroes → exactly one fire.hit`
  - `Wizard basic attack → weapon.hit`
  - `Silencer ability → emp.hit; miss → spell.miss`
  - `Druid Wildshape (cast heal) → heal`
  - `Paladin Divine Smite hit with a heal target → weapon.hit then heal 150 ms later`
  - `Engineer Call Turret → summon; tick with turretKeys and poison → laserPistol.hit and synth.tick`
  - `Declare War commanding Ranger then Monk → bow.hit at 300 ms, fists.hit at 650 ms` (speed normal)
  - `Chrono Shift commanding Wizard → fire.hit`
  - `Bomber trigger Explosion adds explosion.hit 400 ms after`
  - `event with no actor.name, no abilityName, no commands → weapon.hit, no throw`
  - `speed off uses the fast factor (attack cue at 96 ms)`
  - `every enabled hero in backend/heros.json has an entry or is meant to default` (import the JSON; assert the explicit list from the spec is present)
  - `soundForSpecial('Mech') → explosion.hit; ('Diplomat') → heal`
- [ ] **Step 2: Run** `npx vitest run src/sound/heroSounds.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `heroSounds.ts`.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sound): hero sound families and event-to-cue mapping`

### Task 7: Battle and music wiring

**Files:**
- Create: `frontend/src/sound/battleSound.ts` (`startBattleSound(): () => void` subscribes to `battleEventBus`, plays `soundsForEvent` cues; `synth.tick` calls the legacy synth hit)
- Modify: `frontend/src/components/BattleFX.tsx` (remove `sfx.swing()`, `sfx.miss()`, `sfx.cast()`, `sfx.heal()` and the `sfx.hit(ev.crit)` call; keep `sfx.death()` and the game-over sounds)
- Modify: `frontend/src/battleAnimations.ts` (drop `swing` from `sfx`; keep the others, `hit` still used by Settings preview, tick and tutorial)
- Modify: `frontend/src/App.tsx` (once on mount: `installAudioUnlock()`, `startBattleSound()`; an effect sets `setMusicMode(phase in ['initiative','battle','ended'] ? 'battle' : 'menu')` and calls `loadSoundGroup('battle')` when entering battle; in `socket.on('special-activated')` call `playSound(soundForSpecial(heroName))` where `heroName = data.results[0]?.source`)
- Test: `frontend/src/sound/battleSound.test.ts`, existing `BattleFX` tests updated

- [ ] **Step 1: Write the failing tests:** `an emitted attack event plays one cue through playSound`, `cues play with animation speed off`, `BattleFX no longer calls sfx.swing/miss/cast/heal/hit` (spy on `sfx`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(sound): battle sounds from the hero map, music follows the game phase`

### Task 8: Menu sounds

**Files (hooks; confirm the exact line by reading each):**
- `frontend/src/App.tsx` battle and quest reward handlers (~lines 1670-1790): `playSound('coin')` when a reward adds coins; `playSound('levelup')` when `leveledUp` is true (the level-up display; play once per level-up, not on every re-render).
- `frontend/src/components/QuestRewardModal.tsx`: `playSound('quest')` when it opens (once). Quest coins also play `coin` 600 ms later.
- `frontend/src/components/BinderOpening.tsx`: `loadSoundGroup('binder')` on mount; `playSound('binder.open')` when `stage` becomes `'opening'` (after `LAND_MS`, or on the skip tap).
- `frontend/src/components/binder/useBinderTurn.ts`: `playSound('binder.page')` when a turn starts (`phase: 'moving'`).
- `frontend/src/components/packs/PackOpening.tsx`: `loadSoundGroup('pack')` on mount; `playSound('pack.tear')` at the cut (where `CUT_SPARKS_MS` sparks are scheduled); `playSound('pack.holo')` in `holoTakeover` when the tapped holo card turns.
- Shop coin balance going down plays nothing.
- `loadSoundGroup('menu')` once after unlock.

- [ ] **Step 1: Write the failing tests** next to each component's existing tests (mock `../sound` `playSound`): `quest modal plays quest once`, `binder opening plays binder.open when it opens`, `a page turn plays binder.page once`, `pack cut plays pack.tear`, `tapping the holo card plays pack.holo`, `a reward with coins plays coin; with leveledUp plays levelup once`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the hooks.
- [ ] **Step 4: Run** `npm test` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sound): coin, level up, quest, binder and pack sounds`

### Task 9: Local preview and owner listen-through

No new code unless a fix is needed.

- [ ] **Step 1:** Start the backend locally (as in `docs/DEPLOY_CLOUDFLARE.md` / `backend` dev script) and `npm run dev` in `frontend/` pointed at it. Expected: the lobby loads, music starts on the first tap.
- [ ] **Step 2:** Self-check with a bot or two browser tabs: Ranger crit, Monk, Wizard Fireball, Diplomat Declare War with Ranger and Monk, Engineer turret tick, Bomber death, Settings music off/on, tab hidden. Note anything off.
- [ ] **Step 3:** Hand the owner the local URL and a short listening list (the same moments plus binder, pack and quest). Record his rulings in `.superpowers/sdd/2026-11-22-redesign-step6-sound/progress.md`.
- [ ] **Step 4:** Tell the owner what could not be verified without a real iPhone (silent-switch playback, music fades on iOS).
- [ ] **Step 5:** Commit any fixes. Deploy only on the owner's "go live": `deploy:server`, poll `/api/user/1` until the new code answers, then `deploy:site`.
