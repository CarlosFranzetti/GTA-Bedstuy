// CARS3: node scripts/carsheet.mjs <outDir> [--port 4451] [--angles front3q,side,rear3q] [--types a,b] [--cols 7] [--cw 300] [--ch 200] [--tag before]
// Renders one PNG contact sheet per angle with every vehicle type. Run through: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/carsheet.mjs ...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4451, angles = 'front3q,side,rear3q', types = '', cols = 7, cw = 300, ch = 200, tag = 'sheet'; const rest = [];
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--angles') angles = a[++i]; else if (a[i] === '--types') types = a[++i];
  else if (a[i] === '--cols') cols = Number(a[++i]); else if (a[i] === '--cw') cw = Number(a[++i]); else if (a[i] === '--ch') ch = Number(a[++i]); else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]);
}
const out = resolve(rest[0] ?? 'carsheet'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const angle of angles.split(',')) {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto(`http://localhost:${port}/scripts/carsheet.html?angle=${angle}&cols=${cols}&cw=${cw}&ch=${ch}${types ? `&types=${types}` : ''}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
    const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/jpeg', 0.9) }));
    writeFileSync(`${out}/${tag}-${angle}.jpg`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(angle, JSON.stringify(r.info));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
