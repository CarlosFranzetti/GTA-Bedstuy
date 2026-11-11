// CREDITS lane: posed hero candidates. For several pedestrians, a low three-quarter camera at four azimuths, free camera, golden hour.
// Usage: node scripts/title-art-portraits.mjs <outDir> --dist dist [--hour 18.4] [--peds 6] [--dist-m 2.3] [--fov 58]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'portraits'); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4462)); const dist = resolve(arg('--dist', 'dist'));
const hour = Number(arg('--hour', 18.4)); const nPeds = Number(arg('--peds', 6)); const dm = Number(arg('--dist-m', 2.3)); const fov = Number(arg('--fov', 58));
const W = 1600, H = 900;
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=high&perf=0`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 280_000 });
  await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(800);
  const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
  await page.evaluate((hr) => { const d = window.__gtaDebug; d.stopLoop(); d.setHour(hr); d.traffic.setHour?.(hr, true); d.step(300); }, hour);
  const peds = await page.evaluate((n) => {
    const d = window.__gtaDebug; const ps = d.traffic.peds; const pick = [];
    for (let i = 0; i < ps.length && pick.length < n; i++) { const p = ps[i]; if (!pick.some((q) => Math.hypot(ps[q].body.pos.x - p.body.pos.x, ps[q].body.pos.z - p.body.pos.z) < 40)) pick.push(i); }
    return pick;
  }, nPeds);
  console.log('peds', peds.join(','));
  for (const pi of peds) {
    for (const [ai, az] of [[0, 35], [1, 145], [2, 215], [3, 325]]) {
      const res = await page.evaluate(({ pi, az, dm, fov }) => {
        const d = window.__gtaDebug; const p = d.traffic.peds[pi]; const x0 = p.body.pos.x, z0 = p.body.pos.z;
        d.teleport(x0 + 9, z0 + 9); d.step(1);
        const x = p.body.pos.x, z = p.body.pos.z, a = (az * Math.PI) / 180;
        const cam = d.cam.camera; cam.fov = fov; cam.updateProjectionMatrix();
        // look slightly past the figure so it lands on a third
        const side = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];
        d.setFreeCam(x + dm * Math.sin(a), 0.7, z + dm * Math.cos(a), x - 0.25 * side[0] * dm * 0.5, 1.2, z - 0.25 * side[1] * dm * 0.5);
        d.settle(10); let info; for (let i = 0; i < 4; i++) info = d.renderOnce(1, 1 / 60);
        return { data: d.renderer.domElement.toDataURL('image/png'), x, z };
      }, { pi, az, dm, fov });
      writeFileSync(`${out}/ped${pi}-az${az}.png`, Buffer.from(res.data.split(',')[1], 'base64'));
      console.log(`ped${pi}-az${az}`, Math.round(res.x), Math.round(res.z));
    }
  }
} finally { await browser.close(); preview.kill(); }
