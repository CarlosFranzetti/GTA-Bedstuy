// Copies the hosted web build and the icon into native/ before electron-builder runs, and refuses to go on if the web build is wrong.
// GTA_WEB_DIR overrides the source folder (default: ../dist, built with VITE_HOSTED=1).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWeb } from './webcheck.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = process.env.GTA_WEB_DIR ? resolve(process.env.GTA_WEB_DIR) : join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`native prep: ${dist}/index.html missing. Run \`VITE_HOSTED=1 npm run build\` in the repo root first.`);
  process.exit(1);
}
const problems = checkWeb(dist);
if (problems.length) {
  console.error(`native prep: the web build in ${dist} is not usable:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
const web = join(here, '..', 'web');
rmSync(web, { recursive: true, force: true });
cpSync(dist, web, { recursive: true });
mkdirSync(join(here, '..', 'build'), { recursive: true });
cpSync(join(root, 'public', 'icons', 'icon-512.png'), join(here, '..', 'build', 'icon.png'));
console.log('native prep: web/ and build/icon.png ready from', dist);
