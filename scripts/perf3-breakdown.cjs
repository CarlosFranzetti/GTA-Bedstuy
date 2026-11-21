// PERF3b: triangles and draw calls per category at four fixed viewpoints, per quality tier. Counts only (software GL: no fps).
//
//   NODE_PATH=/opt/node-tools/node_modules:$PWD/node_modules scripts/swarm-render.sh node scripts/perf3-breakdown.cjs \
//       --dist <hosted build dir> --out <dir> [--tiers phone,low,medium] [--views home,junction,el,row] [--map grid|real] [--frames] [--tag before]
//
// Serves the build with `vite preview`, waits for window.__gtaReady, hides the canvas (software compositor), stops the loop and
// draws frames by hand with __gtaDebug.renderOnce(). Every mesh's onBeforeRender / onBeforeShadow is hooked for one frame, so
// the numbers are what three really sent to the GPU (visibility, frustum, layers, instance count, draw range all honoured).
// Writes <out>/<tag>-<map>.json and prints a table. --frames also saves a PNG per view and tier.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const dist = path.resolve(opt('dist', 'dist-hosted'));
const outDir = path.resolve(opt('out', '.'));
const tiers = opt('tiers', 'phone,low').split(',');
const mapName = opt('map', 'grid');
const tag = opt('tag', 'run');
const port = opt('port', '4533');
const wantViews = opt('views', 'home,junction,el,row').split(',');
const frames = flag('frames');
const ROOT = path.resolve(__dirname, '..');
fs.mkdirSync(outDir, { recursive: true });

// Viewpoints on the grid map. `at` = where the player stands (so streaming and traffic follow), `cam` = free camera or null (the game camera).
const VIEWS = {
  home: { at: [9, 20, 0], cam: null, hour: 12 },
  junction: { at: [492, 14], cam: [491, 2.3, 7.5, 514, 4, -14], hour: 12 }, // Lewis Ave x Kosciuszko St corner
  el: { at: [330, -470], cam: [330, 2.0, -486, 395, 6, -500], hour: 12 }, // Flushing Ave under the elevated line
  row: { at: [6, -520], cam: [6, 2.4, -515, 1, 6, -590], hour: 12 }, // long row of brownstones, looking north
};
const REAL_VIEWS = { home: { at: null, cam: null, hour: 12 } };

// Category from the mesh path (names of its ancestors joined with '/'). First match wins. Order matters.
const CATS = [
  ['sky', /^\/Scene\/(sky|stars|SunFlare|rain)\b|Lensflare/],
  ['skyline', /skyline/],
  ['post/other-pass', /^\/__none__/],
  ['pickups', /\/combat\b|pickup/i],
  ['effects', /mission-markers|marker|particle|smoke|puddle|headlight-cone|spot|flare|glow/i],
  ['cars far (instanced)', /car-lod/],
  ['blob/caster', /blob|caster/],
  ['shadow proxy', /shadow-proxy|shadow:/],
  ['peds hi', /(ped|human|person|people)[^/]*\/(?!.*(?:lod|far|mid))/i],
  ['peds far/mid', /(ped|human|people|crowd)/i],
  ['vehicles near', /vehicle:|vehicle|cop|car:/i],
  ['trees', /tree|leaf|foliage|canopy|cloud/i],
  ['road/sidewalk', /roads|sidewalk|curb|asphalt|ground|terrain|lot|crosswalk|marking/i],
  ['signals', /signals/],
  ['transit/el', /transit|\bel\b|train|station/i],
  ['furniture', /furniture/],
  ['props', /props/],
  ['buildings', /buildings/],
];
const categorize = (p) => { for (const [n, re] of CATS) if (re.test(p)) return n; return 'other'; };

