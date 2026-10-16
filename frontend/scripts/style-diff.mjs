// Compares two style snapshots. Usage: node scripts/style-diff.mjs before.json after.json
import { readFileSync } from 'node:fs';

const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
  'borderTopStyle', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'textTransform',
  'textAlign', 'display', 'position', 'width', 'height', 'paddingTop', 'paddingLeft', 'marginTop',
  'marginLeft', 'opacity', 'zIndex', 'overflowY'];

const load = file => {
  const text = readFileSync(file, 'utf8');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
};
const [a, b] = [load(process.argv[2]), load(process.argv[3])];
let diffs = 0;
for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (!(key in a)) { console.log(`+ only after:  ${key}`); diffs++; continue; }
  if (!(key in b)) { console.log(`- only before: ${key}`); diffs++; continue; }
  const sa = new Set(a[key]);
  const sb = new Set(b[key]);
  const onlyA = [...sa].filter(s => !sb.has(s));
  const onlyB = [...sb].filter(s => !sa.has(s));
  if (!onlyA.length && !onlyB.length) continue;
  diffs++;
  const [x, y] = [(onlyA[0] || '').split('|'), (onlyB[0] || '').split('|')];
  const changed = PROPS.map((p, i) => (x[i] !== y[i] ? `${p}: ${x[i]} -> ${y[i]}` : null)).filter(Boolean);
  console.log(`~ ${key}\n    ${changed.join('\n    ') || '(signature sets differ)'}`);
}
console.log(diffs ? `\n${diffs} difference(s)` : 'no differences');
process.exit(diffs ? 1 : 0);
