// Map screen screenshots: node scripts/ui14-map-shots.mjs <outDir> [--port 4486]. Run through scripts/swarm-render.sh.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? 'ui14');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4486;
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const url = (s) => `http://127.0.0.1:${port}/scripts/ui14-map-harness.html${s}`;
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(url(''))).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('vite did not start'); };
const errors = [];
try {
  await up();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const run = async (w, h, q, tag, steps) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url(q));
    await page.waitForFunction(() => !!window.__map);
    await page.evaluate(() => window.__map.map.open());
    await page.waitForTimeout(1200);
    await steps(page, (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` }));
    await page.close();
  };
  const move = (page, x, y) => page.mouse.move(x, y);
  await run(1280, 720, '', 'desktop', async (page, shot) => {
    await page.mouse.move(700, 400);
    await shot('1-fit');
    await page.evaluate(() => { const { map, setWaypoint } = window.__map; setWaypoint({ x: 520, z: 330 }, 'Malcolm X Blvd'); map.stepZoom(1); map.stepZoom(1); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const { map, player } = window.__map; map.view.cx = player.x + 60; map.view.cz = player.z + 40; });
    await page.waitForTimeout(500);
    await shot('2-zoomed-in-labels');
    await page.evaluate(() => { const { map } = window.__map; map.fitAll(); for (let i = 0; i < 3; i++) map.stepZoom(-1); });
    await page.waitForTimeout(1400);
    await shot('3-zoomed-out-brooklyn');
  });
  await run(390, 844, '?touch=1', 'phone', async (_page, shot) => { await shot('4-portrait-fit'); });
  await run(844, 390, '?touch=1', 'phone', async (_page, shot) => { await shot('5-landscape-fit'); });
  console.log(JSON.stringify({ out, errors }));
  await browser.close();
} finally { srv.kill('SIGTERM'); }
