/**
 * People textures, the GTA III / IV way: the clothes, face, shoes and soft shading are PAINTED INTO ONE COLOUR MAP of one skinned body.
 * The map is baked by position: every texel of the body's UV tiles (a uniform cylinder unwrap per part, scripts/people-pipeline.mjs) is looked up in 3D and
 * coloured by what is at that spot of the body (a neckline, a hem, a cuff, an eyelid). So lines run straight across chart seams and
 * nothing is cut per triangle. A block at the top right of the map holds swatches for the few extra volumes (hair, hat, bag, hood, skirt).
 * No lettering, no logos, no traced art.
 */
import type { PedSpec } from './ped';
import { createCanvas } from '@/textures/canvas';

export const SK_ATLAS = 512;
export interface PxRect { x: number; y: number; w: number; h: number }
/** tiles of the body parts (must equal TILES in scripts/people-pipeline.mjs): each is a cylinder unwrap, left and right limbs share a tile, mirrored */
export const SK_TILES: Record<'head' | 'torso' | 'upperArm' | 'foreArm' | 'hand' | 'neck' | 'thigh' | 'shin' | 'pelvis' | 'shoe', PxRect> = {
  head: { x: 0, y: 0, w: 256, h: 256 }, torso: { x: 256, y: 128, w: 256, h: 128 },
  upperArm: { x: 0, y: 256, w: 128, h: 128 }, foreArm: { x: 128, y: 256, w: 128, h: 128 }, hand: { x: 256, y: 256, w: 128, h: 64 }, neck: { x: 384, y: 256, w: 128, h: 64 },
  thigh: { x: 0, y: 384, w: 128, h: 128 }, shin: { x: 128, y: 384, w: 128, h: 128 }, pelvis: { x: 256, y: 384, w: 128, h: 128 }, shoe: { x: 384, y: 384, w: 128, h: 128 },
};
/** swatches for the few extra volumes: hair, hat, a bag, the top's fabric (hood, coat hem) and the bottom's (skirt) */
export const SK_RECTS: Record<'hair' | 'hat' | 'gear' | 'torso' | 'pelvis' | 'shoe', PxRect> = {
  shoe: { x: 384, y: 384, w: 128, h: 128 },
  hair: { x: 256, y: 0, w: 128, h: 64 }, hat: { x: 384, y: 0, w: 128, h: 64 }, torso: { x: 256, y: 64, w: 64, h: 64 }, pelvis: { x: 320, y: 64, w: 64, h: 64 }, gear: { x: 384, y: 64, w: 128, h: 64 },
};

type RGB = [number, number, number];
const hexCache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = hexCache.get(hex);
  if (!c) {
    const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
    c = [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
    hexCache.set(hex, c);
  }
  return c;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const css = (c: RGB): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
const g2 = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (i: number): number => { let h = Math.imul(i + 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

export interface BakeInput {
  position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint32Array; joints: Uint16Array; weights: Float32Array;
  landmarks: { chinY: number; crownY: number; eyeY: number; eyeX: number; hemY: number; ankleY: number; wristY: number };
  rig: Record<string, number[]>;
  headRings: number[][];
  /** where the top ends (y) */
  topHem: number;
  spec: PedSpec;
}

const N = SK_ATLAS;
const posMap = new Float32Array(N * N * 3), nrmMap = new Float32Array(N * N * 3), wMap = new Float32Array(N * N * 4), cover = new Uint8Array(N * N);

/** rasterise the chart: for every covered texel the 3D position, normal and the weights of head / torso+hips / arms / legs */
function rasterise(b: BakeInput, size: number): void {
  const n = size * size;
  cover.fill(0, 0, n); wMap.fill(0, 0, n * 4);
  const grp = (v: number, out: Float32Array | number[]): void => {
    out[0] = out[1] = out[2] = out[3] = 0;
    for (let k = 0; k < 4; k++) { const j = b.joints[v * 4 + k], w = b.weights[v * 4 + k]; if (j === 3) out[0] += w; else if (j <= 2) out[1] += w; else if (j <= 7) out[2] += w; else out[3] += w; }
  };
  const ga = [0, 0, 0, 0], gb = [0, 0, 0, 0], gc = [0, 0, 0, 0];
  for (let t = 0; t < b.index.length; t += 3) {
    const ia = b.index[t], ib = b.index[t + 1], ic = b.index[t + 2];
    const ax = b.uv[ia * 2] * size, ay = (1 - b.uv[ia * 2 + 1]) * size, bx = b.uv[ib * 2] * size, by = (1 - b.uv[ib * 2 + 1]) * size, cx = b.uv[ic * 2] * size, cy = (1 - b.uv[ic * 2 + 1]) * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) {
      // a pole triangle: its three corners share one point of the pole block, the colour of the triangle's centre goes into that 2 x 2 texel block
      if (Math.abs(ax - bx) < 1e-3 && Math.abs(ay - by) < 1e-3 && Math.abs(ax - cx) < 1e-3) {
        grp(ia, ga); grp(ib, gb); grp(ic, gc);
        const tx = Math.round(ax) - (size > 256 ? 1 : 0), ty = Math.round(ay) - (size > 256 ? 1 : 0), w = size > 256 ? 2 : 1;
        for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) {
          const q = (ty + yy) * size + tx + xx;
          for (let k = 0; k < 3; k++) { posMap[q * 3 + k] = (b.position[ia * 3 + k] + b.position[ib * 3 + k] + b.position[ic * 3 + k]) / 3; nrmMap[q * 3 + k] = (b.normal[ia * 3 + k] + b.normal[ib * 3 + k] + b.normal[ic * 3 + k]) / 3; }
          for (let k = 0; k < 4; k++) wMap[q * 4 + k] = (ga[k] + gb[k] + gc[k]) / 3;
          cover[q] = 1;
        }
      }
      continue;
    }
    grp(ia, ga); grp(ib, gb); grp(ic, gc);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const l1 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den, l2 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den, l3 = 1 - l1 - l2;
      const e = -0.04;
      if (l1 < e || l2 < e || l3 < e) continue;
      const q = py * size + px, c1 = Math.min(1.2, Math.max(-0.2, l1)), c2 = Math.min(1.2, Math.max(-0.2, l2)), c3 = 1 - c1 - c2;
      for (let k = 0; k < 3; k++) {
        posMap[q * 3 + k] = b.position[ia * 3 + k] * c1 + b.position[ib * 3 + k] * c2 + b.position[ic * 3 + k] * c3;
        nrmMap[q * 3 + k] = b.normal[ia * 3 + k] * c1 + b.normal[ib * 3 + k] * c2 + b.normal[ic * 3 + k] * c3;
      }
      for (let k = 0; k < 4; k++) wMap[q * 4 + k] = ga[k] * c1 + gb[k] * c2 + gc[k] * c3;
      cover[q] = 1;
    }
  }
}

