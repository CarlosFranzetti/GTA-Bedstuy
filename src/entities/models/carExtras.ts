/**
 * CARS12: per-car geometry extras (roof racks, cargo boxes, ladder racks, taxi toppers, medallion plate, bumper stickers, ride-share
 * windshield decals, bus route sign). Built from the body's `anchors` and the car's `CarLook`, cached per (body, look.key) by carModel.ts and
 * merged into the ONE trim mesh as vertex-coloured triangles, so they cost no draw call (only a few dozen triangles, and the lite model's
 * trim prune drops the smallest first). Every sticker and sign is an invented shape or colour block: no real marks, no lettering.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bx, v3, type CarParts } from './carBodies';
import { RIDESHARE, type CarLook } from './carLook';

/** Gives `g` flat per-vertex colour (non-indexed, position / normal / uv / color only). */
export function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  const cnt = n.attributes.position.count;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
  const c = new THREE.Color(hex);
  const a = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}

/** A flat decal quad on the rear (+z) face. */
const decalQ = (w: number, h: number, x: number, y: number, z: number, rot = 0): THREE.BufferGeometry => new THREE.PlaneGeometry(w, h).rotateZ(rot).translate(x, y, z);

/** Bumper sticker shapes, 8 designs; (x, y, z) is the centre on the rear face. */
function sticker(id: number, x: number, y: number, z: number, out: THREE.BufferGeometry[]): void {
  switch (id % 8) {
    case 0: out.push(colored(decalQ(0.1, 0.1, x, y, z, Math.PI / 4), 0xf2c500)); out.push(colored(decalQ(0.04, 0.04, x, y, z + 0.001, Math.PI / 4), 0x222222)); break; // baby-on-board diamond
    case 1: out.push(colored(decalQ(0.16, 0.03, x, y + 0.03, z), 0x2a6a3a), colored(decalQ(0.16, 0.03, x, y, z), 0xf2f2f2), colored(decalQ(0.16, 0.03, x, y - 0.03, z), 0xb02a2a)); break; // tri-stripe
    case 2: out.push(colored(new THREE.CircleGeometry(0.06, 8).translate(x, y, z), 0x15161a), colored(new THREE.CircleGeometry(0.025, 6).translate(x, y, z + 0.001), 0xf2f2f2)); break;
    case 3: out.push(colored(new THREE.CircleGeometry(0.07, 8).scale(1.5, 0.8, 1).translate(x, y, z), 0xe86aa0)); break; // oval
    case 4: out.push(colored(decalQ(0.17, 0.07, x, y, z), 0x2a5fb0), colored(decalQ(0.17, 0.02, x, y - 0.01, z + 0.001), 0xf2c500)); break;
    case 5: out.push(colored(new THREE.CircleGeometry(0.03, 6).translate(x - 0.025, y + 0.015, z), 0xc8202a), colored(new THREE.CircleGeometry(0.03, 6).translate(x + 0.025, y + 0.015, z), 0xc8202a), colored(new THREE.CircleGeometry(0.06, 3).rotateZ(Math.PI).translate(x, y - 0.012, z), 0xc8202a)); break; // heart
    case 6: out.push(colored(decalQ(0.1, 0.1, x, y, z), 0x2f8a4a), colored(decalQ(0.07, 0.016, x, y, z + 0.001), 0xf2f2f2), colored(decalQ(0.016, 0.07, x, y, z + 0.001), 0xf2f2f2)); break;
    default: out.push(colored(decalQ(0.15, 0.08, x, y, z), 0xe07a1a), colored(decalQ(0.15, 0.02, x, y, z + 0.001), 0x15161a)); break;
  }
}

/** Ad-panel colour pairs of the taxi toppers (invented advertisers: colour blocks only). */
const AD_COLORS = [0xe84a9a, 0x2a9bd8, 0x6ac04a, 0xf08a1c, 0xd8d8d0, 0x8a4ad8];

