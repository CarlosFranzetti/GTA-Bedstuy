/**
 * Street furniture on the sidewalk strip: street trees, cobra-head lampposts, street-name boards,
 * hydrants, trash cans, mailboxes and bodega ice-boxes. Every repeated piece is an InstancedMesh (one draw call per
 * kind for the whole city, any number of copies); street-name boards are one instanced mesh per street text.
 *
 * Sidewalk strip = between a face's curb line (curbA -> curbB) and its building line (a -> b).
 * "Inward" is toward the block, i.e. -outward.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Block, BlockFace, GridModel, IMaterialLibrary, Lot, Side, StaticCollider, StreetDef } from '@/world/types';
import { Rng } from '@/core/Rng';
type V3 = [number, number, number];
import type { Vec2 } from '@/core/Math2';
import { planSignBlades, SIGN_LAYOUT } from '@/world/signBlades';

// ---------------------------------------------------------------- tunables (metres)

const TREE_SPACING = 12;
const TREE_CORNER_CLEARANCE = 6;
const TREE_CURB_INSET = 0.8;
const TREE_TRUNK_H = 3;
const TREE_COLLIDER_R = 0.35;

const LAMP_CURB_INSET = 0.6;
const LAMP_HEIGHT = 8;
const LAMP_COLLIDER_R = 0.2;
const LAMP_ARM = 1.4;
const LAMP_HEAD_Y = 7.75;
const LAMP_LIT_INTENSITY = 2.5;
export const LAMP_HEAD_NAME = 'lamp-head';

const SIGN_W = SIGN_LAYOUT.width;
const SIGN_H = SIGN_LAYOUT.height;
const SIGN_BG = '#0a5a2f';
const SIGN_FG = '#ffffff';

const SLOT_COLLIDER_R = 0.3;
const SLOT_CLEARANCE = 1.2;
const TREE_CLEARANCE = 1.5;
const ICEBOX_SIZE = { w: 1.2, h: 1.6, d: 0.8 };

/** Block curb order is NW, NE, SE, SW; each corner touches the faces on these two sides. */
const CORNER_SIDES: [Side, Side][] = [['N', 'W'], ['N', 'E'], ['S', 'E'], ['S', 'W']];

// ---------------------------------------------------------------- geometry helpers

/** One kind of repeated prop: a shared local geometry and the flat list of its instance matrices. */
export interface InstBucket { material: THREE.Material; geometry: THREE.BufferGeometry; matrices: number[]; }

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();

/** Instance matrix for a piece standing at (x, y, z) with yaw (rotation.y) and optional lean (rotation x, z). */
export function placeMatrix(out: THREE.Matrix4, x: number, y: number, z: number, yaw = 0, lean: [number, number] = [0, 0], scale = 1): THREE.Matrix4 {
  _q.setFromEuler(_e.set(lean[0], yaw, lean[1]));
  return out.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
}

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

export interface LampSpot { pos: Vec2; height: number; }

/** Switch every lamp head under `group` between dark (day) and glowing (night). */
export function setLampsLit(group: THREE.Object3D, lit: boolean): void {
  group.traverse((o) => {
    if (o.name !== LAMP_HEAD_NAME) return;
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (m && 'emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = lit ? LAMP_LIT_INTENSITY : 0;
    }
  });
}

