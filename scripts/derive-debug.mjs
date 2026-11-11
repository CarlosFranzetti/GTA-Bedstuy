#!/usr/bin/env node
/**
 * derive-debug: renders the derived junction geometry (src/world/roadnet/derive.ts, WP1) of three hard junctions of the real
 * network to docs/reference/realmap-junctions.svg and .png so a human can check them:
 *   1. Broadway x Myrtle Ave x Jefferson/Wilson (5-way, acute diagonals)   2. Broadway x Flushing Ave   3. a Bushwick 45-degree 4-way.
 * Legend: grey = paved node polygon (with curb returns), dark grey = road ribbons from the cuts, green = block kerb ring,
 * orange = building line, red ticks = ribbon cut lines, white dashed = centrelines, yellow = fillet arcs.
 *   node scripts/derive-debug.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/reference/realmap-junctions');
const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
  const { deriveGeometry } = await vite.ssrLoadModule('/src/world/roadnet/derive.ts');
  const core = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/roadnet-core.json'), 'utf8'));
  const net = RoadNet.fromJson(core);
  const d = deriveGeometry(net);

  const names = (v) => [...new Set(d.legsAt[v].map((id) => net.edges[d.legs[id].edge].name))];
  const find = (...want) => net.nodes.map((_, v) => v).filter((v) => want.every((w) => names(v).includes(w)));
  const pick = (list) => list.sort((a, b) => d.legsAt[b].length - d.legsAt[a].length)[0];
  const n1 = pick(find('Broadway', 'Myrtle Ave'));
  const n2 = pick(find('Broadway', 'Flushing Ave'));
  // Bushwick 45-degree grid: a 4-leg node of plain streets whose legs are all near-diagonal in the grid frame
  const diag = net.nodes.map((_, v) => v).filter((v) => d.legsAt[v].length === 4 && net.nodes[v].p.x > 1300 && net.nodes[v].p.z < -400 &&
    d.legsAt[v].every((id) => net.lengths[d.legs[id].edge] > 60) &&
    d.legsAt[v].every((id) => { const a = Math.abs(((d.legs[id].angle * 180) / Math.PI) % 90); return a > 25 && a < 65; }));
  const n3 = diag.sort((a, b) => Math.hypot(net.nodes[a].p.x - 1550, net.nodes[a].p.z + 620) - Math.hypot(net.nodes[b].p.x - 1550, net.nodes[b].p.z + 620))[0];
  const picks = [[n1, 'Broadway x Myrtle Ave'], [n2, 'Broadway x Flushing Ave'], [n3, 'Bushwick 45-degree 4-way']];
  console.log(picks.map(([v, t]) => `${t}: node ${v} legs ${d.legsAt[v].length} ${names(v).join(' / ')}`).join('\n'));

  const R = 75;
  const W = 760;
  const S = W / (2 * R);
  const f = (n) => n.toFixed(2);
  const path_ = (ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.z)}`).join('') + 'Z';
  const slice = (e, s0, s1) => {
    const out = [net.pointAt(e, s0).p];
    net.edges[e].pts.forEach((p, k) => { if (net.cum[e][k] > s0 + 1e-6 && net.cum[e][k] < s1 - 1e-6) out.push(p); });
    out.push(net.pointAt(e, s1).p);
    return out;
  };
  const panels = picks.map(([v, title], i) => {
    const c = net.nodes[v].p;
    const near = (p) => Math.abs(p.x - c.x) < R * 1.6 && Math.abs(p.z - c.z) < R * 1.6;
    const g = [];
    g.push(`<rect x="${f(c.x - R)}" y="${f(c.z - R)}" width="${2 * R}" height="${2 * R}" fill="#15181c"/>`);
    d.curbRings.forEach((r, bi) => { if (r.length && r.some(near)) g.push(`<path d="${path_(r)}" fill="#25382a" stroke="#6fbf73" stroke-width="0.35"/>`); });
    d.buildingRings.forEach((r) => { if (r.length && r.some(near)) g.push(`<path d="${path_(r)}" fill="none" stroke="#ff9f40" stroke-width="0.3"/>`); });
    net.edges.forEach((e, ei) => {
      if (!e.pts.some(near)) return;
      const { cutA, cutB } = d.cuts[ei];
      if (cutA + cutB < net.lengths[ei]) {
        const pts = slice(ei, cutA, net.lengths[ei] - cutB);
        g.push(`<polyline points="${pts.map((p) => `${f(p.x)},${f(p.z)}`).join(' ')}" fill="none" stroke="#4a4f57" stroke-width="${f(e.width)}" stroke-linejoin="round"/>`);
      }
    });
    d.nodePolys.forEach((p, ni) => { if (p.length && p.some(near)) g.push(`<path d="${path_(p)}" fill="#6b717b" fill-opacity="0.9" stroke="#c9ced6" stroke-width="0.25"/>`); });
    d.returns.forEach((r) => { if (r.kind === 'fillet' && near(r.pts[0])) g.push(`<polyline points="${r.pts.map((p) => `${f(p.x)},${f(p.z)}`).join(' ')}" fill="none" stroke="#ffe14d" stroke-width="0.45"/>`); });
    d.legs.forEach((l) => { if (near(l.plus) && net.nodes[l.node].control !== 'stub') g.push(`<line x1="${f(l.minus.x)}" y1="${f(l.minus.z)}" x2="${f(l.plus.x)}" y2="${f(l.plus.z)}" stroke="#ff4d4d" stroke-width="0.4"/>`); });
    net.edges.forEach((e) => { if (e.pts.some(near)) g.push(`<polyline points="${e.pts.map((p) => `${f(p.x)},${f(p.z)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="0.18" stroke-dasharray="1.2 1.2"/>`); });
    g.push(`<circle cx="${f(c.x)}" cy="${f(c.z)}" r="0.9" fill="#fff"/>`);
    const labels = [...new Set(d.legsAt[v].map((id) => d.legs[id]))].map((l) => `<text x="${f(l.plus.x + l.dir.x * 14)}" y="${f(l.plus.z + l.dir.z * 14)}" font-size="3.4" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="0.5" paint-order="stroke">${net.edges[l.edge].name}</text>`);
    return `<g transform="translate(${i * (W + 10)} 40) scale(${S}) translate(${f(-(c.x - R))} ${f(-(c.z - R))})"><clipPath id="c${i}"><rect x="${f(c.x - R)}" y="${f(c.z - R)}" width="${2 * R}" height="${2 * R}"/></clipPath><g clip-path="url(#c${i})">${g.join('')}${labels.join('')}</g></g>` +
      `<text x="${i * (W + 10) + 6}" y="26" font-size="20" fill="#eee" font-family="sans-serif">${title} (node ${v}, ${d.legsAt[v].length} legs)</text>` +
      `<line x1="${i * (W + 10) + 10}" y1="${40 + W + 14}" x2="${i * (W + 10) + 10 + 20 * S}" y2="${40 + W + 14}" stroke="#eee" stroke-width="3"/><text x="${i * (W + 10) + 16 + 20 * S}" y="${40 + W + 19}" font-size="14" fill="#eee" font-family="sans-serif">20 m</text>`;
  });
  const H = W + 90;
  const total = 3 * W + 20;
  const legend = 'grey = paved node polygon, dark = road ribbons from the cuts, green = block kerb ring, orange = building line, yellow = curb returns, red = ribbon cut lines, dashed = centrelines. +x east along Bed-Stuy streets, +z south (screen down).';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${H}" viewBox="0 0 ${total} ${H}"><rect width="100%" height="100%" fill="#0b0d10"/>${panels.join('')}<text x="6" y="${H - 10}" font-size="13" fill="#9aa" font-family="sans-serif">${legend}</text></svg>`;
  fs.writeFileSync(OUT + '.svg', svg);
  await sharp(Buffer.from(svg)).png().toFile(OUT + '.png');
  console.log('wrote', OUT + '.svg', OUT + '.png');
} finally {
  await vite.close();
}
