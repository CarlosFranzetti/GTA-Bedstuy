// FACADES: node scripts/facades-showcase.mjs <outDir> [--port 4470] [--hour day|night] [--views row,close,door,block,shop,up,el] [--w 1280] [--h 720] [--tag name]
// Dev-server harness (no game): through the queue as a small job: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/facades-showcase.mjs ...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4470, hour = 'day', views = 'row,close,door,block,shop,up', w = 1280, h = 720, tag = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--hour') hour = a[++i]; else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--w') w = Number(a[++i]); else if (a[i] === '--h') h = Number(a[++i]); else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'facades-showcase'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 900)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 900)));
  await page.goto(`http://localhost:${port}/scripts/facades-showcase.html?hour=${hour}&views=${views}&w=${w}&h=${h}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  const r = await page.evaluate(() => window.__ready);
  for (const [name, url] of Object.entries(r.shots)) { writeFileSync(`${out}/${name}-${hour}${tag ? '-' + tag : ''}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log(`${out}/${name}-${hour}${tag ? '-' + tag : ''}.png`); }
  console.log(JSON.stringify({ tris: r.tris, calls: r.calls, programs: r.programs }));
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 12));
