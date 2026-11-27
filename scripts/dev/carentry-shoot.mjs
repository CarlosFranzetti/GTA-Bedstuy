// CARENTRY: get into and out of cars in the RUNNING game and record every frame from the key press to the settled view, plus a strip of small pictures
// (every 3rd frame) for two cases. Canvas hidden, simulation stepped by hand, software rendering: never read frames per second from this.
//   VITE_HOSTED=1 npx vite build --outDir <dist> --emptyOutDir
//   scripts/swarm-render.sh node scripts/dev/carentry-shoot.mjs <outDir> --dist <dist> [--map real|grid] [--port 4489] [--noframes] [--types sedan,suv,boxtruck,bus]
// Writes <outDir>/carentry-<tag>.json (every frame of every case, the lens against the car's box and the near plane), the two strips
// <outDir>/strip-A.jpg and strip-B.jpg and a one-line summary on stdout. The game's own key path is used (a real F press through the Input class).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'carentry-out'); mkdirSync(out, { recursive: true });
const port = Number(arg('port', 4489)), map = arg('map', 'real'), dist = resolve(arg('dist', 'dist')), tag = arg('tag', 'run');
const noFrames = a.includes('--noframes');
const wantTypes = arg('types', 'sedan,suv,boxtruck,bus').split(',');
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const hard = setTimeout(() => { console.log('timed out'); srv.kill(); process.exit(2); }, 25 * 60_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = []; const report = { tag, cases: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return h === 'localhost' || h === '127.0.0.1' ? r.continue() : r.abort(); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/?perf=0&q=low&map=${map}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 15 * 60_000 });
  await page.evaluate(() => { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; });
  await page.waitForTimeout(2000); await page.keyboard.press('Space'); await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.__gtaDebug; d.stopLoop(); d.setHour(15); d.step(120); try { d.tutorial?.skip?.(); } catch { /* none */ } });

  // which car types stand still within reach of the start: one per wanted type (else the nearest parked cars)
  const cars = await page.evaluate((wantTypes) => {
    const d = window.__gtaDebug, pp = d.player.body.pos;
    const all = (d.traffic.vehicles ?? []).filter((v) => v.body && v.spec && Math.hypot(v.body.vel.x, v.body.vel.z) < 0.2 && v.driver == null);
    const by = {};
    for (const v of all) { const t = v.spec.type; const dd = Math.hypot(v.body.pos.x - pp.x, v.body.pos.z - pp.z); if (!by[t] || dd < by[t].dd) by[t] = { id: v.id, type: t, dd, len: v.spec.length }; }
    window.__ceCars = by;
    return Object.values(by).sort((p, q) => p.dd - q.dd).map((c) => ({ id: c.id, type: c.type, dd: +c.dd.toFixed(0), len: c.len }));
  }, wantTypes);
  report.availableTypes = cars;
  const pick = (t) => cars.find((c) => c.type === t);
  const chosen = wantTypes.map(pick).filter(Boolean);
  if (!chosen.length) chosen.push(...cars.slice(0, 3));
  const cases = [];
  for (const c of chosen) for (const style of ['classic', 'modern']) for (const approach of ['driver', 'passenger', 'behind']) cases.push({ car: c, style, approach });

  const runCase = async (cs, pics) => {
    await page.evaluate(({ cs }) => {
      const d = window.__gtaDebug, v = (d.traffic.vehicles).find((x) => x.id === cs.car.id), h = v.body.heading, W = v.spec.width, L = v.spec.length;
      const rx = Math.cos(h), rz = Math.sin(h), fx = Math.sin(h), fz = -Math.cos(h); // right, forward of the car
      const gap = 0.8, door = W / 2 + 0.3 + gap;
      let x = v.body.pos.x, z = v.body.pos.z, hp = 0;
      if (cs.approach === 'driver') { x -= rx * door; z -= rz * door; hp = h + Math.PI / 2; }
      else if (cs.approach === 'passenger') { x += rx * door; z += rz * door; hp = h - Math.PI / 2; }
      else { x -= fx * (L / 2 + 1.2); z -= fz * (L / 2 + 1.2); hp = h; }
      d.cam.setStyle(cs.style); d.clearFreeCam();
      if (d.player.vehicle) d.player.exit();
      d.teleport(x, z, hp); d.step(20); d.settle(150);
    }, { cs });
    const frames = [], shots = [];
    const grab = async (label, render) => page.evaluate(({ render }) => {
      const d = window.__gtaDebug;
      if (render) { d.step(1); d.renderOnce(); } else { d.step(1); d.settle(1); }
      const v = (d.player.vehicle ?? (d.traffic.vehicles ?? []).find((x) => x.id === window.__ceCar));
      const p = d.cam.camera.position, c = v ? { x: v.body.pos.x, z: v.body.pos.z, h: v.body.heading, l: v.spec.length, w: v.spec.width, hh: v.spec.height } : null;
      let url = null;
      if (render) { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; cv.getContext('2d').drawImage(d.renderer.domElement, 0, 0, 320, 180); url = cv.toDataURL('image/jpeg', 0.8); }
      return { lens: [p.x, p.y, p.z], cut: !!d.cam.snappedThisFrame, inVehicle: !!d.player.vehicle, entering: !!d.player.isEntering, camVeh: d.player.camVehicle ? true : null, body: [d.player.body.pos.x, d.player.body.pos.z], car: c, url };
    }, { render });
    await page.evaluate((id) => { window.__ceCar = id; }, cs.car.id);
    const step = async (n, phase) => { for (let i = 0; i < n; i++) { const idx = frames.length; const render = pics && !noFrames && idx % 3 === 0; const f = await grab(phase, render); f.phase = phase; f.idx = idx; frames.push(f); if (f.url) shots.push({ idx, phase, url: f.url }); delete f.url; } };
    await step(6, 'pre');
    await page.keyboard.press('KeyF'); await step(75, 'enter');
    await step(25, 'drive');
    await page.keyboard.press('KeyF'); await step(60, 'exit');
    return { frames, shots };
  };

  // metrics from the frames (the lens against the car's box and the near plane)
  const NEAR = 0.2;
  const analyse = (frames) => {
    let inCar = 0, near = 0, maxSpeed = 0, firstIn = -1, cuts = 0, drive = -1, press = 6, settledEnter = -1;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], c = f.car;
      if (f.cut) cuts++;
      if (drive < 0 && f.inVehicle) drive = i;
      if (c) {
        const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = -fz, rz = fx, dx = f.lens[0] - c.x, dz = f.lens[2] - c.z;
        const al = dx * fx + dz * fz, ac = dx * rx + dz * rz;
        const ex = Math.max(Math.abs(al) - c.l / 2, 0), ez = Math.max(Math.abs(ac) - c.w / 2, 0), ey = Math.max(0.05 - f.lens[1], f.lens[1] - c.hh, 0);
        const dist = Math.hypot(ex, ez, ey);
        if (dist === 0) { inCar++; if (firstIn < 0) firstIn = i; }
        if (dist < NEAR + 0.05) near++;
      }
      if (i > 0) { const g = frames[i - 1]; if (!f.cut) maxSpeed = Math.max(maxSpeed, Math.hypot(f.lens[0] - g.lens[0], f.lens[1] - g.lens[1], f.lens[2] - g.lens[2]) * 60); }
    }
    // settled: lens speed under 0.5 m/s relative to nothing (the car is parked) for 15 frames after the press
    let run = 0; for (let i = press + 1; i < frames.length; i++) { const g = frames[i - 1], f = frames[i]; const s = Math.hypot(f.lens[0] - g.lens[0], f.lens[1] - g.lens[1], f.lens[2] - g.lens[2]) * 60; run = s < 0.5 ? run + 1 : 0; if (run >= 15) { settledEnter = (i - 14 - press) / 60; break; } }
    return { framesInCarBox: inCar, firstInCarBox: firstIn, framesNearClip: near, cutFrames: cuts, pressToDrive: drive >= 0 ? (drive - press) / 60 : null, maxLensSpeedOutsideCuts: +maxSpeed.toFixed(1), settledAfter: settledEnter };
  };

  const stripCases = [0, Math.max(0, cases.length - 2)]; // A: the first car, classic, driver; B: the last car, classic, passenger... (see report.strips)
  let k = 0;
  for (const cs of cases) {
    const isStrip = [cases.findIndex((c) => c.style === 'classic' && c.approach === 'driver'), cases.findIndex((c, i) => c.style === 'modern' && c.approach === 'passenger' && c.car.id === chosen[chosen.length - 1].id)].includes(k);
    const label = isStrip ? (cases.findIndex((c) => c.style === 'classic' && c.approach === 'driver') === k ? 'A' : 'B') : null;
    const r = await runCase(cs, isStrip);
    report.cases.push({ car: cs.car.type, style: cs.style, approach: cs.approach, strip: label, ...analyse(r.frames), frames: r.frames });
    if (label) {
      const th = r.shots.map((s) => Buffer.from(s.url.split(',')[1], 'base64'));
      const cols = 6, rows = Math.ceil(th.length / cols);
      const comp = await sharp({ create: { width: cols * 320, height: rows * 180, channels: 3, background: '#000' } })
        .composite(await Promise.all(th.map(async (b, i) => ({ input: await sharp(b).extend({ bottom: 0 }).toBuffer(), left: (i % cols) * 320, top: Math.floor(i / cols) * 180 })))).jpeg({ quality: 85 }).toBuffer();
      writeFileSync(`${out}/strip-${label}.jpg`, comp);
      report.strips = { ...(report.strips ?? {}), [label]: { car: cs.car.type, style: cs.style, approach: cs.approach, frameIndices: r.shots.map((s) => s.idx), phases: r.shots.map((s) => s.phase) } };
    }
    k++;
  }
} catch (e) { errors.push('script: ' + String(e).slice(0, 400)); }
report.errors = errors;
writeFileSync(`${out}/carentry-${tag}.json`, JSON.stringify(report));
console.log(JSON.stringify({ tag, availableTypes: report.availableTypes, strips: report.strips, errors, cases: report.cases.map(({ frames, ...r }) => r) }, null, 1));
clearTimeout(hard); await browser.close(); srv.kill(); process.exit(errors.length ? 1 : 0);
