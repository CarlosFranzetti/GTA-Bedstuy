/**
 * Shared plumbing for the street-scene props: a geometry/collider collector that merges per material,
 * transform helpers and the sidewalk-strip frame (same convention as FurnitureGen).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BlockFace, StaticCollider } from '@/world/types';
import type { Vec2 } from '@/core/Math2';

export interface Bucket { material: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean; }

const UP = new THREE.Vector3(0, 1, 0);

/** rotation.y that turns a box's local +x onto the direction (dx, dz). */
export function alignYaw(dir: Vec2): number {
  return Math.atan2(-dir.z, dir.x);
}

/** Move a geometry (built around the origin) to world position with yaw and optional lean. */
export function xform(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, lean: [number, number] = [0, 0]): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], yaw, lean[1]));
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

/**
 * Wall frame: local +z = n (the wall's outward normal), local +y = up, local +x = the viewer's right when
 * looking at the wall from the n side (so text on a plane reads correctly). Origin at (p.x, y, p.z).
 */
export function frameMatrix(p: Vec2, y: number, n: Vec2): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(n.z, 0, -n.x), UP, new THREE.Vector3(n.x, 0, n.z));
  m.setPosition(p.x, y, p.z);
  return m;
}

export const cyl = (rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);
export const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

export function norm2(x: number, z: number): Vec2 {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

export function near(p: Vec2, pts: Vec2[], sep: number): boolean {
  for (const q of pts) if (Math.hypot(p.x - q.x, p.z - q.z) < sep) return true;
  return false;
}

/** Scale a PlaneGeometry's UVs so a texture tiles every `tile` metres. */
export function tileUV(geo: THREE.BufferGeometry, w: number, h: number, tile: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
  uv.needsUpdate = true;
}

/** Vertical rectangle from world point a to b (both on the ground plane), from y0 to y0+h, facing the right of a->b. */
export function wallPanel(a: Vec2, b: Vec2, y0: number, h: number, tile: number): THREE.BufferGeometry {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const d = norm2(b.x - a.x, b.z - a.z);
  const g = new THREE.PlaneGeometry(len, h);
  tileUV(g, len, h, tile);
  // local +x = d, local +z = perpRight(d)
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(d.x, 0, d.z), UP, new THREE.Vector3(-d.z, 0, d.x));
  m.setPosition((a.x + b.x) / 2, y0 + h / 2, (a.z + b.z) / 2);
  g.applyMatrix4(m);
  return g;
}

/** Thin square-section bar from a to b at height y. */
export function bar(a: Vec2, b: Vec2, y: number, thick: number): THREE.BufferGeometry {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const d = norm2(b.x - a.x, b.z - a.z);
  return xform(box(len, thick, thick), (a.x + b.x) / 2, y, (a.z + b.z) / 2, alignYaw(d));
}

export interface FaceFrame {
  f: BlockFace;
  L: number;
  u: Vec2;
  inward: Vec2;
  yaw: number;
  stripWidth: number;
  /** Point on the sidewalk strip: s metres along the face from curbA, `inset` metres in from the curb. */
  at(s: number, inset: number): Vec2;
  along(p: Vec2): number;
}

export function faceFrame(f: BlockFace): FaceFrame {
  const L = Math.hypot(f.curbB.x - f.curbA.x, f.curbB.z - f.curbA.z) || 1;
  const u = { x: (f.curbB.x - f.curbA.x) / L, z: (f.curbB.z - f.curbA.z) / L };
  const inward = { x: -f.outward.x, z: -f.outward.z };
  return {
    f, L, u, inward,
    yaw: alignYaw(u),
    stripWidth: (f.curbA.x - f.a.x) * f.outward.x + (f.curbA.z - f.a.z) * f.outward.z,
    at: (s, inset) => ({ x: f.curbA.x + u.x * s + inward.x * inset, z: f.curbA.z + u.z * s + inward.z * inset }),
    along: (p) => (p.x - f.curbA.x) * u.x + (p.z - f.curbA.z) * u.z,
  };
}

/**
 * Along-face positions already used (or likely used) by FurnitureGen: mid-face lamp, trash cans, mailboxes
 * and street trees. Used to keep props from landing on top of them.
 */
export function furnitureBlocked(s: number, L: number, clear: number): boolean {
  const spots = [L * 0.5, L * 0.3, L * 0.7, L * 0.15, L * 0.85, L * 0.5 - 3, L * 0.5 + 3, L * 0.45, L * 0.9];
  for (const t of spots) if (Math.abs(s - t) < clear) return true;
  for (let t = 6; t <= L - 6 + 1e-6; t += 12) if (Math.abs(s - t) < clear + 0.3) return true;
  return false;
}

export class PropsBuilder {
  readonly buckets = new Map<string, Bucket>();
  readonly colliders: StaticCollider[] = [];
  /** Points already taken by props (poles, dumpsters, ...). */
  readonly occupied: Vec2[] = [];
  private readonly once = new Map<string, THREE.Material>();
  readonly counts: Record<string, number> = {};

  count(name: string, n = 1): void { this.counts[name] = (this.counts[name] ?? 0) + n; }

  put(key: string, material: THREE.Material, geo: THREE.BufferGeometry, shadow = false): void {
    let b = this.buckets.get(key);
    if (!b) { b = { material, geos: [], shadow }; this.buckets.set(key, b); }
    b.geos.push(geo);
  }

  /** A material this builder creates once (not part of the shared library). */
  material(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.once.get(key);
    if (!m) { m = make(); this.once.set(key, m); }
    return m;
  }

  circle(pos: Vec2, r: number, id?: string): void {
    this.colliders.push({ shape: { kind: 'circle', r }, pos: { x: pos.x, z: pos.z }, id });
  }

  segment(a: Vec2, b: Vec2, id?: string): void {
    this.colliders.push({ shape: { kind: 'segment', a: { ...a }, b: { ...b } }, pos: { x: 0, z: 0 }, id });
  }

  /** Convex polygon; points are re-ordered clockwise as seen from above (x east, z south). */
  polygon(points: Vec2[], id?: string): void {
    const pts = points.map((p) => ({ x: p.x, z: p.z }));
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.z - q.x * p.z; }
    if (area < 0) pts.reverse();
    this.colliders.push({ shape: { kind: 'polygon', points: pts }, pos: { x: 0, z: 0 }, id });
  }

  /** Oriented rectangle footprint: centre, unit axis `u`, half extents along u and across it. */
  rectCollider(c: Vec2, u: Vec2, halfAlong: number, halfAcross: number, id?: string): void {
    const v = { x: -u.z, z: u.x };
    const pt = (a: number, b: number): Vec2 => ({ x: c.x + u.x * a + v.x * b, z: c.z + u.z * a + v.z * b });
    this.polygon([pt(-halfAlong, -halfAcross), pt(halfAlong, -halfAcross), pt(halfAlong, halfAcross), pt(-halfAlong, halfAcross)], id);
  }

  build(name = 'props'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, b] of this.buckets) {
      if (b.geos.length === 0) continue;
      const merged = mergeGeometries(b.geos, false);
      if (!merged) throw new Error(`PropsGen: could not merge geometry for ${key}`);
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.name = `props:${key}`;
      mesh.castShadow = b.shadow;
      group.add(mesh);
      for (const g of b.geos) g.dispose();
    }
    group.userData.counts = { ...this.counts };
    return group;
  }
}
