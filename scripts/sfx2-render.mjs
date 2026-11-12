// SFX2: offline drive measurement and demo renders of the real vehicle audio graph.
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/sfx2-render.mjs drive <type> [--base] [--out dir]
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/sfx2-render.mjs steady [--out dir]
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/sfx2-render.mjs demos [--out dir]
// --base measures the module root given by --root (a copy of the committed code) instead of src/audio/vehicle.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const mode = a[0];
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/sfx2'));
const root = resolve(arg('root', 'src/audio/vehicle'));
mkdirSync(out, { recursive: true });
const js = execFileSync('npx', ['--no-install', 'esbuild', 'scripts/sfx2-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`, `--alias:@veh=${root}`], { maxBuffer: 1 << 26 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
const save = (n, b64) => writeFileSync(`${out}/${n}.wav`, Buffer.from(b64, 'base64'));
if (mode === 'drive') {
  const type = a[1] ?? 'sedan', tag = arg('tag', 'new');
  const r = await page.evaluate(([t, w]) => window.sfx2.longDrive(t, 120, w), [type, a.includes('--wav')]);
  if (r.wav) { save(`drive_${type}_${tag}`, r.wav); delete r.wav; }
  writeFileSync(`${out}/drive_${type}_${tag}.json`, JSON.stringify(r));
  console.log(type, tag, 'dips>6dB (not at a marker):', r.dips.length, JSON.stringify(r.dips), 'falls>12dB/0.5s:', r.falls.length, JSON.stringify(r.falls), 'NaN', r.nan, 'peak', r.peakDb.toFixed(1), 'LUFS by phase', JSON.stringify(Object.fromEntries(Object.entries(r.phases).map(([k, v]) => [k, +v.toFixed(1)]))));
} else if (mode === 'steady') {
  const rows = [];
  for (const t of await page.evaluate(() => window.sfx2.types)) rows.push(await page.evaluate((t) => window.sfx2.steady(t), t));
  writeFileSync(`${out}/steady_${arg('tag', 'new')}.json`, JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(r.type.padEnd(10), Object.entries(r).filter(([k]) => k !== 'type').map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  '));
} else if (mode === 'demos') {
  const dir = `${out}/demo`; mkdirSync(dir, { recursive: true });
  const eight = (arg('types', 'beater,bus,boxtruck,muscle,coupe911,jdmcoupe,evsedan,luxury')).split(',');
  for (const t of eight) { const d = await page.evaluate((t) => window.sfx2.demo(t), t); writeFileSync(`${dir}/engine_${t}.wav`, Buffer.from(d.wav, 'base64')); console.log('engine', t, 'peak', d.peak.toFixed(1)); }
  for (const [n, t, m, h] of [['sedan', 'sedan'], ['luxury', 'luxury'], ['boxtruck_air', 'boxtruck'], ['hatch', 'hatch'], ['cop_wail', 'cop', 'wail', 5], ['cop_yelp', 'cop', 'yelp', 3]]) { const d = await page.evaluate(([t, m, h]) => window.sfx2.hornDemo(t, h ?? 1.4, m), [t, m, h]); writeFileSync(`${dir}/horn_${n}.wav`, Buffer.from(d.wav, 'base64')); console.log('horn', n, 'peak', d.peak.toFixed(1), 'lufs', d.lufs.toFixed(1)); }
}
await browser.close();
