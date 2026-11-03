// Headless scripted drive on an open stretch of Throop Ave: hold W 3 s, then W+D 2 s (deterministic: the game is
// paused and stepped with __gtaDebug.step, real keyboard keys held). Prints heading change, speed, lateral offset.
// Usage: scripts/swarm-render.sh node tests/e2e/driving-feel.mjs [--port 4414] [--skip-build] [--type suv]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(argv('--port', 4414));
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
  const setup = await page.evaluate((type) => {
    const g = window.__gtaDebug;
    // open stretch: the middle of a Throop segment, northbound lane; pick the car of the wanted type
    const seg = g.grid.segments.filter((s) => s.streetId === 'throop').sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z) - Math.hypot(a.b.x - a.a.x, a.b.z - a.a.z))[0];
    const mx = (seg.a.x + seg.b.x) / 2, mz = (seg.a.z + seg.b.z) / 2;
    const car = g.traffic.vehicles.find((v) => v.driver === null && v.spec.type === type) ?? g.traffic.vehicles.find((v) => v.driver === null);
    // clear every other dynamic body within 70 m of the stretch
    for (const b of g.physics.bodies()) {
      if ((b.kind === 'vehicle' || b.kind === 'cop' || b.kind === 'ped') && b !== car.body && Math.hypot(b.pos.x - mx, b.pos.z - mz) < 70) { b.pos.x += 400; b.pos.z += 400; }
    }
    const x0 = mx + 3.5; // right-hand lane of a north-south street
    car.body.pos.x = x0; car.body.pos.z = mz + 30; car.body.heading = 0; car.body.vel.x = 0; car.body.vel.z = 0;
    const d = car.doorPos(); g.teleport(d.x, d.z);
    g.player.tryEnter([car]);
    g.step(200);
    return { inVehicle: g.player.inVehicle, type: car.spec.type, x0, z0: mz + 30, seg: seg.id, roadWidth: seg.width };
  }, TYPE);
  if (!setup.inVehicle) throw new Error('could not get into the car: ' + JSON.stringify(setup));
  const run = async (key, steps) => {
    await page.keyboard.down(key);
    const out = await page.evaluate((n) => {
      const g = window.__gtaDebug; const v = g.player.vehicle; const h0 = v.body.heading;
      const t0 = { x: v.body.pos.x, z: v.body.pos.z };
      g.step(n);
      let dh = v.body.heading - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      return { dHeadingDeg: +(dh * 180 / Math.PI).toFixed(1), speedKmh: +(v.speedKmh ?? Math.hypot(v.body.vel.x, v.body.vel.z) * 3.6).toFixed(1), x: +v.body.pos.x.toFixed(2), z: +v.body.pos.z.toFixed(2), dx: +(v.body.pos.x - t0.x).toFixed(2), dz: +(v.body.pos.z - t0.z).toFixed(2), onRoad: g.grid.isOnRoad(v.body.pos) };
    }, steps);
    return out;
  };
  const w = await run('KeyW', 180);
  await page.keyboard.down('KeyD');
  const wd = await run('KeyW', 120);
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
  console.log(JSON.stringify({ car: setup.type, start: { x: setup.x0, z: setup.z0 }, afterW3s: w, afterWD2s: wd, lateralOffsetFromLane: +(wd.x - setup.x0).toFixed(2), errors }, null, 1));
} finally { await browser.close(); preview.kill(); }
