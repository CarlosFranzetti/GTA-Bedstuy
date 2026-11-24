// node scripts/dev/mods-harness-run.mjs <outDir> [--port N]; run through: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/mods-harness-run.mjs <outDir>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
let port = 4491; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'mods-harness'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  let info = null;
  for (let attempt = 0; attempt < 3 && !info; attempt++) {
    try {
      await page.goto(`http://localhost:${port}/scripts/dev/mods-harness.html`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      info = await page.evaluate(() => window.__ready);
    } catch (e) { if (attempt === 2) throw e; await new Promise((q) => setTimeout(q, 3000)); }
  }
  const data = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
  writeFileSync(`${out}/car.png`, Buffer.from(data.split(',')[1], 'base64'));
  await page.click('#open');
  await page.screenshot({ path: `${out}/panel.png` });
  writeFileSync(`${out}/info.json`, JSON.stringify({ info, errors }, null, 1));
  console.log(JSON.stringify({ info, errors }, null, 1));
  if (errors.length || !info.installed) code = 1;
} finally { await browser.close(); dev.kill(); }
process.exit(code);
