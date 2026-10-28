import { appendFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { realPhysics } from '../sim/harness';
it('q', () => {
  const { physics } = realPhysics();
  const P = (process.env.PT ?? '11.1,102.3').split(',').map(Number);
  const out = process.env.OUT!;
  writeFileSync(out, '');
  const seen = new Set<string>();
  for (let a = 0; a < 72; a++) {
    const th = (a / 72) * Math.PI * 2;
    const h = physics.raycastStatic({ x: P[0], z: P[1] }, { x: Math.cos(th), z: Math.sin(th) }, 5);
    if (h && !seen.has(h.body.id)) { seen.add(h.body.id); appendFileSync(out, `${(th*180/Math.PI).toFixed(0)}deg d=${h.dist.toFixed(2)} ${h.body.id} ${h.body.kind} ${JSON.stringify(h.body.shape).slice(0,200)}\n`); }
  }
});
