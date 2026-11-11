// CREDITS lane: clean in-engine frames of OUR world for the title / loading art (graded by scripts/title-art-grade.py, no filters).
// Usage: node scripts/title-art-shots.mjs <outDir> --dist dist [--port 4461] [--only a,b]   (run through scripts/swarm-render.sh)
// Each shot: player teleported near the target so the chunks stream in, the sim stepped, then a free camera [cx,cy,cz, lx,ly,lz].
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'title-art'); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4461)); const dist = resolve(arg('--dist', 'dist')); const only = arg('--only', '');
const W = Number(arg('--width', 1600)), H = Number(arg('--height', 900));
// streets: ns avenues at x = -250 (Tompkins), 0 (Throop), 250 (Garvey), 500 (Lewis); ew at z = -200 Hart, -100 Pulaski, 0 Kosciuszko, 100 Lafayette; the el runs over Flushing Ave z=-500 (x 375..875)
const SHOTS = [
  // the el with a train, golden hour, from the street looking west
  { name: 'el-a', hour: 18.4, at: [700, -490], el: 12, cam: [735, 1.7, -493, 640, 7.5, -503] },
  { name: 'el-b', hour: 18.4, at: [600, -490], el: 40, cam: [640, 1.5, -496, 540, 8, -502] },
  { name: 'el-c', hour: 18.6, at: [560, -490], el: 70, cam: [520, 1.4, -506, 600, 9, -500] },
  // skyline / avenue looks
  { name: 'ave-a', hour: 18.4, at: [0, 40], cam: [2.5, 2.6, 60, 0, 14, -90] },
  { name: 'ave-b', hour: 18.6, at: [250, 40], cam: [255, 1.6, 70, 250, 11, -110] },
  { name: 'ave-c', hour: 18.2, at: [-250, 40], cam: [-244, 4.5, 40, -250, 12, -150] },
  // stoop rows in warm light
  { name: 'stoop-a', hour: 18.7, at: [60, 0], cam: [30, 1.2, 3.8, 110, 3.2, -2] },
  { name: 'stoop-b', hour: 18.9, at: [-120, 0], cam: [-90, 1.0, -3.8, -170, 3.4, 2] },
  { name: 'stoop-c', hour: 18.5, at: [120, -100], cam: [90, 1.3, -96, 170, 3.4, -103] },
  // wet night street
  { name: 'wet-a', hour: 21.8, wet: true, at: [-60, 100], cam: [-70, 1.4, 104, 40, 3.2, 98] },
  { name: 'wet-b', hour: 22.3, wet: true, at: [0, 60], cam: [4, 1.3, 75, 0, 4.5, -60] },
  { name: 'wet-c', hour: 21.4, wet: true, at: [300, 100], cam: [350, 1.5, 96, 250, 3, 103] },
];
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${arg('--q', 'medium')}&perf=0`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 1_200_000 });
  await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(800);
  const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
  for (const s of SHOTS) {
    if (only && !only.split(',').includes(s.name)) continue;
    const res = await page.evaluate((s) => {
      const d = window.__gtaDebug; d.stopLoop(); d.setHour(s.hour); d.traffic.setHour?.(s.hour, true);
      d.setWeather?.(s.wet ? 'wet' : 'dry', true);
      d.teleport(s.at[0], s.at[1], 0); d.step(240);
      if (s.el !== undefined && d.transit) d.transit.time = s.el;
      d.setFreeCam(...s.cam);
      d.settle(20); let info; for (let i = 0; i < 5; i++) info = d.renderOnce(1, 1 / 60);
      return { data: d.renderer.domElement.toDataURL('image/png'), calls: info.total };
    }, s);
    writeFileSync(`${out}/${s.name}.png`, Buffer.from(res.data.split(',')[1], 'base64'));
    console.log(s.name, 'calls', res.calls);
  }
} finally { await browser.close(); preview.kill(); }
