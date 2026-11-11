import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { unionPolygons, groupPolygons } from '@/world/roadnet/meshRoads';
import { junctionClusters } from '@/world/roadnet/clusters';
import { buildRoadMeshes } from '@/world/roadnet/meshRoads';
import { signedArea } from '@/world/roadnet/geom';
import core from '@/world/data/roadnet-core.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
it('dbg', () => {
  const out: string[] = [];
  const net = RoadNet.fromJson(core as unknown as RoadNetJson); const d = deriveGeometry(net);
  let multi = 0, fail = 0;
  for (const cl of junctionClusters(net, d)) { if (cl.length < 2) continue; multi++; const ps = groupPolygons(d, cl.filter(v=>d.nodePolys[v].length>=3)); if (ps.length > 1) { fail++; out.push('cluster fail ' + cl.join(',') + ' polys ' + ps.length + ' ' + cl.map(v=>d.nodePolys[v].length).join('/')); } }
  out.push('clusters>1: ' + multi + ' unionFail ' + fail);
  const v = 266; out.push('node266 cluster ' + JSON.stringify(junctionClusters(net,d).find(c=>c.includes(v))) + ' inc ' + net.incident[v].map(e=>e+':'+net.edges[e].name+':'+net.lengths[e].toFixed(1)+':'+d.cuts[e].cutA.toFixed(1)+'/'+d.cuts[e].cutB.toFixed(1)).join(' '));
  const np = net.nodes[266].p;
  const mk = () => ({ get: () => ({}) , awning: ()=>({}), sign: ()=>({}), carPaint: ()=>({}), setNight: ()=>undefined }) as any;
  const roads = buildRoadMeshes(net, d, mk(), { tier: 'low', markings: false });
  const tris: Array<{ t: any; kind: string }> = [];
  roads.children[0].traverse((o: any) => { if (!o.isMesh) return; const pos = o.geometry.getAttribute('position'), idx = o.geometry.index; for (let k = 0; k < idx.count; k += 3) { const t = [0,1,2].map(j => ({ x: pos.getX(idx.getX(k+j)), z: pos.getZ(idx.getX(k+j)) })); const c = {x:(t[0].x+t[1].x+t[2].x)/3, z:(t[0].z+t[1].z+t[2].z)/3}; if (Math.hypot(c.x-np.x,c.z-np.z) < 45) tris.push({ t, kind: o.name }); } });
  const ov = (a: any[], b: any[]) => { const norm = (t: any[]) => (signedArea(t) < 0 ? [t[0], t[2], t[1]] : t); let poly = norm(a); const clip = norm(b); for (let i = 0; i < 3 && poly.length; i++) { const c0 = clip[i], c1 = clip[(i+1)%3]; const side = (p: any) => (c1.x-c0.x)*(p.z-c0.z)-(c1.z-c0.z)*(p.x-c0.x); const nx: any[] = []; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k+1)%poly.length]; const sp = side(p), sq = side(q); if (sp >= 0) nx.push(p); if ((sp>=0)!==(sq>=0)) { const tt = sp/(sp-sq); nx.push({x:p.x+(q.x-p.x)*tt, z:p.z+(q.z-p.z)*tt}); } } poly = nx; } return Math.abs(signedArea(poly)); };
  for (let i = 0; i < tris.length; i++) for (let j = i+1; j < tris.length; j++) { const o = ov(tris[i].t, tris[j].t); if (o > 0.05) out.push('overlap ' + o.toFixed(2) + ' ' + tris[i].kind + '/' + tris[j].kind + ' at ' + tris[i].t[0].x.toFixed(1) + ',' + tris[i].t[0].z.toFixed(1) + ' node ' + np.x.toFixed(1) + ',' + np.z.toFixed(1)); }
  const all: Array<{ t: any; c: any; kind: string }> = [];
  roads.children[0].traverse((o: any) => { if (!o.isMesh) return; const pos = o.geometry.getAttribute('position'), idx = o.geometry.index; for (let k = 0; k < idx.count; k += 3) { const t = [0,1,2].map(j => ({ x: pos.getX(idx.getX(k+j)), z: pos.getZ(idx.getX(k+j)) })); all.push({ t, c: {x:(t[0].x+t[1].x+t[2].x)/3, z:(t[0].z+t[1].z+t[2].z)/3}, kind: o.name }); } });
  let bad = 0; const tot = new Map<string, number>();
  const grid = new Map<string, number[]>(); all.forEach((q, i) => { const k = Math.floor(q.c.x/32)+','+Math.floor(q.c.z/32); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  let totalOv = 0; const badSpots: string[] = [];
  for (const [k, l] of grid) { const [gx, gz] = k.split(',').map(Number); const near: number[] = []; for (let dx=-1;dx<=1;dx++) for (let dz=-1;dz<=1;dz++) near.push(...(grid.get((gx+dx)+','+(gz+dz)) ?? [])); for (const i of l) for (const j of near) { if (j <= i) continue; if (Math.hypot(all[i].c.x-all[j].c.x, all[i].c.z-all[j].c.z) > 60) continue; const o = ov(all[i].t, all[j].t); if (o > 0.001) { totalOv += o; badSpots.push(o.toFixed(2)+' '+all[i].kind+'/'+all[j].kind+' @'+all[i].c.x.toFixed(0)+','+all[i].c.z.toFixed(0)); } } }
  out.push('total overlap m2 ' + totalOv.toFixed(1) + ' pairs ' + badSpots.length); out.push(...badSpots.slice(0,40));
  const bn = net.nodes.map((_, v) => v).filter(v => d.legsAt[v].length>=5).map(v => v + ':' + [...new Set(net.incident[v].map(e => net.edges[e].name))].join('|')); out.push('5leg ' + bn.join('  '));
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/dbg.txt', out.join('\n'));
});