export function buildExtras(parts: CarParts, look: CarLook, style: string, near: boolean): THREE.BufferGeometry | null {
  const a = parts.anchors;
  const out: THREE.BufferGeometry[] = [];
  if (a) {
    const { y, u0, u1, hw } = a.roof;
    const len = Math.max(0.4, (u0 - u1) * 0.82), cu = (u0 + u1) / 2;
    const rail = 0x24272b, bar = 0xaeb3b9;
    switch (look.roof) {
      case 'rack': case 'cargo': case 'bars': {
        if (look.roof !== 'bars') for (const s of [-1, 1]) out.push(colored(bx(0.035, 0.035, len, s * hw * 0.86, y + 0.035, -cu), rail));
        for (const f of [0.22, 0.78]) {
          const z = -(u1 + (u0 - u1) * 0.1 + len * f);
          out.push(colored(bx(2 * hw * 0.9, 0.025, 0.04, 0, y + 0.058, z), bar));
        }
        if (look.roof === 'cargo') {
          out.push(colored(bx(2 * hw * 0.68, 0.26, Math.min(1.5, len * 0.8), 0, y + 0.2, -cu), 0x1d2025));
          out.push(colored(bx(2 * hw * 0.64, 0.012, Math.min(1.46, len * 0.78), 0, y + 0.336, -cu), 0x33383f));
        }
        break;
      }
      case 'ladder': {
        const lw = hw * 0.5, ll = len * 1.02;
        for (const s of [-1, 1]) out.push(colored(bx(0.04, 0.06, ll, s * lw, y + 0.11, -cu), 0xb8bcc2));
        for (let k = 0; k <= (near ? 9 : 4); k++) out.push(colored(bx(2 * lw, 0.025, 0.025, 0, y + 0.13, -(cu + ll / 2 - k * (ll / (near ? 9 : 4)))), 0xcfd3d8));
        for (const f of [0.15, 0.85]) out.push(colored(bx(2 * hw * 0.9, 0.05, 0.05, 0, y + 0.04, -(cu + ll * (0.5 - f))), 0x24272b));
        break;
      }
      case 'topperAd': case 'topperHail': {
        const col = look.roof === 'topperHail' ? 0x1a2030 : AD_COLORS[(look.stickers[0] ?? 0) % AD_COLORS.length];
        const col2 = look.roof === 'topperHail' ? 0x2a3040 : AD_COLORS[((look.stickers[0] ?? 0) + 2) % AD_COLORS.length];
        for (const s of [-1, 1]) {
          out.push(colored(bx(0.36, 0.18, 0.2, s * 0.37, y + 0.1, -cu), 0x1c1d20));
          out.push(colored(decalQ(0.3, 0.12, s * 0.37, y + 0.1, -cu - 0.1 - 0.002), col)); // ad face toward the rear
          out.push(colored(decalQ(0.3, 0.12, s * 0.37, y + 0.1, -cu + 0.1 + 0.002).rotateY(Math.PI), col2)); // ad face toward the front
        }
        break;
      }
      default: break;
    }
    if (style === 'cab') out.push(colored(bx(0.12, 0.012, 0.075, 0, a.hoodFront.y + 0.004, a.hoodFront.z), 0xcfd4d9)); // medallion plate on the hood
    // bumper stickers on the rear face
    look.stickers.forEach((id, i) => sticker(id, (i === 0 ? -1 : 1) * (0.34 + 0.1 * i), a.rear.y, a.rear.z + 0.006, out));
    if (look.rideshare >= 0) {
      const c = RIDESHARE[look.rideshare].color;
      for (const q of [a.wsQuad, a.rgQuad]) if (q) {
        const g = new THREE.BufferGeometry();
        g.setFromPoints([q[0], q[1], q[2], q[0], q[2], q[3]]);
        g.computeVertexNormals();
        // orient to face outward (away from the car's centre line, toward the viewer above the hull)
        const n = g.attributes.normal;
        if (n.getY(0) < 0) { const p = g.attributes.position; for (let t = 0; t < 6; t += 3) { const x = p.getX(t + 1), yy = p.getY(t + 1), z = p.getZ(t + 1); p.setXYZ(t + 1, p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2)); p.setXYZ(t + 2, x, yy, z); } g.computeVertexNormals(); }
        out.push(colored(g, c));
      }
    }
  }
  if (style === 'bus' && parts.anchors?.sign && near) {
    const s = parts.anchors.sign;
    out.push(colored(bx(1.74, 0.17, 0.01, s.x, s.y, s.z - 0.022), 0xe8a010)); // destination sign, amber
    const bars = [[-0.7, 0.2], [-0.4, 0.5], [0.3, 0.55], [0.72, 0.2]] as const;
    for (const [bxp, w] of bars) out.push(colored(bx(w, 0.09, 0.011, s.x + bxp - w / 2 + 0.1, s.y, s.z - 0.026), 0x1a1208));
  }
  void v3;
  if (out.length === 0) return null;
  const m = mergeGeometries(out, false);
  for (const g of out) g.dispose();
  return m;
}
