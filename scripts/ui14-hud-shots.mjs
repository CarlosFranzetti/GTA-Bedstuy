// HUD screenshots: node scripts/ui14-hud-shots.mjs <outDir> <tag> [--port 4486] [--root <repo dir>]. Run through scripts/swarm-render.sh.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'ui14'), tag = process.argv[3] ?? 'after';
const port = Number(arg('--port', 4486)), root = resolve(arg('--root', HERE));
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const url = (s) => `http://127.0.0.1:${port}/scripts/ui14-hud-harness.html${s}`;
const up = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(url(''))).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('vite did not start'); };
const errors = [];
try {
  await up();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = async (w, h, q, name, wait = 1500) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url(q));
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${tag}-${name}.png` });
    await page.close();
  };
  await shot(1280, 720, '', 'desktop-foot');
  await shot(1280, 720, '?car=1', 'desktop-car', 1200);
  await shot(390, 844, '?touch=1', 'phone-foot');
  await shot(390, 844, '?touch=1&car=1', 'phone-car', 1200);
  if (tag === 'after') { await shot(1280, 720, '?car=1&fx=passed', 'desktop-passed', 2600); await shot(1280, 720, '?car=1&fx=station', 'desktop-station', 900); }
  console.log(JSON.stringify({ out, errors }));
  await browser.close();
} finally { srv.kill('SIGTERM'); }
