// After electron-builder: look INSIDE the unpacked app for the web build and fail loudly if it is missing or wrong.
// Usage: node scripts/verify-package.mjs [release dir]   (default native/release)
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWeb } from './webcheck.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const release = resolve(process.argv[2] ?? join(here, '..', 'release'));
const found = [];
(function walk(d, depth) {
  if (depth > 6 || !existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(d, e.name);
    if (e.name === 'web' && /^resources$/i.test(dirname(p).split(/[\\/]/).pop())) found.push(p);
    else walk(p, depth + 1);
  }
})(release, 0);
if (!found.length) { console.error(`verify-package: no resources/web folder under ${release}. The installer has no game in it.`); process.exit(1); }
let failed = false;
for (const dir of found) {
  const problems = checkWeb(dir);
  if (problems.length) { failed = true; console.error(`verify-package: ${dir}\n  - ${problems.join('\n  - ')}`); } else console.log(`verify-package: ok ${dir}`);
}
process.exit(failed ? 1 : 0);
