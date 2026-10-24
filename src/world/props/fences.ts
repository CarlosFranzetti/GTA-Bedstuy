/**
 * Fences: chain-link around vacant lots (sides + rear; the front fence is already part of the vacant-lot
 * building, so a front run with a gate gap is only added when `vacantFrontFence` is set) and a plywood
 * construction hoarding on the sidewalk in front of scaffold lots.
 */
import type { IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { PropsBuilder, bar, box, norm2, wallPanel, xform } from './common';
import type * as THREE from 'three';

const FENCE_H = 2.2;
const POST_SPACING = 3;
const GATE_W = 2.2;
const HOARD_H = 2.4;
const HOARD_OFFSET = 0.9;

export interface FenceOptions { vacantFrontFence: boolean; }

type Mat = THREE.Material;

function chainRun(pb: PropsBuilder, chain: Mat, metal: Mat, a: Vec2, b: Vec2, id: string): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.5) return;
  pb.put('chainlink', chain, wallPanel(a, b, 0.05, FENCE_H, 1.5));
  const d = norm2(b.x - a.x, b.z - a.z);
  const posts = Math.max(2, Math.ceil(len / POST_SPACING) + 1);
  for (let i = 0; i < posts; i++) {
    const t = (len * i) / (posts - 1);
    pb.put('metalDark', metal, xform(box(0.08, FENCE_H + 0.15, 0.08), a.x + d.x * t, (FENCE_H + 0.15) / 2, a.z + d.z * t));
  }
  pb.put('metalDark', metal, bar(a, b, FENCE_H + 0.05, 0.05));
  pb.segment(a, b, id);
  pb.count('fences');
}

export function buildFences(
  pb: PropsBuilder,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
  options: FenceOptions,
): void {
  const chain = materials.get('chainlink');
  const metal = materials.get('metalDark');
  const ply = materials.get('scaffold', 0);

  for (const lot of lots) {
    const o = lot.outward;
    const ab = norm2(lot.frontB.x - lot.frontA.x, lot.frontB.z - lot.frontA.z);
    const pt = (base: Vec2, along: number, back: number): Vec2 => ({
      x: base.x + ab.x * along - o.x * back,
      z: base.z + ab.z * along - o.z * back,
    });

    if (lot.type === 'vacant') {
      const depth = Math.max(4, lot.depth - 0.3);
      const A = pt(lot.frontA, 0.1, 0.2), B = pt(lot.frontB, -0.1, 0.2);
      const Ar = pt(lot.frontA, 0.1, depth), Br = pt(lot.frontB, -0.1, depth);
      chainRun(pb, chain, metal, A, Ar, `${lot.id}-fenceL`);
      chainRun(pb, chain, metal, B, Br, `${lot.id}-fenceR`);
      chainRun(pb, chain, metal, Ar, Br, `${lot.id}-fenceB`);
      if (options.vacantFrontFence) {
        // front run just outside the building line with a gate gap
        const F0 = pt(lot.frontA, 0, -0.2), F1 = pt(lot.frontB, 0, -0.2);
        const len = lot.width;
        const gate = rng.range(1, Math.max(1.1, len - GATE_W - 1));
        const g0 = pt(F0, gate, 0), g1 = pt(F0, gate + GATE_W, 0);
        chainRun(pb, chain, metal, F0, g0, `${lot.id}-fenceF0`);
        chainRun(pb, chain, metal, g1, F1, `${lot.id}-fenceF1`);
      }
    } else if (lot.type === 'scaffold') {
      const a = pt(lot.frontA, 0.3, -HOARD_OFFSET), b = pt(lot.frontB, -0.3, -HOARD_OFFSET);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) continue;
      // front face looks at the street, back face at the building
      pb.put('scaffold', ply, wallPanel(a, b, 0, HOARD_H, 2.4));
      pb.put('scaffold', ply, wallPanel(b, a, 0, HOARD_H, 2.4));
      const d = norm2(b.x - a.x, b.z - a.z);
      const posts = Math.max(2, Math.ceil(len / 2.4) + 1);
      for (let i = 0; i < posts; i++) {
        const t = (len * i) / (posts - 1);
        pb.put('metalDark', metal, xform(box(0.1, HOARD_H + 0.1, 0.1), a.x + d.x * t, (HOARD_H + 0.1) / 2, a.z + d.z * t));
      }
      pb.put('metalDark', metal, bar(a, b, HOARD_H + 0.05, 0.08));
      pb.segment(a, b, `${lot.id}-hoarding`);
      pb.count('hoardings');
    }
  }
}
