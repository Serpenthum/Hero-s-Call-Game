# Hero's Call redesign, step 5: the binder: design

Date: 2026-11-21. Status: written for owner approval. Branch `redesign-binder` (from main at 1a46e0d).

Parent design: `2026-11-17-card-lobby-packs-redesign-design.md`, part 6 "Binder". This document refines that part
with the owner's decisions from 2026-11-21. Where they differ, this document wins.

## Intent

The binder is where a player looks at their collection. The owner wants it to feel like opening a real card binder
(the trading-card feel of the whole redesign): a leather book that opens with a little ceremony, cards sitting in
pockets, and a page turn that feels like paper. Holographic cards and favourites should show off. Today's binder
works but looks like a plain grid with dropdowns, and its page turn looks choppy.

Success: from the lobby, the player taps Binder (or the featured hero). A closed leather binder lands and opens.
They see their heroes in pockets, owned ones in colour and unowned ones locked, then turn pages smoothly, filter,
sort and search from one brass button, tap a card to read it large and favourite it, and close. On a sideways phone,
card names and stats are readable.

## Visual source of truth

`docs/superpowers/specs/2026-11-21-redesign-step5-binder-mockup.html` (option C, version 2, approved by the owner
2026-11-21). Open it in a browser; hero art loads from the live site. It has a size toggle (740 x 360 sideways
phone, 1280 x 720 computer), and everything in it works except the X.

The opening animation (closed binder lands, cover opens) is the one in the 2026-11-17 mockup
`2026-11-17-redesign-mockups/packs-and-binder.html` ("Binder" screen), as described in the parent design.

Card faces come from the live `frontend/src/styles/HeroCard.css` (light tint, art shows through), not from the old
mockups' dark panel. The binder mockup already follows this.

## Goals

1. Replace `BinderOpening.tsx` with the new opening: a closed binder drops onto the table with a bounce and a puff of
   dust. Red-brown leather with grain, stitched border, brass frame line and corners, a brass shield crest,
   "Hero's Call" in gold Grenze Gotisch, and a brass clasp that twitches every couple of seconds. "Tap the binder to
   open it". On tap, the cover swings open, golden light spills out, and the book grows to fill the screen. **The
   cards are already in their pockets: no page riffle and no deal-in on opening** (owner, 2026-11-21; this replaces
   the riffle and deal-in in parent part 6.2 and the 2026-11-17 mockup). So the opening can be a cover over the real,
   already-filled book, or an overlay that hands off to it, whichever is the builder's choice. Opening on a hero
   lights its pocket once the cover is open. Under reduced motion it goes straight to the open book (as today).
2. The open book as in the mockup: two pages per spread, **six pockets per page (3 x 2), fixed** on every screen,
   brass rings down the middle.
3. Card states in pockets: owned cards in colour; unowned cards dark and grey with a padlock; disabled heroes grey
   with the mockup's ember stripes and crossed circle; favourites with the gold star; holographics with the live
   holo effect (and the existing "hide holo" setting respected).
4. **Controls (option C, v2):**
   - One brass **filter button at the top left** and the **X (close) at the top right**.
     - On a phone they sit in the top corners beside the book, with no row spent on them.
     - On a computer the button also carries a label of what is showing (for example "All · by name").
   - The button opens a **brass panel that drops down from it** with:
     - name search;
     - six filters: All, Owned, Favourites, Holographic, Not owned, Disabled;
     - five sorts: name, HP, Defense, Accuracy, Attack.
   - On a phone, when any filter other than All, any sort other than name, or any search is active, the button shows
     a small red dot.
   - **Side arrows** turn the page.
   - **The bottom line is status text only:** "Page 1 of 4 · 27 of 40 heroes · 5 holographic". When the filter isn't
     All, the filter name goes first ("Favourites · Page 1 of 1 · …").
5. **Page turn: the page turn is the only movement.**
   - No deal-in animation when turning pages; the cards are already in their pockets.
   - A real two-faced leaf: the front carries the page being turned with its cards; the back carries the next
     spread's facing page; the destination page already lies underneath.
   - Only the leaf's rotation and its shadows animate, about 680 ms.
   - Nothing is rebuilt while the leaf moves. Neighbouring spreads are rendered ahead, and hero art is loaded before
     it's needed.
   - Rapid taps queue (up to two extra turns) rather than breaking or being lost.
   - Under reduced motion or the "Battle animations: off" setting, the page swaps with no turn.
