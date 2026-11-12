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
  const T: Tex = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, wh: 0, wt: 0, wa: 0, wl: 0, q: 0 };
  const shade: Shader['shade'] = (x, y, z, nx, ny, nz, wh, wt, wa, wl, q, o) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    T.x = x; T.y = y; T.z = z; T.nx = nx / l; T.ny = ny / l; T.nz = nz / l; T.wh = wh; T.wt = wt; T.wa = wa; T.wl = wl; T.q = q;
    if (y > lm.chinY - 0.012 && wh > 0.4) { paintHead(K, T, o); return; }
    paintBody(K, T, o);
  };
  void sst; void hijabCloth; void rgb;
  return { K, shade };
}