(async () => {
  const srv = spawn('node', [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dist, '--port', port, '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = []; const errors = [];
  const save = () => fs.writeFileSync(path.join(outDir, `${tag}-${mapName}.json`), JSON.stringify({ errors, results }, null, 1));
  try {
    for (const q of tiers) {
      const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
      await page.route('**/ra-api/**', (r) => r.abort());
      const url = `http://localhost:${port}/?perf=0&q=${q}` + (mapName === 'real' ? '&map=real' : '');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 540000 });
      await page.evaluate(() => { const d = window.__gtaDebug; d.renderer.domElement.style.visibility = 'hidden'; d.stopLoop(); if (window.__gtaChunkCuller) { window.__gtaChunkCuller.buildsPerUpdate = 1e9; window.__gtaChunkCuller.streamBudget = 1e9; } });
      const views = mapName === 'real' ? REAL_VIEWS : VIEWS;
      for (const name of wantViews) {
        const v = views[name]; if (!v) continue;
        const r = await page.evaluate(({ v, wantFrame }) => {
          const d = window.__gtaDebug;
          d.clearFreeCam();
          if (v.at) { d.teleport(v.at[0], v.at[1], v.at[2]); }
          d.setHour(v.hour); d.step(v.at ? 90 : 20);
          if (v.cam) d.setFreeCam(...v.cam); else d.settle(120);
          d.settle(60);
          for (let i = 0; i < 3; i++) d.renderOnce(1, 1 / 60); // build far geometry, warm instance counts
          // hook one frame
          const rows = new Map(); const saved = [];
          const nm = (o) => (o.name || o.type).replace(/-?\d+_-?\d+/g, '#').replace(/\d+/g, 'N');
          const pathOf = (o) => { const parts = []; for (let p = o; p; p = p.parent) parts.push(nm(p)); return '/' + parts.reverse().join('/'); };
          const triOf = (m, grp) => {
            const g = m.geometry; const total = g.index ? g.index.count : (g.getAttribute('position') ? g.getAttribute('position').count : 0);
            let n;
            if (grp) n = grp.count; else n = Math.max(0, Math.min(total - g.drawRange.start, g.drawRange.count));
            return Math.floor(n / 3) * (m.isInstancedMesh ? m.count : 1);
          };
          const cam = d.cam.camera.position; const cpos = [cam.x, cam.y, cam.z];
          const bucketOf = (m) => { // ground distance from the camera to the nearest point of the mesh's bounding sphere, in 50 m steps (buildings, props, signals only)
            const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere || m.isInstancedMesh) return -1;
            const c = g.boundingSphere.center.clone().applyMatrix4(m.matrixWorld);
            return Math.max(0, Math.floor((Math.hypot(c.x - cpos[0], c.z - cpos[2]) - g.boundingSphere.radius) / 50)) * 50;
          };
          const add = (pass, m, grp) => {
            const p0 = pathOf(m);
            const bk = pass === 'scene' && /\/(buildings|props|signals)\//.test(p0) ? bucketOf(m) : -1;
            const farGeo = m.userData && m.userData.farGeo && m.geometry === m.userData.farGeo ? 'F' : '';
            const key = pass + '|' + p0 + '|' + (m.isInstancedMesh ? 'I' : 'M') + (m.isSkinnedMesh ? 'S' : '') + '|' + bk + farGeo;
            let e = rows.get(key); if (!e) { e = { pass, path: p0, inst: !!m.isInstancedMesh, tris: 0, draws: 0, bucket: bk, far: !!farGeo, merged: !!(m.userData && m.userData.farMerged) }; rows.set(key, e); }
            e.tris += triOf(m, grp); e.draws++;
          };
          d.scene.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            const pr = o.onBeforeRender, ps = o.onBeforeShadow; saved.push([o, pr, ps]);
            o.onBeforeRender = function (...a) { add('scene', o, a[5]); return pr.apply(this, a); };
            o.onBeforeShadow = function (...a) { add('shadow', o, a[6]); return ps.apply(this, a); };
          });
          let info;
          try { info = d.renderOnce(1, 1 / 60); } finally { for (const [o, pr, ps] of saved) { o.onBeforeRender = pr; o.onBeforeShadow = ps; } }
          const ri = d.renderer.info.render;
          const out = { info, tris: ri.triangles, calls: ri.calls, rows: [...rows.values()], vehicles: d.traffic.vehicles.length, peds: d.traffic.peds.length, meshes: 0, visibleMeshes: 0 };
          d.scene.traverse((o) => { if (o.isMesh) { out.meshes++; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (vis) out.visibleMeshes++; } });
          if (wantFrame) { d.renderOnce(1, 1 / 60); out.png = d.renderer.domElement.toDataURL('image/png'); }
          return out;
        }, { v, wantFrame: frames });
        if (r.png) { fs.writeFileSync(path.join(outDir, `${tag}-${mapName}-${q}-${name}.png`), Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; }
        const cats = {};
        for (const row of r.rows) {
          const c = row.pass === 'shadow' ? 'SHADOW PASS' : categorize(row.path);
          const e = (cats[c] ??= { tris: 0, draws: 0 }); e.tris += row.tris; e.draws += row.draws; row.cat = c;
        }
        const hookedDraws = r.rows.reduce((a, x) => a + x.draws, 0);
        cats['post/other passes'] = { tris: Math.max(0, r.tris - r.rows.reduce((a, x) => a + x.tris, 0)), draws: Math.max(0, r.calls - hookedDraws) };
        const byBucket = {};
        for (const row of r.rows) if (row.pass === 'scene' && row.bucket >= 0) { const k = row.cat + ' ' + String(row.bucket).padStart(3) + (row.merged ? ' merged' : row.far ? ' far' : ' full'); const e = (byBucket[k] ??= { tris: 0, draws: 0 }); e.tris += row.tris; e.draws += row.draws; }
        results.push({ byBucket, tier: q, view: name, tris: r.tris, calls: r.calls, info: r.info, vehicles: r.vehicles, peds: r.peds, meshes: r.meshes, visibleMeshes: r.visibleMeshes, cats, rows: r.rows.sort((a, b) => b.tris - a.tris).slice(0, 400) });
        save();
        console.log(`${q} ${name}: ${r.tris} tris, ${r.calls} draws (vehicles ${r.vehicles}, peds ${r.peds})`);
        if (flag('detail')) for (const k of Object.keys(byBucket).sort()) console.log('   ' + k.padEnd(28) + String(byBucket[k].draws).padStart(4) + ' draws ' + String(Math.round(byBucket[k].tris / 1000)).padStart(4) + 'k');
      }
      await page.close();
    }
  } catch (e) { console.log('FAIL', String(e).slice(0, 400)); errors.push(String(e).slice(0, 400)); }
  save();
  await browser.close(); srv.kill();
  // table
  const catNames = [...new Set(results.flatMap((r) => Object.keys(r.cats)))].sort();
  const pad = (s, n) => String(s).padStart(n);
  console.log('\n' + 'category'.padEnd(24) + results.map((r) => pad(r.tier + '/' + r.view, 16)).join(''));
  for (const c of catNames) console.log(c.padEnd(24) + results.map((r) => pad(r.cats[c] ? `${Math.round(r.cats[c].tris / 1000)}k/${r.cats[c].draws}` : '-', 16)).join(''));
  console.log('TOTAL'.padEnd(24) + results.map((r) => pad(`${Math.round(r.tris / 1000)}k/${r.calls}`, 16)).join(''));
  if (errors.length) console.log('errors:', errors.slice(0, 5));
})();
