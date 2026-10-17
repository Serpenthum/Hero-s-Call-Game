// The hero art lives in frontend/hero-images (the backend serves it in development and Docker copies it
// into dist). On Vercel the site serves it itself, so copy it into the build output.
// Usage: node scripts/copy-assets.mjs   (after `vite build`)
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'hero-images');
const to = join(root, 'dist', 'hero-images');

if (!existsSync(join(root, 'dist'))) {
  console.error('copy-assets: dist/ is missing; run the build first.');
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log('copy-assets: hero-images copied into dist/');
