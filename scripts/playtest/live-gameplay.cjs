const { chromium } = require('playwright');
const { spawn } = require('child_process');
const LIVE = process.argv.includes('--live');
(async () => {
  let srv = null;
  if (!LIVE) { srv = spawn('node', ['/home/user/GTA-Bedstuy/node_modules/vite/bin/vite.js', 'preview', '--outDir', (process.env.DIST || __dirname + '/dist'), '--port', '4452', '--strictPort'], { cwd: '/home/user/GTA-Bedstuy', stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500)); }
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => { if (!/aborted without reason/.test(e.message)) errs.push(e.message.slice(0, 160)); });
  await page.goto(LIVE ? 'https://gta-bedstuy.vercel.app/?q=phone' : 'http://localhost:4452/?q=phone', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 });
  await page.mouse.click(422, 195); await page.waitForTimeout(2500);
  const R = []; const ok = (name, pass, detail) => { R.push((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' (' + detail + ')' : '')); };
  const pos = () => page.evaluate(() => { const d = window.__gtaDebug; const b = d.player.vehicle ? d.player.vehicle.body : d.player.body; return { x: b.pos.x, z: b.pos.z, car: d.player.inVehicle }; });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const sim = (secs) => page.evaluate((n) => { const d = window.__gtaDebug; for (let i = 0; i < n; i += 30) d.step(Math.min(30, n - i)); }, Math.round(secs * 60));
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(150); await sim(ms / 1000); await page.keyboard.up(key); await page.waitForTimeout(100); };
  // 1 walk
  let a = await pos(); await hold('KeyW', 4000); let b = await pos();
  ok('walk forward', dist(a, b) > 1.5, dist(a, b).toFixed(1) + ' m in 4 game-seconds');
  // 2 enter car
  await page.evaluate(() => { const d = window.__gtaDebug; const p = d.player.body.pos; let best = null, bd = 1e9; for (const v of d.traffic.vehicles) { const dd = Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z); const sp = Math.hypot(v.body.vel.x, v.body.vel.z); if (dd < bd && sp < 0.2) { bd = dd; best = v; } } if (best) { d.teleport(best.body.pos.x + 1.7, best.body.pos.z + 0.3); d.step(2); } });
  for (let k = 0; k < 6; k++) { await page.keyboard.down('KeyF'); await page.waitForTimeout(400); await page.keyboard.up('KeyF'); await sim(3); if ((await pos()).car) break; }
  ok('enter car with F', (await pos()).car);
  // 3 drive
  a = await pos(); await hold('KeyW', 6000); b = await pos();
  ok('drive forward', dist(a, b) > 4, dist(a, b).toFixed(1) + ' m in 6 game-seconds');
  await hold('KeyS', 3000); await hold('Space', 1500);
  // 4 exit and walk in 4 directions
  for (let k = 0; k < 6; k++) { if (!(await pos()).car) break; await page.keyboard.down('KeyF'); await page.waitForTimeout(400); await page.keyboard.up('KeyF'); await sim(2); }
  ok('exit car with F', !(await pos()).car);
  let best = 0; for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { a = await pos(); await hold(k, 2500); b = await pos(); best = Math.max(best, dist(a, b)); }
  ok('walk after exit', best > 1.5, 'best ' + best.toFixed(1) + ' m in 2.5 game-seconds');
  // 5 map and phone
  await page.keyboard.press('KeyM'); await page.waitForTimeout(800);
  ok('map opens with M', await page.evaluate(() => window.__gtaDebug.map.isOpen));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(500);
  ok('map closes', await page.evaluate(() => !window.__gtaDebug.map.isOpen));
  await page.keyboard.press('KeyP'); await page.waitForTimeout(800);
  const phoneOpen = await page.evaluate(() => !!document.querySelector('[class*=phone]') && [...document.querySelectorAll('[class*=phone]')].some((e) => e.getBoundingClientRect().height > 150));
  ok('phone opens with P', phoneOpen);
  await page.keyboard.press('KeyP'); await page.waitForTimeout(500);
  // 6 save / load
  const saved = await pos();
  const sv = await page.evaluate(() => window.__gtaDebug.saves.save('slot1'));
  await hold('KeyW', 3000);
  const moved = await pos();
  const ld = await page.evaluate(() => window.__gtaDebug.saves.load('slot1'));
  await page.waitForTimeout(1200);
  const after = await pos();
  ok('save slot', sv === true);
  ok('load restores position', ld === true && dist(after, saved) < 1.0 && dist(moved, saved) > 1.0, 'moved ' + dist(moved, saved).toFixed(1) + ' m, restored to ' + dist(after, saved).toFixed(2) + ' m');
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(R.join('\n'));
  await page.screenshot({ path: 'play-test.png' });
  await browser.close(); if (srv) srv.kill();
})().catch((e) => { console.log('SCRIPT FAIL', e.message.slice(0, 300)); process.exit(1); });
