# Hero's Call UI redesign: "the table"

Status: approved by user. Date: 2026-10-15.

## Intent
Redesign the whole game UI (everything except the card build) around one identity: a dark fantasy tabletop.
Cards (`HeroCard.tsx` / `HeroCard.css`) keep their structure and look and stay the brightest objects on screen.
No game-rule, socket-protocol or backend change is part of the redesign itself (Gauntlet fixes below are the exception).
Dragonflow was removed beforehand (commit 84df0e3, archived in `Businesses/Dragonflow Archive`).

**Card acceptance rule (user):** a hero card must show its image exactly as now, show its stats, and show ALL ability and special text. If those three hold the card passes; card CSS is still left alone unless a phase needs a fix for one of them.

**Currency rule (user):** the currency has no name. Anywhere it is shown, use the coin image (`Coin.tsx`) next to a number: never the words "VP", "victory points" or "coins", in UI text or server messages. Prices and balances are `<Coin /> 340`. An unaffordable purchase says "Not enough to buy this." Database and API field names (`victory_points`) stay as they are; they are not user-facing. Server notification text no longer states amounts; reward screens show them with the coin.

## Constraints and assumptions
- Stated: keep cards as built; Gauntlet is PvP by bracket, HP persists across trials, `buy_pack` stays as a fifth shop action, Gauntlet is un-hidden in the lobby (done at the end of phase 5, once its backend fixes land).
- Assumed (change in review): fonts are IM Fell English + Alegreya Sans, self-hosted via `@fontsource`; Gauntlet stays untimed.
- Push straight to main after each phase (project convention).

## Design system (`frontend/src/styles/tokens.css`, loaded first)
Colour: felt `#101b18` (page), walnut `#241a14` (panels), leather `#33261d` (raised/inputs), brass `#b08a45` (borders, primary action, focus ring; duller than card gold `#ffd700`), bone `#e6dfcf` (text), ember `#c4482f` (danger/enemy/HP loss), verdigris `#5fa08a` (success/ally/heal).
Type: IM Fell English for titles and large numerals; Alegreya Sans for all UI text. Sentence case. No all-caps eyebrow labels. Emoji icons replaced by one inline-SVG icon set. Body line length under 80 characters.
Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow (inset-leather look). No stock Bootstrap colours (`#007bff`, `#28a745`, `#dc3545`).
Motion: only in response to actions, one orchestrated moment per screen, `prefers-reduced-motion` respected.
Quality floor: responsive down to phone width, visible keyboard focus, sufficient contrast.
Primitives (shared classes/components): panel, button (primary/secondary/danger), tab, modal shell, input, badge, close button, resource pill (coin + number, XP), HP bar.
Copy rule: action buttons say what happens ("Save changes"); the same action keeps its name through the flow; errors say what went wrong and how to fix it.

## Screens (each has one memorable element)
- Login/register: a closed rulebook with a brass-latched form on the table.
- Lobby: felt table, featured hero standing at centre; modes as placards along the table edge (Ranked, Survival, Gauntlet, Friendly) with live searching state; ledger panel (player, level, quests); shop/binder/collection tiles; friends and messages dock.
- Draft: open hand of cards over felt; pick clock as a brass dial.
- Battle: felt field, initiative bar on top, log scroll on the side, action tray at the bottom; existing phone layout behaviour kept.
- Shop, Binder, Collection, Profile, Friends, quest/requirement/settings modals: shared primitives.
- Survival: campaign ledger; team builder as a roster sheet.
- Gauntlet: trial map (13 stops, brackets A to E), 6-hero roster with HP bars, bracket queue/searching state, camp screen between battles with five choices (heal, temp-res, 2-hero offer with rerolls, buy pack, skip trial before trial 10), results scroll at run end with VP/XP.

## Gauntlet backend work (with tests, `backend/test/`)
1. Persist hero HP across trials in a run (today `resetHeroToOriginalState` resets it every match, making Heal pointless).
2. Fix roster corruption: temp-res splicing while iterating `battle_team_indices`; hero offers containing heroes already on the roster; duplicate indices in `setGauntletBattleTeam`.
3. Reconcile `buy_pack` with `performGauntletShopAction` (UI and server must accept the same action set).
4. Update `docs/GAME_ANALYSIS.md` for the above.

