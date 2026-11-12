/**
 * REALGAME hooks are a strict no-op on the grid: the three street-based route ends equal the metres they replaced, offsets and
 * foot routes pass through, ambient notices take their old positions, and saves from before the map field still load as they did.
 */
import { describe, it, expect } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { buildMissions } from '@/game/missions/content';
import { facePoint, footRoute, offset, streetAt, useRealPlaces } from '@/game/missions/content/places';
import { ambientItems } from '@/game/story/AmbientNotices';
import { migrateSave, poseOnMap, captureSave, type SaveParts } from '@/ui/GameSave';

const data = loadBedstuyData();
const grid = buildGrid(data);

describe('the grid is untouched', () => {
  it('the three route ends are the old literals', () => {
    useRealPlaces(null);
    const missions = buildMissions(grid, data);
    const tails = (id: string) => missions.find((m) => m.id === id)!.objectives.filter((o) => o.kind === 'tail') as Array<{ route: Array<{ x: number; z: number }> }>;
    const contractor = facePoint(grid, 'r0c1', 'S', 0.3), office = facePoint(grid, 'r1c1', 'S', 0.6);
    expect(tails('permit-pending')[0].route[0]).toEqual({ x: contractor.x, z: -100 });
    expect(tails('permit-pending')[0].route[3]).toEqual({ x: office.x, z: 0 });
    const sweeper = tails('alternate-side-shuffle')[0].route;
    expect(sweeper[sweeper.length - 1]).toEqual({ x: 0, z: 190 });
  });

  it('offset, foot routes and street points pass through unchanged', () => {
    useRealPlaces(null);
    expect(offset({ x: 10, z: 20 }, 3, -4)).toEqual({ x: 13, z: 16 });
    const r = [{ x: 1, z: 2 }, { x: 3, z: 4 }];
    expect(footRoute(r)).toBe(r);
    expect(streetAt(grid, 'throop', 190)).toEqual({ x: 0, z: 190 });
    expect(streetAt(grid, 'pulaski', 55)).toEqual({ x: 55, z: -100 });
  });

  it('ambient notices are the same with and without the real hook', () => {
    expect(ambientItems(grid, undefined)).toEqual(ambientItems(grid));
  });

  it('saves: no map field is invented, an existing one survives, the same map only clamps', () => {
    const base = { v: 3, savedAt: 1, hour: 9, pose: { x: 1, z: 2, heading: 0, inCar: false } };
    expect(migrateSave(base)!.pose).toEqual({ x: 1, z: 2, heading: 0, inCar: false });
    expect(migrateSave({ ...base, pose: { ...base.pose, map: 'real' } })!.pose.map).toBe('real');
    expect(migrateSave({ ...base, pose: { ...base.pose, map: 'moon' } })!.pose.map).toBeUndefined();
    const home = { x: 0, z: 0, heading: 0 }, b = grid.bounds;
    expect(poseOnMap({ x: 5, z: 6, heading: 1, inCar: true, vehicleType: 'taxi' }, 'grid', home, b)).toEqual({ x: 5, z: 6, heading: 1, inCar: true, vehicleType: 'taxi', map: 'grid' });
    expect(poseOnMap({ x: 1e9, z: -1e9, heading: 1, inCar: false }, 'grid', home, b)).toMatchObject({ x: b.maxX + 25, z: b.minZ - 25 });
    expect(poseOnMap({ x: 5, z: 6, heading: 1, inCar: true, map: 'real' }, 'grid', home, b)).toEqual({ x: 0, z: 0, heading: 0, inCar: false, map: 'grid' });
    void (captureSave as unknown as (p: SaveParts) => unknown);
  });
});
