// CREDITS lane screenshots: title + credits roll, desktop and phone portrait. node scripts/credits-shots.mjs <outDir> [--port 4466] [--tag v1]
// Run through scripts/swarm-render.sh. Serves the repo with vite dev and drives scripts/credits-harness.html.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'credits-shots'); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4466)); const tag = arg('--tag', 'v1'); const only = arg('--only', 'all');
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/scripts/credits-harness.html`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch();
  for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
    if (only !== 'all' && only !== name) continue;
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage(); page.setDefaultTimeout(120000);
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/scripts/credits-harness.html`);
    await page.waitForFunction(() => !!window.__cr);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/title-${tag}-${name}.png` });
    await page.click('.hud-credits');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/credits-${tag}-${name}-1-top.png` });
    await page.evaluate(() => { const c = window.__cr.credits; c.navigate('down'); const sc = c.root.querySelector('.cr-scroll'); sc.scrollTop = 0.34 * (sc.scrollHeight - sc.clientHeight); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/credits-${tag}-${name}-2-team.png` });
    await page.evaluate(() => { const sc = window.__cr.credits.root.querySelector('.cr-scroll'); sc.scrollTop = 0.9 * (sc.scrollHeight - sc.clientHeight); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/credits-${tag}-${name}-3-thanks.png` });
    console.log(name, errors.length ? errors : 'no errors');
    await ctx.close();
  }
  await browser.close();
} finally { srv.kill(); }
