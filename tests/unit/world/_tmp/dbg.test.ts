import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { segmentIntersection, signedArea } from '@/world/roadnet/geom';
it('dbg', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net);
  const f = (v: any) => v.map((p: any) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' ');
  for (const i of [73, 27]) {
  const cr = d.curbRings[i];
  const dd = (ring: any[], eps: number) => ring.filter((p, k) => k === 0 || Math.hypot(p.x - ring[k-1].x, p.z - ring[k-1].z) > eps);
  const c2 = dd(cr, 3.5);
  const off = (prev: any, cur: any, next: any, o: number) => {
    const n = (a: any, b: any) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l }; };
    const n1 = n(prev, cur), n2 = n(cur, next); let ax = n1.x + n2.x, az = n1.z + n2.z; const al = Math.hypot(ax, az); ax /= al; az /= al;
    const m = o / Math.max(ax * n1.x + az * n1.z, 0.1); return { x: cur.x + ax * m, z: cur.z + az * m };
  };
  const br = c2.map((p, k) => off(c2[(k - 1 + c2.length) % c2.length], p, c2[(k + 1) % c2.length], 4.4));
  console.log(i, 'edges', net.blocks[i].edges.map((x) => net.edges[Math.abs(x) - 1].name + ':' + net.lengths[Math.abs(x) - 1].toFixed(0)).join(' '));
  console.log('kerb', f(c2)); console.log('off ', f(br));
  const n = br.length;
  for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) { if (a === 0 && b === n - 1) continue;
    const h = segmentIntersection(br[a], br[(a + 1) % n], br[b], br[(b + 1) % n]);
    if (h && h.s > 1e-7 && h.s < 1 - 1e-7 && h.u > 1e-7 && h.u < 1 - 1e-7) console.log('cross', a, b); }
  }
});
