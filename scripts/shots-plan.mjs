// SHOTS lane: backdrop shot runner. node scripts/shots-plan.mjs <plan.json> <outDir> --dist <dir> [--w 1920 --h 1080 --q medium --port 4471]
// plan: [{ name, hour, wet?, at:[x,z], el?, cam:[cx,cy,cz,lx,ly,lz] | carCam:{ pick:0, back, side, h, lookAhead, lookH } }]
// carCam places the free camera relative to the pick-th vehicle body (nearest first) within 40 m of `at`, so the car is composed on purpose.
// Prints nearby vehicles (id, pos, heading) for scouting. Run through scripts/swarm-render.sh. The game canvas is hidden after boot.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const plan = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
const out = resolve(process.argv[3]); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4471)); const dist = resolve(arg('--dist', 'dist'));
const W = Number(arg('--w', 1920)), H = Number(arg('--h', 1080));
const T0 = Date.now();
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${arg('--q', 'medium')}&perf=0`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 1_200_000 });
  console.log('booted', Date.now() - T0, 'ms');
  await page.evaluate(() => { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; });
  await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(500);
  const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
  for (const s of plan) {
    const res = await page.evaluate((s) => {
      const d = window.__gtaDebug; d.stopLoop(); d.setHour(s.hour); d.traffic.setHour?.(s.hour, true);
      d.setWeather?.(s.wet ? 'wet' : 'dry', true);
      d.teleport(s.at[0], s.at[1], 0); d.step(s.steps ?? 240);
      if (s.el !== undefined && d.transit) d.transit.time = s.el;
      const cars = d.physics.bodies().filter((b) => b.shape.kind === 'obb' && Math.hypot(b.pos.x - s.at[0], b.pos.z - s.at[1]) < 45)
        .map((b) => ({ id: b.id, x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1), h: +b.heading.toFixed(2), kind: b.kind, d: +Math.hypot(b.pos.x - s.at[0], b.pos.z - s.at[1]).toFixed(1) }))
        .sort((a, b) => a.d - b.d);
      let cam = s.cam;
      if (s.carCam) {
        const c = cars[s.carCam.pick ?? 0];
        if (c) {
          const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = -fz, rz = fx; // forwardFromHeading and perpRight from Math2
          const k = s.carCam;
          cam = [c.x + fx * k.fwd + rx * k.side, k.h, c.z + fz * k.fwd + rz * k.side, c.x + fx * (k.lookFwd ?? 0) + rx * (k.lookSide ?? 0), k.lookH ?? 0.8, c.z + fz * (k.lookFwd ?? 0) + rz * (k.lookSide ?? 0)];
        }
      }
      d.setFreeCam(...cam);
      d.settle(20); let info; for (let i = 0; i < 5; i++) info = d.renderOnce(1, 1 / 60);
      return { data: d.renderer.domElement.toDataURL('image/png'), calls: info.total, tris: info.triangles, cars: cars.slice(0, 6), cam };
    }, s);
    writeFileSync(`${out}/${s.name}.png`, Buffer.from(res.data.split(',')[1], 'base64'));
    console.log(s.name, 'calls', res.calls, 'tris', res.tris, 'cam', JSON.stringify(res.cam.map((v) => +v.toFixed(1))), 'cars', JSON.stringify(res.cars));
  }
} finally { await browser.close(); preview.kill(); }
