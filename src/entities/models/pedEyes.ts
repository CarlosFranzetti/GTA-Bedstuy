/**
 * FACES4: a real eye. The shipped skin mesh has no eye geometry (the helper eye meshes are dropped) and only a dozen vertices across an eye, so the eye
 * used to be paint on a flat lid. For the hi level this builds, per eye, a small polar mesh round the eye opening: rings at fixed fractions of the
 * painted opening (pedEyeShape.ts is the one curve both the paint and this use), conformed to the person's morphed skin by a ray cast along the view axis and then pushed
 * along the skin normal: a recessed eyeball (deeper toward the corners) behind a lid margin that has thickness, the lid ridge falling back to flush with the
 * skin. The skin triangles under it are left out of the hi level. Its UVs go to two rectangles of the atlas that the face painter fills with the eye in patch coordinates
 * (free space in the atlas, so no new texture and no more texture memory). The mid and far levels keep the same eye painted in the head tile.
 * About 300 triangles an eye, one part of the same skinned geometry (no new draw call). No bone, no blink (see docs/swarm/tasks/FACES4.md).
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';
import { eyeShapeOf, eyeEdges, EYE_RECTS, EYE_SR, EYE_EYC, EYE_RHO_MAX } from '@/textures/painters/pedEyeShape';
import { hash } from '@/textures/painters/pedPaintShared';

const HEAD_BONE = 3;
const RINGS = [0, 0.5, 0.85, 0.96, 1.0, 1.12, 1.35, 1.75, 2.2, EYE_RHO_MAX];
const NA = 20;
const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
export const eyeDebug = { patch: true };

export interface EyePatch {
  /** render geometry (the morphed skin plus the relief) */ position: Float32Array; normal: Float32Array;
  /** for the texture bake: the unmorphed skin point under each vertex and the skin's normal there */ position0: Float32Array; normal0: Float32Array;
  uv: Float32Array; index: Uint32Array; joints: Uint16Array; weights: Float32Array;
  /** the skin triangle corners under each vertex and their weights (3 each), so the skin's vertex colours (its baked ambient occlusion) can be carried onto the patch */ hitV: Uint32Array; hitW: Float32Array;
  /** triangles (of the skin's index, by triangle number) that lie wholly under the patch */ hide: Set<number>;
}

