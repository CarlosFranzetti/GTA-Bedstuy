const { chromium } = require('playwright');
const { spawn } = require('child_process');
const AUTO = process.argv.includes('--auto');
(async () => {
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ args: AUTO ? ['--autoplay-policy=no-user-gesture-required'] : [], proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  const errs = []; const net = [];
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200)));
  page.on('requestfailed', (r) => { const u = r.url(); if (/soundcloud|sndcdn/.test(u)) net.push('FAIL ' + u.slice(0, 90) + ' ' + (r.failure()?.errorText || '')); });
  page.on('response', (r) => { const u = r.url(); if (/sndcdn|media-streaming|api-widget.*(stream|tracks|resolve)/.test(u) && net.length < 60) net.push(r.status() + ' ' + u.slice(0, 90)); });
  const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  await page.goto('https://gta-bedstuy.vercel.app/?q=phone', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 });
  await page.evaluate(() => { window.__ev = []; window.addEventListener('message', (e) => { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d && d.method && d.method !== 'playProgress' && window.__ev.length < 200) window.__ev.push(Math.round(performance.now() / 1000) + ':' + d.method); if (d && d.method === 'playProgress') window.__pp = d.value && d.value.currentPosition; } catch {} }); });
  await page.mouse.click(422, 195);
  await page.waitForTimeout(2000);
  console.log(T(), await page.evaluate(() => { const d = window.__gtaDebug; const p = d.player.body.pos; let best = null, bd = 1e9; for (const b of d.physics.bodies()) { if (!/veh/i.test(String(b.id))) continue; const dd = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (dd < bd && dd > 0.5) { bd = dd; best = b; } } if (!best) return 'none'; d.teleport(best.pos.x + 1.6, best.pos.z + 0.2); d.step(2); return 'near ' + best.id; }));
  for (let k = 0; k < 10; k++) { await page.keyboard.press('KeyF'); await page.waitForTimeout(1500); if (await page.evaluate(() => window.__gtaDebug.player.inVehicle)) break; if (k >= 2) await page.evaluate(() => { const d = window.__gtaDebug; d.player.tryEnter(d.traffic.vehicles); }); }
  console.log(T(), 'inCar', await page.evaluate(() => window.__gtaDebug.player.inVehicle));
  const st = () => page.evaluate(() => { const a = window.__gtaDebug.audio; const sc = a.radio.currentSc; const fr = [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 40) + ' ' + f.getBoundingClientRect().width + 'x' + f.getBoundingClientRect().height); return { inCar: window.__gtaDebug.player.inVehicle, station: a.stationName.slice(0, 50), sc: sc ? { state: sc.state, play: sc.play_, err: sc.errStreak, url: (sc.loadedUrl || '').slice(0, 70), pos: Math.round(sc.pos), exposed: sc.exposed, paused: sc.paused, active: sc.active } : null, pp: window.__pp, ev: window.__ev.slice(-8).join(' '), fr }; });
  let last = '';
  for (let i = 0; i < 110; i++) {
    await page.waitForTimeout(1500);
    const s = await st(); const j = JSON.stringify(s);
    const c = (s.sc ? s.sc.url.split('/').slice(-2).join('/') + ' ' + s.sc.state + '/' + s.sc.play + ' err' + s.sc.err : 'nosc') + ' pp ' + Math.round(s.pp || 0); if (i % 6 === 0) console.log(T(), c);
    if (!s.sc && i % 4 === 3) { await page.keyboard.press('KeyE'); }
    if (s.sc && s.sc.play === 'blocked' && !AUTO) { console.log(T(), 'gesture click'); await page.mouse.click(422, 195); }
    if (typeof s.pp === 'number' && s.pp > 45000) { console.log(T(), 'PLAYING pos ms', s.pp); break; }
  }
  console.log('net:', net.slice(0, 25).join('\n'));
  console.log('errs:', errs.slice(0, 5).join('\n'));
  await browser.close();
})().catch((e) => { console.log('SCRIPT FAIL', e.message.slice(0, 300)); process.exit(1); });
