import fs from 'node:fs'; import path from 'node:path';
import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const S='/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/map4/';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
const proj = geom.makeFrameProjection(geom.REAL_FRAME);
const raw=JSON.parse(fs.readFileSync(S+'wide.json','utf8')).rows;
const segs=[];
const types={};
for(const r of raw){ types[r.rw_type]=(types[r.rw_type]||0)+1;
  if(!['1','2','3'].includes(r.rw_type)) continue; if(!r.the_geom) continue;
  for(const line of r.the_geom.coordinates){ for(let i=1;i<line.length;i++){ const a=proj.toGrid(line[i-1][0],line[i-1][1]), b=proj.toGrid(line[i][0],line[i][1]); segs.push({a,b,name:r.full_street_name}); } } }
console.log('types',types,'segs',segs.length);
const ring=ext.R3_RING; const n=ring.length;
const sgn=Math.sign(geom.signedArea(ring));
for(let i=0;i<n;i++){
  const a=ring[i], b=ring[(i+1)%n]; const L=Math.hypot(b.x-a.x,b.z-a.z); if(L<150){console.log('side',i,'short',L.toFixed(0));continue;}
  const tx=(b.x-a.x)/L, tz=(b.z-a.z)/L; const nx=tz*sgn, nz=-tx*sgn;
  const all=[];
  for(const f of [0.2,0.35,0.5,0.65,0.8]){
    const p={x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};
    // collect crossings of ray p + t*n, t in [-700,1800], with segments nearly parallel to side
    const hits=[];
    for(const s of segs){ const dx=s.b.x-s.a.x, dz=s.b.z-s.a.z; const l=Math.hypot(dx,dz); if(l<1)continue;
      const cos=Math.abs((dx*tx+dz*tz)/l); if(cos<0.9) continue;
      const inter=geom.segmentIntersection(p,{x:p.x+nx*1900,z:p.z+nz*1900},s.a,s.b); const back=geom.segmentIntersection({x:p.x-nx*700,z:p.z-nz*700},p,s.a,s.b);
      if(inter) hits.push({t:inter.s*1900,name:s.name}); else if(back) hits.push({t:-700+back.s*700,name:s.name}); }
    hits.sort((u,v)=>u.t-v.t); const dedup=[]; for(const h of hits){ if(dedup.length&&h.t-dedup[dedup.length-1].t<25&&h.name===dedup[dedup.length-1].name)continue; if(dedup.length&&h.t-dedup[dedup.length-1].t<12)continue; dedup.push(h);} 
    all.push(dedup);
  }
  console.log('side',i,'len',L.toFixed(0),'normal',nx.toFixed(2),nz.toFixed(2));
  all.forEach(d=>console.log('   ',d.filter(h=>h.t>-350).map(h=>Math.round(h.t)+(h.name?'':'')).join(' ')));
  const mid=all[2].filter(h=>h.t>-100).slice(0,9).map(h=>Math.round(h.t)+':'+h.name); console.log('   mid:',mid.join(' | '));
}
await vite.close();
