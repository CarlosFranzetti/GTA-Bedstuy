// CARHI: roster close-ups headless. node scripts/carhi-showcase.mjs <outDir> [--port 4443] [--w 960] [--h 540] --cars sedan:#7f8c8d:0:front3q,...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4443, w = 960, h = 540, cars = 'sedan:%237f8c8d:0:front3q'; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--w') w = Number(a[++i]); else if (a[i] === '--h') h = Number(a[++i]); else if (a[i] === '--cars') cars = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'carhi-showcase'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const c of cars.split(',')) {
    const [type, color, variant, angle, dist = '4', hs = '1', fov = '48', seed = '', ov = ''] = c.split(':');
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(`http://localhost:${port}/scripts/carhi-showcase.html?type=${type}&color=${color}&variant=${variant}&angle=${angle}&w=${w}&h=${h}&dist=${dist}&hs=${hs}&fov=${fov}${seed !== '' ? `&seed=${seed}&ov=${ov}` : ''}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
    const name = `${type}-${color.replace('%23','')}-${angle}${seed !== '' ? `-s${seed}` : ''}`;
    writeFileSync(`${out}/${name}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(name, JSON.stringify(r.info));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
