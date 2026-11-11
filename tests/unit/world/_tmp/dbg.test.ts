import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
it('dbg', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net);
  const f = (v: any) => v.map((p: any) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' ');
  for (const [i, px, pz] of [[156, 480, -89], [56, 783, -686], [77, 1199, -507], [86, 1161, -483], [23, -240, -984]] as const) {
    const r = d.curbRings[i];
    // nearest nodes
    const near = net.nodes.map((n, v) => ({ v, dd: Math.hypot(n.p.x - px, n.p.z - pz) })).sort((a, b) => a.dd - b.dd).slice(0, 2);
    console.log('BLOCK', i, 'near nodes', near.map((q) => q.v + ' d=' + q.dd.toFixed(0)));
    for (const { v } of near) {
      console.log(' node', v, 'legs', d.legsAt[v].map((id) => { const l = d.legs[id]; return `${net.edges[l.edge].name} ang=${(l.angle * 180 / Math.PI).toFixed(0)} hw=${l.hw.toFixed(1)} cut=${l.cut.toFixed(1)} len=${net.lengths[l.edge].toFixed(0)}`; }));
      console.log('  returns', d.returns.filter((c) => c.node === v).map((c) => `${c.kind} ${c.angleDeg.toFixed(0)}deg r=${c.radius}`));
    }
    const n = r.length; const idx = r.map((p, k) => ({ k, dd: Math.hypot(p.x - px, p.z - pz) })).sort((a, b) => a.dd - b.dd)[0].k;
    console.log(' ring near', f(r.slice(Math.max(0, idx - 4), idx + 5)));
  }
});
