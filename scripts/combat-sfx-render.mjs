// Offline render of every combat sound, with peak and loudness (ffmpeg ebur128).
// Usage: SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/combat-sfx-render.mjs [--out <dir>]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/action2/sfx'));
mkdirSync(out, { recursive: true });
const bundle = execFileSync('npx', ['--no-install', 'esbuild', 'scripts/combat-sfx-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`], { maxBuffer: 1 << 26 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: bundle });
const names = await page.evaluate(() => window.combatSfx.names);
const rows = [];
for (const n of names) {
  const r = await page.evaluate((n) => window.combatSfx.render(n), n);
  const f = `${out}/${n}.wav`;
  writeFileSync(f, Buffer.from(r.wav, 'base64'));
  const p = spawnSync('ffmpeg', ['-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const t = p.stderr;
  const I = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(t.slice(t.lastIndexOf('Summary')))?.[1];
  const tp = /Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(t.slice(t.lastIndexOf('Summary')))?.[1];
  let M = -Infinity; for (const m of t.matchAll(/M:\s*(-?[\d.]+)/g)) M = Math.max(M, Number(m[1]));
  rows.push({ name: n, peakDb: +r.peakDb.toFixed(1), truePeak: tp, integrated: I, momentaryMax: M });
}
await browser.close();
const gun = rows.find((r) => r.name === 'crack');
console.log('name        samplePk  truePk   I(LUFS)  Mmax(LUFS)  rel.gun(Mmax)  rel.gun(peak)');
for (const r of rows) console.log(r.name.padEnd(11), String(r.peakDb).padStart(8), String(r.truePeak).padStart(8), String(r.integrated).padStart(9), String(r.momentaryMax).padStart(10), String((r.momentaryMax - gun.momentaryMax).toFixed(1)).padStart(13), String((r.peakDb - gun.peakDb).toFixed(1)).padStart(13));
writeFileSync(`${out}/report.json`, JSON.stringify(rows, null, 1));