export function buildFurniture(
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): { group: THREE.Group; colliders: StaticCollider[]; lamps: LampSpot[]; instanced: Map<string, InstBucket> } {
  const insts = new Map<string, InstBucket>();
  const colliders: StaticCollider[] = [];
  const lamps: LampSpot[] = [];
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    name: LAMP_HEAD_NAME, color: '#3b3b3b', roughness: 0.5, metalness: 0.2, emissive: '#ffd9a0', emissiveIntensity: 0,
  });
  const occupied: Vec2[] = [];

  const M = {
    treeTrunk: materials.get('treeTrunk'),
    treeLeaves: materials.get('treeLeaves'),
    metalDark: materials.get('metalDark'),
    hydrant: materials.get('hydrant'),
    trash: materials.get('trash'),
    concrete: materials.get('concrete'),
  };

  /** Shared local geometry for a kind of prop, merged from parts (built once, on first use). */
  const geometries = new Map<string, THREE.BufferGeometry>();
  const geometry = (key: string, make: () => THREE.BufferGeometry[]): THREE.BufferGeometry => {
    let g = geometries.get(key);
    if (!g) {
      const parts = make();
      g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!g) throw new Error(`FurnitureGen: could not merge geometry for ${key}`);
      if (parts.length > 1) for (const part of parts) part.dispose();
      geometries.set(key, g);
    }
    return g;
  };
  /** Adds one instance of prop kind `key`. */
  const putInst = (key: string, material: THREE.Material, make: () => THREE.BufferGeometry[], m: THREE.Matrix4): void => {
    let b = insts.get(key);
    if (!b) { b = { material, geometry: geometry(key, make), matrices: [] }; insts.set(key, b); }
    const e = m.elements;
    for (let i = 0; i < 16; i++) b.matrices.push(e[i]);
  };
  let propN = 0;
  /** `kind` names the collider for physics: 'soft-bin-N' is knocked over by vehicles (World2D lets cars through), 'hydrant-N' stays solid. */
  const circle = (pos: Vec2, r: number, kind?: string): void => {
    colliders.push({ shape: { kind: 'circle', r }, pos: { x: pos.x, z: pos.z }, id: kind ? `${kind}-${propN++}` : undefined });
  };

  // ---- primitives (geometry is built around the local origin; the instance matrix places it)

  /** Branch from a to b (tapered prism). */
  const limb = (a: V3, b: V3, r0: number, r1: number): THREE.BufferGeometry => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 5).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate(a[0], a[1], a[2]);
  };
  // tapered trunk plus three limbs reaching the canopy clouds (see addTree)
  const trunkGeo = (): THREE.BufferGeometry[] => [
    cyl(0.2, 0.3, TREE_TRUNK_H, 6).translate(0, TREE_TRUNK_H / 2, 0),
    limb([0, 2.5, 0], [0, 4.0, 0], 0.14, 0.06),
    limb([0, 2.7, 0], [0.7, 3.6, 0.5], 0.1, 0.05),
    limb([0, 2.7, 0], [-0.6, 3.7, -0.6], 0.1, 0.05),
  ];
  /**
   * Canopy cloud: leaf cards scattered through a unit ball, every vertex normal pointing out of the ball centre (so the
   * cloud shades like a soft volume, not like flat cards) and each card emitted twice (both windings) so the back is lit the
   * same. Alpha-tested leaf sprite; ~96 triangles, shared by every instance (scale = cloud radius).
   */
  const blobGeo = (): THREE.BufferGeometry[] => {
    const cr = new Rng('tree-cloud');
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 24; i++) {
      const dir = new THREE.Vector3(cr.range(-1, 1), cr.range(-0.6, 1), cr.range(-1, 1)).normalize().multiplyScalar(0.8 * Math.cbrt(cr.next()));
      const size = cr.range(0.85, 1.25);
      q.setFromEuler(e.set(cr.range(0, Math.PI), cr.range(0, Math.PI * 2), cr.range(0, Math.PI)));
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([x, y, u, v]) => {
        const p = new THREE.Vector3(x * size * 0.5, y * size * 0.5, 0).applyQuaternion(q).add(dir);
        return { p, n: p.clone().normalize(), u, v };
      });
      const tri = (a: number, b: number, c: number): void => {
        for (const k of [a, b, c]) { const o = corners[k]; pos.push(o.p.x, o.p.y, o.p.z); nor.push(o.n.x, o.n.y, o.n.z); uv.push(o.u, o.v); }
      };
      tri(0, 1, 2); tri(0, 2, 3); tri(0, 2, 1); tri(0, 3, 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return [g];
  };

  function addTree(base: Vec2): void {
    const yaw = rng.range(0, Math.PI * 2);
    const lean: [number, number] = [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)];
    const R = rng.range(1.2, 1.6);
    const tree = placeMatrix(new THREE.Matrix4(), base.x, 0, base.z, yaw, lean);
    putInst('treeTrunk', M.treeTrunk, trunkGeo, tree);
    const canopy: [number, number, number, number][] = [
      [0, 4.0, 0, R],
      [0.7, 3.6, 0.5, R * 0.8],
    ];
    if (rng.chance(0.6)) canopy.push([-0.6, 3.7, -0.6, R * 0.75]);
    for (const [ox, oy, oz, r] of canopy) {
      _local.compose(_p.set(ox, oy, oz), _q.identity(), _s.set(r, r, r));
      putInst('treeLeaves', M.treeLeaves, blobGeo, _m.multiplyMatrices(tree, _local));
    }
    circle(base, TREE_COLLIDER_R);
  }

  const lampGeo = (): THREE.BufferGeometry[] => [
    cyl(0.07, 0.09, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0),
    box(LAMP_ARM, 0.08, 0.1).translate(LAMP_ARM / 2, 7.9, 0),
  ];
  const lampHeadGeo = (): THREE.BufferGeometry[] => [box(0.5, 0.16, 0.3).translate(LAMP_ARM, LAMP_HEAD_Y, 0)];

  function addLamp(base: Vec2, dir: Vec2): void {
    const m = placeMatrix(new THREE.Matrix4(), base.x, 0, base.z, alignYaw(dir));
    putInst('lamp', M.metalDark, lampGeo, m);
    putInst(LAMP_HEAD_NAME, lampHeadMaterial, lampHeadGeo, m);
    lamps.push({ pos: { x: base.x + dir.x * LAMP_ARM, z: base.z + dir.z * LAMP_ARM }, height: LAMP_HEAD_Y });
    circle(base, LAMP_COLLIDER_R);
  }

  function addSignBoards(base: Vec2, center: Vec2, streets: StreetDef[]): void {
    // Two thin planes (front and back) so the text reads from both sides. Each blade's yaw is baked into its geometry
    // (every board of a street faces the same way), so instances only translate. Layout: world/signBlades.ts.
    for (const blade of planSignBlades(base, center, streets)) {
      const key = `sign:${blade.text}`;
      const mat = materials.sign(blade.text, SIGN_BG, SIGN_FG);
      putInst(key, mat, () => {
        const front = new THREE.PlaneGeometry(SIGN_W, SIGN_H).translate(0, 0, 0.01);
        const back = new THREE.PlaneGeometry(SIGN_W, SIGN_H).rotateY(Math.PI).translate(0, 0, -0.01);
        return [front.rotateY(blade.yaw), back.rotateY(blade.yaw)];
      }, placeMatrix(new THREE.Matrix4(), blade.x, blade.y, blade.z));
    }
  }

  const hydrantGeo = (): THREE.BufferGeometry[] => [
    cyl(0.16, 0.18, 0.6).translate(0, 0.3, 0),
    cyl(0.1, 0.16, 0.18).translate(0, 0.69, 0),
    box(0.22, 0.12, 0.12).translate(0.2, 0.4, 0),
  ];
  function addHydrant(p: Vec2, yaw: number): void {
    putInst('hydrant', M.hydrant, hydrantGeo, placeMatrix(new THREE.Matrix4(), p.x, 0, p.z, yaw));
    circle(p, SLOT_COLLIDER_R, 'hydrant');
  }

  const trashGeo = (): THREE.BufferGeometry[] => [
    cyl(0.22, 0.17, 0.9).translate(0, 0.45, 0),
    cyl(0.25, 0.25, 0.06).translate(0, 0.93, 0),
  ];
  function addTrash(p: Vec2, yaw: number): void {
    putInst('trash', M.trash, trashGeo, placeMatrix(new THREE.Matrix4(), p.x, 0, p.z, yaw));
    circle(p, SLOT_COLLIDER_R, 'soft-bin');
  }

  const mailboxGeo = (): THREE.BufferGeometry[] => [
    box(0.06, 1.0, 0.06).translate(0, 0.5, 0),
    box(0.42, 0.3, 0.5).translate(0, 1.15, 0),
  ];
  function addMailbox(p: Vec2, yaw: number): void {
    putInst('mailbox', M.metalDark, mailboxGeo, placeMatrix(new THREE.Matrix4(), p.x, 0, p.z, yaw));
    circle(p, 0.25);
  }

  const iceboxGeo = (): THREE.BufferGeometry[] => [box(ICEBOX_SIZE.w, ICEBOX_SIZE.h, ICEBOX_SIZE.d).translate(0, ICEBOX_SIZE.h / 2, 0)];
  function addIcebox(p: Vec2, yaw: number): void {
    putInst('icebox', M.concrete, iceboxGeo, placeMatrix(new THREE.Matrix4(), p.x, 0, p.z, yaw));
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
      const cornerStreets: StreetDef[] = [];
      for (const side of CORNER_SIDES[i]) {
        const f = block.faces.find((bf) => bf.side === side);
        if (!f) throw new Error(`FurnitureGen: block ${block.id} has no ${side} face`);
        cornerStreets.push(grid.streetById(f.streetId));
      }
      addSignBoards(base, { x: cx, z: cz }, cornerStreets);
    });

    for (const f of block.faces) {
      const faceLots = lots.filter((l) => l.blockId === block.id && l.side === f.side);
      furnishFace(f, faceLots);
    }
  }

  // ---- one InstancedMesh per kind of prop

  const group = new THREE.Group();
  group.name = 'furniture';
  for (const [key, b] of insts) {
    const n = b.matrices.length / 16;
    const mesh = new THREE.InstancedMesh(b.geometry, b.material, n);
    (mesh.instanceMatrix.array as Float32Array).set(b.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = key === LAMP_HEAD_NAME ? LAMP_HEAD_NAME : `furniture:${key}`;
    group.add(mesh);
  }

  return { group, colliders, lamps, instanced: insts };
}
