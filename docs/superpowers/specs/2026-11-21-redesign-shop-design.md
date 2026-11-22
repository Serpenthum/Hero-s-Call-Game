# Redesign: the shop page

Date: 2026-11-21. Parent spec: `2026-11-17-card-lobby-packs-redesign-design.md`. This is a new step added by the
owner on 2026-11-21, after step 4 (holographics and packs) and before step 5 (binder). It is site only, and the
mockup came first.

Approved mockup: `.superpowers/brainstorm/18564-1795293616/content/shop-b-v3.html` (direction B, revision 3). It is
interactive and has a built-in overflow check (`auditShop()` in the browser console). The images it uses are copied
next to it. Earlier rounds sit beside it: `shop-directions.html` (A, B, C) and `shop-b-v2.html`.

## Intent

Owner: the shop "feels a little bit janky". It should match the rest of the site, gain some animation and design,
and every window the shop opens must keep every card and its text clearly readable, with nothing overflowing.

## Goals

1. **Look.** Rebuild the shop as direction B, "Showcase split", in the lobby's house style: felt, leather, brass and
   bone from `tokens.css`, the lobby's fonts, and no new colours.
   - Left column (the showcase, leather on walnut): the "Hero shop" title, the coin balance, the Adventure Pack, a
     "Buy pack" button with its price (coin 12), a "See what's inside" button, and a footer. The footer holds the
     brass dial with "Next sale in" and the countdown, plus the sale pager (arrows and page pips).
   - Right (the felt table): the sale heroes, two cards per page at both 844x390 and 640x360, about 246px wide at
     844 and at least 222px at 640. Each card lies on a brass inlay. Each card's brass price tag (coin, 5, "Buy",
     about 40px tall) sits on the art at top right, and that tag is the Buy button.
   - A close button, placed as in the mockup.
2. **Bigger screens.** The owner wants two rows of cards on bigger screens when they fit (owner, 2026-11-21: "in a
   regular game I have room for 3 top 3 bottom with plenty of space"). The layout stays the same, with the showcase
   column on the left and the felt table on the right. The table holds as many cards as fit, up to three rows (owner, 2026-11-21: "It can be 3 rows if it fits on a big enough screen"), using the
   existing `useCardGrid` fitting. That fitting already keeps the card's 260:391 shape and a minimum card height, and
   it must keep every card at least 222px wide.
   - **Sale:** the six sale heroes fill 3 top and 3 bottom when there is room, with no paging. With less room it
     shows fewer per page and pages them. On sideways phones that is the two cards described above.
   - **"See what's inside":** the same, up to three rows of as many columns as fit, paged.
   - The showcase column, pack and dial grow modestly with the screen. Their exact sizes are left to the builder,
     following the mockup's proportions.
   - The card-turn animation runs per page, with all cards on the page together and staggered.
3. **Full screen.** The shop fills the screen with no popup margin, because 222px cards plus a top bar do not fit
   in 360px of height. On a computer it still opens over the lobby the same way, and closing it returns to the lobby.
4. **The holographic pack.** The pack stands still: no float, no bobbing, no rising motes, no pulsing glow, no
   light sweep. It carries the live card foil from `HeroCard.css` at the small-card strength (rainbow sheen,
   sparkles, pale-gold rim highlight, the `--holo-*` tokens). The foil drifts slowly across the still pack. On a
   pointer device, hovering makes the foil follow the pointer and the pack lean slightly toward it, like a holo
   card. The owner approved the lean. **No rainbow ring or border around the pack** (owner removed it in revision 3).
   When the "Show holographic effects" setting (`heroscall.holo`) is off, the pack is drawn plain.
5. **Animation.**
   - When the sale changes (the 15-minute rotation) or the player pages, the two cards turn over like a display
     case changing (rotateY out, then in, staggered).
   - The dial's lit arc and hand show the time left in this sale and tick each second.
   - The coin balance bumps when it changes.
   - A bought card gets a "Purchased" stamp.
   - All motion stops under `prefers-reduced-motion`.
6. **Prices the player can't afford.** No "not enough coins" text or state anywhere. An unaffordable price tag (or
   the "Buy pack" button) keeps its exact content but turns grey: grey leather, dim text, grey coin. It still reads
   clearly. Tapping it shows "You don't have enough coins." for 2 seconds in the shop's message strip.
