#!/usr/bin/env node
/** MAP4: docs/reference/realmap-r4.svg, the old (R3) and new (R4) outlines over the street network of src/world/data/roadnet-r4.json. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createServer } from 'vite';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({ configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true } });
const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/roadnet-r4.json'), 'utf8')));
const S = 0.18, pad = 30, b = net.bounds;
const W = Math.ceil((b.maxX - b.minX) * S + 2 * pad), H = Math.ceil((b.maxZ - b.minZ) * S + 2 * pad + 40);
const X = (x) => ((x - b.minX) * S + pad).toFixed(1), Y = (z) => ((z - b.minZ) * S + pad + 40).toFixed(1);
const pth = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.z)}`).join('');
const km2 = (r) => (Math.abs(geom.signedArea(r)) / 1e6).toFixed(2);
const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#1e2228"/>`];
o.push(`<text x="12" y="20" fill="#ccc" font-size="13">Real map outlines: R3 (${km2(ext.R3_RING)} km2, orange) and R4 (${km2(ext.R4_RING)} km2, cyan). Streets: NYC Centerline. Grid frame, +x east, +z south. 1 km bar:</text><rect x="12" y="28" width="${1000 * S}" height="3" fill="#ccc"/>`);
net.edges.forEach((e) => o.push(`<path d="${pth(e.pts)}" fill="none" stroke="${e.cls === 'avenue' || e.cls === 'arterial' ? '#e8c547' : '#cfd3d8'}" stroke-opacity="0.8" stroke-width="${e.cls === 'street' ? 0.5 : 0.9}"/>`));
o.push(`<path d="${pth(ext.R3_RING)}Z" fill="none" stroke="#ff9a2e" stroke-width="2"/>`);
o.push(`<path d="${pth(ext.R4_RING)}Z" fill="none" stroke="#33d6ff" stroke-width="2.5" stroke-dasharray="8 4"/>`);
o.push('</svg>');
fs.writeFileSync(path.join(ROOT, 'docs/reference/realmap-r4.svg'), o.join('\n'));
console.log('wrote docs/reference/realmap-r4.svg', o.join('\n').length, 'bytes');
await vite.close();
