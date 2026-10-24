/**
 * Billboards: 6 x 3 m boards on a steel frame standing 0.9 m off the end wall of a tall corner lot
 * (apartment, or corner mixed-use) whose end wall looks onto an avenue. Parody copy only.
 */
import * as THREE from 'three';
import type { GridModel, IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { PropsBuilder, box, frameMatrix, norm2 } from './common';

export const BILLBOARD_TEXTS: { text: string; bg: string; fg: string }[] = [
  { text: 'ACCIDENT? CALL 1-800-SUE-NOW · ATTORNEY ADS R US', bg: '#f2c500', fg: '#161616' },
  { text: 'THE BROWNSTONE RESIDENCES · NOW LEASING FROM TOO MUCH', bg: '#16324f', fg: '#f4ead5' },
  { text: "LOTTERY $? · YOU WON'T WIN", bg: '#b3202a', fg: '#fff6e0' },
  { text: 'FRESH-ISH BODEGA COFFEE · NOW WITH ADDED OAT', bg: '#2c5e3f', fg: '#f6f1e2' },
];

const BOARD_W = 6;
const BOARD_H = 3;
const BOARD_BOTTOM = 4;
const WALL_OFFSET = 0.9;
const LEG = 0.3;
const MIN_SEPARATION = 120;

interface Spot { lot: Lot; wall: Vec2; n: Vec2; into: Vec2; }

function findSpots(grid: GridModel, lots: Lot[]): Spot[] {
  const spots: Spot[] = [];
  for (const lot of lots) {
    if (lot.type !== 'apartment' && !(lot.type === 'mixeduse' && lot.corner)) continue;
    if (lot.depth < 9) continue;
    const block = grid.blocks.find((b) => b.id === lot.blockId);
    if (!block) continue;
    for (const end of ['A', 'B'] as const) {
      const e = end === 'A' ? lot.frontA : lot.frontB;
      const o = end === 'A' ? lot.frontB : lot.frontA;
      const n = norm2(e.x - o.x, e.z - o.z);
      // the end must sit on a building-line corner of the block (otherwise it is a party wall)
      if (!block.buildingLine.some((c) => Math.hypot(c.x - e.x, c.z - e.z) < 2.5)) continue;
      const cross = block.faces.find((f) => f.outward.x * n.x + f.outward.z * n.z > 0.9);
      if (!cross || grid.streetById(cross.streetId).class !== 'avenue') continue;
      spots.push({ lot, wall: e, n, into: { x: -lot.outward.x, z: -lot.outward.z } });
    }
  }
  return spots;
}

export function buildBillboards(
  pb: PropsBuilder,
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): void {
  const spots = findSpots(grid, lots);
  // Fisher-Yates with the supplied rng
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const want = rng.int(2, 3);
  const chosen: Spot[] = [];
  for (const s of spots) {
    if (chosen.length >= want) break;
    if (chosen.some((c) => Math.hypot(c.wall.x - s.wall.x, c.wall.z - s.wall.z) < MIN_SEPARATION)) continue;
    chosen.push(s);
  }

  const metal = materials.get('metalDark');
  const first = rng.int(0, BILLBOARD_TEXTS.length - 1);
  chosen.forEach((s, i) => {
    const copy = BILLBOARD_TEXTS[(first + i) % BILLBOARD_TEXTS.length];
    const centre: Vec2 = {
      x: s.wall.x + s.n.x * WALL_OFFSET + s.into.x * 4.3,
      z: s.wall.z + s.n.z * WALL_OFFSET + s.into.z * 4.3,
    };
    const m = frameMatrix(centre, 0, s.n);
    const yMid = BOARD_BOTTOM + BOARD_H / 2;

    // dark back / frame slab, lit face, catwalk, two legs
    pb.put('metalDark', metal, box(BOARD_W + 0.2, BOARD_H + 0.2, 0.16).translate(0, yMid, 0).applyMatrix4(m), true);
    pb.put('metalDark', metal, box(BOARD_W + 0.2, 0.05, 0.6).translate(0, BOARD_BOTTOM - 0.15, 0.3).applyMatrix4(m));
    pb.put('metalDark', metal, box(BOARD_W + 0.2, 0.05, 0.05).translate(0, BOARD_BOTTOM + BOARD_H + 0.7, 0.3).applyMatrix4(m));
    const face = new THREE.PlaneGeometry(BOARD_W, BOARD_H).translate(0, yMid, 0.09).applyMatrix4(m);
    pb.put(`sign:${copy.text}`, materials.sign(copy.text, copy.bg, copy.fg), face);
    for (const sx of [-1, 1]) {
      const lx = sx * (BOARD_W / 2 - 0.1);
      pb.put('metalDark', metal, box(LEG, BOARD_BOTTOM + BOARD_H + 0.3, LEG).translate(lx, (BOARD_BOTTOM + BOARD_H + 0.3) / 2, -0.15).applyMatrix4(m), true);
      // footprint: frame x axis = (n.z, -n.x), frame z axis = n
      const ux = { x: s.n.z, z: -s.n.x };
      const c: Vec2 = { x: centre.x + ux.x * lx - s.n.x * 0.15, z: centre.z + ux.z * lx - s.n.z * 0.15 };
      pb.rectCollider(c, ux, LEG / 2, LEG / 2, `billboard-${i}-leg${sx < 0 ? 'L' : 'R'}`);
    }
    pb.count('billboards');
  });
}
