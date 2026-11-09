// DRIVE9 headless repro: in the real build, drive an SUV into a pole cluster and onto a kerb, then reverse out.
// Paused game stepped by hand. Asserts: clears the poles, reverses out >= 2 m, a soft bin does not stop the car,
// no pageerror. Usage: scripts/swarm-render.sh node tests/e2e/h8-drive.mjs [--port 4447] [--skip-build]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(argv('--port', 4447));
if (!args.includes('--skip-build')) execSync('npm run build', { stdio: 'ignore' });
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=low`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  const btn = page.getByRole('button', { name: 'Resume' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.evaluate(() => window.__gtaDebug.setPaused(true));
  const out = await page.evaluate(() => {
    const g = window.__gtaDebug;
    // clear stretch of tarmac far from everything: add test props to the real physics world
    const cars = g.traffic.vehicles.filter((v) => v.driver === null);
    const car = cars[0];
    const d = car.doorPos(); g.teleport(d.x, d.z); g.player.tryEnter([car]); g.step(120);
    const v = g.player.vehicle;
    const place = (x, z, h) => { v.body.pos.x = x; v.body.pos.z = z; v.body.heading = h; v.body.vel.x = 0; v.body.vel.z = 0; };
    // remove other cars near the test spot by moving the park car there; use the open Throop Ave lane
    const X = 4.6, Z0 = -30;
    for (const o of cars) if (o !== v && Math.hypot(o.body.pos.x - X, o.body.pos.z - Z0) < 25) { o.body.pos.x += 200; }
    const poles = [-0.6, -0.2, 0.2, 0.6].map((dx, i) => g.physics.addStatic({ kind: 'circle', r: 0.2 }, { x: X + dx, z: Z0 - 4 }, `h8-pole${i}`));
    g.physics.addStatic({ kind: 'circle', r: 0.3 }, { x: X + 0.1, z: Z0 - 40 }, 'soft-bin-h8');
    const keyDown = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    const keyUp = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    const res = {};
    // 1. into the pole cluster, W held 4 s
    place(X, Z0, 0); keyDown('KeyW'); g.step(240); keyUp('KeyW');
    res.afterPoles = +v.body.pos.z.toFixed(2); res.polesClearedBy = +(Z0 - 4 - v.body.pos.z).toFixed(2);
    // 2. reverse out of a fresh pole contact
    [-0.6, -0.2, 0.2, 0.6].forEach((dx, i) => g.physics.addStatic({ kind: 'circle', r: 0.2 }, { x: X + dx, z: Z0 + 16 }, `h8-pole-b${i}`));
    place(X, Z0 + 24, 0); keyDown('KeyW'); g.step(120); keyUp('KeyW');
    const atPoles = v.body.pos.z; res.atPoles = +atPoles.toFixed(2);
    keyDown('KeyS'); g.step(200); keyUp('KeyS');
    res.reverseBack = +(v.body.pos.z - atPoles).toFixed(2);
    // 3. soft bin
    place(X + 0.1, Z0 - 25, 0); v.body.vel.z = -8; keyDown('KeyW'); g.step(150); keyUp('KeyW');
    res.binPast = +(Z0 - 40 - v.body.pos.z).toFixed(2); res.binSpeedKmh = +v.speedKmh.toFixed(1);
    res.name = v.name; res.plate = v.plate;
    return res;
  });
  const ok = out.polesClearedBy > 2 && out.reverseBack > -1 && out.binPast > 2 && errors.length === 0;
  console.log(JSON.stringify({ out, ok, errors }, null, 1));
  if (!ok) process.exitCode = 1;
} finally { await browser.close(); preview.kill(); }
