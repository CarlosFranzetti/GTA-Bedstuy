// Crowd + clutter audit.
//
//   node scripts/crowd-audit.mjs --clutter [--min-share 0.4] [--out file.json]
//       No browser. Builds the real map's clutter (PropsGen) through Vite SSR and prints items per block face for the phone, low and
//       medium tiers (per 100 m of frontage), flags faces that are empty or far below the median where the tier should have some.
//
//   scripts/swarm-render.sh node scripts/crowd-audit.mjs --peds [--port 4437] [--q low] [--radius 60] [--window 40] [--no-build]
//                                    [--dist <dir>] [--out file.json]
//       Playwright (like popin-check.mjs). For every 10 game-minutes of a day: set the clock, run the real sim for `window` seconds and
//       sample every simulated 1 s the pedestrians within `radius` m of two points (the spawn and a Kosciuszko St corner). Prints the
//       table with the BIBLE section 7 target (tier budget x curve), the min/mean/max in the sample window, the number of arrivals and
//       departures inside the radius (bursts) and the longest empty gap, then lists the bursts and empties.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const o = { clutter: false, peds: false, port: 4437, q: 'low', radius: 60, window: 40, build: true, dist: null, out: null, minShare: 0.4, chunk: 12, other: null, hours: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--clutter') o.clutter = true;
  else if (a === '--peds') o.peds = true;
  else if (a === '--port') o.port = Number(argv[++i]);
  else if (a === '--q') o.q = argv[++i];
  else if (a === '--radius') o.radius = Number(argv[++i]);
  else if (a === '--window') o.window = Number(argv[++i]);
  else if (a === '--chunk') o.chunk = Number(argv[++i]);
  else if (a === '--min-share') o.minShare = Number(argv[++i]);
  else if (a === '--other') o.other = argv[++i].split(',').map(Number);
  else if (a === '--hours') o.hours = argv[++i].split(',').map(Number);
  else if (a === '--dist') { o.dist = resolve(argv[++i]); o.build = false; }
  else if (a === '--no-build') o.build = false;
  else if (a === '--out') o.out = resolve(argv[++i]);
}
if (!o.clutter && !o.peds) { o.clutter = true; o.peds = true; }
const out = {};

