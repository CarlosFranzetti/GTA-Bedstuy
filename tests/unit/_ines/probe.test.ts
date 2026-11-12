// TEMPORARY probe (PEOPLE3): measures the dressed people without a browser. Deleted before the final report.
import { describe, it } from 'vitest';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { parseShape, registerShape, shapeFor, dressLod, headScaleFor, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import { bodyTypeOf, bodyTypeId } from '@/entities/models/pedBodyTypes';
// @ts-expect-error plain ESM
import { render, ppm } from '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/people3/tools/ortho.mjs';

const DIR = '/home/user/GTA-Bedstuy/src/assets/models/people/';
const OUT = '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/people3/probe/';
const IDS = (process.env.PROBE_IDS ?? 'la-hoodie-cap,ba-hoodie-fade,ba-work,la-delivery,wh-flannel,wh-office,ba-puffer-braids,ba-elder,sa-bomber,la-jersey-teen').split(',');
describe('probe', () => {
  it('measures', async () => {
    const shapes = new Map<string, MhShape>();
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
    const rows: string[] = [];
    const frames: Array<{ pos: Float32Array; idx: Uint32Array; nrm: Float32Array; h: number; x: number; id: string }> = [];
    for (const id of IDS) {
      const variant = PED_SPECS.findIndex((p) => p.id === id); if (variant < 0) { rows.push(id + ' missing'); continue; }
      const spec = PED_SPECS[variant], s = shapes.get(shapeFor(spec))!, bt = bodyTypeOf(spec);
      const L = dressLod(s, spec, s.lods.hi, true);
      const pos = new Float32Array(L.position), n = pos.length / 3;
      const hk = headScaleFor(s, spec, bt), ph = s.rig.head;
      // head bone scale about the neck joint (linear blend of the head weight) and the stature correction
      const crownRise = 1 + ((hk - 1) * (s.landmarks.crownY - ph[1])) / s.height;
      let top = 0, chin = 1e9, headTop = 0;
      for (let i = 0; i < n; i++) {
        let wh = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === 3) wh += L.weights[i * 4 + k];
        const sc = 1 + (hk - 1) * wh;
        pos[i * 3] = ph[0] + (pos[i * 3] - ph[0]) * sc; pos[i * 3 + 1] = ph[1] + (pos[i * 3 + 1] - ph[1]) * sc; pos[i * 3 + 2] = ph[2] + (pos[i * 3 + 2] - ph[2]) * sc;
        if (wh > 0.99) { headTop = Math.max(headTop, pos[i * 3 + 1]); }
      }
      const hs = 1 / crownRise;
      for (let i = 0; i < n; i++) { pos[i * 3 + 1] *= hs; }
      for (let i = 0; i < n; i++) top = Math.max(top, pos[i * 3 + 1]);
      const chinY = ph[1] * 1 - 0 + (s.landmarks.chinY - ph[1]) * hk; const chinYs = (chinY) * hs;
      const H = top, head = top - chinYs;
      const nrm = new Float32Array(L.normal);
      // silhouette widths from a front render (150 px per metre of... 500 px/m)
      const RW = 700, RH = 1000, y0 = -0.05, y1 = 2.0, sc = RH / (y1 - y0);
      const rr = render(pos, L.index, nrm, { yaw: 0, y0, y1, W: RW, H: RH });
      const rowW = (y: number): number => { const py = Math.round(RH - (y - y0) * sc); let a = 1e9, b = -1; for (let x = 0; x < RW; x++) { const o = (py * RW + x) * 3; if (!(rr.img[o] === 120 && rr.img[o + 1] === 120 && rr.img[o + 2] === 120)) { a = Math.min(a, x); b = Math.max(b, x); } } return b < 0 ? 0 : (b - a) / sc; };
      let shW = 0; for (let y = 0.76 * H; y < 0.88 * H; y += 0.005) shW = Math.max(shW, rowW(y));
      let waistS = 1e9; for (let y = 0.55 * H; y < 0.68 * H; y += 0.005) waistS = Math.min(waistS, rowW(y));
      const hipS = rowW(0.5 * H), chestS = rowW(0.72 * H);
      const headW = ((): number => { let a = 1e9, b = -1e9; for (let i = 0; i < n; i++) { let wh = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === 3) wh += L.weights[i * 4 + k]; if (wh > 0.99 && pos[i * 3 + 1] > chinYs + 0.05) { a = Math.min(a, pos[i * 3]); b = Math.max(b, pos[i * 3]); } } return b - a; })();
      rows.push(`${id.padEnd(18)} ${shapeFor(spec).padEnd(8)} ${bodyTypeId(spec).padEnd(13)} H ${H.toFixed(3)} heads ${(H / head).toFixed(2)} headW ${headW.toFixed(3)} | shoulder ${shW.toFixed(3)} (${(shW / headW).toFixed(2)} headW) chest ${chestS.toFixed(3)} waist ${waistS.toFixed(3)} hip ${hipS.toFixed(3)} | sh/waist ${(shW / waistS).toFixed(2)} sh/hip ${(shW / hipS).toFixed(2)}`);
      frames.push({ pos, idx: L.index, nrm, h: H, x: 0, id });
    }
    console.log('\n' + rows.join('\n'));
    // lineups: front, side, back
    const per = 0.85, W = Math.round(per * 700 * frames.length), Hh = 1000;
    for (const [name, yaw] of [['front', 0], ['side', Math.PI / 2], ['3q', 0.7]] as const) {
      const img = new Uint8Array(W * Hh * 3).fill(120);
      frames.forEach((f, k) => {
        const r = render(f.pos, f.idx, f.nrm, { yaw, y0: -0.05, y1: 2.0, W: Math.round(per * 700), H: Hh });
        for (let y = 0; y < Hh; y++) for (let x = 0; x < r.W; x++) { const a = (y * r.W + x) * 3, b = (y * W + k * r.W + x) * 3; img[b] = r.img[a]; img[b + 1] = r.img[a + 1]; img[b + 2] = r.img[a + 2]; }
      });
      ppm(OUT + `${process.env.PROBE_TAG ?? 'p'}_${name}.ppm`, { img, W, H: Hh });
    }
  });
});
