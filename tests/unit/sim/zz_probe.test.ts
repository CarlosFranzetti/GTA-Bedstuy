import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
import { net, derived, sidewalks } from './realtraffic-run';
import controls from '@/world/data/roadnet-controls.json';
import { makeRealTraffic } from '@/world/roadnet/trafficReal';
import { pointInPolygon } from '@/world/roadnet/geom';
it('probe', () => {
  const rt = makeRealTraffic(net, derived, sidewalks, controls);
  const g = rt.lanes;
  const curbs = derived.curbRings.filter((r) => r.length > 2);
  const bl = derived.buildingRings.filter((r) => r.length > 2);
  const bad: string[] = []; let total = 0;
  for (const e of g.edges) {
    const a = g.nodes[e.from], b = g.nodes[e.to];
    const n = Math.max(1, Math.ceil(e.length));
    for (let i = 0; i <= n; i++) {
      const p = { x: a.pos.x + (b.pos.x - a.pos.x) * i / n, z: a.pos.z + (b.pos.z - a.pos.z) * i / n };
      total++;
      const k = !net.isOnRoad(p) && curbs.some((r) => pointInPolygon(p, r));
      const bb = bl.some((r) => pointInPolygon(p, r));
      if (k || bb) { bad.push((bb ? 'B ' : 'K ') + e.from + ' ' + p.x.toFixed(0) + ',' + p.z.toFixed(0)); break; }
    }
  }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/realtraffic2/lanebad.txt', 'edges ' + g.edges.length + ' bad ' + bad.length + '\n' + bad.join('\n'));
});
