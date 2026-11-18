# Hero's Call: new card, lobby, packs, binder, sound, sideways-phone app: design

Date: 2026-11-17. Status: written for owner approval.

## Intent

The owner looked at the live lobby and found it bland and static. He wants the game to feel like a trading card
game he loves (Yu-Gi-Oh is his reference for feel, not something to copy): a striking card, motion, rare shiny pulls,
a pack opening that feels like an event, a binder worth opening, and sound. He also wants the game built for a phone
held sideways at all times, and installable as an app.

Success: on a sideways phone, a player opens the installed app, lands in a lobby that moves, sees the new full-art
cards everywhere (lobby, draft, battle, shop, binder, survival, gauntlet, profile), can read any card by tapping it,
opens a pack with a dramatic reveal that sometimes gives a holographic card, opens a binder that shows their
holographics and favourites, and hears sound and music throughout. Nothing about rules, balance or the battle engine
changes.

## Visual source of truth

Approved mockups, copied into `docs/superpowers/specs/2026-11-17-redesign-mockups/` (open in a browser; hero art loads
from the live site):

- `card.html`: the card. Font, sizes, plain / favourite / holographic states, tap to read, tiny mode.
- `lobby.html`: the lobby with Lively motion, searching state, match found, quest completed.
- `packs-and-binder.html`: pack opening (round 2, owner-approved) and binder.
- `accuracy-icons.html`: where the accuracy icon was chosen (crosshair).

Where the mockups disagree, this document wins. Known disagreements are listed under each part. The mockups are
reference code: copy their look and timing, not their structure.

## Goals

1. A new card face used everywhere a hero card appears, with holographic and favourite states.
2. Every card readable: bigger rules text, tap any card to open it large, tiny cards drop rules text.
3. A redesigned lobby with always-on Lively motion.
4. Holographic cards: a new pack rule, storage on the server, shown everywhere including to opponents, with a
   settings switch to hide the effect on your own screen.
5. A new pack opening and a new binder opening, drawn in code.
6. Sound effects and background music, from free-licence files the owner approves.
7. Every screen designed for a sideways phone first; upright phones are asked to rotate. Computers keep working.
8. The site installable as an app (home-screen icon, full screen, sideways).
9. A draft screen layout fix: bigger cards on computers, all five cards on screen on a phone.

## Non-goals

- No rule, balance, battle-engine, draft-clock or matchmaking changes (except the shop pack rule below).
- No App Store or Play Store app. It stays a website that can be installed.
- No offline play. The app needs internet.
- No hero types or roles (the mockups once showed a type line; the owner dropped it).
- No new hero art or pack art. Existing `hero-images/*.webp` and `pack1.png` are reused.
- No upright-phone layouts.

## Anti-goals (a failure even if it "works")

- Copying Yu-Gi-Oh's names, layouts, frames, card backs, art or sounds. Borrow the feel only.
- Any battle state that becomes invisible or ambiguous on the new card (HP, taunt, poison and every other status,
  dead, banned, selected, current turn, targetable/blocked, ally/enemy, companions, Dragon Rider's mounted/dismounted
  image).
- A shipped screen the owner has not seen. Each step is shown to him (screenshots or a preview) before it goes live.
- Sound or music with a licence that requires payment, forbids use in a game, or that the owner has not approved.
- A deploy that leaves installed apps stuck on an old version.
- Text on the card that is smaller than on today's card at the same card size.

## Constraints

- Frontend: Vite + React + TypeScript in `frontend/`. Backend: `backend/`, running in one Cloudflare Durable Object
  (`backend/worker/`), with tests under `node --test` in `backend/test/`. Frontend tests: `vitest run src`.
- Hosting: website on Cloudflare Pages (`npm run deploy:site`), server on a Worker (`npm run deploy:server`), see
  `docs/DEPLOY_CLOUDFLARE.md`. A server deploy restarts the Durable Object, ends live matches and logs everyone out:
  only deploy the server when nobody is playing, and tell the owner when it will happen.
