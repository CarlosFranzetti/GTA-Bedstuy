import { it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry, isSimpleRing } from '@/world/roadnet/derive';
import { unionPolygons } from '@/world/roadnet/meshRoads';
import { signedArea, pointInPolygon } from '@/world/roadnet/geom';
import core from '@/world/data/roadnet-core.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
it('dbg', () => {
  const out: string[] = [];
  const net = RoadNet.fromJson(core as unknown as RoadNetJson); const d = deriveGeometry(net);
  net.blocks.forEach((_, i) => {
    const c = d.curbRings[i]; if (c.length < 3) return; const b = d.buildingRings[i];
    const want = Math.abs(signedArea(c)) - (b.length >= 3 ? Math.abs(signedArea(b)) : 0);
    const V = (r: {x:number;z:number}[]) => r.map((p) => new THREE.Vector2(p.x, p.z));
    const tris = THREE.ShapeUtils.triangulateShape(V(c), b.length >= 3 ? [V(b)] : []);
    const all = [...c, ...(b.length >= 3 ? b : [])];
    let got = 0; for (const t of tris) got += Math.abs(signedArea([all[t[0]], all[t[1]], all[t[2]]]));
    if (Math.abs(got - want) / want > 0.005) out.push('blk ' + i + ' want ' + want.toFixed(1) + ' got ' + got.toFixed(1) + ' c ' + c.length + ' b ' + b.length + ' simpleC ' + isSimpleRing(c) + ' simpleB ' + isSimpleRing(b) + ' fb ' + d.fallbackBuilding.includes(i));
  });
  for (const i of [27,65,176,64]) { const c=d.curbRings[i], b=d.buildingRings[i]; const outs=b.filter(p=>!pointInPolygon(p,c)).length; out.push('blk '+i+' areaC '+signedArea(c).toFixed(1)+' areaB '+signedArea(b).toFixed(1)+' bVertsOutsideC '+outs+'/'+b.length); }
  for (let e = 0; e < net.edges.length; e++) { const c = d.cuts[e]; if (c.cutA + c.cutB >= net.lengths[e]) { const E = net.edges[e]; const u = unionPolygons(d.nodePolys[E.a], d.nodePolys[E.b]); out.push('ribbonless ' + [e, E.a, E.b, d.nodePolys[E.a].length, d.nodePolys[E.b].length, u && signedArea(u), signedArea(d.nodePolys[E.a]), signedArea(d.nodePolys[E.b])].join(' ')); } }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/dbg.txt', out.join('\n'));
});
