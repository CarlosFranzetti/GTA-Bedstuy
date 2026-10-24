/**
 * Street furniture on the sidewalk strip: street trees, cobra-head lampposts, street-name boards,
 * hydrants, trash cans, mailboxes and bodega ice-boxes. Everything is merged per material.
 *
 * Sidewalk strip = between a face's curb line (curbA -> curbB) and its building line (a -> b).
 * "Inward" is toward the block, i.e. -outward.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Block, BlockFace, GridModel, IMaterialLibrary, Lot, Side, StaticCollider, StreetDef } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- tunables (metres)

const TREE_SPACING = 12;
const TREE_CORNER_CLEARANCE = 6;
const TREE_CURB_INSET = 0.8;
const TREE_TRUNK_H = 3;
const TREE_COLLIDER_R = 0.35;

const LAMP_CURB_INSET = 0.6;
const LAMP_HEIGHT = 8;
const LAMP_COLLIDER_R = 0.2;

const SIGN_HEIGHT = 3;
const SIGN_W = 1.2;
const SIGN_H = 0.25;
const SIGN_BG = '#0a5a2f';
const SIGN_FG = '#ffffff';

const SLOT_COLLIDER_R = 0.3;
const SLOT_CLEARANCE = 1.2;
const TREE_CLEARANCE = 1.5;
const ICEBOX_SIZE = { w: 1.2, h: 1.6, d: 0.8 };

/** Block curb order is NW, NE, SE, SW; each corner touches the faces on these two sides. */
const CORNER_SIDES: [Side, Side][] = [['N', 'W'], ['N', 'E'], ['S', 'E'], ['S', 'W']];

// ---------------------------------------------------------------- geometry helpers

type Bucket = { material: THREE.Material; geos: THREE.BufferGeometry[] };

/** rotation.y that turns a box's local +x onto the direction (dx, dz). */
function alignYaw(dir: Vec2): number {
  return Math.atan2(-dir.z, dir.x);
}

/** Move a geometry (built around the origin) to world position with yaw and optional lean. */
function xform(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, lean: [number, number] = [0, 0]): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], yaw, lean[1]));
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function near(p: Vec2, pts: Vec2[], sep: number): boolean {
  for (const q of pts) if (Math.hypot(p.x - q.x, p.z - q.z) < sep) return true;
  return false;
}

// ---------------------------------------------------------------- public API

