import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { auxSpeckle, blotches, crack, fitFont, gray, hsl, sootStreak, speckle, withAlpha, wrapVariant } from './util';

/*
 * Ground surfaces: asphalt, concrete sidewalk, crosswalk, roof, bluestone flags, granite curb, manhole, storm grate.
 * World scale of each tile (so UV authors can pick repeats; RoadBuilder follows this table):
 *   asphalt 512px   = 3 m x 3 m   (one travel lane wide: wheel tracks at u 0.25 / 0.75, oil drips down u 0.5)
 *   concrete 512px  = 3 m x 3 m   (2 x 2 slabs of 1.5 m ~ 5 ft)
 *   bluestone 512px = 2.7 m (u) x 3 m (v): 3 flags of ~0.9 m across, 2 courses of 1.5 m
 *   granite 256px   = 0.4 m (u, along the curb) x ~0.19 m (v: curb height / 0.78, v = 1 at the top of the curb)
 *   crosswalk 256px = 4 m (u, along the walking direction, 4 bars at 1 m pitch) x the crosswalk width (v, one repeat)
 *   manhole 256px   = square around a disc: the disc UV (0..1 across the cylinder cap) maps to the circle in the tile
 *   grate 256px     = stretched over a 0.9 m x 0.5 m inlet (bars run along v)
 */

type Ctx = CanvasRenderingContext2D;
type RGB = readonly [number, number, number];

const rgb = (r: number, g: number, b: number): string => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/** Linear blend of two colours with an optional brightness jitter. */
function mixRgb(a: RGB, b: RGB, t: number, jitter = 0): string {
  return rgb(a[0] + (b[0] - a[0]) * t + jitter, a[1] + (b[1] - a[1]) * t + jitter, a[2] + (b[2] - a[2]) * t + jitter);
}

function disc(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function oval(c: Ctx, x: number, y: number, rx: number, ry: number): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

function ringStroke(c: Ctx, x: number, y: number, r: number, lw: number, color: string): void {
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
}

function polyFill(c: Ctx, pts: readonly number[]): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
}

/** Scatter small squares inside a rectangle only (the shared `speckle` covers the whole tile). */
function speckleIn(
  c: Ctx, rng: Rng, x: number, y: number, rw: number, rh: number,
  count: number, colors: readonly string[], minS: number, maxS: number, alpha = 1,
): void {
  c.save();
  c.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    const s = rng.range(minS, maxS);
    c.fillRect(x + rng.range(0, Math.max(0, rw - s)), y + rng.range(0, Math.max(0, rh - s)), s, s);
  }
  c.restore();
}

/** Jittered polyline from (x0,y0) to (x1,y1) stroked once. */
function wobbleLine(
  c: Ctx, rng: Rng, x0: number, y0: number, x1: number, y1: number, steps: number, amp: number, color: string, lw: number,
): void {
  const horizontal = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const j = i === steps ? 0 : rng.range(-amp, amp);
    c.lineTo(x0 + (x1 - x0) * t + (horizontal ? 0 : j), y0 + (y1 - y0) * t + (horizontal ? j : 0));
  }
  c.stroke();
  c.restore();
}

/**
 * Alligator (fatigue) cracking: a jittered grid of vertices joined into polygon-ish cells, drawn as one path per layer.
 * `layers` are the colour canvas and optional relief canvases.
 */
function alligator(
  layers: readonly { ctx: Ctx; color: string; width: number }[], rng: Rng,
  x0: number, y0: number, aw: number, ah: number, cell: number,
): void {
  const nx = Math.ceil(aw / cell) + 1;
  const ny = Math.ceil(ah / cell) + 1;
  const pts: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      pts.push(x0 + i * cell + rng.range(-0.36, 0.36) * cell, y0 + j * cell + rng.range(-0.36, 0.36) * cell);
    }
  }
  const segs: number[] = [];
  const at = (i: number, j: number): [number, number] => [pts[(j * nx + i) * 2], pts[(j * nx + i) * 2 + 1]];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      const keep = edge ? 0.6 : 0.93;
      const [px, py] = at(i, j);
      if (i < nx - 1 && rng.chance(keep)) { const [qx, qy] = at(i + 1, j); segs.push(px, py, qx, qy); }
      if (j < ny - 1 && rng.chance(keep)) { const [qx, qy] = at(i, j + 1); segs.push(px, py, qx, qy); }
      if (i < nx - 1 && j < ny - 1 && rng.chance(0.22)) { const [qx, qy] = at(i + 1, j + 1); segs.push(px, py, qx, qy); }
    }
  }
  for (const l of layers) {
    l.ctx.save();
    l.ctx.strokeStyle = l.color;
    l.ctx.lineWidth = l.width;
    l.ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      l.ctx.moveTo(segs[i], segs[i + 1]);
      l.ctx.lineTo(segs[i + 2], segs[i + 3]);
    }
    l.ctx.stroke();
    l.ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------- asphalt

/**
 * 512px = 3 m (one lane wide). Variant 0 newer asphalt: dark grey, fine aggregate, faint paver seams, a few thin cracks.
 * Variant 1 worn: lighter grey, alligator cracking in the wheel tracks (u 0.25 / 0.75), tyre-polish bands, crisp darker
 * repair patches (plus a utility trench), oil drips along the lane centre (u 0.5).
 * Relief: cracks recessed, patches raised ~1-2 cm; roughness: patches / oil / polish smoother, cracks rougher.
 */
