import fs from 'node:fs'; import path from 'node:path';
import { createServer } from 'vite';
const ROOT='/home/user/GTA-Bedstuy';
const vite = await createServer({ configFile:false, root:ROOT, appType:'custom', logLevel:'silent', resolve:{alias:{'@':path.join(ROOT,'src')}}, server:{middlewareMode:true,ws:false}, optimizeDeps:{noDiscovery:true}});
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
const proj = geom.makeFrameProjection(geom.REAL_FRAME);
const ring = ext.offsetRing(ext.R3_RING, 2200, 1.5);
const ll = ring.map(p=>proj.toLonLat(p));
const lons=ll.map(p=>p[0]), lats=ll.map(p=>p[1]);
const n=Math.max(...lats),s=Math.min(...lats),w=Math.min(...lons),e=Math.max(...lons);
const FIELDS=['physicalid','full_street_name','pre_type','post_type','rw_type','status','trafdir','streetwidth','number_travel_lanes','number_park_lanes','from_level_code','to_level_code','truck_route_type','carto_display_level','posted_speed','bike_lane','boroughcode','the_geom'];
const rows=[];
for(let off=0;;off+=5000){
  const q=new URLSearchParams({$select:FIELDS.join(','),$where:`within_box(the_geom, ${n.toFixed(6)}, ${w.toFixed(6)}, ${s.toFixed(6)}, ${e.toFixed(6)}) AND boroughcode in ('3','4')`,$order:'physicalid',$limit:'5000',$offset:String(off)});
  const r=await fetch('https://data.cityofnewyork.us/resource/inkn-q76z.json?'+q); if(!r.ok) throw new Error(r.status+await r.text());
  const page=await r.json(); rows.push(...page); console.log(off,page.length); if(page.length<5000)break; await new Promise(r=>setTimeout(r,1500));
}
fs.writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/map4/wide.json',JSON.stringify({rows,fetched:new Date().toISOString()}));
await vite.close();
