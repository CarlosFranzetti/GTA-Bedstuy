// Prints the before/after table from two ambient-render.mjs outputs: node scripts/ambient-table.mjs before.json after.json
import { readFileSync } from 'node:fs';
const [b, a] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const key = (r) => `${r.name} ${r.hz}${r.stalls ? '+stalls' : ''}`;
const rep = (r) => r.channels.map((c) => Object.entries(c.repeats).filter(([, v]) => v > 0.5).map(([k, v]) => `${k}s:${v}`).join(' ') || '-').join(' | ');
const row = (r) => {
  if (!r) return 'n/a';
  if (r.onsets) return `onsets ${r.onsets.onsets}, mean gap ${r.onsets.meanIoi}s (ideal ${r.onsets.idealIoi}), longest ${r.onsets.maxIoi}s, worst deviation ${r.onsets.maxDevMs} ms; ${r.writesPerSec} writes/s, ${r.nodesPerSec} nodes/s`;
  const c = r.channels;
  return `clicks ${c.map((x) => x.clicks).join('/')}${c.some((x) => x.clicks > 2) ? ` (every ${c.map((x) => x.clickEvery).join('/')} s)` : ''}, gaps ${c.map((x) => x.gaps).join('/')}, repeats ${rep(r)}; ${r.writesPerSec} writes/s, ${r.nodesPerSec} nodes/s; level ${c.map((x) => x.levelDb).join('/')} dB`;
};
const A = new Map(a.map((r) => [key(r), r]));
for (const r of b) console.log(`| ${key(r)} | ${row(r)} | ${row(A.get(key(r)))} |`);
