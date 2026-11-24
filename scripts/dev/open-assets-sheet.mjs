// INTAKE seat: node scripts/dev/open-assets-sheet.mjs <out.png> [--port 4484]
// Starts the vite dev server, opens scripts/dev/open-assets-sheet.html in headless Chromium (software GL) and saves the sheet.
// Run through the queue: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/open-assets-sheet.mjs docs/swarm/teams/sheets/open-assets-1.png
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2); let port = 4484; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'open-assets-1.png'); mkdirSync(dirname(out), { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1540 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.route((u) => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), (r) => r.abort());
  let r = null;
  for (let attempt = 0; attempt < 3 && !r; attempt++) {
    try {
      await page.goto(`http://localhost:${port}/scripts/dev/open-assets-sheet.html`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      r = await page.evaluate(() => window.__ready);
    } catch (e) { if (attempt === 2) throw e; await new Promise((q) => setTimeout(q, 3000)); }
  }
  writeFileSync(out, Buffer.from(r.data.split(',')[1], 'base64'));
  console.log('sheet', out, JSON.stringify(r.stats));
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
