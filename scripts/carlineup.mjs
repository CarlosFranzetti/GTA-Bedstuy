// CARS5: node scripts/carlineup.mjs <outDir> [--port 4461] [--views side,front] [--types a,b] [--ppm 60] [--rowm 40] [--tag before]
// All types at one scale with a 1.75 m figure and a 5 m ruler. Run: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/carlineup.mjs <out>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4461, views = 'side,front', types = '', ppm = 60, rowm = 40, tag = 'lineup', rowh = 4.2; const rest = [];
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--types') types = a[++i];
  else if (a[i] === '--ppm') ppm = Number(a[++i]); else if (a[i] === '--rowm') rowm = Number(a[++i]); else if (a[i] === '--tag') tag = a[++i]; else if (a[i] === '--rowh') rowh = Number(a[++i]); else rest.push(a[i]);
}
const out = resolve(rest[0] ?? 'carlineup'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const view of views.split(',')) {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto(`http://localhost:${port}/scripts/carlineup.html?view=${view}&ppm=${ppm}&rowm=${rowm}&rowh=${rowh}${types ? `&types=${types}` : ''}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
    const r = await page.evaluate(() => ({ info: window.__ready, data: document.getElementById('out').toDataURL('image/jpeg', 0.9) }));
    writeFileSync(`${out}/${tag}-${view}.jpg`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(view, JSON.stringify({ ...r.info, info: undefined }));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
