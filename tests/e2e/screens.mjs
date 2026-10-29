// Headless capture of the 7 standard review viewpoints (SwiftShader WebGL) plus a JSON of window.__gtaStats per frame.
//
// Usage:  node tests/e2e/screens.mjs <outDir> [--port 4310] [--q low] [--width 640] [--height 360]
//                                    [--dist <dir>]      serve an existing build instead of building one
//                                    [--no-build]        serve ./dist as it is
//                                    [--label <text>]    free text stored in stats.json (stage / commit)
//                                    [--resume]          keep frames already listed in <outDir>/stats.json (after a crashed run)
//                                    [--hud]             live loop + page screenshot (with HUD; ~3x the memory, slower)
//
// By default a PRIVATE build is made into <outDir>/.dist so a concurrent `npm run build` by another lane cannot
// swap the files under the browser. Outputs in <outDir>:
//   1-noon-street.png  2-noon-corner.png  3-golden-aerial.png  4-dusk-car.png
//   5-night-car.png    6-night-corner.png 7-morning-signals.png
//   stats.json   { label, url, viewport, errors[], frames: [{ name, hour, stats }], ... }
//
// Viewpoints (metres, +x east, +z south; heading 0 = north) come from Fable's 7-viewpoint check-in capture.
// The pause menu opens on the first click (pointer-lock fails headless), so it is dismissed via the Resume button.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const o = { port: 4310, q: 'low', width: 640, height: 360, build: true, dist: null, label: '', hud: false, resume: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--width') o.width = Number(argv[++i]);
    else if (a === '--height') o.height = Number(argv[++i]);
    else if (a === '--dist') { o.dist = resolve(argv[++i]); o.build = false; }
    else if (a === '--no-build') o.build = false;
    else if (a === '--label') o.label = argv[++i];
    else if (a === '--hud') o.hud = true;
    else if (a === '--resume') o.resume = true;
    else rest.push(a);
  }
  o.out = resolve(rest[0] ?? 'qa-screens');
  return o;
}

const opt = parseArgs(process.argv.slice(2));
mkdirSync(opt.out, { recursive: true });
const log = (...a) => console.log('[screens]', ...a);

let distDir = opt.dist ?? resolve(ROOT, 'dist');
if (opt.build) {
  distDir = resolve(opt.out, '.dist');
  log('building into', distDir);
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', distDir, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error('[screens] build failed'); process.exit(1); }
}
if (!existsSync(resolve(distDir, 'index.html'))) { console.error(`[screens] no index.html in ${distDir}; run a build first`); process.exit(1); }

