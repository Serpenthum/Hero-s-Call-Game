# Redesign step 2 (Lobby) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lobby with the approved Lively lobby: new top bar (with Friends), player panel (record, quests
with rewards and reset countdown, collection), featured card on a pedestal that flips to a new hero every 6 s, four
accent-coloured mode cards with moving icons, the searching state with a running clock, the arrival sequence, and a
"Match found" moment.

**Architecture:** `GameLobby.tsx` keeps its state and handlers (unlock rules, quest reveal, shop/binder/profile
modals) but its markup is split into four presentational components under `frontend/src/components/lobby/`. Every
rule that can be wrong without a screen (countdown, search clock, featured-hero choice, collection counts, arrival
once, match-found players) is a pure function in `frontend/src/lobby/lobbyRules.ts` with unit tests. Layout (Opus)
lands first with no motion; motion (Fable) is layered on in CSS afterwards so the reviewer can judge each separately.

**Tech Stack:** React 18 + TypeScript + Vite 4, plain CSS with tokens, vitest 0.34 (node environment;
`renderToStaticMarkup` for markup tests, as in `BattleDetailsPanel.test.tsx`). Playwright MCP browser for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-17-card-lobby-packs-redesign-design.md` part 3 (Lobby) and "Order of work"
step 2. Visual reference: `docs/superpowers/specs/2026-11-17-redesign-mockups/lobby.html` (copy its look and timing,
not its structure; its card is the old one — the card face from step 1 is already right).

## Global Constraints

- Branch `redesign-card-lobby-packs` in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`, from HEAD `cf8c894`. Commit per task. Never push; deploy only after the owner's OK. **Site deploy only** — no `backend/` change in this step.
- Models: **[Fable]** tasks (animation and drawing) on Fable; all other tasks and every review on Opus.
- No change to rules, unlock rules (Draft at level 3, Survival at 21 heroes, the unlock toast and reveal), matchmaking, socket events, or the draft clock (30 s from the match, server side).
- Raw colours only in `frontend/src/styles/tokens.css`; new files go in `MIGRATED` in `frontend/scripts/check-tokens.mjs`; `npm run check:tokens` passes. Mode accents become tokens: `--mode-random: #cfa95f; --mode-draft: #c9705a; --mode-survival: #d98a3d; --mode-gauntlet: #8fa5c9;`.
- Currency is the coin image plus a number; never "VP", "coins" or "victory points" in UI text.
- Sizes: 640x360, 844x390 (main target), 1440x900, plus one pass with `prefers-reduced-motion: reduce`. Upright touch screens already get the rotate screen (step 1); no upright layout.
- `prefers-reduced-motion` and "Battle animations: off" (`getAnimSpeed() === 'off'` from `battleAnimations.ts`; the card already uses `cardMotionOff()` in `HeroCard.tsx:47`) stop all ambient lobby motion: float, embers, flicker, glints, ping, flame, flips and deal-in become instant or a plain fade.
- Text never below 12px; tap targets at least 40px on phones; nothing important under `env(safe-area-inset-*)`.
- The tutorial anchor `data-tutorial="collection"` stays on the Binder tile.
- Frontend commands run in `frontend/`: `npm test`, `npm run build`, `npm run check:tokens`, `npm run lint`.

## Review Focus

1. **Queue for one mode, then click another mode or the Binder while searching** — today each handler cancels the search first; the new mode cards must keep that, and the search clock must reset to 0:00 for the new search. Test: Task 1 `searchElapsed` cases; Task 2 Step 8 manual check.
2. **A brand-new player** (4 starter heroes, level 1, no favourites, no stats row yet, Draft and Survival not unlocked): only Random and Gauntlet show, the grid still looks deliberate, record reads "0 wins · 0 losses", featured rotation never asks for a favourite. Test: Task 1 `nextFeaturedHero` with empty favourites, `formatRecord` with missing stats; Task 6 screenshots with a fresh account.
3. **Match found while a modal is open in the lobby** (Shop, Binder, Profile) or when the match is a draft: the overlay must still show, end within 2 s, and the draft screen underneath must already be live (its clock is running). Test: Task 5 Step 6.
4. **The install hint and the unlock toast on a 640x360 phone**: neither may cover the Shop/Binder tiles or the Random mode card's button (step 1 left the hint overlapping the tiles). Test: Task 2 Step 8 screenshot with the hint showing.
5. **`/api/heroes` or `/api/player-stats` fails**: the lobby still works — no featured card (pedestal only), record hidden, no fake heroes. Test: Task 2 Step 7 removes the fallback heroes; Task 6 Step 3 blocks the two requests and screenshots.

