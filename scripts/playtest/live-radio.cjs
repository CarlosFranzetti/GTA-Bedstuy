// Live radio check on the hosted build (real network; run through scripts/swarm-render.sh).
//   node scripts/playtest/live-radio.cjs                 default: Radio SC reaches 45 s of playback (old behaviour)
//   node scripts/playtest/live-radio.cjs --station kexp  one station by dial id (see src/audio/stations.ts)
//   node scripts/playtest/live-radio.cjs --all           every station in dial order, one line each + a table
//   flags: --auto (chromium autoplay flag), --url <page> (default hosted build), --secs <n> (listen time, default 25)
//   --measure --ids a,b,c [--listen 60] [--out file.json]  per station: time to first sound, position steadiness for --listen
//     seconds, stalls, seeks, every command the page sends the widget (play, pause, seekTo, skip, load, setVolume), errors.
//     Keep one job under ten minutes (about 6 stations): run it through scripts/swarm-render.sh and split the ids.
// A station "plays" when its widget reports PLAY_PROGRESS beyond 3 s (SoundCloud) or its audio element reports playState
// 'playing' with a moving clock (live streams). Talk (scripted) passes when the schedule has a current block.
const { chromium } = require('playwright');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const AUTO = process.argv.includes('--auto');
const ALL = process.argv.includes('--all');
const STATION = arg('--station', null);
const URL = arg('--url', 'https://gta-bedstuy.vercel.app/?q=phone');
const SECS = Number(arg('--secs', '25'));
const IDS = ['bkhouse', 'dublab', 'sc', 'flashback', 'boogie', 'rnsoul', 'stoop', 'yard', 'latin', 'weird', 'wfmu', 'kexp', 'u80s', 'talk', 'wnyc'];
const MEASURE = process.argv.includes('--measure');
const OUT = arg('--out', null);
const LISTEN = Number(arg('--listen', '60')); // measure mode: seconds of playback watched after the first sound

