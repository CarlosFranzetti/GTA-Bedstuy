// node scripts/cars12-sheet.mjs <outDir> --port 4474 --cars "pickup:34495e:3;crossover:a9b0b8:5:roof~cargo" [--angles front3q,rear3q]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); let port = 4474, cars = '', angles = 'front3q,rear3q'; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--cars') cars = a[++i]; else if (a[i] === '--angles') angles = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'cars12-sheet'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/scripts/cars12-sheet.html?cars=${encodeURIComponent(cars)}&angles=${angles}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const r = await page.evaluate(() => window.__ready);
  for (const f of r) { writeFileSync(`${out}/${f.name}.png`, Buffer.from(f.data.split(',')[1], 'base64')); console.log(f.name, f.tris, f.style); }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
