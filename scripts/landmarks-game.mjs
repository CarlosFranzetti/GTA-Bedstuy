// LANDMARKS: frames from the RUNNING game on ?map=real (hosted build). Canvas hidden, Space pressed, loop stopped, free camera,
// renderOnce, toDataURL (MEMORY.md "Builds and checks").
// Usage (through the render lock): scripts/swarm-render.sh node scripts/landmarks-game.mjs <outDir> --dist <hostedDist> [--ids a,b] [--views street,aerial] [--q low] [--port 4471] [--map]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'landmarks-game'); mkdirSync(out, { recursive: true });
const dist = resolve(arg('--dist', 'dist')); const port = Number(arg('--port', 4471)); const q = arg('--q', 'low');
const ids = arg('--ids', '').split(',').filter(Boolean); const views = arg('--views', 'street,aerial').split(',');
const W = Number(arg('--w', 1024)), H = Number(arg('--h', 576));
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = []; const report = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${base}/?map=real&q=${q}&perf=0`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 420_000 });
  // hide the canvas and stop the loop BEFORE anything else: a visible software-rendered game page uses many gigabytes and is killed
  await page.evaluate(() => { const d = window.__gtaDebug; d.stopLoop(); d.renderer.domElement.style.visibility = 'hidden'; });
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  const dismiss = async () => { const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } };
  await dismiss();
  await page.evaluate((HOUR) => { const d = window.__gtaDebug; d.setHour(Number(HOUR)); d.step(5); }, arg('--hour', '17.5'));
  const rows = await page.evaluate(() => window.__gtaRealWorld().landmarks.rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, site: r.site })));
  for (const row of rows) {
    if (ids.length && !ids.includes(row.id)) continue;
    for (const v of views) {
      await dismiss();
      let r;
      try { r = await page.evaluate(({ row, v }) => {
        const d = window.__gtaDebug, rw = window.__gtaRealWorld(), s = row.site;
        const front = { x: s.ax + s.fx * s.w / 2, z: s.az + s.fz * s.w / 2 };
        const o = { x: -s.nx, z: -s.nz };
        const c = { x: s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, z: s.az + s.fz * s.w / 2 + s.nz * s.d / 2 };
        const size = Math.hypot(s.w, s.d);
        const big = ['park', 'housing', 'hospital', 'armory', 'playground'].includes(row.kind);
        let p, l;
        if (v === 'street') {
          const dd = big ? 2.5 : row.kind === 'subway' ? 7 : Math.max(13, Math.min(26, s.w * 0.4));
          p = [front.x + o.x * dd + s.fx * s.w * (big ? 0.1 : 0.12), 1.7, front.z + o.z * dd + s.fz * s.w * (big ? 0.1 : 0.12)];
          l = [c.x - s.nx * s.d * (big ? 0.15 : 0.45), big ? 5 : Math.min(12, size * 0.12), c.z - s.nz * s.d * (big ? 0.15 : 0.45)];
        } else { const h = Math.min(70, Math.max(34, size * 0.3)); p = [front.x + o.x * (size * 0.22 + 12), h, front.z + o.z * (size * 0.22 + 12)]; l = [c.x, 0, c.z]; } // modest height: the streamers' far range grows with it and a software page is killed beyond a few gigabytes
        // the player stands at the camera's ground point, so the streamers (buildings, landmarks) work around it
        d.teleport(p[0], p[2]); d.step(3);
        d.setFreeCam(p[0], p[1], p[2], l[0], l[1], l[2]);
        rw.streamer.settle(p[0], p[2], p[1]);
        rw.landmarks.settle(p[0], p[2], p[1]);
        d.settle(30);
        let info; for (let i = 0; i < 2; i++) info = d.renderOnce(1, 1 / 60);
        const url = d.renderer.domElement.toDataURL('image/png');
        return { url, info, lm: rw.landmarks.stats() };
      }, { row, v }); } catch (e) { console.error('frame failed', row.id, v, String(e).slice(0, 120)); report.push({ id: row.id, view: v, failed: String(e).slice(0, 120) }); writeFileSync(`${out}/report.json`, JSON.stringify({ report, errors }, null, 1)); throw e; }
      writeFileSync(`${out}/${row.id}-${v}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
      report.push({ id: row.id, view: v, tris: r.info.triangles, calls: r.info.total, lm: r.lm });
      console.log(`${out}/${row.id}-${v}.png`, r.info.triangles, r.info.total);
    }
  }
  if (a.includes('--map')) {
    await page.evaluate(() => { const d = window.__gtaDebug; d.clearFreeCam(); d.teleport(-300, 150); d.map.open(); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/map.png` });
    await page.evaluate(() => { const d = window.__gtaDebug; d.map.close(); });
  }
  writeFileSync(`${out}/report.json`, JSON.stringify({ report, errors }, null, 1));
} finally { await browser.close(); preview.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 8));
