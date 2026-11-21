// node scripts/landmarks-shots.mjs <outDir> [--ids a,b] [--views street,aerial] [--port 4461] [--tier low]
// Run through scripts/swarm-render.sh (a full real-map world in a browser).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
let port = 4461, tier = 'low', ids = '', views = 'street,aerial', w = 1280, h = 720, cams = ''; const rest = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--port') port = Number(a[++i]); else if (a[i] === '--tier') tier = a[++i]; else if (a[i] === '--ids') ids = a[++i]; else if (a[i] === '--views') views = a[++i]; else if (a[i] === '--cams') cams = a[++i]; else if (a[i] === '--w') w = Number(a[++i]); else if (a[i] === '--h') h = Number(a[++i]); else rest.push(a[i]); }
const out = resolve(rest[0] ?? 'landmarks'); mkdirSync(out, { recursive: true });
const dev = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/scripts/landmarks-shots.html?w=${w}&h=${h}&tier=${tier}&views=${views}${cams ? '&cams=' + encodeURIComponent(cams) : ''}${ids ? '&ids=' + ids : ''}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 540000 });
  const r = await page.evaluate(() => window.__ready);
  for (const [name, url] of Object.entries(r.shots)) { writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log(`${out}/${name}.png`); }
  console.log(JSON.stringify({ info: r.info, stats: r.stats, standIns: r.standIns }));
} finally { await browser.close(); dev.kill(); }
if (errors.length) console.error('errors', errors.slice(0, 8));
