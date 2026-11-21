# Redesign step 3: the draft table

Date: 2026-11-20. Part of the card, lobby and packs redesign
(`2026-11-17-card-lobby-packs-redesign-design.md`, section 9 and step 3). Mockup the owner approved:
`2026-11-17-redesign-mockups/draft-step3.html` (open it in a browser; it plays).

## Why

The draft screen is the first thing a player sees after the new lobby, and it still looks like the old game. Players
can't tell which round they are in, the ban shows only as a line of text, and on a sideways phone the hand runs off the
bottom of the screen. The owner chose a full redesign with animation (option C) over a layout fix.

**Owner rules that came out of the mockup review:**

- **Card text must be readable on every screen size.** No layout may shrink the cards so far that the rules text can't be
  read. If the cards can't fit at a readable size, the layout changes (big-card layout below), not the text.
- **Holographic cards show as holographic** whenever the card came from a player who owns it as holographic.
- **The reveal turns into the battle board.** Teams face off centred, top and bottom, then glide to where they sit in
  battle.

## Goals

1. A draft screen that shows, at all times: the round (Ban, Pick 1, Pick 2, Pick 3, Order), the clock, both teams, both
   bans, and the current hand.
2. Rules text readable at every screen size the game supports (sideways phones up to large monitors).
3. Motion that makes the draft feel like dealing and passing cards: deal, ban stamp, pick flying into the team, hands
   swapping, and a reveal that becomes the battle board.
4. Attack order set by tapping, the same with a mouse or a finger.
5. Holographic cards drawn holographic everywhere on this screen.

## Non-goals

- No change to draft rules, the 30-second clock, hand sizes, the swap order, or what the server sends, except as noted
  under "Server" (nothing is planned there).
- No holographic ownership, storage or server marking. That is step 4. This step only draws what it is given.
- No change to random, survival or gauntlet modes, which don't use the draft screen.
- No change to the "Starting Roll!" box itself or to the battle board during `battle`. One layout change to the
  `initiative` screen (see "Roll screen gets the battle layout") so the cards never move after the reveal.

## Anti-goals (a failure even if it works)

