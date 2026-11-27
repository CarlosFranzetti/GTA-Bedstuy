// CARCABIN: node scripts/dev/carcabin-sheet.mjs <out.png> --types sedan,cab,cop [--seeds 1,2] [--size 360x210] [--port 4477]
// Run through the queue: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/carcabin-sheet.mjs ...  (one job at a time)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2); let port = 4477, types = 'sedan', seeds = '1', TW = 360, TH = 210; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--types') types = a[++i]; else if (a[i] === '--seeds') seeds = a[++i]; else if (a[i] === '--size') { [TW, TH] = a[++i].split('x').map(Number); } else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'carcabin-sheet.png'); mkdirSync(dirname(out), { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: TW, height: TH } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/scripts/dev/carcabin-sheet.html?types=${types}&seeds=${seeds}&tw=${TW}&th=${TH}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const r = await page.evaluate(() => window.__ready);
  writeFileSync(out, Buffer.from(r.data.split(',')[1], 'base64'));
  for (const f of r.info) console.log(f.type, f.seed, f.style, Math.round(f.tris));
  console.log('wrote', out);
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
