// Where the single-file artifact's bytes go, by category. Release gate helper (scripts/gate.sh) and size triage.
// Usage: node scripts/artifact-breakdown.mjs --single <dir with single-file index.html> [--hosted <hosted build dir built with --sourcemap>] [--json out.json]
//  - Inlined data: URIs are identified by content against the hosted build's asset files (same bytes, hashed names) and grouped.
//  - Inline JS is split by source module with the hosted build's source maps (main + three chunks), scaled to the inline size.
// Categories are coarse on purpose; the per-file top list shows what is inside each one.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const single = arg('--single', 'dist'), hosted = arg('--hosted', null), jsonOut = arg('--json', null);
const html = readFileSync(join(single, 'index.html'), 'utf8');
const total = Buffer.byteLength(html);
const sha = (b) => createHash('sha1').update(b).digest('hex');

// hosted asset files by content hash -> name
const byHash = new Map();
if (hosted && existsSync(join(hosted, 'assets'))) for (const f of readdirSync(join(hosted, 'assets'))) if (!f.endsWith('.map') && !f.endsWith('.js') && !f.endsWith('.css')) byHash.set(sha(readFileSync(join(hosted, 'assets', f))), f.replace(/-[A-Za-z0-9_-]{8}(\.\w+)$/, '$1'));

const cat = (name, mime) => {
  const n = name.toLowerCase();
  if (/\.glb$|model\/gltf/.test(n + mime)) return /ped|human|body|ba_|hair|head|garment|^[a-z]{2}_[fm]/.test(n) ? 'models: people' : /car|veh|bus|truck|van/.test(n) ? 'models: vehicles' : 'models: other';
  if (/audio|\.mp3|\.ogg|\.wav|\.m4a/.test(n + mime)) return 'audio files';
  if (/font|woff/.test(n + mime)) return 'fonts';
  if (/image/.test(mime) || /\.(jpe?g|png|webp|ktx2|avif)$/.test(n)) return /ped|skin|face|hair|cloth/.test(n) ? 'textures: people' : /poster|loading|icon|logo|menu|hud/.test(n) ? 'textures: UI / posters' : 'textures: world';
  if (/json/.test(mime)) return 'data URI json';
  return 'other data URIs';
};

const rows = new Map(); const files = [];
const add = (c, b, name) => { rows.set(c, (rows.get(c) ?? 0) + b); if (name) files.push({ name, c, b }); };

// 1) data: URIs (anywhere in the page)
let dataBytes = 0;
for (const m of html.matchAll(/data:([a-z0-9.+\/-]+)(?:;[a-z0-9=.-]+)*;base64,([A-Za-z0-9+/=]+)/gi)) {
  const b = m[0].length; dataBytes += b;
  let name = '(unmatched)'; try { name = byHash.get(sha(Buffer.from(m[2], 'base64'))) ?? `(${m[1]} ${(b / 1024).toFixed(0)} kB)`; } catch {}
  add(cat(name, m[1]), b, name);
}

// 2) CSS and JS text (minus their data URIs, already counted)
const strip = (s) => s.replace(/data:[a-z0-9.+\/-]+(?:;[a-z0-9=.-]+)*;base64,[A-Za-z0-9+/=]+/gi, '');
let css = 0; for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) css += Buffer.byteLength(strip(m[1]));
add('css', css);
let js = 0; for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) js += Buffer.byteLength(strip(m[1]));

