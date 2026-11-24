// LOADSCREENS: renders scripts/dev/loadart-sheet.html headless and saves the sheet.
// SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/dev/loadart-sheet.mjs <out.png> [--query "w=1280&h=720&cols=2&scale=0.5"] [--port 4491]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2); let port = 4491, query = '', out = null;
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--query') query = a[++i]; else out = a[i]; }
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch();
const errors = [];
try {
  const vp = /vw=(\d+)&vh=(\d+)/.exec(query); const page = await browser.newPage({ viewport: vp ? { width: +vp[1], height: +vp[2] } : { width: 1280, height: 720 } });
  page.on('pageerror', (e) => { if (!/screen-mode-done/.test(String(e))) errors.push(String(e).slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(`http://localhost:${port}/scripts/dev/loadart-sheet.html?${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  if (/screen=1/.test(query)) { await page.screenshot({ path: out }); console.log(out, JSON.stringify(await page.evaluate(() => window.__ready))); throw new Error('done'); }
  const r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
  writeFileSync(out, Buffer.from(r.data.split(',')[1], 'base64'));
  console.log(out, JSON.stringify(r.info));
} catch (e) { if (String(e).indexOf('done') < 0) throw e; } finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
