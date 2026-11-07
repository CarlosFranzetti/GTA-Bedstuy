import { describe, expect, it } from 'vitest';
import { planSignBlades, SIGN_LAYOUT } from '@/world/signBlades';
import bedstuy from '@/world/data/bedstuy.json';

const throop = { signName: 'Throop Ave', axis: 'ns' as const };
const kosciusko = { signName: 'Kosciusko St', axis: 'ew' as const };
const base = { x: 10, z: 20 };
const center = { x: 40, z: 60 };

describe('street sign blades', () => {
  it('the north-south blade carries the north-south street signName, the east-west blade the east-west one', () => {
    // either pairing order must give the same name per axis
    for (const order of [[throop, kosciusko], [kosciusko, throop]]) {
      const blades = planSignBlades(base, center, order);
      expect(blades.find((b) => b.axis === 'ns')?.text).toBe('Throop Ave');
      expect(blades.find((b) => b.axis === 'ew')?.text).toBe('Kosciusko St');
    }
  });

  it('boards run along their own street: yaw 0 for east-west, PI/2 for north-south', () => {
    const blades = planSignBlades(base, center, [throop, kosciusko]);
    expect(blades.find((b) => b.axis === 'ew')?.yaw).toBe(0);
    expect(blades.find((b) => b.axis === 'ns')?.yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('the two boards are stacked, do not cross at the pole, and hang toward the block', () => {
    const [a, b] = planSignBlades(base, center, [kosciusko, throop]);
    expect(a.y - b.y).toBeGreaterThanOrEqual(SIGN_LAYOUT.height); // no vertical overlap
    expect(a.x).toBeGreaterThan(base.x); // ew board hangs toward the block centre (+x)
    expect(a.z).toBe(base.z);
    expect(b.z).toBeGreaterThan(base.z); // ns board hangs toward +z
    expect(b.x).toBe(base.x);
    const [c] = planSignBlades(base, { x: -30, z: 0 }, [kosciusko]);
    expect(c.x).toBeLessThan(base.x);
  });

  it('real data: every cross street pair keeps its own signName per axis', () => {
    const streets = (bedstuy as { streets: Array<{ signName: string; axis: 'ns' | 'ew' }> }).streets;
    const ns = streets.filter((s) => s.axis === 'ns'), ew = streets.filter((s) => s.axis === 'ew');
    expect(ns.length).toBeGreaterThan(0);
    for (const n of ns) for (const e of ew) {
      const blades = planSignBlades(base, center, [e, n]);
      expect(blades.find((b) => b.axis === 'ns')?.text).toBe(n.signName);
      expect(blades.find((b) => b.axis === 'ew')?.text).toBe(e.signName);
    }
  });
});
