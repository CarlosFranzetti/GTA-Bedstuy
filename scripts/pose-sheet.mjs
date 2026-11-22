// node scripts/pose-sheet.mjs <outDir> --name stand-before --q "pose=stand&layers=0" [--port 4461]
// Renders scripts/pose-sheet.html (POSE seat). Run through SWARM_SMALL=1 scripts/swarm-render.sh.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4461, jobs = []; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--job') jobs.push(a[++i]); else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'pose-sheets'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const job of jobs) {            // job = name=query
    const [name, q] = [job.slice(0, job.indexOf('=')), job.slice(job.indexOf('=') + 1)];
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      try {
        await page.goto(`http://localhost:${port}/scripts/pose-sheet.html?${q}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
        r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
      } catch (e) { if (attempt === 2) throw e; await new Promise((x) => setTimeout(x, 3000)); }
    }
    writeFileSync(`${out}/${name}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    console.log(name, JSON.stringify(r.info));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