export function buildFurniture(
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): { group: THREE.Group; colliders: StaticCollider[] } {
  const buckets = new Map<string, Bucket>();
  const colliders: StaticCollider[] = [];
  const occupied: Vec2[] = [];

  const M = {
    treeTrunk: materials.get('treeTrunk'),
    treeLeaves: materials.get('treeLeaves'),
    metalDark: materials.get('metalDark'),
    hydrant: materials.get('hydrant'),
    trash: materials.get('trash'),
    concrete: materials.get('concrete'),
  };

  const put = (key: string, material: THREE.Material, geo: THREE.BufferGeometry): void => {
    let b = buckets.get(key);
    if (!b) { b = { material, geos: [] }; buckets.set(key, b); }
    b.geos.push(geo);
  };
  const circle = (pos: Vec2, r: number): void => {
    colliders.push({ shape: { kind: 'circle', r }, pos: { x: pos.x, z: pos.z } });
  };

  // ---- primitives

  function addTree(base: Vec2): void {
    const yaw = rng.range(0, Math.PI * 2);
    const lean: [number, number] = [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)];
    const R = rng.range(1.2, 1.6);
    put('treeTrunk', M.treeTrunk, xform(cyl(0.3, 0.3, TREE_TRUNK_H, 6).translate(0, TREE_TRUNK_H / 2, 0), base.x, 0, base.z, yaw, lean));
    const canopy: [number, number, number, number][] = [
      [0, 4.0, 0, R],
      [0.7, 3.6, 0.5, R * 0.8],
    ];
    if (rng.chance(0.6)) canopy.push([-0.6, 3.7, -0.6, R * 0.75]);
    for (const [ox, oy, oz, r] of canopy) {
      const s = new THREE.SphereGeometry(r, 7, 5).translate(ox, oy, oz);
      put('treeLeaves', M.treeLeaves, xform(s, base.x, 0, base.z, yaw, lean));
    }
    circle(base, TREE_COLLIDER_R);
  }

  function addLamp(base: Vec2, dir: Vec2): void {
    const yaw = alignYaw(dir);
    put('metalDark', M.metalDark, xform(cyl(0.07, 0.09, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0), base.x, 0, base.z));
    put('metalDark', M.metalDark, xform(box(1.4, 0.08, 0.1), base.x + dir.x * 0.7, 7.9, base.z + dir.z * 0.7, yaw));
    put('metalDark', M.metalDark, xform(box(0.5, 0.16, 0.3), base.x + dir.x * 1.4, 7.75, base.z + dir.z * 1.4, yaw));
    circle(base, LAMP_COLLIDER_R);
  }

  function addSignBoards(base: Vec2, street: StreetDef): void {
    // Two thin planes (front and back) so the text reads from both sides.
    const yaw = street.axis === 'ew' ? 0 : Math.PI / 2;
    const key = `sign:${street.signName}`;
    const mat = materials.sign(street.signName, SIGN_BG, SIGN_FG);
    const front = new THREE.PlaneGeometry(SIGN_W, SIGN_H).translate(0, 0, 0.01);
    const back = new THREE.PlaneGeometry(SIGN_W, SIGN_H).rotateY(Math.PI).translate(0, 0, -0.01);
    put(key, mat, xform(front, base.x, SIGN_HEIGHT, base.z, yaw));
    put(key, mat, xform(back, base.x, SIGN_HEIGHT, base.z, yaw));
  }

  function addHydrant(p: Vec2, yaw: number): void {
    put('hydrant', M.hydrant, xform(cyl(0.16, 0.18, 0.6).translate(0, 0.3, 0), p.x, 0, p.z, yaw));
    put('hydrant', M.hydrant, xform(cyl(0.1, 0.16, 0.18).translate(0, 0.69, 0), p.x, 0, p.z, yaw));
    put('hydrant', M.hydrant, xform(box(0.22, 0.12, 0.12).translate(0.2, 0.4, 0), p.x, 0, p.z, yaw));
    circle(p, SLOT_COLLIDER_R);
  }

  function addTrash(p: Vec2, yaw: number): void {
    put('trash', M.trash, xform(cyl(0.22, 0.17, 0.9).translate(0, 0.45, 0), p.x, 0, p.z, yaw));
    put('trash', M.trash, xform(cyl(0.25, 0.25, 0.06).translate(0, 0.93, 0), p.x, 0, p.z, yaw));
    circle(p, SLOT_COLLIDER_R);
  }

  function addMailbox(p: Vec2, yaw: number): void {
    put('metalDark', M.metalDark, xform(box(0.06, 1.0, 0.06).translate(0, 0.5, 0), p.x, 0, p.z, yaw));
    put('metalDark', M.metalDark, xform(box(0.42, 0.3, 0.5).translate(0, 1.15, 0), p.x, 0, p.z, yaw));
    circle(p, 0.25);
  }

  function addIcebox(p: Vec2, yaw: number): void {
    put('concrete', M.concrete, xform(box(ICEBOX_SIZE.w, ICEBOX_SIZE.h, ICEBOX_SIZE.d).translate(0, ICEBOX_SIZE.h / 2, 0), p.x, 0, p.z, yaw));
    circle(p, SLOT_COLLIDER_R);
  }

  // ---- per-face layout

  function furnishFace(f: BlockFace, faceLots: Lot[]): void {
    const L = Math.hypot(f.curbB.x - f.curbA.x, f.curbB.z - f.curbA.z);
    const u = { x: (f.curbB.x - f.curbA.x) / L, z: (f.curbB.z - f.curbA.z) / L };
    const inward = { x: -f.outward.x, z: -f.outward.z };
    const yaw = alignYaw(u);
    // Point on the sidewalk strip: s metres along the face from curbA, `inset` metres in from the curb.
    const at = (s: number, inset: number): Vec2 => ({
      x: f.curbA.x + u.x * s + inward.x * inset,
      z: f.curbA.z + u.z * s + inward.z * inset,
    });
    const along = (p: Vec2): number => (p.x - f.curbA.x) * u.x + (p.z - f.curbA.z) * u.z;
    const stripWidth = (f.curbA.x - f.a.x) * f.outward.x + (f.curbA.z - f.a.z) * f.outward.z;

    const mixedSpans = faceLots
      .filter((l) => l.type === 'mixeduse')
      .map((l) => [Math.min(along(l.frontA), along(l.frontB)), Math.max(along(l.frontA), along(l.frontB))] as const);
    const inMixedUse = (s: number): boolean => mixedSpans.some(([lo, hi]) => s >= lo - 0.5 && s <= hi + 0.5);

    // Mid-face lamppost.
    const midLamp = at(L / 2, LAMP_CURB_INSET);
    addLamp(midLamp, f.outward);
    occupied.push(midLamp);

    // Street trees: every ~12 m, 6 m clear of corners, none in front of mixed-use frontage.
    for (let s = TREE_CORNER_CLEARANCE; s <= L - TREE_CORNER_CLEARANCE + 1e-6; s += TREE_SPACING) {
      const sj = Math.min(L - TREE_CORNER_CLEARANCE, Math.max(TREE_CORNER_CLEARANCE, s + rng.range(-0.5, 0.5)));
      if (inMixedUse(sj)) continue;
      const p = at(sj, TREE_CURB_INSET);
      if (near(p, occupied, TREE_CLEARANCE)) continue;
      addTree(p);
      occupied.push(p);
    }

    // Bodega ice-box: centred across the strip in front of the bodega frontage.
    for (const l of faceLots) {
      if (l.poi?.archetype !== 'bodega') continue;
      const sMid = (along(l.frontA) + along(l.frontB)) / 2;
      const p = at(sMid, stripWidth / 2);
      addIcebox(p, yaw);
      occupied.push(p);
    }

    // First free candidate along the face wins; a slot that finds none is skipped.
    const placeSlot = (candidates: number[], inset: number, place: (p: Vec2) => void): boolean => {
      for (const s of candidates) {
        if (s < 1.5 || s > L - 1.5) continue;
        const p = at(s, inset);
        if (near(p, occupied, SLOT_CLEARANCE)) continue;
        place(p);
        occupied.push(p);
        return true;
      }
      return false;
    };

    placeSlot([3.5, 2.5, 4.5, 5.5, 6.5], 0.5, (p) => addHydrant(p, yaw));
    const trashCandidates = [L * 0.3, L * 0.7, L * 0.5 - 3, L * 0.5 + 3, L * 0.15, L * 0.85];
    placeSlot(trashCandidates.map((s) => s + rng.range(-0.4, 0.4)), 0.5, (p) => addTrash(p, yaw));
    placeSlot(trashCandidates.map((s) => s + rng.range(-0.4, 0.4)), 0.5, (p) => addTrash(p, yaw));
    if (rng.chance(0.3)) {
      placeSlot([L * 0.45, L * 0.9], 0.6, (p) => addMailbox(p, yaw));
    }
  }

  // ---- walk the blocks

  for (const block of grid.blocks as Block[]) {
    const cx = block.curb.reduce((acc, p) => acc + p.x, 0) / block.curb.length;
    const cz = block.curb.reduce((acc, p) => acc + p.z, 0) / block.curb.length;

    // Corner lampposts with street-name boards for the two streets meeting at that corner.
    block.curb.forEach((c, i) => {
      const base: Vec2 = {
        x: c.x + Math.sign(cx - c.x) * LAMP_CURB_INSET,
        z: c.z + Math.sign(cz - c.z) * LAMP_CURB_INSET,
      };
      const dir = { x: c.x - cx, z: c.z - cz };
      const dl = Math.hypot(dir.x, dir.z) || 1;
      addLamp(base, { x: dir.x / dl, z: dir.z / dl });
      occupied.push(base);
      for (const side of CORNER_SIDES[i]) {
        const f = block.faces.find((bf) => bf.side === side);
        if (!f) throw new Error(`FurnitureGen: block ${block.id} has no ${side} face`);
        addSignBoards(base, grid.streetById(f.streetId));
      }
    });

    for (const f of block.faces) {
      const faceLots = lots.filter((l) => l.blockId === block.id && l.side === f.side);
      furnishFace(f, faceLots);
    }
  }

  // ---- merge per material

  const group = new THREE.Group();
  group.name = 'furniture';
  for (const [key, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) throw new Error(`FurnitureGen: could not merge geometry for ${key}`);
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = `furniture:${key}`;
    group.add(mesh);
    for (const g of b.geos) g.dispose();
  }

  return { group, colliders };
}
