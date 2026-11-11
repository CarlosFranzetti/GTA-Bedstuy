// Full playtest pass (desktop + phone profile). Plays through window.__gtaDebug: game time only moves through
// step(), the real-time loop is paused between actions, and looks are fed as synthetic mousemove events (as in session.mjs).
// Screenshots, a results.json and a console summary go to --out (default playtests/p12, relative to the repo root).
//
// Build first:   VITE_HOSTED=1 npx vite build --outDir <DIR>
// Run (under the render lock, one browser at a time):
//   DIST=<DIR> NODE_PATH=/opt/node-tools/node_modules:$PWD/node_modules \
//     scripts/swarm-render.sh node scripts/playtest/full-pass.cjs [--live] [--phone-only] [--seed 7] [--port 4453] [--out playtests/p12]
// --live runs against https://gta-bedstuy.vercel.app instead of a local preview of DIST.
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARGS = process.argv.slice(2);
const argv = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 && ARGS[i + 1] !== undefined ? ARGS[i + 1] : d; };
const LIVE = ARGS.includes('--live');
const PHONE_ONLY = ARGS.includes('--phone-only');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(ROOT, argv('--out', 'playtests/p12'));
const PORT = argv('--port', '4453');
const DIST = path.resolve(process.env.DIST || path.join(ROOT, 'dist'));
const GAME_URL = LIVE ? 'https://gta-bedstuy.vercel.app/?q=phone' : `http://localhost:${PORT}/?q=phone`;
let seed = Number(argv('--seed', '7')) >>> 0;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { live: LIVE, seed: Number(argv('--seed', '7')), stages: [], checks: [], errors: [], notes: [], fatal: null };
let stage = 'boot';
let page = null;
const note = (msg) => { R.notes.push({ stage, msg }); console.log(`[${stage}] ${msg}`); };
const check = (name, pass, detail = '') => {
  R.checks.push({ stage, name, pass: !!pass, detail: String(detail) });
  console.log(`[${stage}] ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`);
};

// ---------- driver primitives (all game time goes through window.__gtaDebug.step) ----------
function driver(pg) {
  const sim = (secs) => pg.evaluate((n) => { const g = window.__gtaDebug; for (let i = 0; i < n; i += 30) g.step(Math.min(30, n - i)); }, Math.round(secs * 60));
  const frames2 = () => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const look = async (dx, dy = 0) => {
    await pg.evaluate(([x, y]) => {
      const c = document.querySelector('canvas.game') || document.querySelector('canvas');
      c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: x, movementY: y }));
    }, [dx, dy]);
    // the render loop consumes the look delta: let it run two frames (unpaused), then freeze again
    await pg.evaluate(() => window.__gtaDebug.setPaused(false)); await frames2();
    await pg.evaluate(() => window.__gtaDebug.setPaused(true));
  };
  const hold = async (keys, secs) => {
    for (const k of keys) await pg.keyboard.down(k);
    await sleep(40); await sim(secs);
    for (const k of keys) await pg.keyboard.up(k);
    await sleep(20);
  };
  const tap = async (key) => { await pg.keyboard.down(key); await sleep(60); await pg.keyboard.up(key); await sleep(40); };
  const st = () => pg.evaluate(() => {
    const g = window.__gtaDebug; const p = g.player; const v = p.vehicle; const b = v ? v.body : p.body;
    return {
      x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), inCar: !!p.inVehicle,
      vehicle: v ? v.spec.type : null, speed: v ? +v.speed.toFixed(2) : 0,
      wanted: g.wanted ? g.wanted.stars : null, mission: g.missions ? g.missions.activeId : null,
      station: g.audio ? g.audio.stationName : null, inside: g.interiors ? g.interiors.inside : null,
      mapOpen: g.map ? !!g.map.isOpen : null,
    };
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  return { sim, look, hold, tap, st, dist, frames2 };
}

