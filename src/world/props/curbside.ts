/**
 * Curbside clutter: dumpsters in front of some mixed-use lots, garbage-bag piles in front of brownstones
 * (collection night, always for now) and traffic cones near one intersection of every avenue.
 */
import * as THREE from 'three';
import type { Block, GridModel, IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { PropsBuilder, box, cyl, faceFrame, furnitureBlocked, near, xform, type FaceFrame } from './common';

export const DUMPSTER = { L: 1.8, W: 1.2, H: 1.4 };
const DUMPSTER_CHANCE = 0.15;
const BAGS_CHANCE = 0.25;

/** Candidate along-face positions inside a lot's span: its middle first, then outward alternately. */
function lotCandidates(fr: FaceFrame, lot: Lot, margin: number, step: number): number[] {
  const s0 = fr.along(lot.frontA), s1 = fr.along(lot.frontB);
  const lo = Math.min(s0, s1) + margin, hi = Math.max(s0, s1) - margin;
  if (hi < lo) return [];
  const mid = (lo + hi) / 2;
  const out = [mid];
  for (let k = 1; mid + k * step <= hi || mid - k * step >= lo; k++) {
    if (mid + k * step <= hi) out.push(mid + k * step);
    if (mid - k * step >= lo) out.push(mid - k * step);
  }
  return out;
}

export function buildCurbside(
  pb: PropsBuilder,
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): void {
  const green = materials.get('metalGreen');
  const metal = materials.get('metalDark');
  const bagMat = pb.material('bags', () => new THREE.MeshStandardMaterial({ name: 'trash-bags', color: '#444851', roughness: 0.5, metalness: 0.05 }));
  const coneMat = pb.material('cone', () => new THREE.MeshStandardMaterial({ name: 'traffic-cone', color: '#ff6a13', roughness: 0.6, metalness: 0 }));

  // ---- dumpsters + bag piles, per face
  for (const block of grid.blocks as Block[]) {
    for (const face of block.faces) {
      const fr = faceFrame(face);
      const faceLots = lots.filter((l) => l.blockId === block.id && l.side === face.side);
      for (const lot of faceLots) {
        if (lot.type === 'mixeduse' && lot.poi?.archetype !== 'bodega' && rng.chance(DUMPSTER_CHANCE)) {
          const inset = 0.2 + DUMPSTER.W / 2 + 0.05;
          for (const s of lotCandidates(fr, lot, 1.2, 1.5)) {
            if (s < 3 || s > fr.L - 3) continue;
            const p = fr.at(s, inset);
            if (furnitureBlocked(s, fr.L, 1.6) || near(p, pb.occupied, 2.0)) continue;
            addDumpster(pb, green, metal, p, fr);
            pb.occupied.push(p);
            break;
          }
        } else if (lot.type === 'brownstone' && rng.chance(BAGS_CHANCE)) {
          for (const s of lotCandidates(fr, lot, 0.8, 1.2)) {
            if (s < 3 || s > fr.L - 3) continue;
            const p = fr.at(s, 0.55);
            if (furnitureBlocked(s, fr.L, 1.0) || near(p, pb.occupied, 1.5)) continue;
            addBagPile(pb, bagMat, p, rng);
            pb.occupied.push(p);
            break;
          }
        }
      }
    }
  }

  // ---- traffic cones: one intersection per avenue, a short run along the kerb just past the crosswalk
  for (const street of grid.streets) {
    if (street.class !== 'avenue') continue;
    const cands = grid.intersections.filter((i) => i.nsStreetId === street.id || i.ewStreetId === street.id);
    if (cands.length === 0) continue;
    const I = rng.pick(cands);
    const n = rng.int(2, 3);
    const ns = street.axis === 'ns';
    const half = ns ? I.halfX : I.halfZ;      // half width of this avenue's roadway
    const cross = ns ? I.halfZ : I.halfX;     // half width of the street crossing it
    const kerbSide = rng.chance(0.5) ? 1 : -1;
    let dirSign = rng.chance(0.5) ? 1 : -1;
    const spot = (k: number, dSign: number): Vec2 => {
      const across = kerbSide * (half - 0.7) + rng.range(-0.12, 0.12);
      const along = dSign * (cross + 4.5 + 1.3 * k);
      return ns ? { x: I.center.x + across, z: I.center.z + along } : { x: I.center.x + along, z: I.center.z + across };
    };
    const b = grid.bounds;
    const last = spot(n - 1, dirSign);
    if (last.x < b.minX || last.x > b.maxX || last.z < b.minZ || last.z > b.maxZ) dirSign = -dirSign;
    for (let k = 0; k < n; k++) {
      const p = spot(k, dirSign);
      pb.put('cone', coneMat, xform(new THREE.ConeGeometry(0.13, 0.55, 10).translate(0, 0.325, 0), p.x, 0, p.z));
      pb.put('cone', coneMat, xform(box(0.32, 0.04, 0.32).translate(0, 0.02, 0), p.x, 0, p.z, rng.range(0, 1.5)));
      pb.count('cones');
    }
  }
}

function addDumpster(pb: PropsBuilder, green: THREE.Material, metal: THREE.Material, p: Vec2, fr: FaceFrame): void {
  const { L, W, H } = DUMPSTER;
  const yaw = fr.yaw;
  pb.put('metalGreen', green, xform(box(L, 1.1, W).translate(0, 0.25 + 0.55, 0), p.x, 0, p.z, yaw), true);
  // hinged lid, slightly proud of the body, with a front lip
  pb.put('metalGreen', green, xform(box(L + 0.06, 0.06, W + 0.06).translate(0, H - 0.03, 0), p.x, 0, p.z, yaw), true);
  pb.put('metalDark', metal, xform(box(L * 0.8, 0.05, 0.05).translate(0, H + 0.04, 0), p.x, 0, p.z, yaw));
  // base rails and four casters
  pb.put('metalDark', metal, xform(box(L - 0.1, 0.1, W - 0.2).translate(0, 0.2, 0), p.x, 0, p.z, yaw));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pb.put('metalDark', metal, xform(cyl(0.1, 0.1, 0.07, 8).rotateX(Math.PI / 2).translate(sx * (L / 2 - 0.2), 0.1, sz * (W / 2 - 0.12)), p.x, 0, p.z, yaw));
  }
  pb.rectCollider(p, fr.u, L / 2, W / 2, `dumpster-${pb.counts.dumpsters ?? 0}`);
  pb.count('dumpsters');
}

function addBagPile(pb: PropsBuilder, mat: THREE.Material, p: Vec2, rng: Rng): void {
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.26, 0.38);
    const a = rng.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : rng.range(0.2, 0.45);
    const stacked = i >= 4;
    const geo = new THREE.SphereGeometry(r, 8, 6).scale(1, 0.85, 1);
    pb.put('bags', mat, xform(geo, p.x + Math.cos(a) * d, stacked ? r * 1.4 + 0.15 : r * 0.85, p.z + Math.sin(a) * d, rng.range(0, Math.PI)));
  }
  pb.count('bagPiles');
}
