/** Tiny flat-shaded geometry accumulator (boxes, quads, cylinders) with per-vertex colours; used by the el structure and the train cars. */
import * as THREE from 'three';

export type RGB = readonly [number, number, number];

export class GeoBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];

  get triangles(): number { return this.pos.length / 9; }

  private tri(a: readonly number[], b: readonly number[], c: readonly number[], color: RGB, uvs?: readonly number[]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(color[0], color[1], color[2]); }
    if (uvs) this.uv.push(...uvs); else this.uv.push(0, 0, 1, 0, 1, 1);
  }

  /** Quad a-b-c-d counter-clockwise seen from the front. uv rectangle (u0,v0,u1,v1) maps a->b->c->d. */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], color: RGB, uvr: readonly [number, number, number, number] = [0, 0, 1, 1]): void {
    const [u0, v0, u1, v1] = uvr;
    this.tri(a, b, c, color, [u0, v0, u1, v0, u1, v1]);
    this.tri(a, c, d, color, [u0, v0, u1, v1, u0, v1]);
  }

  /** Axis-aligned box; `skip` is a string of faces to leave out (r +x, l -x, u +y, d -y, f +z, b -z). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB, skip = ''): void {
    const P = (x: number, y: number, z: number): number[] => [x, y, z];
    if (!skip.includes('f')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), color);
    if (!skip.includes('b')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), color);
    if (!skip.includes('r')) this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), color);
    if (!skip.includes('l')) this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), color);
    if (!skip.includes('u')) this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), color);
    if (!skip.includes('d')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), color);
  }

  /** Cylinder around the z axis (a wheel) centred at (cx, cy), spanning z0..z1. */
  wheel(cx: number, cy: number, r: number, z0: number, z1: number, segs: number, color: RGB): void {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
      this.quad([p0[0], p0[1], z1], [p1[0], p1[1], z1], [p1[0], p1[1], z0], [p0[0], p0[1], z0], color);
      this.tri([cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], color);
      this.tri([cx, cy, z0], [p1[0], p1[1], z0], [p0[0], p0[1], z0], color);
    }
  }

  /** Appends another builder's triangles shifted by (dx, dy, dz) and rotated by yaw about y first. */
  append(o: GeoBuilder, dx = 0, dy = 0, dz = 0, yaw = 0): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < o.pos.length; i += 3) {
      const x = o.pos[i], y = o.pos[i + 1], z = o.pos[i + 2];
      this.pos.push(x * c + z * s + dx, y + dy, -x * s + z * c + dz);
      const nx = o.nor[i], nz = o.nor[i + 2];
      this.nor.push(nx * c + nz * s, o.nor[i + 1], -nx * s + nz * c);
      this.col.push(o.col[i], o.col[i + 1], o.col[i + 2]);
    }
    this.uv.push(...o.uv);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
