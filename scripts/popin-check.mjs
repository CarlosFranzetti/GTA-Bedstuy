// Pop-in (LOD) check: drives the free camera along Throop Ave and reports every mesh that appears close to the camera.
//
// Usage:  scripts/swarm-render.sh node scripts/popin-check.mjs [--port 4434] [--q low] [--len 80] [--stepm 1] [--radius 60]
//                                    [--near <m>]  override CarLod's near/far switch distance (to test a threshold change)
//                                    [--route throop-north|kosciuszko-east|avenue-drive] [--from-z 50] [--eye 1.7] [--dist <dir>] [--no-build] [--out <file.json>] [--width 640] [--height 360]
//
// Routes (--route, default throop-north; each sets its own start, direction, length, step and walking/driving speed unless overridden):
//   throop-north     walk 80 m north up Throop Ave (x 0) from z 50, one sim step per metre
//   kosciuszko-east  walk 80 m east along the south pavement of Kosciuszko St (z +7) from x 20 at 1.4 m/s (sim runs 43 steps per metre)
//   avenue-drive     Throop Ave at car speed: 200 m north from z 150 at 15 m/s, eye 2.4 m, one frame per 1.5 m (0.1 s of sim)
// The camera starts at (0, eye, from-z) on Throop Ave (x = 0, the N-S street) and walks `len` metres north (-z) in `stepm` steps,
// facing north. The player is teleported along with it so traffic and pedestrians spawn and despawn the way they do in play.
// After every step one frame is drawn by hand (renderOnce) so the culler and CarLod run, then every mesh in the scene is classified:
//
//   drawn  = it and all its ancestors are visible, it has something to draw (InstancedMesh count > 0) and its bounding sphere is in
//            the view frustum (hand-rolled: 64 deg vertical fov as on foot, camera facing north)
//   near   = the world-space bounding box is within `radius` metres of the camera
//
// A mesh is an OFFENDER when, at step n, it is drawn and near, and at step n-1 it was not drawn, and either
//   (a) it was inside the frustum at n-1 but hidden (a visibility switch: CarLod near/far swap, distance culler, spawn toggle), or
//   (b) it did not exist or was outside the frustum at n-1 and its centre is in the middle 80 % of the screen (a spawn or LOD appearing
//       in view; things sliding in at the screen edge are plain frustum entry and are ignored).
// The table lists one row per mesh name (nearest sighting), sorted nearest first. Instanced far cars/peds are single meshes and so
// are never offenders themselves; their near/far swap shows up as the near model's visibility switch.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { port: 4434, q: 'low', len: 80, stepm: 1, radius: 60, fromZ: 50, near: null, eye: 1.7, width: 640, height: 360, route: 'throop-north', speed: null, len0: false, build: true, dist: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--route') o.route = argv[++i];
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--len') { o.len = Number(argv[++i]); o.lenSet = true; }
    else if (a === '--stepm') { o.stepm = Number(argv[++i]); o.stepSet = true; }
    else if (a === '--radius') o.radius = Number(argv[++i]);
    else if (a === '--near') o.near = Number(argv[++i]);
    else if (a === '--from-z') { o.fromZ = Number(argv[++i]); o.fromSet = true; }
    else if (a === '--eye') { o.eye = Number(argv[++i]); o.eyeSet = true; }
    else if (a === '--width') o.width = Number(argv[++i]);
    else if (a === '--height') o.height = Number(argv[++i]);
    else if (a === '--dist') { o.dist = resolve(argv[++i]); o.build = false; }
    else if (a === '--no-build') o.build = false;
    else if (a === '--out') o.out = resolve(argv[++i]);
  }
  return o;
}
const opt = parseArgs(process.argv.slice(2));
const ROUTES = {
  'throop-north': { x: 0, z: 50, dx: 0, dz: -1, len: 80, stepm: 1, speed: null, eye: 1.7, label: 'Throop Ave northbound walk' },
  'kosciuszko-east': { x: 20, z: 7, dx: 1, dz: 0, len: 80, stepm: 1, speed: 1.4, eye: 1.7, label: 'Kosciuszko St eastbound walk (south pavement)' },
  'avenue-drive': { x: 0, z: 150, dx: 0, dz: -1, len: 200, stepm: 1.5, speed: 15, eye: 2.4, label: 'Throop Ave northbound drive at 15 m/s' },
};
const route = ROUTES[opt.route];
if (!route) { console.error('[popin] unknown --route', opt.route, 'try', Object.keys(ROUTES).join(', ')); process.exit(1); }
if (!opt.lenSet) opt.len = route.len;
if (!opt.stepSet) opt.stepm = route.stepm;
if (!opt.eyeSet) opt.eye = route.eye;
if (opt.fromSet) { if (route.dx === 0) route.z = opt.fromZ; else route.x = opt.fromZ; }
opt.fromZ = route.dx === 0 ? route.z : route.x;
const log = (...a) => console.log('[popin]', ...a);

