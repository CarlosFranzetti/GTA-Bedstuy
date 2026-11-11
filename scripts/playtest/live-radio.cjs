// Live radio check on the hosted build (real network; run through scripts/swarm-render.sh).
//   node scripts/playtest/live-radio.cjs                 default: Radio SC reaches 45 s of playback (old behaviour)
//   node scripts/playtest/live-radio.cjs --station kexp  one station by dial id (see src/audio/stations.ts)
//   node scripts/playtest/live-radio.cjs --all           every station in dial order, one line each + a table
//   flags: --auto (chromium autoplay flag), --url <page> (default hosted build), --secs <n> (listen time, default 25)
// A station "plays" when its widget reports PLAY_PROGRESS beyond 3 s (SoundCloud) or its audio element reports playState
// 'playing' with a moving clock (live streams). Talk (scripted) passes when the schedule has a current block.
const { chromium } = require('playwright');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const AUTO = process.argv.includes('--auto');
const ALL = process.argv.includes('--all');
const STATION = arg('--station', null);
const URL = arg('--url', 'https://gta-bedstuy.vercel.app/?q=phone');
const SECS = Number(arg('--secs', '25'));
const IDS = ['bkhouse', 'dublab', 'sc', 'weird', 'flashback', 'stoop', 'boogie', 'yard', 'dublive', 'kexp', 'rparadise', 'wfmu', 'u80s', 'talk', 'wnyc'];

(async () => {
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ args: AUTO || STATION || ALL ? ['--autoplay-policy=no-user-gesture-required'] : [], proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  const errs = []; const net = [];
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200)));
  page.on('requestfailed', (r) => { const u = r.url(); if (/soundcloud|sndcdn|somafm|kexp|wfmu|wnyc|dublab|radioparadise/.test(u)) net.push('FAIL ' + u.slice(0, 90) + ' ' + (r.failure()?.errorText || '')); });
  const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 });
  await page.evaluate(() => { window.__ev = []; window.addEventListener('message', (e) => { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d && d.method === 'playProgress') window.__pp = d.value && d.value.currentPosition; } catch {} }); });
  await page.mouse.click(422, 195);
  await page.waitForTimeout(2000);
  console.log(T(), await page.evaluate(() => { const d = window.__gtaDebug; const p = d.player.body.pos; let best = null, bd = 1e9; for (const b of d.physics.bodies()) { if (!/veh/i.test(String(b.id))) continue; const dd = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (dd < bd && dd > 0.5) { bd = dd; best = b; } } if (!best) return 'none'; d.teleport(best.pos.x + 1.6, best.pos.z + 0.2); d.step(2); return 'near ' + best.id; }));
  for (let k = 0; k < 10; k++) { await page.keyboard.press('KeyF'); await page.waitForTimeout(1500); if (await page.evaluate(() => window.__gtaDebug.player.inVehicle)) break; if (k >= 2) await page.evaluate(() => { const d = window.__gtaDebug; d.player.tryEnter(d.traffic.vehicles); }); }
  console.log(T(), 'inCar', await page.evaluate(() => window.__gtaDebug.player.inVehicle));

  const snap = () => page.evaluate(() => {
    const a = window.__gtaDebug.audio; const r = a.radio; const cur = r.current; const sc = r.currentSc; const lv = r.currentLive;
    return {
      id: cur.id, name: a.stationName.slice(0, 50), track: (a.trackName || '').slice(0, 70), type: cur.badge, needsTap: r.needsTap, pp: window.__pp,
      sc: sc ? { state: sc.status, play: sc.playState, pos: Math.round(sc.position), snd: sc.sndIndex } : null,
      live: lv ? { state: lv.status, play: lv.playState, url: lv.streamUrl.slice(0, 50), connects: lv.connects } : null,
      talk: cur.kind === 'talk' ? { progress: r.talkProgress, active: r.talk.isActive } : null,
    };
  });

  // Tunes one station and listens until it plays or SECS pass. Returns { ok, detail }.
  async function check(id) {
    await page.evaluate((id) => { window.__pp = 0; window.__gtaDebug.audio.selectRadioStation(id); }, id);
    let s = null; let ok = false; let tapped = false;
    const limit = (id === 'talk' ? 10 : SECS) * 1000;
    const start = Date.now();
    while (Date.now() - start < limit) {
      await page.waitForTimeout(1500);
      s = await snap();
      if (s.id !== id) break; // the dial moved on after a failure
      if (s.needsTap && !tapped && !AUTO && !STATION && !ALL) { tapped = true; await page.mouse.click(422, 195); }
      if (s.needsTap && !tapped) { tapped = true; await page.mouse.click(422, 195); }
      if (s.sc && s.sc.play === 'playing' && typeof s.pp === 'number' && s.pp > 3000) { ok = true; break; }
      if (s.live && s.live.play === 'playing') { ok = true; break; }
      if (s.talk && s.talk.active) { ok = true; break; }
    }
    return { id, ok, s };
  }

  if (ALL || STATION) {
    const ids = ALL ? IDS : [STATION];
    const rows = [];
    for (const id of ids) {
      const r = await check(id);
      rows.push(r);
      console.log(T(), id.padEnd(10), r.ok ? 'PLAYING' : 'NOT PLAYING', JSON.stringify(r.s && { name: r.s.name, track: r.s.track, sc: r.s.sc, live: r.s.live, id: r.s.id }));
    }
    console.log('\nid         type  result       station');
    for (const r of rows) console.log(r.id.padEnd(10), String(r.s && r.s.type).padEnd(5), (r.ok ? 'playing' : 'FAILED').padEnd(12), r.s ? r.s.name : '');
    console.log('net:', net.slice(0, 15).join('\n'));
    console.log('errs:', errs.slice(0, 5).join('\n'));
    await browser.close();
    process.exit(rows.every((r) => r.ok) ? 0 : 2);
  }

  // Default: the old Radio SC check.
  let last = '';
  for (let i = 0; i < 110; i++) {
    await page.waitForTimeout(1500);
    if (!(await page.evaluate(() => !!window.__gtaDebug.audio.radio.currentSc))) { await page.keyboard.press('KeyE'); }
    const s = await snap();
    if (i % 6 === 0) console.log(T(), JSON.stringify(s));
    if (s.sc && s.sc.play === 'blocked' && !AUTO) { console.log(T(), 'gesture click'); await page.mouse.click(422, 195); }
    if (typeof s.pp === 'number' && s.pp > 45000) { console.log(T(), 'PLAYING pos ms', s.pp); break; }
    last = JSON.stringify(s);
  }
  console.log('net:', net.slice(0, 25).join('\n'));
  console.log('errs:', errs.slice(0, 5).join('\n'));
  await browser.close();
})().catch((e) => { console.log('SCRIPT FAIL', e.message.slice(0, 300)); process.exit(1); });
