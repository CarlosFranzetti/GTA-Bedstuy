// Exploratory QA through window.__gtaDebug (headless SwiftShader): NaN scan, block corners, enter/exit near walls,
// driving into every intersection, floating / sunken prop scan. Writes <outDir>/explore.json (+ optional PNGs).
//
// Usage:  node tests/e2e/explore.mjs <outDir> [--port 4310] [--dist <dir>] [--q low] [--shots]
// A private build is made into <outDir>/.dist unless --dist is given (e.g. the .dist of a screens.mjs run).
// Exit code 1 when any finding is reported.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const o = { port: 4310, q: 'low', dist: null, shots: false, rest: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--port') o.port = Number(process.argv[++i]);
  else if (a === '--q') o.q = process.argv[++i];
  else if (a === '--dist') o.dist = resolve(process.argv[++i]);
  else if (a === '--shots') o.shots = true;
  else o.rest.push(a);
}
const OUT = resolve(o.rest[0] ?? 'qa-explore');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[explore]', ...a);

let distDir = o.dist;
if (!distDir) {
  distDir = resolve(OUT, '.dist');
  log('building into', distDir);
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', distDir, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error('[explore] build failed'); process.exit(1); }
}
if (!existsSync(resolve(distDir, 'index.html'))) { console.error(`[explore] no index.html in ${distDir}`); process.exit(1); }

