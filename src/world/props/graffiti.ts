/**
 * Abstract graffiti tags: a handful of overlapping thin rotated strokes plus drips, as semi-transparent quads
 * 0.02-0.03 m off a wall. No words. Spots: exposed party walls beside vacant lots and shop roll gates.
 */
import * as THREE from 'three';
import type { Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { PropsBuilder, frameMatrix, norm2 } from './common';

const PALETTE = ['#ff3d71', '#ffd23f', '#2ec4b6'];
const GATE_PIER = 0.45;
const GATE_DECAL_OFFSET = 0.15; // roll gate sits at z = 0.12 in the shop bay
const WALL_DECAL_OFFSET = 0.03;
const TALL_NEIGHBOURS = new Set(['brownstone', 'rowhouse', 'mixeduse', 'apartment', 'scaffold']);

interface Stroke { x: number; y: number; w: number; h: number; rot: number; c: 0 | 1; }

function throwUp(rng: Rng, width: number): Stroke[] {
  const out: Stroke[] = [];
  const letters = rng.int(3, 4);
  const lw = width / letters;
  for (let i = 0; i < letters; i++) {
    const cx = -width / 2 + (i + 0.5) * lw;
    const k = rng.int(2, 3);
    for (let j = 0; j < k; j++) {
      out.push({
        x: cx + rng.range(-0.15, 0.15) * lw / 0.6, y: rng.range(-0.08, 0.12),
        w: rng.range(0.14, 0.26), h: rng.range(0.6, 1.0), rot: rng.range(-0.7, 0.7), c: 0,
      });
    }
    out.push({ x: cx, y: rng.range(-0.1, 0.1), w: lw * 0.9, h: 0.1, rot: rng.range(-0.3, 0.3), c: 1 });
  }
  out.push({ x: 0, y: -0.55, w: width * 0.9, h: 0.1, rot: rng.range(-0.05, 0.05), c: 1 });
  const drips = rng.int(2, 5);
  for (let i = 0; i < drips; i++) {
    const len = rng.range(0.25, 0.7);
    out.push({ x: rng.range(-0.45, 0.45) * width, y: -0.6 - len / 2, w: 0.035, h: len, rot: 0, c: 0 });
  }
  return out;
}

export function buildGraffiti(pb: PropsBuilder, lots: Lot[], rng: Rng): void {
  const mats = PALETTE.map((hex, i) => pb.material(`graffiti:${i}`, () => new THREE.MeshStandardMaterial({
    name: `graffiti-${hex}`, color: hex, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.85,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })));

  /** Lay a tag on a wall: `centre` is the world point (already off the wall), `y` the tag's centre height. */
  const lay = (centre: Vec2, y: number, n: Vec2, width: number, scale: number): void => {
    const m = frameMatrix(centre, 0, n);
    const c0 = rng.int(0, PALETTE.length - 1);
    const c1 = (c0 + 1 + rng.int(0, PALETTE.length - 2)) % PALETTE.length;
    const keys = [c0, c1];
    for (const s of throwUp(rng, width / scale)) {
      const g = new THREE.PlaneGeometry(s.w * scale, s.h * scale)
        .rotateZ(s.rot).translate(s.x * scale, y + s.y * scale, 0).applyMatrix4(m);
      const key = keys[s.c];
      pb.put(`graffiti:${key}`, mats[key], g);
    }
    pb.count('graffiti');
  };

  for (const lot of lots) {
    // roll-gate tags on some mixed-use shops: a small tag across the partly lowered gate
    if (lot.type === 'mixeduse' && rng.chance(0.3)) {
      const usable = lot.width - 2 * GATE_PIER - 0.4;
      if (usable >= 1.2) {
        const centre = {
          x: (lot.frontA.x + lot.frontB.x) / 2 + lot.outward.x * GATE_DECAL_OFFSET,
          z: (lot.frontA.z + lot.frontB.z) / 2 + lot.outward.z * GATE_DECAL_OFFSET,
        };
        lay(centre, 2.35, lot.outward, Math.min(2.2, usable), 0.32);
      }
    }

    // tags on the exposed side wall of the building next to a vacant lot
    if (lot.type === 'vacant') {
      for (const end of ['A', 'B'] as const) {
        const e = end === 'A' ? lot.frontA : lot.frontB;
        const o = end === 'A' ? lot.frontB : lot.frontA;
        const neighbour = lots.find((l) => l !== lot && l.blockId === lot.blockId && l.side === lot.side
          && TALL_NEIGHBOURS.has(l.type)
          && (Math.hypot(l.frontA.x - e.x, l.frontA.z - e.z) < 0.7 || Math.hypot(l.frontB.x - e.x, l.frontB.z - e.z) < 0.7));
        if (!neighbour || !rng.chance(0.75)) continue;
        const n = norm2(o.x - e.x, o.z - e.z); // from the wall into the vacant lot
        const zc = rng.range(3, Math.max(3.5, Math.min(lot.depth, neighbour.depth) - 3));
        const centre = {
          x: e.x + n.x * WALL_DECAL_OFFSET - lot.outward.x * zc,
          z: e.z + n.z * WALL_DECAL_OFFSET - lot.outward.z * zc,
        };
        lay(centre, rng.range(2.4, 3.6), n, rng.range(1.8, 2.6), rng.range(1.0, 1.4));
      }
    }
  }
}
