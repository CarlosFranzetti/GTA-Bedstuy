import { writeFileSync } from 'fs';
import { it } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { poiSpot } from '@/game/missions/content/places';
it('dump', () => {
  const d = loadBedstuyData(); const g = buildGrid(d);
  const out: string[] = [JSON.stringify(g.bounds)];
  for (const b of (g as any).blocks ?? []) out.push(b.id + ' ' + JSON.stringify(b.faces.map((f: any) => [f.side, f.streetId, Math.round(f.a.x), Math.round(f.a.z), Math.round(f.b.x), Math.round(f.b.z)])));
  for (const p of d.pois) { const s = poiSpot({ grid: g, data: d }, p.id); out.push(p.id + ' ' + s.x.toFixed(0) + ',' + s.z.toFixed(0)); }
  writeFileSync('/tmp/dump.txt', out.join('\n'));
});
