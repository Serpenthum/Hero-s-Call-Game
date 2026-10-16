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
  'styles/PackOpeningAnimation.css',
  'styles/ProfileModal.css',
  'styles/QuestRewardModal.css',
  'styles/SettingsModal.css',
  'styles/RulesModal.css',
  'styles/RequirementModal.css',
  'styles/Tutorial.css',
  'styles/Social.css',
  'styles/Panels.css', 'styles/Survival.css', 'styles/SurvivalMode.css', 'styles/SurvivalProgress.css', 'styles/SurvivalTeamBuilder.css', 'styles/SurvivalUsedHeroes.css', 'styles/SurvivalBattleTransition.css',
  'components/DraftClock.tsx',
  'components/RotatePrompt.tsx',
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
