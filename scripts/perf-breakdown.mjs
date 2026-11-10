// Triangle breakdown by category (scene pass vs shadow pass) at screens.mjs viewpoints 1, 4, 10.
// Usage (through the render lock): scripts/swarm-render.sh node scripts/perf-breakdown.mjs <outJson> [--port 4442] [--q phone,low,medium] [--dist <dir>] [--no-build]
// Counts only (SwiftShader): never read timings from it.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'perf-breakdown.json'); const port = Number(arg('--port', 4442));
const tiers = arg('--q', 'phone,low').split(',');
const W = 960, H = 540;
let dist = arg('--dist', null) ? resolve(arg('--dist')) : resolve(dirname(out), '.dist-pb');
if (!arg('--dist', null) && !a.includes('--no-build')) {
  mkdirSync(dist, { recursive: true });
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) process.exit(1);
}
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = []; const errors = [];
const save = () => writeFileSync(out, JSON.stringify({ errors, results }, null, 1));
try {
  for (const q of tiers) for (let attempt = 0; attempt < 4; attempt++) { try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(`${base}/?q=${q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 180_000 });
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(800);
    const dismiss = async () => { const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } };
    await dismiss();
    const dbg = (fn, x) => page.evaluate(fn, x);
    await dbg(() => { window.__gtaDebug.stopLoop(); window.__gtaChunkCuller.buildsPerUpdate = 1e9; }); // far building geometry is built a few per frame in play; build it all at once here
    const hour = (h) => dbg((h) => { const d = window.__gtaDebug; d.setHour(h); d.step(5); }, h);
    const shot = async (name) => {
      if (results.some((r) => r.tier === q && r.view === name)) return;
      await dismiss(); await dbg(() => window.__gtaDebug.settle(120));
      const r = await dbg(() => {
        const d = window.__gtaDebug; let info; for (let i = 0; i < 3; i++) info = d.renderOnce(1, 1 / 60);
        return { info, bd: window.__gtaTriBreakdown(d.scene, () => d.renderOnce(1, 1 / 60)), vehicles: d.traffic.vehicles.length, peds: d.traffic.peds.length };
      });
      results.push({ tier: q, view: name, ...r }); save(); console.log(q, name, r.info.triangles, r.info.total, 'hooked scene', r.bd.sceneTotal, 'shadow', r.bd.shadowTotal);
    };
    await dbg(() => { const d = window.__gtaDebug; d.teleport(9, 20, 0); d.step(10); });
    await hour(12); await shot('1');
    await dbg(() => { const d = window.__gtaDebug; d.clearFreeCam(); d.teleport(6.2, 27.4); d.step(3); d.player.tryEnter([...d.traffic.vehicles, ...d.cops.cops]); d.step(40); });
    await hour(19.3); await shot('4');
    await dbg(() => { const d = window.__gtaDebug; d.clearFreeCam(); d.teleport(752, 80); d.step(90); d.setFreeCam(752, 2.8, 70, 749, 4, -80); });
    await hour(22); await shot('10');
    await page.close(); break;
  } catch (e) { console.error('attempt', attempt, q, String(e).slice(0, 120)); } }
} finally { save(); await browser.close(); preview.kill(); }
