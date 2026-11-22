import { beforeAll, describe, it } from 'vitest';
import { clearPeople, parseShape, registerShape, dressLod, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS, type PedSpec } from '@/textures/painters/ped';
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const shapes = new Map<string, MhShape>();
describe('x', () => {
  beforeAll(async () => {
    const fs = await import('node:fs'); clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); const sh = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(sh); shapes.set(sh.name, sh); }
  });
  it('dump', () => {
    console.log([...shapes.keys()].join(' '));
    const s = [...shapes.values()][0];
    console.log(JSON.stringify(s.rig), JSON.stringify(s.landmarks), s.height);
    for (const lv of ['hi', 'mid', 'far'] as const) { const L = s.lods[lv]; console.log(lv, L.position.length / 3, L.index.length / 3); }
    const L = s.lods.hi, H = s.landmarks.crownY; const rows: Record<string, number[]> = {};
    for (let i = 0; i < L.position.length / 3; i++) {
      const y = L.position[i * 3 + 1]; if (y < 0.85 || y > 1.5) continue; let wa = 0; for (let k = 0; k < 4; k++) if ([4,5,6,7].includes(L.joints[i*4+k])) wa += L.weights[i*4+k]; if (wa > 0.4) continue;
      const b = (Math.round(y / 0.05) * 0.05).toFixed(2); (rows[b] ??= []).push(i);
    }
    for (const b of Object.keys(rows).sort()) { const ids = rows[b]; let z0 = 9, z1 = -9, x1 = 0; for (const i of ids) { z0 = Math.min(z0, L.position[i*3+2]); z1 = Math.max(z1, L.position[i*3+2]); x1 = Math.max(x1, Math.abs(L.position[i*3])); } console.log(b, ids.length, 'z', z0.toFixed(3), z1.toFixed(3), 'xmax', x1.toFixed(3)); }
    console.log('joint ids sample', Array.from(new Set(Array.from(L.joints))).join(','));
  }, 120000);
});
