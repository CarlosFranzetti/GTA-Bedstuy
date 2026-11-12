// ANIM: boots the real game (dev server, low tier), hides the canvas, and renders short side-view strips of the player (stand, walk, jog,
// sprint, turn, jump, car in and out) and of pedestrians. Usage (through the queue):
//   scripts/swarm-render.sh node scripts/anim-game.mjs <outDir> [--only walk,jog] [--port 4466] [--w 640] [--h 360] --dist <built game dir>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0]);
mkdirSync(out, { recursive: true });
const port = Number(arg('port', 4466)), W = Number(arg('w', 640)), H = Number(arg('h', 360));
const only = arg('only', 'stand,walk,jog,sprint,turn,jump,car,peds').split(',');
const dist = resolve(arg('dist', 'dist'));
const dev = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const hard = setTimeout(() => { dev.kill(); process.exit(2); }, 9 * 60_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.route('**/ra-api/**', (r) => r.abort());
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.goto(`http://localhost:${port}/?q=low&perf=0`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 280_000 });
  await page.waitForTimeout(3000); // the street pack is a fetch
  const results = await page.evaluate(async (o) => {
    const d = window.__gtaDebug;
    d.stopLoop();
    const canvas = d.renderer.domElement;
    canvas.style.visibility = 'hidden';
    const log = [];
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const release = () => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'AltLeft', 'Space', 'KeyF']) key(c, false); };
    const P = () => d.player;
    const rig = () => P().object3D;
    const camAt = (side = 3.4, lift = 1.0, back = 0) => {
      const p = P().object3D.position, ry = P().object3D.rotation.y;
      const rx = Math.cos(ry), rz = -Math.sin(ry), fx = -Math.sin(ry), fz = -Math.cos(ry);
      d.setFreeCam(p.x + rx * side + fx * back, lift, p.z + rz * side + fz * back, p.x, 0.95, p.z);
    };
    const tiles = [];
    const sheet = (name, cols = 4) => {
      const n = tiles.length, rows = Math.ceil(n / cols), tw = Math.floor(o.w * 0.75), th = Math.floor(o.h * 0.75);
      const c = document.createElement('canvas'); c.width = tw * cols; c.height = th * rows;
      const g = c.getContext('2d');
      tiles.forEach((t, i) => g.drawImage(t, (i % cols) * tw, Math.floor(i / cols) * th, tw, th));
      tiles.length = 0;
      return { name, data: c.toDataURL('image/png') };
    };
    const grab = () => {
      d.renderOnce(1, 1 / 60);
      const t = document.createElement('canvas'); t.width = canvas.width; t.height = canvas.height;
      t.getContext('2d').drawImage(canvas, 0, 0);
      tiles.push(t);
    };
    const sheets = [];
    const info = (tag) => {
      const m = P().model, an = P().anim;
      log.push({ tag, pos: [+P().body.pos.x.toFixed(2), +P().body.pos.z.toFixed(2)], speed: +Math.hypot(P().body.vel.x, P().body.vel.z).toFixed(2), anim: !!an, clips: an ? an.lib.names.length : 0, street: an ? an.lib.has('stumble') : false, legL: m ? +m.legs[0].rotation.x.toFixed(2) : null, rigY: m ? +m.rig.position.y.toFixed(3) : null, stoopBaked: m ? m.torso.userData.stoopBaked ?? null : null });
    };
    const run = async (name, fn) => { if (!o.only.includes(name)) return; try { await fn(); } catch (e) { log.push({ tag: name, error: String(e).slice(0, 200) }); } release(); tiles.length = 0; };
    d.setHour(12);
    d.settle(10);
    const home = { x: P().body.pos.x, z: P().body.pos.z, h: P().body.heading };
    const reset = () => { release(); d.teleport(home.x, home.z, home.h); d.step(30); d.settle(5); };
    // each phase: hold keys, step n sim steps, grab every k steps
    const phase = (frames, every, setup) => { for (let i = 0; i < frames; i++) { if (setup) setup(i); d.step(every); camAt(); grab(); } };

    await run('stand', () => { reset(); info('stand'); phase(8, 12, null); sheets.push(sheet('stand')); });
    await run('walk', () => { reset(); key('KeyW', true); key('AltLeft', true); d.step(40); info('walk'); phase(8, 6, null); sheets.push(sheet('walk')); });
    await run('jog', () => { reset(); key('KeyW', true); d.step(40); info('jog'); phase(8, 5, null); sheets.push(sheet('jog')); });
    await run('sprint', () => { reset(); key('KeyW', true); key('ShiftLeft', true); d.step(50); info('sprint'); phase(8, 4, null); sheets.push(sheet('sprint')); });
    await run('turn', () => { reset(); info('turn0'); key('KeyD', true); phase(8, 5, null); release(); sheets.push(sheet('turn-standing')); reset(); key('KeyW', true); d.step(40); key('KeyW', false); key('KeyD', true); key('KeyW', true); phase(8, 6, null); sheets.push(sheet('turn-moving')); });
    await run('jump', () => { reset(); key('KeyW', true); d.step(30); key('Space', true); d.step(1); key('Space', false); phase(8, 5, null); sheets.push(sheet('jump-running')); reset(); key('Space', true); d.step(1); key('Space', false); phase(8, 5, null); sheets.push(sheet('jump-standing')); });
    await run('car', () => {
      reset();
      const veh = d.physics.bodies().filter((b) => b.kind === 'vehicle' && b.userData && b.userData.doorPos && !b.userData.driver);
      const p0 = P().body.pos;
      veh.sort((x, y) => Math.hypot(x.pos.x - p0.x, x.pos.z - p0.z) - Math.hypot(y.pos.x - p0.x, y.pos.z - p0.z));
      const v = veh[0]?.userData;
      if (!v) { log.push({ tag: 'car', error: 'no parked vehicle found' }); return; }
      const door = v.doorPos();
      const dx = door.x - v.body.pos.x, dz = door.z - v.body.pos.z, dl = Math.hypot(dx, dz);
      d.teleport(door.x + (dx / dl) * 0.9, door.z + (dz / dl) * 0.9, Math.atan2(-dx, dz));
      d.step(20); d.settle(5);
      info('car-start');
      log.push({ tag: 'car', type: v.spec.type, h: v.spec.height, w: v.spec.width });
      const cam = (side = 3.6) => { const q = P().object3D.position; const ox = dx / dl, oz = dz / dl; d.setFreeCam(v.body.pos.x + ox * (side + 1), 1.0, v.body.pos.z + oz * (side + 1), v.body.pos.x + ox * 0.6, 0.8, v.body.pos.z + oz * 0.6); };
      key('KeyF', true); d.step(1); key('KeyF', false);
      for (let i = 0; i < 12; i++) { d.step(4); cam(); grab(); }
      sheets.push(sheet('car-in', 4));
      d.step(40); info('car-seated');
      key('KeyF', true); d.step(1); key('KeyF', false);
      for (let i = 0; i < 12; i++) { d.step(4); cam(); grab(); }
      sheets.push(sheet('car-out', 4));
    });
    await run('peds', () => {
      reset();
      const peds = d.physics.bodies().filter((b) => b.kind === 'ped');
      log.push({ tag: 'peds', total: peds.length });
      if (!peds.length) return;
      let best = peds[0], bc = -1;
      for (const p of peds) { const c = peds.filter((q) => Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 10).length; if (c > bc) { bc = c; best = p; } }
      d.teleport(best.pos.x + 7, best.pos.z, 0);
      log.push({ tag: 'peds-cluster', count: bc });
      for (let i = 0; i < 8; i++) {
        d.step(18);
        const near = peds.filter((q) => Math.hypot(q.pos.x - best.pos.x, q.pos.z - best.pos.z) < 8);
        let cx = 0, cz = 0; for (const q of near) { cx += q.pos.x; cz += q.pos.z; } cx /= near.length; cz /= near.length;
        d.setFreeCam(cx + 6, 2.2, cz + 6, cx, 1.0, cz);
        grab();
      }
      sheets.push(sheet('peds-wide', 4));
    });
    return { sheets, log };
  }, { w: W, h: H, only });
  for (const s of results.sheets) writeFileSync(`${out}/${s.name}.png`, Buffer.from(s.data.split(',')[1], 'base64'));
  console.log(JSON.stringify(results.log, null, 1));
} finally { clearTimeout(hard); await browser.close(); dev.kill(); }
if (errors.length) console.error('page errors', errors.slice(0, 8));