/** colour of a texel; everything below is the look of the person */
function makeShader(b: BakeInput): (x: number, y: number, z: number, nx: number, ny: number, nz: number, wh: number, wt: number, wa: number, wl: number, q: number) => RGB {
  const s = b.spec, lm = b.landmarks, R = b.rig, top = s.top, bot = s.bottom, face = s.face;
  const skin = rgb(s.skin), skinDark = mix(mul(skin, 0.72), [120, 30, 25], 0.12), skinLight = mix(skin, [255, 235, 215], 0.14);
  const hairC = rgb(s.hairColor), topC = rgb(top.color), trimC = rgb(top.trim), botC = rgb(bot.color), botTrim = rgb(bot.trim);
  const underC = top.under ? rgb(top.under) : null;
  const shY = R.shoulderL[1], shX = Math.abs(R.shoulderL[0]), elY = R.elbowL[1], knY = R.kneeL[1], wrY = R.wristL[1], anY = lm.ankleY, hipX = Math.abs(R.hipL[0]);
  const hr = b.headRings, eyeRing = hr.reduce((bb, r) => (Math.abs(r[0] - lm.eyeY) < Math.abs(bb[0] - lm.eyeY) ? r : bb));
  const zc = eyeRing[2], rzH = eyeRing[3], hs = (lm.crownY - lm.chinY) / 0.2285, wsx = lm.eyeX / 0.029;
  const mouthY = lm.chinY + 0.41 * (lm.eyeY - lm.chinY), noseY = lm.chinY + 0.68 * (lm.eyeY - lm.chinY);
  const torsoZ = -0.035, k = top.kind, sleeves = top.sleeves, hemTop = b.topHem;
  const old = s.age === 'old', female = s.sex === 'f', kidish = s.age === 'kid' || s.age === 'teen';
  const outerArms = k === 'vest' || k === 'apron' ? underC : topC;   // a vest shows the shirt on the arms
  const sleeveEnd = sleeves === 'short' ? elY + (shY - elY) * 0.42 : sleeves === 'long' ? wrY + 0.012 : k === 'jersey' ? shY - 0.05 : 9;
  const shoeTop = anY + (s.shoes.high ? 0.13 : 0.045), sole = rgb(s.shoes.sole), shoeC = rgb(s.shoes.color), accC = rgb(s.shoes.accent);
  const open = !!top.open && !!underC, zipped = !open && (k === 'hoodie' || k === 'jacket' || k === 'puffer' || k === 'tracksuit' || k === 'cardigan' || k === 'uniform');
  const hatSkullOnly = s.hat === 'kippah' || s.hat === 'kufi';
  const fabNoise = k === 'puffer' ? 0.03 : k === 'tee' || k === 'jersey' || k === 'blouse' ? 0.035 : 0.045;
  const longBot = bot.kind === 'skirt' || bot.kind === 'shorts';
  const hemBot = bot.kind === 'shorts' ? knY + 0.09 : bot.kind === 'skirt' ? 9 : -9;     // bare legs below a short bottom
  const faceLips = face.lips ? rgb(face.lips) : mix(skin, female ? [168, 72, 78] : [140, 70, 66], female ? 0.62 : 0.5);
  const lipDark = mul(faceLips, 0.62);
  const browW = (face.brows === 'thick' ? 0.0042 : face.brows === 'thin' ? 0.0022 : 0.003) * hs, arch = face.brows === 'arched' ? 0.0075 : 0.0035;
  const irisC: RGB = hash(s.id + 'eye') < 0.7 ? [60, 38, 24] : hash(s.id + 'eye2') < 0.5 ? [70, 84, 60] : [48, 64, 88];
  const shape = (v: number): number => v;
  void shape;

  return (x, y, z, nx, ny, nz, wh, wt, wa, wl, q): RGB => {
    const ax = Math.abs(x), side = x < 0 ? -1 : 1, theta = Math.atan2(x, z - torsoZ), nz2 = rnd(q) - 0.5;
    const head = y > lm.chinY - 0.012 && wh > 0.4;
    // ------------------------------------------------------------------ head: skin, face, hair
    if (head) {
      const fz = (zc - z) / Math.max(0.05, rzH);            // 1 at the front of the face, <0 at the back
      let c = skin;
      const t = (y - lm.chinY) / (lm.crownY - lm.chinY);
      c = mix(c, skinLight, 0.35 * sst(0.45, 0.75, t) * sst(0.1, 0.6, fz));     // forehead catches light
      c = mix(c, skinDark, 0.16 * sst(0.5, 0.0, fz) * sst(0.1, 0.4, t));          // sides of the head sit in shade
      if (fz > 0.2) {
        const ex = (ax - lm.eyeX) / wsx;
        // cheeks, under-eye, nose shadow, nasolabial folds
        c = mix(c, [205, 98, 92], (female || kidish ? 0.16 : 0.09) * g2(ex - 0.014 * wsx, 0.026) * g2(y - (lm.eyeY - 0.044 * hs), 0.024 * hs));
        c = mix(c, skinDark, 0.22 * g2(ex, 0.02) * g2(y - (lm.eyeY - 0.016 * hs), 0.006 * hs));
        c = mix(c, skinDark, 0.26 * g2(ax - 0.0095 * wsx, 0.0055 * wsx) * g2(y - (noseY + 0.0008), 0.0042 * hs));                // nostrils
        c = mix(c, skinDark, 0.12 * g2(ax - 0.03 * wsx, 0.006) * sst(noseY + 0.01, noseY - 0.01, y) * sst(mouthY - 0.026, mouthY + 0.004, y) * (old ? 2.2 : 1));
        // eyes: sclera, iris, pupil, lid line, lashes
        const dy = (y - lm.eyeY) / hs, dx = ex / 1;
        const ey = (dx / 0.0142) ** 2 + (dy / (face.eyes === 'wide' ? 0.0066 : face.eyes === 'sleepy' ? 0.0038 : 0.0052)) ** 2;
        if (ey < 1.9) {
          const lid = sst(1.0, 1.9, ey);
          if (ey < 1) {
            c = mix([232, 226, 216], [178, 156, 146], 0.55 * sst(0.3, 1, ey) + (dy > 0 ? 0.25 : 0));
            const ir = Math.hypot(dx, dy - 0.0004) / 0.0064;
            if (ir < 1) c = mix(irisC, mul(irisC, 0.55), sst(0.7, 1, ir));
            if (ir < 0.42) c = [14, 12, 12];
            if (Math.hypot(dx + 0.0016, dy - 0.0022) < 0.0012) c = [250, 250, 250];
          }
          c = mix(c, [24, 18, 16], 0.7 * (1 - lid) * sst(0.84, 1.0, ey) + (dy > 0 ? 0.38 * g2(ey - 1, 0.2) : 0.1 * g2(ey - 1, 0.2)) + (face.lashes && dy > 0 ? 0.2 * g2(ey - 1.2, 0.25) : 0));
        }
        // eyebrows
        const bx = (ex + 0.002) / 0.0185, by0 = lm.eyeY + 0.0235 * hs + arch * hs * (1 - (bx - 0.2) * (bx - 0.2)) * (bx > -1 && bx < 1 ? 1 : 0) - (face.brows === 'arched' ? 0.002 : 0);
        if (bx > -1.15 && bx < 1.1) {
          const a = Math.max(0, 1 - Math.abs(y - by0) / (browW * (1.15 - 0.55 * Math.max(0, bx)))) * (1 - sst(0.85, 1.12, bx)) * (0.6 + 0.4 * (1 - sst(-1.1, -0.6, bx)));
          if (a > 0) c = mix(c, mul(hairC, 0.75), Math.min(0.92, a * (old ? 0.6 : 0.95)));
        }
        // mouth: lips, corners, line, teeth
        const mx = ax / (0.0235 * wsx), mm = face.mouth, lift = (mm === 'smile' ? 0.0055 : mm === 'grin' ? 0.007 : mm === 'frown' ? -0.005 : 0) * mx * mx * hs;
        const my = (y - mouthY - lift) / hs;
        if (mx < 1.08) {
          const upper = my > 0 && my < 0.0085 * (1 - 0.35 * mx) * (1 - 0.25 * g2(mx, 0.15)), lower = my <= 0 && my > -0.0125 * (1 - 0.55 * mx * mx);
          if (upper || lower) {
            let lc = mix(faceLips, skinDark, my > 0 ? 0.1 : 0);
            lc = mix(lc, mul(faceLips, 1.25), my < 0 ? 0.4 * g2(my + 0.005, 0.004) : 0);
            c = mix(c, lc, 0.94 * (1 - sst(0.88, 1.08, mx)));
          }
          if (mm === 'grin' && Math.abs(my) < 0.0035 * (1 - mx * mx) && mx < 0.8) c = [238, 234, 226];
          c = mix(c, lipDark, 0.8 * g2(my, 0.0014) * (1 - sst(0.92, 1.08, mx)));
          c = mix(c, skinDark, 0.18 * g2(my + 0.017, 0.006) * (1 - mx));                                                     // chin shadow under the lip
        }
        // beard, moustache, stubble
        const beardZone = (face.beard ? 1 : 0) * sst(0.075, 0.062, ax) * sst(mouthY + 0.05, mouthY + 0.02, y) * sst(lm.chinY - 0.04, lm.chinY + 0.008, y) * (1 - 0.95 * (my > -0.011 && my < 0.012 && mx < 0.95 ? 1 : 0));
        const stach = ((face.mustache || face.beard) ? 1 : 0) * sst(0.036, 0.025, ax) * sst(mouthY + 0.004, mouthY + 0.014, y) * sst(noseY - 0.004, noseY - 0.016, y);
        const stub = face.stubble ? 0.4 * sst(0.07, 0.055, ax) * sst(mouthY + 0.045, mouthY + 0.01, y) * (0.6 + 0.8 * rnd(q * 3 + 1)) : 0;
        c = mix(c, mul(hairC, 0.9), Math.min(0.93, Math.max(beardZone * 0.9, stach * 0.9, stub)));
        // age: forehead lines, crow's feet
        if (old) {
          c = mix(c, skinDark, 0.1 * Math.max(0, Math.sin(y * 330)) * sst(lm.eyeY + 0.03, lm.eyeY + 0.05, y) * sst(lm.eyeY + 0.085, lm.eyeY + 0.06, y));
          c = mix(c, skinDark, 0.14 * g2(ex - 0.034 * wsx, 0.008) * g2(y - (lm.eyeY - 0.004), 0.011));
          c = mix(c, [205, 205, 205], 0.12 * g2(y - (mouthY + 0.03), 0.006));
        }
        // glasses
        if (face.glasses) {
          const gr = Math.hypot(ex / 1.05, (y - lm.eyeY - 0.001) / hs), gc = rgb(face.glasses);
          c = mix(c, gc, Math.min(0.95, 1.2 * g2(gr - 0.0245, 0.0017)) + (ax < 0.0095 && Math.abs(y - lm.eyeY - 0.006) < 0.0017 ? 0.9 : 0));
          if (gr < 0.0245) c = mix(c, [120, 150, 170], 0.1);
        }
        // surgical mask
        if (face.mask) {
          const edge = sst(0.085, 0.07, ax) * sst(lm.eyeY - 0.016, lm.eyeY - 0.024, y) * sst(lm.chinY - 0.012, lm.chinY + 0.004, y);
          if (edge > 0.4) c = mix(c, mix([196, 226, 238], [150, 190, 208], 0.3 * Math.max(0, Math.sin(y * 330))), 0.96);
        }
      } else if (face.glasses && ax > 0.074 && ax < 0.1 && Math.abs(y - lm.eyeY - 0.001) < 0.0022 && fz > -0.35) c = mix(c, rgb(face.glasses), 0.85);   // temple arms
      if (face.mask && fz > -0.5 && ax > 0.075 && Math.abs(y - (lm.eyeY - 0.04)) < 0.003 + 0.016 * sst(0.1, 0.02, fz)) c = mix(c, [190, 220, 232], 0.8);
      // ears
      c = mix(c, mix(skin, [210, 100, 95], 0.4), 0.2 * sst(0.075, 0.085, ax) * g2(y - (lm.eyeY - 0.025), 0.03));
      // hair on the skull (the volume itself is geometry): above the hairline in front, down to the nape behind
      if (s.hair !== 'bald' || s.hat === 'cap') {
        const back = sst(0.1, -0.35, fz), side2 = sst(0.05, 0.085, ax);
        const hairline = lm.chinY + (lm.crownY - lm.chinY) * (0.77 - 0.2 * side2 - 0.45 * back);
        const hl = hairline + 0.005 * Math.sin(x * 90 + 1);
        const stylelift = s.hair === 'fade' ? 0.06 * (side2 + back * 0.8) : 0;
        if (s.hair !== 'bald' && y > hl + stylelift) {
          const strand = 0.5 + 0.5 * Math.sin(x * 330 + z * 260 + y * 40);
          const edge = sst(hl + stylelift, hl + stylelift + 0.012, y);
          let hc = mix(hairC, mul(hairC, 0.6), 0.5 * strand);
          hc = mix(hc, mix(hairC, [255, 255, 255], 0.22), 0.4 * sst(0.4, 1, ny) * (1 - strand));
          c = mix(c, hc, edge * 0.97);
          if (s.hair === 'fade') c = mix(c, hairC, 0.55 * (1 - edge));
        }
      }
      if (hatSkullOnly && y > lm.crownY - 0.05 && ax < 0.075) c = mix(c, rgb(s.hatColor), 0.95 * sst(lm.crownY - 0.05, lm.crownY - 0.042, y));
      return mul(c, 1 + nz2 * 0.03);
    }
    // ------------------------------------------------------------------ body: layers (skin, shoe, bottom, top) with soft edges
    const arm = wa > 0.5, leg = wl > 0.5, eps = 0.0035;
    const hand = arm && y < wrY - 0.002;
    const front = (zz: number): number => sst(-0.045, -0.11, zz);
    const fr0 = front(z), cdip = k === 'scrubs' ? 0.075 : k === 'blouse' ? 0.04 : k === 'dress' ? 0.045 : k === 'uniform' ? 0.02 : k === 'jersey' ? 0.04 : k === 'tee' ? 0.032 : 0.008;
    const neckY = (k === 'hoodie' || k === 'puffer' || k === 'tracksuit' || k === 'jacket' ? 1.512 : 1.498) - cdip * fr0 * (1 - sst(0.04, 0.1, ax)) + (open && fr0 > 0.3 ? -0.05 * (1 - sst(0.0, 0.09, ax)) : 0) + 0.03 * sst(0.05, 0.1, ax) + 0.004 * Math.sin(x * 60);
    let aTop = 0, aBot = 0, aShoe = 0;
    if (arm) { aTop = sleeves === 'none' || outerArms === null || hand ? 0 : sst(sleeveEnd - eps, sleeveEnd + eps, y); }
    else if (leg) {
      if (k !== 'dress') aTop = sst(hemTop - eps, hemTop + eps, y);               // a jacket or hoodie hem hangs over the top of the thighs: one level line whatever the bone weights say
      aBot = bot.kind === 'skirt' ? 0 : sst(hemBot - eps, hemBot + eps, y) * sst(shoeTop - 0.03, shoeTop - 0.012, y);
      aShoe = sst(shoeTop + eps, shoeTop - eps, y);
    } else {
      const aNeck = sst(neckY + eps, neckY - eps, y);
      aTop = aNeck * sst(hemTop - eps, hemTop + eps, y) * (sleeves === 'none' && k !== 'jersey' ? 1 - sst(shX * 0.8 - 0.004, shX * 0.8 + 0.004, ax) * sst(shY - 0.03, shY - 0.012, y) : 1);
      aBot = aNeck;
    }
    const clothCol = (cloth: number, fabric: RGB, kindTop: boolean): RGB => {
    // ------------------------------------------------------------------ cloth: fabric, pattern, details, folds
    let f: RGB = fabric;
    const U = theta * 0.17;                                // cloth coordinate round the body
    if (kindTop && cloth === 1) {
      const p = top.pattern ?? 'none';
      if (p === 'plaid') { const a = 0.5 + 0.5 * Math.sin(U * 130 + 1), b2 = 0.5 + 0.5 * Math.sin(y * 130); f = mix(f, trimC, 0.3 * a * a + 0.25 * b2 * b2); f = mix(f, mul(f, 0.7), 0.5 * a * b2); }
      else if (p === 'stripe') f = mix(f, trimC, 0.7 * sst(0.55, 0.62, 0.5 + 0.5 * Math.sin(y * 150)));
      else if (p === 'check') f = mix(f, trimC, 0.65 * ((Math.floor(U / 0.026) + Math.floor(y / 0.026)) & 1));
      else if (p === 'heather') f = mix(f, mix(f, [255, 255, 255], 0.3), 0.5 * rnd(q * 7 + 3));
      else if (p === 'block') f = y > shY - 0.11 || (arm && y > elY + 0.02) ? f : trimC;
      if (top.print === 'stripes' && !arm && Math.abs(y - (shY - 0.19)) < 0.012) f = rgb(top.printColor);
      if (top.print === 'bars' && !arm && Math.abs(y - (shY - 0.17)) < 0.009 + 0.011 * (Math.sin(U * 40) > 0 ? 1 : 0)) f = rgb(top.printColor);
      if (k === 'tracksuit' && Math.abs(nx * side) > 0.78) f = mix(f, trimC, 0.9 * sst(0.78, 0.84, Math.abs(nx * side)) * (arm || !arm ? 1 : 0));
      if (k === 'vest') {                                    // hi-vis: reflective bands round the waist and over each shoulder
        if (!arm && (Math.abs(y - (hemTop + 0.12)) < 0.018 || (ax > 0.03 && ax < 0.06 && y > hemTop + 0.17 && front(z) > 0.5))) f = rgb(top.trim);
      }
      if (k === 'uniform' && y > shY - 0.025 && ax > shX * 0.55 && ax < shX + 0.01 && !arm) f = mix(f, trimC, 0.6);   // epaulettes
      if (k === 'apron' && !arm && (z > torsoZ + 0.02 || y > shY - 0.1 && false)) f = underC ?? f;
      if (open && underC && !arm && front(z) > 0.15) {
        const w = 0.052 - 0.1 * Math.max(0, hemTop + 0.3 - y) * 0.15;
        if (ax < w) f = y > shY - 0.02 ? mix(skin, skinDark, 0.1) : y > hemTop + 0.08 ? underC : botC;   // the shirt under an open jacket ends at the waist
        else if (ax < w + 0.007) f = mul(f, 0.62);        // lapel edge
      }
      if (zipped && !arm && ax < 0.0034 && front(z) > 0.3) f = mix(f, [210, 205, 196], 0.7);
      if (k === 'uniform' && !arm) {
        if (top.tie && ax < 0.011 * (1 + 0.5 * sst(shY - 0.1, shY - 0.25, y)) && y < shY + 0.02 && y > shY - 0.3 && front(z) > 0.5) f = rgb(top.tie);
        const bx = x + 0.075, by = y - (shY - 0.14);
        if (bx * bx + by * by * 1.4 < 0.0004 && front(z) > 0.5) f = [214, 188, 90];       // a plain badge plate
      }
      if ((k === 'blouse' || k === 'uniform' || k === 'scrubs') && ax < 0.002 && front(z) > 0.5 && y > hemTop && underC === null && Math.sin(y * 150) > 0.9) f = mul(f, 0.7);
    } else if (!kindTop) {
      // trousers, jeans, shorts, leggings, sweats, cargo
      const outer = Math.abs(nx) > 0.7 && (nx * side) > 0;
      if (bot.kind === 'jeans') {
        f = mix(f, mul(f, 1.25), 0.3 * Math.max(0, Math.sin((y + U * 0.05) * 420 + x * 280)) * 0.5);                        // twill
        f = mix(f, mix(f, [220, 230, 245], 0.3), 0.3 * g2(y - (knY + 0.14), 0.1));              // worn thigh
        if (outer || (!leg && ax > hipX + 0.03)) f = mix(f, [190, 160, 96], 0.3 * g2((Math.abs(nx) - 0.985) * 16, 0.5));      // top stitching
        if (!leg && y < hemTop - 0.005 && front(z) > 0.2 && Math.abs(ax - 0.08) < 0.012 && y > hemTop - 0.1) f = mul(f, 0.75);   // pocket edge
      }
      if (bot.kind === 'trousers' && leg && nz < -0.5 && ax > hipX - 0.012 && ax < hipX + 0.012) f = mix(f, mul(f, 0.8), 0.5);   // crease
      if (bot.kind === 'cargo' && leg && outer && y > knY + 0.1 && y < knY + 0.25) f = mul(f, 0.88 + 0.12 * sst(0.1, 0.12, Math.min(y - knY - 0.1, knY + 0.25 - y)));                            // pocket flap
      if (bot.kind === 'sweats' || bot.kind === 'cargo') if (leg && y < anY + 0.1) f = mix(f, botTrim, 0.85 * sst(anY + 0.1, anY + 0.07, y));
      if (bot.kind === 'sweats' && Math.abs(nx * side) > 0.8 && !hand) f = mix(f, botTrim, 0.55 * sst(0.78, 0.86, Math.abs(nx * side)));
      if (!leg && y > hemTop - 0.025 && y < hemTop + 0.003) f = mul(botTrim, 0.7);                                               // belt / waistband under the top
    }
    // cuffs and hems: ribbed band, a little darker
    const edge = (d: number): number => sst(0.034, 0.018, d);
    if (cloth === 1) {
      const rib = k === 'hoodie' || k === 'puffer' || k === 'tracksuit' || k === 'jersey' && false;
      if (arm && sleeves !== 'none') { const d = y - sleeveEnd; if (d < 0.034 && sleeves === 'long') f = mix(f, rib ? mul(trimC, 0.95) : mul(f, 0.82), edge(d) * 0.9 * (rib ? 1 : 0.6)) ; else if (d < 0.02 && sleeves === 'short') f = mix(f, mul(f, 0.8), edge(d)); }
      if (!arm && !leg) { const d = y - hemTop; if (d < 0.04 && k !== 'dress') f = mix(f, rib ? mul(trimC, 0.9) : mul(f, 0.84), edge(d) * 0.9); }
      const dn = 1.505 - y;       // collar band
      if (!arm && !leg && dn < 0.014 && y > hemTop + 0.2) f = mix(f, k === 'tee' || k === 'jersey' ? mul(f, 0.8) : mul(trimC, 0.9), 0.75 * sst(0.018, 0.004, dn) * (k === 'hoodie' ? 0.4 : 1));
    }
    // folds, creases and soft shading, baked
    const joints = g2(y - elY, 0.05) * (arm ? 1 : 0) + g2(y - hemTop, 0.08) * (arm || leg ? 0 : 1) + g2(y - knY, 0.06) * (leg ? 1 : 0) + g2(y - (shY - 0.06), 0.05) * (arm ? 1 : 0.3) + g2(y - (hipX * 0 + b.rig.hipL[1] - 0.04), 0.06) * (leg ? 1 : 0);
    const fold = (0.5 + 0.5 * Math.sin(y * 110 + Math.sin(U * 11) * 1.8 + (leg ? Math.sin(z * 30) : 0))) * Math.min(1, joints);
    f = mul(f, 1 - 0.16 * fold * (k === 'puffer' ? 0.5 : 1));
    if (k === 'puffer' && cloth === 1) f = mul(f, 0.86 + 0.14 * Math.sin(y * 82 + 1.3) * 0.5 + 0.07);
    f = mul(f, (0.9 + 0.1 * ny) * (1 + nz2 * fabNoise));
    return f;
    };
    const skinCol = (): RGB => {
      const shade = 1 - 0.12 * sst(0.2, -0.9, ny);
      let c = mix(skin, skinDark, 0.12 * g2(y - (lm.chinY - 0.045), 0.03) * sst(0.0, -0.2, nz));
      if (hand && y < wrY - 0.045) c = mix(c, skinDark, 0.2 * Math.max(0, Math.sin((x * side) * 340 + 0.5)) * sst(wrY - 0.05, wrY - 0.09, y));   // finger separation on the back of the hand
      if (leg && y < shoeTop + 0.035 && y > shoeTop - 0.02) c = mix(c, [236, 236, 236], 0.9 * sst(shoeTop - 0.02, shoeTop - 0.012, y));          // sock
      return mul(c, shade * (1 + nz2 * 0.025));
    };
    const shoeCol = (): RGB => {
      let sc = shoeC;
      const toe = sst(-0.115, -0.15, z), shadeS = 0.9 + 0.1 * ny;
      sc = mix(sc, mul(sc, 0.8), 0.5 * sst(anY - 0.01, anY - 0.05, y));
      sc = mix(sc, mix(sc, [255, 255, 255], 0.28), 0.5 * toe * sst(0.06, 0.02, y));
      if (y < 0.024 + 0.004 * Math.sin(z * 90) || ny < -0.55) return mul(mix(sole, mul(sole, 0.85), 0.4 * (0.5 + 0.5 * Math.sin(z * 200))), 0.95 + nz2 * 0.05);
      if (y < 0.034) sc = mix(sc, sole, 0.7);
      const lz = (z + 0.075) / 0.05;
      if (ny > 0.2 && lz > 0 && lz < 1.6 && Math.abs(Math.sin(lz * Math.PI * 4)) < 0.28) sc = mix(sc, mix(sc, [255, 255, 255], 0.7), 0.7);          // laces
      if (Math.abs(nx) > 0.65 && Math.abs(y - (0.05 + 0.02 * (z + 0.05))) < 0.0065) sc = mix(sc, accC, 0.9);                                       // accent stripe
      return mul(sc, shadeS * (1 + nz2 * 0.03));
    };
    let out: RGB = skinCol();
    if (aShoe > 0) out = mix(out, shoeCol(), aShoe);
    if (aBot > 0) out = mix(out, clothCol(2, botC, false), aBot);
    if (aTop > 0) out = mix(out, clothCol(1, arm || leg || true ? (arm ? (outerArms ?? topC) : topC) : topC, true), aTop);
    return out;
  };
  function front(z: number): number { return sst(-0.045, -0.11, z); }
}