let distDir = opt.dist ?? resolve(ROOT, 'dist');
if (opt.build) {
  distDir = resolve(ROOT, 'node_modules', '.cache', `popin-dist-${opt.port}`);
  mkdirSync(distDir, { recursive: true });
  log('building into', distDir);
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', distDir, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error('[popin] build failed'); process.exit(1); }
}
if (!existsSync(resolve(distDir, 'index.html'))) { console.error(`[popin] no index.html in ${distDir}`); process.exit(1); }

const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', distDir, '--port', String(opt.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
let previewDead = false;
preview.on('exit', () => { previewDead = true; });
const base = `http://localhost:${opt.port}`;
for (let i = 0; i < 80 && !previewDead; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
if (previewDead) { console.error(`[popin] preview server exited (port ${opt.port} busy?)`); process.exit(1); }

const hardStop = setTimeout(() => { console.error('[popin] hard timeout'); preview.kill(); process.exit(2); }, 2_400_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let result = null;
try {
  const page = await browser.newPage({ viewport: { width: opt.width, height: opt.height } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${opt.q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 180_000 });
  await page.mouse.click(opt.width / 2, opt.height / 2);
  await page.waitForTimeout(800);
  const resume = page.getByRole('button', { name: 'Resume' });
  if (await resume.isVisible().catch(() => false)) { await resume.click(); await page.waitForTimeout(300); }

  result = await page.evaluate(async (o) => {
    const d = window.__gtaDebug;
    d.setHour(12);
    d.traffic.setHour?.(12, true);
    d.stopLoop();
    if (o.near) d.carLod.setNearDist(o.near);
    const TAN = Math.tan((64 * Math.PI) / 360); // tan(vfov / 2) of the on-foot camera
    const aspect = o.width / o.height;
    const gl = d.renderer.getContext();
    const nameOf = (m) => {
      const chain = [];
      for (let p = m; p && chain.length < 3; p = p.parent) if (p.name) chain.push(p.name);
      return chain.length ? chain.reverse().join('/') : `(unnamed ${m.geometry?.type ?? 'mesh'})`;
    };
    const visibleChain = (m) => { for (let p = m; p; p = p.parent) if (!p.visible) return false; return true; };
    const classify = (cx, cz) => {
      const seen = new Map();
      d.scene.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingSphere || !g.boundingBox) return;
        m.updateWorldMatrix(true, false);
        const s = g.boundingSphere;
        const c = s.center.clone().applyMatrix4(m.matrixWorld);
        const r = s.radius * m.matrixWorld.getMaxScaleOnAxis();
        // distance from the camera to the world-space bounding box (8 corners)
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        const b = g.boundingBox;
        for (let k = 0; k < 8; k++) {
          const v = b.min.clone();
          if (k & 1) v.x = b.max.x; if (k & 2) v.y = b.max.y; if (k & 4) v.z = b.max.z;
          v.applyMatrix4(m.matrixWorld);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
        }
        const dist = Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1));
        // camera at (cx, eye, cz) facing (dx, dz): depth along it, right = (-dz, dx) (north -> +x, east -> +z)
        const rx = c.x - cx, rz = c.z - cz;
        const depth = rx * o.route.dx + rz * o.route.dz, lat = rx * -o.route.dz + rz * o.route.dx, up = c.y - o.eye;
        const slack = r * 1.5;
        const inFrustum = depth + r > 0.1 && depth - r < 900 && Math.abs(lat) <= depth * TAN * aspect + slack && Math.abs(up) <= depth * TAN + slack;
        const hasItems = !m.isInstancedMesh || m.count > 0;
        if (m.isInstancedMesh) return; // one mesh for many instances (far cars, lamps, blobs): its count changing is not an object appearing
        const drawn = visibleChain(m) && hasItems && inFrustum;
        const ndcX = depth > 0.1 ? lat / (depth * TAN * aspect) : 9, ndcY = depth > 0.1 ? up / (depth * TAN) : 9;
        seen.set(m.uuid, { name: nameOf(m), drawn, inFrustum, dist, mid: Math.abs(ndcX) < 0.8 && Math.abs(ndcY) < 0.8 });
      });
      return seen;
    };

    const steps = Math.round(o.len / o.stepm);
    const offenders = new Map();
    let prev = null;
    let meshCount = 0;
    const calls = [];
    for (let i = 0; i <= steps; i++) {
      const R = o.route;
      const x = R.x + R.dx * i * o.stepm, z = R.z + R.dz * i * o.stepm;
      d.teleport(x, z, Math.atan2(R.dx, -R.dz)); // heading 0 = north
      d.step(R.speed ? Math.max(1, Math.round((o.stepm / R.speed) * 60)) : 1); // real time between frames at the route's speed
      d.setFreeCam(x, o.eye, z, x + R.dx * 20, o.eye, z + R.dz * 20);
      calls.push(d.renderOnce(1, 1 / 60).total); gl.finish();
      const now = classify(x, z);
      meshCount = Math.max(meshCount, now.size);
      if (prev) {
        for (const [id, s] of now) {
          if (!s.drawn || s.dist > o.radius) continue;
          const p = prev.get(id);
          if (p && p.drawn) continue;
          const switched = p && p.inFrustum; // (a) was in view but hidden
          if (!switched && !s.mid) continue; // (b) appearing at the screen edge is just frustum entry
          const row = offenders.get(id);
          if (!row) offenders.set(id, { name: s.name, dist: +s.dist.toFixed(1), step: i, z: R.dx === 0 ? z : x, reason: switched ? 'visibility switch' : p ? 'appeared in view' : 'spawned in view', count: 1 });
          else { row.count++; if (s.dist < row.dist) { row.dist = +s.dist.toFixed(1); row.step = i; row.z = R.dx === 0 ? z : x; } }
        }
      }
      prev = now;
    }
    // one row per name
    const byName = new Map();
    for (const r of offenders.values()) {
      const e = byName.get(r.name + '|' + r.reason);
      if (!e) byName.set(r.name + '|' + r.reason, { ...r, meshes: 1 });
      else { e.meshes++; e.count += r.count; if (r.dist < e.dist) { e.dist = r.dist; e.step = r.step; e.z = r.z; } }
    }
    return { rows: [...byName.values()].sort((a, b) => a.dist - b.dist), steps, meshCount, calls };
  }, { route, len: opt.len, stepm: opt.stepm, radius: opt.radius, fromZ: opt.fromZ, near: opt.near, eye: opt.eye, width: opt.width, height: opt.height });
  await page.close().catch(() => {});
} catch (e) {
  console.error('[popin] FAIL', String(e.message ?? e).slice(0, 500));
  process.exitCode = 1;
} finally {
  clearTimeout(hardStop);
  await browser.close();
  preview.kill();
}

