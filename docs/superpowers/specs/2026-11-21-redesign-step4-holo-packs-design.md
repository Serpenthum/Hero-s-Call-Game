# Redesign step 4: holographics and packs

Date: 2026-11-21. Parent spec: `2026-11-17-card-lobby-packs-redesign-design.md` (parts 4 and 5, "Order of work" step 4).
That document is the source of truth for the rules and the look; this one records what step 4 builds, the decisions
made for it, and what is left out.

## Intent

Players get a reason to keep opening packs after they own most heroes: a pack can hold a bonus holographic card, and
holographic cards are shown everywhere, including to opponents. The pack opening becomes a dramatic, code-drawn reveal.
Owners of every hero can still buy packs (repeats give coins back).

## Goals (all from the parent spec, part 4 and 5)

1. Storage: `users.holo_heroes TEXT DEFAULT '[]'` via a guarded `ALTER TABLE` that works on both SQL drivers and on a
   database that already has the column. Returned with the user object (`/api/user/:id`, login, admin login).
2. Pack rule (`POST /api/shop/purchase-pack`, coin 12): 3 different base cards, unowned first, then owned repeats at
   coin 2 back each; 20% bonus holographic 4th card (not already holo, not a base card; new hero as holo or plain
   upgraded to holo; none if all are holo). One guarded update inside `runExclusive`. Response lists
   `{ name, kind }` cards (`new`, `repeat`, `holo`, `holo_upgrade`), coins spent, coins back, new balance, plus the old
   `heroesReceived` for one release. Random source injectable for tests.
3. Holo in game state, shown to both players and spectators; AI opponents never holo.
4. Favourite fix: `/api/toggle-favorite-hero` acts on `req.userId`, not the body's `userId`.
5. New pack opening (round-2 mockup in `packs-and-binder.html`), 3 or 4 cards, holo takeover, "Turn all over",
   "Buy another" with price, "Done". Replaces `PackOpeningAnimation.tsx` (also used by `ui/DevScreens.tsx`).
6. Settings switch "Show holographic effects", on by default, `localStorage` key `heroscall.holo`, in
   `SettingsModal.tsx`. Off: no rainbow, sparkle or rim on any card on this screen; the pack opening uses gold light
   and sparks but keeps the takeover, banner and label.
7. Shop text: pack tile and "See what's inside" say 3 heroes and a 1 in 5 chance of a bonus holographic.
8. BattlePhase passes `hero.holo` to its `HeroCard`s (board cards are plain today).

## Non-goals

- The four small items left from step 3 (VS overlapping names on phones, board cards covering name plates, order-step
  refresh forgetting the tapped order, random server autopick). Owner, 2026-11-21: "Leave the fixes for later."
- A shop page redesign. Owner, 2026-11-21: its own step after step 4 (site only, mockup first). Step 4 changes only
  the pack text and the pack opening over the shop.
- Binder (step 5), sound (step 6). Pack opening has no sound yet.
- Any rule, balance or draft-clock change other than the pack rule.

## Anti-goals

- A card that flickers between plain and holo, or shows holo to one player and plain to the other.
- A server deploy while anyone is playing, or without telling the owner when.
- A pack that shows the same hero twice, or charges without giving cards.

## Approaches (how holo reaches game-state heroes)

- **A. Mark each card when the game builds it (chosen by the owner).** Where `gameManager.js` turns a player's hero
  names into hero objects for a match (draft pools in `buildDraftPools` / `getOwnedHeroes`, random teams, survival
  teams, gauntlet teams), it stamps `holo: true` from that player's `holo_heroes`. The flag travels with the object
  through every emit, deep copy (`resetHeroToOriginalState` uses a JSON copy, which keeps it) and spectator view. AI
  teams are never stamped. A pack bought mid-match shows from the next match.
- **B. Add the mark at send time.** Rejected: a dozen-plus emit sites (game start, draft updates, reconnect,
  spectate); missing one makes cards flicker.

## Decisions for this step

- Holo is read once when the match's heroes are built; no live updates during a match (my call, follows from A).
- Random mode: a randomly dealt hero is holo only if the player it was dealt to owns it as holo (my call; same rule as
  "a card is holo if the player it belongs to has it as holo").
- The pack opening is drawn and animated by Fable from the round-2 mockup; plumbing (data, buttons, buy-another,
  settings, reduced motion) is Opus. Reduced motion or "Battle animations: off": simple fades, cards still turn on tap.
- "Buy another" calls the same purchase endpoint and restarts the opening with the new cards; disabled when the balance
  is under 12.
- After a purchase the shop and lobby update from the response (balance, owned, holo) without refetching `/api/heroes`.
- Holo outside a match (my call, from "shown everywhere"): every place that draws the player's own owned heroes reads
  `user.holo_heroes` on the client and passes `holo` to the card: lobby featured card, the lobby holo count (the
  `null` placeholder in `lobbyRules.ts` / `PlayerPanel`), the current collection screen, and survival and gauntlet team
  pickers. The binder's redesign stays in step 5. The shop's hero list only sells unowned heroes, so it never shows
  holo. `/api/heroes` does not change.
- Admin accounts (my call): no special branch. "Admin heroes are plain" means the migration gives nobody holo for
  heroes they already have; an admin who buys a pack can roll a holo like anyone.
- The server ignores any `holo` flag sent by the client (for example in a survival `selectedTeam`) and stamps its own.
  Stamping copies the shared hero templates first so one player's holo never leaks onto another's card.

## Testing and checks

- Backend `node --test`: pack rule (20% roll hit and miss, repeats and coins back, all owned, bonus excludes base cards
  and existing holos, all-holo case, holo upgrade, balance guard), the column migration with and without the column,
  holo flags in draft, random, survival, gauntlet and spectator state, AI never holo, the favourite fix.
- Frontend `vitest`: response handling, settings switch hides holo, pack opening handles 3 and 4 cards.
- Playwright screenshots at 640x360, 844x390, 1440x900 and once with reduced motion: pack opening (3 cards, 4 with
  holo, holo switch off), shop text, a battle board with a holo card. Owner sees them before go-live.

## Deploy

Server and site. The server deploy restarts the Durable Object and logs everyone out, so it waits for the owner's
"go live" and a time when nobody is playing. Deploy the server first (it keeps `heroesReceived`, so the old site
still works), then the site.

## Left to the builder

File structure of the new pack opening, exact timings within the mockup's feel, where in `gameManager.js` the stamping
helper lives, and the exact settings label placement.
