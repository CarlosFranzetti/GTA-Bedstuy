// Headless check of the interiors wiring: deli (buy a record), home (decks), Aftersloth (night + flag). Run as:
//   npm run build && scripts/swarm-render.sh node tests/e2e/wire-interiors.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4418;
const OUT = 'tests/e2e/__screenshots__';
const log = (...a) => console.log('[wire]', ...a);
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
  await page.goto(`http://localhost:${PORT}/?q=low&perf=0`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  await page.mouse.click(300, 200); // user gesture: starts audio
  await page.waitForTimeout(1500);
  const D = (fn, arg) => page.evaluate(fn, arg);
  const state = () => D(() => window.__gtaDebug.interiors.state);
  const waitState = (s, t = 60_000) => page.waitForFunction((x) => window.__gtaDebug.interiors.state === x, s, { timeout: t });
  const shot = (n) => page.screenshot({ path: `${OUT}/wire-${n}.png`, timeout: 120_000 });
  const goto = (x, z, h) => D(([x, z, h]) => { const d = window.__gtaDebug; d.teleport(x, z, h); }, [x, z, h]);
  const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(150); await page.keyboard.up(k); };

  // --- Wax Deli
  await goto(10.4, 34, 0); await page.waitForTimeout(800);
  const pr = await D(() => window.__gtaDebug.interiors.prompt(window.__gtaDebug.player.body.pos));
  check('deli prompt', /WAX DELI/i.test(pr), pr);
  await press('KeyF'); await waitState('inside');
  check('deli inside', (await D(() => window.__gtaDebug.interiors.current)) === 'deli');
  await page.waitForTimeout(800); await shot('deli');
  const cashBefore = await D(() => window.__gtaDebug.inventory.cash);
  // open the shop through the real action and buy a record via the UI object
  const buy = await D(() => {
    const d = window.__gtaDebug; d.ensureAudio();
    const ui = d.shopUi; if (!ui) return 'noui';
    ui.open();
    const o = ui.buy('wax-05');
    return { o, open: ui.isOpen, cash: d.inventory.cash, has: d.inventory.hasRecord('wax-05') };
  });
  log('buy', JSON.stringify(buy));
  check('shop ui exists + buy ok', buy && buy.o === 'ok' && buy.has && buy.cash < cashBefore, JSON.stringify(buy));
  await page.waitForTimeout(500); await shot('deli-shop');
  await D(() => window.__gtaDebug.shopUi.close()); log('shop closed, state', await state());
  // exit: stand at the exit spot (just inside the door)
  await D(() => { const d = window.__gtaDebug; const o = { x: 3000, z: 3000 }; d.teleport(o.x, o.z + 3.3, 0); });
  for (let i = 0; i < 3 && (await state()) === 'inside'; i++) { await page.waitForTimeout(300); await press('KeyF'); await page.waitForTimeout(1200); }
  await waitState('outside').catch(() => {});
  const posOut = await D(() => ({ ...window.__gtaDebug.player.body.pos }));
  check('deli exited to street', (await state()) === 'outside' && Math.abs(posOut.x) < 200, JSON.stringify(posOut));

  // --- Home
  await goto(-10.4, -36, Math.PI); await page.waitForTimeout(800);
  await press('KeyF'); await waitState('inside');
  check('home inside', (await D(() => window.__gtaDebug.interiors.current)) === 'home');
  await page.waitForTimeout(800); await shot('home');
  const dj = await D(() => { const d = window.__gtaDebug; d.ensureAudio(); const ui = d.djUi; if (!ui) return 'noui'; ui.open('home'); return { open: ui.isOpen }; });
  check('dj ui opens at home', dj && dj.open, JSON.stringify(dj));
  await page.waitForTimeout(600); await shot('home-decks');
  await D(() => window.__gtaDebug.djUi.leave());
  await D(() => window.__gtaDebug.interiors.exit());
  await waitState('outside');

  // --- Aftersloth
  await D(() => { const d = window.__gtaDebug; d.setHour(23.5); d.inventory.setFlag('aftersloth.unlocked'); d.inventory.setFlag('aftersloth.slot'); });
  await goto(70, -8.0, 0); await page.waitForTimeout(800);
  const cp = await D(() => window.__gtaDebug.interiors.prompt(window.__gtaDebug.player.body.pos));
  check('club prompt', /AFTERSLOTH/i.test(cp), cp);
  for (let i = 0; i < 4 && (await state()) !== 'inside'; i++) {
    await press('KeyF'); await page.waitForTimeout(1500);
    log('club try', i, JSON.stringify(await D(() => { const d = window.__gtaDebug; return { st: d.interiors.state, pos: { ...d.player.body.pos }, dj: d.djUi?.isOpen, shop: d.shopUi?.isOpen, hour: d.dayNight.timeOfDay, veh: d.player.inVehicle, locked: d.interiors.locked, prompt: d.interiors.prompt(d.player.body.pos) }; })));
  }
  await waitState('inside');
  check('club inside', (await D(() => window.__gtaDebug.interiors.current)) === 'club');
  await page.waitForTimeout(1500); await shot('club');
  await D(() => window.__gtaDebug.interiors.exit());
  await waitState('outside');
  const evs = await D(() => window.__gtaDebug.missions.insideInterior);
  check('mission bridge cleared on exit', evs === null, String(evs));
  check('no console errors', errors.length === 0, JSON.stringify(errors));
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (e) { console.error('[wire] failed:', e.stack ?? e.message, JSON.stringify(errors)); process.exitCode = 1; console.log(JSON.stringify({ results, errors })); }
finally { clearTimeout(hardStop); await browser?.close(); preview.kill(); }
