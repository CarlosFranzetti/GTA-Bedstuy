import { it } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildMissions } from '@/game/missions/content';
import { writeFileSync } from 'node:fs';
it('geom', () => {
  const out: string[] = [];
  const data = loadBedstuyData(); const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  out.push('BOUNDS '+JSON.stringify(grid.bounds));
  for (const d of buildMissions(grid, data, lots)) out.push(['G', d.id.padEnd(24), Math.round(d.giver.x), Math.round(d.giver.z), d.triggerRadius, d.tag ?? 'story', JSON.stringify(d.availableHours ?? ''));
  for (const b of ['r0c0','r0c1','r1c0','r1c1','r2c0','r2c1','r3c0','r3c1','r4c0','r4c1']) {
    const bl = grid.blockById(b);
    out.push(['B', b, bl.faces.map((f) => `${f.side}:${Math.round(f.a.x)},${Math.round(f.a.z)}->${Math.round(f.b.x)},${Math.round(f.b.z)}`).join(' ')].join(' '));
  }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/story2/geom.txt', out.join('\n'));
});
