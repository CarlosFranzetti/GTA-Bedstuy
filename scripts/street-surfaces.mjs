// node scripts/street-surfaces.mjs <outDir> [--port 4452] [--views street,close,low,top,walk,junction] [--hw 6] [--cls 0] [--hour day|night] [--tag name]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4452, views = 'street,close,low,top,walk,junction', hw = 6, cls = 0, hour = 'day', tag = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--hw') hw = Number(a[++i]); else if (a[i] === '--cls') cls = Number(a[++i]); else if (a[i] === '--hour') hour = a[++i]; else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'street-surfaces'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const v of views.split(',')) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 600)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 600)));
    await page.goto(`http://localhost:${port}/scripts/street-surfaces.html?view=${v}&hw=${hw}&cls=${cls}&hour=${hour}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
    writeFileSync(`${out}/${v}-${hour}-c${cls}${tag ? '-' + tag : ''}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(v, JSON.stringify(r.info));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 8));