export const asphaltPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const worn = wrapVariant(variant, 2) === 1;
  const H = aux?.height;
  const R = aux?.rough ?? null;
  ctx.fillStyle = worn ? '#57595d' : '#33353a';
  ctx.fillRect(0, 0, w, h);
  if (H) {
    H.fillStyle = gray(128);
    H.fillRect(0, 0, w, h);
    if (R) {
      R.fillStyle = gray(worn ? 228 : 236);
      R.fillRect(0, 0, w, h);
    }
  }
  speckle(ctx, w, h, rng, worn ? 7000 : 6000,
    worn ? ['#6c6e72', '#48494d', '#7e8084', '#3e3f43'] : ['#44464b', '#26282c', '#52545a', '#1e2024'], 1, 2.5, 0.7);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 6000, [92, 110, 150, 168], 1, 2.5, 0.55);
  blotches(ctx, w, h, rng, worn ? 24 : 10, worn ? '#2a2b2e' : '#1c1d20', 0.12, 20, 70,
    R ? { ctx: R, color: gray(170) } : null);

  // tyre-polish bands in the wheel tracks: soft-edged vertical strips (nested rects), darker and smoother
  if (worn) {
    for (const cx of [0.25, 0.75]) {
      for (const [wd, a] of [[0.16, 0.025], [0.12, 0.03], [0.08, 0.035]] as const) {
        withAlpha(ctx, a, () => {
          ctx.fillStyle = '#000000';
          ctx.fillRect(w * (cx - wd / 2), 0, w * wd, h);
        });
        if (R) {
          withAlpha(R, 0.22, () => {
            R.fillStyle = gray(150);
            R.fillRect(w * (cx - wd / 2), 0, w * wd, h);
          });
        }
      }
    }
  }

  // newer asphalt: a paver joint along the tile edge and a faint cold joint across
  if (!worn) {
    wobbleLine(ctx, rng, 1, 0, 1, h, 14, 1.5, 'rgba(0,0,0,0.38)', 2);
    wobbleLine(ctx, rng, 3.5, 0, 3.5, h, 14, 1.5, 'rgba(255,255,255,0.06)', 1.5);
    const cy = rng.range(0.25, 0.75) * h;
    wobbleLine(ctx, rng, 0, cy, w, cy, 24, 2.2, 'rgba(0,0,0,0.17)', 1.2);
    if (H) {
      H.strokeStyle = gray(104);
      H.lineWidth = 2.5;
      H.beginPath();
      H.moveTo(1, 0);
      H.lineTo(1, h);
      H.stroke();
    }
  }

  // alligator cracking inside the wheel tracks
  if (worn) {
    for (const cx of [0.25, 0.75]) {
      const aw = rng.range(70, 100);
      const ah = rng.range(150, 240);
      alligator(
        [
          { ctx, color: 'rgba(8,8,10,0.62)', width: 1.2 },
          ...(H ? [{ ctx: H, color: gray(34), width: 2 }] : []),
          ...(R ? [{ ctx: R, color: gray(255), width: 2 }] : []),
        ],
        rng, w * cx - aw / 2, rng.range(0, h - ah), aw, ah, rng.range(9, 13),
      );
    }
  }

  // cracks (drawn under patches)
  const cracks = worn ? 12 : 4;
  for (let i = 0; i < cracks; i++) {
    const cw = worn ? rng.range(1, 2.2) : rng.range(0.7, 1.3);
    const mirrors = [
      ...(H ? [{ ctx: H, color: gray(18), width: cw * 1.6 }] : []),
      ...(R ? [{ ctx: R, color: gray(255), width: cw * 2 }] : []),
    ];
    crack(ctx, rng, rng.range(0, w), rng.range(0, h), rng.int(10, 26), rng.range(6, 14),
      worn ? 'rgba(8,8,10,0.75)' : 'rgba(8,8,10,0.5)', cw, mirrors);
  }

  // patches: crisp-edged rectangles, raised 1-2 cm; the worn tile also gets a long narrow utility trench
  const patches: { x: number; y: number; pw: number; ph: number }[] = [];
  const nPatches = worn ? 4 : 1;
  for (let i = 0; i < nPatches; i++) {
    const pw = rng.range(50, 140);
    const ph = rng.range(30, 90);
    patches.push({ x: rng.range(0, w - pw), y: rng.range(0, h - ph), pw, ph });
  }
  if (worn) {
    const tw = rng.range(24, 34);
    const th = rng.range(190, 280);
    patches.push({ x: rng.range(0, w - tw), y: rng.range(0, h - th), pw: tw, ph: th });
  }
  for (const { x: px, y: py, pw, ph } of patches) {
    ctx.fillStyle = hsl(220, 4, worn ? rng.range(23, 31) : rng.range(15, 20));
    ctx.fillRect(px, py, pw, ph);
    speckleIn(ctx, rng, px, py, pw, ph, Math.round((pw * ph) / 35), ['#494b50', '#17181b', '#3a3c40'], 1, 2.2, 0.6);
    ctx.strokeStyle = '#17181b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, pw, ph);
    withAlpha(ctx, 0.3, () => {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 2.5, py - 2.5, pw + 5, ph + 5);
    });
    if (H) {
      H.fillStyle = gray(rng.range(150, 158));
      H.fillRect(px, py, pw, ph);
      H.strokeStyle = gray(66);
      H.lineWidth = 2.5;
      H.strokeRect(px, py, pw, ph);
      if (R) {
        R.fillStyle = gray(165);
        R.fillRect(px, py, pw, ph);
      }
    }
  }

  // oil drips: dark soft ovals stacked down the lane centre
  const stains = worn ? 8 : 2;
  for (let i = 0; i < stains; i++) {
    const sx = w * 0.5 + rng.range(-0.045, 0.045) * w;
    const sy = rng.range(0, h);
    const ry = rng.range(14, 38);
    const rx = rng.range(5, 12);
    for (const [sc, a] of [[1, 0.16], [0.66, 0.2], [0.36, 0.24]] as const) {
      withAlpha(ctx, worn ? a : a * 0.6, () => {
        ctx.fillStyle = '#050507';
        oval(ctx, sx, sy, rx * sc, ry * sc);
      });
      if (R) {
        withAlpha(R, 0.35, () => {
          R.fillStyle = gray(110);
          oval(R, sx, sy, rx * sc, ry * sc);
        });
      }
    }
    for (let d = 0; d < 3; d++) {
      withAlpha(ctx, 0.35, () => {
        ctx.fillStyle = '#060608';
        disc(ctx, sx + rng.range(-16, 16), sy + rng.range(-ry, ry) * 1.3, rng.range(1.2, 3));
      });
    }
  }
};

// ---------------------------------------------------------------------------------------------- concrete

/**
 * 512px tile = 3 m: 2x2 slabs (1.5 m ~ 5 ft). All constants scale with w/256 so any size works.
 * Variant 0 sidewalk: light, saw-cut joints, the tile's left edge is an asphalt-filled expansion joint, broom-finish
 * striations, ~10 gum spots, rust drips near the top edge and a tar-sealed crack.
 * Variant 1 backyard / paving: darker, rougher, algae growing in the slab corners and along the joints.
 * Relief: joints recessed, crowned slabs, pebbly surface; gum raised; tar smooth.
 */
