import path from 'node:path'; import fs from 'node:fs'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const d = await vite.ssrLoadModule('/src/world/roadnet/derive.ts');
const rw = await vite.ssrLoadModule('/src/world/roadnet/realWorld.ts');
const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(ROOT+'/src/world/data/roadnet-r4.json','utf8')));
const dd = d.deriveGeometry(net); const bad = rw.badBlocks(net, dd);
const dr = d.deriveGeometry(net,{repairRings:true}); const bad2=rw.badBlocks(net,dr);
const real=net.blocks.filter(b=>!b.island).length;
console.log('blocks',net.blocks.length,'real',real,'bad',bad.size,'after repair',bad2.size);
for(const i of [...bad].sort((a,b)=>net.blocks[b].area-net.blocks[a].area)){ const r=net.blockRing(i); const c=r.reduce((a,p)=>({x:a.x+p.x/r.length,z:a.z+p.z/r.length}),{x:0,z:0}); console.log(i,Math.round(net.blocks[i].area),'m2 at',Math.round(c.x),Math.round(c.z),'verts',r.length,bad2.has(i)?'STILL BAD':'repaired',net.blocks[i].island?'island':'');}
await vite.close();
