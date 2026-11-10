import { describe, expect, it } from 'vitest';
import { World2D } from '@/physics/World2D';
import type { Body2D } from '@/world/types';

const car = (id: string, x: number, z: number, kind: Body2D['kind'] = 'vehicle'): Body2D =>
  ({ id, kind, shape: { kind: 'obb', halfW: 0.9, halfL: 2.4 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading: 0, mass: 1400 });

describe('World2D.overlapsSolid', () => {
  it('counts statics and other vehicles, ignores the named car, pedestrians and the player', () => {
    const w = new World2D(12);
    w.addStatic({ kind: 'circle', r: 0.3 }, { x: 10, z: 0 }, 'pole');
    w.addBody(car('a', 0, 0));
    w.addBody(car('cop1', 5, 0, 'cop'));
    w.addBody({ id: 'ped', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 });
    expect(w.overlapsSolid({ x: 10, z: 0 }, 0.4)).toBe(true);        // static
    expect(w.overlapsSolid({ x: 1.0, z: 0 }, 0.4)).toBe(true);        // beside car a, inside its flank
    expect(w.overlapsSolid({ x: 1.0, z: 0 }, 0.4, 'a')).toBe(false);  // ...unless it is the car being left
    expect(w.overlapsSolid({ x: 5.5, z: 0 }, 0.4)).toBe(true);        // cop car
    expect(w.overlapsSolid({ x: 20, z: 0 }, 0.4)).toBe(false);        // pedestrian
    expect(w.overlapsSolid({ x: 3, z: 8 }, 0.4)).toBe(false);         // open ground
  });
});
