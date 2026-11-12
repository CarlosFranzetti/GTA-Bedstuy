// node scripts/anim-sheet.mjs <outDir> [--modes walk,run,car] [--when before,after] [--port 4452]
// Renders side-view contact sheets of the captured-clip animation (and the old sine walk for comparison). Run through scripts/swarm-render.sh.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4452, modes = 'walk,run,car', whens = 'before,after', view = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--modes') modes = a[++i]; else if (a[i] === '--when') whens = a[++i]; else if (a[i] === '--view') view = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'anim-sheets'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const m of modes.split(',')) for (const w of whens.split(',')) {
    if (m === 'car' && w === 'before') continue;
    const page = await browser.newPage({ viewport: { width: 1600, height: 520 } });
    page.on('console', (x) => { if (x.type() === 'error') errors.push(x.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(`http://localhost:${port}/scripts/anim-sheet.html?mode=${m}&when=${w}${view ? '&view=' + view : ''}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
    writeFileSync(`${out}/${m}${view ? '-' + view : ''}-${w}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(m, w, JSON.stringify(r.info));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
