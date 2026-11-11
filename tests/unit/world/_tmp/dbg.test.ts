import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry, isSimpleRing } from '@/world/roadnet/derive';
import { signedArea, segmentIntersection } from '@/world/roadnet/geom';
it('dbg', async () => {
  (globalThis as any).__dbg = true;
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net);
  const f = (v: any) => v.map((p: any) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' ');
  for (const i of [27, 66, 69, 73]) {
    const r = d.buildingRings[i]; const n = r.length; const out: string[] = [];
    for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) { if (a === 0 && b === n - 1) continue;
      const h = segmentIntersection(r[a], r[(a + 1) % n], r[b], r[(b + 1) % n]);
      if (h && h.s > 1e-7 && h.s < 1 - 1e-7 && h.u > 1e-7 && h.u < 1 - 1e-7) out.push(`${a}/${b} ${f([r[a], r[b]])}`); }
    console.log('BLOCK', i, 'area', signedArea(r).toFixed(0), 'cross', out.slice(0, 3));
  }
  const r = d.buildingRings[66]; console.log(f(r));
});
