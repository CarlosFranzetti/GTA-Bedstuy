import fs from 'node:fs'; import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(ROOT+'/src/world/data/roadnet-r4.json','utf8')));
const on=(v)=>net.incident[v].filter(e=>net.edges[e].name==='Broadway');
net.nodes.forEach((n,v)=>{ const k=on(v).length; if(k===1||k>=3) console.log(v,k,Math.round(n.p.x),Math.round(n.p.z), net.incident[v].map(e=>net.edges[e].name+(net.edges[e].level?'^':'')).join('|'));});
await vite.close();
