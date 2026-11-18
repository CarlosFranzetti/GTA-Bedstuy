// Renders the showcase views headless: node scripts/skins-showcase.mjs <outDir> [--port 4440] [--views group-front,group-3q,faces,peds]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4448, views = 'group-front,group-3q,faces', query = '', tag = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--query') query = a[++i]; else if (a[i] === '--tag') tag = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'people-showcase'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  // an entry may carry its own query: name~key=value~key=value (the file is named after the whole entry)
  for (const entry of views.split(',')) {
    const [v, ...kv] = entry.split('~'), vq = kv.join('&'), fname = entry.replace(/[~=]/g, '_');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {      // a dev server that re-optimises its dependencies reloads the page once
      try {
        await page.goto(`http://localhost:${port}/scripts/people-showcase.html?view=${v}${query ? '&' + query : ''}${vq ? '&' + vq : ''}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
        r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
      } catch (e) { if (attempt === 2) throw e; await new Promise((q) => setTimeout(q, 3000)); }
    }
    writeFileSync(`${out}/${fname}${tag ? '-' + tag : ''}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(entry, JSON.stringify({ ...r.info, perPerson: undefined, bodies: undefined, maxTris: Math.max(0, ...Object.values(r.info.perPerson ?? {})) }));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
