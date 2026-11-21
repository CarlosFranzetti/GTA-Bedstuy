// CARS4: node scripts/carclose.mjs <outDir> --types a,b [--seed 1234] [--pw 480] [--ph 300] [--views f3q,side,r3q,top] [--color #hex] [--variant 0] [--lamps 1] [--tag close] [--port 4452]
// Run through: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/carclose.mjs ...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const o = { port: 4452, tag: 'close' }; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'carclose'); mkdirSync(out, { recursive: true });
const q = new URLSearchParams(); for (const k of ['types', 'seed', 'pw', 'ph', 'views', 'color', 'variant', 'lamps', 'q']) if (o[k] !== undefined) q.set(k, o[k]);
const port = Number(o.port);
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(`http://localhost:${port}/scripts/carclose.html?${q}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/jpeg', 0.92) }));
  writeFileSync(`${out}/${o.tag}.jpg`, Buffer.from(r.data.split(',')[1], 'base64'));
  console.log(JSON.stringify(r.info));
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