export const concretePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const dark = wrapVariant(variant, 2) === 1;
  const k = w / 256;
  const kk = k * k;
  const slab = w / 2;
  const H = aux?.height;
  const R = aux?.rough ?? null;
  ctx.fillStyle = dark ? '#5d5c58' : '#a9a7a0';
  ctx.fillRect(0, 0, w, h);
  if (H) {
    H.fillStyle = gray(30);
    H.fillRect(0, 0, w, h);
  }
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      ctx.fillStyle = hsl(40, 4, (dark ? 36 : 66) + rng.range(-3, 3));
      ctx.fillRect(sx * slab + 2 * k, sy * slab + 2 * k, slab - 4 * k, slab - 4 * k);
      if (H) {
        H.fillStyle = gray(120);
        H.fillRect(sx * slab + 2 * k, sy * slab + 2 * k, slab - 4 * k, slab - 4 * k);
        H.fillStyle = gray(136);
        H.fillRect(sx * slab + 5 * k, sy * slab + 5 * k, slab - 10 * k, slab - 10 * k);
      }
    }
  }
  speckle(ctx, w, h, rng, Math.round((dark ? 3000 : 2500) * kk),
    dark ? ['#3a3936', '#6c6b66', '#4a4945'] : ['#8a8881', '#c6c4bc', '#74726c'], 1, (dark ? 2.2 : 2) * k, dark ? 0.35 : 0.5);
  blotches(ctx, w, h, rng, dark ? 10 : 12, dark ? '#1a1916' : '#4b4338', 0.1, 6 * k, 26 * k);
  if (H) {
    auxSpeckle(H, aux!.rng, 0, 0, w, h, Math.round((dark ? 14000 : 9000) * kk), [105, 120, 150, 170], 1, (dark ? 3 : 2.2) * k, 0.55);
    auxSpeckle(H, aux!.rng, 0, 0, w, h, Math.round(900 * kk), [180, 190], 1.5 * k, 3 * k, 0.6);
  }

  if (!dark) {
    // broom finish: fine short striations across each slab (light / dark pairs)
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        for (let i = 0; i < 150; i++) {
          const len = rng.range(10, 46) * k;
          const x = sx * slab + 4 * k + rng.range(0, slab - 8 * k - len);
          const y = sy * slab + 4 * k + rng.range(0, slab - 8 * k);
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(40,36,30,0.11)';
          ctx.fillRect(x, y, len, Math.max(1, 0.5 * k));
          if (H && i % 3 === 0) {
            H.fillStyle = gray(i % 2 === 0 ? 142 : 124);
            H.fillRect(x, y, len, Math.max(1, 0.5 * k));
          }
        }
      }
    }
    // rust drips near the top edge (a tree guard / railing foot sat here)
    const rx = rng.range(0.12, 0.38) * w;
    withAlpha(ctx, 0.35, () => {
      ctx.fillStyle = '#8a4a24';
      oval(ctx, rx + 4 * k, 7 * k, 11 * k, 4 * k);
      ctx.fillStyle = '#5c2f16';
      oval(ctx, rx + 4 * k, 7 * k, 5 * k, 2 * k);
    });
    for (let i = 0; i < 5; i++) {
      sootStreak(ctx, rx + rng.range(-8, 16) * k, 5 * k, rng.range(1.2, 3) * k, rng.range(28, 90) * k, 0.5, '#8a4a24');
    }
    // gum spots: ~10 small dark grey discs with a pale halo
    for (let i = 0; i < 10; i++) {
      const gx = rng.range(0.04, 0.96) * w;
      const gy = rng.range(0.04, 0.96) * h;
      const gr = rng.range(1.2, 2.6) * k;
      withAlpha(ctx, 0.45, () => {
        ctx.fillStyle = 'rgb(128,125,118)';
        disc(ctx, gx, gy, gr * 1.5);
      });
      withAlpha(ctx, 0.9, () => {
        ctx.fillStyle = GUM;
        disc(ctx, gx, gy, gr);
      });
      if (H) {
        H.fillStyle = gray(150);
        disc(H, gx, gy, gr);
      }
    }
  } else {
    // algae: green discs in the slab corners (around each joint crossing) and thin growth along the joints
    for (const jx of [0, slab]) {
      for (const jy of [0, slab]) {
        for (let i = 0; i < 6; i++) {
          withAlpha(ctx, rng.range(0.16, 0.34), () => {
            ctx.fillStyle = hsl(rng.range(88, 112), rng.range(26, 40), rng.range(22, 34));
            disc(ctx, jx + rng.range(-24, 24) * k, jy + rng.range(-24, 24) * k, rng.range(5, 16) * k);
          });
        }
      }
    }
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = hsl(100, 34, 28);
      for (const j of [0, slab]) {
        for (let i = 0; i < 14; i++) {
          const t = rng.range(0, w);
          ctx.fillRect(j - 3 * k, t, 6 * k, rng.range(6, 20) * k);
          ctx.fillRect(t, j - 3 * k, rng.range(6, 20) * k, 6 * k);
        }
      }
    });
  }

  // saw-cut / contraction joints at the slab edges (tile edge and mid-line), lighter lip on the lit side
  ctx.fillStyle = dark ? '#1f1e1c' : '#5f5d57';
  ctx.fillRect(0, 0, w, 2 * k);
  ctx.fillRect(0, slab - k, w, 2 * k);
  ctx.fillRect(slab - k, 0, 2 * k, h);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2 * k, 2 * k, w, k);
  });
  // expansion joint on the tile's left edge: wider, asphalt-impregnated filler (half on each side so the tile wraps)
  ctx.fillStyle = dark ? '#171615' : '#34312d';
  ctx.fillRect(0, 0, 3 * k, h);
  ctx.fillRect(w - 3 * k, 0, 3 * k, h);
  if (H) {
    H.fillStyle = gray(22);
    H.fillRect(0, 0, w, 2.5 * k);
    H.fillRect(0, slab - 1.25 * k, w, 2.5 * k);
    H.fillRect(slab - 1.25 * k, 0, 2.5 * k, h);
    H.fillStyle = gray(36);
    H.fillRect(0, 0, 3.5 * k, h);
    H.fillRect(w - 3.5 * k, 0, 3.5 * k, h);
  }
  // spalled chips along the joints
  for (let i = 0; i < 14; i++) {
    const along = rng.range(0, w);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(60,57,50,0.55)' : 'rgba(190,188,180,0.5)';
    if (i % 4 < 2) ctx.fillRect(along, (i % 2 === 0 ? 0 : slab) + rng.range(-1, 3) * k, rng.range(3, 9) * k, rng.range(1.5, 3.5) * k);
    else ctx.fillRect((i % 2 === 0 ? slab : 0) + rng.range(-1, 3) * k, along, rng.range(1.5, 3.5) * k, rng.range(3, 9) * k);
  }

  if (!dark) {
    // a crack repaired with tar (smooth, slightly sunken) plus a couple of hairline cracks
    const tarW = 2 * k;
    crack(ctx, rng, rng.range(0.58, 0.8) * w, rng.range(0.1, 0.3) * h, 20, 7 * k, 'rgba(22,20,18,0.9)', tarW, [
      { ctx, color: 'rgba(80,76,70,0.45)', width: 0.7 * k },
      ...(H ? [{ ctx: H, color: gray(104), width: tarW * 1.2 }] : []),
      ...(R ? [{ ctx: R, color: gray(120), width: tarW * 1.2 }] : []),
    ]);
    for (let i = 0; i < 2; i++) {
      crack(ctx, rng, rng.range(0, w), rng.range(0, h), 8, 6 * k, 'rgba(48,45,40,0.55)', 0.7 * k,
        H ? [{ ctx: H, color: gray(92), width: k }] : undefined);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      crack(ctx, rng, rng.range(0, w), rng.range(0, h), 14, 8 * k, 'rgba(10,10,8,0.7)', 1.2 * k,
        H ? [{ ctx: H, color: gray(60), width: 2 * k }] : undefined);
    }
  }
};

