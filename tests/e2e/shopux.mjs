// Headless repro of the H4 shop bugs at 640x360: walk from the old stuck spot in the Wax Deli areaway to the door,
// enter, open the shop with F, navigate with keys, buy, preview, close; then the decks (home). Run as:
//   npm run build && scripts/swarm-render.sh node tests/e2e/shopux.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4423;
const OUT = 'tests/e2e/__screenshots__';
const log = (...a) => console.log('[shopux]', ...a);
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [];
const results = {};
let browser;
const hardStop = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 420_000);
const check = (name, ok, extra) => { results[name] = !!ok; log(ok ? 'PASS' : 'FAIL', name, extra ?? ''); if (!ok) process.exitCode = 1; };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=phone&perf=0`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  await page.mouse.click(300, 200); // user gesture: starts audio
  await page.waitForTimeout(1500);
  const D = (fn, arg) => page.evaluate(fn, arg);
  const pos = () => D(() => { const b = window.__gtaDebug.player.body.pos; return { x: +b.x.toFixed(2), z: +b.z.toFixed(2) }; });
  const state = () => D(() => window.__gtaDebug.interiors.state);
  const waitState = (s, t = 60_000) => page.waitForFunction((x) => window.__gtaDebug.interiors.state === x, s, { timeout: t });
  const shot = (n) => page.screenshot({ path: `${OUT}/shopux-${n}.png`, timeout: 120_000 });
  const hold = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
  // software rendering runs the sim slowly: hold a key until the predicate holds (or give up after maxMs)
  const walkUntil = async (k, pred, maxMs = 40_000) => { await page.keyboard.down(k); const t0 = Date.now(); let p = await pos(); while (!pred(p) && Date.now() - t0 < maxMs) { await page.waitForTimeout(250); p = await pos(); } await page.keyboard.up(k); return p; };
  const tap = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(120); };
  const panel = () => D(() => {
    const r = (el) => { const b = el?.getBoundingClientRect(); return b ? { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height } : null; };
    const root = document.querySelector('.shop-root:not([hidden])');
    return {
      open: !!root, bodyClass: document.body.className, modal: !!document.querySelector('[data-ui-modal]:not([hidden])'),
      panel: r(root?.querySelector('.shop-panel')), foot: r(root?.querySelector('.shop-foot')), close: r(root?.querySelector('.shop-close')),
      list: root ? { client: root.querySelector('.shop-body').clientHeight, scroll: root.querySelector('.shop-body').scrollHeight } : null,
      sel: [...document.querySelectorAll('.shop-card')].findIndex((c) => c.classList.contains('sel')),
      cash: window.__gtaDebug.inventory.cash, records: window.__gtaDebug.inventory.records.length, tab: document.querySelector('.shop-tab.on')?.textContent,
    };
  });

  // --- the old stuck spot: inside the areaway pit at the east end of the stoop; walk west (A) out through the door gap
  await D(() => window.__gtaDebug.teleport(13.6, 34.2, -Math.PI / 2));
  await page.waitForTimeout(600);
  const pr0 = await D(() => window.__gtaDebug.interiors.prompt(window.__gtaDebug.player.body.pos));
  check('prompt shows in the doorstep band at the old spot', /WAX DELI/i.test(pr0), pr0);
  const p1 = await walkUntil('KeyA', (p) => p.x < 9.8);
  check('walked out of the areaway through the door gap (x < 11)', p1.x < 11, JSON.stringify(p1));
  // and straight back in from the sidewalk: onto the doorstep
  const p2 = await walkUntil('KeyD', (p) => p.x > 11.8);
  check('walks onto the doorstep from the sidewalk (x > 11.3)', p2.x > 11.3, JSON.stringify(p2));
  // a few metres along the sidewalk the prompt still shows (band, not a spot)
  const prompts = [];
  for (const [x, z] of [[9.65, 32.6], [9.65, 35.4], [8.9, 34], [10.9, 34]]) { await D(([x, z]) => window.__gtaDebug.teleport(x, z), [x, z]); await page.waitForTimeout(350); prompts.push(await D(() => window.__gtaDebug.interiors.prompt(window.__gtaDebug.player.body.pos))); }
  check('prompt across the band', prompts.every((p) => /WAX DELI/i.test(p)), JSON.stringify(prompts));
  await shot('door');

  // --- enter with the real F key, then open the shop with F at the bins
  await D(() => window.__gtaDebug.teleport(10.2, 33.4, -Math.PI / 2));
  for (let i = 0; i < 6 && (await state()) === 'outside'; i++) { await tap('KeyF'); await page.waitForTimeout(1500); }
  await waitState('inside');
  await D(() => window.__gtaDebug.ensureAudio());
  await D(() => window.__gtaDebug.teleport(3000 - 2.2, 3000 - 0.4, 0));
  await page.waitForTimeout(800);
  await tap('KeyF');
  await page.waitForFunction(() => window.__gtaDebug.shopUi?.isOpen, null, { timeout: 10_000 });
  await page.waitForTimeout(500);
  let s = await panel();
  check('shop open: body class + data-ui-modal', s.open && s.modal && /shop-open/.test(s.bodyClass) && /ui-panel-open/.test(s.bodyClass), s.bodyClass);
  check('panel inside 640x360', s.panel.t >= 0 && s.panel.b <= 360 && s.panel.l >= 0 && s.panel.r <= 640, JSON.stringify(s.panel));
  check('Close button visible without scrolling', s.close && s.close.b <= 360 && s.close.t >= 0 && s.close.h >= 44, JSON.stringify(s.close));
  check('list scrolls (more cards than fit)', s.list.scroll > s.list.client, JSON.stringify(s.list));
  await shot('shop-open');
  // keys: S x3, Enter buys that record; E previews; D tab; Escape closes
  const cash0 = s.cash;
  await tap('KeyS'); await tap('KeyS'); await tap('KeyS');
  s = await panel(); check('selection moved with S', s.sel === 3, String(s.sel));
  await tap('Enter');
  s = await panel(); check('Enter bought the selected record', s.cash < cash0 || s.records > 0, `${cash0} -> ${s.cash}`);
  await tap('KeyE'); await page.waitForTimeout(500);
  await tap('KeyD'); s = await panel(); check('D switched to Your crate', s.tab === 'Your crate', s.tab);
  await shot('shop-crate');
  await tap('KeyA');
  const before = await pos();
  await tap('KeyW'); await tap('KeyS'); // WASD must not move the player while the panel is open
  const after = await pos();
  check('WASD does not walk the player while the panel is open', before.x === after.x && before.z === after.z, JSON.stringify([before, after]));
  await tap('KeyX');
  await page.waitForTimeout(300);
  s = await panel();
  check('X closed the shop', !s.open && !/shop-open/.test(s.bodyClass) && !s.modal, JSON.stringify(s));
  // reopen and close with Escape and with the Close button
  await tap('KeyF'); await page.waitForFunction(() => window.__gtaDebug.shopUi?.isOpen, null, { timeout: 5000 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape closed the shop', !(await D(() => window.__gtaDebug.shopUi.isOpen)));
  await tap('KeyF'); await page.waitForFunction(() => window.__gtaDebug.shopUi?.isOpen, null, { timeout: 5000 });
  await D(() => document.exitPointerLock()); // main.ts passes releasePointerLock once FOR FABLE's lines are in; until then release the capture by hand
  await page.waitForTimeout(300);
  const hit = await D(() => { const b = document.querySelector('.shop-close').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { at: [b.left + b.width / 2, b.top + b.height / 2], cls: e?.className, tag: e?.tagName, panelHidden: document.querySelector('.shop-root').hidden, root: JSON.stringify(document.querySelector('.shop-root').getBoundingClientRect()), panel: JSON.stringify(document.querySelector('.shop-panel').getBoundingClientRect()) }; });
  log('close hit-test', JSON.stringify(hit));
  check('the Close button is what a click at its centre hits', hit.cls === 'shop-btn shop-close', JSON.stringify(hit));
  await page.mouse.click(hit.at[0], hit.at[1]); await page.waitForTimeout(300);
  check('Close button closed the shop', !(await D(() => window.__gtaDebug.shopUi.isOpen)));

  // --- decks at home
  await D(() => window.__gtaDebug.interiors.exit()); await waitState('outside');
  await D(() => window.__gtaDebug.teleport(-10.4, -36, Math.PI)); await page.waitForTimeout(600);
  for (let i = 0; i < 6 && (await state()) === 'outside'; i++) { await tap('KeyF'); await page.waitForTimeout(1500); }
  await waitState('inside');
  await D(() => window.__gtaDebug.teleport(3000 + 2.6, 3240 - 7 / 2 + 1.65, 0)); await page.waitForTimeout(600);
  await tap('KeyF'); await page.waitForFunction(() => window.__gtaDebug.djUi?.isOpen, null, { timeout: 10_000 });
  await page.waitForTimeout(500);
  const dj = await D(() => {
    const r = (el) => { const b = el?.getBoundingClientRect(); return b ? { t: b.top, b: b.bottom, l: b.left, r: b.right } : null; };
    return { panel: r(document.querySelector('.dj-root:not([hidden]) .dj-panel')), fin: r(document.querySelector('.dj-root:not([hidden]) .dj-finish')), close: r(document.querySelector('.dj-root:not([hidden]) .dj-close')), cls: document.body.className, modal: !!document.querySelector('[data-ui-modal]:not([hidden])') };
  });
  check('decks: panel inside 640x360 and Finish / Close visible', dj.panel.b <= 360 && dj.panel.r <= 640 && dj.fin.b <= 360 && dj.close.b <= 360, JSON.stringify(dj));
  check('decks: body class + data-ui-modal', /dj-open/.test(dj.cls) && dj.modal, dj.cls);
  await shot('decks');
  await tap('KeyS'); await tap('Enter');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape left the booth', !(await D(() => window.__gtaDebug.djUi.isOpen)));
  check('no console errors', errors.length === 0, JSON.stringify(errors));
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (e) { console.error('[shopux] failed:', e.stack ?? e.message, JSON.stringify(errors)); process.exitCode = 1; console.log(JSON.stringify({ results, errors })); }
finally { clearTimeout(hardStop); await browser?.close(); preview.kill(); }