---

### Task 1: Lobby rules (pure functions)

**Files:**
- Create: `frontend/src/lobby/lobbyRules.ts`
- Test: `frontend/src/lobby/lobbyRules.test.ts`
- Modify: `frontend/scripts/check-tokens.mjs` (add the new file to `MIGRATED`)

**Interfaces:**
- Produces (all exported from `lobbyRules.ts`):
  - `timeUntilUtcMidnight(now: Date): string` → `"New in 5h 12m"`; under one hour `"New in 12m"`; under one minute `"New in 1m"` (never `0m`).
  - `searchElapsed(startedAt: number | null, now: number): string` → `"0:00"` when `startedAt` is null, else `m:ss` (`"0:12"`, `"1:05"`, `"12:00"`).
  - `formatRecord(stats: { total_wins?: number; total_losses?: number } | null): string | null` → `"24 wins · 11 losses"`, `"1 win · 1 loss"`; `null` when `stats` is null.
  - `nextFeaturedHero<H extends { name: string; disabled?: boolean }>(heroes: H[], favorites: string[], turn: number, previous: string | null, random: () => number): H | null` — choose among enabled heroes only; when `turn % 4 === 3` and some enabled hero is a favourite, choose a random favourite; never return `previous` if another choice exists; `null` when no enabled heroes.
  - `collectionSummary(heroes: { name: string; disabled?: boolean }[], owned: string[], favorites: string[], holo?: string[]): { owned: number; total: number; favorites: number; holo: number | null }` — counts enabled heroes only; `holo` is `null` when `holo` is `undefined` (the field arrives in step 4).
  - `markLobbyArrival(): void` and `consumeLobbyArrival(): boolean` — module-level flag: `consume` returns `true` once after each `mark`, then `false`.
  - `matchFoundPlayers(players: { id: string; name: string; profile_icon?: string }[], myId: string | null): { me: { name: string; icon: string | null }; them: { name: string; icon: string | null } } | null` — `null` unless exactly one other player is found; `icon` null when missing.
  - `heroImageUrl(base: string, name: string): string` → `${base}/hero-images/${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp` (the rule used today in `GameLobby.tsx:465`).

- [ ] **Step 1: Write the failing tests** in `lobbyRules.test.ts`:
  - `timeUntilUtcMidnight(new Date('2026-11-18T18:48:00Z'))` → `'New in 5h 12m'`; `('2026-11-18T23:48:00Z')` → `'New in 12m'`; `('2026-11-18T23:59:40Z')` → `'New in 1m'`.
  - `searchElapsed(null, 5000)` → `'0:00'`; `searchElapsed(1000, 13000)` → `'0:12'`; `(0, 65000)` → `'1:05'`; `(0, 720000)` → `'12:00'`.
  - `formatRecord({ total_wins: 24, total_losses: 11 })` → `'24 wins · 11 losses'`; `({ total_wins: 1, total_losses: 1 })` → `'1 win · 1 loss'`; `({})` → `'0 wins · 0 losses'`; `(null)` → `null`.
  - `nextFeaturedHero`: with heroes A, B, C(disabled), favourites `['B']`, `turn: 3`, `random: () => 0` → B; `turn: 3` with favourites `[]` → an enabled hero; C is never returned over 50 turns with `Math.random`; `previous: 'A'` with heroes A, B → B; one enabled hero A with `previous: 'A'` → A; all disabled → `null`.
  - `collectionSummary` with 3 enabled + 1 disabled, owned `['A','B','D(disabled)']`, favourites `['A']` → `{ owned: 2, total: 3, favorites: 1, holo: null }`; with `holo: ['A']` → `holo: 1`.
  - `consumeLobbyArrival()` → `false`; after `markLobbyArrival()` → `true`, then `false`.
  - `matchFoundPlayers` with two players and `myId` of the first → me/them in order, missing icon → `null`; one player → `null`; `myId: null` → `null`.
- [ ] **Step 2: Run** `npm test -- lobbyRules` → FAIL (module not found).
- [ ] **Step 3: Implement** `lobbyRules.ts`.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `feat(frontend): lobby rules (quest reset countdown, search clock, record, featured hero, collection, arrival, match players)`.

