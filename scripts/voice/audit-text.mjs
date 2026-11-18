#!/usr/bin/env node
// SOUNDCHECK: audit of the planned voice clips for rhythm. Lists phrases that are too long to say in one breath (no comma
// for 10+ words) and orphans (1 or 2 words on their own), with the speaker, whether the clip is already baked (so editing
// its text would orphan a baked clip) and the kind of line. No rendering, no network.
//   node scripts/voice/audit-text.mjs [--out file.json] [--long 10]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const { build } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
const outDir = join(root, 'cache/voice-audit');
await build({ root, configFile: false, logLevel: 'error', resolve: { alias: { '@': join(root, 'src') } },
  build: { ssr: join(here, 'plan-entry.ts'), outDir, emptyOutDir: true, target: 'node20', minify: false, rolldownOptions: { output: { format: 'es', entryFileNames: 'plan.mjs' } } }, ssr: { noExternal: true } });
const mod = await import(pathToFileURL(join(outDir, 'plan.mjs')).href + `?t=${Date.now()}`);
const plan = await mod.buildPlan(root, join(here, 'stations.snapshot.json'));
const man = JSON.parse(readFileSync(join(root, 'public/voice/manifest.json'), 'utf8')).entries;
const words = (t) => (t.match(/[\p{L}\p{N}']+/gu) ?? []).length;
const LONG = Number(opt('long', '10'));
const rows = plan.map((c) => ({ who: c.who, tier: c.tier, kind: c.kind, text: c.text, words: words(c.text), baked: c.key in man, voice: c.voice, speed: c.speed }));
const uniq = new Map(rows.map((r) => [`${r.who}|${r.text}`, r]));
const U = [...uniq.values()];
const long = U.filter((r) => r.words >= LONG && !/[,;:—]/.test(r.text.replace(/[.!?…]+$/, '')));
const orphan = U.filter((r) => r.words <= 2 && r.tier !== 5);
const bark1 = U.filter((r) => r.tier === 5 && r.words <= 1);
const dist = {};
for (const r of U) { const b = r.words >= 16 ? '16+' : String(r.words); dist[b] = (dist[b] ?? 0) + 1; }
const summary = { planned: plan.length, uniquePhrases: U.length, bakedUnique: U.filter((r) => r.baked).length, phraseWordsHistogram: dist, longNoComma: long.length, longNoCommaUnbaked: long.filter((r) => !r.baked).length, orphans: orphan.length, orphansUnbaked: orphan.filter((r) => !r.baked).length, oneWordBarks: bark1.length };
console.log(JSON.stringify(summary, null, 1));
writeFileSync(resolve(opt('out', join(root, 'cache/voice-audit/audit.json'))), JSON.stringify({ summary, long, orphan }, null, 1));
