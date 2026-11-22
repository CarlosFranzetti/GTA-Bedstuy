// REVIEW's fixed cameras: node scripts/body-review.mjs <outDir> [--views lineup~pose=stand,lineup~pose=walk,strips,startstop,near3,crowd20] [--tag before] [--port 4470]
// Run through SWARM_SMALL=1 scripts/swarm-render.sh. Writes <view>.png per view (pose and the like are part of the name) and prints triangles and draw calls.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4470, views = 'lineup~pose=stand,lineup~pose=walk,strips,startstop,near3,crowd20', tag = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'body-review'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const entry of views.split(',').filter(Boolean)) {
    const [v, ...kv] = entry.split('~'), q = kv.join('&'), fname = entry.replace(/[~=]/g, '_');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      try {
        await page.goto(`http://localhost:${port}/scripts/body-review.html?view=${v}${q ? '&' + q : ''}`, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
        r = await page.evaluate(() => ({ info: window.__ready, data: document.getElementById('out').toDataURL('image/png') }));
      } catch (e) { if (attempt === 2) throw e; await new Promise((x) => setTimeout(x, 3000)); }
    }
    writeFileSync(`${out}/${fname}${tag ? '-' + tag : ''}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(entry, JSON.stringify({ tris: r.info.tris, calls: r.info.calls, people: r.info.people }));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
