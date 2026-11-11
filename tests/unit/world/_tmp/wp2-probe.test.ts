import { it } from 'vitest';
import core from '@/world/data/roadnet-core.json';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
import { outerLegs } from '@/world/roadnet/clusters';
it('probe', () => {
  const net = RoadNet.fromJson(core as any);
  const d = deriveGeometry(net);
  const b = buildLaneGraphDetailed(net, d);
  for (const e of [45, 66]) {
    const ed = net.edges[e];
    console.log('edge', e, ed.name, ed.cls, 'ow', ed.oneway, 'ln', ed.lanes, 'a', ed.a, net.nodes[ed.a].control, 'b', ed.b, net.nodes[ed.b].control, 'len', net.lengths[e].toFixed(1));
    for (const v of [ed.a, ed.b]) {
      const c = b.clusters.find((c) => c.includes(v))!;
      console.log(' cluster', c, outerLegs(net, d, c).map((l) => { const lg = d.legs[l]; const x = net.edges[lg.edge]; return `${lg.edge}${lg.end}:${x.name}:ow${x.oneway}:ang${(lg.angle*180/Math.PI).toFixed(0)}`; }));
    }
  }
});
