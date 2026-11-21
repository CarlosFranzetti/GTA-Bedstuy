import fs from 'node:fs'; import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy'; const S='/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/map4/';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const d = await vite.ssrLoadModule('/src/world/roadnet/derive.ts');
const el = await vite.ssrLoadModule('/src/world/roadnet/elReal.ts');
for (const f of [S+'base-src/src/world/data/roadnet-r123.json', ROOT+'/src/world/data/roadnet-r4.json']) {
  const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(f,'utf8'))); const der=d.deriveGeometry(net);
  let t=performance.now(); const r=el.buildElPaths(net); const t1=performance.now()-t; t=performance.now(); const sp=el.allColumnSpots(r.paths,der,net); console.log(path.basename(f),'paths',Math.round(t1),'spots',sp.length,Math.round(performance.now()-t));
}
await vite.close();
