// Copies the hosted web build and the icon into native/ before electron-builder runs.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('native prep: ../dist/index.html missing. Run `VITE_HOSTED=1 npm run build` in the repo root first.');
  process.exit(1);
}
const web = join(here, '..', 'web');
rmSync(web, { recursive: true, force: true });
cpSync(dist, web, { recursive: true });
mkdirSync(join(here, '..', 'build'), { recursive: true });
cpSync(join(root, 'public', 'icons', 'icon-512.png'), join(here, '..', 'build', 'icon.png'));
console.log('native prep: web/ and build/icon.png ready');
