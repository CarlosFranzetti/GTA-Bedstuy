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

/**
 * find each eyeball: seeds are the texels at the eye middle that lie more than 12 mm deeper than the skin round them (the eyeball sphere sits behind the lid ring),
 * grown over the map while neighbouring texels stay within 4 mm of each other in 3D. The painter then colours those texels as eye (sclera, iris, pupil) and everything
 * else as skin, so the opening is exactly the one the geometry cuts, whatever the lids do.
 */
export function locateEyes(K: Look, size: number, cover: Uint8Array, pos: Float32Array, w: Float32Array): void {
  K.size = size; K.eyes = [null, null]; K.eyeTex = new Uint8Array(size * size);
  const lm = K.lm, half = size >> 1, tex = K.eyeTex;
  const stack: number[] = [];
  for (let sd = 0; sd < 2; sd++) {
    const sgn = sd === 0 ? -1 : 1;
    let zf = 1e9;
    for (let py = 0; py < half; py++) for (let px = 0; px < half; px++) {
      const q = py * size + px; if (!cover[q] || w[q * 4] < 0.5) continue;
      const x = pos[q * 3], y = pos[q * 3 + 1]; if (x * sgn <= 0 || Math.abs(Math.abs(x) - lm.eyeX) > 0.014 || Math.abs(y - lm.eyeY) > 0.012) continue;
      if (pos[q * 3 + 2] < zf) zf = pos[q * 3 + 2];
    }
    if (zf > 1e8) continue;
    stack.length = 0;
    for (let py = 0; py < half; py++) for (let px = 0; px < half; px++) {
      const q = py * size + px; if (!cover[q] || w[q * 4] < 0.5) continue;
      const x = pos[q * 3], y = pos[q * 3 + 1]; if (x * sgn <= 0 || Math.abs(Math.abs(x) - lm.eyeX) > 0.006 || Math.abs(y - lm.eyeY) > 0.005) continue;
      if (pos[q * 3 + 2] > zf + 0.012) { stack.push(q); tex[q] = 1; }
    }
    if (stack.length < 4) continue;
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, zMin = 1e9;
    const grown: number[] = [];
    while (stack.length && n < 6000) {
      const q = stack.pop()!; n++; grown.push(q);
      const px = q % size, py = (q / size) | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; if (pos[q * 3 + 2] < zMin) zMin = pos[q * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const nx = px + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = py + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 1 || ny < 1 || nx >= half - 1 || ny >= half - 1) continue;
        const o = ny * size + nx; if (tex[o] || !cover[o] || w[o * 4] < 0.5) continue;
        if (pos[o * 3 + 2] < zf + 0.01) continue;
        const d = Math.hypot(pos[o * 3] - pos[q * 3], pos[o * 3 + 1] - pos[q * 3 + 1], pos[o * 3 + 2] - pos[q * 3 + 2]);
        if (d > 0.004) continue;
        tex[o] = 1; stack.push(o);
      }
    }
    if (n >= 6000 || grown.length < 12) { for (const q of grown) tex[q] = 0; continue; }
    let sx = 0, sy = 0, spx = 0, spy = 0, c = 0;
    for (const q of grown) { if (pos[q * 3 + 2] > zMin + 0.0035) continue; sx += Math.abs(pos[q * 3]); sy += pos[q * 3 + 1]; spx += q % size; spy += (q / size) | 0; c++; }
    K.eyes[sd] = { cx: sx / c, cy: sy / c, zf, x0, y0, x1, y1, px: spx / c, py: spy / c };
  }
}