7. **Messages.** The message strip slides down across the top of the sale cards. The not-enough message lasts
   2 seconds. Server errors last 3 seconds. Known texts keep today's wording ("Purchase failed. Check your
   connection and try again." and the server's "Not enough to buy this."). Any other server text, such as a raw
   error passed through by `shop.js`, is replaced on the client with "Purchase failed. Please try again." (Claude's
   call, so the strip never has to hold text of unknown length.) The strip stays on one line at 640x360. It may
   briefly cover the price tags and the top stat gem. The owner accepted that.
8. **"See what's inside" window.** Restyled to match: the same felt and leather, arrows either side of the cards,
   and a "You own N of M" meter, counting owned heroes among the pack heroes. Two cards per page at both phone
   sizes (about 246px at 844, at least 222px at 640), beside a leather column with the title, the pack, the
   subtitle, the meter and the pager, as in the approved mockup. Owned heroes get a small "Owned" chip instead of today's dim overlay, so
   they stay readable. A hero the player owns as holographic is drawn holographic. For that, pass the user's
   `holo_heroes` from `GameLobby` into `Shop`; it is already on the user object. The subtitle text is unchanged,
   including the "you own every hero" variant.
9. **Readable everywhere.** Every card the shop shows (sale, inside window) uses `HeroCard` with
   `minTextPx={READ_TEXT_MIN_PX}` (12px), as the draft table does, so ability text never shrinks below 12px.
   No text anywhere in the shop clips, overflows or overlaps at 844x390 or at 640x360. That covers names, stats,
   ability text, price tags, buttons, the timer, the meter, messages and page labels. The longest text that can
   appear in the shop is Engineer's; it must fit.
10. **Tapping a card** still opens the existing card reader (unchanged).

## Non-goals

- Server changes of any kind. Prices stay as they are (hero 5 and pack 12, both fixed in `shop.js` and
  `Shop.tsx`), the 15-minute rotation of 6 heroes stays, and there are no new pack types.
- The pack opening (`PackOpening`) is unchanged. It still plays over the shop after "Buy pack".
- The card reader is unchanged.
- Binder (step 5) and sound (step 6). The shop has no sound yet.
- The cut-off battle name tags at 640 and the four step 3 leftovers. Those are VS overlapping names, board cards
  covering name plates, the order step forgetting the tapped order after a refresh, and random server autopick.
  Owner, 2026-11-21: "Do the fixes later."

## Anti-goals

- Any text clipped, overflowing or overlapping at either phone size. That fails this step even if everything else
  works.
- A moving pack, or a rainbow ring around it.
- Reintroducing a "not enough coins" label on cards or the pack.
- Colours or a card face that don't come from the live `tokens.css` and `HeroCard.css`. Never use the old
  `card.html` dark panel.

## Constraints

- Sideways phone first (844x390 down to 640x360), then computers. A touch screen held upright shows the existing
  rotate screen.
- Keep today's purchase behaviour: the purchase lock against double taps, the balance taken from the purchase reply,
  new heroes leaving the sale after a pack, and "Buy another" in the pack opening.
- Client only, deployed with the site build. No server deploy is needed.
- Floating Friends and Messages icons: on sideways phones they stay hidden while the shop is open, as they are today
  (`Shop.css`, `body:has(.shop-overlay) :is(.friends-icon, .message-icon) { visibility: hidden; }`). Keep that rule
  working with the new shop's markup. (Claude's call: the bottom-left corner holds the dial and pager.) Where the
  icons do show, they must not cover anything.

## Approaches considered

- **A, Merchant's counter:** a leather bar on top, three sale cards dealt on the felt, and the pack on a brass stand
  with a swinging tag. At 640 it ended up much like B, with a tiny pack.
- **B, Showcase split (chosen):** pack showcase and dial on the left, two big sale cards on the right. The owner
  picked it.
- **C, Two stalls:** a side rail with Sale and Packs tabs, each getting the whole table. It gives the biggest cards
  and a big pack at 640. Claude recommended it, but the owner preferred B.

## Left to the builder

- How to split the shop into components and CSS files.
- Exact spacing, timings and easing, following the mockup.
- Tests: page sizes, greyed state and its message, the owned meter count, holo passing into the inside window, and
  the purchase lock still holding.
- Screenshots at 844x390 and 640x360 for the owner before go-live, including the inside window's last page, a
  greyed state and a message showing.

