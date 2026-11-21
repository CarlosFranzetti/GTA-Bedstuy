// WEATHER: renders the weather sounds offline to WAV (one per scenario) and prints their loudness.
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/weather-audio-render.mjs [--out dir] [--only a,b]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/weather/audio'));
mkdirSync(out, { recursive: true });
const js = execFileSync('npx', ['--no-install', 'esbuild', 'scripts/weather-audio-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`, '--log-level=error'], { maxBuffer: 1 << 28 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
const names = await page.evaluate(() => window.weatherAudio.names);
const only = arg('only', '');
for (const n of names.filter((x) => !only || only.split(',').includes(x))) {
  const r = await page.evaluate((n) => window.weatherAudio.render(n), n);
  const f = `${out}/${n}.wav`;
  writeFileSync(f, Buffer.from(r.wav, 'base64'));
  const o = spawnSync('ffmpeg', ['-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const t = o.stderr.split('Summary:')[1] ?? '';
  const g = (re) => (t.match(re) ?? [])[1];
  console.log(n.padEnd(12), 'integrated', g(/I:\s+(-?[\d.]+) LUFS/), 'LUFS  range', g(/LRA:\s+([\d.]+) LU/), 'LU  true peak', g(/Peak:\s+(-?[\d.]+) dBFS/), 'dBTP  harness peak', r.peak, 'dBFS');
}
await browser.close();