const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', distDir, '--port', String(o.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
let previewDead = false;
preview.on('exit', () => { previewDead = true; });
const base = `http://localhost:${o.port}`;
for (let i = 0; i < 80 && !previewDead; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
if (previewDead) { console.error(`[explore] preview server exited (port ${o.port} busy?)`); process.exit(1); }

const errors = [];
const findings = [];
const report = { date: new Date().toISOString(), checks: {}, findings, errors };
const add = (check, severity, msg, data) => findings.push({ check, severity, msg, ...(data ? { data } : {}) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const hardStop = setTimeout(() => { console.error('[explore] hard timeout'); preview.kill(); process.exit(2); }, 2_400_000);
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${o.q}&perf=0`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 240_000 });
  await page.mouse.click(320, 180);
  await page.waitForTimeout(800);
  const resume = page.getByRole('button', { name: 'Resume' });
  if (await resume.isVisible().catch(() => false)) await resume.click();
  await page.evaluate(() => { window.__gtaDebug.setHour(12); window.__gtaDebug.step(5); });

  // ------------------------------------------------------------------ 1. block corners
  report.checks.corners = await page.evaluate(() => {
    const d = window.__gtaDebug;
    const out = { tested: 0, bad: [] };
    const fin = (n) => Number.isFinite(n);
    const scan = () => {
      const bad = [];
      const chk = (id, b) => { if (!fin(b.pos.x) || !fin(b.pos.z) || !fin(b.vel.x) || !fin(b.vel.z) || !fin(b.heading)) bad.push(id); };
      chk('player', d.player.body);
      for (const v of d.traffic.vehicles) chk(v.id, v.body);
      for (const p of d.traffic.peds) chk(p.id, p.body);
      for (const c of d.cops.cops) chk(c.id, c.body);
      return bad;
    };
    const pts = [];
    for (const b of d.grid.blocks) {
      const cx = b.curb.reduce((s, p) => s + p.x, 0) / b.curb.length;
      const cz = b.curb.reduce((s, p) => s + p.z, 0) / b.curb.length;
      for (const [name, poly, inset] of [['curb', b.curb, -1.0], ['buildingLine', b.buildingLine, 0.4]]) {
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i];
          const dx = cx - p.x, dz = cz - p.z, l = Math.hypot(dx, dz) || 1;
          // curb corners: step 1 m OUTWARD onto the sidewalk side of the kerb is the road; stand 1 m inside on the sidewalk
          pts.push({ id: `${b.id}:${name}:${i}`, x: p.x + (dx / l) * (name === 'curb' ? 1.0 : inset), z: p.z + (dz / l) * (name === 'curb' ? 1.0 : inset) });
        }
      }
    }
    for (const p of pts) {
      d.teleport(p.x, p.z, 0);
      d.step(20);
      out.tested++;
      const b = d.player.body;
      const moved = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      const nan = scan();
      if (nan.length) out.bad.push({ at: p.id, nan });
      else if (moved > 1.5) out.bad.push({ at: p.id, pushed: +moved.toFixed(2), msg: 'player pushed out of a collider at spawn (corner inside geometry?)' });
    }
    return out;
  });
  if (report.checks.corners.bad.length) add('corners', 'P2', `${report.checks.corners.bad.length} block corner(s) with NaN bodies or a spawn inside a collider`, report.checks.corners.bad.slice(0, 20));

  // ------------------------------------------------------------------ 2. scene scan: NaN transforms, floating / sunken props
  report.checks.scene = await page.evaluate(() => {
    const d = window.__gtaDebug;
    const fin = (n) => Number.isFinite(n);
    const nan = [];
    const stats = {};
    const odd = { floating: [], sunken: [] };
    const groupOf = (o) => { let g = o; let name = ''; while (g) { if (g.name) name = g.name; if (g.parent === d.scene || !g.parent) break; g = g.parent; } return name || '(unnamed)'; };
    const ancestorNames = (o) => { const n = []; let g = o; while (g) { if (g.name) n.push(g.name); g = g.parent; } return n.join('<'); };
    d.scene.updateMatrixWorld(true);
    let meshes = 0;
    d.scene.traverse((o) => {
      const p = o.position, s = o.scale;
      if (!fin(p.x) || !fin(p.y) || !fin(p.z) || !fin(s.x) || !fin(s.y) || !fin(s.z)) { nan.push(ancestorNames(o).slice(0, 80)); return; }
      const e = o.matrixWorld.elements;
      for (let i = 0; i < 16; i++) if (!fin(e[i])) { nan.push('matrixWorld ' + ancestorNames(o).slice(0, 80)); return; }
      if (!o.isMesh) return;
      meshes++;
      const g = groupOf(o);
      stats[g] = (stats[g] ?? 0) + 1;
      const geo = o.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (!bb || !fin(bb.min.y) || !fin(bb.max.y)) { nan.push('bbox ' + ancestorNames(o).slice(0, 80)); return; }
      // world Y extent of the bbox (instanced: per instance, capped)
      const yRange = (m) => {
        const me = m.elements;
        let lo = Infinity, hi = -Infinity;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          const wy = me[1] * x + me[5] * y + me[9] * z + me[13];
          if (wy < lo) lo = wy; if (wy > hi) hi = wy;
        }
        return [lo, hi];
      };
      const names = ancestorNames(o);
      const propLike = /prop|furniture|signal|lamp|tree|street/i.test(names);
      if (!propLike) return;
      if (o.isInstancedMesh) {
        const m = new o.matrixWorld.constructor();
        const im = new o.matrixWorld.constructor();
        for (let i = 0; i < Math.min(o.count, 4000); i++) {
          o.getMatrixAt(i, im);
          for (let k = 0; k < 16; k++) if (!fin(im.elements[k])) { nan.push(`instance ${i} of ${names.slice(0, 60)}`); return; }
          m.multiplyMatrices(o.matrixWorld, im);
          const [lo, hi] = yRange(m);
          if (lo > 1.2) odd.floating.push({ where: names.slice(0, 60), i, minY: +lo.toFixed(2) });
          if (hi < 0.02 && hi > -5) odd.sunken.push({ where: names.slice(0, 60), i, maxY: +hi.toFixed(2) });
        }
      } else {
        const [lo, hi] = yRange(o.matrixWorld);
        if (lo > 1.2) odd.floating.push({ where: names.slice(0, 60), minY: +lo.toFixed(2) });
        if (hi < 0.02 && hi > -5) odd.sunken.push({ where: names.slice(0, 60), maxY: +hi.toFixed(2) });
      }
    });
    return { meshes, groups: stats, nan: nan.slice(0, 40), nanCount: nan.length, floating: odd.floating.slice(0, 40), floatingCount: odd.floating.length, sunken: odd.sunken.slice(0, 40), sunkenCount: odd.sunken.length };
  });
  if (report.checks.scene.nanCount) add('scene', 'P1', `${report.checks.scene.nanCount} object(s) with non-finite transforms`, report.checks.scene.nan);
  if (report.checks.scene.floatingCount) add('scene', 'P3', `${report.checks.scene.floatingCount} prop mesh(es) with minY > 1.2 m (floating?)`, report.checks.scene.floating);
  if (report.checks.scene.sunkenCount) add('scene', 'P3', `${report.checks.scene.sunkenCount} prop mesh(es) entirely below ground`, report.checks.scene.sunken);

  // ------------------------------------------------------------------ 3. enter / exit near walls
  report.checks.enterExit = await page.evaluate(() => {
    const d = window.__gtaDebug;
    const fin = (n) => Number.isFinite(n);
    const parked = d.traffic.vehicles.filter((v) => v.driver === null);
    const out = { tested: 0, bad: [] };
    const stride = Math.max(1, Math.floor(parked.length / 40));
    for (let i = 0; i < parked.length && out.tested < 40; i += stride) {
      const v = parked[i];
      const before = { x: v.body.pos.x, z: v.body.pos.z };
      const door = v.doorPos();
      d.teleport(door.x - Math.sin(v.body.heading) * 0.8, door.z + Math.cos(v.body.heading) * 0.8, 0);
      d.step(3);
      const got = d.player.tryEnter([v]);
      if (!got) { out.bad.push({ car: v.id, msg: 'tryEnter refused at the door' }); out.tested++; continue; }
      d.step(40);
      if (!d.player.inVehicle) { out.bad.push({ car: v.id, msg: 'did not get in within 0.7 s' }); out.tested++; continue; }
      d.step(10);
      d.player.exit();
      d.step(30);
      out.tested++;
      const b = d.player.body;
      if (!fin(b.pos.x) || !fin(b.pos.z)) { out.bad.push({ car: v.id, msg: 'NaN after exit' }); continue; }
      const away = Math.hypot(b.pos.x - v.body.pos.x, b.pos.z - v.body.pos.z);
      if (away > 4) out.bad.push({ car: v.id, msg: `player ${away.toFixed(1)} m from the car after exit (ejected?)` });
      const moved = Math.hypot(v.body.pos.x - before.x, v.body.pos.z - before.z);
      if (moved > 1.5) out.bad.push({ car: v.id, msg: `car moved ${moved.toFixed(1)} m during enter/exit` });
    }
    return out;
  });
  if (report.checks.enterExit.bad.length) add('enterExit', 'P2', `${report.checks.enterExit.bad.length} enter/exit anomaly(ies)`, report.checks.enterExit.bad.slice(0, 20));

  // ------------------------------------------------------------------ 4. drive into every intersection (holding W)
  await page.evaluate(() => { const d = window.__gtaDebug; d.teleport(9, 20, 0); d.step(5); });
  const ints = await page.evaluate(() => window.__gtaDebug.grid.intersections.map((i) => ({ id: i.id, x: i.center.x, z: i.center.z, ns: i.nsStreetId, ew: i.ewStreetId })));
  const drive = { tested: 0, bad: [] };
  // get a car first
  const gotCar = await page.evaluate(() => {
    const d = window.__gtaDebug;
    const v = d.traffic.vehicles.find((q) => q.driver === null && Math.hypot(q.body.pos.x - d.player.body.pos.x, q.body.pos.z - d.player.body.pos.z) < 60);
    if (!v) return false;
    const door = v.doorPos();
    d.teleport(door.x - Math.sin(v.body.heading) * 0.8, door.z + Math.cos(v.body.heading) * 0.8, 0);
    d.step(3);
    d.player.tryEnter([v]);
    d.step(40);
    return d.player.inVehicle;
  });
  if (!gotCar) add('drive', 'P2', 'could not enter a parked car to drive into the intersections');
  else {
    await page.keyboard.down('KeyW');
    for (const it of ints) {
      const res = await page.evaluate((it) => {
        const d = window.__gtaDebug;
        const car = d.player.vehicle;
        // approach from the south heading north and from the west heading east: 30 m out, 8 m/s
        const runs = [];
        for (const [ox, oz, h] of [[0, 30, 0], [-30, 0, Math.PI / 2], [0, -30, Math.PI], [30, 0, -Math.PI / 2]]) {
          d.teleport(it.x + ox, it.z + oz, h);
          car.body.vel.x = Math.sin(h) * 8; car.body.vel.z = -Math.cos(h) * 8;
          let minSp = Infinity, nan = false, passed = false;
          for (let s = 0; s < 360; s++) {
            d.step(1);
            const p = car.body.pos;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(car.body.heading)) { nan = true; break; }
            if (Math.hypot(p.x - it.x, p.z - it.z) < 6) passed = true;
            if (s > 30) minSp = Math.min(minSp, Math.abs(car.speed));
          }
          runs.push({ h, nan, passed, minSp: +minSp.toFixed(2), end: [+car.body.pos.x.toFixed(1), +car.body.pos.z.toFixed(1)], damage: +car.damage.toFixed(2) });
        }
        return runs;
      }, it);
      drive.tested++;
      for (const r of res) {
        if (r.nan) drive.bad.push({ at: it.id, msg: 'NaN while driving', run: r });
        else if (!r.passed) drive.bad.push({ at: it.id, msg: 'car never reached the intersection (blocked 30 m out?)', run: r });
      }
    }
    await page.keyboard.up('KeyW');
  }
  report.checks.drive = drive;
  if (drive.bad.length) add('drive', 'P2', `${drive.bad.length} approach run(s) blocked or NaN across ${drive.tested} intersections`, drive.bad.slice(0, 20));

  // ------------------------------------------------------------------ optional screenshots at suspect spots
  if (o.shots) {
    const spots = [['intersection-throop-kosciuszko', -14, 4, 12, 0, -2, -6], ['corner-wide', 20, 6, 30, 0, 1, 0]];
    for (const [name, x, y, z, lx, ly, lz] of spots) {
      await page.evaluate((a) => { const d = window.__gtaDebug; d.setFreeCam(...a); d.settle(60); }, [x, y, z, lx, ly, lz]);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 300_000 });
    }
  }
} catch (e) {
  add('harness', 'P1', `explore script failed: ${String(e.message ?? e).slice(0, 300)}`);
} finally {
  clearTimeout(hardStop);
  writeFileSync(`${OUT}/explore.json`, JSON.stringify(report, null, 2));
  await browser.close();
  preview.kill();
}
log(`${findings.length} finding(s), ${errors.length} console error(s); report in ${OUT}/explore.json`);
for (const f of findings) log(`${f.severity} ${f.check}: ${f.msg}`);
process.exitCode = findings.length ? 1 : 0;
