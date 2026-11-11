import { describe, it, expect } from 'vitest';
import { R1_EXTENT, R2_EXTENT } from '@/world/roadnet/extents';
import { pointInPolygon } from '@/world/roadnet/geom';
import type { Vec2 } from '@/core/Math2';
import { decodeRoadNet } from '@/world/roadnet/codec';
import { RoadNet } from '@/world/roadnet/RoadNet';

const lotsFile = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as {
  meta: { counts: { lots: number } };
  lots: Array<Record<string, unknown>>;
  buildings: Array<Record<string, unknown>>;
};
const core = (await import('@/world/data/roadnet-core.json')).default as unknown as { e: unknown[] };
const edgeCount = (core.e as unknown[]).length;
const controls = (await import('@/world/data/roadnet-controls.json')).default as unknown as {
  nodes: Record<string, { control: string; source: string[] | null }>;
};

const lots = lotsFile.lots as Array<{
  bbl: string; ph: string; x: number; z: number; lf: number | null; e: number; s: number | null; sd: number; d: number | null;
  fl: number | null; yr: number | null; bins?: string[]; fa?: number; rf?: number; blk: number;
}>;
const inExtent = (x: number, z: number) => {
  const p: Vec2 = { x, z };
  return pointInPolygon(p, R1_EXTENT) || pointInPolygon(p, R2_EXTENT);
};

describe('lots-real-r1r2a.json', () => {
  it('has the counts it reports', () => {
    expect(lots.length).toBe(lotsFile.meta.counts.lots);
    expect(lots.length).toBeGreaterThan(1000);
  });

  it('has the schema for every lot', () => {
    for (const l of lots) {
      expect(typeof l.bbl).toBe('string');
      expect(l.bbl).toMatch(/^\d{10}$/);
      expect(['R1', 'R2']).toContain(l.ph);
      expect(typeof l.x).toBe('number');
      expect(typeof l.z).toBe('number');
      expect(typeof l.e).toBe('number');
      expect(typeof l.sd).toBe('number');
      expect([-1, 1, 0]).toContain(l.sd);
      expect(typeof l.blk).toBe('number');
      if (l.lf !== null) expect(l.lf).toBeGreaterThanOrEqual(0);
      if (l.bins !== undefined) expect(Array.isArray(l.bins)).toBe(true);
    }
  });

  it('has unique BBLs', () => {
    expect(new Set(lots.map((l) => l.bbl)).size).toBe(lots.length);
  });

  it('places every lot centroid inside the R1 or R2 extent', () => {
    for (const l of lots) expect(inExtent(l.x, l.z)).toBe(true);
  });

  it('points every attached edge at an existing roadnet-core edge, with a consistent distance and side', () => {
    for (const l of lots) {
      if (l.e === -1) { expect(l.d).toBeNull(); continue; }
      expect(l.e).toBeGreaterThanOrEqual(0);
      expect(l.e).toBeLessThan(edgeCount);
      expect(l.d).not.toBeNull();
      expect(l.d as number).toBeGreaterThanOrEqual(0);
      expect(l.s as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('links each building to a lot with the same BBL', () => {
    const bbls = new Set(lots.map((l) => l.bbl));
    const bins = new Set<string>();
    for (const b of lotsFile.buildings as Array<{ bin: string; bbl: string }>) {
      expect(bbls.has(b.bbl)).toBe(true);
      expect(bins.has(b.bin)).toBe(false);
      bins.add(b.bin);
    }
  });
});

describe('roadnet-controls.json', () => {
  it('covers every core node with a valid control value', () => {
    const net = new RoadNet(decodeRoadNet(core as never));
    expect(Object.keys(controls.nodes).length).toBe(net.nodes.length);
    for (const [, v] of Object.entries(controls.nodes)) {
      expect(['signal', 'stop', 'none']).toContain(v.control);
      if (v.control === 'signal') expect(v.source?.length).toBeGreaterThan(0);
    }
  });
});
