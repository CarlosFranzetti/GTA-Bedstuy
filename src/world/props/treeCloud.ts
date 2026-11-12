import * as THREE from 'three';
import { Rng } from '@/core/Rng';

/**
 * Canopy cloud shared by the grid furniture and the real-map props (ROADS): 48 single-triangle leaf cards (the same 48 triangles
 * the 24 quads used) in a unit ball. Each card is an equilateral triangle whose UVs frame the round leaf-cluster sprite, so the
 * alpha cut breaks the outline into many small leafy pieces instead of 24 big square sheets. Vertex normals point out of the
 * ball centre, so the cloud shades as one soft volume; the material is double-sided.
 */
export function buildCloudGeometry(): THREE.BufferGeometry {
  const cr = new Rng('tree-cloud-tri');
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  // equilateral triangle with the sprite circle (radius 0.46 of the card) inscribed: vertices 2 * inradius from the centre
  const R = 0.92;
  const corners = [90, 210, 330].map((a) => [Math.cos((a * Math.PI) / 180) * R, Math.sin((a * Math.PI) / 180) * R] as const);
  for (let i = 0; i < 48; i++) {
    const dir = new THREE.Vector3(cr.range(-1, 1), cr.range(-0.55, 1), cr.range(-1, 1)).normalize().multiplyScalar(0.82 * Math.cbrt(cr.next()));
    const size = cr.range(0.58, 0.95); // sprite circle radius 0.46 * size: smaller, twice as many pieces as the old 24 quads
    q.setFromEuler(e.set(cr.range(0, Math.PI), cr.range(0, Math.PI * 2), cr.range(0, Math.PI)));
    for (const [cx, cy] of corners) {
      const p = new THREE.Vector3(cx * size, cy * size, 0).applyQuaternion(q).add(dir);
      const n = p.clone().normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(0.5 + cx, 0.5 + cy);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