// split JS by source module using the hosted source maps
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function perSource(mapFile, codeFile) {
  const map = JSON.parse(readFileSync(mapFile, 'utf8')); const code = readFileSync(codeFile, 'utf8').split('\n');
  const out = new Map(); let src = 0;
  map.mappings.split(';').forEach((line, li) => {
    const segs = []; let col = 0;
    for (const seg of line.split(',')) { if (!seg) continue; const v = []; let shift = 0, val = 0;
      for (const ch of seg) { let d = B64.indexOf(ch); const cont = d & 32; d &= 31; val += d << shift; if (cont) shift += 5; else { v.push(val & 1 ? -(val >>> 1) : val >>> 1); val = 0; shift = 0; } }
      col += v[0]; if (v.length > 1) src += v[1]; segs.push([col, v.length > 1 ? src : -1]); }
    const len = (code[li] ?? '').length;
    segs.forEach(([c, s], i) => { const end = i + 1 < segs.length ? segs[i + 1][0] : len; const k = s >= 0 ? map.sources[s] : '(unmapped)'; out.set(k, (out.get(k) ?? 0) + Math.max(0, end - c)); });
  });
  return out;
}
const jsCat = (p) => {
  const s = p.replace(/^(\.\.\/)+/, '');
  if (s === '(unmapped)') return 'data: JSON modules (no source map; see list)';
  if (/node_modules\/three/.test(s)) return 'code: three.js';
  if (/node_modules/.test(s)) return 'code: other libraries';
  if (/\.json$/.test(s)) return /data\/raw|street-trees/.test(s) ? 'data: raw world json' : /north|pluto|lots|bedstuy/.test(s) ? 'data: world/lot json' : 'data: other json';
  if (/src\/audio\/voice/.test(s)) return 'code: voices (neural TTS, shows)';
  if (/src\/audio/.test(s)) return 'code: audio/radio/sfx';
  if (/src\/game\/(story|missions\/content)/.test(s)) return 'story/mission text';
  if (/src\/textures/.test(s)) return 'code: texture painters';
  if (/src\/entities\/models\/ped|pedHi|human/.test(s)) return 'code: people models';
  if (/src\/entities\/models/.test(s)) return 'code: vehicle models';
  if (/src\/world|src\/transit/.test(s)) return 'code: world/transit';
  if (/src\/ui|src\/render\/loading/i.test(s)) return 'code: UI/menu/HUD';
  return 'code: other src';
};
let mapped = false; const jsonSrc = [];
if (hosted) {
  const all = new Map();
  for (const f of readdirSync(join(hosted, 'assets'))) if (f.endsWith('.js') && existsSync(join(hosted, 'assets', f + '.map'))) for (const [k, v] of perSource(join(hosted, 'assets', f + '.map'), join(hosted, 'assets', f))) all.set(k, (all.get(k) ?? 0) + v);
  const sum = [...all.values()].reduce((x, y) => x + y, 0);
  for (const f of readdirSync(join(hosted, 'assets'))) if (f.endsWith('.js.map')) { const m = JSON.parse(readFileSync(join(hosted, 'assets', f), 'utf8')); m.sources.forEach((src, i) => { if (/\.json$/.test(src) && m.sourcesContent?.[i]) jsonSrc.push([src.replace(/^(\.\.\/)+/, ''), Buffer.byteLength(JSON.stringify(JSON.parse(m.sourcesContent[i])))]); }); }
  if (sum > 0) { mapped = true; for (const [k, v] of all) { const b = Math.round((v / sum) * js); add(jsCat(k), b, k.replace(/^(\.\.\/)+/, '')); } }
}
if (!mapped) add('code (all JS, no source map given)', js);
add('html shell / other', total - dataBytes - css - js);

const MB = (b) => (b / 1e6).toFixed(2);
console.log(`artifact page ${MB(total)} MB (budget 12.00)`);
console.log('category'.padEnd(36), 'MB'.padStart(6), '  share');
for (const [k, v] of [...rows].sort((x, y) => y[1] - x[1])) console.log(k.padEnd(36), MB(v).padStart(6), ('  ' + ((v / total) * 100).toFixed(1) + '%'));
console.log('\nlargest items:');
for (const f of files.sort((x, y) => y.b - x.b).slice(0, 25)) console.log('  ' + (f.b / 1e3).toFixed(0).padStart(6) + ' kB  ' + f.c.padEnd(30) + ' ' + f.name);
if (jsonSrc.length) { console.log('\nJSON modules in the bundle (minified size):'); for (const [n, b] of jsonSrc.sort((x, y) => y[1] - x[1])) console.log('  ' + (b / 1e3).toFixed(0).padStart(6) + ' kB  ' + n); }
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total, categories: Object.fromEntries(rows), top: files.slice(0, 60) }, null, 1));