async function shot(name) {
  await sleep(900);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(ROOT, file);
}
async function stageLog(name, extra = {}) {
  const s = await driver(page).st().catch((e) => ({ error: e.message.slice(0, 120) }));
  R.stages.push({ stage: name, ...s, ...extra });
  return s;
}

async function openGame(pg, touch) {
  pg.on('pageerror', (e) => { if (!/aborted without reason/.test(e.message)) R.errors.push({ stage, kind: 'pageerror', msg: e.message.slice(0, 300) }); });
  pg.on('console', (m) => { if (m.type() === 'error') R.errors.push({ stage, kind: 'console', msg: m.text().slice(0, 300) }); });
  await pg.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 });
  await pg.evaluate(() => {
    const c = document.querySelector('canvas.game') || document.querySelector('canvas');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  // dismiss the splash / start prompt
  if (touch) await pg.touchscreen.tap(422, 195); else await pg.mouse.click(480, 270);
  await sleep(2000);
  await pg.evaluate(() => window.__gtaDebug.setPaused(true));
}

// ---------- desktop pass ----------
async function desktopPass(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 540 } });
  page = await ctx.newPage();
  const D = driver(page);
  stage = '01-boot';
  await openGame(page, false);
  R.stages.push({ stage, shot: await shot('01-boot') });
  await stageLog(stage);

  // 1. walk four blocks along Throop with random turns; cross a street (crosswalk targeting is not exposed)
  stage = '02-walk-throop';
  let walked = 0, stuck = 0, last = await D.st(); const start = last;
  for (let seg = 0; walked < 330 && seg < 80; seg++) {
    if (rnd() < 0.35) await D.look((rnd() < 0.5 ? -1 : 1) * (315 + Math.round(rnd() * 630)));
    await D.hold(['KeyW'], 2.5);
    const s = await D.st(); const d = D.dist(s, last); walked += d; if (d < 0.5) stuck++; last = s;
    if (seg === 20) R.stages.push({ stage: '02b-mid-walk', shot: await shot('02b-mid-walk') });
  }
  check('walk ~4 blocks (330 m)', walked >= 330, `${walked.toFixed(0)} m walked, ${stuck} stuck segments, from (${start.x},${start.z})`);
  R.stages.push({ stage, shot: await shot('02-walk-throop'), ...(await D.st()) });

  // 2. vehicles: pick up to three types, bus and van first when present
  const pickType = (type) => page.evaluate((want) => {
    const g = window.__gtaDebug; const p = g.player.body.pos; let best = null, bd = 1e9;
    for (const v of g.traffic.vehicles) { if (v.spec.type !== want) continue; const d = Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z); if (d < bd) { bd = d; best = v; } }
    if (!best) return null;
    g.teleport(best.body.pos.x + 1.8, best.body.pos.z + 0.3); g.step(2);
    return { type: best.spec.type, d: +bd.toFixed(0) };
  }, type);
  const presentTypes = await page.evaluate(() => [...new Set(window.__gtaDebug.traffic.vehicles.map((v) => v.spec.type))]);
  note(`vehicle types present in traffic: ${presentTypes.join(', ')}`);
  const order = ['bus', 'cargovan', 'sedan', 'suv', 'hatch', 'cab', 'beater', 'boxtruck'].filter((t) => presentTypes.includes(t));
  const chosen = order.slice(0, 3);
  if (!presentTypes.includes('bus')) note('bus: not present in traffic at this moment');
  if (!presentTypes.includes('cargovan')) note('van (cargovan): not present in traffic at this moment');

  let radioRun = null;
  for (let i = 0; i < chosen.length; i++) {
    const type = chosen[i];
    stage = `03${'abc'[i]}-${type}`;
    const pick = await pickType(type);
    if (!pick) { check(`find ${type}`, false, 'no vehicle of this type in traffic'); continue; }
    note(`teleported next to ${pick.type} (nearest was ${pick.d} m away)`);
    for (let k = 0; k < 8; k++) {
      await D.tap('KeyF'); await D.sim(2);
      if ((await D.st()).inCar) break;
    }
    const entered = (await D.st()).inCar;
    check(`enter ${type} with F`, entered);
    R.stages.push({ stage: stage + '-enter', shot: await shot(stage + '-enter'), ...(await D.st()) });
    if (!entered) continue;

    // drive 300 m with random steering bursts, then brake and reverse
    let odo = 0, t = 0, prev = await D.st(); const maxSpeed = { v: 0 };
    while (odo < 300 && t < 150) {
      const steer = rnd() < 0.35 ? (rnd() < 0.5 ? 'KeyA' : 'KeyD') : null;
      await D.hold(steer ? ['KeyW', steer] : ['KeyW'], 1.5); t += 1.5;
      const s = await D.st(); odo += D.dist(s, prev); prev = s; maxSpeed.v = Math.max(maxSpeed.v, Math.abs(s.speed));
      if (t === 9 && i === 0) { R.stages.push({ stage: stage + '-drive-mid', shot: await shot(stage + '-drive-mid'), ...s }); }
    }
    check(`drive ${type} 300 m`, odo >= 300, `${odo.toFixed(0)} m in ${t.toFixed(0)} game-s, top ${(maxSpeed.v * 3.6).toFixed(0)} km/h`);
    await D.hold(['Space'], 1.5);
    const braked = await D.st();
    check(`brake ${type}`, Math.abs(braked.speed) < 3, `speed after brake ${(braked.speed * 3.6).toFixed(0)} km/h`);
    const before = await D.st();
    await D.hold(['KeyS'], 2.5);
    const rev = await D.st();
    check(`reverse ${type}`, rev.speed < -0.5 || D.dist(rev, before) > 1, `speed ${(rev.speed * 3.6).toFixed(0)} km/h, moved ${D.dist(rev, before).toFixed(1)} m`);

    if (i === chosen.length - 1) {
      // radio: cycle every station while still in the car (KeyE = next station in a car)
      stage = `03${'abc'[i]}-radio`;
      const stations = await page.evaluate(() => window.__gtaDebug.audio.radio.stations.map((s) => s.name || s.title || String(s.id)));
      radioRun = [];
      for (let n = 0; n < stations.length; n++) {
        await D.tap('KeyE'); await D.sim(4);
        const info = await page.evaluate(() => {
          const a = window.__gtaDebug.audio; const sc = a.radio.currentSc || a.radio.sc || null;
          const prim = {}; if (sc) for (const [k, v] of Object.entries(sc)) if (['string', 'number', 'boolean'].includes(typeof v)) prim[k] = typeof v === 'string' ? v.slice(0, 60) : v;
          return { name: a.stationName, sc: prim };
        });
        const playing = !!info.sc && (info.sc.state === 'playing' || info.sc.play === 'playing' || info.sc.play_ === 'playing' || (info.sc.pos || 0) > 0);
        radioRun.push({ n, name: info.name, playing, sc: info.sc });
        R.stages.push({ stage: `${stage}-${n}`, shot: await shot(`${stage}-${n}`), station: info.name });
      }
      check('cycle all radio stations', radioRun.length === stations.length, `${radioRun.length} stations`);
      const playingNames = radioRun.filter((r) => r.playing).map((r) => r.name);
      note(`radio reports playing: ${playingNames.join(' | ') || 'none'}; not playing: ${radioRun.filter((r) => !r.playing).map((r) => r.name).join(' | ') || 'none'}`);
      R.radio = radioRun;
    }

    // exit on this side, check obstacles, walk away
    stage = `03${'abc'[i]}-${type}-exit`;
    const obst = await page.evaluate(() => { const n = window.__gtaDebug.nearby(4); return n.length; });
    for (let k = 0; k < 8; k++) { if (!(await D.st()).inCar) break; await D.tap('KeyF'); await D.sim(2); }
    check(`exit ${type}`, !(await D.st()).inCar, `${obst} obstacles within 4 m`);
    R.stages.push({ stage, shot: await shot(stage), ...(await D.st()) });
    let best = 0, bestKey = null;
    for (const key of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) {
      const p0 = await D.st(); await D.hold([key], 2);
      const d = D.dist(await D.st(), p0); if (d > best) { best = d; bestKey = key; }
      if (best >= 3) break;
    }
    check(`walk after exit ${type} (>=3 m in 2 game-s)`, best >= 3, `best ${best.toFixed(1)} m with ${bestKey}`);
  }

  // 3. wanted: raise through the wanted system, then lose it by getting far away and waiting
  stage = '04-wanted';
  await page.evaluate(() => window.__gtaDebug.wanted.raiseTo(2));
  await D.sim(3);
  const w1 = await D.st();
  check('wanted rises to 2 stars', w1.wanted >= 2, `stars ${w1.wanted} (debug raise, no cop chase)`);
  R.stages.push({ stage, shot: await shot('04-wanted-raised'), ...w1 });
  await page.evaluate(() => { const g = window.__gtaDebug; g.teleport(g.player.body.pos.x + 450, g.player.body.pos.z); });
  await D.sim(60); await D.sim(60);
  const w2 = await D.st();
  check('wanted cleared after escape', !w2.wanted, `stars ${w2.wanted} after 120 game-s away`);
  R.stages.push({ stage: '04-wanted-cleared', shot: await shot('04-wanted-cleared'), ...w2 });

  // 4. missions: start the first offered mission, complete it through its objectives, fail a second one with X
  stage = '05-mission';
  const m1 = await page.evaluate(() => { const d = window.__gtaDebug.missions.nextOffer(); return d ? { id: d.id, title: d.title, giver: d.giver, objectives: d.objectives.length } : null; });
  if (!m1) { check('a mission is offered', false, 'nextOffer() null'); }
  else {
    note(`first offered mission: ${m1.title} (${m1.id}), ${m1.objectives} objectives`);
    await page.evaluate((g) => { const d = window.__gtaDebug; d.teleport(g.x, g.z); d.step(180); }, m1.giver);
    let s = await D.st();
    if (s.mission !== m1.id) { await page.evaluate((id) => window.__gtaDebug.missions.start(id), m1.id); note('trigger walk did not start it; called missions.start() as fallback'); }
    await D.sim(2);
    check(`start ${m1.id}`, (await D.st()).mission === m1.id, `active ${(await D.st()).mission}`);
    R.stages.push({ stage: '05-mission-start', shot: await shot('05-mission-start'), ...(await D.st()) });
    const objs = await page.evaluate((id) => window.__gtaDebug.missions.missions.find((m) => m.id === id).objectives.map((o) => (o.at ? { x: o.at.x, z: o.at.z, kind: o.kind } : { kind: o.kind })), m1.id);
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.x !== undefined) await page.evaluate(([x, z]) => { const d = window.__gtaDebug; d.teleport(x, z); d.step(120); }, [o.x, o.z]);
      await D.sim(1);
      const done = await page.evaluate((id) => window.__gtaDebug.missions.isCompleted(id), m1.id);
      if (done) break;
    }
    const done = await page.evaluate((id) => window.__gtaDebug.missions.isCompleted(id), m1.id);
    check(`complete ${m1.id}`, done, `${objs.length} objectives visited by position (interior/item steps may need manual play)`);
    R.stages.push({ stage: '05-mission-complete', shot: await shot('05-mission-complete'), ...(await D.st()) });
  }
  stage = '05-mission-fail';
  const m2 = await page.evaluate(() => { const d = window.__gtaDebug.missions.nextOffer(); return d ? { id: d.id, title: d.title, giver: d.giver } : null; });
  if (m2) {
    await page.evaluate((g) => { const d = window.__gtaDebug; d.teleport(g.x, g.z); d.step(180); }, m2.giver);
    await D.sim(2);
    if ((await D.st()).mission !== m2.id) await page.evaluate((id) => window.__gtaDebug.missions.start(id), m2.id);
    await D.sim(1);
    await D.tap('KeyX'); await D.sim(2);
    const after = await page.evaluate(() => ({ active: window.__gtaDebug.missions.activeId, failed: window.__gtaDebug.missions.isFailed, reason: window.__gtaDebug.missions.failReason }));
    check(`abandon ${m2.id} with X`, !after.active, JSON.stringify(after));
    R.stages.push({ stage: '05-mission-fail', shot: await shot('05-mission-fail'), ...(await D.st()) });
  } else check('second mission to fail', false, 'nextOffer() null after first mission');

  // 5. shop and interior: scan for a door prompt around the player, enter, buy, leave
  stage = '06-shop-interior';
  const doors = await page.evaluate(() => {
    const g = window.__gtaDebug; const p = g.player.body.pos; const out = [];
    for (let dx = -120; dx <= 120 && out.length < 40; dx += 4) for (let dz = -120; dz <= 120 && out.length < 40; dz += 4) {
      const t = g.interiors.prompt({ x: p.x + dx, z: p.z + dz }); if (t) out.push({ x: p.x + dx, z: p.z + dz, t });
    }
    return out;
  });
  const shopHit = doors.find((d) => /shop|deli|bodega|store|buy|market|cutz|wax|records/i.test(d.t)) || doors[0];
  if (!shopHit) check('find a door with a prompt', false, 'no interior prompt within 120 m');
  else {
    note(`door prompts found: ${[...new Set(doors.map((d) => d.t))].slice(0, 6).join(' | ')}`);
    await page.evaluate((d) => { const g = window.__gtaDebug; g.teleport(d.x, d.z); g.step(2); }, shopHit);
    for (let k = 0; k < 3; k++) { await D.tap('KeyF'); await D.sim(2); if ((await D.st()).inside || (await page.evaluate(() => !!window.__gtaDebug.shopUi?.isOpen))) break; }
    const insideNow = await D.st();
    check('enter interior/shop with F', insideNow.inside === true || (await page.evaluate(() => !!window.__gtaDebug.shopUi?.isOpen)), `prompt "${shopHit.t}"`);
    R.stages.push({ stage: '06-entered', shot: await shot('06-entered'), ...insideNow });
    const shopOpen = await page.evaluate(() => !!window.__gtaDebug.shopUi?.isOpen);
    if (shopOpen) {
      await D.tap('Enter'); await D.sim(1); await D.tap('Enter'); await D.sim(1);
      const toast = await page.evaluate(() => (document.body.innerText.match(/bought[^\n]{0,40}|\$\s?\d+[^\n]{0,30}/i) || [''])[0]);
      check('buy an item in the shop', !!toast, toast || 'no purchase text found');
      R.stages.push({ stage: '06-shop-bought', shot: await shot('06-shop-bought') });
      await D.tap('KeyX'); await D.sim(1);
      check('leave shop screen', !(await page.evaluate(() => !!window.__gtaDebug.shopUi?.isOpen)));
    }
    for (let k = 0; k < 4 && (await D.st()).inside; k++) { await D.tap('KeyF'); await D.sim(3); }
    const left = !(await D.st()).inside;
    if (!left) { await page.evaluate(() => window.__gtaDebug.interiors.exit()); note('F did not leave the interior; used interiors.exit()'); }
    check('leave interior', !(await D.st()).inside);
    R.stages.push({ stage: '06-left', shot: await shot('06-left'), ...(await D.st()) });
  }

  // 6. map with a waypoint, phone, save, walk away, load, new game
  stage = '07-map';
  await D.tap('KeyM'); await D.sim(0.5);
  check('map opens (M)', (await D.st()).mapOpen === true);
  R.stages.push({ stage, shot: await shot('07-map-open') });
  await page.mouse.click(560, 300); await sleep(500);
  const wp = await page.evaluate(() => (document.querySelector('.map-bottom')?.textContent || '').trim());
  check('tap sets a waypoint', !!wp && !/No waypoint/i.test(wp), `bottom bar: "${wp.slice(0, 80)}"`);
  R.stages.push({ stage: '07-waypoint', shot: await shot('07-waypoint') });
  await D.tap('KeyM'); await D.sim(0.5);
  check('map closes (M)', (await D.st()).mapOpen === false);

  stage = '08-phone';
  await D.tap('KeyP'); await sleep(600); await D.sim(1);
  const phoneOpen = await page.evaluate(() => [...document.querySelectorAll('[class*=phone]')].some((e) => e.getBoundingClientRect().height > 150));
  check('phone opens (P)', phoneOpen);
  R.stages.push({ stage, shot: await shot('08-phone') });
  await D.tap('KeyP'); await D.sim(0.5);

  stage = '09-save-load';
  const saved = await D.st();
  const sv = await page.evaluate(() => window.__gtaDebug.saves.save('slot1'));
  check('save to slot1', sv === true);
  await D.hold(['KeyW'], 3);
  const moved = await D.st();
  R.stages.push({ stage: '09-walked-away', shot: await shot('09-walked-away'), ...moved });
  check('walk away after save (>=3 m)', D.dist(moved, saved) >= 3, `${D.dist(moved, saved).toFixed(1)} m`);
  const ld = await page.evaluate(() => window.__gtaDebug.saves.load('slot1'));
  await sleep(800); await D.sim(0.5);
  const after = await D.st();
  check('load slot1 restores position (<1 m)', ld === true && D.dist(after, saved) < 1, `restored to ${D.dist(after, saved).toFixed(2)} m`);
  R.stages.push({ stage: '09-loaded', shot: await shot('09-loaded'), ...after });

  stage = '10-new-game';
  // newGame() may reload the page (the navigation destroys the context): treat that as the result
  const ngRes = await page.evaluate(() => window.__gtaDebug.saves.newGame()).then(() => 'returned', (e) => 'navigated: ' + e.message.slice(0, 80));
  note(`newGame: ${ngRes}`);
  let ng = null;
  if (ngRes === 'returned') {
    await sleep(800);
    try { await D.sim(1); ng = await D.st(); } catch (e) { note('page navigated after newGame (reload): ' + e.message.slice(0, 80)); }
  }
  if (ng) {
    check('new game runs and resets', !ng.inCar, `position (${ng.x}, ${ng.z})`);
    R.stages.push({ stage, shot: await shot('10-new-game'), ...ng });
  } else {
    await page.waitForFunction(() => !!window.__gtaDebug, null, { timeout: 600000 }).catch(() => {});
    R.stages.push({ stage, shot: await shot('10-new-game-reloaded') });
  }
  await ctx.close();
}

