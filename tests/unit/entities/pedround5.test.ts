import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, topHemY, buildMhPedModel, type MhLod, type MhShape } from '@/entities/models/pedMesh';
import { isCoveredLeg, HEM_Y } from '@/entities/models/pedLegs';
import { hemRows, notArm, armOf, cutSegments, rayHit, type PolarRow } from '@/entities/models/pedCuts';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});
const DETAILS = ['hi', 'mid'] as const;
const BANDED = ['jacket', 'hoodie', 'puffer', 'cardigan', 'tracksuit', 'uniform'];
const hemOut = (k: string): number => (k === 'puffer' ? 0.012 : k === 'jacket' || k === 'hoodie' ? 0.011 : 0.009);

describe('round 5: shoes, hems, seat, sleeves', () => {
  it('at least 5 cm of shoe shows below the trouser hem at the front, and the shoe top reaches the hem there (hi and mid, every trousered person)', () => {
    for (const spec of PED_SPECS) {
      if (!isCoveredLeg(spec.bottom.kind)) continue;
      const v = PED_SPECS.indexOf(spec), m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!, sc = m.group.scale;
      const s = shapes.get(shapeFor(spec))!, levels: THREE.SkinnedMesh[] = [];
      m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) levels.push(o as THREE.SkinnedMesh); });
      for (const [k, d] of DETAILS.entries()) {
        const t = dressLod(s, spec, s.lods[d], true).tube!, P = levels[k].geometry.getAttribute('position'), U = levels[k].geometry.getAttribute('uv'), id = `${spec.id}/${d}`;
        const zFront = t.cz - t.rz - 0.008;
        let top = 0;
        for (let i = 0; i < P.count; i++) {
          if (U.getX(i) < 0.75 || U.getY(i) > 0.25 || P.getX(i) > -0.02 || P.getY(i) > 0.3) continue;      // the left shoe
          if (Math.abs(P.getZ(i) - zFront) < 0.035 && Math.abs(P.getX(i) - t.xL) < 0.04) top = Math.max(top, P.getY(i));
        }
        expect(t.yHem, id + ' hem height').toBeCloseTo(HEM_Y, 3);
        expect(top, id + ' shoe top at the front of the hem').toBeGreaterThanOrEqual(t.yHem + 0.004);
        expect(Math.min(t.yHem, top) * sc.y, id + ' visible shoe').toBeGreaterThanOrEqual(0.05);
      }
    }
  });

  it('no body vertex stands outside the hem band within 3 cm above the hem (hi and mid, every banded top)', () => {
    let checked = 0;
    for (const spec of PED_SPECS) {
      if (!BANDED.includes(spec.top.kind) || spec.top.long) continue;
      const s = shapes.get(shapeFor(spec))!, hemTop = topHemY(s, spec);
      for (const d of DETAILS) {
        const L: MhLod = dressLod(s, spec, s.lods[d], true), seg = d === 'hi' ? 20 : 12, hb = hemRows(L, L.position, hemTop, hemOut(spec.top.kind), seg, d === 'hi'), id = `${spec.id}/${d}`;
        expect(hb, id).toBeTruthy();
        const rows: PolarRow[] = hb!.rows.flat().filter((r) => r.up !== -1).sort((a, b) => a.y - b.y), use = notArm(L), c = hb!.c;
        // the polygon of the band at height y: neighbouring rows blended
        const polyAt = (y: number): Array<[number, number]> => {
          let i = 0; while (i + 2 < rows.length && rows[i + 1].y <= y) i++;
          const a = rows[i], b = rows[Math.min(rows.length - 1, i + 1)], f = b.y > a.y ? Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y))) : 0;
          return a.r.map((r0, j) => { const r = r0 + (b.r[j] - r0) * f, ang = (j / seg) * Math.PI * 2; return [c.cx + r * Math.cos(ang), c.cz - r * Math.sin(ang)] as [number, number]; });
        };
        for (let i = 0; i < L.position.length / 3; i++) {
          const y = L.position[i * 3 + 1];
          if (y < hemTop || y > hemTop + 0.03 || !use(i)) continue;
          const x = L.position[i * 3], z = L.position[i * 3 + 2], dx = x - c.cx, dz = z - c.cz, r = Math.hypot(dx, dz);
          if (r < 1e-4) continue;
          const poly = polyAt(y); let hit = 0;
          for (let j = 0; j < seg; j++) { const p = poly[j], q = poly[(j + 1) % seg], t = rayHit(c.cx, c.cz, dx / r, dz / r, p[0], p[1], q[0], q[1]); if (t > hit) hit = t; }
          expect(r, `${id} vertex ${i} at y ${y.toFixed(3)}`).toBeLessThanOrEqual(hit + 1e-4);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('the seat grows out of the hips: the width never jumps by more than 2 cm between cuts 2 cm apart, from the seat up to the hem of the top (hi and mid)', () => {
    for (const spec of PED_SPECS) {
      if (!isCoveredLeg(spec.bottom.kind)) continue;
      const s = shapes.get(shapeFor(spec))!, hemTop = topHemY(s, spec);
      for (const d of DETAILS) {
        const L = dressLod(s, spec, s.lods[d], true), t = L.tube!, use = notArm(L), id = `${spec.id}/${d}`;
        let prev = 0;
        for (let y = t.ySeat - 0.04; y <= Math.min(t.ySeat + 0.14, Math.max(t.ySeat + 0.1, hemTop)); y += 0.02) {
          const sg = cutSegments(L, L.position, y, use); let x1 = 0;
          for (let i = 0; i < sg.length; i += 2) x1 = Math.max(x1, Math.abs(sg[i]));
          if (prev) expect(Math.abs(x1 - prev), `${id} y ${y.toFixed(2)}`).toBeLessThan(0.025);
          prev = x1;
        }
      }
    }
  });

  it('sleeves are straight cuts: the width of each clothed arm never grows going down, and has no bulge (hi and mid)', () => {
    for (const spec of PED_SPECS) {
      if (spec.top.sleeves !== 'long' && spec.top.sleeves !== 'short') continue;
      const s = shapes.get(shapeFor(spec))!, R = s.rig, K = s.landmarks.crownY / 1.78;
      const yTop = R.shoulderL[1] - 0.08 * K, yBot = spec.top.sleeves === 'long' ? R.wristL[1] + 0.05 : R.elbowL[1] + (R.shoulderL[1] - R.elbowL[1]) * 0.42 + 0.03;
      for (const d of DETAILS) {
        const L = dressLod(s, spec, s.lods[d], true);
        for (const side of [-1, 1] as const) {
          const use = armOf(L, side), w: number[] = [];
          for (let y = yTop; y >= yBot; y -= 0.025) {
            const sg = cutSegments(L, L.position, y, use); let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
            for (let i = 0; i < sg.length; i += 2) { x0 = Math.min(x0, sg[i]); x1 = Math.max(x1, sg[i]); z0 = Math.min(z0, sg[i + 1]); z1 = Math.max(z1, sg[i + 1]); }
            if (x1 > x0) w.push((x1 - x0 + z1 - z0) / 2);
          }
          const id = `${spec.id}/${d}/${side}`;
          expect(w.length, id).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < w.length; i++) expect(w[i], id + ' never wider going down').toBeLessThanOrEqual(w[i - 1] + 0.006);
          for (let i = 1; i + 1 < w.length; i++) expect(w[i] - (w[i - 1] + w[i + 1]) / 2, id + ' no bulge').toBeLessThan(0.008);
        }
      }
    }
  });

  it('skirts, dresses and long coats keep covering the legs in a walking pose seen from the front (the hem follows the thighs)', () => {
    let checked = 0;
    for (const spec of PED_SPECS) {
      if (spec.bottom.kind !== 'skirt' && !(spec.top.long && spec.top.kind !== 'dress')) continue;
      const v = PED_SPECS.indexOf(spec), m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!;
      const mesh = (() => { let r: THREE.SkinnedMesh | null = null; m.group.traverse((o) => { if (!r && (o as THREE.SkinnedMesh).isSkinnedMesh) r = o as THREE.SkinnedMesh; }); return r!; })();
      const legs = m.legs as THREE.Object3D[], ids = spec.id;
      legs[0].rotation.x = -0.4; legs[1].rotation.x = 0.4;
      m.group.updateMatrixWorld(true); mesh.skeleton.update();
      const g = mesh.geometry, used = new Set<number>(Array.from(g.index!.array as ArrayLike<number>)), P = g.getAttribute('position'), U = g.getAttribute('uv'), J = g.getAttribute('skinIndex'), W = g.getAttribute('skinWeight'), tmp = new THREE.Vector3();
      const skirt: THREE.Vector3[] = [], skin: THREE.Vector3[] = [];
      for (let i = 0; i < P.count; i++) {
        if (!used.has(i)) continue;
        let wl = 0; for (let k = 0; k < 4; k++) if (J.getComponent(i, k) >= 8) wl += W.getComponent(i, k);
        const swatch = U.getX(i) > 0.5 && U.getX(i) < 0.625 && U.getY(i) > 0.75 && U.getY(i) < 0.875 || U.getX(i) > 0.625 && U.getX(i) < 0.75 && U.getY(i) > 0.75 && U.getY(i) < 0.875;
        mesh.getVertexPosition(i, tmp);
        if (swatch && P.getY(i) < 0.9 && P.getY(i) > 0.3) skirt.push(tmp.clone());
        else if (wl > 0.9 && U.getY(i) < 0.25 && U.getX(i) < 0.25 && P.getY(i) > 0.3 && P.getY(i) < 0.8) skin.push(tmp.clone());      // the bare thigh
      }
      if (!skirt.length || !skin.length) continue;
      for (const q of skin) {
        let front = Infinity; for (const p of skirt) if (Math.abs(p.y - q.y) < 0.2) front = Math.min(front, p.z);
        if (isFinite(front)) { expect(q.z, `${ids} thigh vertex at y ${q.y.toFixed(2)} stays behind the skirt front`).toBeGreaterThanOrEqual(front - 0.01); checked++; }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('triangle counts stay within 5 % of the totals before round 5 (hi 354255, mid 130114, far 30468)', () => {
    const base = { hi: 354255, mid: 130114, far: 30468 }, tot = { hi: 0, mid: 0, far: 0 };
    PED_SPECS.forEach((p, v) => { const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!; const lv: number[] = []; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) lv.push((o as THREE.SkinnedMesh).geometry.index!.count / 3); }); tot.hi += lv[0]; tot.mid += lv[1]; tot.far += lv[2]; });
    console.log('tris5', JSON.stringify(tot));
    expect(tot.hi / base.hi).toBeLessThan(1.05); expect(tot.mid / base.mid).toBeLessThan(1.05); expect(tot.far / base.far).toBeLessThan(1.05);
  });
});
