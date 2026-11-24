// Fails when a migrated file contains a raw colour literal. Colours live in tokens.css only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Each task appends the files it migrates; later phases extend this list.
const MIGRATED = [
  'styles/primitives.css',
  'components/ui/Icon.tsx',
  'components/ui/UiKit.tsx',
  'styles/CloseButton.css',
  'styles/auth.css',
  'components/LoginPage.tsx',
  'components/RegisterPage.tsx',
  'components/HowToPlayModal.tsx',
  'styles/Lobby.css',
  'styles/XPBar.css',
  'components/GameLobby.tsx',
  'styles/GameScreens.css',
  'styles/BattlePhone.css',
  'styles/TurnTimerBar.css',
  'styles/RewardsDisplay.css',
  'styles/GameTheme.css',
  'styles/BattleLog.css',
  'styles/Shop.css',
  'styles/HeroCollection.css',
  'styles/Binder.css',
  'styles/BinderBook.css',
  'components/binder/BinderIcons.tsx',
  'components/BinderOpening.tsx',
  'styles/PackOpening.css',
  'components/packs/PackOpening.tsx',
  'components/packs/CardBack.tsx',
  'components/packs/PackSparks.tsx',
  'styles/ProfileModal.css',
  'styles/QuestRewardModal.css',
  'styles/SettingsModal.css',
  'styles/RulesModal.css',
  'styles/RequirementModal.css',
  'styles/Tutorial.css',
  'styles/Social.css',
  'styles/Panels.css', 'App.css', 'styles/HeroCard.css', 'styles/Survival.css', 'styles/Gauntlet.css', 'styles/SurvivalMode.css', 'styles/SurvivalProgress.css', 'styles/SurvivalTeamBuilder.css', 'styles/SurvivalUsedHeroes.css', 'styles/SurvivalBattleTransition.css',
  'components/DraftClock.tsx',
  'components/SidebarBattleInfo.tsx',
  'components/sidebarBattleInfo.test.tsx',
  'components/DisconnectBadge.tsx',
  'components/DisconnectBadge.test.tsx',
  'styles/DisconnectBadge.css',
  'styles/Reconnecting.css',
  'authSession.ts',
  'authSession.test.ts',
  'signOut.ts',
  'signOut.test.ts',
  'reconnect.ts',
  'reconnect.test.ts',
  'components/RotatePrompt.tsx',
  'cards/cardRules.ts',
  'cards/cardRules.test.ts',
  'cards/useLongPress.ts',
  'cards/useLongPress.test.ts',
  'cards/CardReader.tsx',
  'styles/CardReader.css',
  'styles/BattleDetails.css',
  'components/BattleDetailsPanel.tsx',
  'components/BattleDetailsPanel.test.tsx',
  'install/installHintKind.ts',
  'install/installHintKind.test.ts',
  'install/InstallHint.tsx',
  'styles/InstallHint.css',
  'hooks/useCardGrid.test.ts',
  'lobby/lobbyRules.ts',
  'lobby/lobbyRules.test.ts',
  'components/lobby/LobbyTopBar.tsx',
  'components/lobby/PlayerPanel.tsx',
  'components/lobby/FeaturedHero.tsx',
  'components/lobby/ModeCards.tsx',
  'components/lobby/ModeCards.test.tsx',
  'components/lobby/ModeIcons.tsx',
  'lobby/useFriendsOnline.ts',
  'lobby/searchCancels.ts',
  'lobby/searchCancels.test.ts',
  'socketService.test.ts',
  'components/lobby/LobbyFriendsButton.tsx',
  'components/lobby/MatchFoundOverlay.tsx',
  'components/lobby/MatchFoundOverlay.test.tsx',
  'styles/MatchFound.css',
  'app/lazyWithReload.ts',
  'app/lazyWithReload.test.ts',
  'app/tutorialResume.ts',
  'app/tutorialResume.test.ts',
  'app/AppErrorBoundary.tsx',
  'app/AppErrorBoundary.test.tsx',
  'styles/AppError.css',
  'draft/draftRules.ts',
  'draft/draftRules.test.ts',
  'draft/useDraftLayout.ts',
  'draft/flyCard.ts',
  'draft/flyCard.test.ts',
  'draft/useDraftMotion.ts',
  'draft/revealRules.ts',
  'draft/revealRules.test.ts',
  'components/draft/DraftReveal.tsx',
  'styles/DraftReveal.css',
  'components/DraftPhase.tsx',
  'components/draft/DraftTopBar.tsx',
  'components/draft/DraftBand.tsx',
  'components/draft/DraftBand.test.tsx',
  'components/draft/DraftHand.tsx',
  'components/draft/DraftHand.test.tsx',
  'components/draft/DraftBigCard.tsx',
  'components/draft/DraftPortrait.tsx',
  'components/draft/DraftOrder.tsx',
  'components/draft/DraftOrder.test.tsx',
  'styles/Draft.css',
  'components/shop/HoloPack.tsx',
  'components/shop/HoloPack.test.tsx',
  'styles/HoloPack.css',
  'components/badges/BadgeSprite.tsx',
  'components/badges/BadgeToken.tsx',
  'components/badges/BadgeToken.test.tsx',
  'styles/Badges.css',
  'components/ui/Shard.tsx',
  'styles/Shard.css',
  'components/binder/craftForge.ts',
  'components/binder/BinderLargeView.tsx',
];

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
let failures = 0;

for (const file of MIGRATED) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const hits = line.match(RAW_COLOUR);
    if (hits) {
      failures += hits.length;
      console.error(`${file}:${i + 1}: raw colour ${hits.join(', ')}`);
    }
  });
}

if (failures) {
  console.error(`\n${failures} raw colour literal(s). Use a token from styles/tokens.css.`);
  process.exit(1);
}
console.log(`check-tokens: ${MIGRATED.length} files clean`);
