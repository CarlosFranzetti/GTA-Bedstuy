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
it('probe', async () => { const fs0: unknown[] = [];
  const seen = new Set<string>();
  for (const sp of PED_SPECS) { const s = shapes.get(shapeFor(sp))!; if (seen.has(s.name)) continue; seen.add(s.name);
    fs0.push([s.name, 'chin', s.landmarks.chinY.toFixed(3), 'crown', s.landmarks.crownY.toFixed(3), 'shY', s.rig.shoulderL[1].toFixed(3), 'shX', s.rig.shoulderL[0].toFixed(3)]); }

  const fsm = (await import(/* @vite-ignore */ 'node:' + 'fs')) as any; fsm.writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/probe.txt', fs0.map((a) => (a as unknown[]).join(' ')).join('\n'));
});
