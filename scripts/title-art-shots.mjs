// CREDITS lane: raw frames of OUR world for the title / loading illustration (post-processed by scripts/title-art-ink.py).
// Usage: node scripts/title-art-shots.mjs <outDir> --dist dist [--port 4461] [--width 1600] [--height 900] [--probe]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const o = { port: 4461, width: 1600, height: 900, dist: 'dist', probe: false, q: 'high' };
const rest = [];
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--port') o.port = Number(a[++i]); else if (a[i] === '--width') o.width = Number(a[++i]); else if (a[i] === '--height') o.height = Number(a[++i]);
  else if (a[i] === '--dist') o.dist = resolve(a[++i]); else if (a[i] === '--probe') o.probe = true; else rest.push(a[i]);
}
const out = resolve(rest[0] ?? 'title-art'); mkdirSync(out, { recursive: true });
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', o.dist, '--port', String(o.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://localhost:${o.port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: o.width, height: o.height } });
  page.on('pageerror', (e) => console.error(String(e).slice(0, 300)));
  await page.goto(`${base}/?q=${o.q}&perf=0`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 280_000 });
  await page.mouse.click(o.width / 2, o.height / 2); await page.waitForTimeout(800);
  const b = page.getByRole('button', { name: 'Resume' }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
  if (o.probe) {
    console.log(JSON.stringify(await page.evaluate(() => { const d = window.__gtaDebug; const p = d.player.body; return { pos: p.pos, heading: p.heading, traffic: Object.keys(d.traffic), cars: (d.traffic.cars ?? d.traffic.vehicles ?? []).length }; })));
  }
  const shots = JSON.parse(process.env.SHOTS ?? '[]');
  for (const s of shots) {
    const res = await page.evaluate((s) => {
      const d = window.__gtaDebug; d.stopLoop(); d.setHour(s.hour); d.traffic.setHour?.(s.hour, true);
      if (s.at) d.teleport(s.at[0], s.at[1], s.at[2]);
      d.step(s.steps ?? 120);
      const p = d.player.body.pos, h = d.player.body.heading;
      const f = (v) => (typeof v === 'function' ? v(p, h) : v);
      const cam = new Function('p', 'h', `return ${s.cam};`)(p, h); // [cx,cy,cz,lx,ly,lz]
      d.setFreeCam(...cam);
      d.settle(30); let info; for (let i = 0; i < 4; i++) info = d.renderOnce(1, 1 / 60);
      return { data: d.renderer.domElement.toDataURL('image/png'), p: { x: p.x, z: p.z }, h };
    }, s);
    writeFileSync(`${out}/${s.name}.png`, Buffer.from(res.data.split(',')[1], 'base64'));
    console.log(s.name, JSON.stringify({ p: res.p, h: res.h }));
  }
} finally { await browser.close(); preview.kill(); }
