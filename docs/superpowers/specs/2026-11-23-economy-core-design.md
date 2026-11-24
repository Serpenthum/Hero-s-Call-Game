# Progression revamp, project 1: economy core

Date: 2026-11-23. Brainstormed with the owner the same day. This is the first of four projects that together
revamp coins, XP and quests. The other three are listed under Non-goals and get their own designs.

In code, coins are `victory_points` ("VP"). This document says "coins" everywhere.

## Intent

Owner: "I'm starting to feel like the game has no progression because once you unlock all heroes it's the same
thing." Reaching Survival (own 21 heroes) is "a big milestone", but "after this milestone it feels like there is
nothing". He wants levels, starting coins and earned coins to mean something.

The numbers explain the feeling. There are 40 enabled heroes and every account starts with 10. A pack costs 12
coins for 3 new heroes, so the whole collection costs 120 coins. The tutorial pays 100 coins, and every level pays
12 more. A new player can pass the Survival gate minutes after the tutorial and own everything soon after. Levels
stop at 20.

This project slows the collection to a pace the owner chose, gives repeats a purpose (shards and crafting), pays
coins for every battle, and lets levels run forever.

## Goals

1. **Pace.** For an average player (wins half their battles, 6 battles a day, finishes 2 of 3 daily quests):
   - Survival (21 heroes) after about 40 battles.
   - The full collection (40 heroes) after about 300 battles.
2. **Packs hold one hero**, fully random, and a holographic replaces the card instead of being an extra card.
3. **Repeats give shards.** Any hero the player does not own can be crafted from shards, in the binder, with an
   animation. Holographics can never be crafted.
4. **Every battle pays coins**, including a loss.
5. **Levels never stop.**
6. **Existing accounts keep** their heroes, holographics, coins and levels.

## Non-goals

These are agreed for later projects and must not be built here:

- Project 2: rotating daily quests, weekly quest, achievements book. (First-win-of-the-day and win-streak
  bonuses move here too; the owner liked them, and they fit with quests.)
- Project 3: the level reward road, and titles shown on the VS screen.
- Project 4: ranked ladder with seasons, a leaderboard for everyone who plays, Survival entry fee with a bigger
  prize.
- Later: card backs to buy (owner will draw them), hero mastery.

## Anti-goals

- **No battle power from progression.** No reward may change a hero's stats or a battle's rules.
- **No hero is rarer than another.** Every enabled hero has the same chance in a pack and the same crafting
  price. Rarity only ever means the finish (normal or holographic).
- Nothing is taken from an existing account.
- The Survival gate stays "own 21 heroes" (`SURVIVAL_UNLOCK_HEROES`). It does not look at level.

## The rules

### Numbers

| Item | Today | New |
|---|---|---|
| Pack | 12 coins, 3 heroes, unowned first | 20 coins, 1 hero, fully random |
| Holographic | 1 in 5, as an extra card | 1 in 10, replaces the card |
| Repeat hero | 2 coins back | 10 shards |
| Craft a hero | (buy a sale hero for 5 coins) | 100 shards |
| Tutorial payout | 100 coins in total | 80 coins in total (4 packs) |
| Level up | 12 coins | 20 coins |
| Daily quest | 3 coins, 15 XP | 5 coins, 15 XP |
| Random win, coins | 1 per hero alive (1 to 3) | 2 + 1 per hero alive (3 to 5) |
| Draft win, coins | 2 + 1 per hero alive (3 to 5) | 3 + 1 per hero alive (4 to 6) |
| Random win by surrender, coins | 2, or 1 if the winner has two or more heroes down | 3 |
| Draft win by surrender, coins | 2 + 1 per hero alive | 4 |
| Loss, coins | 0 | 2 |
| Tie, coins | 1 each | 2 each |
| XP, win / loss | Draft 10 / 3, Random 5 / 1 | 10 / 5 in both |
| Survival run prize, 1 to 7 wins | 1, 2, 4, 6, 9, 12, 16 | 2, 4, 7, 10, 15, 20, 27 |
| XP for the next level | level × 25, stops at 20 | level × 25 up to level 20, then 500 for every level, no cap |

Unchanged: Survival run XP, tie XP (10), friend-room battles (XP only, no coins), quest XP, the Gauntlet.

### Packs

- One card. The hero is picked with equal chance from all enabled heroes, owned or not.
- Then one roll, 1 in 10, decides whether the card is holographic.
- Outcomes:

| Card | Player has | Result |
|---|---|---|
| Normal | not the hero | gains the hero |
| Normal | the hero | repeat: 10 shards |
| Holographic | not the hero | gains the hero and its holographic |
| Holographic | the hero, not its holographic | gains the holographic, no shards |
| Holographic | the holographic already | repeat: 10 shards |

- The random calls stay in a fixed order (hero, then holographic roll) so a given sequence always gives the same
  pack, as `packs.js` does today.
- The pack-opening screen shows one card. A repeat shows the shards gained in place of today's coins back.

### Shards and crafting

- Each account has a shard balance, starting at 0. Existing accounts start at 0.
- Crafting costs 100 shards and gives the normal finish of one hero the player chooses. The hero must be enabled
  and not owned. A holographic can never be crafted.