// ------------------------------------------------------------------------------------------------ clutter per block face
async function clutterAudit() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), appType: 'custom', server: { middlewareMode: true }, logLevel: 'error', plugins: [] });
  try {
    const THREE = await server.ssrLoadModule('three');
    const { Rng } = await server.ssrLoadModule('/src/core/Rng.ts');
    const { buildGrid, loadBedstuyData } = await server.ssrLoadModule('/src/world/Grid.ts');
    const { subdivideLots } = await server.ssrLoadModule('/src/world/LotSubdivider.ts');
    const { buildProps } = await server.ssrLoadModule('/src/world/PropsGen.ts');
    const { faceFrame } = await server.ssrLoadModule('/src/world/props/common.ts');
    const cache = new Map();
    const named = (n) => { let m = cache.get(n); if (!m) { m = new THREE.MeshBasicMaterial({ name: n }); cache.set(n, m); } return m; };
    const mats = { get: (k, v) => named(`${k}:${v ?? 0}`), awning: (c, t) => named(`a${c}${t}`), sign: (t) => named(t), carPaint: (c) => named(c), setNight: () => {} };
    const data = loadBedstuyData();
    const grid = buildGrid(data);
    const { getBedstuyFaces } = await server.ssrLoadModule('/src/world/data/faces.ts');
    const root = new Rng(data.seed); // as main.ts / WorldBuilder: lots and props fork the world rng
    const lots = subdivideLots(grid, data.pois, root.fork('lots'), getBedstuyFaces());
    const built = buildProps(grid, lots, mats, root.fork('props'));
    const SOLID = new Set(['newsbox', 'mailbox', 'bikeRack', 'planter', 'bollard', 'sandwichBoard', 'crates', 'barricade', 'bags']);
    const faces = [];
    for (const b of grid.blocks) for (const f of b.faces) {
      const L = faceFrame(f).L, key = `${b.id}${f.side}`;
      faces.push({ key, street: f.streetId, L, props: [0, 0, 0], decals: [0, 0, 0], kinds: {} });
    }
    const byKey = new Map(faces.map((f) => [f.key, f]));
    for (const p of built.clutter.placements) {
      const f = byKey.get(p.faceKey); if (!f) continue;
      const tgt = SOLID.has(p.kind) ? f.props : f.decals;
      tgt[p.rank] += 1;
      f.kinds[p.kind] = (f.kinds[p.kind] ?? 0) + 1;
    }
    // tier totals: phone draws no clutter (rank 0), low rank 1, medium rank 1+2
    const row = (f) => {
      const low = f.props[1] + f.decals[1], med = low + f.props[2] + f.decals[2];
      const lowSolid = f.props[1];
      return { ...f, phone: 0, low, medium: med, lowSolid, lowPer100: (low / f.L) * 100, medPer100: (med / f.L) * 100 };
    };
    const rows = faces.map(row);
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
    const longRows = rows.filter((r) => r.L >= 25);
    const mLow = median(longRows.map((r) => r.lowPer100)), mMed = median(longRows.map((r) => r.medPer100));
    for (const r of rows) {
      r.flag = [];
      if (r.L >= 25 && r.low === 0) r.flag.push('EMPTY@low');
      else if (r.L >= 25 && r.lowPer100 < o.minShare * mLow) r.flag.push('LOW@low');
      if (r.L >= 25 && r.medium === 0) r.flag.push('EMPTY@medium');
      else if (r.L >= 25 && r.medPer100 < o.minShare * mMed) r.flag.push('LOW@medium');
    }
    console.log(`\n## Clutter per block face (${rows.length} faces, ${built.clutter.placements.length} items, median per 100 m: low ${mLow.toFixed(1)}, medium ${mMed.toFixed(1)}; phone draws none by design)`);
    console.log('| face | street | len m | phone | low | low/100m | medium | med/100m | solid@low | flag |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    const show = rows.filter((r) => r.flag.length).sort((a, b) => a.lowPer100 - b.lowPer100);
    for (const r of show) console.log(`| ${r.key} | ${r.street} | ${r.L.toFixed(0)} | 0 | ${r.low} | ${r.lowPer100.toFixed(1)} | ${r.medium} | ${r.medPer100.toFixed(1)} | ${r.lowSolid} | ${r.flag.join(' ')} |`);
    console.log(`\nflagged ${show.length} of ${rows.length} faces (rows above). Totals: low ${rows.reduce((s, r) => s + r.low, 0)} items, medium ${rows.reduce((s, r) => s + r.medium, 0)} items; faces with 0 at low: ${rows.filter((r) => r.low === 0).length} (${rows.filter((r) => r.low === 0 && r.L >= 25).length} of them >= 25 m).`);
    // by street
    const bySt = new Map();
    for (const r of rows) { const e = bySt.get(r.street) ?? { n: 0, L: 0, low: 0, med: 0, empty: 0 }; e.n++; e.L += r.L; e.low += r.low; e.med += r.medium; if (r.low === 0 && r.L >= 25) e.empty++; bySt.set(r.street, e); }
    console.log('\n| street | faces | length m | low | low/100m | medium | med/100m | empty@low |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const [s, e] of [...bySt].sort((a, b) => a[1].low / a[1].L - b[1].low / b[1].L)) console.log(`| ${s} | ${e.n} | ${e.L.toFixed(0)} | ${e.low} | ${((e.low / e.L) * 100).toFixed(1)} | ${e.med} | ${((e.med / e.L) * 100).toFixed(1)} | ${e.empty} |`);
    out.clutter = { medianLow: mLow, medianMed: mMed, flagged: show.map((r) => ({ key: r.key, street: r.street, L: r.L, low: r.low, medium: r.medium, flag: r.flag })) };
  } finally { await server.close(); }
}

// ------------------------------------------------------------------------------------------------ pedestrians over a day
async function pedAudit() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  let distDir = o.dist ?? resolve(ROOT, 'dist');
  if (o.build) {
    distDir = resolve(ROOT, 'node_modules', '.cache', `crowd-dist-${o.port}`);
    mkdirSync(distDir, { recursive: true });
    console.log('[crowd] building into', distDir);
    const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', distDir, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) { console.error('[crowd] build failed'); process.exit(1); }
  }
  if (!existsSync(resolve(distDir, 'index.html'))) { console.error(`[crowd] no index.html in ${distDir}`); process.exit(1); }
  const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', distDir, '--port', String(o.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  let dead = false; preview.on('exit', () => { dead = true; });
  const base = `http://localhost:${o.port}`;
  for (let i = 0; i < 80 && !dead; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 250)); }
  if (dead) { console.error(`[crowd] preview exited (port ${o.port} busy?)`); process.exit(1); }
  const hardStop = setTimeout(() => { console.error('[crowd] hard timeout'); preview.kill(); process.exit(2); }, 3_000_000);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let res = null;
  const allHours = o.hours ?? Array.from({ length: 144 }, (_, i) => i / 6);
  const chunks = [];
  for (let i = 0; i < allHours.length; i += o.chunk) chunks.push(allHours.slice(i, i + o.chunk));
  try {
   for (const chunk of chunks) { // a fresh page per chunk: one long page run exhausts the headless GPU process
    console.error(`[crowd] hours ${chunk[0]}..${chunk[chunk.length - 1]}`);
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    page.on('pageerror', (e) => console.error('[crowd] pageerror', String(e).slice(0, 200)));
    await page.goto(`${base}/?q=${o.q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 180_000 });
    await page.mouse.click(160, 90); await page.waitForTimeout(600);
    const resume = page.getByRole('button', { name: 'Resume' });
    if (await resume.isVisible().catch(() => false)) { await resume.click(); await page.waitForTimeout(300); }
    const part = await page.evaluate(async (o) => {
      const d = window.__gtaDebug;
      d.stopLoop();
      const T = d.traffic;
      const spawn = { x: d.player.body.pos.x, z: d.player.body.pos.z };
      const pts = { spawn, other: o.other ? { x: o.other[0], z: o.other[1] } : null };
      if (!pts.other) {
        // another street point: a sidewalk node far from the spawn on a different street, found from the pedestrian graph
        const nodes = Object.values(d.grid.sidewalks.nodes);
        let best = null, bd = 0;
        for (const n of nodes) { const dd = Math.hypot(n.pos.x - spawn.x, n.pos.z - spawn.z); if (dd > 260 && dd < 420) { best = n; break; } }
        pts.other = best ? { x: best.pos.x, z: best.pos.z } : { x: spawn.x + 300, z: spawn.z };
      }
      const hours = o.hours ?? Array.from({ length: 144 }, (_, i) => i / 6);
      const rows = [];
      let prevSets = null;
      const settle = (h) => { d.dayNight.timeOfDay = h; };
      for (const h of hours) {
        const rec = {};
        for (const [name, pt] of Object.entries(pts)) {
          d.teleport(pt.x, pt.z, 0);
          settle(h);
          d.step(60 * 3); // 3 s: lets the player-relative cull / swap state follow the teleport
          const counts = [], seen = new Set();
          let arrive = 0, depart = 0, prev = new Set();
          const N = o.window;
          for (let s = 0; s < N; s++) {
            settle(h);
            d.step(60);
            const cur = new Set();
            for (const p of T.peds) if (Math.hypot(p.body.pos.x - pt.x, p.body.pos.z - pt.z) <= o.radius) cur.add(p.body.id);
            if (s > 0) { for (const id of cur) if (!prev.has(id)) arrive++; for (const id of prev) if (!cur.has(id)) depart++; }
            prev = cur;
            counts.push(cur.size);
          }
          let gap = 0, maxGap = 0;
          for (const c of counts) { if (c === 0) { gap++; maxGap = Math.max(maxGap, gap); } else gap = 0; }
          const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
          let nearest = 1e9; for (const p of T.peds) nearest = Math.min(nearest, Math.hypot(p.body.pos.x - pt.x, p.body.pos.z - pt.z));
          rec[name] = { nearest: Math.round(nearest), mean, min: Math.min(...counts), max: Math.max(...counts), arrive, depart, maxGap, total: T.peds.length, target: T.pedTarget };
        }
        rows.push({ h, ...rec });
      }
      return { rows, pts, budgetFull: T.density.peds };
    }, { ...o, hours: chunk });
    await page.close().catch(() => {});
    if (!res) res = part; else res.rows.push(...part.rows);
   }
  } finally { clearTimeout(hardStop); await browser.close(); preview.kill(); }
  if (!res) return;
  // BIBLE section 7 target for the tier: budget at hour 18-20 (factor 1.0) x curve. The in-radius target is the whole-map target x
  // the share of the map's pavement inside the radius around the point (not known here), so print the map-wide target and the measured total.
  const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  console.log(`\n## Peds within ${o.radius} m at quality ${o.q} (sample window ${o.window} s per point; points: spawn ${res.pts.spawn.x.toFixed(0)},${res.pts.spawn.z.toFixed(0)}  other ${res.pts.other.x.toFixed(0)},${res.pts.other.z.toFixed(0)})`);
  console.log(`| hour | BIBLE factor (budget ${res.budgetFull}) | target total | actual total | spawn mean (min-max) | spawn +in/-out | spawn max gap s | spawn nearest m | other mean (min-max) | other +in/-out | other max gap s |`);
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  const bursts = [], empties = [];
  for (const r of res.rows) {
    console.log(`| ${hm(r.h)} | ${(r.spawn.target / Math.max(1, res.budgetFull)).toFixed(2)} | ${r.spawn.target} | ${r.spawn.total} | ${r.spawn.mean.toFixed(1)} (${r.spawn.min}-${r.spawn.max}) | +${r.spawn.arrive}/-${r.spawn.depart} | ${r.spawn.maxGap} | ${r.spawn.nearest} | ${r.other.mean.toFixed(1)} (${r.other.min}-${r.other.max}) | +${r.other.arrive}/-${r.other.depart} | ${r.other.maxGap} |`);
    for (const k of ['spawn', 'other']) {
      const c = r[k];
      if (c.arrive + c.depart >= 6 && Math.max(c.arrive, c.depart) >= 4) bursts.push(`${hm(r.h)} ${k}: +${c.arrive}/-${c.depart} in ${o.window} s`);
      if (c.maxGap >= 10 && r.spawn.target >= 3) empties.push(`${hm(r.h)} ${k}: empty for ${c.maxGap} s`);
    }
  }
  console.log(`\nbursts (>= 4 arrivals or departures in the window): ${bursts.length}`); bursts.slice(0, 30).forEach((b) => console.log('  ' + b));
  console.log(`empties (>= 10 s with nobody in range while target >= 3): ${empties.length}`); empties.slice(0, 30).forEach((b) => console.log('  ' + b));
  out.peds = res;
}

if (o.clutter) await clutterAudit();
if (o.peds) await pedAudit();
if (o.out) { mkdirSync(dirname(o.out), { recursive: true }); writeFileSync(o.out, JSON.stringify(out, null, 2)); console.log('wrote', o.out); }
