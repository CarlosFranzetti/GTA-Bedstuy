// Flicker metric: renders consecutive frames by hand (renderOnce) in three scenarios and reports
//   pixel flicker  = share of pixels whose colour jumps by > T between two frames and jumps back (A,B,A) -- grain excluded by T
//   mesh flicker   = meshes (and InstancedMeshes, including their frustum-cull verdict) whose drawn state changes more than once per run
// Scenarios: still (camera fixed), dolly (0.05 m per frame), pan (1.5 degrees per frame after a 400 m teleport, which also exposes stale
// InstancedMesh bounding spheres).
// Usage: scripts/swarm-render.sh node scripts/flicker-check.mjs --dist <dir> [--q medium] [--dpr 2] [--frames 40] [--port 4461] [--w 400] [--h 225]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const dist = resolve(arg('dist', 'dist')), q = arg('q', 'medium'), dpr = Number(arg('dpr', 2)), frames = Number(arg('frames', 40)), port = Number(arg('port', 4461));
const w = Number(arg('w', 400)), h = Number(arg('h', 225));
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const hard = setTimeout(() => { preview.kill(); process.exit(2); }, 2_400_000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${base}/?q=${q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 240_000 });
  await page.mouse.click(w / 2, h / 2); await page.waitForTimeout(500);
  const resume = page.getByRole('button', { name: 'Resume' });
  if (await resume.isVisible().catch(() => false)) { await resume.click(); await page.waitForTimeout(300); }
  const out = await page.evaluate(async (o) => {
    const d = window.__gtaDebug; const THREE = null;
    d.setHour(12); d.traffic.setHour?.(12, true); d.stopLoop();
    const canvas = document.querySelector('canvas.game') || document.querySelector('canvas');
    const cw = canvas.width, ch = canvas.height;
    const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    const T = 12;
    const cam = (x, z, yaw) => { d.setFreeCam(x, 1.7, z, x + Math.sin(yaw) * 20, 1.7, z - Math.cos(yaw) * 20); };
    const scene = d.scene;
    const camObj = d.cam.camera;
    const frustum = (() => { const f = new (camObj.constructor === undefined ? Object : Object)(); return null; })();
    const run = async (name, pose) => {
      const n = cw * ch;
      let p1 = null, p2 = null;
      const tog = new Uint8Array(n), chg = new Uint8Array(n);
      const state = new Map(); // uuid -> { last, flips, name }
      const drawn = [];
      for (let f = 0; f < o.frames; f++) {
        const [x, z, yaw] = pose(f);
        cam(x, z, yaw);
        d.teleport(x, z, yaw);
        d.renderOnce(1, 1 / 60);
        ctx.drawImage(canvas, 0, 0);
        const px = ctx.getImageData(0, 0, cw, ch).data;
        // mesh drawn states (visible chain, instanced count, frustum verdict of the live camera)
        camObj.updateMatrixWorld(true);
        const m4 = camObj.projectionMatrix.clone().multiply(camObj.matrixWorldInverse);
        const fr = new (d.cam.camera.frustumClass ?? Object)();
        let drawnCount = 0;
        const planes = (() => { // frustum planes from m4 (column-major elements)
          const e = m4.elements, pl = [];
          const mk = (a, b, c, dd) => { const l = Math.hypot(a, b, c); pl.push([a / l, b / l, c / l, dd / l]); };
          mk(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]); mk(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);
          mk(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]); mk(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);
          mk(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]); mk(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);
          return pl;
        })();
        scene.traverse((m) => {
          if (!m.isMesh || m.isSkinnedMesh) return;
          let vis = true; for (let p = m; p; p = p.parent) if (!p.visible) { vis = false; break; }
          if (vis && m.isInstancedMesh && m.count === 0) vis = false;
          if (vis && m.frustumCulled && m.isInstancedMesh) {
            if (m.boundingSphere === null) m.computeBoundingSphere();
            const s = m.boundingSphere; if (s.radius < 0) vis = false;
            else {
              const c = s.center.clone().applyMatrix4(m.matrixWorld), r = s.radius * m.matrixWorld.getMaxScaleOnAxis();
              for (const pl of planes) if (pl[0] * c.x + pl[1] * c.y + pl[2] * c.z + pl[3] < -r) { vis = false; break; }
            }
          }
          let nm = ''; for (let p = m, k = 0; p && k < 2; p = p.parent) if (p.name) { nm = p.name + (nm ? '/' + nm : ''); k++; }
          const st = state.get(m.uuid);
          if (!st) state.set(m.uuid, { last: vis, flips: 0, name: nm || m.geometry.type });
          else { if (st.last !== vis) st.flips++; st.last = vis; }
          if (vis) drawnCount++;
        });
        drawn.push(drawnCount);
        if (p1) {
          let changed = 0;
          for (let i = 0; i < n; i++) {
            const j = i * 4;
            const dd = Math.max(Math.abs(px[j] - p1[j]), Math.abs(px[j + 1] - p1[j + 1]), Math.abs(px[j + 2] - p1[j + 2]));
            if (dd > T) {
              chg[i] = Math.min(255, chg[i] + 1); changed++;
              if (p2) {
                const d2 = Math.max(Math.abs(px[j] - p2[j]), Math.abs(px[j + 1] - p2[j + 1]), Math.abs(px[j + 2] - p2[j + 2]));
                if (d2 <= T / 2) tog[i] = Math.min(255, tog[i] + 1);
              }
            }
          }
        }
        p2 = p1; p1 = new Uint8ClampedArray(px);
        if (f % 8 === 7) await new Promise((r) => setTimeout(r, 0));
      }
      let togPx = 0, chgPx = 0;
      for (let i = 0; i < n; i++) { if (tog[i] > 0) togPx++; if (chg[i] > 0) chgPx++; }
      const flippers = [...state.values()].filter((s) => s.flips >= 2).sort((a, b) => b.flips - a.flips);
      const byName = new Map();
      for (const s of flippers) { const e = byName.get(s.name) ?? { name: s.name, meshes: 0, maxFlips: 0 }; e.meshes++; e.maxFlips = Math.max(e.maxFlips, s.flips); byName.set(s.name, e); }
      return { name, pixels: n, toggledPct: +(100 * togPx / n).toFixed(3), changedPct: +(100 * chgPx / n).toFixed(3), flipFlopMeshes: flippers.length, anyFlipMeshes: [...state.values()].filter((s) => s.flips >= 1).length, drawnMin: Math.min(...drawn), drawnMax: Math.max(...drawn), top: [...byName.values()].sort((a, b) => b.maxFlips - a.maxFlips).slice(0, 8) };
    };
    const res = [];
    // first frame at the spawn (this is where the instance culler compacts first), then the scenarios on Throop Ave
    d.renderOnce(1, 1 / 60);
    const X0 = 0, Z0 = 50;
    res.push(await run('still', () => [X0, Z0, 0]));
    res.push(await run('dolly', (f) => [X0, Z0 - f * 0.05, 0]));
    res.push(await run('pan-far', (f) => [X0 + 4, Z0 + 350, (f - o.frames / 2) * 0.026]));
    return { w: cw, h: ch, dpr: window.devicePixelRatio, ratio: d.renderer.getPixelRatio(), res };
  }, { frames });
  console.log(JSON.stringify({ q, dist, errors, ...out }, null, 1));
} catch (e) { console.error('[flicker] FAIL', String(e.message ?? e).slice(0, 600)); process.exitCode = 1; }
finally { clearTimeout(hard); await browser.close(); preview.kill(); }
