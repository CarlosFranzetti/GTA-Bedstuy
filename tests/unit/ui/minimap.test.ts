// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Minimap, worldToMinimap } from '@/ui/Minimap';
import { forwardFromHeading, perpRight } from '@/core/Math2';
import type { GridModel } from '@/world/types';

const SIZE = 220;
const CENTRE = SIZE / 2;
const SCALE = 2; // px per metre
const HEADINGS = [0, Math.PI / 2, Math.PI, -2.3, 1.1, 5.9];

/** Point `m` metres along `dir` from `origin`. */
const offset = (origin: { x: number; z: number }, dir: { x: number; z: number }, m: number) => ({
  x: origin.x + dir.x * m,
  z: origin.z + dir.z * m,
});

describe('worldToMinimap', () => {
  it('maps the player to the centre of the map', () => {
    const player = { x: 37, z: -12 };
    for (const h of HEADINGS) {
      const p = worldToMinimap(player, player, h, SCALE, SIZE);
      expect(p.x).toBeCloseTo(CENTRE, 6);
      expect(p.y).toBeCloseTo(CENTRE, 6);
    }
  });

  it('puts a point 10 m ahead of the player above centre regardless of heading', () => {
    const player = { x: 100, z: 200 };
    for (const h of HEADINGS) {
      const ahead = offset(player, forwardFromHeading(h), 10);
      const p = worldToMinimap(ahead, player, h, SCALE, SIZE);
      expect(p.x).toBeCloseTo(CENTRE, 6);
      expect(p.y).toBeCloseTo(CENTRE - 10 * SCALE, 6);
    }
  });

  it('puts a point 10 m to the player\'s right on the right of centre', () => {
    const player = { x: -5, z: 8 };
    for (const h of HEADINGS) {
      const right = offset(player, perpRight(forwardFromHeading(h)), 10);
      const p = worldToMinimap(right, player, h, SCALE, SIZE);
      expect(p.x).toBeCloseTo(CENTRE + 10 * SCALE, 6);
      expect(p.y).toBeCloseTo(CENTRE, 6);
    }
  });

  it('keeps north up when heading is 0', () => {
    const player = { x: 0, z: 0 };
    const north = worldToMinimap({ x: 0, z: -10 }, player, 0, SCALE, SIZE);
    expect(north.x).toBeCloseTo(CENTRE, 6);
    expect(north.y).toBeCloseTo(CENTRE - 20, 6);
    const east = worldToMinimap({ x: 10, z: 0 }, player, 0, SCALE, SIZE);
    expect(east.x).toBeCloseTo(CENTRE + 20, 6);
    expect(east.y).toBeCloseTo(CENTRE, 6);
  });
});

describe('Minimap', () => {
  it('constructs, appends a canvas and updates without throwing when there is no 2D context', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const grid = { streets: [], segments: [], intersections: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } } as unknown as GridModel;
    const minimap = new Minimap(root, grid);
    expect(root.querySelector('canvas')).not.toBeNull();
    expect(() => minimap.update({ x: 0, z: 0 }, 0, [{ x: 5, z: 5 }])).not.toThrow();
    root.remove();
  });
});
