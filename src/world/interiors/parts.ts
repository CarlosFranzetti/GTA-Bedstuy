/** Small builders for the interiors: flat-shaded boxes/planes with baked face shading (no scene lights needed). */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { IWorld2D } from '../types';

const FACE_SHADE = [0.78, 0.78, 1.0, 0.45, 0.88, 0.62]; // +x -x +y -y +z -z (BoxGeometry face order)
const matCache = new Map<string, THREE.MeshBasicMaterial>();

export function basic(opts: { color?: string | number; vertexColors?: boolean; additive?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const key = JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: opts.color ?? 0xffffff, vertexColors: opts.vertexColors ?? false, transparent: opts.additive || opts.opacity !== undefined,
      opacity: opts.opacity ?? 1, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive,
      side: opts.side ?? THREE.FrontSide, fog: false,
    });
    matCache.set(key, m);
  }
  return m;
}

/** Box with per-face baked shade, base colour `color`. */
export function box(w: number, h: number, d: number, color: string | number, x: number, y: number, z: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const c = new THREE.Color(color);
  const col = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3; col[i] = c.r * FACE_SHADE[f]; col[i + 1] = c.g * FACE_SHADE[f]; col[i + 2] = c.b * FACE_SHADE[f]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, basic({ vertexColors: true }));
  m.position.set(x, y, z);
  return m;
}

/** Flat colour plane. rot: 'floor' faces up, 'ceil' faces down, 'n' wall at -z faces +z, etc. */
export function plane(w: number, h: number, color: string | number, x: number, y: number, z: number, facing: 'floor' | 'ceil' | 'n' | 's' | 'e' | 'w'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ color }));
  m.position.set(x, y, z);
  if (facing === 'floor') m.rotation.x = -Math.PI / 2;
  else if (facing === 'ceil') m.rotation.x = Math.PI / 2;
  else if (facing === 's') m.rotation.y = Math.PI;
  else if (facing === 'w') m.rotation.y = Math.PI / 2;
  else if (facing === 'e') m.rotation.y = -Math.PI / 2;
  return m;
}

/** Vertical gradient plane (windows onto the street, backdrops). */
export function gradientPlane(w: number, h: number, top: string, bottom: string, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) > 0 ? ct : cb; col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, basic({ vertexColors: true }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  return m;
}

/** The four walls, floor and ceiling of a room centred on (0,0). Walls face inward, so a camera outside sees through. */
export function shell(w: number, d: number, h: number, c: { floor: string; wall: string; ceil: string; trim?: string }): THREE.Group {
  const g = new THREE.Group();
  g.add(plane(w, d, c.floor, 0, 0, 0, 'floor'));
  g.add(plane(w, d, c.ceil, 0, h, 0, 'ceil'));
  g.add(plane(w, h, c.wall, 0, h / 2, -d / 2, 'n'));
  g.add(plane(w, h, c.wall, 0, h / 2, d / 2, 's'));
  g.add(plane(d, h, c.wall, -w / 2, h / 2, 0, 'w'));
  g.add(plane(d, h, c.wall, w / 2, h / 2, 0, 'e'));
  if (c.trim) {
    g.add(box(w, 0.18, 0.06, c.trim, 0, 0.09, -d / 2 + 0.03)); g.add(box(w, 0.18, 0.06, c.trim, 0, 0.09, d / 2 - 0.03));
    g.add(box(0.06, 0.18, d, c.trim, -w / 2 + 0.03, 0.09, 0)); g.add(box(0.06, 0.18, d, c.trim, w / 2 - 0.03, 0.09, 0));
  }
  return g;
}

/** Colliders in world space for one room: perimeter segments plus axis-aligned solid boxes. */
export class RoomColliders {
  private n = 0;
  constructor(private readonly world: IWorld2D, private readonly ox: number, private readonly oz: number, private readonly tag: string) {}

  walls(w: number, d: number): void {
    const hx = w / 2, hz = d / 2;
    const c: Vec2[] = [{ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz }];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      this.world.addStatic({ kind: 'segment', a: { x: a.x + this.ox, z: a.z + this.oz }, b: { x: b.x + this.ox, z: b.z + this.oz } }, { x: 0, z: 0 }, `${this.tag}-wall${this.n++}`);
    }
  }

  /** Solid box centred at local (x, z), size sx by sz. */
  solid(x: number, z: number, sx: number, sz: number): void {
    const x0 = this.ox + x - sx / 2, x1 = this.ox + x + sx / 2, z0 = this.oz + z - sz / 2, z1 = this.oz + z + sz / 2;
    this.world.addStatic({ kind: 'polygon', points: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] }, { x: 0, z: 0 }, `${this.tag}-box${this.n++}`);
  }
}

/** Sleeves for a bin: one InstancedMesh (one draw call) with per-instance colours. */
export function sleeveRows(rows: Array<{ x: number; y: number; z: number; count: number; colors: string[]; axis: 'x' | 'z' }>): THREE.InstancedMesh {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const geo = new THREE.BoxGeometry(0.02, 0.3, 0.3);
  const mesh = new THREE.InstancedMesh(geo, basic({ color: 0xffffff }), Math.max(1, total));
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const s = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const r of rows) {
    for (let k = 0; k < r.count; k++) {
      e.set(-0.25, r.axis === 'x' ? 0 : Math.PI / 2, 0); q.setFromEuler(e);
      const off = k * 0.045;
      m.compose(new THREE.Vector3(r.x + (r.axis === 'x' ? off : 0), r.y, r.z + (r.axis === 'z' ? off : 0)), q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(r.colors[k % r.colors.length]));
      i++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
