import fs from 'node:fs'; import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const d = await vite.ssrLoadModule('/src/world/roadnet/derive.ts');
const sw = await vite.ssrLoadModule('/src/world/roadnet/sidewalks.ts');
const tr = await vite.ssrLoadModule('/src/world/roadnet/trafficReal.ts');
const f = process.argv[2];
const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(f,'utf8')));
const ctl = JSON.parse(fs.readFileSync(f.replace('roadnet-','roadnet-controls-'),'utf8'));
let t=performance.now(); const der=d.deriveGeometry(net); console.log('derive',Math.round(performance.now()-t));
for (let k=0;k<2;k++){ t=performance.now(); const s=sw.buildSidewalkGraph(net,der); console.log('sidewalks',Math.round(performance.now()-t)); if(k===1){ t=performance.now(); tr.makeRealTraffic(net,der,s,ctl); console.log('traffic',Math.round(performance.now()-t)); } }
await vite.close();
