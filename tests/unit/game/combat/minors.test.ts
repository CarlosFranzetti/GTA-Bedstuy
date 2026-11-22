import { describe, expect, it } from 'vitest';
import { EventBus, World2D, makePed } from './helpers';

/** Lead's line (22 Nov): children and teenagers are never hurt. A blow aimed at one does not land; they run. */
describe('combat never hurts a minor', () => {
  const minor = (id: string) => {
    const world = new World2D(), events = new EventBus();
    const ped = makePed(world, events, id, 0, -1);
    Object.defineProperty(ped, 'isMinor', { get: () => true, configurable: true });
    return { ped };
  };
  for (const force of ['light', 'heavy', 'club', 'shot'] as const) {
    it(`a ${force} blow is ignored: no damage, not down, and they run`, () => {
      const { ped } = minor('kid-' + force);
      const before = ped.vitals.health;
      const res = ped.hitBy({ x: 0, z: 0 }, force as never);
      expect(res).toBe('ignored');
      expect(ped.vitals.health).toBe(before);
      expect(ped.state).not.toBe('down');
      expect(ped.vitals.out).toBe(false);
    });
  }
  it('repeated blows never knock a minor down or out', () => {
    const { ped } = minor('kid-many');
    for (let i = 0; i < 30; i++) ped.hitBy({ x: 0, z: 0 }, 'heavy' as never, 80);
    expect(ped.state).not.toBe('down');
    expect(ped.vitals.out).toBe(false);
    expect(ped.vitals.health).toBe(ped.vitals.max);
  });
});
