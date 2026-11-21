// MAP4 boot and frame probe of the real map. Run through scripts/swarm-render.sh (one page per run, hosted build).
//   node scripts/map4-probe.mjs --dist <hosted dist dir> --port 4471 --q low --out <dir>/<tag> [--shots north,east,...] [--map] [--noshots]
// Writes <out>.json (boot wall time, JS heap, world stats, triangles and draw calls at the spawn and at each shot) and <out>-<shot>.png.
// Counts only (SwiftShader): never read frame rates from it. The WebGL canvas is hidden (memory), frames are read with toDataURL.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const dist = resolve(arg('--dist')), port = Number(arg('--port', 4471)), q = arg('--q', 'low'), out = resolve(arg('--out', 'probe'));
const mapParam = a.includes('--grid') ? '' : 'map=real&';
const W = Number(arg('--w', 640)), H = Number(arg('--h', 360));
const shots = (arg('--shots', '') || '').split(',').filter(Boolean);
mkdirSync(dirname(out), { recursive: true });
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: resolve(dirname(new URL(import.meta.url).pathname), '..'), stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const res = { q, errors: [], shots: {} };
const save = () => writeFileSync(`${out}.json`, JSON.stringify(res, null, 1));
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u) || u.startsWith('data:') || u.startsWith('blob:')) r.continue(); else r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => res.errors.push(String(e).slice(0, 300)));
  let bytes = 0; const files = [];
  page.on('response', async (r) => { try { const b = (await r.body()).length; bytes += b; files.push([r.url().replace(base, ''), b]); } catch {} });
  const t0 = Date.now();
  await page.goto(`${base}/?${mapParam}q=${q}&perf=0`, { waitUntil: 'load', timeout: 240_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 600_000 });
  res.bootWallMs = Date.now() - t0;
  await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(600);
  const dismiss = async () => { const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } };
  await dismiss();
  await page.keyboard.press('Space'); await page.waitForTimeout(800); await dismiss();
  await page.evaluate(() => { window.__gtaDebug.stopLoop(); const c = window.__gtaDebug.renderer.domElement; c.style.visibility = 'hidden'; if (window.__gtaChunkCuller) window.__gtaChunkCuller.buildsPerUpdate = 1e9; });
  res.bootBytes = bytes; res.bootFiles = files.filter((f) => f[1] > 40_000).sort((x, y) => y[1] - x[1]).slice(0, 12);
  const mem = () => page.evaluate(() => { try { window.gc?.(); } catch {} const m = performance.memory; return m ? { usedMB: Math.round(m.usedJSHeapSize / 1048576), totalMB: Math.round(m.totalJSHeapSize / 1048576) } : null; });
  res.heapAfterBoot = await mem();
  res.world = await page.evaluate(() => { const rw = window.__gtaRealWorld?.(); return rw ? { stats: rw.stats, nodes: rw.net.nodes.length, edges: rw.net.edges.length, blocks: rw.net.blocks.length, lots: rw.lots.length, standIns: rw.standIns, bounds: rw.net.bounds } : null; });
  res.spawn = await page.evaluate(() => { const d = window.__gtaDebug; d.setHour(12); d.step(5); let i; for (let k = 0; k < 4; k++) i = d.renderOnce(1, 1 / 60); return { calls: i.total, triangles: i.triangles, scene: i.scene, sceneTris: i.sceneTris }; });
  save();
  const SPOTS = JSON.parse(arg('--spots', '{}'));
  for (const name of shots) {
    const sp = SPOTS[name]; if (!sp) continue;
    const r = await page.evaluate(async (sp) => {
      const d = window.__gtaDebug, rw = window.__gtaRealWorld();
      const h = rw.net.nearestEdge({ x: sp.x, z: sp.z }, 300);
      const p = h ? h.point : { x: sp.x, z: sp.z }, dir = h ? h.dir : { x: 1, z: 0 };
      const sgn = sp.flip ? -1 : 1;
      d.teleport(p.x, p.z); d.step(60);
      for (let k = 0; k < sp.steps; k++) { d.step(30); }
      const cx = p.x - dir.x * 7 * sgn, cz = p.z - dir.z * 7 * sgn;
      d.setFreeCam(cx, sp.h ?? 3.2, cz, p.x + dir.x * 40 * sgn, 1.5, p.z + dir.z * 40 * sgn);
      rw.streamer.settle(p.x, p.z, 3);
      d.settle(30);
      let info; for (let k = 0; k < 4; k++) info = d.renderOnce(1, 1 / 60);
      const c = d.renderer.domElement;
      const url = c.toDataURL('image/png');
      return { at: p, street: h ? rw.net.edges[h.edge].name : null, calls: info.total, triangles: info.triangles, url };
    }, sp);
    const png = r.url.split(',')[1]; delete r.url;
    writeFileSync(`${out}-${name}.png`, Buffer.from(png, 'base64'));
    res.shots[name] = { ...r, heap: await mem() };
    console.log(name, JSON.stringify(res.shots[name]));
    save();
  }
  if (a.includes('--map')) {
    await page.evaluate(() => { window.__gtaDebug.map.open(); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}-map.png` });
    for (let z = 0; z < 0; z++) {}
  }
  res.heapEnd = await mem();
  save();
} finally { save(); await browser.close(); preview.kill(); }
console.log(JSON.stringify({ q, boot: res.bootWallMs, heap: res.heapAfterBoot, spawn: res.spawn, stats: res.world?.stats, errors: res.errors }));
