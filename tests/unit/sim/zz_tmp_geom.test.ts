import { it } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildMissions } from '@/game/missions/content';
it('geom', () => {
  const data = loadBedstuyData(); const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  console.log('BOUNDS', JSON.stringify(grid.bounds));
  for (const d of buildMissions(grid, data, lots)) console.log('G', d.id.padEnd(24), Math.round(d.giver.x), Math.round(d.giver.z), d.triggerRadius, d.tag ?? 'story', JSON.stringify(d.availableHours ?? ''));
  for (const b of ['r0c0','r0c1','r1c0','r1c1','r2c0','r2c1','r3c0','r3c1','r4c0','r4c1']) {
    const bl = grid.blockById(b);
    console.log('B', b, bl.faces.map((f) => `${f.side}:${Math.round(f.a.x)},${Math.round(f.a.z)}->${Math.round(f.b.x)},${Math.round(f.b.z)}`).join(' '));
  }
});
