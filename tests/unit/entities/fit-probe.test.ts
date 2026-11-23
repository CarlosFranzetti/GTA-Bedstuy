import { beforeAll, it } from 'vitest';
import { PED_SPECS } from '@/textures/painters/ped';
import { bodyTypeId } from '@/entities/models/pedBodyTypes';
import { parseShape, shapeFor, type MhShape } from '@/entities/models/pedMesh';
type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[] };
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const shapes = new Map<string, MhShape>();
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); shapes.set(s.name, s); }
}, 60000);
it('probe', async () => {
  const { composeSpec } = await import('@/textures/painters/pedWardrobe');
  const { registerSpec } = await import('@/textures/painters/ped');
  const { dressLod, bodyStack } = await import('@/entities/models/pedMesh');
  void bodyStack;
  const out: string[] = [];
  const spec = composeSpec(3, { group: 'wh', sex: 'm', age: 'adult' }, { look: 'street' });
  spec.top = { ...spec.top, kind: 'hoodie' } as typeof spec.top; registerSpec(spec);
  const s = shapes.get(shapeFor(spec))!;
  const A = dressLod(s, spec, s.lods.hi, false), B = dressLod(s, spec, s.lods.hi, true);
  const shY = s.rig.shoulderL[1];
  out.push('top ' + spec.top.kind + ' shY ' + shY);
  const rows: string[] = [];
  for (let i = 0; i < A.position.length / 3; i++) {
    const y = A.position[i*3+1]; if (y < shY - 0.12 || y > shY + 0.12) continue;
    const dx = B.position[i*3]-A.position[i*3], dy = B.position[i*3+1]-A.position[i*3+1], dz = B.position[i*3+2]-A.position[i*3+2];
    const d = Math.hypot(dx,dy,dz);
    let wt = 0, wa = 0; for (let k=0;k<4;k++){ const j=A.joints[i*4+k], w=A.weights[i*4+k]; if (j===2) wt+=w; if (j>=4&&j<=7) wa+=w; }
    rows.push([ (y-shY).toFixed(3), A.position[i*3].toFixed(3), A.position[i*3+2].toFixed(3), (d*1000).toFixed(1), wt.toFixed(2), wa.toFixed(2)].join(' '));
  }
  out.push('dy x z d_mm wT wA'); out.push(...rows.sort());
  const fsm = (await import(/* @vite-ignore */ 'node:' + 'fs')) as any; fsm.writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/probe.txt', out.join('\n'));
});
