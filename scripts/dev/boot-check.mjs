// Boot check and street frames of the real game (the lead's pre-deploy check; rebuilt 23 Nov after the scratch copy was lost).
// Serves a BUILT game, boots it headless with the canvas hidden, starts play, steps the simulation by hand and reports what a
// deploy needs to know: page errors, non-finite matrices, people and cars alive, triangles and draw calls. It also photographs the
// player and the nearest pedestrians from about 2.6 m, front and back, so the lead can look at people in the running game.
//
//   VITE_HOSTED=1 npx vite build --outDir <dist> --emptyOutDir
//   scripts/swarm-render.sh node scripts/dev/boot-check.mjs <outDir> --dist <dist> [--mode desktop|phone] [--map grid|real]
//                                                                    [--q low] [--port 4477] [--peds 6] [--hour 15] [--noframes]
// --noframes skips the pictures: on this box reading a frame back from the phone-sized grid page runs the container out of
// memory (the live build of 22 Nov does the same), so the phone grid boot is checked without them.
// Rendering here is in software: never read frames per second from this. Exit code 1 when the boot is not clean.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(a[0] ?? 'boot-check-out');
mkdirSync(out, { recursive: true });
const port = Number(arg('port', 4477)), mode = arg('mode', 'desktop'), map = arg('map', ''), q = arg('q', mode === 'phone' ? '' : 'low');
const nPeds = Number(arg('peds', 6)), hour = Number(arg('hour', 15)), dist = resolve(arg('dist', 'dist'));
const tag = `${mode}-${map || 'default'}`;
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const hard = setTimeout(() => { console.log(JSON.stringify({ tag, fatal: 'timed out after 20 minutes' })); srv.kill(); process.exit(2); }, 20 * 60_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const errors = [], warnings = [];
let report = { tag };
try {
  const ctx = await browser.newContext(mode === 'phone' ? { ...devices['iPhone 13'] } : { viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return h === 'localhost' || h === '127.0.0.1' ? r.continue() : r.abort(); });
  page.on('console', (m) => { const t = m.text().slice(0, 300); if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(t)) errors.push(t); else if (m.type() === 'warning' && /NaN|non-finite|computed min\/max/i.test(t)) warnings.push(t); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  const qs = ['perf=0', q ? `q=${q}` : '', map ? `map=${map}` : ''].filter(Boolean).join('&');
  await page.goto(`http://localhost:${port}/?${qs}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 15 * 60_000 });
  await page.evaluate(() => { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; });
  await page.waitForTimeout(2500);
  const p0 = await page.evaluate(() => { const b = window.__gtaDebug.player.body.pos; return { x: b.x, z: b.z }; });
  if (mode === 'phone') await page.touchscreen.tap(195, 420); else await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  const splashGone = await page.evaluate(() => { const e = document.querySelector('.hud-splash'); return !e || getComputedStyle(e).display === 'none' || e.classList.contains('fading') || Number(getComputedStyle(e).opacity) < 0.05; });
  report = { ...report, ...(await page.evaluate(({ hour }) => {
    const d = window.__gtaDebug; d.stopLoop(); d.setHour(hour); d.step(150); d.settle(30);
    const r = d.renderOnce();
    let meshes = 0, bad = 0;
    d.scene.traverse((o) => { if (o.isMesh) { meshes++; const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) { bad++; break; } } });
    const pp = d.player.body.pos, peds = (d.traffic.peds ?? d.traffic.pedestrians ?? []);
    const near = (r0) => peds.filter((p) => p.body && Math.hypot(p.body.pos.x - pp.x, p.body.pos.z - pp.z) < r0).length;
    return { meshes, nonFiniteMatrices: bad, triangles: r.triangles, draws: r.total, peds: peds.length, pedsWithin150m: near(150), vehicles: (d.traffic.vehicles ?? d.traffic.cars ?? []).length, quality: String(d.perf?.quality ?? '') };
  }, { hour })) };
  report.splashGone = splashGone;
  const heap = () => page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  report.heapMB = { afterStep: await heap() };
  const p1 = await page.evaluate(() => { const b = window.__gtaDebug.player.body.pos; return { x: b.x, z: b.z }; });
  report.playerMovedM = Math.round(Math.hypot(p1.x - p0.x, p1.z - p0.z) * 100) / 100;
  // frames: the player and the nearest pedestrians, front and back, from about 2.6 m at chest height
  if (a.includes('--noframes')) throw 'noframes';
  const list = await page.evaluate(({ nPeds }) => {
    const d = window.__gtaDebug, pp = d.player.body.pos, peds = (d.traffic.peds ?? []);
    const out = [{ name: 'player', x: pp.x, z: pp.z, h: d.player.body.heading ?? 0, y: 0.15, info: '' }];
    const near = peds.filter((p) => p.body).map((p) => ({ p, dd: Math.hypot(p.body.pos.x - pp.x, p.body.pos.z - pp.z) })).sort((a0, b0) => a0.dd - b0.dd).slice(0, nPeds);
    near.forEach(({ p }, i) => out.push({ name: `ped${i + 1}`, x: p.body.pos.x, z: p.body.pos.z, h: p.body.heading ?? 0, y: 0.15, info: `${p.spec?.id ?? ''} ${p.spec?.age ?? ''} ${p.spec?.sex ?? ''}` }));
    return out;
  }, { nPeds });
  report.frames = [];
  const save = (name, info, url) => { const f = `${out}/${tag}-${name}.jpg`; writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); report.frames.push(`${f}${info ? '  (' + info.trim() + ')' : ''}`); };
  for (const s of list) for (const [view, k] of [['front', 1], ['back', -1]]) {
    report.lastStep = `${s.name}-${view}`;
    const url = await page.evaluate(({ s, k }) => {
      const d = window.__gtaDebug, fx = Math.sin(s.h) * k, fz = Math.cos(s.h) * k;
      d.setFreeCam(s.x + fx * 2.6 + fz * 0.5, s.y + 1.25, s.z + fz * 2.6 - fx * 0.5, s.x, s.y + 0.95, s.z);
      d.renderOnce();
      return d.renderer.domElement.toDataURL('image/jpeg', 0.9);
    }, { s, k });
    save(`${s.name}-${view}`, s.info, url);
    report.heapMB[`${s.name}-${view}`] = await heap();
  }
  report.lastStep = 'view';
  save('view', '', await page.evaluate(() => { const d = window.__gtaDebug; d.clearFreeCam(); d.renderOnce(); return d.renderer.domElement.toDataURL('image/jpeg', 0.9); }));
  report.heapMB.end = await heap(); report.lastStep = 'done';
} catch (e) { if (e !== 'noframes') errors.push('script: ' + String(e).slice(0, 400)); }
report.errors = errors; report.nanWarnings = warnings;
report.clean = errors.length === 0 && warnings.length === 0 && report.nonFiniteMatrices === 0 && report.splashGone === true;
console.log(JSON.stringify(report, null, 1));
writeFileSync(`${out}/${tag}.json`, JSON.stringify(report, null, 1));
clearTimeout(hard); await browser.close(); srv.kill();
process.exit(report.clean ? 0 : 1);
