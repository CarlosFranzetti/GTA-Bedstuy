// Renders the PEDHAIR sheets headless: node scripts/pedpieces-showcase.mjs <outDir> [--port 4452] [--views hair,hats,acc,shoes,people] [--query yaw=0.8]
// Run through the queue: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/pedpieces-showcase.mjs <outDir> ...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4452, views = 'hair', query = '', tag = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--query') query = a[++i]; else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'pedpieces'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const v of views.split(',')) {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
    await page.goto(`http://localhost:${port}/scripts/pedpieces-showcase.html?view=${v}${query ? '&' + query : ''}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 }).catch(() => {});
    const r = await page.evaluate(() => (window.__ready ? { info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') } : null));
    if (r) { writeFileSync(`${out}/${v}${tag ? '-' + tag : ''}.png`, Buffer.from(r.data.split(',')[1], 'base64')); console.log(v, JSON.stringify(r.info.tiles.map((t) => t.label + ':' + t.tris.join('+')))); }
    else console.log(v, 'no result');
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 8));
