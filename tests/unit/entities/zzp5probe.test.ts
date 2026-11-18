import { describe, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, topHemY, type MhShape } from '@/entities/models/pedMesh';
const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
beforeAll(async () => { clearPeople(); for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); } });
describe('probe', () => { it('p', () => {
  (globalThis as any).__dbg = 1;
  const rows: string[] = [];
  for (const id of ['wh-office','ba-puffer-braids','ba-hoodie-fade']) { const spec = PED_SPECS.find((p) => p.id === id)!; const s = shapes.get(shapeFor(spec))!; const D = dressLod(s, spec, s.lods.hi, true); const hy = topHemY(s, spec);
    rows.push(id + ' hem ' + hy.toFixed(3) + ' seat ' + D.tube!.ySeat.toFixed(3));
    const P = D.position, J = D.joints, W = D.weights;
    const aw = (i: number) => { let t = 0; for (let k = 0; k < 4; k++) if (J[i*4+k] >= 4 && J[i*4+k] <= 7) t += W[i*4+k]; return t; };
    const prof: string[] = [];
    const I = D.index;
    for (let y = 0.68; y < hy + 0.1; y += 0.02) { let x1 = 0, zf = 9, zb = -9; for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t+1], I[t+2]]; if (v.some((q) => aw(q) > 0.3)) continue; for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e+1)%3], ya = P[a*3+1], yb = P[b*3+1]; if ((ya-y)*(yb-y) > 0 || ya === yb) continue; const f = (y-ya)/(yb-ya), x = P[a*3]+(P[b*3]-P[a*3])*f, z = P[a*3+2]+(P[b*3+2]-P[a*3+2])*f; x1 = Math.max(x1, Math.abs(x)); zf = Math.min(zf, z); zb = Math.max(zb, z); } } prof.push(`${y.toFixed(2)}:${x1.toFixed(3)}/${zf.toFixed(3)}/${zb.toFixed(3)}`); }
    rows.push('PROF ' + id + ' ' + prof.join(' '));
  }
  console.log(rows.join('\n'));
}); });
