import { it } from 'vitest';
import core from '@/world/data/roadnet-core.json';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
it('probe', () => {
  const net = RoadNet.fromJson(core as any);
  const d = deriveGeometry(net);
  const b = buildLaneGraphDetailed(net, d);
  console.log('nodes', Object.keys(b.graph.nodes).length, 'chains', b.chains.length, 'connectors', b.connectors.length);
  console.log('stranded', b.strandedEnds, 'orphans', b.orphanStarts, 'xsinks', b.extraSinks, 'xsrc', b.extraSources);
});