/** Chewing-gum grey used by the sidewalk painter (exported so tests can count the discs). */
export const GUM = 'rgb(78,76,73)';

// ---------------------------------------------------------------------------------------------- crosswalk

/**
 * 256px: NYC ladder crosswalk. u (image x) runs along the walking direction and covers 4 m (four 0.5 m bars at 1 m
 * pitch), v (image y) covers the crosswalk width once, so the two long lines sit on the edges. Worn, flaking paint:
 * asphalt shows through in flecks, heavier in the wheel tracks (v ~0.25 / 0.75), with black tyre scuffs.
 */
export const crosswalkPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#383a3f';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 1500, ['#44464b', '#26282c'], 1, 2, 0.6);
  const pitch = w / 4;
  const bar = pitch / 2;
  const rail = h * 0.075;
  const inset = h * 0.03;
  const paints = ['#e9e7df', '#dedbd0', '#d3d0c4'];
  // rails: two long lines along the walking direction
  for (const y of [inset, h - inset - rail]) {
    ctx.fillStyle = paints[rng.int(0, 2)];
    ctx.fillRect(0, y, w, rail);
  }
  // bars: connect the rails
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = paints[rng.int(0, 2)];
    ctx.fillRect(i * pitch + 1, inset, bar - 2, h - 2 * inset);
  }
  // paint edges slightly dirty
  withAlpha(ctx, 0.25, () => {
    ctx.fillStyle = '#8f8d83';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(i * pitch + 1, inset, 2, h - 2 * inset);
      ctx.fillRect(i * pitch + bar - 3, inset, 2, h - 2 * inset);
    }
  });
  // flaking: asphalt flecks everywhere, more in the wheel tracks
  speckle(ctx, w, h, rng, 420, ['#383a3f', '#4b4d52', '#2c2e32'], 1, 3.5, 0.8);
  for (const ty of [0.25, 0.75]) {
    speckleIn(ctx, rng, 0, h * (ty - 0.1), w, h * 0.2, 170, ['#383a3f', '#44464b', '#2c2e32'], 1.5, 4.5, 0.85);
    withAlpha(ctx, 0.14, () => {
      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(0, h * (ty - 0.045), w, h * 0.09);
    });
  }
  // a few bigger worn-through chips on the bars
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = '#383a3f';
    ctx.fillRect(rng.int(0, 3) * pitch + rng.range(2, bar - 8), rng.range(inset, h - inset - 8), rng.range(3, 9), rng.range(3, 12));
  }
  // grime
  blotches(ctx, w, h, rng, 6, '#3a342a', 0.12, 8, 24);
};

/** 512px: tar roof with gravel speckle and seams. Relief: gravel bumps, seams recessed. */
export const roofPainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  ctx.fillStyle = '#2d2c2b';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(120);
    aux.height.fillRect(0, 0, w, h);
  }
  blotches(ctx, w, h, rng, 14, '#1a1918', 0.2, 14, 50);
  speckle(ctx, w, h, rng, 5000, ['#555250', '#6b675f', '#3b3a38', '#7e786b', '#1d1c1b'], 1, 3, 0.8);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 11000, [70, 100, 160, 200, 235], 1, 3, 0.85);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 4; i++) ctx.fillRect(0, (i * h) / 4, w, 2);
  if (aux) {
    aux.height.fillStyle = gray(35);
    for (let i = 1; i < 4; i++) aux.height.fillRect(0, (i * h) / 4, w, 3);
  }
};

// ---------------------------------------------------------------------------------------------- bluestone

const SLATE: RGB = [84, 99, 120];
const WARM_GREY: RGB = [126, 119, 110];
const LICHEN = ['rgb(176,184,120)', 'rgb(202,204,178)', 'rgb(150,170,116)', 'rgb(214,208,150)'];
const FLAG_JOINT = '#303230';

interface FlagOpts { heave: 0 | 1 | 2 | 3 | -1; cracked: boolean }

