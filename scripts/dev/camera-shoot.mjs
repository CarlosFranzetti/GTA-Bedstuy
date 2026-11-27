// Pictures of the game's own camera (no free camera): on foot and in a car, Classic and Modern, so the lead can look at framing.
//   VITE_HOSTED=1 npx vite build --outDir <dist> --emptyOutDir
//   scripts/swarm-render.sh node scripts/dev/camera-shoot.mjs <outDir> --dist <dist> [--map grid|real] [--port 4488]
// Canvas hidden, simulation stepped by hand, software rendering: never read frames per second from this.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'camera-shoot-out'); mkdirSync(out, { recursive: true });
const port = Number(arg('port', 4488)), map = arg('map', 'real'), dist = resolve(arg('dist', 'dist'));
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const hard = setTimeout(() => { console.log('timed out'); srv.kill(); process.exit(2); }, 20 * 60_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = []; const report = { shots: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return h === 'localhost' || h === '127.0.0.1' ? r.continue() : r.abort(); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/?perf=0&q=low&map=${map}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 15 * 60_000 });
  await page.evaluate(() => { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; });
  await page.waitForTimeout(2000); await page.keyboard.press('Space'); await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.__gtaDebug; d.stopLoop(); d.setHour(15); d.step(120); try { d.tutorial?.skip?.(); } catch { /* none */ } });
  const shot = async (name, style, steps) => {
    const r = await page.evaluate(({ style, steps }) => {
      const d = window.__gtaDebug; d.cam.setStyle(style); d.clearFreeCam();
      for (let i = 0; i < steps; i++) { d.step(1); d.settle(1); }
      d.settle(240); d.renderOnce();
      const c = d.cam.camera ?? d.cam.cam ?? null, b = (d.player.vehicle ? d.player.vehicle.body : d.player.body).pos;
      const p = c ? c.position : null;
      return { url: d.renderer.domElement.toDataURL('image/jpeg', 0.9), inCar: !!d.player.vehicle, lens: p ? { back: +Math.hypot(p.x - b.x, p.z - b.z).toFixed(2), up: +p.y.toFixed(2), fov: c.fov } : null };
    }, { style, steps });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    report.shots.push({ name, inCar: r.inCar, lens: r.lens });
  };
  await shot('foot-classic', 'classic', 30);
  await shot('foot-modern', 'modern', 30);
  report.enter = await page.evaluate(() => {
    const d = window.__gtaDebug, list = (d.traffic.vehicles ?? d.traffic.cars ?? []).map((v) => v.vehicle ?? v).filter((v) => v && v.body);
    const pp = d.player.body.pos; list.sort((x, y) => Math.hypot(x.body.pos.x - pp.x, x.body.pos.z - pp.z) - Math.hypot(y.body.pos.x - pp.x, y.body.pos.z - pp.z));
    const v = list[0]; if (!v) return 'no car';
    const h = v.body.heading; d.player.body.pos.x = v.body.pos.x + Math.cos(h) * 1.6; d.player.body.pos.z = v.body.pos.z - Math.sin(h) * 1.6;
    const got = d.player.tryEnter([v]); d.step(90);
    return got ? 'entered ' + (v.spec?.id ?? v.type ?? '') : 'tryEnter refused';
  });
  await shot('car-classic', 'classic', 30);
  await shot('car-modern', 'modern', 30);
} catch (e) { errors.push('script: ' + String(e).slice(0, 400)); }
report.errors = errors; console.log(JSON.stringify(report, null, 1));
clearTimeout(hard); await browser.close(); srv.kill(); process.exit(errors.length ? 1 : 0);