export interface BakeResult { canvas: HTMLCanvasElement | OffscreenCanvas }

/** bake the whole colour map of a person */
export function bakeSkin(b: BakeInput, size = SK_ATLAS): HTMLCanvasElement {
  rasterise(b, size);
  const shader = makeShader(b);
  const img = new Uint8ClampedArray(size * size * 4), filled = new Uint8Array(size * size), sk = rgb(b.spec.skin);
  for (let q = 0; q < size * size; q++) { img[q * 4] = sk[0]; img[q * 4 + 1] = sk[1]; img[q * 4 + 2] = sk[2]; img[q * 4 + 3] = 255; }
  for (let q = 0; q < size * size; q++) {
    if (!cover[q]) continue;
    const c = shader(posMap[q * 3], posMap[q * 3 + 1], posMap[q * 3 + 2], nrmMap[q * 3], nrmMap[q * 3 + 1], nrmMap[q * 3 + 2], wMap[q * 4], wMap[q * 4 + 1], wMap[q * 4 + 2], wMap[q * 4 + 3], q);
    img[q * 4] = c[0]; img[q * 4 + 1] = c[1]; img[q * 4 + 2] = c[2]; img[q * 4 + 3] = 255; filled[q] = 1;
  }
  // pad the charts outward so filtering and mip levels never pull in the background
  for (let pass = 0; pass < 4; pass++) {
    const add: number[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const q = y * size + x;
      if (filled[q]) continue;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const o = yy * size + xx; if (!filled[o]) continue;
        r += img[o * 4]; g += img[o * 4 + 1]; bl += img[o * 4 + 2]; n++;
      }
      if (n) add.push(q, r / n, g / n, bl / n);
    }
    for (let i = 0; i < add.length; i += 4) { const q = add[i]; img[q * 4] = add[i + 1]; img[q * 4 + 1] = add[i + 2]; img[q * 4 + 2] = add[i + 3]; img[q * 4 + 3] = 255; filled[q] = 1; }
  }
  const canvas = createCanvas(size, size) as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(img, size, size), 0, 0);
  paintBand(ctx, b.spec, size / SK_ATLAS);
  return canvas;
}

