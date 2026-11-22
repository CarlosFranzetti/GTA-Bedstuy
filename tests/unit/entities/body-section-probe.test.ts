// BODY seat probe: cross-sections of a bare base shape by height (share of stature). Prints to BODY_OUT when set.
import { beforeAll, describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { clearPeople, parseShape, registerShape, shapeByName, type MhShape } from '@/entities/models/pedMesh';

const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.BODY_OUT ?? '';
const NAMES = (process.env.BODY_SHAPES ?? 'wh_m,wh_f').split(',');
export function sections(s: MhShape): string {
  const L = s.lods.hi, n = L.position.length / 3, H = s.landmarks.crownY;
  const wsum = (i: number, set: number[]) => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
  const rows: string[] = [`${s.name} H=${H.toFixed(3)} chin=${(s.landmarks.chinY / H).toFixed(3)} sh=${(s.rig.shoulderL[1] / H).toFixed(3)} el=${(s.rig.elbowL[1] / H).toFixed(3)} wr=${(s.rig.wristL[1] / H).toFixed(3)} hip=${(s.rig.hipL[1] / H).toFixed(3)} kn=${(s.rig.kneeL[1] / H).toFixed(3)} an=${(s.landmarks.ankleY / H).toFixed(3)} shX=${s.rig.shoulderL[0].toFixed(3)} elX=${s.rig.elbowL[0].toFixed(3)} wrX=${s.rig.wristL[0].toFixed(3)} hipX=${s.rig.hipL[0].toFixed(3)}`, 'y/H   torsoW torsoD  torsoZc | armXmin armXmax armZ | legX0 legX1 | tW/H tD/H'];
  for (let f = 0.32; f <= 0.93; f += 0.02) {
    const y = f * H, h = 0.012 * H;
    let tx0 = 9, tx1 = -9, tz0 = 9, tz1 = -9, ax0 = 9, ax1 = -9, az = 0, an = 0, lx0 = 9, lx1 = -9;
    for (let i = 0; i < n; i++) {
      if (Math.abs(L.position[i * 3 + 1] - y) > h) continue;
      const x = L.position[i * 3], z = L.position[i * 3 + 2], wa = wsum(i, [4, 5, 6, 7]), wl = wsum(i, [8, 9, 10, 11]);
      if (wa > 0.5) { if (x < 0) { ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); az += z; an++; } }
      else if (wl > 0.5) { if (x < 0) { lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); } if (x > -0.002) { /* skip */ } tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); tz0 = Math.min(tz0, z); tz1 = Math.max(tz1, z); }
      else { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); tz0 = Math.min(tz0, z); tz1 = Math.max(tz1, z); }
    }
    rows.push(`${f.toFixed(2)}  ${(tx1 - tx0).toFixed(3)} ${(tz1 - tz0).toFixed(3)}  ${((tz0 + tz1) / 2).toFixed(3)} | ${ax0.toFixed(3)} ${ax1.toFixed(3)} ${(an ? az / an : 0).toFixed(3)} | ${lx0.toFixed(3)} ${lx1.toFixed(3)} | ${((tx1 - tx0) / H).toFixed(3)} ${((tz1 - tz0) / H).toFixed(3)}`);
  }
  return rows.join('\n');
}
describe('body sections', () => {
  beforeAll(async () => {
    const fs = await import('node:fs');
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
  });
  it('print', () => { const t = NAMES.map((n) => sections(shapeByName(n)!)).join('\n\n'); if (OUT) writeFileSync(OUT, t); else console.log(t); });
});
