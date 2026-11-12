// SHOTS lane: title, loading (three moments) and every pause-menu tab, desktop and phone portrait.
// node scripts/shots-ui.mjs <outDir> [--port 4476] [--tag v1] [--only desktop|phone] [--noart]
// Serves the repo with vite (dev) and drives scripts/gui-harness.html. Run with SWARM_SMALL=1 scripts/swarm-render.sh (no WebGL needed).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'shots-ui'); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4476)); const tag = arg('--tag', 'v1'); const only = arg('--only', 'all'); const noArt = process.argv.includes('--noart');
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const url = (q) => `http://127.0.0.1:${port}/scripts/gui-harness.html?${q}`;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url(''))).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch();
  for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
    if (only !== 'all' && only !== name) continue;
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    // the harness lives under /scripts/, the art under /art/: map the page-relative art URLs (or drop them for the single-file look)
    await ctx.route('**/scripts/art/**', (route) => (noArt ? route.abort() : route.continue({ url: route.request().url().replace('/scripts/art/', '/art/') })));
    const errors = [];
    const mk = async (q) => { const page = await ctx.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', (e) => errors.push(String(e))); await page.addInitScript(() => { try { localStorage.clear(); } catch { /* ignore */ } }); await page.goto(url(q)); await page.waitForFunction(() => !!window.__gui); return page; };
    // title
    let page = await mk(`splash=1${mobile ? '&touch=1' : ''}`);
    await page.waitForTimeout(2500);
    // the harness also mounts the in-game HUD pieces (minimap, mission pointer, phone); in the game the splash covers them
    await page.evaluate(() => { for (const e of document.querySelectorAll('#overlay > *')) if (!e.classList.contains('hud-splash')) e.style.display = 'none'; });
    await page.screenshot({ path: `${out}/title-${tag}-${name}.png` });
    await page.close();
    // loading, three moments
    page = await mk(`loading=1${mobile ? '&touch=1' : ''}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/loading-${tag}-${name}-1.png` });
    await page.evaluate(() => { const l = window.__gui.loading; l.done('world'); l.begin('lights'); l.done('lights'); l.begin('entities'); });
    await page.waitForTimeout(8500);
    await page.screenshot({ path: `${out}/loading-${tag}-${name}-2.png` });
    await page.evaluate(() => { const l = window.__gui.loading; l.done('entities'); l.begin('shaders'); l.warn('Textures are still loading; continuing without waiting.'); });
    await page.waitForTimeout(8500);
    await page.screenshot({ path: `${out}/loading-${tag}-${name}-3.png` });
    await page.close();
    // pause menu, every tab (settings also scrolled to Audio)
    page = await mk(`bg=1${mobile ? '&touch=1' : ''}`);
    if (!noArt) await page.evaluate(() => { for (const e of [document.documentElement, document.body]) { e.style.background = 'url(/art/shot-stoop.webp) center/cover'; } });
    await page.evaluate(() => window.__gui.menu.open());
    await page.waitForTimeout(500);
    const tabs = await page.$$eval('.menu-tab', (b) => b.filter((x) => !x.hidden).map((x) => x.dataset.tab));
    for (const t of tabs) {
      await page.evaluate((t) => document.querySelector(`.menu-tab[data-tab="${t}"]`).click(), t);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/menu-${tag}-${name}-${t}.png` });
      if (t === 'settings') {
        await page.evaluate(() => { const l = document.querySelector('.gp-pane-settings .gp-list'); const h = [...l.querySelectorAll('.gp-sub')].find((n) => n.textContent === 'Audio'); if (h) l.scrollTop = h.offsetTop - 10; const r = l.querySelector('[data-id="master"]'); });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/menu-${tag}-${name}-settings-audio.png` });
      }
    }
    console.log(name, tabs.join(','), errors.length ? errors : 'no errors');
    await ctx.close();
  }
  await browser.close();
} finally { srv.kill(); }
