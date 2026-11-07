import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { realPhysics } from './harness';
import { World2D } from '@/physics/World2D';
it('probe', () => {
  const { physics, world } = realPhysics();
  const out: string[] = [];
  for (const [x, z] of [[-12.9, 19.4], [-12.2, 20.6], [-11.5, 21.8]]) {
    out.push(`at ${x},${z} overlap=${physics.overlapsStatic({ x, z }, 0.4)}`);
    for (const c of world.colliders) {
      const s: any = c.shape;
      const w = new World2D(12); w.addStatic(s, c.pos, 'x');
      if (w.overlapsStatic({ x, z }, 2)) out.push(`  ${c.id} ${s.kind} ${JSON.stringify(s.points ?? s.a ? (s.points ?? [s.a, s.b]) : [c.pos, s.r]).replace(/(\.\d)\d+/g, '$1')}`);
    }
  }
  const lot = world.lots.filter((l: any) => l.id.startsWith('r2c0-E-8') || l.id === 'r2c0-E-8');
  out.push(JSON.stringify(lot.map((l: any) => ({ id: l.id, type: l.type, w: l.width, d: l.depth, a: l.frontA, b: l.frontB }))));
  writeFileSync('/tmp/probe.txt', out.join('\n'));
});