(async () => {
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ args: AUTO || STATION || ALL || MEASURE ? ['--autoplay-policy=no-user-gesture-required'] : [], proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  const errs = []; const net = []; const LOG = [];
  if (MEASURE) {
    await ctx.exposeFunction('__rlog', (e) => { LOG.push({ t: Date.now(), ...e }); });
    await ctx.addInitScript(() => {
      const send = (e) => { try { window.__rlog(e); } catch {} };
      if (location.host === 'w.soundcloud.com') {
        // inside the SoundCloud player frame: every command the page's SC.Widget sends it
        window.addEventListener('message', (e) => { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d && d.method) send({ k: 'cmd', m: d.method, v: typeof d.value === 'object' ? JSON.stringify(d.value).slice(0, 80) : d.value }); } catch {} }, true);
      } else if (window === window.top) {
        window.addEventListener('message', (e) => { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d && d.method) { if (d.method === 'playProgress') send({ k: 'evt', m: 'pp', pos: d.value && d.value.currentPosition, load: d.value && d.value.loadedProgress }); else if (d.method !== 'loadProgress') send({ k: 'evt', m: d.method }); } } catch {} }, true);
        const P = HTMLMediaElement.prototype; const play = P.play;
        P.play = function () {
          if (!this.__rw) {
            this.__rw = 1;
            for (const n of ['playing', 'waiting', 'stalled', 'pause', 'emptied', 'error', 'ended', 'seeking', 'canplay']) this.addEventListener(n, () => send({ k: 'media', m: n, ct: this.currentTime, rs: this.readyState }));
            let last = -1; setInterval(() => { if (!this.paused && this.currentTime !== last) { last = this.currentTime; send({ k: 'media', m: 'tick', ct: this.currentTime }); } }, 500);
            const d = Object.getOwnPropertyDescriptor(P, 'volume');
            Object.defineProperty(this, 'volume', { get() { return d.get.call(this); }, set(v) { send({ k: 'media', m: 'volume', v }); d.set.call(this, v); } });
          }
          return play.apply(this, arguments);
        };
      }
    });
  }
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200)));
  page.on('requestfailed', (r) => { const u = r.url(); if (/soundcloud|sndcdn|somafm|kexp|wfmu|wnyc|dublab|radioparadise/.test(u)) net.push('FAIL ' + u.slice(0, 90) + ' ' + (r.failure()?.errorText || '')); });
  const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 });
  await page.evaluate(() => { try { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; } catch {} });
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


  if (MEASURE) {
    const ids = (arg('--ids', IDS.join(','))).split(',');
    const results = [];
    for (const id of ids) {
      const tSel = Date.now();
      const iBeg = LOG.length;
      await page.evaluate((id) => { window.__pp = 0; window.__gtaDebug.audio.selectRadioStation(id); }, id);
      let tapped = false; let first = 0; let sName = '';
      // wait for the first sound (position > 0 for SoundCloud, a 'playing' media event for streams), at most 45 s
      while (Date.now() - tSel < 45000) {
        await page.waitForTimeout(500);
        const ev = LOG.slice(iBeg);
        const hit = ev.find((e) => (e.k === 'evt' && e.m === 'pp' && e.pos > 0) || (e.k === 'media' && e.m === 'playing'));
        if (hit) { first = hit.t; break; }
        const s = await snap(); sName = s.name;
        if (s.id === 'talk') { first = Date.now(); break; }
        if (s.needsTap && !tapped) { tapped = true; await page.mouse.click(422, 195); }
      }
      if (first) await page.waitForTimeout(LISTEN * 1000); else await page.waitForTimeout(3000);
      const end = Date.now();
      const s = await snap();
      const ev = LOG.slice(iBeg);
      // SoundCloud: steadiness from playProgress samples after the first sound
      const pp = ev.filter((e) => e.k === 'evt' && e.m === 'pp' && typeof e.pos === 'number' && e.t >= first);
      const tk = ev.filter((e) => e.k === 'media' && e.m === 'tick' && e.t >= first);
      const series = pp.length ? pp.map((e) => [e.t, e.pos / 1000]) : tk.map((e) => [e.t, e.ct]);
      const stalls = []; const jumps = [];
      let lastAdv = series.length ? series[0] : null;
      for (let i = 1; i < series.length; i++) {
        const [t, p] = series[i]; const [pt, pp0] = series[i - 1];
        const dw = (t - pt) / 1000; const dp = p - pp0;
        if (dp < -0.5 || dp > dw + 2.5) jumps.push({ at: +((t - tSel) / 1000).toFixed(1), from: +pp0.toFixed(1), to: +p.toFixed(1) });
        if (dp > 0.05 && dp <= dw + 2.5) { const gap = (t - lastAdv[0]) / 1000; if (gap > 2.0) stalls.push({ at: +((lastAdv[0] - tSel) / 1000).toFixed(1), secs: +gap.toFixed(1) }); lastAdv = series[i]; }
      }
      if (lastAdv && (end - lastAdv[0]) / 1000 > 2.0 && series.length) stalls.push({ at: +((lastAdv[0] - tSel) / 1000).toFixed(1), secs: +((end - lastAdv[0]) / 1000).toFixed(1), open: true });
      const adv = series.length > 1 ? series[series.length - 1][1] - series[0][1] : 0;
      const wall = series.length > 1 ? (series[series.length - 1][0] - series[0][0]) / 1000 : 0;
      const cmds = {}; for (const e of ev.filter((e) => e.k === 'cmd')) cmds[e.m] = (cmds[e.m] || 0) + 1;
      const vol = ev.filter((e) => (e.k === 'cmd' && e.m === 'setVolume') || (e.k === 'media' && e.m === 'volume'));
      const distinctVol = new Set(vol.map((e) => String(e.v))).size;
      const waits = ev.filter((e) => e.k === 'media' && (e.m === 'waiting' || e.m === 'stalled' || e.m === 'emptied' || e.m === 'error')).map((e) => ({ at: +((e.t - tSel) / 1000).toFixed(1), m: e.m }));
      const evts = {}; for (const e of ev.filter((e) => e.k === 'evt' && e.m !== 'pp')) evts[e.m] = (evts[e.m] || 0) + 1;
      const timeline = ev.filter((e) => e.k === 'cmd' && e.m !== 'getVolume').map((e) => `${((e.t - tSel) / 1000).toFixed(1)}s ${e.m}${e.v !== undefined && e.v !== null ? '(' + String(e.v).slice(0, 30) + ')' : ''}`);
      const r = { id, station: s.name, track: s.track, ok: !!first, ttfs: first ? +((first - tSel) / 1000).toFixed(1) : null, watched: +((end - (first || end)) / 1000).toFixed(0), advanced: +adv.toFixed(1), wall: +wall.toFixed(1), stalls, jumps, cmds, volCalls: vol.length, volDistinct: distinctVol, waits, evts, sc: s.sc, live: s.live, tapped, timeline: timeline.slice(0, 60) };
      results.push(r);
      console.log(T(), id.padEnd(10), JSON.stringify({ ...r, timeline: undefined }));
    }
    console.log('\nid         first(s) adv/wall(s)  stalls  jumps  play pause seek skip load vol(distinct) errors');
    for (const r of results) console.log(r.id.padEnd(10), String(r.ttfs).padStart(7), (r.advanced + '/' + r.wall).padStart(12), String(r.stalls.length).padStart(6), String(r.jumps.length).padStart(6), String(r.cmds.play || 0).padStart(5), String(r.cmds.pause || 0).padStart(5), String(r.cmds.seekTo || 0).padStart(4), String(r.cmds.skip || 0).padStart(4), String(r.cmds.load || 0).padStart(4), (r.volCalls + '(' + r.volDistinct + ')').padStart(8), (r.evts.error || 0) + r.waits.filter((w) => w.m === 'error').length);
    console.log('net:', net.slice(0, 15).join('\n')); console.log('errs:', errs.slice(0, 5).join('\n'));
    if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ url: URL, results, net, errs }, null, 1));
    await browser.close();
    process.exit(0);
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
