/**
 * The shader of the people painter: for one texel of the body (its 3D position, normal and the weights of head / torso / arms /
 * legs) decide what is there: the face and head, the neck, a hand, a sleeve, the top, the trousers, the shoe. Layers blend with
 * soft edges (skin, shoe, trousers, top) so a hem or a neckline is one clean line across the seams of the unwrap.
 */
import { Px, sst, type Look, type Tex, makeLook } from './pedPaintShared';
import { paintHead, hijabCloth } from './pedPaintFace';
import { paintBody } from './pedPaintBody';
import type { BakeInput } from './pedSkinPaint';
import { rgb } from './pedPaintShared';

export interface Shader { K: Look; shade(x: number, y: number, z: number, nx: number, ny: number, nz: number, wh: number, wt: number, wa: number, wl: number, q: number, o: Px): void }

export function makeShader(b: BakeInput): Shader {
  const K = makeLook(b), lm = K.lm;
  // the hand: where its tip is and which way its width runs (so knuckles, finger gaps and nails land on the right axis)
  {
    let minY = 9, x0 = 9, x1 = -9, z0 = 9, z1 = -9;
    for (let v = 0; v < b.position.length / 3; v++) {
      let wa = 0; for (let k = 0; k < 4; k++) { const j = b.joints[v * 4 + k]; if (j >= 4 && j <= 7) wa += b.weights[v * 4 + k]; }
      const y = b.position[v * 3 + 1];
      if (wa > 0.5 && y < K.wrY - 0.02) { if (y < minY) minY = y; if (y < K.wrY - 0.05) { x0 = Math.min(x0, b.position[v * 3]); x1 = Math.max(x1, b.position[v * 3]); z0 = Math.min(z0, b.position[v * 3 + 2]); z1 = Math.max(z1, b.position[v * 3 + 2]); } }
    }
    if (minY < 9) K.handTipY = minY;
    K.handAxis = (x1 - x0) > (z1 - z0) ? 0 : 1;
  }
  const B = new Px();
  const T: Tex = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, wh: 0, wt: 0, wa: 0, wl: 0, q: 0 };
  const shade: Shader['shade'] = (x, y, z, nx, ny, nz, wh, wt, wa, wl, q, o) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    T.x = x; T.y = y; T.z = z; T.nx = nx / l; T.ny = ny / l; T.nz = nz / l; T.wh = wh; T.wt = wt; T.wa = wa; T.wl = wl; T.q = q;
    if (y > lm.chinY - 0.012 && wh > 0.55) { paintHead(K, T, o); return; }
    paintBody(K, T, o);
    // the neck / jaw boundary follows the bone weights: blend over a band so it is not a staircase
    if (y > lm.chinY - 0.04 && y > K.shY + 0.06 && wh > 0.15) { const m = sst(0.15, 0.55, wh) * sst(lm.chinY - 0.04, lm.chinY - 0.01, y); if (m > 0) { paintHead(K, T, B); o.mixP(B, m); } }
  };
  void sst; void hijabCloth; void rgb;
  return { K, shade };
}

/** find the texel of each eye centre and the metres-per-texel round it (standard head metres), so the eye is painted in map space */
export function locateEyes(K: Look, size: number, cover: Uint8Array, pos: Float32Array, w: Float32Array): void {
  K.size = size; K.eyes = [null, null];
  const lm = K.lm, best = [1e9, 1e9], bq = [-1, -1];
  for (let q = 0; q < size * size; q++) {
    if (!cover[q] || w[q * 4] < 0.5) continue;
    const y = pos[q * 3 + 1]; if (Math.abs(y - lm.eyeY) > 0.02) continue;
    const x = pos[q * 3], z = pos[q * 3 + 2], fz = (K.zc - z) / Math.max(0.05, K.rzH); if (fz < 0.5) continue;
    const side = x < 0 ? 0 : 1, dx = Math.abs(x) - lm.eyeX, dy = y - lm.eyeY, d = dx * dx + dy * dy;
    if (d < best[side]) { best[side] = d; bq[side] = q; }
  }
  for (let side = 0; side < 2; side++) {
    const q = bq[side]; if (q < 0 || best[side] > 0.012 * 0.012) continue;
    const cx = q % size, cy = (q / size) | 0, at = (px: number, py: number): number => (py * size + px) * 3;
    if (cx < 5 || cy < 5 || cx > size - 6 || cy > size - 6) continue;
    const xr = Math.abs(pos[at(cx + 4, cy)]), xl = Math.abs(pos[at(cx - 4, cy)]), yu = pos[at(cx, cy - 4) + 1], yd = pos[at(cx, cy + 4) + 1];
    const dxm = (xr - xl) / 8, dym = (yu - yd) / 8;
    const sx = Math.min(0.0012, Math.max(0.00025, Math.abs(dxm) / K.wsx)), sy = Math.min(0.0016, Math.max(0.0003, Math.abs(dym) / K.hs));
    K.eyes[side] = { cx, cy, dirx: dxm >= 0 ? 1 : -1, sx, sy };
  }
}
