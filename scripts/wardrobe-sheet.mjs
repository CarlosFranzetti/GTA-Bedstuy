// Renders the wardrobe sheets headless:
//   SWARM_SMALL=1 scripts/swarm-render.sh node scripts/wardrobe-sheet.mjs <outDir> --views "outfits~from=0~n=32~cols=8~w=2400;street~seed=3~n=60~cols=12~w=2800"
// An entry is mode~key=value~key=value (mode outfits or street); the picture and a .txt with the order of the people are written to <outDir>.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); let port = 4452, views = 'street~seed=1~n=24~cols=12~w=2400'; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--views') views = a[++i]; else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'wardrobe-sheet'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const entry of views.split(';').filter(Boolean)) {
    const [mode, ...kv] = entry.split('~'), vq = kv.join('&'), fname = entry.replace(/[~=]/g, '_'), w = Number((kv.find((x) => x.startsWith('w=')) ?? 'w=2400').slice(2));
    const page = await browser.newPage({ viewport: { width: Math.min(w, 3000), height: 900 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      try {
        await page.goto(`http://localhost:${port}/scripts/wardrobe-sheet.html?mode=${mode}${vq ? '&' + vq : ''}`, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => window.__ready, null, { timeout: 480000 });
        r = await page.evaluate(() => ({ info: window.__ready, data: document.querySelector('canvas').toDataURL('image/png') }));
      } catch (e) { if (attempt === 2) throw e; await new Promise((q) => setTimeout(q, 3000)); }
    }
    writeFileSync(`${out}/${fname}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    writeFileSync(`${out}/${fname}.txt`, r.info.labels.map((l, i) => `${i + 1}\t${l}`).join('\n') + '\n');
    console.log(entry, JSON.stringify({ people: r.info.ids.length, tris: r.info.tris, calls: r.info.calls, size: r.info.size }));
    await page.close();
  }
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 6));
