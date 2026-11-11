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
  for (const id of ['1:f:0', '6:r:1', '12:r:0']) {
    const c = b.chains.find((x) => x.id === id)!;
    const ed = net.edges[c.edge];
    console.log(id, ed.name, ed.cls, 'ow', ed.oneway, 'start', c.startKind, 'end', c.endKind, 'a', ed.a, net.nodes[ed.a].control, 'b', ed.b, net.nodes[ed.b].control);
    const last = c.nodeIds[c.nodeIds.length - 1];
    console.log('  adj last', b.graph.adjacency[last].length, 'first has incoming', b.connectors.some((q) => q.to === c.nodeIds[0]));
  }
});
