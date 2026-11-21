import fs from 'node:fs'; import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy'; const S='/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/map4/';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(S+'base-src/src/world/data/roadnet-r123.json','utf8')));
const keys = net.blocks.map((b,i)=>{ const r=net.blockRing(i); let cx=0,cz=0; for(const p of r){cx+=p.x;cz+=p.z;} return [Math.round(b.area), Math.round(cx/r.length*10)/10, Math.round(cz/r.length*10)/10]; });
fs.writeFileSync(ROOT+'/src/world/data/raw/r3-block-keys.json', JSON.stringify({ note: 'MAP4: [area m2, ring centroid x, z] of every block of the R3 network (roadnet-r123.json of 18 Nov 2026), in its block order. import-streets.mjs --r4 keeps those block numbers (src/world/landmarks/ sites refer to them) and appends the new blocks.', blocks: keys }));
console.log(keys.length);
await vite.close();