/** One bluestone flag with its own rng (called twice with equal seeds when the flag wraps around the tile edge). */
function paintFlag(
  ctx: Ctx, H: Ctx | undefined, seed: number, x: number, y: number, fw: number, fh: number, k: number,
  opts: FlagOpts, heaved: boolean,
): void {
  const fr = new Rng(seed);
  const j = 2 * k + 1;
  const ix = x + j, iy = y + j, iw = fw - 2 * j, ih = fh - 2 * j;
  const t = fr.next();
  const tone = fr.range(-7, 7);
  ctx.fillStyle = mixRgb(SLATE, WARM_GREY, t * t, tone);
  ctx.fillRect(ix, iy, iw, ih);
  if (H) {
    H.fillStyle = gray(128 + fr.range(-6, 6));
    H.fillRect(ix, iy, iw, ih);
  }
  // soft tonal clouds (nested rects) and one bedding band
  for (let i = 0; i < 5; i++) {
    const rw = fr.range(0.12, 0.3) * iw;
    const rh = fr.range(0.08, 0.2) * ih;
    const rx = ix + rw + fr.range(0, iw - 2 * rw);
    const ry = iy + rh + fr.range(0, ih - 2 * rh);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(210,222,236,0.04)' : 'rgba(10,12,18,0.05)';
    for (const sc of [1, 0.72, 0.44]) oval(ctx, rx, ry, rw * sc, rh * sc);
  }
  const bandH = fr.range(0.05, 0.14) * ih;
  ctx.fillStyle = fr.chance(0.5) ? 'rgba(220,226,232,0.07)' : 'rgba(10,10,14,0.08)';
  ctx.fillRect(ix, iy + fr.range(0, ih - bandH), iw, bandH);

  // cleft face: fine ridges along the bedding direction, light / dark pairs
  const horiz = fr.chance(0.68);
  const ridges = Math.round((iw * ih) / 420);
  for (let i = 0; i < ridges; i++) {
    const len = Math.min(fr.range(10, 56), horiz ? iw : ih);
    const rx = ix + fr.range(0, (horiz ? iw - len : iw - 1));
    const ry = iy + fr.range(0, (horiz ? ih - 1 : ih - len));
    const rw = horiz ? len : Math.max(1, 0.6 * k);
    const rh = horiz ? Math.max(1, 0.6 * k) : len;
    ctx.fillStyle = 'rgba(8,10,16,0.17)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(214,224,236,0.13)';
    ctx.fillRect(horiz ? rx : rx + 1, horiz ? ry + 1 : ry, rw, rh);
    if (H && i % 2 === 0) {
      H.fillStyle = gray(i % 4 === 0 ? 108 : 150);
      H.fillRect(rx, ry, rw, rh);
    }
  }
  // fine grain / mica glints
  speckleIn(ctx, fr, ix, iy, iw, ih, Math.round((iw * ih) / 130),
    ['rgba(235,240,245,0.5)', 'rgba(14,16,22,0.45)', 'rgba(150,160,175,0.4)'], 1, 1.8 * k);
  if (H) auxSpeckle(H, fr, ix, iy, iw, ih, Math.round((iw * ih) / 90), [112, 124, 138, 148], 1, 1.8 * k, 0.5);

  // bevel: lit top / left, shaded bottom / right
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(ix, iy, iw, 1.5 * k);
  ctx.fillRect(ix, iy, 1.5 * k, ih);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(ix, iy + ih - 2 * k, iw, 2 * k);
  ctx.fillRect(ix + iw - 2 * k, iy, 2 * k, ih);
  if (H) {
    H.fillStyle = gray(96);
    H.fillRect(ix, iy + ih - 2 * k, iw, 2 * k);
    H.fillRect(ix + iw - 2 * k, iy, 2 * k, ih);
  }

  // chipped corners: small angular notches filled with joint grit
  const corners: [number, number, number, number][] = [[ix, iy, 1, 1], [ix + iw, iy, -1, 1], [ix, iy + ih, 1, -1], [ix + iw, iy + ih, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    if (!fr.chance(heaved ? 0.7 : 0.5)) continue;
    const s = fr.range(5, 16) * k;
    ctx.fillStyle = FLAG_JOINT;
    polyFill(ctx, [cx, cy, cx + sx * s, cy, cx + sx * s * 0.55, cy + sy * s * 0.4, cx + sx * s * 0.15, cy + sy * s * 0.7, cx, cy + sy * s]);
    ctx.strokeStyle = 'rgba(205,212,220,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + sx * s, cy);
    ctx.lineTo(cx + sx * s * 0.55, cy + sy * s * 0.4);
    ctx.lineTo(cx + sx * s * 0.15, cy + sy * s * 0.7);
    ctx.lineTo(cx, cy + sy * s);
    ctx.stroke();
    if (H) {
      H.fillStyle = gray(58);
      polyFill(H, [cx, cy, cx + sx * s, cy, cx, cy + sy * s]);
    }
  }

  // lichen: pale yellow-green and grey-white clusters of tiny discs
  const clusters = fr.int(0, heaved ? 4 : 3);
  for (let c = 0; c < clusters; c++) {
    const lx = ix + fr.range(0.08, 0.92) * iw;
    const ly = iy + fr.range(0.08, 0.92) * ih;
    const n = fr.int(3, 8);
    for (let d = 0; d < n; d++) {
      withAlpha(ctx, fr.range(0.5, 0.75), () => {
        ctx.fillStyle = LICHEN[fr.int(0, LICHEN.length - 1)];
        disc(ctx, lx + fr.range(-10, 10) * k, ly + fr.range(-8, 8) * k, fr.range(1, 3.2) * k);
      });
    }
    if (H) {
      H.fillStyle = gray(134);
      disc(H, lx, ly, 5 * k);
    }
  }
  // a stray gum spot or two
  if (fr.chance(0.4)) {
    withAlpha(ctx, 0.85, () => {
      ctx.fillStyle = 'rgb(70,70,68)';
      disc(ctx, ix + fr.range(0.1, 0.9) * iw, iy + fr.range(0.1, 0.9) * ih, fr.range(1.2, 2.4) * k);
    });
  }

  if (heaved) {
    // heaved flag: the raised edge catches light (stepped strips), the neighbouring joint gapes dark
    if (opts.heave >= 0) {
      const e = opts.heave; // 0 top, 1 right, 2 bottom, 3 left
      const strips: [number, string, number][] = [[10, 'rgba(255,255,255,0.08)', 150], [6, 'rgba(255,255,255,0.1)', 164], [3, 'rgba(255,255,255,0.14)', 180]];
      for (const [sw, col, lvl] of strips) {
        const sx = e === 3 ? ix : e === 1 ? ix + iw - sw * k : ix;
        const sy = e === 0 ? iy : e === 2 ? iy + ih - sw * k : iy;
        const rw = e === 0 || e === 2 ? iw : sw * k;
        const rh = e === 0 || e === 2 ? sw * k : ih;
        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, rw, rh);
        if (H) {
          H.fillStyle = gray(lvl);
          H.fillRect(sx, sy, rw, rh);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const gx = e === 3 ? x - 2 * k : e === 1 ? x + fw - 1 * k : x;
      const gy = e === 0 ? y - 2 * k : e === 2 ? y + fh - 1 * k : y;
      ctx.fillRect(gx, gy, e === 0 || e === 2 ? fw : 3 * k, e === 0 || e === 2 ? 3 * k : fh);
    }
    if (opts.cracked) {
      const sx0 = fr.chance(0.5) ? ix : ix + iw;
      crack(ctx, fr, sx0, iy + fr.range(0.1, 0.9) * ih, fr.int(8, 14), fr.range(12, 20) * k, 'rgba(8,8,12,0.82)', fr.range(1.3, 2.4) * k,
        H ? [{ ctx: H, color: gray(22), width: 3 * k }] : undefined);
    }
  }
}

/**
 * 512px = 2.7 m (u) x 3 m (v): two 1.5 m courses of three ~0.9 m flags in a staggered bond. Each flag is a blend between
 * slate blue and warm grey with cleft-face ridges, bevelled edges, chipped corners and lichen spots.
 * Variant 1: heaved flags (raised edges, gaping joints), cracked flags and a replaced concrete patch.
 */
export const bluestonePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const heaved = wrapVariant(variant, 2) === 1;
  const k = w / 512;
  const H = aux?.height;
  ctx.fillStyle = FLAG_JOINT;
  ctx.fillRect(0, 0, w, h);
  if (H) {
    H.fillStyle = gray(48);
    H.fillRect(0, 0, w, h);
  }
  const rows = 2;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const ws = [rng.range(0.82, 1.18), rng.range(0.82, 1.18), rng.range(0.82, 1.18)];
    const total = ws[0] + ws[1] + ws[2];
    let x = rng.range(0, w);
    for (let i = 0; i < 3; i++) {
      const fw = (ws[i] / total) * w;
      const seed = Math.floor(rng.next() * 0xffffffff);
      const opts: FlagOpts = {
        heave: heaved && rng.chance(0.4) ? (rng.int(0, 3) as 0 | 1 | 2 | 3) : -1,
        cracked: heaved && rng.chance(0.55),
      };
      const fx = x % w;
      paintFlag(ctx, H, seed, fx, r * rh, fw, rh, k, opts, heaved);
      if (fx + fw > w) paintFlag(ctx, H, seed, fx - w, r * rh, fw, rh, k, opts, heaved);
      x += fw;
    }
  }

  if (heaved) {
    // replaced section: a rectangle of grey concrete poured over part of a flag, saw-cut and broom-finished
    const pw = rng.range(0.26, 0.34) * w;
    const ph = rng.range(0.24, 0.3) * h;
    const px = rng.range(0.08, 0.5) * w;
    const py = rng.range(0.08, 0.6) * h;
    ctx.fillStyle = 'rgb(152,150,143)';
    ctx.fillRect(px, py, pw, ph);
    speckleIn(ctx, rng, px, py, pw, ph, Math.round((pw * ph) / 60), ['rgb(120,118,112)', 'rgb(186,184,176)', 'rgb(100,98,93)'], 1, 2 * k, 0.55);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(40,36,30,0.1)';
      ctx.fillRect(px + rng.range(2, pw * 0.6), py + rng.range(2, ph - 2), rng.range(8, 30) * k, Math.max(1, 0.6 * k));
    }
    ctx.fillStyle = 'rgba(70,68,62,0.7)';
    ctx.fillRect(px + pw / 2, py, 1.6 * k, ph);
    ctx.strokeStyle = 'rgb(34,34,32)';
    ctx.lineWidth = 2 * k;
    ctx.strokeRect(px, py, pw, ph);
    withAlpha(ctx, 0.4, () => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2 * k, py + 2 * k, pw - 4 * k, ph - 4 * k);
    });
    if (H) {
      H.fillStyle = gray(122);
      H.fillRect(px, py, pw, ph);
      H.fillStyle = gray(30);
      H.fillRect(px + pw / 2, py, 1.6 * k, ph);
      H.strokeStyle = gray(52);
      H.lineWidth = 2.5 * k;
      H.strokeRect(px, py, pw, ph);
    }
    // a tar-sealed crack running through the old flags
    crack(ctx, rng, rng.range(0, w), rng.range(0, h), 14, 11 * k, 'rgba(20,18,16,0.88)', 2 * k, [
      { ctx, color: 'rgba(90,86,80,0.4)', width: 0.7 * k },
      ...(H ? [{ ctx: H, color: gray(100), width: 2.4 * k }] : []),
    ]);
  }
  // grit and weeds in the joints
  speckle(ctx, w, h, rng, heaved ? 260 : 120, ['#23251f', '#4a5130', '#6a6254'], 1, 2.5 * k, 0.7);
};

