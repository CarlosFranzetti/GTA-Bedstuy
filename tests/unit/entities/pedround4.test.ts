import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, type MhLod, type MhShape } from '@/entities/models/pedMesh';
import { isCoveredLeg } from '@/entities/models/pedLegs';

const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});

/** x / z extents of a leg (side -1 = the character's left) cut by the plane y: from the triangles whose vertices all belong to that leg */
function slice(D: MhLod, side: -1 | 1, y: number): { x0: number; x1: number; z0: number; z1: number } | null {
  let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
  const bones = side < 0 ? [8, 9] : [10, 11], leg = (v: number): number => { let w = 0; for (let k = 0; k < 4; k++) if (bones.includes(D.joints[v * 4 + k])) w += D.weights[v * 4 + k]; return w; };
  const P = D.position, I = D.index;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    if (v.some((q) => leg(q) < 0.55 || P[q * 3] * side < 0)) continue;
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], ya = P[a * 3 + 1], yb = P[b * 3 + 1];
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const f = (y - ya) / (yb - ya), x = P[a * 3] + (P[b * 3] - P[a * 3]) * f, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * f;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  return x1 < x0 ? null : { x0, x1, z0, z1 };
}
const widthAt = (D: MhLod, y: number): number => { const a = slice(D, -1, y); return a ? (a.x1 - a.x0 + a.z1 - a.z0) / 2 : 0; };

describe('probe', () => {
  it('dump', () => {
    for (const id of ['ba-transit', 'ba-hoodie-fade', 'la-delivery', 'ba-puffer-braids', 'wh-office']) {
      const spec = PED_SPECS.find((p) => p.id === id)!, s = shapes.get(shapeFor(spec))!;
      for (const d of ['hi', 'mid', 'far'] as const) {
        const D = dressLod(s, spec, s.lods[d], true), rows: string[] = [];
        for (const y of [0.04, 0.07, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78]) { const a = slice(D, -1, y); rows.push(a ? `y${y} x[${a.x0.toFixed(3)},${a.x1.toFixed(3)}] z[${a.z0.toFixed(3)},${a.z1.toFixed(3)}]` : `y${y} -`); }
        console.log(id, d, spec.bottom.kind, D.index.length / 3, 'tris', D.tube ? JSON.stringify(D.tube) : '', '\n' + rows.join('\n'));
      }
    }
    expect(isCoveredLeg('jeans')).toBe(true);
  });
});
