import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLotsDetailed } from '@/world/roadnet/lotsReal';
import { pointInPolygon } from '@/world/roadnet/geom';
import { R1_EXTENT } from '@/world/roadnet/extents';
const core = (await import('@/world/data/roadnet-core.json')).default as any;
const lj = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as any;
it('x', () => {
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net); const f = blockFaces(net, d);
  const { lots } = placeLotsDetailed(net, d, f, lj);
  // scale per face
  const per = new Map<string, number>();
  for (const l of lots) if (!l.wedge) { const k = l.block + ':' + l.face; }
  const hist: Record<string, number> = {};
  const groups = new Map<string, any[]>();
  for (const l of lots) if (!l.wedge) { const k = l.block + ':' + l.face; (groups.get(k) ?? groups.set(k, []).get(k)!).push(l); }
  for (const [k, g] of groups) { const s = g[0].scale; const n = g.length >= 4 ? 'n4+' : 'n<4'; const b = s < 0.85 ? '<.85' : s <= 1.15 ? 'ok' : s <= 1.6 ? '1.15-1.6' : s<=3?'1.6-3':'>3'; hist[n + ' ' + b] = (hist[n + ' ' + b] ?? 0) + 1; }
  console.log('HIST', JSON.stringify(hist));
  const placed = new Set(lots.map((l) => l.id));
  const miss = lj.lots.filter((l: any) => l.ph === 'R1' && !placed.has(l.bbl) && l.blk < 0);
  const inExt = miss.filter((l: any) => pointInPolygon({ x: l.x, z: l.z }, R1_EXTENT)).length;
  const ds = miss.map((l: any) => l.d).sort((a: number, b: number) => a - b);
  console.log('MISS blk<0', miss.length, 'inside R1', inExt, 'd median', ds[Math.floor(ds.length / 2)], 'ad', miss.slice(0, 5).map((l: any) => l.ad + ' ' + l.d));
});