## Phases (each: plan, build, Playwright screenshots at desktop and phone width, push to main)
1. Tokens, fonts, icon set, primitives, app shell, login/register.
2. Lobby (Gauntlet placard built but still hidden).
3. Draft and battle.
4. Shop, Collection, Binder, Profile, Friends, modals.
5. Survival and Gauntlet (UI plus backend fixes above), then un-hide Gauntlet.

## Risks
- Per-screen CSS is about 25k lines with hardcoded colours; each phase must replace colours with tokens and delete dead rules, not stack overrides.
- Battle and phone layouts are the most layout-sensitive; verify with screenshots, not just builds.
- Hero-card CSS selectors must not be changed; phases touch only wrappers around cards.
- Existing tsc errors are unrelated (build uses `--noCheck`); do not use tsc as the verification gate.

## Success criteria
Every screen uses tokens only; no leftover Bootstrap-blue UI; cards render pixel-identical to today; backend tests stay green and cover the Gauntlet fixes; each screen checked at desktop and phone width.

Phase 1 complete (2026-10-15). Known follow-ups: every logged-in screen (lobby, shop, profile, collection, battle) still uses its old blue/cyan styling and is restyled in phases 2 to 5; the shared close button is already on tokens but sits inside old-styled modals; server-side currency wording was cleaned up in phase 1, screens apply the coin + number rule as they are restyled. Final review for phase 1 was a self-review (no fresh reviewer).

Phase 2 complete (2026-10-15). Lobby rebuilt on the felt table; GameLobby.css retired (shared rules now in legacy-base.css, QuestRewardModal.css, RulesModal.css, SettingsModal.css, to be restyled in phase 4 and dropped in phase 5). Gauntlet placard exists behind SHOW_GAUNTLET = false. Known follow-ups: Alegreya Sans numeral 1 is flagless and reads small at small sizes; the Random placard title wraps at about 1024px wide; modals (Settings, How to play, Quest reward, Profile, Shop, Binder) still use their old styling.

Phase 3 complete (2026-10-16). Draft and battle re-themed (geometry unchanged), a 30 second draft clock added (server auto-ban and auto-pick, dial for the last 10 seconds), upright phones get a rotate prompt. Known follow-ups: the spec's bottom action tray was not built (action bar stays on the right; a real portrait layout would be separate work); the setup screen has no clock; the tutorial overlay, spectator list screen, friends overlay and messages still use their old styling (phases 4 and 5); the first turn of a match shows no turn timer bar (existing server behaviour); action-bar buttons, log entries, surrender dialog, game over and initiative were checked visually and by live play, not by computed-style diff. Final review for phase 3 was a self-review (no fresh reviewer).

Phase 5 complete (2026-10-16). Survival is on the table palette (`Survival.css` over the retokenized Survival sheets). The Gauntlet UI was rebuilt (`components/gauntlet/`: trial map, roster sheet with HP bars, team strip, camp panel with the five choices, offer panel, results scroll; `Gauntlet.css`), reuses the app's own battle screen, and is shown in the lobby. Gauntlet backend fixed with tests (`backend/test/gauntlet.test.js`, 124 backend tests pass): HP persists across trials; fallen heroes keep their slot and revive in place (the old revive added a duplicate slot); offers never contain a roster hero and the server only accepts a hero it offered; looking at the hire offer no longer burns the camp action (asking again shows the same two heroes, it used to be an unlimited free reroll); teams need three distinct slots; both players are put in the game room on a match (before, nobody heard about the match); a finished run is paid, announced, deleted and its save cleared. `legacy-base.css` is gone (its overlay, reset and colour variables moved into `Panels.css`, `primitives.css` and the palette tokens). Known follow-ups: `SpectatorView` (unused) still uses emoji; a player who disconnects in the middle of a Gauntlet battle leaves the other player waiting (not handled before either); the Gauntlet is untimed as assumed.