// ---------------------------------------------------------------------------------------------- granite curb

/**
 * 256px, v = 1 at the top of the curb (image top). Tile ~0.4 m long x ~0.19 m of unrolled curb profile, so pixels are
 * about 2:1 wide; speckles are drawn twice as wide as high. Rows 0..0.22h are the chamfer + top (worn pale highlight band,
 * strongest on the flat top, y ~0.04..0.14h); below that the vertical face with soot toward the foot and tyre scuffs.
 * Salt-and-pepper granite: black biotite, white quartz, pink feldspar on a pinkish-grey ground.
 */
export const granitePainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  const H = aux?.height;
  ctx.fillStyle = rgb(139, 132, 131);
  ctx.fillRect(0, 0, w, h);
  if (H) {
    H.fillStyle = gray(128);
    H.fillRect(0, 0, w, h);
  }
  // large soft tonal patches
  for (let i = 0; i < 16; i++) {
    withAlpha(ctx, rng.range(0.04, 0.09), () => {
      ctx.fillStyle = i % 2 === 0 ? 'rgb(190,160,156)' : 'rgb(60,58,60)';
      const rw = rng.range(24, 80);
      const rh = rng.range(10, 32);
      ctx.fillRect(rng.range(0, w - rw), rng.range(0, h - rh), rw, rh);
    });
  }
  // salt and pepper
  const colors = ['#3a3838', '#2c2b2b', '#d2cbc7', '#e6e0db', '#b0898a', '#a27d77', '#645f5e', '#7d7776'];
  const weights = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 0, 3, 1];
  ctx.save();
  for (let i = 0; i < 6500; i++) {
    ctx.globalAlpha = rng.range(0.35, 0.8);
    ctx.fillStyle = colors[weights[Math.floor(rng.next() * weights.length)] % colors.length];
    const sh = rng.range(0.6, 1.6);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), sh * 2, sh);
  }
  ctx.restore();
  if (H) auxSpeckle(H, aux!.rng, 0, 0, w, h, 5000, [100, 114, 142, 158], 1, 3, 0.5);
  // rare larger crystals
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#2a2929' : i % 3 === 1 ? '#e8e0da' : '#b58a82';
    const sh = rng.range(2, 4);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), sh * 2.2, sh);
  }
  // vertical soot / road grime toward the foot of the face
  for (let i = 0; i < 6; i++) {
    withAlpha(ctx, 0.07, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, h * (0.58 + i * 0.07), w, h - h * (0.58 + i * 0.07));
    });
  }
  withAlpha(ctx, 0.28, () => {
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, h * 0.965, w, h * 0.035);
  });
  // rain streaks and tyre scuffs on the face
  for (let i = 0; i < 9; i++) {
    withAlpha(ctx, rng.range(0.04, 0.09), () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(rng.range(0, w), h * 0.23, rng.range(1, 3), rng.range(0.15, 0.6) * h);
    });
  }
  for (let i = 0; i < 3; i++) {
    withAlpha(ctx, rng.range(0.1, 0.18), () => {
      ctx.fillStyle = '#0c0b0b';
      ctx.fillRect(rng.range(0, w * 0.6), h * rng.range(0.55, 0.9), rng.range(30, 110), rng.range(5, 12));
    });
  }
  // worn chamfer / top highlight band (top ~22% of the tile): stepped alpha, strongest on the flat top
  const bands: [number, number, number][] = [[0.22, 0.12, 0], [0.19, 0.08, 0], [0.16, 0.12, 0], [0.13, 0.08, 0.02], [0.1, 0.06, 0.03]];
  for (const [bh, a, y0] of bands) {
    withAlpha(ctx, a, () => {
      ctx.fillStyle = '#f4ece8';
      ctx.fillRect(0, h * y0, w, h * (bh - y0));
    });
  }
  // polished glints + chips knocked out of the arris
  speckleIn(ctx, rng, 0, 0, w, h * 0.2, 340, ['#fffaf6', '#e6dcd6'], 1, 2.4, 0.7);
  withAlpha(ctx, 0.25, () => {
    ctx.fillStyle = '#f7f1ed';
    ctx.fillRect(0, h * 0.215, w, 1.5);
  });
  for (let i = 0; i < 4; i++) {
    const cx = rng.range(0, w);
    ctx.fillStyle = 'rgba(52,48,48,0.4)';
    polyFill(ctx, [cx, h * 0.2, cx + rng.range(4, 9), h * 0.2, cx + rng.range(2, 5), h * rng.range(0.22, 0.25)]);
  }
  if (H) {
    H.fillStyle = gray(138);
    H.fillRect(0, 0, w, h * 0.14);
    H.fillStyle = gray(150);
    H.fillRect(0, h * 0.02, w, h * 0.1);
  }
};

