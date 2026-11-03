import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { loadBedstuyData } from '@/world/Grid';
import { buildWorld } from '@/world/WorldBuilder';
const stub = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;
it('dump', () => {
  const data = loadBedstuyData();
  const w = buildWorld(data, stub, new Rng(data.seed));
  const out: string[] = [];
  for (const c of w.colliders) {
    const s = c.shape as any; const p = c.pos ?? { x: 0, z: 0 };
    const pts = s.kind === 'segment' ? [s.a, s.b] : s.kind === 'polygon' ? s.points : [{ x: p.x, z: p.z }];
    const xs = pts.map((q: any) => q.x), zs = pts.map((q: any) => q.z); const r = s.kind === 'circle' ? s.r : 0;
    if (Math.min(...xs) - r <= 12.2 && Math.max(...xs) + r >= 10.4 && Math.min(...zs) - r <= 35 && Math.max(...zs) + r >= 33.4) out.push('COL ' + c.id + ' ' + JSON.stringify(c.shape) + ' ' + JSON.stringify(c.pos));
  }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/dump2.txt', out.join('\n'));
});
