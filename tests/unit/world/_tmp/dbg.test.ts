import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
it('dbg', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net);
  const f = (v: any) => v.map((p: any) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' ');
  const r = d.curbRings[56]; console.log(f(r));
  for (const x of net.blocks[56].edges) { const e = net.edges[Math.abs(x)-1]; console.log(x, e.name, e.a, e.b, f(e.pts)); }
  console.log(f(net.blocks[86].edges.map(()=>0)));
  const r2 = d.curbRings[86]; console.log(f(r2));
  for (const x of net.blocks[86].edges) { const e = net.edges[Math.abs(x)-1]; console.log(x, e.name, e.a, e.b, net.lengths[Math.abs(x)-1].toFixed(0), f(e.pts.slice(0,4))); }
});
