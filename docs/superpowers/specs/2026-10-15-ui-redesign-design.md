# Hero's Call UI redesign: "the table"

Status: awaiting user review. Date: 2026-10-15.

## Intent
Redesign the whole game UI (everything except the card build) around one identity: a dark fantasy tabletop.
Cards (`HeroCard.tsx` / `HeroCard.css`) keep their structure and look and stay the brightest objects on screen.
No game-rule, socket-protocol or backend change is part of the redesign itself (Gauntlet fixes below are the exception).
Dragonflow was removed beforehand (commit 84df0e3, archived in `Businesses/Dragonflow Archive`).

## Constraints and assumptions
- Stated: keep cards as built; Gauntlet is PvP by bracket, HP persists across trials, `buy_pack` stays as a fifth shop action, Gauntlet is un-hidden in the lobby.
- Assumed (change in review): fonts are IM Fell English + Alegreya Sans, self-hosted via `@fontsource`; Gauntlet stays untimed.
- Push straight to main after each phase (project convention).

## Design system (`frontend/src/styles/tokens.css`, loaded first)
Colour: felt `#101b18` (page), walnut `#241a14` (panels), leather `#33261d` (raised/inputs), brass `#b08a45` (borders, primary action, focus ring; duller than card gold `#ffd700`), bone `#e6dfcf` (text), ember `#c4482f` (danger/enemy/HP loss), verdigris `#5fa08a` (success/ally/heal).
Type: IM Fell English for titles and large numerals; Alegreya Sans for all UI text. Sentence case. No all-caps eyebrow labels. Emoji icons replaced by one inline-SVG icon set. Body line length under 80 characters.
Shape: 4px radius controls, 8px panels, 1px brass hairline plus inner shadow (inset-leather look). No stock Bootstrap colours (`#007bff`, `#28a745`, `#dc3545`).
Motion: only in response to actions, one orchestrated moment per screen, `prefers-reduced-motion` respected.
Quality floor: responsive down to phone width, visible keyboard focus, sufficient contrast.
Primitives (shared classes/components): panel, button (primary/secondary/danger), tab, modal shell, input, badge, close button, resource pill (VP, XP), HP bar.
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
2. Lobby, un-hide Gauntlet entry.
3. Draft and battle.
4. Shop, Collection, Binder, Profile, Friends, modals.
5. Survival and Gauntlet (UI plus backend fixes above).

## Risks
- Per-screen CSS is about 25k lines with hardcoded colours; each phase must replace colours with tokens and delete dead rules, not stack overrides.
- Battle and phone layouts are the most layout-sensitive; verify with screenshots, not just builds.
- Hero-card CSS selectors must not be changed; phases touch only wrappers around cards.
- Existing tsc errors are unrelated (build uses `--noCheck`); do not use tsc as the verification gate.

## Success criteria
Every screen uses tokens only; no leftover Bootstrap-blue UI; cards render pixel-identical to today; backend tests stay green and cover the Gauntlet fixes; each screen checked at desktop and phone width.