/** inputs the shape's landmarks give: hs and wsx are the painter's head scales */
export function buildEyePatch(s: Pick<MhShape, 'landmarks'>, spec: PedSpec, L: MhLod): EyePatch | null {
  const lm = s.landmarks, hs = (lm.crownY - lm.chinY) / 0.2285, wsx = lm.eyeX / 0.029, E = eyeShapeOf(spec), bag = hash(spec.id + 'bag');
  const n = L.position.length / 3, nT = L.index.length / 3;
  const P0 = new Float32Array(L.position); if (L.faceDelta) for (let i = 0; i < L.faceDelta.length && i < P0.length; i++) P0[i] -= L.faceDelta[i];      // (the leg tubes are appended after the morph: no delta for them)
  const nv1 = 1 + (RINGS.length - 1) * NA, nvT = nv1 * 2;
  const pos = new Float32Array(nvT * 3), nrm = new Float32Array(nvT * 3), pos0 = new Float32Array(nvT * 3), nrm0 = new Float32Array(nvT * 3), uv = new Float32Array(nvT * 2);
  const idx: number[] = [], hide = new Set<number>(), hitV = new Uint32Array(nvT * 3), hitW = new Float32Array(nvT * 3);
  void n;
  for (let sd = 0; sd < 2; sd++) {
    const side = sd === 0 ? -1 : 1, rect = EYE_RECTS[sd], rcx = rect.x + rect.w / 2, rcy = rect.y + rect.h / 2;
    // candidate skin triangles: those whose unmorphed xy overlaps the patch's box and that stand in the front of the face
    const x0 = Math.min(side * (lm.eyeX - 0.06), side * (lm.eyeX + 0.06)), x1 = Math.max(side * (lm.eyeX - 0.06), side * (lm.eyeX + 0.06)), y0 = lm.eyeY - 0.045, y1 = lm.eyeY + 0.045;
    const cand: number[] = [];
    for (let t = 0; t < nT; t++) {
      const a = L.index[t * 3], b = L.index[t * 3 + 1], c = L.index[t * 3 + 2];
      const ax = P0[a * 3], bx = P0[b * 3], cx = P0[c * 3], ay = P0[a * 3 + 1], by = P0[b * 3 + 1], cy = P0[c * 3 + 1];
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(ay, by, cy) < y0 || Math.min(ay, by, cy) > y1) continue;
      cand.push(t);
    }
    // the ray: the front-most skin triangle over (X, Y)
    const hit = (X: number, Y: number, zRef: number | null): { t: number; l1: number; l2: number; l3: number; z: number } | null => {
      let best: { t: number; l1: number; l2: number; l3: number; z: number } | null = null;
      for (const t of cand) {
        const a = L.index[t * 3], b = L.index[t * 3 + 1], c = L.index[t * 3 + 2];
        const ax = P0[a * 3], ay = P0[a * 3 + 1], bx = P0[b * 3], by = P0[b * 3 + 1], cx = P0[c * 3], cy = P0[c * 3 + 1];
        const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
        const l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den, l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
        const z = P0[a * 3 + 2] * l1 + P0[b * 3 + 2] * l2 + P0[c * 3 + 2] * l3;
        if (zRef !== null && Math.abs(z - zRef) > 0.03) continue;
        if (!best || z < best.z) best = { t, l1, l2, l3, z };
      }
      return best;
    };
    const centre = hit(side * lm.eyeX, lm.eyeY, null); if (!centre) return null;
    const zRef = centre.z;
    const base = sd * nv1;
    for (let r = 0; r < RINGS.length; r++) {
      const rho = RINGS[r], cnt = r === 0 ? 1 : NA;
      for (let j = 0; j < cnt; j++) {
        const phi = (j / NA) * Math.PI * 2, cphi = Math.cos(phi), sphi = Math.sin(phi);
        const ub = cphi, ed = eyeEdges(E, ub), by = sphi >= 0 ? ed.yu : ed.yl;
        const exm = rho * ub * E.a, eym = EYE_EYC + rho * (by - EYE_EYC);
        const X = side * (lm.eyeX + exm * wsx), Y = lm.eyeY + eym * hs;
        const h = hit(X, Y, null); if (!h) { if ((globalThis as { __eyeDbg?: boolean }).__eyeDbg) console.log('NOHIT', sd, r, j, rho, X, Y, zRef, cand.length); return null; }
        const vi = r === 0 ? base : base + 1 + (r - 1) * NA + j;
        const a = L.index[h.t * 3], b = L.index[h.t * 3 + 1], c = L.index[h.t * 3 + 2];
        hitV[vi * 3] = a; hitV[vi * 3 + 1] = b; hitV[vi * 3 + 2] = c; hitW[vi * 3] = h.l1; hitW[vi * 3 + 1] = h.l2; hitW[vi * 3 + 2] = h.l3;
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 3; k++) {
          pos[vi * 3 + k] = L.position[a * 3 + k] * h.l1 + L.position[b * 3 + k] * h.l2 + L.position[c * 3 + k] * h.l3;
          pos0[vi * 3 + k] = P0[a * 3 + k] * h.l1 + P0[b * 3 + k] * h.l2 + P0[c * 3 + k] * h.l3;
        }
        nx = L.normal[a * 3] * h.l1 + L.normal[b * 3] * h.l2 + L.normal[c * 3] * h.l3; ny = L.normal[a * 3 + 1] * h.l1 + L.normal[b * 3 + 1] * h.l2 + L.normal[c * 3 + 1] * h.l3; nz = L.normal[a * 3 + 2] * h.l1 + L.normal[b * 3 + 2] * h.l2 + L.normal[c * 3 + 2] * h.l3;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        nrm0[vi * 3] = nx; nrm0[vi * 3 + 1] = ny; nrm0[vi * 3 + 2] = nz;
        // the relief along the skin normal (metres, + out of the face)
        const up = sphi >= 0, c2 = cphi * cphi;
        let off: number;
        if (rho < 0.995) off = -(0.0002 + 0.0007 * rho * rho + 0.0008 * rho * rho * c2);                                   // the eyeball: deeper toward the corners
        else {
          const lid = (up ? 0.0006 : 0.0004) * (1 - 0.5 * c2);                                                              // the lid margin has thickness
          const fall = 1 - sst(1.0, 1.9, rho);
          off = lid * fall
            - (up ? 0.0004 * E.heavy * Math.exp(-(((rho - 1.55) / 0.22) ** 2)) : 0)                                          // a heavy lid folds
            + (up ? 0 : (0.0003 + 0.0006 * bag) * Math.exp(-(((rho - 1.75) / 0.3) ** 2)))                                    // the pouch under the eye
            + 0.0004 * sst(1.05, 1.6, rho) * (1 - 0.5 * sst(2.2, EYE_RHO_MAX, rho));                                         // the whole pad stands 0.2 to 0.4 mm proud so the folds of the old lid ring never poke through it
        }
        if (rho > 1.05) off = Math.max(off, 0.0002);
        pos[vi * 3] += nx * off; pos[vi * 3 + 1] += ny * off; pos[vi * 3 + 2] += nz * off;
        uv[vi * 2] = (rcx + exm / EYE_SR) / 512; uv[vi * 2 + 1] = 1 - (rcy - (eym - EYE_EYC) / EYE_SR) / 512;
      }
    }
    // triangles
    const ringV = (r: number, j: number): number => (r === 0 ? base : base + 1 + (r - 1) * NA + (((j % NA) + NA) % NA));
    for (let j = 0; j < NA; j++) idx.push(ringV(0, 0), ringV(1, j), ringV(1, j + 1));
    for (let r = 1; r < RINGS.length - 1; r++) for (let j = 0; j < NA; j++) {
      const a = ringV(r, j), b = ringV(r, j + 1), c = ringV(r + 1, j), d = ringV(r + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    // the skin triangles wholly under the patch (all corners, edge midpoints and the centre inside the outer ring, with a margin) are not drawn at the hi level
    const rhoOf = (X: number, Y: number): number => {
      const exm = (side * X - lm.eyeX) / wsx, eym = (Y - lm.eyeY) / hs;
      const ed = eyeEdges(E, 0), hh = eym > EYE_EYC ? ed.yu - EYE_EYC : EYE_EYC - ed.yl;
      return Math.hypot(exm / E.a, (eym - EYE_EYC) / hh);
    };
    for (const t of cand) {
      const v = [L.index[t * 3], L.index[t * 3 + 1], L.index[t * 3 + 2]];
      let ok = true;
      if (Math.abs((P0[v[0] * 3 + 2] + P0[v[1] * 3 + 2] + P0[v[2] * 3 + 2]) / 3 - zRef) > 0.05) continue;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3]; pts.push([P0[a * 3], P0[a * 3 + 1]], [(P0[a * 3] + P0[b * 3]) / 2, (P0[a * 3 + 1] + P0[b * 3 + 1]) / 2]); }
      pts.push([(P0[v[0] * 3] + P0[v[1] * 3] + P0[v[2] * 3]) / 3, (P0[v[0] * 3 + 1] + P0[v[1] * 3 + 1] + P0[v[2] * 3 + 1]) / 3]);
      // a skin triangle that touches the opening would cover part of the recessed eye, so it goes; one wholly inside ρ 2.3 goes too (the old lid ring and its folds would poke through the patch). Everything else stays under the patch (which
      // sits on or above it), so a triangle that reaches past the patch's rim can never leave a hole.
      let near = false;
      for (const p of pts) { const rr = rhoOf(p[0], p[1]); if (rr > 2.3) ok = false; if (rr < 0.95) near = true; }
      if (ok || near || rhoOf(pts[pts.length - 1][0], pts[pts.length - 1][1]) < 1.7) hide.add(t);       // (the last point is the centroid)
    }
  }
  // orientation: each eye's patch faces out like the skin it sits on (the two eyes are mirror images, so each is checked on its own: flip its triangles when its first one faces in)
  const ix = Uint32Array.from(idx), perEye = ix.length / 2;
  for (let sd = 0; sd < 2; sd++) {
    const o = sd * perEye; let facing = 0;
    for (let i = o; i < o + perEye; i += 3) {
      const a = ix[i], b = ix[i + 1], c = ix[i + 2];
      const ux = pos0[b * 3] - pos0[a * 3], uy = pos0[b * 3 + 1] - pos0[a * 3 + 1], uz = pos0[b * 3 + 2] - pos0[a * 3 + 2], vx = pos0[c * 3] - pos0[a * 3], vy = pos0[c * 3 + 1] - pos0[a * 3 + 1], vz = pos0[c * 3 + 2] - pos0[a * 3 + 2];
      facing += (uy * vz - uz * vy) * nrm0[a * 3] + (uz * vx - ux * vz) * nrm0[a * 3 + 1] + (ux * vy - uy * vx) * nrm0[a * 3 + 2];
    }
    if (facing < 0) for (let i = o; i < o + perEye; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  // vertex normals from the relief (area weighted), blended to the skin's own toward the outer ring so the patch joins it without a crease
  const acc = new Float32Array(nvT * 3);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i], b = ix[i + 1], c = ix[i + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { acc[q * 3] += fx; acc[q * 3 + 1] += fy; acc[q * 3 + 2] += fz; }
  }
  const R_BALL = 0.0125;   // the eyeball's radius: its normals are those of a sphere (smooth), not the faceted average of five rings
  for (let sd = 0; sd < 2; sd++) for (let r = 0; r < RINGS.length; r++) {
    const w = sst(1.45, EYE_RHO_MAX, RINGS[r]), cnt = r === 0 ? 1 : NA, c0 = sd * nv1;
    for (let j = 0; j < cnt; j++) {
      const vi = sd * nv1 + (r === 0 ? 0 : 1 + (r - 1) * NA + j);
      let x = acc[vi * 3], y = acc[vi * 3 + 1], z = acc[vi * 3 + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      if (RINGS[r] <= 0.96) {
        const cx = nrm0[c0 * 3], cy = nrm0[c0 * 3 + 1], cz = nrm0[c0 * 3 + 2];
        let dx = pos[vi * 3] - pos[c0 * 3], dy = pos[vi * 3 + 1] - pos[c0 * 3 + 1], dz = pos[vi * 3 + 2] - pos[c0 * 3 + 2]; const dn = dx * cx + dy * cy + dz * cz; dx -= dn * cx; dy -= dn * cy; dz -= dn * cz;
        x = cx + dx / R_BALL; y = cy + dy / R_BALL; z = cz + dz / R_BALL; const ls = Math.hypot(x, y, z) || 1; x /= ls; y /= ls; z /= ls;
      }
      x += (nrm0[vi * 3] - x) * w; y += (nrm0[vi * 3 + 1] - y) * w; z += (nrm0[vi * 3 + 2] - z) * w;
      const l2 = Math.hypot(x, y, z) || 1; nrm[vi * 3] = x / l2; nrm[vi * 3 + 1] = y / l2; nrm[vi * 3 + 2] = z / l2;
    }
  }
  const joints = new Uint16Array(nvT * 4), weights = new Float32Array(nvT * 4);
  for (let k = 0; k < nvT; k++) { joints[k * 4] = HEAD_BONE; weights[k * 4] = 1; }
  return { position: pos, normal: nrm, position0: pos0, normal0: nrm0, uv, index: ix, joints, weights, hide, hitV, hitW };
}

const cache = new WeakMap<MhLod, EyePatch | null>();
/** the patch for a dressed hi level (cached with it), or null when the eyes are switched off or the surface could not be found */
export function eyePatchFor(s: Pick<MhShape, 'landmarks'>, spec: PedSpec, L: MhLod): EyePatch | null {
  if (!eyeDebug.patch) return null;
  let p = cache.get(L);
  if (p === undefined) { try { p = buildEyePatch(s, spec, L); } catch { p = null; } cache.set(L, p); }
  return p;
}

/** the skin's per-vertex colour (ambient occlusion) interpolated onto the patch, so it is not lighter than the skin round it */
export function patchColor(e: EyePatch, skin: Float32Array): Float32Array {
  const n = e.position.length / 3, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) out[v * 3 + k] = skin[e.hitV[v * 3] * 3 + k] * e.hitW[v * 3] + skin[e.hitV[v * 3 + 1] * 3 + k] * e.hitW[v * 3 + 1] + skin[e.hitV[v * 3 + 2] * 3 + k] * e.hitW[v * 3 + 2];
  return out;
}