- Any card on this screen whose rules text can't be read and that offers no way to read it.
- The floating Friends button or any other overlay covering a draft control (this happened at 640x360 with "Abandon
  draft").
- A reveal whose cards jump or snap when the battle board appears. The glide must end exactly on the battle cards.
- An animation that delays the player's ability to act once the server allows it, or that delays the server.

## How the draft works today (unchanged)

Each player gets a hand of 5. **Ban:** each player bans one card from their own hand (5 to 4), then hands swap.
**Pick 1-3:** each player picks one card from the hand they hold; when both have picked, hands swap (4, 3, then 2 cards).
**Order (`phase === 'setup'`):** each player orders their 3 heroes and presses Ready; when both are ready the game moves
to `initiative`, which `BattlePhase` shows as the Starting Roll box over the battle board. The server runs a 30 s clock
per ban/pick round (`draftTimer`) and picks for a player who runs out of time. Socket calls stay as they are:
`banCard`, `pickCard`, `setAttackOrder`, `abandonDraft`.

Files today: `frontend/src/components/DraftPhase.tsx` (the screen), `DraftClock.tsx`, the draft and setup parts of the
`game-sidebar` in `App.tsx` (names, opponent-away notice, banned-cards list, Abandon draft), styles in
`GameScreens.css` and `GameTheme.css`.

## The design

### Layout A: the table (five cards across)

Used when five hand cards across can each be **at least 222 px wide** (rules text about 12 px). On a 1280x720 screen the
cards are 232 px; today they are 195 px.

```
[ Draft   ✕Ban — 1 Pick 1 — 2 Pick 2 — 3 Pick 3 — 4 Order        (clock)  Leave ]
[ You 1/3  [card][card][ 3 ]         VS          [ 3 ][ 2 ][card]  1/3 Opponent ]
[                      (your ban) (their ban)                                    ]
[                  Pick one for your team.                                       ]
[        [ card ]  [ card ]  [ card ]  [ card ]  [ card ]                        ]
[                         [ Pick Monk ]                                          ]
```

- **Top bar:** "Draft", the five steps (done steps ticked, the current one glowing; the Ban step is red), the clock, and a
  Leave button (Abandon draft: same socket call and the same "Return to lobby without rewards" title).
- **Band:** your team on the left (slots 1-3), the opponent's on the right, mirrored. Filled slots show small cards
  (tiny mode, read on demand). Under VS: your ban and their ban as round greyed portraits with a red slash and the name.
  Under each team, a status: "Choosing…" while that player hasn't acted this round, "Done ✓" once they have.
- **Hint line:** "Ban one. Your opponent gets this hand next." / "Pick one for your team." / "Set your order. Tap a hero,
  then tap where it goes."
- **Hand:** the cards fill the space they have, on every layout (owner rule). They are sized for the cards actually in
  the hand (5, 4, 3 or 2; 3 in the order step), in one row or two, whichever makes them bigger. Two rows split evenly
  (3 + 2, not 4 + 1). Sizes change when a new hand arrives, not mid-round.
- **Button:** "Ban" / "Pick" (disabled until a card is chosen), then "Ban Wizard" / "Pick Monk" once one is chosen.
  The ban button is red.

### Layout B: the big card (when five across would be too small)

Used whenever layout A's cards would be under 222 px wide. In practice: sideways phones and small laptop windows
(1024x640 and similar).

```
[            ][ ✕Ban — 1 — 2 — 3 — 4            (clock)  Leave ]
[            ][ (o)(o)( )       VS (ban)(ban)      ( )( )(o)    ]
[  BIG CARD  ][          Ban one. Tap a card to read it.         ]
[  full      ][   [sm] [sm] [sm] [sm] [sm]                       ]
[  height    ][              [ Ban Barbarian ]                   ]
```

- **Left:** one big card, full height, with all its text. Measured in the mockup: 256 px wide at 844x390 (13.8 px rules
  text), 235 px at 640x360 (12.7 px), 409 px at 1024x640.
- **Right:** the top bar, the band with teams as round portraits (rainbow rim if holographic; red rim for the
  opponent), the hint, the hand as small cards, and the button. The small cards follow the same fill-the-space rule as
  the hand in layout A (measured in the mockup at 1024x640: 150 px in two rows with 5 cards, 281 px with 2).
- **Tapping a small card shows it big and chooses it.** The button acts on the card shown big ("Ban Barbarian"). When a
  round starts, the first card is shown and chosen, so the player always sees a full card.
- **Tapping a team portrait or a ban shows that card big** (to read the opponent's picks). It doesn't change the chosen
  card; the button still names the chosen card.
- **Order step:** the three heroes as small cards with their numbers; the big card shows the last one tapped.
- **After acting**, until the next round: the big card area says "Waiting for your opponent…".
- Step labels hide on the smallest screens (numbers only); the "Draft" title hides at 640 wide.

### 12px floor on cards read on this screen (owner chose, 2026-11-20)

Measured in Task 3: `HeroCard` shrinks rules text (down to 0.8em) so the text panel covers at most 62% of the card.
At 235 px (640x360 big card) Monk came out 11.5 px, Engineer 11.75 px, Blood Hunter 10.1 px; at 228 px five across,
Arcane Archer 11.2 px. Rule: on the draft screen's readable cards (the big card, and hand cards in layout A) rules
text never goes below **12 px**. When a hero's text doesn't fit at 12 px, the text panel grows higher up the card
(less art shows) instead of the text shrinking. `HeroCard` gets an opt-in for this; every other screen (battle,
binder, shop) keeps today's fitting.

### Reading any card

Everywhere on this screen, holding a card (touch) or right-clicking it (mouse) opens the existing large card reader,
as in battle. Tap still chooses. This covers the small team cards in layout A.

### Order step (replaces drag and drop)

The three heroes appear in the hand area, numbered 1-3, with "Attacks first" under number 1. **Tap one, then tap another
to swap them** (the two cards trade places with a short hop). Tap the same card again to cancel. The team strip in the
band follows the new order. **Ready** sends `setAttackOrder` and locks the order; "Done ✓" shows under your team and the
opponent's status shows "Done ✓" when they are ready (today's "Opponent is ready" indicator).

### Motion

All timings are from the mockup; the builder may tune them within the same feel.

| Moment | What happens |
|---|---|
| Round start (ban) | The hand is dealt in from the left, one card after another (about 70 ms apart). |
| Ban | A "Banned" stamp slams onto the card, it greys out, then it flies to your ban spot, which pops. |
| Opponent bans | Nothing shows except their status changing to "Done ✓". **Their ban stays hidden until both players have banned** (owner rule); then both ban portraits are filled, theirs with a pop. Until then their ban spot is an empty circle. |
| Pick | The card flies into your next team slot (an arc, about 0.6 s); the slot pulses gold. |
| Opponent picks | Their slot flips in (a card turning over). |
| Hands swap | Your remaining cards slide off toward the opponent's side, then the new hand slides in from that side. **No "Hands swap" text** (owner rule). The new cards can be tapped as soon as they start sliding in, so the animation never uses up clock time. |
| Order step start | Your three heroes are dealt in. |
| Clock | Turns red and ticks in the last 10 s. Hidden in the order step (it has no clock). |

**Reveal (when both players are ready):**

1. The draft screen fades under a dark overlay.
2. The opponent's three cards drop in from the top and yours rise from the bottom, **both rows centred on the
   whole screen**, in the same sizes and vertical positions they have on the battle board.
3. "VS" slams in on a glowing line between the rows, with a white flash (about 0.85 s in).
4. About 2.2 s in, both rows **glide sideways to their exact battle positions** (about 0.75 s), while the battle board
   builds around them: the rows take their battle colours, the name plates and portraits fade in, the battle log panel
   slides in from the left and the actions panel from the right. VS and the line fade out.
5. The existing Starting Roll box appears. From here it is the normal `initiative` phase.

A tap anywhere skips the reveal straight to step 5 (cards in place, board built). The server has no timer on the roll
or the go-first choice, so the reveal costs no game time.

### Roll screen gets the battle layout (owner chose this)

Today the `initiative` screen has an empty left column at `clamp(200px, 18vw, 300px)`. The battle log
(`.battle-combined-info` in `App.tsx`'s sidebar) only renders in `battle`, and `.game-sidebar:has(.battle-combined-info)`
(`BattleLog.css`) widens the column to `clamp(220px, 20vw, 320px)`. So when battle starts, the board reflows and all six
cards shift. Phones have their own widths in `BattlePhone.css`.

Change: during `initiative` the sidebar renders the battle log panel too (empty: "Battle actions will appear here")
at the battle width, on every screen size including phones, so the board has its battle geometry from the first frame
of `initiative`. The reveal lands on that geometry, and **the cards don't move again when battle starts.** Check:
the six card rectangles measured during `initiative` equal those in the first frame of `battle`, at 1440x900,
1280x720, 1024x640, 844x390 and 640x360.

The cards must land exactly on the battle board's cards (anti-goal above). How to achieve this is left to the builder;
one way is to render `BattlePhase` underneath, measure its six cards, and animate copies from the centred positions to
those rectangles before showing the real board.

**Reduced motion and "Battle animations: off":** no dealing, flying, stamping, sliding or gliding. Cards appear in
place, the reveal is a short fade straight to the board with the Starting Roll box. Holographic foil stays still, as on
the card today (`cardMotionOff`).

**Only live transitions animate.** Rejoining a draft or battle after a refresh or reconnect shows the current state
with no dealing and no reveal.

### Holographic cards

A card is holographic when the hero object the server sends for it has `holo: true` (step 4 adds this; until then no
card has it and nothing shows). Wherever this screen draws a hero it passes that flag through:

- hand cards, the big card, the large reader, team slots (small cards and round portraits), ban portraits, flying
  copies, and the reveal cards;
- round portraits and ban portraits show it as a slowly turning rainbow rim; cards use the existing `holo` prop of
  `HeroCard` (rainbow sheen, sparkle, bright rim);
- a card keeps its flag through swaps, because the server keeps it on the hero object;
- the opponent's holographic cards show too;
- if step 4's "Show holographic effects" setting exists and is off, none of this shows (rainbow rims become the plain
  rims).

### What moves out of the sidebar

During `draft` and `setup` the new screen takes the full game area. The draft and setup parts of the `game-sidebar`
move onto it:

- Player names: "You" and "Opponent" labels become the real names in layout A (your name left, theirs right). In layout
  B names are hidden for space; the rims tell the sides apart.
- Opponent away (`DisconnectNotice` with countdown): shown as a banner across the hand area on both layouts.
- "Connecting…": shown in the top bar.
- Banned cards list: replaced by the ban portraits.
- Abandon draft: the Leave button.

The floating Friends button is hidden during the draft and the reveal.

## Server

No server change is planned. If the builder finds the client can't tell a live setup-to-initiative change from a
reconnect into `initiative`, solve it on the client (for example, only play the reveal when this tab saw `setup` and
then `initiative`).

## Approaches considered

- **A. Rearrange only** (the original step 3 scope): side columns for teams, bottom bar. Fastest, but it still looks
  like the old screen right after the new lobby.
- **B. Rebuild as a draft table:** same layout with the steps strip, ban portraits and tap ordering, no animation.
- **C. Full redesign with animation (chosen by the owner):** B plus dealing, flying, swapping and the reveal into the
  battle board.

Within C, the readable-text rule ruled out keeping all five cards on screen at a small size on phones (they would be
about 135 px wide, 7 px text). Scrolling a row of full-size cards was the other option; the big-card layout was chosen
because it keeps all five visible and one fully readable, and keeps "tap a card, press the button".

## Decided by the owner

- Option C.
- The light, see-through card tint from step 1 (not the old dark panel).
- Holographic shown on the draft screen for cards whose owner has them holographic.
- Card text readable on every screen; the big-card layout where five across won't fit.
- Reveal: centred face-off top and bottom, then glide into the battle board.
- The roll screen gets the battle layout so the cards never move after the reveal (option b).
- No "Hands swap" text.
- The opponent's ban stays hidden until both bans are in.

## My calls (owner can overrule)

- The 222 px threshold for switching layouts (about 12 px rules text, the floor used in step 1).
- The first card is shown and chosen at the start of each round in layout B.
- The opponent's ban is hidden on the client until both have banned. The server already sends it earlier; withholding
  it on the server would mean a server deploy for little gain in a kids' game, so the client hides it.
- New hand cards are tappable mid-slide; the reveal can be skipped with a tap.
- The Friends button hides during the draft.
- Leave asks no extra confirmation, as today.

## Left to the builder

- Component and file structure (`DraftPhase` can be rewritten; keep its props and socket calls).
- How the reveal measures and lands on the battle board (exact landing is required).
- Exact animation timings and easing within the mockup's feel.
- How the layout switch is measured (container size, not device type).
- Tests for: layout switch at the threshold, tap-to-swap order, holographic flag reaching every drawn card, and the
  reveal not playing on reconnect.

## Checks before sign-off

- Screenshots at 1440x900, 1280x720, 1024x640, 844x390 and 640x360 of: ban, a pick, hands swapping, order, and the
  reveal (mid-VS and final board). The owner judges these before deploy.
- Rules text measured at least 12 px on the readable card at every size above.
- Nothing overlaps at 640x360 (Friends button, Leave, clock).
- A full draft between two accounts on the local server, including running out the clock once and a refresh mid-draft.
- Reduced motion on: no movement, the reveal goes straight to the board.
- Site deploy only, on the owner's "go live".
