// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Minimap, worldToMinimap, smoothHeading, northMarkerPos } from '@/ui/Minimap';
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

describe('smoothHeading', () => {
  it('moves toward the target without overshooting', () => {
    const h = smoothHeading(0, 1, 1 / 60);
    expect(h).toBeGreaterThan(0); expect(h).toBeLessThan(1);
    expect(smoothHeading(0, 1, 5)).toBeCloseTo(1, 3);
  });
  it('takes the short way round the wrap', () => {
    const h = smoothHeading(3.0, -3.0, 1 / 30);
    expect(Math.abs(h)).toBeGreaterThan(3.0); // still near +-pi, not swinging through 0
  });
  it('snaps when there is no previous heading', () => {
    expect(smoothHeading(Number.NaN, 1.2, 0.016)).toBeCloseTo(1.2);
  });
});

describe('northMarkerPos', () => {
  it('is at the top of the rim when facing north and at the bottom when facing south', () => {
    const up = northMarkerPos(0, SIZE, 11);
    expect(up.x).toBeCloseTo(CENTRE); expect(up.y).toBeCloseTo(11);
    const down = northMarkerPos(Math.PI, SIZE, 11);
    expect(down.x).toBeCloseTo(CENTRE, 5); expect(down.y).toBeCloseTo(SIZE - 11);
  });
  it('swings to the left when facing east (north is then on the left)', () => {
    const p = northMarkerPos(Math.PI / 2, SIZE, 11);
    expect(p.x).toBeLessThan(CENTRE - 50);
    expect(p.y).toBeCloseTo(CENTRE, 5);
  });
});

describe('Minimap dt', () => {
  it('accepts an explicit dt and tolerates repeated updates', () => {
    const root = document.createElement('div');
    const grid = { streets: [], segments: [], intersections: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } } as unknown as GridModel;
    const m = new Minimap(root, grid);
    expect(() => { for (let i = 0; i < 10; i++) m.update({ x: 0, z: 0 }, i * 0.3, [], 1 / 60); }).not.toThrow();
  });
});

describe('Minimap drawing (stubbed 2D context)', () => {
  it('draws the N marker and alternates cop blip colours over time', async () => {
    const { vi } = await import('vitest');
    const texts: string[] = [];
    const fills: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) {
        if (k === 'fillText') return (s: string) => { texts.push(s); };
        if (k in t) return t[k];
        return () => undefined;
      },
      set(t, k: string, v) { if (k === 'fillStyle') fills.push(String(v)); t[k] = v; return true; },
    });
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const root = document.createElement('div');
    const grid = { streets: [], segments: [], intersections: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } } as unknown as GridModel;
    const m = new Minimap(root, grid);
    m.update({ x: 0, z: 0 }, 0, [{ x: 4, z: 4 }], 0.01);
    expect(texts).toContain('N');
    const first = fills.filter((f) => f === '#ef4444' || f === '#3b82f6');
    m.update({ x: 0, z: 0 }, 0, [{ x: 4, z: 4 }], 0.25);
    const second = fills.filter((f) => f === '#ef4444' || f === '#3b82f6').slice(first.length);
    expect(first.length).toBe(1); expect(second.length).toBe(1);
    expect(second[0]).not.toBe(first[0]);
    spy.mockRestore();
  });
});