### Task 2: New lobby layout, no motion

**Files:**
- Create: `frontend/src/components/lobby/LobbyTopBar.tsx`, `PlayerPanel.tsx`, `FeaturedHero.tsx`, `ModeCards.tsx`, `ModeIcons.tsx`
- Replace: `frontend/src/styles/Lobby.css`
- Modify: `frontend/src/components/GameLobby.tsx` (markup only, plus the items in Steps 5–7), `frontend/src/components/HeroCollection.tsx` (`initialHero` prop), `frontend/src/styles/tokens.css` (mode accents), `frontend/scripts/check-tokens.mjs`, `frontend/src/install/InstallHint.tsx` / `InstallHint.css` (placement only, if needed)
- Test: `frontend/src/components/lobby/ModeCards.test.tsx`

**Interfaces:**
- Consumes: everything in Task 1.
- Produces (props are the contract Tasks 3–5 build on; class names are the contract for Task 4's CSS):
  - `LobbyTopBar` props: `{ coins: number; coinsBumping: boolean; level: number; xp: number; levelFlash: boolean; onLogout(): void; friends?: React.ReactNode }` (the `friends` slot is filled in Task 3). Root `.lobby-bar`; XP bar keeps `XPBar`.
  - `PlayerPanel` props: `{ username: string; profileIcon: string | null; record: string | null; quests: Quest[]; pendingQuestIds: Set<string>; revealStage: string; resetText: string; collection: ReturnType<typeof collectionSummary> | null; onOpenProfile(): void; onOpenShop(): void; onOpenBinder(): void }`. Root `.lobby-panel`; quests `.lobby-quest` (+ `.completed`, `.just-completed`) each with `.lobby-quest-bar > i` (width = progress %) and `.lobby-quest-reward` (coin + `reward.vp`, `reward.xp` XP; fall back to 3 and 15 when `reward` is missing); collection `.lobby-collection`; tiles `.lobby-tile.shop-tile` and `.lobby-tile.binder-tile[data-tutorial="collection"]`.
  - `FeaturedHero` props: `{ hero: Hero | null; favorite: boolean; swapKey: number; onOpen(heroName: string): void; onHoverChange(hovering: boolean): void }`. Structure: `.lobby-stage > .lobby-embers + .lobby-pedestal + .lobby-float > .lobby-featured[data-swap=<swapKey>] > HeroCard` and `.lobby-stage-hint`. HeroCard gets `glint`, `tilt`, `favorite`, `readable="none"` (the tap opens the binder instead).
  - `ModeCards` props: `{ modes: ModeCardSpec[]; searchingMode: string | null; searchClock: string; onLeaveQueue(): void }` with `export interface ModeCardSpec { mode: 'random' | 'draft' | 'survival' | 'gauntlet'; title: string; text: string; tag: 'Normal' | 'Ranked'; playLabel: string; extraClass?: string; onActivate(): void }`. Each card `.mode-card.mode-card--<mode>` (+ `.mode-card--main` on Random, `.mode-card--searching`), icon `.mode-card-icon`, button `.mode-card-go`.
  - `ModeIcons.tsx`: `DiceIcon`, `SwordsIcon` (two groups with classes `swords-l` and `swords-r`), `FlameIcon`, `TowerIcon` — SVGs copied from the mockup's `MODES` list, colours via `currentColor` / tokens.
  - `HeroCollection` new prop `initialHero?: string`: on load, if that hero is not in the current filter switch the filter to `'all'`, open the page that holds it, and give its pocket the class `binder-pocket--spotlight` for 1.6 s.

- [ ] **Step 1: Write the failing markup test** `ModeCards.test.tsx` (`renderToStaticMarkup`): with `searchingMode: 'draft'` and `searchClock: '0:12'`, the draft card has `mode-card--searching`, contains `Finding an opponent · 0:12` and a `Leave queue` button; the random card still shows `Play random`; with `searchingMode: null` no card contains `Leave queue`; the random card always has `mode-card--main`.
- [ ] **Step 2: Run** `npm test -- ModeCards` → FAIL.
- [ ] **Step 3: Build the four components and `ModeIcons.tsx`** to the interfaces above. Copy from the mockup: the title with brass diamonds either side, the coin pill, "Level N · xp / next XP" over the XP bar, Sign out as an icon button whose label hides on phones; the panel's portrait + name (both open the profile) + record line, "Quests" heading with the countdown on the right, quest cards, "Collection · 26 of 40 heroes" block with favourites count (and holographic count only when `collection.holo !== null`), Shop and Binder tiles (keep `ShopIcon`/`BinderIcon` from `LobbyIcons.tsx`); mode cards with accent top edge (`--mode-*` tokens), title, tag, text, button.
- [ ] **Step 4: Run** `npm test` → pass.
- [ ] **Step 5: Wire `GameLobby.tsx`:**
  - Record: keep the existing `/api/player-stats/:id` fetch, also store `stats` → `formatRecord(stats)`; `null` on failure.
  - Countdown: `timeUntilUtcMidnight(new Date())`, refreshed every 30 s.
  - Search clock: when `isSearching` turns true (or `searchMode` changes while searching) set `searchStartedAt = Date.now()`; tick once a second while searching; clear when not searching. `searchingMode` = `searchMode` for random/draft; Survival and Gauntlet keep their own screens.
  - Featured hero: `turn` counter; every 6000 ms call `nextFeaturedHero(allHeroes, user.favorite_heroes, turn, current?.name ?? null, Math.random)` and bump `swapKey`; skip the tick while hovered or while `document.visibilityState !== 'visible'`. First hero on load uses `turn: 0`.
  - Tap featured card → open the binder with `initialHero` = that hero (same path as `handleShowCollection`, so a search is cancelled first).
  - Collection: `collectionSummary(allHeroes, user.available_heroes, user.favorite_heroes, (user as { holo_heroes?: string[] }).holo_heroes)`; `null` until heroes load.
  - Keep: unlock reveal (`mode-unlock-reveal` as `extraClass`), unlock toast, `QuestRewardModal`, `RequirementModal`, profile/settings/how-to-play wiring, every handler's "cancel search first".
- [ ] **Step 6: Layout in the new `Lobby.css`** (no animation yet, apart from the unlock reveal and quest pop that exist today):
  - **Computer (wider than 900px and taller than 500px):** top bar; below it a grid `panel (18–20rem) | table`; the table is a column: featured card on its pedestal filling the space, mode cards in one row underneath (Random wider: `1.25fr 1fr 1fr 1fr`, fewer columns when modes are locked).
  - **Sideways phone (`max-height: 500px`):** slim bar; grid `featured (auto) | mode cards 2x2 (1fr) | panel (~190px)`, all within the screen height with no page scroll; featured card about 176px wide at 844x390 and smaller at 640x360 (size from the height left); pedestal and hint hidden; mode text hidden **except on the searching card, which shows "Finding an opponent · 0:12"**, icons 26px; at 640x360 also hide the Normal/Ranked tags and put the Shop/Binder tile icons beside their labels so the tiles stay on screen (see `docs/superpowers/specs/2026-11-17-redesign-mockups/lobby-step2.html`, the owner-facing mockup for this step); panel hides the Collection block and quest reward lines; tiles become one compact row.
  - Delete the old friends-dock padding (`5.25rem` bottom padding and the `body:has(.game-lobby-modern) .friends-icon` block) — Task 3 moves Friends into the bar. Delete `.random-hero-card .hero-card { transform: none !important }` (it blocks tilt).
  - The install hint sits where it covers neither the tiles nor a mode card button at 640x360 and 844x390 (e.g. a thin strip above the tiles inside the panel, or bottom-centre over the felt).
- [ ] **Step 7: Remove the fake fallback heroes** in `GameLobby.tsx` (`fallbackHeroes`): on failure, `allHeroes` stays empty and the stage shows only the pedestal.
- [ ] **Step 8: Verify** (two Quick admin logins are not needed; one account is enough): screenshots at 640x360, 844x390, 1440x900 — idle, searching Random (clock counts), searching Draft, with the install hint showing (emulated touch), quest done. Click Binder while searching: search stops. Tap the featured card: binder opens on that hero's page with the spotlight. Run the lobby tutorial: its Binder pointer lands on the Binder tile. `npm test`, `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 9: Commit** `feat(frontend): new lobby layout (top bar, player panel, featured hero, mode cards)`.

### Task 3: Friends in the top bar

**Files:**
- Create: `frontend/src/lobby/useFriendsOnline.ts`, `frontend/src/components/lobby/LobbyFriendsButton.tsx`
- Modify: `frontend/src/App.tsx` (lines ~2876–2897: hide the floating `FriendsIcon` and `MessageIcon` while the lobby is showing; pass their props to `GameLobby`), `GameLobby.tsx` (new props, filled into `LobbyTopBar`'s `friends` slot), `Lobby.css`

**Interfaces:**
- Consumes: `LobbyTopBar` `friends` slot (Task 2).
- Produces:
  - `useFriendsOnline(): boolean` — true when at least one id in the server's `friendIds` is in `onlinePlayers`. Asks with `socketService.getOnlinePlayers()` on mount and every 30 s while the tab is visible; listens to `online-players-response` (respect `rateLimited` by retrying once after 1100 ms, as `FriendsOverlay.tsx:72-76` does) and `player-online-status-changed`; removes its listeners on unmount.
  - `GameLobby` new props: `friends: { onToggle(): void; isOpen: boolean; notificationCount: number; messages: { show: boolean; onClick(): void; count: number } }`.
  - `LobbyFriendsButton` renders "Friends" (icon from the mockup; label hidden on phones) with the existing notification count badge and a `.lobby-friends-online` dot when `useFriendsOnline()` is true, plus a Messages icon button beside it when `messages.show`.

- [ ] **Step 1: Implement** `useFriendsOnline` and `LobbyFriendsButton`; render it in the bar; in `App.tsx` keep the floating icons on every other screen and keep `FriendsOverlay` and the chat windows where they are (they still open from the new button).
- [ ] **Step 2: Verify** with two accounts in two browser contexts that are friends: the dot appears within 30 s of the friend logging in and goes when they log out; a friend request shows the count badge; the overlay opens and closes from the bar; a message from the friend shows the Messages button in the bar; in a battle the floating icons are back. Screenshots of the bar at 640x360 and 844x390: all bar buttons at least 40px tall and nothing under the notch inset. `npm test`, `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 3: Commit** `feat(frontend): Friends and Messages move into the lobby top bar with an online dot`.

### Task 4: Lobby motion [Fable]

**Files:**
- Modify: `frontend/src/styles/Lobby.css` (motion section), `FeaturedHero.tsx`, `ModeCards.tsx`, `PlayerPanel.tsx`, `LobbyTopBar.tsx`, `LobbyFriendsButton.tsx` (only to add decorative elements such as ember spans), `frontend/src/styles/tokens.css` (any new colour)

**Interfaces:**
- Consumes: the class names and structure from Tasks 2 and 3. Do not change props or behaviour.
- Produces: `.lobby--still` on the lobby root when `getAnimSpeed() === 'off'` (set in `GameLobby.tsx`); all motion in this task is off under `.lobby--still` and under `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Featured stage** (timings from the mockup): candle-flicker vignette over the whole lobby (7 s), pedestal glow ring, 12 drifting embers (random left 20–80%, size 2–5 px, 6–13 s, negative delays so they are mid-flight on load), the card floats 9 px over 5.5 s, and each `swapKey` change flips the new hero in on the vertical axis (`rotateY(-95deg) scale(.92)` → none, 0.7 s). Glint and tilt come from `HeroCard` (`glint`, `tilt`); check tilt now works (Task 2 removed the `transform: none !important`).
- [ ] **Step 2: Mode cards:** hover lifts 6 px with the accent glow; Random's dice tumble on hover, Draft's swords cross on hover, Survival's flame flickers always, Gauntlet's tower rises on hover. Searching: accent border pulse (1.4 s) and a light sweep across the card (1.8 s); the Leave queue button in ember red.
- [ ] **Step 3: Panel and bar:** XP bar glint every 4 s; quest card nudges right on hover; Shop/Binder tiles lift and their icons tilt on hover; Friends online dot pings (2 s). Quest completed: the card turns green (`--verdigris`) and its bar fills over 0.8 s; the coin count already ticks up through `useQuestReveal`.
- [ ] **Step 4: Stills:** under reduced motion and `.lobby--still` everything above is off; the featured hero still changes every 6 s but with a plain cross-fade.
- [ ] **Step 5: Verify:** record short screenshots/video at 1440x900 and 844x390 of hover on each mode card, searching, a featured flip and quest completed; one reduced-motion pass shows no movement. Check the frame rate stays smooth on a 4x CPU slowdown in Chrome DevTools at 844x390 (no long frames from embers or blur). `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 6: Commit** `feat(frontend): lobby motion (embers, float, flips, moving mode icons, searching pulse)`.

### Task 5: Arrival and Match found [Fable]

**Files:**
- Create: `frontend/src/components/lobby/MatchFoundOverlay.tsx`, `frontend/src/styles/MatchFound.css`
- Modify: `frontend/src/App.tsx` (`handleLogin` and the restored-session start call `markLobbyArrival()`; the `game-start` handler at ~line 500 shows the overlay), `GameLobby.tsx` (arrival class), `Lobby.css` (arrival keyframes)

**Interfaces:**
- Consumes: `markLobbyArrival`, `consumeLobbyArrival`, `matchFoundPlayers`, `heroImageUrl` (Task 1).
- Produces: `MatchFoundOverlay` props `{ me: { name: string; icon: string | null }; them: { name: string; icon: string | null }; onDone(): void }`.

- [ ] **Step 1: Arrival.** `GameLobby` reads `consumeLobbyArrival()` once on mount (in a `useState` initialiser) and adds `.lobby--arrive` to its root. Sequence from the mockup, about 1.3 s: bar drops in (0.5 s), panel slides in (0.15 s delay), featured card flips in (0.35 s), pedestal fades in, mode cards dealt one after another (0.5/0.6/0.7/0.8 s delays). Coming back from a match does not replay it (nothing calls `mark` then).
- [ ] **Step 2: Match found overlay**, full screen above the game screen and below the rotate screen: "Match found" caption drops in, both portraits (from `heroImageUrl(config.IMAGE_BASE_URL, icon)`; a brass frame with the player's initial when `icon` is null) slide in from the sides, "VS" slams in with a flash (on sideways phones: portraits about 96px and the caption near the top so it never overlaps them, as in `lobby-step2.html`); whole overlay fades out and calls `onDone` by **2000 ms** after it appeared. Any tap calls `onDone` at once. Under reduced motion: no slides, slam or flash — fade in, hold, fade out, still within 2000 ms.
- [ ] **Step 3: Wire it in `App.tsx`:** on `game-start`, if the player was in the Random or Draft queue (read `pendingSearchRef.current` at the top of the handler, before it is cleared; the handler is registered once, so read the player id through a ref, not from `state`) compute `matchFoundPlayers(data.gameState?.players ?? data.players, <player id>)` and, if not null, show the overlay. The game screen renders underneath as it does today — the overlay only covers it; never delay the state update. Survival and Gauntlet do not show it (Survival has its own battle transition; my call, owner can overrule).
- [ ] **Step 4: Arrival under stills:** `.lobby--arrive` does nothing under reduced motion or `.lobby--still`.
- [ ] **Step 5: Verify arrival:** log in at 844x390 and 1440x900 — sequence plays once; finish a random match and return — it does not replay; reload the tab (restored session) — it plays.
- [ ] **Step 6: Verify match found** with two accounts in two browser contexts: Random and Draft both show the overlay for both players with the right names and portraits, it is gone within 2 s (measure with `performance.now()` in the page), tapping skips it, the draft clock underneath reads 28–30 s when the overlay ends; with the Shop open when the match lands, the overlay still appears and the shop closes as today. Reduced-motion pass. `npm test`, `npm run build`, `npm run check:tokens` pass.
- [ ] **Step 7: Commit** `feat(frontend): lobby arrival sequence and Match found overlay`.

### Task 6: Step 2 sign-off

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm test`, `npm run build`, `npm run check:tokens`, `npm run lint` (note pre-existing lint failures; do not fix unrelated code).
- [ ] **Step 2:** Fresh account (register a new test user on the local backend): tutorial end to end at 844x390 — lobby steps point at the right places; the lobby shows Random and Gauntlet only; record "0 wins · 0 losses".
- [ ] **Step 3:** Failure pass: block `/api/heroes` and `/api/player-stats/*` in Playwright (`page.route`) — lobby works, no featured card, no record line, no console errors other than the failed requests.
- [ ] **Step 4:** Emulate a notched iPhone sideways (47px inset on one side): bar buttons, panel and mode cards clear of the notch.
- [ ] **Step 5:** Put the screenshot set in front of the owner (640x360, 844x390, 1440x900: idle, searching, match found, arrival frames, quest completed, reduced motion, a short screen recording of the motion) and wait for his OK.
- [ ] **Step 6 (after the OK):** `npm run deploy:site` from the project root (site only). Spot-check `https://heroscall.pages.dev` at 844x390: login, lobby arrival, no console errors.
