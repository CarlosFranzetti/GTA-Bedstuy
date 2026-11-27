// SCENEUI: screenshots scripts/dev/sceneui-sheet.html (the scene card and the thrift rack, desktop and 390 px) with the vite dev server.
// Usage: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/sceneui-sheet.mjs [out.png] [--port 4493]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
let port = 4493; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'docs/swarm/teams/sheets/sceneui-1.png'); mkdirSync(dirname(out), { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1290, height: 1260 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`http://localhost:${port}/scripts/dev/sceneui-sheet.html`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      await page.evaluate(() => window.__ready);
      break;
    } catch (e) { if (attempt === 2) throw e; await new Promise((q) => setTimeout(q, 3000)); }
  }
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote', out);
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
