// SKINS lane: two close-ups (a group of peds at 4 m, a car at 4 m) + draw-call stats, headless.
// Usage: node scripts/skins-closeups.mjs <outDir> --dist <dir> [--port 4440] [--q low] [--width 640] [--height 360]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const o = { port: 4440, q: 'low', width: 640, height: 360, dist: null };
const rest = [];
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--port') o.port = Number(a[++i]); else if (a[i] === '--q') o.q = a[++i];
  else if (a[i] === '--width') o.width = Number(a[++i]); else if (a[i] === '--height') o.height = Number(a[++i]);
  else if (a[i] === '--dist') o.dist = resolve(a[++i]); else rest.push(a[i]);
}
const out = resolve(rest[0] ?? 'skins-closeups'); mkdirSync(out, { recursive: true });
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', o.dist, '--port', String(o.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${o.port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = []; const stats = {};
try {
  const page = await browser.newPage({ viewport: { width: o.width, height: o.height } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${o.q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 180_000 });
  await page.mouse.click(o.width / 2, o.height / 2); await page.waitForTimeout(800);
  const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
  await page.evaluate(() => { const d = window.__gtaDebug; d.stopLoop(); d.setHour(12); d.traffic.setHour?.(12, true); d.teleport(9, 20, 0); d.step(600); });
  const shoot = async (name, js) => {
    const r = await page.evaluate(js);
    if (!r) { console.error(name, 'no target'); return; }
    const res = await page.evaluate(() => { const d = window.__gtaDebug; d.settle(60); let info; for (let i = 0; i < 4; i++) info = d.renderOnce(1, 1 / 60); return { info, data: d.renderer.domElement.toDataURL('image/png') }; });
    writeFileSync(`${out}/${name}.png`, Buffer.from(res.data.split(',')[1], 'base64'));
    stats[name] = { target: r, drawCalls: res.info.total, triangles: res.info.triangles };
    console.log(name, JSON.stringify(stats[name]));
  };
  await shoot('closeup-peds-4m', () => {
    const d = window.__gtaDebug; const ps = d.traffic.peds; let best = null; let bn = -1;
    for (const p of ps) { const n = ps.filter((q) => Math.hypot(q.body.pos.x - p.body.pos.x, q.body.pos.z - p.body.pos.z) < 3).length; if (n > bn) { bn = n; best = p; } }
    if (!best) return null;
    const grp = ps.filter((q) => Math.hypot(q.body.pos.x - best.body.pos.x, q.body.pos.z - best.body.pos.z) < 3);
    const cx = grp.reduce((s, q) => s + q.body.pos.x, 0) / grp.length, cz = grp.reduce((s, q) => s + q.body.pos.z, 0) / grp.length;
    d.teleport(cx + 8, cz + 8);
    d.setFreeCam(cx + 2.8, 1.7, cz + 2.8, cx, 1.0, cz);
    return { group: grp.length, cx, cz };
  });
  await shoot('closeup-car-4m', () => {
    const d = window.__gtaDebug; const p = d.player.body.pos; let best = null; let bd = 1e9;
    for (const v of d.traffic.vehicles) { const dd = Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z); if (dd < bd && dd > 1) { bd = dd; best = v; } }
    if (!best) return null;
    const x = best.body.pos.x, z = best.body.pos.z;
    d.setFreeCam(x + 3.2, 1.5, z + 2.4, x, 0.7, z);
    return { x, z, type: best.spec?.type ?? best.type };
  });
} finally { writeFileSync(`${out}/stats.json`, JSON.stringify({ q: o.q, errors, stats }, null, 2)); await browser.close(); preview.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 5));
