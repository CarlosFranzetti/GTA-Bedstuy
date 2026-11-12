// Triangles and draws of the REAL map (?map=real) in the game path (streamer + ChunkCuller + InstanceCuller as in play) at the
// three review street frames (under the el, residential side street, shop corner) of src/world/roadnet/reviewFrames.ts.
// Usage (through the render lock): scripts/swarm-render.sh node scripts/perf-real.mjs <outJson> [--port 4443] [--q low,medium] [--dist <dir>] [--no-build]
// The build is the hosted one (VITE_HOSTED=1: the preview only exists there). Counts only (SwiftShader): never read timings from it.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'perf-real.json'); const port = Number(arg('--port', 4443));
const tiers = arg('--q', 'low').split(',');
const W = 960, H = 540;
let dist = arg('--dist', null) ? resolve(arg('--dist')) : resolve(dirname(out), '.dist-real');
if (!arg('--dist', null) && !a.includes('--no-build')) {
  mkdirSync(dist, { recursive: true });
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, VITE_HOSTED: '1' } });
  if (r.status !== 0) process.exit(1);
}
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = []; const errors = [];
const save = () => writeFileSync(out, JSON.stringify({ errors, results }, null, 1));
try {
  for (const q of tiers) for (let attempt = 0; attempt < 3; attempt++) { try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(`${base}/?map=real&q=${q}&perf=0`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 420_000 });
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(800);
    const dismiss = async () => { const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } };
    await dismiss();
    const dbg = (fn, x) => page.evaluate(fn, x);
    await dbg(() => { window.__gtaDebug.stopLoop(); window.__gtaChunkCuller.buildsPerUpdate = 1e9; const c = document.querySelector('canvas.game'); if (c) c.style.display = 'none'; });
    await dbg(() => { const d = window.__gtaDebug; d.setHour(12); d.step(5); });
    const frames = await dbg(() => window.__gtaRealFrames());
    if (!frames.length) throw new Error('no review frames');
    for (const f of frames) {
      await dismiss();
      const r = await dbg((f) => {
        const d = window.__gtaDebug, rw = window.__gtaRealWorld();
        d.teleport(f.pos[0], f.pos[2]); d.step(3);
        d.setFreeCam(f.pos[0], f.pos[1], f.pos[2], f.look[0], f.look[1], f.look[2]);
        rw.streamer.settle(f.pos[0], f.pos[2], f.pos[1]);
        d.settle(30);
        let info; for (let i = 0; i < 4; i++) info = d.renderOnce(1, 1 / 60);
        const bd = window.__gtaTriBreakdown(d.scene, () => d.renderOnce(1, 1 / 60));
        return { info, bd, streamer: rw.streamer.stats() };
      }, f);
      results.push({ tier: q, view: f.name, ...r }); save();
      console.log(q, f.name, r.info.triangles, r.info.total, 'scene', r.bd.sceneTotal, r.bd.sceneDraws, 'shadow', r.bd.shadowTotal, r.bd.shadowDraws);
    }
    await page.close(); break;
  } catch (e) { console.error('attempt', attempt, q, String(e).slice(0, 160)); } }
} finally { save(); await browser.close(); preview.kill(); }
