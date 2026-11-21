import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
const d = await vite.ssrLoadModule('/src/world/roadnet/derive.ts');
console.log(ext.R4_EXTENT.length, JSON.stringify(ext.R4_EXTENT.map(p=>[p.x,p.z])));
console.log('simple ring',d.isSimpleRing(ext.R4_RING), 'extent', d.isSimpleRing(ext.R4_EXTENT));
const r=ext.R4_EXTENT; const seg=(a,b,c,e)=>geom.segmentIntersection(a,b,c,e);
for(let i=0;i<r.length;i++)for(let j=i+2;j<r.length;j++){ if(i===0&&j===r.length-1)continue; const h=seg(r[i],r[(i+1)%r.length],r[j],r[(j+1)%r.length]); if(h&&h.s>0&&h.s<1&&h.u>0&&h.u<1) console.log('cross',i,j);}
await vite.close();