// ---------------------------------------------------------------------------------------------- manhole

const IRON = 'rgb(50,48,45)';
const IRON_DK = 'rgb(22,21,20)';
const IRON_HI = 'rgb(98,93,85)';

/**
 * 256px square around a round cast-iron cover (the disc mesh maps its cap UV 0..1 onto the inscribed circle).
 * Rings from the outside in: rust-brown halo on the asphalt, worn frame, seat gap, cover with ribs and concentric rings.
 * Variant 0: diamond tread field around a flat centre band that carries the raised letters "BKLYN SEWER" (parody).
 * Variant 1: square waffle bosses on an octagonal field, no lettering. Both have two pick holes.
 */
export const manholePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const waffle = wrapVariant(variant, 2) === 1;
  const H = aux?.height;
  const s = w / 256;
  const cx = w / 2, cy = h / 2;

  // asphalt around the cover
  ctx.fillStyle = '#2b2c2f';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 1300, ['#44464b', '#1d1e21', '#55575c'], 1, 2.5, 0.6);
  if (H) {
    H.fillStyle = gray(128);
    H.fillRect(0, 0, w, h);
  }
  // rust-brown halo bleeding from the frame
  for (let i = 0; i < 5; i++) {
    withAlpha(ctx, 0.17, () => {
      ctx.fillStyle = 'rgb(96,58,36)';
      disc(ctx, cx, cy, 127 * s - i * 3.2 * s);
    });
  }
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2);
    withAlpha(ctx, rng.range(0.1, 0.22), () => {
      ctx.fillStyle = 'rgb(118,70,40)';
      disc(ctx, cx + Math.cos(a) * rng.range(110, 124) * s, cy + Math.sin(a) * rng.range(110, 124) * s, rng.range(2, 6) * s);
    });
  }
  // frame, seat gap, cover
  ctx.fillStyle = 'rgb(34,32,30)';
  disc(ctx, cx, cy, 112 * s);
  ctx.fillStyle = 'rgb(64,60,55)';
  disc(ctx, cx, cy, 108 * s);
  ctx.fillStyle = 'rgb(14,13,13)';
  disc(ctx, cx, cy, 100 * s);
  ctx.fillStyle = IRON;
  disc(ctx, cx, cy, 98 * s);
  if (H) {
    H.fillStyle = gray(152);
    disc(H, cx, cy, 108 * s);
    H.fillStyle = gray(34);
    disc(H, cx, cy, 100 * s);
    H.fillStyle = gray(142);
    disc(H, cx, cy, 98 * s);
  }

  // radial ribs between the outer rings
  ctx.strokeStyle = IRON_DK;
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.moveTo(cx + Math.cos(a) * 84 * s, cy + Math.sin(a) * 84 * s);
    ctx.lineTo(cx + Math.cos(a) * 94 * s, cy + Math.sin(a) * 94 * s);
  }
  ctx.stroke();
  if (H) {
    H.strokeStyle = gray(170);
    H.lineWidth = 2.2 * s;
    H.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      H.moveTo(cx + Math.cos(a) * 84 * s, cy + Math.sin(a) * 84 * s);
      H.lineTo(cx + Math.cos(a) * 94 * s, cy + Math.sin(a) * 94 * s);
    }
    H.stroke();
  }

  const rt = 74 * s; // tread field radius
  if (!waffle) {
    // diamond tread: two families of diagonal lines clipped to the field by chord arithmetic
    const sp = 11 * s;
    for (const [color, lw] of [[IRON_DK, 3.2 * s], [IRON_HI, 1.5 * s]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const f of [1, -1]) {
        const nx = 1 / Math.SQRT2, ny = f / Math.SQRT2;
        const tx = -ny, ty = nx;
        for (let d = -rt + sp / 2; d < rt; d += sp) {
          const hc = Math.sqrt(Math.max(0, rt * rt - d * d));
          ctx.moveTo(cx + nx * d - tx * hc, cy + ny * d - ty * hc);
          ctx.lineTo(cx + nx * d + tx * hc, cy + ny * d + ty * hc);
        }
      }
      ctx.stroke();
    }
    if (H) {
      H.strokeStyle = gray(178);
      H.lineWidth = 2.4 * s;
      H.beginPath();
      for (const f of [1, -1]) {
        const nx = 1 / Math.SQRT2, ny = f / Math.SQRT2;
        const tx = -ny, ty = nx;
        for (let d = -rt + sp / 2; d < rt; d += sp) {
          const hc = Math.sqrt(Math.max(0, rt * rt - d * d));
          H.moveTo(cx + nx * d - tx * hc, cy + ny * d - ty * hc);
          H.lineTo(cx + nx * d + tx * hc, cy + ny * d + ty * hc);
        }
      }
      H.stroke();
    }
    // flat centre band for the lettering
    ctx.fillStyle = IRON;
    ctx.fillRect(cx - 72 * s, cy - 15 * s, 144 * s, 30 * s);
    ctx.strokeStyle = IRON_DK;
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(cx - 72 * s, cy - 15 * s, 144 * s, 30 * s);
    if (H) {
      H.fillStyle = gray(136);
      H.fillRect(cx - 72 * s, cy - 15 * s, 144 * s, 30 * s);
    }
    // raised letters
    const text = 'BKLYN SEWER';
    fitFont(ctx, text, 132 * s, 20 * s);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgb(12,12,11)';
    ctx.fillText(text, cx + 1.2 * s, cy + 1.8 * s);
    ctx.fillStyle = 'rgb(112,106,96)';
    ctx.fillText(text, cx, cy + 0.5 * s);
    if (H) {
      H.font = ctx.font;
      H.textAlign = 'center';
      H.textBaseline = 'middle';
      H.fillStyle = gray(206);
      H.fillText(text, cx, cy + 0.5 * s);
    }
  } else {
    // waffle: square raised bosses on a 15 px grid inside an octagonal field
    const cell = 15 * s;
    const bs = 11 * s;
    for (let j = -5; j <= 5; j++) {
      for (let i = -5; i <= 5; i++) {
        const bx = cx + i * cell - bs / 2;
        const by = cy + j * cell - bs / 2;
        const dx = Math.abs(i * cell), dy = Math.abs(j * cell);
        if (Math.max(dx, dy) > rt * 0.92 || dx + dy > rt * 1.3) continue;
        ctx.fillStyle = IRON_DK;
        ctx.fillRect(bx + 1.5 * s, by + 1.5 * s, bs, bs);
        ctx.fillStyle = 'rgb(66,63,58)';
        ctx.fillRect(bx, by, bs, bs);
        ctx.fillStyle = IRON_HI;
        ctx.fillRect(bx, by, bs, 1.4 * s);
        ctx.fillRect(bx, by, 1.4 * s, bs);
        if (H) {
          H.fillStyle = gray(176);
          H.fillRect(bx, by, bs, bs);
        }
      }
    }
    // octagonal border around the field
    ctx.strokeStyle = IRON_DK;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const px = cx + Math.cos(a) * 80 * s, py = cy + Math.sin(a) * 80 * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // concentric rings: raised bead with a shadow line
  for (const r of waffle ? [92, 86] : [92, 80]) {
    ringStroke(ctx, cx, cy, (r + 2.4) * s, 2 * s, IRON_DK);
    ringStroke(ctx, cx, cy, r * s, 2.2 * s, 'rgb(84,80,73)');
    if (H) ringStroke(H, cx, cy, r * s, 3 * s, gray(184));
  }
  // pick holes
  for (const dy of [-1, 1]) {
    ctx.fillStyle = 'rgb(8,8,8)';
    oval(ctx, cx, cy + dy * 90 * s, 9 * s, 3 * s);
    ctx.strokeStyle = IRON_HI;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + dy * 90 * s, 9.6 * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (H) {
      H.fillStyle = gray(20);
      oval(H, cx, cy + dy * 90 * s, 9 * s, 3 * s);
    }
  }
  // traffic polish (lighter), rust bloom and pitting inside the cover
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * 88 * s;
    withAlpha(ctx, 0.07, () => {
      ctx.fillStyle = 'rgb(150,144,134)';
      disc(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rng.range(8, 22) * s);
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * 92 * s;
    withAlpha(ctx, rng.range(0.14, 0.3), () => {
      ctx.fillStyle = i % 2 === 0 ? 'rgb(124,68,36)' : 'rgb(88,48,28)';
      disc(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rng.range(2, 8) * s);
    });
  }
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * 97 * s;
    ctx.fillStyle = i % 3 === 0 ? 'rgb(116,110,100)' : i % 3 === 1 ? 'rgb(10,10,10)' : 'rgb(104,62,36)';
    const ps = rng.range(1, 2.2);
    ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ps, ps);
  }
  ctx.restore();
};