- Crafting lives in the binder (owner's choice). Today a locked pocket only shows a padlock, and the large view's
  only button is the favourite toggle, so the Craft button is new. Starting point for the mockup (my call):
  opening a locked card's large view shows a "Craft" button with the price. It is disabled, with the shortfall
  visible, when the player has too few shards. The shard balance shows at the top of the binder.
- Crafting plays an animation on the card, and the card ends up owned in its pocket.
- The server decides everything: it checks the balance, the hero and ownership, spends through a guarded
  statement and runs one request per account at a time, the way pack buying does today.
- Once a player owns all 40 heroes, shards keep adding up with nothing to spend them on. That is accepted for
  now; more heroes and later projects will give them a use.

### The shop

- The rotating sale heroes go: the six heroes, their price tags, the "Next sale in" dial, the pager, and the
  server's rotation and buy-a-hero routes.
- The shop sells packs. "See what's inside" stays.
- The 2026-11-21 shop design gave the sale heroes the whole felt table, so the shop needs a new layout. See
  "Mockups first".

### Coins for battles

- A loss pays 2 coins, in Random and Draft.
- A win pays the amounts in the table. "Hero alive" means the winner's heroes still standing at the end, as today.
- A win by surrender pays the lowest win amount for the mode (Random 3, Draft 4).
- **A player who surrenders before losing a hero gets nothing for that battle: no coins and no XP.** Otherwise a
  player could queue, surrender at once and collect 2 coins and 5 XP each time. A player who disconnects and
  loses is treated the same way. (My call.)
- The winner of such a battle is still paid the surrender amount and win XP, because in a matched game they did
  nothing wrong. Two accounts trading wins can still farm slowly, as they can today; that is accepted here and
  left for the ranked project. (My call.)
- The end-of-battle screen shows the coins gained, for the loser too.

### Levels

- XP for the next level is `min(level, 20) × 25`. Level 20 no longer ends the track. The cap lives in several
  places and all of them go: `updatePlayerXP` and `checkAndLevelUpPlayer` (loop limit and XP clamp in each),
  `getXPRequiredForLevel` (returns 0 from level 20), `calculateLevel`, and on the site `XPBar.tsx` and
  `useQuestReveal.ts`.
- Every level up pays 20 coins, at every level. Today's 12 is hard-coded in both server functions.
- An existing level 20 account keeps its level and whatever XP it has, and simply starts gaining again.

### Tutorial

- The tutorial still lifts the account to level 2. Its total payout becomes 80 coins, level-up coins included
  (today's top-up logic, with the new total).

### Existing accounts

- Nothing is reset or converted. Coins keep their face value and buy packs at the new price.
- The only data change is the new shard balance.

## Approaches considered

**How packs choose a hero.**
- Fully random over all heroes (chosen by the owner). Repeats start early and grow, so shards matter from the
  middle of the collection, and crafting closes the gaps luck leaves.
- New heroes first, as today. The collection has a fixed length, but shards only matter to finished players.
- Weighted toward new heroes. Softer late grind, harder to explain.

**Where crafting lives.**
- In the binder (chosen by the owner). The binder already shows locked cards with a "Not owned" button, so the
  player crafts where they see what is missing.
- A panel in the shop. Keeps spending in one place, but repeats the binder's hero list and crowds the shop.
- Its own Forge screen. Most room for animation, but one more screen and one more lobby button.

**The numbers** came from simulating 3,000 players per setting, starting from the tutorial's exact end state
(level 2, 80 coins) and playing Random. The chosen set gave Survival at about 41 battles (most players between 30
and 54) and the full collection at about 300 (240 to 355). A tutorial payout of 40 coins gave Survival at about 48,
which is why it was raised to 80.

**Quests the pace relies on.** The simulation assumes a player can finish 2 daily quests from the first day.
Today's three quests are placeholders (owner, 2026-11-23) and a new player can finish only one of them: one needs
Survival and one needs Ninja. Project 2 replaces them with achievable ones. Until it ships, a new player reaches
Survival nearer 50 battles; that is accepted.

## Mockups first

The owner sees mockups before anything visual is built, and drawings and animation are done on Fable. Before the
site work, show and get approval for:

1. The shop without sale heroes.
2. The one-card pack opening, including the repeat (shards) and the three holographic outcomes.
3. The binder with the shard balance and the Craft button, in its can-afford and cannot-afford states.
4. The crafting animation.

All of them must work at 844×390 and 640×360 (sideways phones) and on a computer, in the house style from
`tokens.css`, and respect the animations-off setting.

## Constraints

- The server is a Cloudflare Worker with a Durable Object database, plus a local SQLite path. Both build the
  same `Database` class, so the new shard column is added once in `database.js`, the way `holo_heroes` was.
- Server and site go live together, only on the owner's "go live", and the server only when nobody is playing.
- Every route needs a login token and acts only on the token's own account.
- All coin and shard spending goes through guarded statements so simultaneous requests cannot overspend.

## Verification

- Unit tests for the pack rule (all five outcomes, fixed random order), crafting (every refusal), battle coins
  (each mode, surrender, tie, friend room), endless levels and the tutorial total.
- A simulation test, kept in the repo, that plays many accounts through the real rule functions, assuming 2
  achievable daily quests, and checks the average lands inside 35 to 50 battles for Survival and 250 to 350 for
  the full collection. If the real rules
  miss, raise it with the owner before changing any number in this document.
- An existing account with every hero, a coin pile and level 20 loads unchanged and can buy a pack and gain XP.

## Left to the builder

- Names of routes, fields and components, and how the shard balance travels with the account data.
- How the simulation test is written.
- Layout and motion details inside whatever the approved mockups show.
- Wording of buttons and messages, in plain words and the existing voice.
