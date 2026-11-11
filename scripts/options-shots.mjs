// Screenshots of the pause menu sections (Options lane): node scripts/options-shots.mjs <outDir> [--port 4462]
// Serves the repo with vite (dev) and drives scripts/ui10-harness.html?demo=menu. Run through scripts/swarm-render.sh.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? 'options-shots');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4462;
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/scripts/ui10-harness.html`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('vite did not start'); };
try {
  await up();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(150000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await page.goto(`http://127.0.0.1:${port}/scripts/ui10-harness.html?demo=menu`);
  await page.waitForFunction(() => !!window.__ui10);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const panel = page.locator('.menu-panel');

  // 0 title screen offer
  await page.evaluate(() => { document.querySelector('.menu-root').hidden = true; const s = document.querySelector('.hud-splash'); if (s) { s.style.display = ''; s.classList.remove('fading'); } });
  await page.waitForTimeout(300);
  await shot('0-title-play-fullscreen');
  await page.evaluate(() => { const s = document.querySelector('.hud-splash'); if (s) s.style.display = 'none'; window.__ui10.menu.open(); });

  await shot('1-menu-top-fullscreen-install');
  await page.click('.menu-adv-toggle');
  await page.evaluate(() => document.querySelector('.menu-adv-toggle').scrollIntoView({ block: 'start' }));
  await shot('2-advanced-graphics-medium');
  await page.evaluate(() => document.querySelector('.menu-adv').scrollIntoView({ block: 'end' }));
  await shot('3-advanced-graphics-lower');
  // some overrides, to show the marked rows and Reset
  await page.click('.menu-adv-shadows [data-value="off"]');
  await page.click('.menu-adv-aa [data-value="off"]');
  await page.evaluate(() => { const i = document.querySelector('.menu-adv-crowd input'); i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); const f = document.querySelector('.menu-adv-showFps input'); f.click(); });
  await page.evaluate(() => document.querySelector('.menu-adv').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(700);
  await shot('4-advanced-overridden-fps');
  // phone tier: unsupported rows disappear
  await page.click('[data-quality="phone"]');
  await page.evaluate(() => document.querySelector('.menu-adv').scrollIntoView({ block: 'start' }));
  await shot('5-advanced-phone-tier');
  await page.click('[data-quality="auto"]');
  await page.evaluate(() => document.querySelector('.menu-panel').scrollTo(0, 0));
  await shot('6-auto-preset');
  console.log(JSON.stringify({ out, errors }));
  await browser.close();
} finally { srv.kill('SIGTERM'); }
