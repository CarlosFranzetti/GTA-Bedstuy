// Headless e2e: getting into and OUT of cars with the real keyboard / touch CAR button / gamepad A, in varied situations.
// Regression for "you can't exit the cars": the F press edge used to stay set for every fixed step of a slow frame,
// so the sim exited and re-entered the same car in one frame. This page runs at 1-10 fps under SwiftShader, so every
// frame runs several steps: the old code fails here on the first exit.
//
// Usage: node tests/e2e/enter-exit.mjs [--port 4401] [--skip-build]     (exit code 1 on any failure)
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(argv('--port', 4401));
const log = (...a) => console.log('[enter-exit]', ...a);
if (!args.includes('--skip-build')) { log('building'); execSync('npm run build', { stdio: 'ignore' }); }
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
preview.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const results = [];
const pageErrors = [];
let browser;
const hardStop = setTimeout(() => { console.error('[enter-exit] hard timeout'); preview.kill(); process.exit(2); }, 540_000);

const LAUNCH = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function open(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=low`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  await resume(page);
  await page.evaluate(() => {
    const g = window.__gtaDebug;
    window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; f();
    window.__exits = [];
    g.events.on('exitVehicle', ({ vehicleId }) => {
      const car = g.traffic.vehicles.find((v) => v.id === vehicleId) ?? g.cops.cops.find((v) => v.id === vehicleId);
      const h = car.body.heading, p = g.player.body.pos, c = car.body.pos;
      const fx = Math.sin(h), fz = -Math.cos(h);
      const dx = p.x - c.x, dz = p.z - c.z;
      window.__exits.push({ id: vehicleId, along: Math.abs(dx * fx + dz * fz), across: Math.abs(dx * Math.cos(h) + dz * Math.sin(h)), halfL: car.spec.length / 2, halfW: car.spec.width / 2, speed: Math.abs(car.speed) });
    });
  });
  return page;
}
async function resume(page) {
  const btn = page.getByRole('button', { name: 'Resume' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForTimeout(300);
}
const state = (page) => page.evaluate(() => { const p = window.__gtaDebug.player; return { inV: p.inVehicle, ent: p.isEntering, veh: p.vehicle?.id ?? null, x: p.body.pos.x, z: p.body.pos.z }; });
const waitFrames = (page, n) => page.evaluate((n) => new Promise((res) => { const t = window.__frames + n; const i = setInterval(() => { if (window.__frames >= t) { clearInterval(i); res(); } }, 20); }), n);
const until = (page, pred, arg, timeout = 30_000) => page.waitForFunction(pred, arg, { timeout, polling: 100 }).then(() => true, () => false);

/** Put the player at the driver door of the idx-th parked car (driver === null, at rest) and optionally reposition that car. */
async function approachParked(page, idx, placement) {
  return page.evaluate(({ idx, placement }) => {
    const g = window.__gtaDebug;
    const parked = g.traffic.vehicles.filter((v) => v.driver === null && Math.abs(v.speed) < 0.1);
    const v = parked[(idx * 37) % parked.length];
    if (placement?.wall) {
      // park the car with its driver flank 0.25 m from the nth real building wall (long outward-facing edge near the middle of the map)
      const edges = [];
      for (const b of g.physics.bodies()) {
        if (b.shape.kind !== 'polygon') continue;
        const pts = b.shape.points; let cx = 0, cz = 0;
        for (const q of pts) { cx += q.x; cz += q.z; }
        cx /= pts.length; cz /= pts.length;
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k], c = pts[(k + 1) % pts.length];
          const len = Math.hypot(c.x - a.x, c.z - a.z); if (len < 8) continue;
          const mx = (a.x + c.x) / 2 + b.pos.x, mz = (a.z + c.z) / 2 + b.pos.z;
          let nx = -(c.z - a.z) / len, nz = (c.x - a.x) / len;
          if (((a.x + c.x) / 2 - cx) * nx + ((a.z + c.z) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }
          if (Math.abs(mx) < 300 && Math.abs(mz) < 300) edges.push({ mx, mz, nx, nz, len });
        }
      }
      const e = edges[(placement.wall * 53) % edges.length];
      // heading whose forward runs along the wall, then flip it so the DRIVER (left) door faces the wall
      const setH = (h) => { v.body.heading = h; };
      setH(Math.atan2(-e.nz, -e.nx)); // forward = (sin h, -cos h) = (-nz, nx): along the wall
      const d0 = v.doorPos();
      const toDoor = { x: d0.x - v.body.pos.x, z: d0.z - v.body.pos.z };
      if (toDoor.x * e.nx + toDoor.z * e.nz > 0) setH(v.body.heading + Math.PI); // door must point INTO the wall (-normal)
      v.body.pos.x = e.mx + e.nx * (v.spec.width / 2 + 0.25);
      v.body.pos.z = e.mz + e.nz * (v.spec.width / 2 + 0.25);
      v.body.vel.x = 0; v.body.vel.z = 0;
    }
    if (placement?.neighbour) {
      // another car 0.4 m off the driver flank
      const w = parked.find((o) => o !== v);
      const hd = v.body.heading;
      w.body.heading = hd; w.body.vel.x = 0; w.body.vel.z = 0;
      w.body.pos.x = v.body.pos.x - Math.cos(hd) * (v.spec.width + 0.4);
      w.body.pos.z = v.body.pos.z - Math.sin(hd) * (v.spec.width + 0.4);
    }
    const d = v.doorPos();
    g.teleport(d.x, d.z);
    return v.id;
  }, { idx, placement });
}

function footprintOk(e) { return e.along > e.halfL - 0.01 || e.across > e.halfW + 0.05; }

/** One enter+exit cycle driven by `press` (an async function that triggers one F/CAR/A press). */
async function cycle(name, page, press, { drive = null, wall = 0, neighbour = false, speed = 0, idx = 0 } = {}) {
  const r = { name, ok: false, why: '' };
  results.push(r);
  try {
    const id = await approachParked(page, idx, { wall, neighbour });
    await waitFrames(page, 1);
    const before = await page.evaluate(() => window.__exits.length);
    await press();
    if (!(await until(page, () => window.__gtaDebug.player.inVehicle, null))) { r.why = `never got in (${JSON.stringify(await state(page))})`; return r; }
    if (drive) { await page.keyboard.down('KeyW'); await page.waitForTimeout(drive); }
    if (speed) await page.evaluate((s) => { const v = window.__gtaDebug.player.vehicle; v.body.vel.x = Math.sin(v.body.heading) * s; v.body.vel.z = Math.cos(v.body.heading) * s; }, speed);
    await press();
    if (drive) await page.keyboard.up('KeyW');
    if (!(await until(page, () => !window.__gtaDebug.player.inVehicle, null))) { r.why = 'still in the car after the exit press'; return r; }
    // it must STAY out: no re-entry in the following frames
    await waitFrames(page, 4);
    const s = await state(page);
    if (s.inV || s.ent) { r.why = `re-entered the car (${JSON.stringify(s)})`; return r; }
    const ex = (await page.evaluate((b) => window.__exits.slice(b), before))[0];
    if (!ex) { r.why = 'no exitVehicle event'; return r; }
    if (ex.id !== id) { r.why = `exited ${ex.id}, entered ${id}`; return r; }
    if (!footprintOk(ex)) { r.why = `player inside the car footprint at exit (${JSON.stringify(ex)})`; return r; }
    if (!Number.isFinite(s.x + s.z)) { r.why = 'NaN position'; return r; }
    r.ok = true;
  } catch (e) { r.why = `exception: ${e.message}`; }
  return r;
}

try {
  browser = await chromium.launch({ args: LAUNCH });

  // ---- keyboard (real page.keyboard presses)
  const kb = await open();
  const F = () => kb.keyboard.press('KeyF');
  for (let i = 0; i < 4; i++) await cycle(`kb stationary #${i}`, kb, F, { idx: i });
  await cycle('kb driving (W held ~1.2 s) then exit', kb, F, { idx: 4, drive: 1200 });
  await cycle('kb driving #2', kb, F, { idx: 5, drive: 800 });
  await cycle('kb at speed (14 m/s)', kb, F, { idx: 6, speed: 14 });
  await cycle('kb at speed (22 m/s)', kb, F, { idx: 7, speed: 22 });
  await cycle('kb beside a wall #0', kb, F, { idx: 8, wall: 1 });
  await cycle('kb beside a wall #1', kb, F, { idx: 9, wall: 6 });
  await cycle('kb beside a wall #2', kb, F, { idx: 10, wall: 12 });
  await cycle('kb next to another parked car #0', kb, F, { idx: 11, neighbour: true });
  await cycle('kb next to another parked car #1', kb, F, { idx: 12, neighbour: true });
  // after the pause menu was opened and closed
  await kb.keyboard.press('Escape'); await kb.waitForTimeout(400); await resume(kb);
  await cycle('kb after pause menu #0', kb, F, { idx: 13 });
  await kb.keyboard.press('Escape'); await kb.waitForTimeout(400); await resume(kb);
  await cycle('kb after pause menu #1', kb, F, { idx: 14, drive: 600 });
  // rapid double enter/exit on one car (two cycles back to back)
  await cycle('kb back-to-back #0', kb, F, { idx: 15 });
  await cycle('kb back-to-back #1', kb, F, { idx: 15 });
  await kb.context().close();

  // ---- touch: the on-screen CAR button
  const touch = await open({ hasTouch: true, isMobile: false });
  const car = touch.locator('.tc-btn-car');
  const hasBtn = (await car.count()) > 0;
  if (!hasBtn) results.push({ name: 'touch CAR button present', ok: false, why: 'no .tc-btn-car in the DOM with hasTouch' });
  else {
    const T = async () => { await car.tap(); };
    for (let i = 0; i < 3; i++) await cycle(`touch CAR #${i}`, touch, T, { idx: 20 + i });
    await cycle('touch CAR beside a wall', touch, T, { idx: 24, wall: 3 });
  }
  await touch.context().close();

  // ---- gamepad: standard-mapping fake pad, button A (index 0)
  const padInit = () => {
    window.__pad = { id: 'fake', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  };
  const pad = await open({}, padInit);
  const A = async () => {
    await pad.evaluate(() => { window.__pad.buttons[0] = { pressed: true, touched: true, value: 1 }; });
    await waitFrames(pad, 2);
    await pad.evaluate(() => { window.__pad.buttons[0] = { pressed: false, touched: false, value: 0 }; });
    await waitFrames(pad, 2);
  };
  for (let i = 0; i < 3; i++) await cycle(`gamepad A #${i}`, pad, A, { idx: 30 + i });
  await pad.context().close();
} catch (e) {
  results.push({ name: 'harness', ok: false, why: e.stack ?? e.message });
} finally {
  clearTimeout(hardStop);
  await browser?.close();
  preview.kill();
}

let failed = 0;
for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  <- ' + r.why}`); if (!r.ok) failed++; }
if (pageErrors.length) { console.log('page errors:', pageErrors.slice(0, 5)); failed++; }
console.log(`[enter-exit] ${results.length - failed}/${results.length} cycles ok`);
process.exit(failed || results.length < 20 ? 1 : 0);
