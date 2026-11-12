// Shared by prep.mjs (before packaging) and verify-package.mjs (inside the finished app): is the hosted web build really there?
// Returns a list of problems; empty means fine. The single-file artifact (everything inlined, about 10 MB index.html) is NOT acceptable:
// it has no fonts, voice pack, street animation pack or map data to fetch.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MUST_EXIST = [
  'index.html',
  'fonts/Anton-Regular.woff2',
  'fonts/Barlow-Medium.woff2',
  'fonts/BarlowCondensed-Bold.woff2',
  'voice/manifest.json',
  'anim/street.bin',
  'anim/core.bin',
  'data/brooklyn-overview.json',
  'data/realmap-furniture.json',
];

export function checkWeb(dir) {
  const bad = [];
  for (const f of MUST_EXIST) if (!existsSync(join(dir, f))) bad.push(`missing ${f}`);
  const assets = join(dir, 'assets');
  const files = existsSync(assets) ? readdirSync(assets) : [];
  if (!files.some((f) => /^index-.*\.js$/.test(f))) bad.push('missing assets/index-*.js (is this the single-file artifact build? build with VITE_HOSTED=1)');
  if (!files.some((f) => /^three-.*\.js$/.test(f))) bad.push('missing assets/three-*.js chunk');
  if (!files.some((f) => /^realWorld-.*\.js$/.test(f))) bad.push('missing the lazy real-map chunk assets/realWorld-*.js');
  const banks = join(dir, 'voice', 'banks');
  if (!existsSync(banks) || !readdirSync(banks).some((f) => f.endsWith('.mp3'))) bad.push('missing voice/banks/*.mp3');
  if (existsSync(join(dir, 'index.html')) && statSync(join(dir, 'index.html')).size > 2_000_000) bad.push('index.html is over 2 MB: that is the single-file artifact, not the hosted build');
  // The GPL phonemizer must never be inside the installer (docs/NATIVE.md, "What the app downloads").
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (/espeak|phonemizer/i.test(e.name)) bad.push(`forbidden file in the web build: ${p.slice(dir.length + 1)}`);
      else if (/\.(js|mjs|html)$/.test(e.name) && statSync(p).size < 30_000_000) {
        const t = readFileSync(p, 'latin1');
        if (/espeak-ng\.wasm|espeakng\.worker|phonemizer\.js/i.test(t)) bad.push(`forbidden phonemizer code in ${p.slice(dir.length + 1)}`);
      }
    }
  }
  return bad;
}
