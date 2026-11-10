// Real-browser frame bench: per-frame dt, camera pose, hitch attribution while walking, driving (with turns) and getting in/out.
// Usage: scripts/swarm-render.sh node scripts/playtest/framebench.mjs <outJson> [--port 4432] [--profile phone|desktop] [--secs 20] [--throttle 4]
//   phone   = 844x390, touch emulation, ?q=phone, real touch events through CDP, CPU throttle
//   desktop = 1280x720, ?q=low, keyboard
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const out = resolve(argv[0] ?? 'framebench.json');
const opt = { port: 4432, profile: 'phone', secs: 20, throttle: 4 };
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--port') opt.port = Number(argv[++i]);
  else if (argv[i] === '--profile') opt.profile = argv[++i];
  else if (argv[i] === '--secs') opt.secs = Number(argv[++i]);
  else if (argv[i] === '--throttle') opt.throttle = Number(argv[++i]);
}
const phone = opt.profile === 'phone';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dist = join(dirname(out), `.dist-${opt.port}`);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });
cpSync(join(ROOT, 'dist'), dist, { recursive: true });
const preview = spawn('node', [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dist, '--port', String(opt.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${opt.port}/`)).ok) break; } catch { /* wait */ } await sleep(250); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone
  ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }
  : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

const INIT = () => {
  window.__fb = { frames: [], marks: [], long: [], phase: 'boot', sect: {}, cam: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__fb.long.push([e.startTime, e.duration, window.__fb.phase]); }).observe({ entryTypes: ['longtask'] });
};
await page.addInitScript(INIT);
await page.goto(`http://localhost:${opt.port}/?q=${phone ? 'phone' : 'low'}&perf=0`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 300000 });
await page.mouse.click(phone ? 400 : 640, 200);
await sleep(800);
const resume = page.getByRole('button', { name: 'Resume' });
if (await resume.isVisible().catch(() => false)) await resume.click();
await sleep(500);

await page.evaluate(() => {
  const d = window.__gtaDebug, fb = window.__fb;
  // capture the camera the pipeline renders with
  const r = d.renderer, orig = r.render.bind(r);
  r.render = (s, c) => { if (c && c.isPerspectiveCamera) fb.cam = c; return orig(s, c); };
  // per-section timers (attribute hitches)
  const wrap = (obj, name, label) => {
    const f = obj?.[name]; if (typeof f !== 'function') return;
    obj[name] = function (...a) { const t = performance.now(); const v = f.apply(this, a); fb.sect[label] = (fb.sect[label] ?? 0) + performance.now() - t; return v; };
  };
  wrap(d.physics, 'step', 'physics'); wrap(d.traffic, 'update', 'traffic'); wrap(d.cops, 'update', 'cops'); wrap(d.culler, 'update', 'culler');
  wrap(d.pipeline, 'render', 'render'); wrap(d.carLod, 'place', 'carLod'); wrap(d.weather, 'update', 'weather'); wrap(d.sky, 'update', 'sky');
  wrap(d.nightLights, 'attachHeadlights', 'headlights'); wrap(d.proxies, 'endFrame', 'proxies');
  let last = performance.now();
  const tick = (now) => {
    const dt = now - last; last = now;
    const c = fb.cam; let pose = null;
    if (c) { const e = c.matrixWorld.elements; pose = [c.position.x, c.position.y, c.position.z, Math.atan2(-e[8], -e[10]), c.fov]; }
    fb.frames.push([now, dt, pose, d.player.inVehicle ? 1 : 0, d.player.body.pos.x, d.player.body.pos.z, fb.phase, { ...fb.sect }]);
    fb.sect = {};
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opt.throttle });

const setPhase = (p) => page.evaluate((x) => { window.__fb.phase = x; }, p);
// ---- input helpers
const stickC = phone ? await page.evaluate(() => { const r = document.querySelector('.tc-stick')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }) : null;
let touchDown = false;
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
async function stick(x, y) { // x right, y forward (-1..1); radius 56 px
  if (!phone) return;
  const p = [{ x: stickC.x + x * 50, y: stickC.y - y * 50, id: 1 }];
  if (!touchDown) { await touch('touchStart', p); touchDown = true; } else await touch('touchMove', p);
}
async function stickUp() { if (phone && touchDown) { await touch('touchEnd', []); touchDown = false; } }
const keys = new Set();
async function key(k, on) { if (phone) return; if (on && !keys.has(k)) { keys.add(k); await page.keyboard.down(k); } else if (!on && keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } }
async function tapCar() {
  if (phone) { await page.evaluate(() => document.querySelector('.tc-btn-car')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); }
  else { await page.keyboard.press('KeyF'); }
}
async function lookDrag(dx) { // right-side look drag (phone) / injected mouse delta (desktop)
  if (phone) {
    const y = 200, x0 = 560;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...(touchDown ? [{ x: stickC.x + 0, y: stickC.y, id: 1 }] : []), { x: x0, y, id: 2 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...(touchDown ? [{ x: stickC.x, y: stickC.y, id: 1 }] : []), { x: x0 + (dx * i) / 6, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: touchDown ? [{ x: stickC.x, y: stickC.y, id: 1 }] : [] });
  }
}
const run = async (secs, f) => { const t0 = Date.now(); let i = 0; while ((Date.now() - t0) / 1000 < secs) { await f(i++, (Date.now() - t0) / 1000); await sleep(100); } };

// ---- scenario 1: walk 20 s (forward, with direction changes and look drags)
await page.evaluate(() => window.__gtaDebug.teleport(9, 20, 0));
await sleep(1500);
await setPhase('walk');
await run(opt.secs, async (i, t) => {
  const ph = Math.floor(t / 4) % 4;
  const dirs = [[0, 1], [0.7, 0.7], [0, 1], [-0.7, 0.7]][ph];
  if (phone) await stick(dirs[0], dirs[1]); else { await key('KeyW', true); await key('KeyD', dirs[0] > 0); await key('KeyA', dirs[0] < 0); }
  if (i % 15 === 7) await lookDrag(phone ? 40 : 0);
});
await stickUp(); for (const k of [...keys]) await key(k, false);

// ---- scenario 2: enter a car, drive with turns, exit
const car = await page.evaluate(() => {
  const d = window.__gtaDebug; const p = d.player.body.pos;
  let best = null, bd = 1e9;
  for (const v of d.traffic.vehicles) { if (v.driver) continue; const dd = Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z); if (dd < bd) { bd = dd; best = v; } }
  if (!best) return null;
  const f = best.doorPos(); d.teleport(f.x, f.z + 0.5); return { id: best.id, x: best.body.pos.x, z: best.body.pos.z };
});
await sleep(800);
await setPhase('enter');
await tapCar(); await sleep(2500);
const inCar = await page.evaluate(() => window.__gtaDebug.player.inVehicle);
await setPhase('drive');
await run(opt.secs, async (i, t) => {
  const steer = Math.sin(t * 0.9) * 0.8;
  if (phone) await stick(steer, 1); else { await key('KeyW', true); await key('KeyD', steer > 0.3); await key('KeyA', steer < -0.3); }
  if (i % 20 === 10) await lookDrag(phone ? 60 : 0);
});
await stickUp(); for (const k of [...keys]) await key(k, false);
await setPhase('brake'); await sleep(1500);
await setPhase('exit');
await tapCar(); await sleep(2500);
const outCar = await page.evaluate(() => !window.__gtaDebug.player.inVehicle);
await setPhase('walk2');
await run(4, async () => { if (phone) await stick(0, 1); else await key('KeyW', true); });
await stickUp(); for (const k of [...keys]) await key(k, false);

const data = await page.evaluate(() => ({ frames: window.__fb.frames, long: window.__fb.long }));
const res = { opt, inCar, outCar, car, errs, frames: data.frames, long: data.long };
writeFileSync(out, JSON.stringify(res));
await browser.close(); preview.kill(); rmSync(dist, { recursive: true, force: true });
console.log('wrote', out, data.frames.length, 'frames');