- Free plan limits (see the hosting design). Sound files are served by Pages, not the Worker.
- The database is SQLite inside the Durable Object, already holding live player data. There is no migrations system
  (`database.js` only runs `CREATE TABLE IF NOT EXISTS`), so a new column needs a guarded `ALTER TABLE` that works on
  both drivers (`backend/sql/nodeDriver.js` for tests, `backend/worker/doSqlDriver.js` live) and on a database that
  already has the column.
- Screen sizes to design and check: 640x360 (smallest sideways phone), 844x390 (main target), 1440x900 (computer).
  iPhones in sideways orientation have a notch on one side: respect `env(safe-area-inset-*)`.
- The existing design tokens (`frontend/src/styles/tokens.css`) stay the only place raw colours live; new colours
  (stat colours, holographic rainbow) are added there.
- `prefers-reduced-motion` must turn off ambient motion everywhere (lobby float, embers, glints, holographic drift,
  pack and binder flourishes become simple fades). The existing in-game "Battle animations: off" setting does the same.
- Currency rule from the October design still holds: the coin image plus a number, never the words "VP", "coins" or
  "victory points" in the interface. (This document says "coins" only for readability.)

## Approaches considered (how the card gets built)

`frontend/src/components/HeroCard.tsx` is 931 lines with battle logic mixed in, used in about 12 places, and sized with
CSS `zoom` overrides spread over six stylesheets.

1. **Restyle it in place.** Lowest risk to behaviour, but `zoom` fights the tilt and holographic layers, and the scale
   overrides keep spreading.
2. **Rewrite it from scratch.** Cleanest, but risks breaking battle behaviour that the card currently carries.
3. **New face, logic untouched (chosen).** A new presentational card face draws the card. `HeroCard` keeps all its
   battle logic (states, status effects, companions, HP animation, Dragon Rider) and renders through the new face.
   Sizing moves to one system based on the card's width (the mockups use `font-size: width/20` and `em` units),
   replacing the `zoom` overrides. Chosen because the owner gets the new card everywhere without the battle engine's
   card behaviour being rewritten.

## The parts

### 1. The card (see `card.html`)

Full art: the hero image fills the whole card (`object-fit: cover`, focus near the top, about `50% 12%`).

- **Frame:** a thin brass border, an inner hairline set in from the edge, and brass corner brackets top-left and
  bottom-right. Rounded corners.
- **Stats:** four hexagon gems down the left side, top to bottom: HP (heart, red `#d2543c`), Defense (shield, blue
  `#7fa3c9`), Accuracy (crosshair, green `#67b39a`), Attack (crossed swords, gold `#d7b061`). Gems are 1.15 times the
  size in the first mockup ("Bigger"). HP shows `current/max`.
- **Name:** bottom of the card, Grenze Gotisch weight 600, white with a dark shadow, then a short brass rule.
- **Rules text:** below the name, Alegreya Sans, the same size as today's card at the same card width (about 14px at
  260px wide; it scales with the card). Each entry is "Ability:" or "Special:" in IM Fell English italic, brass, then
  the ability name in bold, then the description.
- **Text panel:** the area behind the name and text is only a light tint that fades up from the bottom (in the mockup:
  transparent, then 34% black, ending at 58% black), so the art and the holographic colours stay visible. Text gets a
  dark outline shadow to stay readable. **The lobby mockup and `card.html` still use the older near-black panel; the
  light panel in `packs-and-binder.html` is the approved one.** The owner raised this specifically.
- **No type line** under the name.
- **Tiny mode:** below about 130px card width, hide the rules text and the rule; enlarge the name and the stat gems.
  Tapping opens the large view.
- **Favourite:** a gold star in the top-right corner. No foil.
- **Holographic:** a rainbow sheen over the whole card (colour-dodge blend), fine sparkle points, and a bright cream rim
  with a soft blue-gold glow. The sheen drifts slowly on its own (Lively) and follows the pointer when hovered. A card
  can be both holographic and a favourite. The owner said the holographic look is "perfect": keep its strength.
- **Card back** (used in pack opening): dark leather crosshatch, brass inset border, the shield crest in the middle.
- **Glint:** a light sweep across the card every few seconds. Only on the lobby's featured card and the large view, not
  on every card (my call: a dozen glinting cards in the binder or battle is distracting and costs phone battery).
