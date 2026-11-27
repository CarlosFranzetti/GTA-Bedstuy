/**
 * STUCK soak (long; off unless STUCK_SOAK=<output folder>). Reports counts per kind for both maps to <folder>/soak-<tag>.json.
 *   STUCK_SOAK=/tmp/x STUCK_TAG=before STUCK_CARS=600 STUCK_WALKERS=600 npx vitest run tests/unit/sim/stuck-soak.test.ts --maxWorkers=1 --testTimeout=900000
 */
import { describe, expect, it } from 'vitest';
import { World2D } from '@/physics/World2D';
import { gridWorld, logTo, realStreetWorld, runSoak, summarize, writeJson } from './stuck-soak-lib';

const out = process.env.STUCK_SOAK;
const d = out ? describe : describe.skip;
d('stuck soak', () => {
  for (const map of (process.env.STUCK_MAPS ?? 'grid,real').split(',') as Array<'grid' | 'real'>) {
    it(`soak ${map}`, async () => {
      const tag = process.env.STUCK_TAG ?? 'run';
      World2D.rescueEnabled = process.env.STUCK_NORESCUE !== '1';
      const log = logTo(`${out}/soak-${tag}.log`);
      const w = map === 'grid' ? gridWorld(1) : await realStreetWorld(1, 36, log);
      log(`${map}: ${w.anchors.length} anchors, polygons ${w.polygons} of which concave ${w.concave}`);
      const rs = runSoak(w, Number(process.env.STUCK_CARS ?? 400), Number(process.env.STUCK_WALKERS ?? 400), Number(process.env.STUCK_SEED ?? 1), log);
      const car = summarize(rs, map, 'car'), walk = summarize(rs, map, 'walker');
      writeJson(`${out}/soak-${tag}-${map}.json`, { concave: w.concave, polygons: w.polygons, car, walk, all: rs });
      log(`${map} CAR ${car.trials} pinned ${car.pinned} hard ${car.hard} overlap ${car.overlap} tunnel ${car.tunnel}`);
      log(`${map} WALK ${walk.trials} pinned ${walk.pinned} hard ${walk.hard} overlap ${walk.overlap}`);
      expect(rs.length).toBeGreaterThan(0);
    }, 3_000_000);
  }
});
