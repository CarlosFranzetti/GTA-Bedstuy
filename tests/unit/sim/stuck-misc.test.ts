/** STUCK misc report (off unless STUCK_MISC=<folder>): tunnelling, jitter at rest, exit overlaps on both maps. */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { World2D } from '@/physics/World2D';
import { gridWorld, realStreetWorld } from './stuck-soak-lib';
import { miscChecks } from './stuck-misc-lib';

const out = process.env.STUCK_MISC;
(out ? describe : describe.skip)('stuck misc', () => {
  for (const map of (process.env.STUCK_MAPS ?? 'grid,real').split(',') as Array<'grid' | 'real'>) {
    it(`misc ${map}`, async () => {
      World2D.rescueEnabled = process.env.STUCK_NORESCUE !== '1';
      const w = map === 'grid' ? gridWorld(1) : await realStreetWorld(1, 36);
      const r = miscChecks(w, 1, Number(process.env.STUCK_N ?? 150));
      writeFileSync(`${out}/misc-${process.env.STUCK_TAG ?? 'run'}-${map}.json`, JSON.stringify(r, null, 1));
      expect(r.tunnelTrials).toBeGreaterThan(0);
    }, 1_800_000);
  }
});