const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', distDir, '--port', String(opt.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
let previewDead = false;
preview.on('exit', () => { previewDead = true; });
const base = `http://localhost:${opt.port}`;
for (let i = 0; i < 80 && !previewDead; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
if (previewDead) { console.error(`[screens] preview server exited (port ${opt.port} busy?)`); process.exit(1); }

const errors = [];
const frames = [];
if (opt.resume && existsSync(`${opt.out}/stats.json`)) {
  try { for (const f of JSON.parse(readFileSync(`${opt.out}/stats.json`, 'utf8')).frames) if (existsSync(`${opt.out}/${f.name}.png`)) frames.push(f); } catch { /* start fresh */ }
  log(`resuming with ${frames.length} frame(s)`);
}
const hardStop = setTimeout(() => { console.error('[screens] hard timeout'); preview.kill(); process.exit(2); }, 2_400_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
async function capture() {
  const page = await browser.newPage({ viewport: { width: opt.width, height: opt.height } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  try {
    const url = `${base}/?q=${opt.q}&perf=0`;
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 180_000 });
    await page.mouse.click(opt.width / 2, opt.height / 2); // the first click tries pointer lock and opens the pause menu
    await page.waitForTimeout(800);

    const dismiss = async () => {
      const b = page.getByRole('button', { name: 'Resume' });
      if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
    };
    await dismiss();

    const dbg = (fn, arg) => page.evaluate(fn, arg);
    const hour = (h) => dbg((h) => { window.__gtaDebug.setHour(h); window.__gtaDebug.step(5); }, h);
    const freeCam = (a) => dbg((a) => window.__gtaDebug.setFreeCam(...a), a);
    // Default ("manual") mode stops the rAF loop and draws frames by hand with renderOnce(): a headless SwiftShader
    // renderer otherwise grows by ~10-20 MB/s (RSS 0.5 -> 3+ GB in 3 minutes) and gets OOM-killed when other jobs
    // share the machine. Manual frames are deterministic and read straight from the canvas (no HUD).
    // `--hud` keeps the live loop and takes a page screenshot (includes the HUD, needs more memory and time).
    if (!opt.hud) await dbg(() => { window.__gtaDebug.stopLoop(); window.__gtaDebug.renderer.getContext().finish(); });
    const shot = async (name, h) => {
      if (frames.some((f) => f.name === name)) return; // captured by an earlier attempt
      await dismiss();
      await dbg(() => window.__gtaDebug.settle(120));
      let stats, method = 'canvas';
      const sim = await dbg(() => {
        const d = window.__gtaDebug;
        const b = d.player.vehicle ? d.player.vehicle.body : d.player.body;
        return { player: { x: b.pos.x, z: b.pos.z, heading: b.heading, inVehicle: !!d.player.vehicle }, traffic: d.traffic.vehicles.length, agents: d.traffic.agentCount, peds: d.traffic.peds.length, cops: d.cops.cops.length, stars: d.wanted.stars };
      });
      if (opt.hud) {
        method = 'page';
        await page.waitForTimeout(1800);
        stats = await dbg(() => ({ ...(window.__gtaStats ?? {}) }));
        await page.screenshot({ path: `${opt.out}/${name}.png`, timeout: 150_000 });
      } else {
        const r = await dbg((n) => {
          const d = window.__gtaDebug;
          let info = null; const t0 = performance.now();
          const gl = d.renderer.getContext();
          for (let i = 0; i < n; i++) { info = d.renderOnce(1, 1 / 60); gl.finish(); } // a few frames so exposure / TAA history settle; finish() drains SwiftShader's command backlog
          const frameMs = (performance.now() - t0) / n;
          return { info, frameMs, data: d.renderer.domElement.toDataURL('image/png'), stats: { ...(window.__gtaStats ?? {}) } };
        }, 4);
        writeFileSync(`${opt.out}/${name}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
        stats = { ...r.stats, renderOnce: r.info, frameMs: +r.frameMs.toFixed(1), drawCalls: r.info.total, triangles: r.info.triangles };
      }
      frames.push({ name, hour: h, method, stats, sim });
      log(name, JSON.stringify({ drawCalls: stats.drawCalls, triangles: stats.triangles, frameMs: stats.frameMs }));
    };

    await dbg(() => { const d = window.__gtaDebug; d.teleport(9, 20, 0); d.step(10); });
    await hour(12); await shot('1-noon-street', 12);
    await freeCam([-18, 2.5, 34, 6, 5, 12]); await shot('2-noon-corner', 12);
    await freeCam([40, 30, 60, 0, 2, 0]); await hour(17.5); await shot('3-golden-aerial', 17.5);
    await dbg(() => { const d = window.__gtaDebug; d.clearFreeCam(); d.teleport(6.2, 27.4); d.step(3); d.player.tryEnter([...d.traffic.vehicles, ...d.cops.cops]); d.step(40); });
    await hour(19.3); await shot('4-dusk-car', 19.3);
    await hour(22); await shot('5-night-car', 22);
    await freeCam([-18, 2.5, 34, 6, 5, 12]); await shot('6-night-corner', 22);
    await freeCam([-6, 3, -4, 0, 2, -30]); await hour(9); await shot('7-morning-signals', 9);
  } finally {
    await page.close().catch(() => {});
  }
}
try {
  // a page can crash when several headless browsers fight over the CPU/RAM: retry the capture up to 8 times (frames already taken are kept)
  for (let attempt = 1; attempt <= 8; attempt++) {
    try { await capture(); failed = false; break; }
    catch (e) {
      failed = true;
      console.error(`[screens] attempt ${attempt} FAIL`, String(e.message ?? e).slice(0, 400));
    }
  }
} finally {
  clearTimeout(hardStop);
  writeFileSync(`${opt.out}/stats.json`, JSON.stringify({
    label: opt.label, url: `/?q=${opt.q}&perf=0`, viewport: { width: opt.width, height: opt.height },
    date: new Date().toISOString(), errors, frames,
  }, null, 2));
  await browser.close();
  preview.kill();
}
log(`${frames.length}/7 frames, ${errors.length} console errors, output in ${opt.out}`);
if (errors.length) console.error('[screens] console errors:', errors.slice(0, 5));
process.exitCode = failed || frames.length < 7 ? 1 : 0;
