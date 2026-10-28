import { it } from 'vitest';
import { Sim, makeVehicle, input } from './harness';
it('angled into wall', () => {
  for (const steer of [-0.3, 0, 0.3]) for (const h0 of [0.5, 0.1]) {
  const sim = new Sim();
  sim.world.addStatic({ kind: 'segment', a: { x: -30, z: -10 }, b: { x: 30, z: -10 } } as any, undefined, 'wall');
  const a = makeVehicle('sedan', 0, 0, h0);
  a.driver = 'player'; a.setInput(input({throttle: 1, steer}));
  sim.add(a);
  const out: string[] = [];
  sim.run(12, (t) => { if (Math.round(t*60) % 30 === 0) out.push(`${t.toFixed(1)}:x${a.body.pos.x.toFixed(3)},z${a.body.pos.z.toFixed(3)},h${a.body.heading.toFixed(3)},v${Math.hypot(a.body.vel.x,a.body.vel.z).toFixed(3)}`); });
  console.log('steer', steer, 'h0', h0, out.slice(6).join(' | '));
  }
});
