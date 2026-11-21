import fs from 'node:fs'; import path from 'node:path'; import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy'; const S='/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/map4/';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
const el = await vite.ssrLoadModule('/src/world/roadnet/elReal.ts');
for (const f of [S+'base-src/src/world/data/roadnet-r123.json', ROOT+'/src/world/data/roadnet-r4.json']) {
  const net = RoadNet.fromJson(JSON.parse(fs.readFileSync(f,'utf8')));
  const r = el.buildElPaths(net);
  console.log(path.basename(f), r.paths.map(p=>[p.id,Math.round(p.length),p.pts[0],p.pts[p.pts.length-1]].map(x=>JSON.stringify(x)).join(' ')), r.stations.map(s=>s.id+':'+s.path+':'+Math.round(s.s)).join(' '));
}
await vite.close();
