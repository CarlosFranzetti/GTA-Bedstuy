import * as THREE from 'three';
import { Rng } from '@/core/Rng';

/** Quads of one canopy cloud (two triangles each). */
export const CLOUD_CARDS = 16;
/** Cards of the small cloud used for shrubs and hedges (16 triangles). */
export const SHRUB_CARDS = 8;
/** Triangles of one canopy cloud. */
export const CLOUD_TRIS = CLOUD_CARDS * 2;

/**
 * Canopy cloud shared by the grid furniture, the real-map props and the landmark park trees (TREES): 16 square leaf cards
 * (32 triangles) arranged on the shell of a unit ball, lying tangent to it, each framing the round leaf-mass sprite. From any side the
 * overlapping discs read as one leafy dome instead of scattered cards; a few cards sit inside so a gap never shows sky.
 * Vertex normals point out of the ball centre (soft volume shading, the material is double-sided). A per-vertex grey
 * (`color`, multiplied into the leaf colour by the material) makes the middle of the cloud dark and its lit top and rim light.
 */
export function buildCloudGeometry(cards = CLOUD_CARDS): THREE.BufferGeometry {
  const cr = new Rng(cards === CLOUD_CARDS ? 'tree-cloud-shell' : `tree-cloud-shell-${cards}`);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
  const inner = cards >= 12 ? 3 : 1; // cards inside the ball (dark, they fill what the shell leaves open)
  const shell = cards - inner;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < cards; i++) {
    let dir: THREE.Vector3, rad: number, size: number;
    if (i < shell) {
      // Fibonacci spiral over the sphere, a little more cards above the equator than below (the skirt is thinner)
      const t = (i + 0.5) / shell;
      const y = 1 - 2 * Math.pow(t, 0.85);
      const r0 = Math.sqrt(Math.max(0, 1 - y * y)), a = i * golden + cr.range(-0.25, 0.25);
      dir = new THREE.Vector3(Math.cos(a) * r0, y, Math.sin(a) * r0);
      rad = cr.range(0.66, 0.86);
      size = cr.range(1.0, 1.25);
    } else {
      dir = new THREE.Vector3(cr.range(-1, 1), cr.range(-0.4, 0.9), cr.range(-1, 1)).normalize();
      rad = cr.range(0.15, 0.38);
      size = cr.range(1.0, 1.2);
    }
    const centre = dir.clone().multiplyScalar(rad);
    // card normal: mostly radial, a little skew so neighbours are not parallel plates
    const n = dir.clone().add(new THREE.Vector3(cr.range(-0.3, 0.3), cr.range(-0.3, 0.3), cr.range(-0.3, 0.3))).normalize();
    q.setFromUnitVectors(z, n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(z, cr.range(0, Math.PI * 2)));
    const h = size / 2;
    const cs: Array<[number, number]> = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const vs = cs.map(([cx, cy]) => new THREE.Vector3(cx, cy, 0).applyQuaternion(q).add(centre));
    const us: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const j of tri) {
        const p = vs[j], nn = p.clone().normalize();
        pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(us[j][0], us[j][1]);
        // dark in the middle, lit on the shell; a lit top and a shaded underside; per-card jitter so the dome is not uniform
        const rr = Math.min(1, p.length());
        const b = (0.5 + 0.5 * Math.pow(rr, 1.3)) * (0.82 + 0.2 * Math.min(1, Math.max(0, (p.y + 0.9) / 1.8))) * (0.94 + 0.12 * ((i * 0.618) % 1));
        col.push(b, b, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Street / park tree trunk: a lathe with a root flare (0.54 m at the ground, 0.34 at 0.45 m, 0.2 at 3 m; open ended, 7 sides) and
 * four limbs that climb into the crown. About 60 triangles, shared by every tree; the instance matrix scales it per species.
 */
export function buildTreeTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const lathe = new THREE.LatheGeometry([new THREE.Vector2(0.54, 0), new THREE.Vector2(0.33, 0.5), new THREE.Vector2(0.2, 3.0)], 7);
  parts.push(lathe.toNonIndexed());
  const up = new THREE.Vector3(0, 1, 0);
  const limb = (a: [number, number, number], b: [number, number, number], r0: number, r1: number): void => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 4, 1, true).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate(a[0], a[1], a[2]);
    parts.push(g.toNonIndexed());
  };
  limb([0, 2.3, 0], [0, 4.8, 0], 0.17, 0.06);
  limb([0, 2.6, 0], [1.4, 4.1, 0.9], 0.12, 0.05);
  limb([0, 2.6, 0], [-1.2, 4.2, -1.0], 0.12, 0.05);
  limb([0, 2.7, 0], [0.2, 4.0, -1.5], 0.1, 0.045);
  // merge by hand (no extra import): all parts are non-indexed with position, normal and uv
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    uv.set(p.getAttribute('uv').array as Float32Array, o * 2);
    o += c;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
