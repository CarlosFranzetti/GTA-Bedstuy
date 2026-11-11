import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
const out: string[] = [];
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { unionPolygons } from '@/world/roadnet/meshRoads';
import { signedArea } from '@/world/roadnet/geom';
import core from '@/world/data/roadnet-core.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
it('dbg', () => {
  const net = RoadNet.fromJson(core as unknown as RoadNetJson); const d = deriveGeometry(net);
  const bad: string[] = [];
  net.blocks.forEach((_, i) => { const c = d.curbRings[i]; if (c.length<3) return; const b = d.buildingRings[i];
    const want = Math.abs(signedArea(c)) - (b.length>=3?Math.abs(signedArea(b)):0); bad.push(`${i} ${want.toFixed(1)} ${c.length} ${b.length}`); });
  out.push(String(bad.length);
  // cluster
  for (let e=0;e<net.edges.length;e++){ const c=d.cuts[e]; if(c.cutA+c.cutB>=net.lengths[e]){ const E=net.edges[e]; const u=unionPolygons(d.nodePolys[E.a],d.nodePolys[E.b]); out.push(['ribbonless',e,E.a,E.b,d.nodePolys[E.a].length,d.nodePolys[E.b].length,u&&signedArea(u),signedArea(d.nodePolys[E.a]),signedArea(d.nodePolys[E.b]].join(' ')); } }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/dbg.txt', out.join('\n'));
});
