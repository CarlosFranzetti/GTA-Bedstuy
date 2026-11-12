import { it } from 'vitest';
import core from '@/world/data/roadnet-core.json';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
import { RoadNet } from '@/world/roadnet/RoadNet';
function scc(g:any){const ids=Object.keys(g.nodes);const index=new Map<string,number>();const low=new Map<string,number>();const on=new Set<string>();const stack:string[]=[];const comp=new Map<string,number>();let counter=0,comps=0;
for(const root of ids){if(index.has(root))continue;const work=[{v:root,i:0}];index.set(root,counter);low.set(root,counter);counter++;stack.push(root);on.add(root);
while(work.length){const top=work[work.length-1];const adj=g.adjacency[top.v];if(top.i<adj.length){const w=g.edges[adj[top.i++]].to;if(!index.has(w)){index.set(w,counter);low.set(w,counter);counter++;stack.push(w);on.add(w);work.push({v:w,i:0});}else if(on.has(w))low.set(top.v,Math.min(low.get(top.v)!,index.get(w)!));}
else{if(low.get(top.v)===index.get(top.v)){for(;;){const w=stack.pop()!;on.delete(w);comp.set(w,comps);if(w===top.v)break;}comps++;}work.pop();if(work.length){const p=work[work.length-1].v;low.set(p,Math.min(low.get(p)!,low.get(top.v)!));}}}}
return comp;}
it('dbg2', () => {
  const net = RoadNet.fromJson(core as any); const d = deriveGeometry(net);
  const b = buildLaneGraphDetailed(net, d); const g = b.graph;
  const comp = scc(g); const sizes=new Map<number,number>(); comp.forEach(c=>sizes.set(c,(sizes.get(c)??0)+1));
  const sorted=[...sizes.entries()].sort((a,b)=>b[1]-a[1]); const giant=sorted[0][0];
  const hist:Record<string,number>={};
  for(const [c,s] of sorted.slice(1)){const k=s<5?'<5':s<20?'<20':s<100?'<100':s<500?'<500':'big';hist[k]=(hist[k]??0)+s;}
  // outside by chain: group by edge names
  const byStreet=new Map<string,number>();
  for(const id of Object.keys(g.nodes)){ if(comp.get(id)!==giant){const sid=g.nodes[id].streetId;byStreet.set(sid,(byStreet.get(sid)??0)+1);} }
  const top=[...byStreet.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15);
  const stubNodes=b.chains.filter(c=>c.startKind==='stub'||c.endKind==='stub');
  const out=new Map<string,any>();
  for(const c of b.chains){const n=c.nodeIds.filter(id=>comp.get(id)!==giant).length; if(n){const e=net.edges[c.edge];const k=c.edge;const o=out.get(String(k))??{edge:k,name:e.name,cls:e.cls,level:e.level,oneway:e.oneway,lanes:e.lanes,len:Math.round(net.lengths[k]),chains:[]};o.chains.push(`${c.dir}${c.lane}:${n}/${c.nodeIds.length}:${c.startKind}>${c.endKind}`);out.set(String(k),o);}}
  require('fs').writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/theo3.txt',[...out.values()].map(o=>JSON.stringify(o)).join('\n'));
  require('fs').writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/theo2.txt', JSON.stringify({top3:sorted.slice(0,5),hist,top,stubChains:stubNodes.length,stubChainNodes:stubNodes.reduce((a,c)=>a+c.nodeIds.length,0),conn:b.connectors.length,connNodes:b.connectors.reduce((a,c)=>a+c.nodeIds.length,0)},null,1));
});
it('dbg', () => {
  const net = RoadNet.fromJson(core as any); const d = deriveGeometry(net);
  const b = buildLaneGraphDetailed(net, d); const g = b.graph;
  let n = 0, viol = 0; const ex: string[] = [];
  for (const c of b.connectors) {
    if (c.uturn) continue;
    let th = g.nodes[c.to].heading - g.nodes[c.from].heading;
    while (th > Math.PI) th -= 2 * Math.PI; while (th < -Math.PI) th += 2 * Math.PI;
    if (th > 0.5) { n++; const [, e, dir, lane] = c.from.split(':'); const ch = b.chains.find((x) => x.id === `${e}:${dir}:${lane}`)!;
      if (ch.lane !== ch.lanes - 1) { viol++; if (ex.length < 8) ex.push(`${c.from} lanes=${ch.lanes} lane=${ch.lane} th=${th.toFixed(2)} oneway=${net.edges[ch.edge].oneway}`); } }
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/theo1.txt', ['right', n, 'viol', viol, ex.join('\n')].join(' '));
});
