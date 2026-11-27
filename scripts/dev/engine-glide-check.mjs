// Engine pitch against the frame rate, rendered offline in a real browser with the REAL engine classes: a full-throttle run of a
// sedan, the game writing engine state at 60, 30, 20 frames a second and at 45 with 150 ms hitches. Reports the flutter of the
// rendered note (cents away from its own 60 ms average, measured from zero crossings of the low-passed signal) and the largest
// sample step (clicks). `--old` uses the old smoothing (aim with a 30 ms time constant) for a before.
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/dev/engine-glide-check.mjs [--old]
// Nobody hears this: the numbers say how steady the pitch is, not how it sounds.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const old = process.argv.includes('--old');
const entry = `
import { EngineNodes, glide, aim } from '@/audio/vehicle/nodes';
import { ENGINE_VOICES, EngineSim } from '@/audio/vehicle/engineModel';
const SR = 44100;
async function run(frames, old) {
  const secs = 6, ctx = new OfflineAudioContext(1, SR * secs, SR);
  const nb = ctx.createBuffer(1, SR, SR), d = nb.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823 - 1; }
  const v = ENGINE_VOICES.sedan, eng = new EngineNodes(ctx, v, nb, ctx.destination, 0), sim = new EngineSim(v, () => 0.5); sim.startNow();
  if (old) for (const o of (eng as any).oscs) if (o.frequency) o.frequency.linearRampToValueAtTime = undefined; // falls back to aim
  let sp = 0, last = 0, k = 0;
  const tick = (t) => { const dt = Math.max(1 / 240, t - last); last = t; for (let q = dt; q > 1e-9; q -= 1 / 60) { const h = Math.min(1 / 60, q); sp += 8 * (1 - (sp / 30) ** 2) * h; } eng.apply(sim.update(Math.min(0.25, dt), sp, 1), t, sp, false); };
  const times = frames.filter((t) => t > 0 && t < secs - 0.01).map((t) => Math.round(t * SR / 128) * 128 / SR).filter((t, i, a) => i === 0 || t > a[i - 1]);
  tick(0);
  const done = ctx.startRendering ? null : null;
  let p = Promise.resolve();
  for (const t of times) ctx.suspend(t).then(() => { tick(t); ctx.resume(); });
  const buf = await ctx.startRendering(); const x = buf.getChannelData(0);
  // largest sample step relative to the signal's peak
  let peak = 0, step = 0; for (let i = 1; i < x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); step = Math.max(step, Math.abs(x[i] - x[i - 1])); }
  // pitch track: autocorrelation over 40 ms windows every 5 ms between 0.6 s and 5.5 s, lag searched round the commanded firing rate
  const track = [];
  for (let t = 0.6; t < 5.5; t += 0.005) {
    const a = Math.floor(t * SR), W = Math.floor(0.04 * SR); let best = 0, bl = 0;
    for (let lag = Math.floor(SR / 420); lag < Math.floor(SR / 30); lag++) { let c = 0, e1 = 0, e2 = 0; for (let i = 0; i < W; i += 2) { const p1 = x[a + i], p2 = x[a + i + lag]; c += p1 * p2; e1 += p1 * p1; e2 += p2 * p2; } const r = c / Math.sqrt(e1 * e2 + 1e-12); if (r > best + 0.01) { best = r; bl = lag; } }
    track.push(SR / bl);
  }
  // flutter: cents from a 60 ms (12 point) moving median-free average; octave slips of the tracker are dropped
  let worst = 0, sum = 0, n = 0;
  for (let i = 6; i < track.length - 6; i++) { let m = 0; for (let j = -6; j < 6; j++) m += track[i + j]; m /= 12; const c = Math.abs(1200 * Math.log2(track[i] / m)); if (c > 300) continue; worst = Math.max(worst, c); sum += c * c; n++; }
  return { flutterPeakCents: +worst.toFixed(1), flutterRmsCents: +Math.sqrt(sum / Math.max(1, n)).toFixed(2), maxStepOverPeak: +(step / peak).toFixed(3), frames: times.length };
}
const steady = (fps) => Array.from({ length: 6 * fps }, (_, i) => i / fps);
const hitchy = () => { const a = []; let t = 0, s = 1; while (t < 6) { a.push(t); s = (s * 16807) % 2147483647; t += (s % 10 === 0) ? 0.15 : 1 / 45; } return a; };
window.runAll = async (old) => { const out = {}; for (const [n, f] of [['60 fps', steady(60)], ['30 fps', steady(30)], ['20 fps', steady(20)], ['45 fps with 150 ms hitches', hitchy()]]) out[n] = await run(f, old); return out; };
`;
const dir = mkdtempSync(resolve(tmpdir(), 'glide-')); writeFileSync(resolve(dir, 'entry.ts'), entry);
const js = execFileSync('npx', ['--no-install', 'esbuild', resolve(dir, 'entry.ts'), '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`, '--define:import.meta.env={}', '--log-level=error'], { maxBuffer: 1 << 28 }).toString();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
console.log(old ? 'OLD smoothing (aim, 30 ms)' : 'NEW (glide)');
console.log(JSON.stringify(await page.evaluate((o) => window.runAll(o), old), null, 1));
await browser.close();