- **Tilt toward the pointer:** lobby featured card, pack cards and the large view only. Not in battle or draft, where it
  would fight with selecting targets (my call).
- **Battle and draft states:** every state listed under anti-goals must stay visible and distinguishable on the new face.
  Their placement on the new face is left to the builder, and the owner sees draft and battle screenshots before this
  step goes live.
- This replaces the October rule that a card must always show all ability text: the owner approved tiny mode plus tap
  to read.

### 2. Tap to read

Tapping (or clicking) any card anywhere opens it large over a dimmed screen (as tall as the screen allows, up to about
430px wide), with a short pop-in. Tap anywhere to close; Escape also closes. Exceptions, where tapping already does
something:

- In draft and battle, tapping a card keeps its current job (ban, pick, select target). The large view opens with a
  long press on touch screens and a right-click or a small "read" button on computers (builder's choice of the two
  computer options).
- In the lobby, tapping the featured card opens the binder at that hero.
- In the binder, the large view also shows the existing "Add to favourites" / "Remove from favourites" button.

### 3. Lobby (see `lobby.html`)

Layout on a sideways phone, left to right: featured card, the four mode cards in a 2x2 grid, the player panel. On a
computer: player panel on the left, featured card on a pedestal in the centre, mode cards in a row underneath. Upright
phones get the rotate screen (the mockup's upright layout is dropped).

- **Top bar:** title in Grenze Gotisch, coin pill, level and XP bar (with a slow glint), Friends button with a green
  pulsing dot when a friend is online (replaces today's floating friends button, which overlaps the panel), Sign out.
- **Player panel:** profile icon (opens the profile, as today), username, win-loss record from
  `player_stats.total_wins` / `total_losses` (my call to include; it was in the mockup), quests with a progress bar,
  their real reward (coin 3 and 15 XP each, from `backend/quests.js`) and a countdown to the next reset at midnight UTC,
  a Collection block ("26 of 40 heroes", favourites count, holographic count; my call to include, hidden on phones where
  there is no room), then Shop and Binder tiles.
- **Featured card:** the new card, floating gently, on a glowing pedestal with drifting embers and a candle-flicker
  vignette. Every 6 seconds a new hero flips in (rotate on the vertical axis). Heroes are random from all enabled
  heroes, except every fourth one is a random favourite if the player has favourites. Pauses while hovered and while
  the tab is hidden.
- **Mode cards:** Random (filled, the main action), Draft, Survival, Gauntlet. Each has its own accent colour (Random
  gold, Draft red, Survival orange, Gauntlet steel blue) and an icon that moves: dice tumble on hover, swords cross on
  hover, flame flickers always, tower rises on hover. Cards lift and glow on hover. Existing unlock rules and the unlock
  reveal animation (Draft at level 3, Survival at 21 heroes) stay.
- **Searching:** the mode card's border pulses, a light sweeps across it, the text reads "Finding an opponent ·
  0:12" counting up, and the button becomes "Leave queue".
- **Match found:** when a match is made, a full-screen overlay: "Match found", both players' profile pictures slide in
  from the sides, "VS" slams in with a flash, then the game screen. The draft clock (30 s) already runs on the server
  from the moment of the match and must not be changed, so this overlay is at most 2 seconds and tap to skip.
- **Arrival:** on entering the lobby after logging in, the top bar drops in, the panel slides in, the featured card
  flips in and the mode cards are dealt onto the table one after another (about 1.3 s total). Not replayed when
  returning from a match (my call: replaying it every time would get old).
- **Quest completed:** keep today's reveal (`useQuestReveal`), restyled to match: the quest turns green and the coin
  count ticks up.

### 4. Holographic cards and the new pack rule (server)

**Storage:** a new column `users.holo_heroes TEXT DEFAULT '[]'`, a JSON array of hero names, alongside
`available_heroes`. A hero in `holo_heroes` is always also in `available_heroes`. Returned wherever the user object
is returned (`/api/user/:id`, login, admin login, `/api/heroes?userId=` as needed).

**Who gets holographics:** only from packs. Starter heroes, heroes players already own today, admin accounts' heroes,
single-hero shop purchases and Gauntlet picks are all plain.

**A pack (`POST /api/shop/purchase-pack`), price coin 12:**

1. **Three base cards.** Each is a different enabled hero the player does not own, chosen at random, as today.
2. **Repeats.** If fewer than three unowned heroes are left, the rest of the base cards are random heroes the player
   already owns (all different from each other), and each repeat gives coin 2 back. The 2 is my number; the owner did
   not change it. Today a player who owns everything cannot buy a pack; after this change they can.
3. **Bonus holographic, 20% of packs.** Roll once per pack. On a hit, a fourth card is added: a random enabled hero that
   the player does not already have as holographic, and that is not one of this pack's three base cards (my call, so a
   pack never shows the same hero twice). If the player does not own it, they get it as a holographic. If they own it
   plain, it is upgraded to holographic. If every enabled hero is already holographic, there is no bonus.
4. Everything (coins, heroes, holographics, coins back) is saved in one guarded update, like `purchaseHeroes` today,
   and the per-user lock in `shop.js` (`runExclusive`) still wraps it.
5. **Response:** a list of cards, each `{ name, kind }` with `kind` one of `new`, `repeat`, `holo` (new hero, as a
   holographic), `holo_upgrade` (owned plain, now holographic), plus coins spent, coins back and the new balance. The
   client should not need a second fetch to draw the cards (today `Shop.tsx` fetches all of `/api/heroes`).

The random source on the server must be replaceable in tests so the 20% and the repeat rules can be tested exactly.

**Shown everywhere, including to opponents:** a card is holographic if the player it belongs to has it as holographic.
The server marks hero objects with `holo: true` wherever it builds them for a player: draft hands (each card belongs
to the player whose collection it came from), teams in draft, random mode, survival and gauntlet, and spectator views.

**Settings switch:** "Show holographic effects" (on by default), stored in the browser like the other settings
(`localStorage`, key in the existing `heroscall.*` style). Off hides the rainbow, sparkle and rim on that player's own
screen for every card, theirs and their opponent's. It does not change what they own. In the pack opening, switching it
off turns the rainbow light, sparks and face-down glow into the gold versions, but the holographic takeover (dim,
centre, tremble, burst) and the "Holographic!" banner and label still play, so the player still knows what they pulled
(my call).

Also: AI opponents (tutorial, any computer-controlled Gauntlet opponent) never show holographics. "26 of 40 heroes"
counts enabled heroes. Keep the old `heroesReceived` field in the pack response for one release, so a player whose page
has not reloaded yet still sees their heroes.

**Shop text:** the "See what's inside" panel and the pack tile say what a pack contains: 3 heroes, and a 1 in 5 chance
of a bonus holographic.

**Fix while here:** `POST /api/toggle-favorite-hero` uses the `userId` from the request body instead of the logged-in
user, so anyone can change anyone's favourites. Use the authenticated user (`req.userId` via `auth.requireUser`). The
binder step touches favourites, so this is in scope (my call).

### 5. Pack opening (see `packs-and-binder.html`, round 2)

Full screen over the shop:

1. The pack (`pack1.png` with "Adventure Pack" on it) spins in from below and lands, then floats with a slow shine.
   "Tap the pack to open it".
2. Tap: the pack shakes harder and harder and glows brighter (about 0.9 s), sparks fly, then a **straight horizontal
   cut** runs across the top of the pack along a line of light, left to right (the owner asked for straight, not
   jagged), the top flies off, the screen jolts, a column of light shoots up out of the opening, and the rest of the
   pack drops away.
3. The cards launch out one at a time, spin through the air, and land face down in a slightly fanned row. With a bonus
   holographic there are four, and the heading says "A bonus fourth card!".
4. Tap a card to turn it over: a white flash, gold sparks, and a label pops in under it: "New hero", "Already owned ·
   coin +2", "Holographic!" or "Upgraded to holographic!". Tapping a turned card opens the large view.
5. A face-down holographic glows with cycling rainbow colours. Turning it takes over the screen: everything else dims,
   the card moves to the centre and grows, trembles while its glow speeds up, then turns over with rotating light rays,
   a screen jolt, a burst of rainbow sparks and a large "Holographic!" (or "Upgraded to holographic!") banner, then
   settles back into the row.
6. Buttons: "Turn all over" (turns them in order, holographic last), "Buy another" with its price (disabled when the
   player can't afford it; the mockup's "Open another" did not charge), and "Done".
7. **No spinning light beams behind the pack** (the owner found them distracting). Removed in the final mockup.
8. When the pack holds a holographic, the line of light, the sparks and the column of light are rainbow instead of gold.

Replaces `PackOpeningAnimation.tsx`, which shows three packs turning into three cards and has three reveal timers
hard-coded. The new one must handle three or four cards.

### 6. Binder (see `packs-and-binder.html`)

1. A closed binder drops onto the table with a bounce and a puff of dust: red-brown leather with grain, stitched
   border, brass frame line, brass corners, a brass shield crest, "Hero's Call" in gold Grenze Gotisch, and a brass
   clasp that twitches every couple of seconds. "Tap the binder to open it".
2. Tap: the cover swings open, golden light spills out, the book grows to fill the screen, a few pages riffle past, and
   the cards are dealt into their pockets one by one.
3. Each spread is two pages with six pockets each (3 x 2), with brass rings down the middle. Cards are in tiny mode on a
   phone. Unowned heroes are dark and grey with a padlock. Favourites show the star. Holographics shimmer.
4. Filter tabs along the top: All, Owned, Favourites, Holographic. **Keep today's other controls** (Not owned and
   Disabled filters, sort by name / HP / Defense / Accuracy / Attack, and name search) in a compact form; the mockup
   dropped them but the owner never asked for that (my call; layout is the builder's).
5. Arrows on each side turn the page with a page-flip; the cards deal in again. A line at the bottom shows pages,
   "27 of 40 heroes" and the holographic count. Close button top right.
6. Tap a card for the large view, with the favourite button.
7. Skips straight to the open book under reduced motion (as `BinderOpening` does today).

Replaces `BinderOpening.tsx` and restyles `HeroCollection.tsx`. Remove the three fake fallback heroes in
`HeroCollection.tsx` (shown if `/api/heroes` fails) in favour of a plain error message (my call).

### 7. Sound and music

- **Effects:** button press, mode card hover (very quiet), searching, match found, coin gain, quest complete, level up,
  pack shake, pack tear, card launch, card land, card turn, holographic reveal, binder land, binder open, page turn,
  card deal. Exact list is the builder's, with the owner's approval of the files.
- **Music:** background music in menus (lobby, shop, binder). Whether battles get their own track is decided with the
  owner when he hears the shortlist.
- **Licence:** prefer CC0 (public domain). CC-BY is acceptable only with an in-game credits entry. Nothing that
  forbids games or needs payment. **The builder brings the owner a shortlist (links he can listen to, with the licence
  of each) before any file goes in.** Keep a `frontend/public/audio/CREDITS.md` listing every file, source and licence.
- **Settings:** keep "Sound effects" on/off and volume (`heroscall.sfx`, `heroscall.sfxVolume`); add "Music" on/off
  and music volume, same style.
- Browsers block audio until the first tap, so music starts on the first interaction. Music pauses when the app is in
  the background.
- The existing synthesized battle sounds (`battleAnimations.ts`) stay. Their shared audio setup and the sound settings
  move out of that battle module into a general sound module, so menus, packs and the binder can use them.
- Keep the total audio download small for phones (compressed, short loops, loaded when first needed). Formats must play
  on iPhone Safari and Android Chrome.

### 8. Sideways phone, everywhere

Every screen is laid out for a sideways phone first (844x390, down to 640x360), then for computers. That covers login,
lobby, shop and pack opening, binder, profile, friends and messages, settings and other modals, draft, battle,
survival and gauntlet. Screens that are not being redesigned (shop page, profile, friends, survival, gauntlet, modals)
get layout fixes only, so they fit and work at those sizes, in the new card and font. Any touch screen held upright
(phones and tablets) shows the rotate screen on every screen (my call, from "sideways the whole time"; today it
appears only in games, and only up to 700px wide, in `GameTheme.css` / `RotatePrompt`). Upright tablets therefore need
no layouts of their own.

In step 1, the four screens rebuilt later (lobby, draft, pack opening, binder) get only the new card, the font and the
rotate screen; their sideways-phone layouts come in their own steps, not twice (my call).

### 9. Draft screen

- On a computer, cards about a quarter bigger, using the empty space (today they are 195px wide in a lot of empty room).
- On a sideways phone, all five hand cards visible without scrolling (today they run off the bottom), in tiny mode,
  with long press to read. Team slots fit on screen.
- No change to draft rules or the clock.

### 10. Installable app

- A web app manifest: name "Hero's Call", short name "Hero's Call", dark theme and background colour from the tokens,
  `orientation: landscape`, `display: fullscreen` (falls back to standalone), start URL `/`.
- Icon: the shield crest from the binder cover, drawn as a proper app icon (Fable), at the sizes needed: 192, 512,
  a maskable version, and an Apple touch icon.
- iPhone: `apple-mobile-web-app-capable` and related tags so "Add to Home Screen" opens full screen. iPhones can't lock
  orientation for web apps, so the rotate screen covers that.
- A small service worker if needed for the install prompt. It must never serve an old version of the game after a
  deploy (network first for the app files, or no caching of them at all). No offline mode.
- A one-time, dismissible hint in the lobby on phones explaining how to install (Android: the browser's Install
  option; iPhone: Share, then Add to Home Screen). My call.

### 11. Fonts

- Titles everywhere: **Grenze Gotisch** (`@fontsource/grenze-gotisch`, version 5.3.0 exists), replacing IM Fell
  English as `--font-display`.
- IM Fell English italic stays for "Ability:" / "Special:" labels on cards.
- Alegreya Sans stays for all other text.

## Order of work

Each step is shown to the owner before it goes live, and can go live on its own.

1. **Foundation:** the new card face everywhere (all battle and draft states), tap to read, tiny mode, Grenze Gotisch,
   sideways-phone layouts and the rotate screen on every screen, the installable app. Site deploy only.
2. **Lobby.** Site deploy only.
3. **Draft screen layout.** Site deploy only.
4. **Holographics and packs:** storage, pack rule, holo in game state, favourite fix, new pack opening, settings switch,
   shop text. Server and site deploy (server when nobody is playing).
5. **Binder.** Site deploy only.
6. **Sound and music:** shortlist to the owner first, then the sound module, effects and music. Site deploy only.

## Working rules

- Work in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game` only. The current branch is
  `cloudflare-hosting`, which holds an uncommitted reconnect fix in `frontend/src/App.tsx` that is already live.
  Commit that fix first (owner to confirm), then branch for this work. Nothing is pushed to GitHub or merged without the
  owner saying so.
- Models (owner's rule, 2026-11-17): all animation and drawing on Fable (card face look, holographic effect, card back,
  lobby motion, pack opening, binder, icons, app icon). Everything else on Opus: plans, server code, storage, layout
  logic, sound plumbing, tests, reviews.
- Backend changes come with tests (pack rule including the 20% roll, repeats, coins back, the bonus excluding base
  cards and existing holographics, the all-holographic case; the column migration on a database with and without the
  column; holo flags on game-state heroes; the favourite fix).
- Every screen checked with Playwright screenshots at 640x360, 844x390 and 1440x900, and once with reduced motion.
- The tutorial points at parts of the lobby and the card (`data-tutorial="collection"` and the battle tutorial's stat
  anchors). Move those anchors onto the new lobby and card, and run the tutorial once end to end after steps 1 and 2.

## Left to the builder

- Component and file structure, and how the new face and `HeroCard` divide the work.
- Exact placement of battle states and status icons on the new face (owner sees screenshots).
- Animation timings within the feel of the mockups.
- The computer gesture for reading a card in draft and battle (right-click or a small button).
- Layout of the binder's extra filters, sort and search.
- The final sound list, formats and loading strategy (owner approves the files).
- Whether a service worker is needed, within the "never stale" rule.
- How holographic status reaches each game mode's hero objects.