if (result) {
  const { rows, steps, meshCount, calls } = result;
  log(`quality ${opt.q}, ${steps + 1} frames, route ${opt.route} (${route.label}), camera ${route.dx === 0 ? 'z' : 'x'} ${opt.fromZ} -> ${opt.fromZ + (route.dx + route.dz) * opt.len}, eye ${opt.eye} m, radius ${opt.radius} m, up to ${meshCount} meshes`);
  log(`draw calls per frame: min ${Math.min(...calls)}, mean ${Math.round(calls.reduce((a, b) => a + b, 0) / calls.length)}, max ${Math.max(...calls)}${opt.near ? `, CarLod near ${opt.near} m` : ''}`);
  if (!rows.length) console.log('no mesh first appeared within the radius');
  else {
    console.log('\n| # | name | reason | nearest (m) | at step / cam pos | meshes | sightings |');
    console.log('|---|---|---|---|---|---|---|');
    rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.reason} | ${r.dist} | ${r.step} / ${r.z} | ${r.meshes} | ${r.count} |`));
  }
  if (errors.length) console.error('[popin] console errors:', errors.slice(0, 5));
  if (opt.out) { mkdirSync(dirname(opt.out), { recursive: true }); writeFileSync(opt.out, JSON.stringify({ opt, ...result, errors }, null, 2)); log('wrote', opt.out); }
}
