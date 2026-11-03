// STUCK check: enter the parked car nearest the player spawn, hold W for 3 s (game paused and stepped), assert it moved >= 10 m
// and nothing logged an error.
// Usage: scripts/swarm-render.sh node tests/e2e/stuck-drive.mjs [--port 4419] [--skip-build]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(argv('--port', 4419));
const TYPE = argv('--type', 'suv');
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
  // enter the real spawn car (the parked car nearest the spawn point, untouched), hold W for 3 s, assert it moved >= 10 m
  const setup = await page.evaluate(() => {
    const g = window.__gtaDebug;
    const sp = { x: 9, z: 20 };
    const cars = g.traffic.vehicles.filter((v) => v.driver === null);
    cars.sort((a, b) => Math.hypot(a.body.pos.x - sp.x, a.body.pos.z - sp.z) - Math.hypot(b.body.pos.x - sp.x, b.body.pos.z - sp.z));
    const car = cars[0];
    const neighbours = cars.slice(1).map((c) => Math.hypot(c.body.pos.x - car.body.pos.x, c.body.pos.z - car.body.pos.z)).sort((a, b) => a - b);
    const d = car.doorPos(); g.teleport(d.x, d.z);
    g.player.tryEnter([car]);
    g.step(120);
    return { inVehicle: g.player.inVehicle, type: car.spec.type, x: car.body.pos.x, z: car.body.pos.z, nearestParked: neighbours[0] ?? null, parkedCount: cars.length };
  });
  if (!setup.inVehicle) throw new Error('could not get into the spawn car: ' + JSON.stringify(setup));
  await page.keyboard.down('KeyW');
  const run = await page.evaluate(() => {
    const g = window.__gtaDebug; const v = g.player.vehicle; const t0 = { x: v.body.pos.x, z: v.body.pos.z };
    let maxBlocked = 0;
    for (let i = 0; i < 180; i++) { g.step(1); maxBlocked = Math.max(maxBlocked, v.blockedSeconds ?? 0); }
    return { moved: +Math.hypot(v.body.pos.x - t0.x, v.body.pos.z - t0.z).toFixed(2), speedKmh: +v.speedKmh.toFixed(1), maxBlocked: +maxBlocked.toFixed(2), x: +v.body.pos.x.toFixed(2), z: +v.body.pos.z.toFixed(2) };
  });
  await page.keyboard.up('KeyW');
  const ok = run.moved >= 10 && errors.length === 0;
  console.log(JSON.stringify({ setup, run, ok, errors }, null, 1));
  if (!ok) process.exitCode = 1;
} finally { await browser.close(); preview.kill(); }