// ---------------------------------------------------------------------------------------------- storm grate

/**
 * 256px stretched over a ~0.9 m x 0.5 m curb inlet: parallel bars run along v (across the inlet depth), two cross ties,
 * dark sump showing through the slots with leaf litter, and a rust-streaked frame. The frame is thicker in v because the
 * texture is stretched about 1.8x more along u than v.
 */
export const gratePainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  const H = aux?.height;
  const fx = w * 0.045;
  const fy = h * 0.085;
  const iw = w - 2 * fx;
  const ih = h - 2 * fy;
  // frame (rust) then the void
  ctx.fillStyle = 'rgb(76,47,31)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgb(9,9,10)';
  ctx.fillRect(fx, fy, iw, ih);
  if (H) {
    H.fillStyle = gray(150);
    H.fillRect(0, 0, w, h);
    H.fillStyle = gray(24);
    H.fillRect(fx, fy, iw, ih);
  }
  // litter visible through the slots
  for (let i = 0; i < 16; i++) {
    withAlpha(ctx, rng.range(0.5, 0.85), () => {
      ctx.fillStyle = i % 4 === 0 ? 'rgb(120,98,52)' : i % 4 === 1 ? 'rgb(70,58,36)' : i % 4 === 2 ? 'rgb(34,38,30)' : 'rgb(168,164,152)';
      oval(ctx, fx + rng.range(0, iw), fy + rng.range(0.3, 1) * ih, rng.range(3, 10), rng.range(2, 6));
    });
  }
  // bars
  const nb = 13;
  const pitch = iw / nb;
  const bw = pitch * 0.58;
  for (let i = 0; i < nb; i++) {
    const bx = fx + i * pitch + (pitch - bw) / 2;
    ctx.fillStyle = 'rgb(44,43,41)';
    ctx.fillRect(bx, fy, bw, ih);
    ctx.fillStyle = 'rgb(92,86,78)';
    ctx.fillRect(bx + bw * 0.4, fy, Math.max(1, bw * 0.2), ih);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(bx + bw - 1.5, fy, 1.5, ih);
    if (H) {
      H.fillStyle = gray(168);
      H.fillRect(bx, fy, bw, ih);
    }
  }
  // cross ties
  for (const f of [0.34, 0.68]) {
    ctx.fillStyle = 'rgb(52,50,47)';
    ctx.fillRect(fx, fy + ih * f - 3, iw, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(fx, fy + ih * f - 3, iw, 1.5);
    if (H) {
      H.fillStyle = gray(160);
      H.fillRect(fx, fy + ih * f - 3, iw, 6);
    }
  }
  // inner seat shadow and bevel on the frame
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(fx, fy, iw, 4);
  ctx.fillRect(fx, fy, 3, ih);
  ctx.strokeStyle = 'rgba(190,120,70,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  if (H) {
    H.strokeStyle = gray(112);
    H.lineWidth = 3;
    H.strokeRect(fx - 1.5, fy - 1.5, iw + 3, ih + 3);
  }
  // rust: speckle on the frame strips and bars, plus streaks running down from the top bar
  const rust = ['#7a4528', '#5e341f', '#93552e', '#3d2518'];
  speckleIn(ctx, rng, 0, 0, w, fy, 160, rust, 1, 3.5, 0.8);
  speckleIn(ctx, rng, 0, h - fy, w, fy, 160, rust, 1, 3.5, 0.8);
  speckleIn(ctx, rng, 0, fy, fx, ih, 110, rust, 1, 3.5, 0.8);
  speckleIn(ctx, rng, w - fx, fy, fx, ih, 110, rust, 1, 3.5, 0.8);
  speckleIn(ctx, rng, fx, fy, iw, ih, 420, rust, 1, 2.4, 0.45);
  for (let i = 0; i < 6; i++) {
    sootStreak(ctx, rng.range(0, w), h - fy, rng.range(1.5, 4), rng.range(10, 24), 0.5, '#7a4528');
  }
  if (H) auxSpeckle(H, aux!.rng, 0, 0, w, h, 1500, [120, 150, 170, 190], 1, 2.4, 0.5);
};