6. **Filter and sort changes** use a short plain fade (about 140 ms); typing in search has none.
7. **Tap a card** for the large view, with "Add to favourites" / "Remove from favourites" for signed-in players on
   **any** hero, owned or not, as today. (The mockup shows the button only on owned heroes; that would take away
   something players can do today, so today's behaviour wins. My call.) Escape or a tap outside closes it.
8. **Opening on a hero** (from the lobby's featured card) keeps working: it turns to that hero's page and lights its
   pocket briefly. If the current filter hides it, it switches to All first.
9. Remove the three fake fallback heroes shown when `/api/heroes` fails; show a plain error message with a retry
   instead.

## Owner decisions (2026-11-21)

- Option C (one filter button and panel) over A (top row of tabs) and B (bookmark ribbons). Filter button and X at
  the top, not the bottom.
- No deal-in on page turns; the page turn is the only movement, and it must not drop frames.
- No riffle or deal-in when the binder first opens either; the cards are already in place.
- **The binder opens on All** (every enabled hero, unowned ones locked), not on owned-only as today.
- **Pocket cards show name, art and stats only, on every screen size**, including computers. Rules text is read by
  tapping the card.
- The phone red-dot indicator and the filter name on the status line are accepted.

## Non-goals

- No server or API changes. Favourites already go through the authenticated toggle (fixed in step 4); ownership and
  holographics come from `/api/user/:id` as today. Site-only deploy.
- No sound (step 6).
- No change to how the lobby opens the binder, apart from the binder itself.
- No new hero art.
- No upright-phone layout (the whole app is sideways-only).

## Anti-goals

- A page turn that stutters, flashes, or shows cards popping in or re-animating.
- Any card text on a sideways phone that is harder to read than in the mockup (names about 12 px, stats about 8 px at
  740 x 360).
- Losing a control that exists today (filters, sort, search, favourites, opening on a hero).
- Copying Yu-Gi-Oh's look (parent design rule).
- Shipping without the owner seeing it in the real app first.

## Approaches (how it gets built)

1. **Restyle `HeroCollection.tsx` in place.** Least churn, but the 617-line file mixes fetching, filtering, paging,
   the turn animation and the layout. Its page size comes from `useCardGrid`, which conflicts with the fixed 3 x 2
   pockets, and the turn's DOM handling would be fought through React re-renders.
2. **Split it (chosen).**
   - Move the data, filter, sort and search logic into a hook plus pure functions (as the shop step did with
     `shop/shopRules.ts`), unit-tested.
   - Build the binder from new components: the book and its pages, the filter button and panel, the page-turn leaf,
     the status line, the opening, and the large view.
   - `HeroCollection` stays as the entry point with the same props, so `GameLobby` doesn't change.
   - Chosen because the turn needs careful control of what renders when, and the logic gets tests it lacks today.
3. **Port the mockup's plain-JavaScript book as-is.** Fastest to look identical, but it bypasses React and the shared
   `HeroCard`. Holo, favourites and tap-to-read would be duplicated. Rejected.

## Constraints

- Pocket cards use the shared `HeroCard` (with `readable="none"`, since the binder handles the tap) so the face,
  holo and states match the rest of the game. The binder needs a way to keep rules text off at every card size
  (today the face adds rules text above about 129 px wide). Add that through the card's existing props or size
  system, without changing any other screen.
- The six-per-page layout must fit 640 x 360 (the smallest sideways phone the app supports) with readable cards.
  Cards grow to fill bigger screens. At 640 x 360 the mockup's spacing gives cards about 77 px wide (names about
  10 px, stats under 7 px). **My call: at narrow phone widths, win back space so cards are at least 84 px wide**
  (names about 11 px). Use tighter gutters and pocket padding, and slimmer side arrows laid over the book's outer
  edge. Keep 3 x 2. The 640 screenshot is checked against that floor.
- The currency rule (coin image plus a number, never the words) applies wherever the coin shows.
- Keep the existing reduced-motion and "Battle animations: off" behaviour for every flourish.
- The page turn's smoothness must hold on a phone, not just a desktop browser: animate transforms and opacity
  only, and pause holo animation during the turn (the mockup does this).

## Left to the builder

- Component and file names and structure, within approach 2.
- How the leaf is implemented in React (for example, render the three pages involved as stable keyed elements and
  move them between slots, or render the leaf faces before starting the animation). The rule is that no card element
  is created or destroyed while the leaf moves.
- Exact animation timings within the mockup's feel.
- Whether the coin amount (shown in today's binder header) stays. **My call: drop it from the binder.** The mockup
  has none, the lobby already shows it, and on a phone the top corners are reserved for the button and X.
- Empty states: no heroes matching a filter or search shows a short line on the page ("No heroes match"); signed-out
  players see the binder with no Favourites filter and no favourite button (as today).
- The "Holographic" filter means owned holographic heroes. "Owned" excludes disabled heroes, as today's filter does.
  "All" is every enabled hero.
- Dev screen for the binder (as done for the shop, `/#screens/...`) for screenshots and review.