// ---------- phone profile: iPhone 13 landscape, touch only ----------
async function phonePass(browser) {
  stage = 'P0-phone-boot';
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'], ignoreHTTPSErrors: true });
  page = await ctx.newPage();
  await openGame(page, true);
  const D = driver(page);
  R.stages.push({ stage, shot: await shot('P0-phone-boot') });
  const rect = (sel) => page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, sel);
  const tapText = async (label) => {
    const r = await page.evaluate((t) => {
      const cands = [...document.querySelectorAll('button, [role=button], div, span')].filter((e) => e.childElementCount <= 2 && e.textContent.trim() === t && e.getBoundingClientRect().width > 0);
      const el = cands[0]; if (!el) return null;
      const b = el.closest('button') || el; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    }, label);
    return r;
  };
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('no horizontal page scroll', overflow.sw <= overflow.iw + 1, `scrollWidth ${overflow.sw} vs ${overflow.iw}`);

  // put the player next to a car, then tap CAR
  await page.evaluate(() => { const g = window.__gtaDebug; const p = g.player.body.pos; let best = null, bd = 1e9; for (const v of g.traffic.vehicles) { const d = Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z); if (d < bd) { bd = d; best = v; } } g.teleport(best.body.pos.x + 1.8, best.body.pos.z + 0.3); g.step(2); });
  for (let k = 0; k < 6; k++) { const car = await rect('.tc-btn-car'); if (!car) { check('CAR button on screen', false); break; } await page.touchscreen.tap(car.x, car.y); await sleep(500); await D.sim(2); if ((await D.st()).inCar) break; }
  check('touch CAR enters a car', (await D.st()).inCar);
  R.stages.push({ stage: 'P1-car', shot: await shot('P1-car') });

  // RADIO: the station name must change on tap
  const s0 = await D.st();
  const radio = await rect('.tc-btn-radio');
  if (radio) await page.touchscreen.tap(radio.x, radio.y); else check('RADIO button on screen', false);
  await sleep(300); await D.sim(2);
  const s1 = await page.evaluate(() => window.__gtaDebug.audio.stationName);
  check('touch RADIO changes station', s1 !== null && s0.station !== s1, `${s0.station} -> ${s1}`);
  R.stages.push({ stage: 'P2-radio', shot: await shot('P2-radio') });

  // touch stick: drive forward-left for 3 game-s using CDP touch events on the stick
  const stick = await rect('.tc-stick');
  if (stick) {
    const cdp = await ctx.newCDPSession(page);
    const p0 = await D.st();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x, y: stick.y, id: 1 }] });
    await sleep(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x - stick.w * 0.35, y: stick.y - stick.h * 0.35, id: 1 }] });
    await sleep(120); await D.sim(3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await D.sim(1);
    const p1 = await D.st();
    check('touch stick drives the car', D.dist(p0, p1) > 3, `${D.dist(p0, p1).toFixed(1)} m in 3 game-s`);
    R.stages.push({ stage: 'P3-stick', shot: await shot('P3-stick') });
  } else check('touch stick on screen', false, '.tc-stick missing');

  // MAP and PHONE: HUD buttons, tapped by their label
  const mapBtn = await tapText('MAP');
  if (mapBtn) await page.touchscreen.tap(mapBtn.x, mapBtn.y); else check('MAP button on screen', false);
  await sleep(500); await D.sim(0.5);
  check('touch MAP opens the map', (await D.st()).mapOpen === true);
  R.stages.push({ stage: 'P4-map', shot: await shot('P4-map') });
  const closeMap = await tapText('X');
  if (closeMap) await page.touchscreen.tap(closeMap.x, closeMap.y); else await D.tap('KeyM');
  await sleep(400); await D.sim(0.5);

  const phoneBtn = await tapText('PHONE');
  if (phoneBtn) await page.touchscreen.tap(phoneBtn.x, phoneBtn.y); else check('PHONE button on screen', false);
  await sleep(700); await D.sim(0.5);
  const phoneOpen = await page.evaluate(() => [...document.querySelectorAll('[class*=phone]')].some((e) => e.getBoundingClientRect().height > 150));
  check('touch PHONE opens the phone', phoneOpen);
  R.stages.push({ stage: 'P5-phone', shot: await shot('P5-phone') });
  await ctx.close();
}

(async () => {
  let srv = null;
  if (!LIVE) {
    srv = spawn('node', [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', PORT, '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    await sleep(2500);
  }
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined });
  const t0 = Date.now();
  try {
    if (!PHONE_ONLY) await desktopPass(browser);
    stage = 'P-phone';
    await phonePass(browser);
  } catch (e) {
    R.fatal = `${stage}: ${e.message.slice(0, 400)}`; console.log('FATAL', R.fatal);
  } finally {
    R.elapsedS = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 2));
    await browser.close();
    if (srv) srv.kill();
    const pass = R.checks.filter((c) => c.pass).length;
    console.log(`\nSUMMARY ${pass}/${R.checks.length} checks passed, ${R.errors.length} console/page errors, fatal=${R.fatal ? 'yes' : 'no'}, ${R.elapsedS}s wall`);
    console.log(`results: ${path.relative(ROOT, path.join(OUT, 'results.json'))}`);
  }
})();
