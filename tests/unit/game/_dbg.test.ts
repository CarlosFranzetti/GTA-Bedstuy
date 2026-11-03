import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { Bot, startHourFor } from './missionBot';
it('dbg', () => {
  const data = loadBedstuyData(); const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  const defs = buildMissions(grid, data, lots);
  const out: string[] = [];
  for (const id of ['senator-the-cat', 'moving-day']) {
    const def = defs.find((d) => d.id === id)!;
    const m = new MissionSystem(defs);
    const bot = new Bot(m, { x: 0, z: 0 }, startHourFor(def));
    m.on('mission:started', (e) => out.push('start ' + e.id + ' t=' + bot.t.toFixed(1)));
    m.on('mission:objective', (e) => out.push(`obj ${e.index} ${e.text} t=${bot.t.toFixed(1)}`));
    m.on('mission:failed', (e) => out.push('fail ' + e.id + ' ' + e.reason + ' at ' + bot.x.toFixed(0) + ',' + bot.z.toFixed(0)));
    m.on('mission:completed', (e) => out.push('done ' + e.id));
    bot.startMission(def);
    bot.playUntil(def);
    out.push('givers ' + defs.map((d) => d.id + '@' + d.giver.x.toFixed(0) + ',' + d.giver.z.toFixed(0)).join(' '));
  }
  writeFileSync('/tmp/dbg.txt', out.join('\n'));
});
