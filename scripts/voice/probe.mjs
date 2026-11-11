// Real Chromium probe of the voice pack path. Run through the render lock:
//   scripts/swarm-render.sh node scripts/voice/probe.mjs [--live] [--port 4487]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
const port = a.includes('--port') ? Number(a[a.indexOf('--port') + 1]) : 4487;
const live = a.includes('--live');
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/scripts/voice/probe.html${live ? '?live=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__out, null, { timeout: live ? 420000 : 90000 });
  console.log(JSON.stringify(await page.evaluate(() => window.__out), null, 1));
} finally { await browser.close(); dev.kill(); }
