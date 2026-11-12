/**
 * Wooden utility poles along one side of every street-class street, with crossarms, catenary wires between
 * consecutive poles, transformer cans on every third pole and a service drop to the nearest building.
 */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import type { Block, BlockFace, GridModel, IMaterialLibrary, Lot, Side } from '@/world/types';
import { PropsBuilder, alignYaw, box, cyl, faceFrame, furnitureBlocked, type FaceFrame } from './common';

export const POLE_HEIGHT = 9;
export const POLE_COLLIDER_R = 0.25;
const POLE_CURB_INSET = 0.5;
const ARM_Y = 8.5;
const ARM_LEN = 1.9;
const ATTACH_Y = 8.62;
const SPAN = 36;
const GRID_STEP = 12; // poles snap to multiples of this so they fall between FurnitureGen's street trees
const MAX_SPAN = 75;
// a 3 cm cable is under a pixel beyond ~40 m and drew as dashes in the sky: thicker, and faded out by distance so it is a continuous line or nothing
const WIRE_RADIUS = 0.04;
function wireMaterial(): THREE.Material {
  const m = new THREE.MeshBasicMaterial({ name: 'pole-wire', color: '#1d1f22', transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWireD;').replace('#include <project_vertex>', '#include <project_vertex>\nvWireD = length( mvPosition.xyz );');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWireD;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep( 28.0, 62.0, vWireD );');
  };
  m.customProgramCacheKey = () => 'pole-wire-fade';
  return m;
}

interface Pole {
  base: Vec2;
  m: THREE.Matrix4;
  frame: FaceFrame;
  faceLots: Lot[];
  coord: number;
  index: number;
}

/** Choose pole positions (metres from curbA) along a face of length L. */
function polePositions(L: number): number[] {
  const lo = GRID_STEP, hi = L - GRID_STEP;
  if (hi < lo) return [];
  const n = Math.max(2, Math.round((hi - lo) / SPAN) + 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const target = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1);
    let s = Math.min(hi, Math.max(lo, Math.round(target / GRID_STEP) * GRID_STEP));
    // nudge off furniture (mid-face lamp, trash cans, mailboxes, trees)
    for (const d of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const c = s + d;
      if (c >= 8 && c <= L - 8 && !furnitureBlocked(c, L, 1.3)) { s = c; break; }
    }
    if (!out.some((o) => Math.abs(o - s) < 6)) out.push(s);
  }
  return out;
}

function tube(points: THREE.Vector3[], radius: number, segments: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 3, false);
}

function sagPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= 4 * sag * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

export function buildPoles(
  pb: PropsBuilder,
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): void {
  const trunk = materials.get('treeTrunk');
  const metal = materials.get('metalDark');
  const wire = wireMaterial();
  const lotsByFace = new Map<string, Lot[]>();
  for (const l of lots) {
    const k = `${l.blockId}|${l.side}`;
    const arr = lotsByFace.get(k);
    if (arr) arr.push(l); else lotsByFace.set(k, [l]);
  }

  let poleCounter = 0;
  for (const street of grid.streets) {
    if (street.class !== 'street') continue;
    const faces: { block: Block; face: BlockFace }[] = [];
    for (const block of grid.blocks) for (const face of block.faces) if (face.streetId === street.id) faces.push({ block, face });
    if (faces.length === 0) continue;
    const sidesPresent = new Set<Side>(faces.map((x) => x.face.side));
    const options: Side[] = street.axis === 'ns' ? ['E', 'W'] : ['N', 'S'];
    let side: Side = rng.chance(0.5) ? options[0] : options[1];
    if (!sidesPresent.has(side)) side = side === options[0] ? options[1] : options[0];

    const poles: Pole[] = [];
    for (const { block, face } of faces) {
      if (face.side !== side) continue;
      const frame = faceFrame(face);
      const faceLots = lotsByFace.get(`${block.id}|${face.side}`) ?? [];
      for (const s of polePositions(frame.L)) {
        const base = frame.at(s, POLE_CURB_INSET);
        const lean: [number, number] = [rng.range(-0.025, 0.025), rng.range(-0.025, 0.025)];
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(base.x, 0, base.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], 0, lean[1])),
          new THREE.Vector3(1, 1, 1),
        );
        poles.push({ base, m, frame, faceLots, coord: street.axis === 'ns' ? base.z : base.x, index: poleCounter++ });
      }
    }
    poles.sort((p, q) => p.coord - q.coord);

    const nWires = rng.int(2, 3);
    const offsets = nWires === 2 ? [-0.6, 0.6] : [-0.7, 0, 0.7];

    const attach = (p: Pole, off: number, y = ATTACH_Y, lateral = 0): THREE.Vector3 => {
      const o = p.frame.f.outward;
      const i = p.frame.inward;
      return new THREE.Vector3(o.x * off + i.x * lateral, y, o.z * off + i.z * lateral).applyMatrix4(p.m);
    };

    for (let k = 0; k < poles.length; k++) {
      const p = poles[k];
      const o = p.frame.f.outward;

      // pole
      pb.put('treeTrunk', trunk, cyl(0.15, 0.18, POLE_HEIGHT, 8).translate(0, POLE_HEIGHT / 2, 0).applyMatrix4(p.m), true);
      // crossarm (spans across the sidewalk, perpendicular to the wires) + insulators
      const armM = new THREE.Matrix4().multiplyMatrices(
        p.m,
        new THREE.Matrix4().compose(
          new THREE.Vector3(0, ARM_Y, 0),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alignYaw(o)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      pb.put('metalDark', metal, box(ARM_LEN, 0.1, 0.12).applyMatrix4(armM), true);
      for (const off of offsets) {
        const a = attach(p, off, ARM_Y + 0.12);
        pb.put('metalDark', metal, cyl(0.035, 0.045, 0.14, 6).translate(a.x, a.y, a.z));
      }
      // transformer can on every third pole, hung on the building side
      if (p.index % 3 === 0) {
        const c = attach(p, 0, 7.6, 0.42);
        pb.put('metalDark', metal, cyl(0.28, 0.28, 0.75, 10).translate(c.x, c.y, c.z), true);
        pb.put('metalDark', metal, cyl(0.2, 0.28, 0.12, 10).translate(c.x, c.y + 0.43, c.z));
        pb.count('transformers');
      }
      pb.circle(p.base, POLE_COLLIDER_R, `pole-${p.index}`);
      pb.occupied.push(p.base);
      pb.count('poles');

      // spans to the next pole along this street
      const q = poles[k + 1];
      if (q && Math.hypot(q.base.x - p.base.x, q.base.z - p.base.z) <= MAX_SPAN) {
        const sag = rng.range(0.5, 0.7);
        for (const off of offsets) {
          pb.put('wires', wire, tube(sagPoints(attach(p, off), attach(q, off), sag, 10), WIRE_RADIUS, 10));
          pb.count('wires');
        }
      }

      // service drop to the nearest (non-vacant) building front
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (const l of p.faceLots) {
        if (l.type === 'vacant') continue;
        const c = closestOnSegment(p.base, l.frontA, l.frontB);
        const d = Math.hypot(c.x - p.base.x, c.z - p.base.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) {
        const from = attach(p, 0, 8.0, 0.1);
        const to = new THREE.Vector3(best.x - o.x * 0.05, 6, best.z - o.z * 0.05);
        pb.put('wires', wire, tube(sagPoints(from, to, 0.25, 6), WIRE_RADIUS, 6));
        pb.count('serviceDrops');
      }
    }
  }
}
