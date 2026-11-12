// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Minimap } from '@/ui/Minimap';
import type { GridModel } from '@/world/types';

const stub = () => new Proxy({} as Record<string, unknown>, { get(t, k: string) { return k in t ? t[k] : () => undefined; }, set(t, k: string, v) { t[k] = v; return true; } });
const gridWith = (avenues: number) => ({
  streets: avenues ? [{ id: 'a', name: 'Throop Ave', class: 'avenue', axis: 'ns', offset: 0 }] : [], segments: [], intersections: [],
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
}) as unknown as GridModel;

describe('Minimap street layer', () => {
  it('a given street layer replaces the grid roads and the grid avenue labels', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(stub() as unknown as CanvasRenderingContext2D);
    const roads = vi.fn();
    const m = new Minimap(document.createElement('div'), gridWith(1), roads);
    m.update({ x: 10, z: 20 }, 0.5, [], 0.01);
    expect(roads).toHaveBeenCalledTimes(1);
    const [, toMap, player, scale, size] = roads.mock.calls[0];
    expect(player).toEqual({ x: 10, z: 20 });
    expect(scale).toBeGreaterThan(0);
    expect(toMap({ x: 10, z: 20 })).toEqual({ x: size / 2, y: size / 2 }); // the player is the centre
    spy.mockRestore();
  });

  it('without one the grid draws as before (no callback needed)', () => {
    const texts: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, { get(t, k: string) { if (k === 'strokeText') return (s: string) => { texts.push(s); }; return k in t ? t[k] : () => undefined; }, set(t, k: string, v) { t[k] = v; return true; } });
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    new Minimap(document.createElement('div'), gridWith(1)).update({ x: 0, z: 0 }, 0, [], 0.01);
    expect(texts).toContain('Throop Ave');
    spy.mockRestore();
  });
});