/** swatches for the extra volumes: hair strands, hat cloth, bag, the top's and the bottom's fabric (hood, coat hem, skirt) */
function paintBand(ctx: CanvasRenderingContext2D, s: PedSpec, k: number): void {
  const R = (r: PxRect): [number, number, number, number] => [r.x * k, r.y * k, r.w * k, r.h * k];
  ctx.fillStyle = '#808080'; ctx.fillRect(256 * k, 0, 256 * k, 128 * k);
  const grad = (r: PxRect, top: RGB, bot: RGB): void => { const [x, y, w, h] = R(r); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, css(top)); g.addColorStop(1, css(bot)); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); };
  const streaks = (r: PxRect, c: RGB, n: number, seed: string, dark = 0.4, lightK = 0.3): void => {
    const [x, y, w, h] = R(r);
    for (let i = 0; i < n; i++) { const t = hash(seed + i), xx = x + t * w, tone = hash(seed + 's' + i); ctx.fillStyle = css(tone < 0.5 ? mul(c, 1 - dark * tone * 2) : mix(c, [255, 255, 255], lightK * (tone - 0.5) * 2)); ctx.globalAlpha = 0.5; ctx.fillRect(xx, y, Math.max(1, 1.4 * k), h); }
    ctx.globalAlpha = 1;
  };
  // hair: root shadow at the bottom end of the loft (the scalp), a sheen band, strands
  const hair = rgb(s.hairColor);
  grad(SK_RECTS.hair, mix(hair, [255, 255, 255], 0.1), mul(hair, 0.7));
  streaks(SK_RECTS.hair, hair, 46, s.id + 'h');
  { const [x, y, w, h] = R(SK_RECTS.hair); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.16)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); }
  // hat
  const hat = rgb(s.hatColor), trim = rgb(s.hatTrim);
  grad(SK_RECTS.hat, mix(hat, [255, 255, 255], 0.08), mul(hat, 0.82));
  { const [x, y, w, h] = R(SK_RECTS.hat); ctx.fillStyle = css(trim); ctx.globalAlpha = s.hat === 'cop' || s.hat === 'cap' || s.hat === 'fedora' || s.hat === 'church' ? 0.95 : 0; ctx.fillRect(x, y + h * 0.88, w, h * 0.06); ctx.globalAlpha = 1;
    if (s.hat === 'cop') { ctx.fillStyle = 'rgb(214,188,90)'; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.52, w * 0.07, h * 0.1, 0, 0, Math.PI * 2); ctx.fill(); } }
  streaks(SK_RECTS.hat, hat, 18, s.id + 'a', 0.25, 0.15);
  // gear
  const gear = rgb(s.gearColor);
  grad(SK_RECTS.gear, mix(gear, [255, 255, 255], 0.1), mul(gear, 0.75));
  { const [x, y, w, h] = R(SK_RECTS.gear); ctx.strokeStyle = css(mul(gear, 0.6)); ctx.lineWidth = 1.2 * k; ctx.setLineDash([3 * k, 2 * k]); ctx.strokeRect(x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k); ctx.setLineDash([]); }
  // shoe: u runs round the cross-section (0 = middle of the sole, 0.5 = the top), v along the foot from the toe to the heel
  { const [x, y, w, h] = R(SK_RECTS.shoe), up = rgb(s.shoes.color), so = rgb(s.shoes.sole), ac = rgb(s.shoes.accent);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, css(mix(up, [255, 255, 255], 0.16))); g.addColorStop(0.7, css(up)); g.addColorStop(1, css(mul(up, 0.82))); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = css(so); ctx.fillRect(x, y, w * 0.13, h); ctx.fillRect(x + w * 0.87, y, w * 0.13, h);                                    // the sole, both sides of u = 0
    ctx.fillStyle = css(mul(so, 0.8)); ctx.fillRect(x + w * 0.13, y, w * 0.02, h); ctx.fillRect(x + w * 0.85, y, w * 0.02, h);
    ctx.fillStyle = css(ac); for (const u of [0.26, 0.74]) ctx.fillRect(x + w * (u - 0.025), y + h * 0.36, w * 0.05, h * 0.34);               // accent stripe on the sides
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 5; i++) ctx.fillRect(x + w * 0.42, y + h * (0.3 + i * 0.09), w * 0.16, Math.max(1, 2 * k)); // laces over the instep
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x + w * 0.15, y, w * 0.7, h * 0.22);                                                // toe cap
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + w * 0.15, y + h * 0.88, w * 0.7, h * 0.12); }
  // top fabric (hood roll, coat hem) and bottom fabric (skirt)
  const topC = rgb(s.top.color), botC = rgb(s.bottom.color);
  grad(SK_RECTS.torso, mix(topC, [255, 255, 255], 0.04), mul(topC, 0.92));
  streaks(SK_RECTS.torso, topC, 10, s.id + 't', 0.3, 0.1);
  grad(SK_RECTS.pelvis, mix(botC, [255, 255, 255], 0.06), mul(botC, 0.8));
  { const [x, y, w, h] = R(SK_RECTS.pelvis); for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x + (i + 0.5) * w / 6, y, Math.max(1, k), h); } }
}
