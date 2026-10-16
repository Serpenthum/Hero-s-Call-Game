// One-time: copies the rules other screens still need out of GameLobby.css into their own files.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/styles/GameLobby.css', 'utf8').replace(/\r\n/g, '\n');

// Split into top-level chunks (a rule or at-rule with balanced braces, or an @import).
function chunks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  let paren = 0;
  for (let i = 0; i < css.length; i++) {
    const two = css.slice(i, i + 2);
    if (!inComment && two === '/*') { inComment = true; i++; continue; }
    if (inComment) { if (two === '*/') { inComment = false; i++; } continue; }
    const ch = css[i];
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
    } else if (ch === ';' && depth === 0 && paren === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
  }
  return out.map(c => c.trim()).filter(Boolean);
}

const head = c => c.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('{')[0].trim();

const legacy = [];
const quest = [];
const rules = [];
const settings = [];
for (const c of chunks(src)) {
  const h = head(c);
  if (h.startsWith('@import') || h === ':root' || h === '*' || h === '.modal-overlay') legacy.push(c);
  else if (/^@keyframes quest/.test(h) || /^\.quest-reward/.test(h)) quest.push(c);
  else if (/^\.rules-modal/.test(h)) rules.push(c);
  else if (/^\.settings-/.test(h)) settings.push(c);
  else if (h.startsWith('@media') && /\.rules-modal/.test(c) && !/\.friendly|\.game-lobby-modern/.test(c)) rules.push(c);
}

// @import must come first in a stylesheet.
legacy.sort((a, b) => Number(b.startsWith('@import')) - Number(a.startsWith('@import')));

quest.push(`@media (prefers-reduced-motion: reduce) {
  .quest-reward-overlay,
  .quest-reward-modal,
  .quest-reward-star,
  .quest-reward-levelup {
    animation: none;
  }
  .quest-reward-list li,
  .quest-reward-chip,
  .quest-reward-ok {
    animation: none;
    opacity: 1;
  }
}`);

const write = (file, note, list) => {
  writeFileSync(`src/styles/${file}`, `/* ${note} Carved from GameLobby.css unchanged; restyled in phase 4. */\n\n${list.join('\n\n')}\n`);
  console.log(`${file}: ${list.length} blocks`);
};
write('legacy-base.css', 'Global base the older screens still rely on (fonts, variables, reset, overlay). Removed in phase 5.', legacy);
write('QuestRewardModal.css', 'Quest reward modal.', quest);
write('RulesModal.css', 'How-to-play and settings modal frame.', rules);
write('SettingsModal.css', 'Settings modal.', settings);
