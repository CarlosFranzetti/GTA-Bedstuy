import type { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { auxSpeckle, blotches, fitFont, gray, grimeStreaks, hsl, sootStreak, speckle, withAlpha, wrapVariant } from './util';

export const ROLLGATE_VARIANTS = 4;

/** Spray colour pairs for the tagged gate (abstract strokes only, no lettering). */
const TAG_PAIRS: readonly (readonly [string, string])[] = [
  ['#e0289a', '#18c4d8'],
  ['#f2c21b', '#2f6df0'],
  ['#8fe03a', '#e8523a'],
  ['#f4f4f0', '#d02a2a'],
];

const GALV = { base: [205, 6, 56], crest: '#d3d6d9', shoulder: '#6a6e73', trough: '#4b4e52' } as const;

/** Lighter scuffs and hand grime on the band where people push and bang a gate (about 1 m up the door). */
function scuffBand(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, strength: number): void {
  const y0 = h * 0.5;
  const bh = h * 0.14;
  withAlpha(ctx, 0.05 * strength, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, y0, w, bh);
  });
  withAlpha(ctx, 0.07 * strength, () => {
    ctx.fillStyle = '#3b3328';
    ctx.fillRect(0, y0 + bh * 0.2, w, bh * 0.6);
  });
  for (let i = 0; i < 70; i++) {
    const light = rng.chance(0.7);
    withAlpha(ctx, rng.range(0.12, 0.3) * strength, () => {
      ctx.fillStyle = light ? '#e8ecee' : '#2a2620';
      ctx.fillRect(rng.range(0, w - 20), y0 + rng.range(0, bh), rng.range(4, 22), rng.range(1, 2));
    });
  }
}

/** Corrugated horizontal ribs. Variants: 0 galvanized, 1 painted (red/green) with chips, 2 tagged, 3 rusted bottom third. */
export const rollGatePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, ROLLGATE_VARIANTS);
  const ribs = 16;
  const rh = h / ribs;

  // painted gate: dull red or dull green; otherwise galvanized steel
  let hue: number = GALV.base[0], sat: number = GALV.base[1], lit: number = GALV.base[2];
  let crest: string = GALV.crest, shoulder: string = GALV.shoulder, trough: string = GALV.trough;
  if (v === 1) {
    const red = rng.chance(0.5);
    hue = red ? 2 : 150;
    sat = red ? 42 : 28;
    lit = red ? 33 : 27;
    crest = hsl(hue, sat, lit + 11);
    shoulder = hsl(hue, sat, lit - 9);
    trough = hsl(hue, sat, lit - 17);
  }

  for (let i = 0; i < ribs; i++) {
    ctx.fillStyle = hsl(hue, sat, lit + rng.range(-2, 2));
    ctx.fillRect(0, i * rh, w, rh);
    ctx.fillStyle = crest;
    ctx.fillRect(0, i * rh, w, rh * 0.22);
    ctx.fillStyle = shoulder;
    ctx.fillRect(0, i * rh + rh * 0.62, w, rh * 0.2);
    ctx.fillStyle = trough;
    ctx.fillRect(0, i * rh + rh * 0.86, w, rh * 0.14);
    // slat shadow line where each rib overlaps the next
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, i * rh + rh - 1.5, w, 1.5);
    });
    if (aux) {
      // corrugation profile: lit crest, flat, falling shoulder, deep trough (identical for every variant: relief is shared)
      const levels: [number, number, number][] = [[0, 0.22, 200], [0.22, 0.62, 160], [0.62, 0.82, 105], [0.82, 1, 45]];
      for (const [a, b, g] of levels) {
        aux.height.fillStyle = gray(g);
        aux.height.fillRect(0, i * rh + rh * a, w, rh * (b - a));
      }
    }
  }

  if (v !== 1) {
    // zinc spangle: fine bright/dark crystals plus a few larger faint flowers
    speckle(ctx, w, h, rng, 1100, ['#eef2f4', '#aab2b7', '#7d868c', '#c9d0d4'], 1, 3, 0.22);
    speckle(ctx, w, h, rng, 120, ['#ffffff', '#9aa3a8'], 3, 6, 0.07);
  } else {
    speckle(ctx, w, h, rng, 260, ['#000000', '#ffffff'], 1, 2, 0.07);
  }

  // grime running down from the top of the gate
  grimeStreaks(ctx, w, h, rng, v === 3 ? 12 : 8, v === 3 ? 0.18 : 0.12, '#2c2a26');
  if (v === 0) {
    for (let i = 0; i < 3; i++) sootStreak(ctx, rng.range(0, w), 0, rng.range(5, 12), rng.range(h * 0.3, h * 0.7), 0.14, '#1b1a18');
  }

  if (v === 1) {
    // chips of paint showing galvanized steel, favouring the hand-height band, the crests and the bottom
    for (let i = 0; i < 150; i++) {
      const mode = rng.next();
      let x = rng.range(0, w);
      let y: number;
      if (mode < 0.35) y = h * 0.5 + rng.range(0, h * 0.14);
      else if (mode < 0.65) y = Math.floor(rng.range(0, ribs)) * rh + rng.range(0, rh * 0.2);
      else if (mode < 0.8) y = h - rng.range(10, h * 0.2);
      else y = rng.range(0, h);
      if (mode >= 0.8 && rng.chance(0.5)) x = rng.chance(0.5) ? rng.range(0, 14) : w - rng.range(0, 14);
      const cw = rng.range(2, 7);
      const ch = rng.range(1, 3.5);
      ctx.fillStyle = rng.chance(0.5) ? '#b4bbbf' : '#8f979c';
      ctx.fillRect(x, y, cw, ch);
      withAlpha(ctx, 0.5, () => {
        ctx.fillStyle = '#2d2a2a';
        ctx.fillRect(x, y + ch, cw, 1);
      });
    }
    // a few larger peeled patches, stepped so they read as irregular
    for (let i = 0; i < 3; i++) {
      const x = rng.range(10, w - 40);
      const y = rng.range(h * 0.1, h * 0.8);
      ctx.fillStyle = '#a4acb1';
      ctx.fillRect(x, y, rng.range(12, 26), rng.range(3, 7));
      ctx.fillRect(x + rng.range(2, 8), y + 3, rng.range(8, 16), rng.range(3, 6));
      withAlpha(ctx, 0.4, () => {
        ctx.fillStyle = '#1e1c1c';
        ctx.fillRect(x + 1, y + 8, rng.range(10, 20), 1.5);
      });
    }
  }

  if (v === 2) {
    // abstract spray tag: two colours, scribbled flowing strokes with loops and drips, no lettering
    const [colA, colB] = rng.pick(TAG_PAIRS);
    const y0 = h * rng.range(0.28, 0.5);
    const n = 6;
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      pts.push([w * (0.08 + (0.84 * k) / (n - 1)) + rng.range(-8, 8), y0 + rng.range(-h * 0.16, h * 0.16)]);
    }
    const trace = (p: [number, number][]): void => {
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < p.length - 1; k++) {
        ctx.quadraticCurveTo(p[k][0], p[k][1], (p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2);
      }
      ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
      ctx.stroke();
    };
    const pts2: [number, number][] = pts.map(([x, y]) => [x + rng.range(-14, 14), y + rng.range(-18, 18)]);
    pts2.reverse();
    const loopX = w * rng.range(0.25, 0.7);
    const loopY = y0 + rng.range(-h * 0.1, h * 0.1);
    const loopR = rng.range(14, 24);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.95;
    // dark outline pass, then colour A, then thinner colour B over it
    ctx.strokeStyle = '#161616';
    ctx.lineWidth = 15;
    trace(pts);
    ctx.beginPath();
    ctx.arc(loopX, loopY, loopR, 0.4, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = colA;
    ctx.lineWidth = 9;
    trace(pts);
    ctx.beginPath();
    ctx.arc(loopX, loopY, loopR, 0.4, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = colB;
    ctx.lineWidth = 4;
    trace(pts2);
    ctx.restore();
    // drips under the heavy strokes
    for (let k = 0; k < 8; k++) {
      const [px, py] = pts[Math.floor(rng.range(0, n))];
      const x = px + rng.range(-10, 10);
      const len = rng.range(8, 40);
      ctx.fillStyle = k % 3 === 2 ? colB : colA;
      ctx.fillRect(x - 1, py + 4, 2.2, len);
      ctx.beginPath();
      ctx.arc(x, py + 4 + len, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (v === 3) {
    // rust takes the bottom third: stepped wash, pitting blotches, streaks creeping up from the foot
    const top = h * (2 / 3);
    const steps = 20;
    for (let k = 0; k < steps; k++) {
      const t = (k + 1) / steps;
      withAlpha(ctx, 0.04 + 0.2 * t, () => {
        ctx.fillStyle = '#8a4520';
        ctx.fillRect(0, top + (h - top) * (k / steps), w, (h - top) / steps + 1);
      });
    }
    const rustCols = ['#7a3a1a', '#a8541f', '#5a2a12', '#c06a2a'];
    for (let i = 0; i < 110; i++) {
      const y = top - 6 + (h - top + 6) * Math.pow(rng.next(), 0.6);
      withAlpha(ctx, rng.range(0.15, 0.5), () => {
        ctx.fillStyle = rustCols[Math.floor(rng.next() * rustCols.length)];
        ctx.beginPath();
        ctx.arc(rng.range(0, w), y, rng.range(1.5, 7), 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (let i = 0; i < 14; i++) {
      withAlpha(ctx, rng.range(0.15, 0.35), () => {
        ctx.fillStyle = '#6a3014';
        const sx = rng.range(0, w);
        ctx.fillRect(sx, top - rng.range(0, 20), rng.range(2, 6), rng.range(20, 60));
      });
    }
    // rust runs from the transition line
    for (let i = 0; i < 6; i++) sootStreak(ctx, rng.range(0, w), top - 12, rng.range(4, 9), rng.range(30, 60), 0.28, '#5a2a12');
    blotches(ctx, w, h, rng, 8, '#7a4a28', 0.14, 6, 18);
    blotches(ctx, w, h, rng, 10, '#000000', 0.12, 10, 30);
  }

  scuffBand(ctx, w, h, rng, v === 1 ? 1.3 : 1);

  // bottom lock bar
  ctx.fillStyle = '#35373a';
  ctx.fillRect(0, h - 8, w, 8);
  if (aux) {
    aux.height.fillStyle = gray(215);
    aux.height.fillRect(0, h - 8, w, 8);
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 800, [110, 150, 190], 1, 2, 0.25);
  }
  speckle(ctx, w, h, rng, 300, ['#000000', '#ffffff'], 1, 2, 0.08);
};

/**
 * 256px diamond mesh on a transparent background with a top rail and a little rust. Tiles seamlessly: the rail is split
 * across the seam (3px at the top edge, 3px at the bottom edge) so a repeated tile shows one continuous tube.
 */
export const chainlinkPainter: Painter = (ctx, w, h, rng) => {
  const s = 16;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  const lines = (): void => {
    ctx.beginPath();
    for (let k = -h; k <= w; k += s) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + h, h);
      ctx.moveTo(k + h, 0);
      ctx.lineTo(k, h);
    }
    ctx.stroke();
  };
  lines();
  ctx.strokeStyle = '#a9aeb3';
  ctx.lineWidth = 1.6;
  lines();
  // slight rust: orange-brown flecks sitting on the wires (points on the two diagonal families)
  const rust = ['#8a4b24', '#a35a2a', '#6e3a1c'];
  for (let i = 0; i < 90; i++) {
    const k = Math.floor(rng.range(0, (w + h) / s)) * s - h;
    const t = rng.range(0, h);
    const down = rng.chance(0.5);
    const x = down ? k + t : k + h - t;
    const y = t;
    withAlpha(ctx, rng.range(0.35, 0.7), () => {
      ctx.fillStyle = rust[Math.floor(rng.next() * rust.length)];
      ctx.fillRect(x - 1, y - 1, rng.range(1.5, 3.5), rng.range(1.5, 3.5));
    });
  }
  // top rail (opaque so the alpha test keeps it)
  ctx.fillStyle = '#6e7378';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, h - 3, w, 3);
  ctx.fillStyle = '#b6bbbf';
  ctx.fillRect(0, 0, w, 1);
  ctx.fillStyle = '#44484c';
  ctx.fillRect(0, h - 1, w, 1);
  for (let i = 0; i < 24; i++) {
    withAlpha(ctx, rng.range(0.3, 0.6), () => {
      ctx.fillStyle = rust[Math.floor(rng.next() * rust.length)];
      ctx.fillRect(rng.range(0, w), rng.chance(0.5) ? 0 : h - 3, rng.range(2, 8), 3);
    });
  }
};

/** Stencil text on the green plywood hoarding. */
const STENCIL = 'POST NO BILLS';

/** 256px. Variant 0: hunter-green plywood sheets stencilled POST NO BILLS; variant 1: bare wood planks. */
export const scaffoldPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, 2);
  if (v === 0) {
    const ground = hsl(138, 32, 24);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);
    // plywood grain runs along the sheet
    for (let i = 0; i < 260; i++) {
      withAlpha(ctx, rng.range(0.03, 0.1), () => {
        ctx.fillStyle = rng.chance(0.5) ? '#ffffff' : '#06120a';
        ctx.fillRect(0, rng.range(0, h), w, 1);
      });
    }
    blotches(ctx, w, h, rng, 12, '#06140a', 0.16, 10, 34);
    // sheet seams (1.2 x 2.4 m sheets) and screw heads
    ctx.fillStyle = '#0a1a0f';
    ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillRect(w / 2 - 1, 0, 2, h);
    ctx.fillStyle = '#9fb3a2';
    for (let x = 16; x < w; x += 48) for (let y = 12; y < h; y += 40) ctx.fillRect(x, y, 2, 2);
    // stencilled lettering with bridges
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, STENCIL, w * 0.82, h * 0.16, 'bold', 'Impact, "Arial Black", Arial, sans-serif');
    const cy = h * 0.27;
    withAlpha(ctx, 0.9, () => {
      ctx.fillStyle = '#dcdccf';
      ctx.fillText(STENCIL, w / 2, cy);
    });
    const tw = ctx.measureText(STENCIL).width;
    ctx.fillStyle = ground;
    ctx.fillRect(w / 2 - tw / 2 - 2, cy - 1, tw + 4, 2);
    speckle(ctx, w, h, rng, 220, [ground], 1, 2.5, 0.55);
    grimeStreaks(ctx, w, h, rng, 6, 0.1, '#06120a');
  } else {
    const rows = 6;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = hsl(32 + rng.range(-3, 3), 38, 48 + rng.range(-6, 6));
      ctx.fillRect(0, i * rh, w, rh - 2);
      withAlpha(ctx, 0.18, () => {
        ctx.fillStyle = '#3b2410';
        for (let g = 0; g < 6; g++) ctx.fillRect(0, i * rh + rng.range(2, rh - 4), w, 1);
      });
      ctx.fillStyle = '#2b1c10';
      ctx.fillRect(0, i * rh + rh - 2, w, 2);
      // staggered end joint and nails on each plank
      const jx = rng.range(30, w - 30);
      ctx.fillRect(jx, i * rh, 2, rh - 2);
      ctx.fillStyle = '#6b6d70';
      ctx.fillRect(jx - 7, i * rh + rh / 2 - 1, 2, 2);
      ctx.fillRect(jx + 7, i * rh + rh / 2 - 1, 2, 2);
      if (rng.chance(0.5)) {
        withAlpha(ctx, 0.5, () => {
          ctx.fillStyle = '#2a190b';
          ctx.beginPath();
          ctx.arc(rng.range(10, w - 10), i * rh + rh / 2, rng.range(2, 3.5), 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }
};

/** 256px: dark rubber with tread blocks. */
export const tirePainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#242424';
  for (let x = 0; x < w; x += 16) {
    for (let y = 0; y < h; y += 32) ctx.fillRect(x + 2, y + ((x / 16) % 2) * 16 + 2, 12, 12);
  }
  speckle(ctx, w, h, rng, 600, ['#000000', '#303030'], 1, 2, 0.6);
};

/** Height of one steel hoop band on the water tank, in pixels. */
export const TANK_HOOP_H = 6;
/** Hoops per 256px tile (roughly one every 0.6 m on a typical 4-5 m tank). */
export const TANK_HOOPS = 8;

/** 256px: weathered cedar tank staves (vertical planks, warm grey-brown) with dark steel hoops. */
export const waterTankPainter: Painter = (ctx, w, h, rng) => {
  const staves = 16;
  const sw = w / staves;
  for (let i = 0; i < staves; i++) {
    const x = i * sw;
    ctx.fillStyle = hsl(30 + rng.range(-4, 4), rng.range(10, 22), 36 + rng.range(-6, 7));
    ctx.fillRect(x, 0, sw, h);
    // grain
    for (let g = 0; g < 5; g++) {
      withAlpha(ctx, rng.range(0.06, 0.16), () => {
        ctx.fillStyle = rng.chance(0.6) ? '#1c130a' : '#d8c8aa';
        ctx.fillRect(x + rng.range(1, sw - 2), rng.range(0, h * 0.3), 1, rng.range(h * 0.4, h));
      });
    }
    // sun-bleached silvery patches
    if (rng.chance(0.45)) {
      withAlpha(ctx, rng.range(0.06, 0.14), () => {
        ctx.fillStyle = '#c9c4b8';
        ctx.fillRect(x + 1, rng.range(0, h * 0.5), sw - 3, rng.range(h * 0.2, h * 0.5));
      });
    }
    // dark seam between staves + lit edge
    withAlpha(ctx, 0.75, () => {
      ctx.fillStyle = '#1a140d';
      ctx.fillRect(x + sw - 1, 0, 1, h);
    });
    withAlpha(ctx, 0.08, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, 0, 1, h);
    });
  }
  // water stains and a green-black bloom near the foot
  grimeStreaks(ctx, w, h, rng, 8, 0.12, '#14100a');
  for (let i = 0; i < 14; i++) {
    withAlpha(ctx, rng.range(0.05, 0.14), () => {
      ctx.fillStyle = '#2e3a24';
      ctx.beginPath();
      ctx.arc(rng.range(0, w), h * (0.6 + 0.4 * rng.next()), rng.range(6, 20), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // steel hoops with a lit top edge, a cast shadow underneath and rust bleeding down
  const step = h / TANK_HOOPS;
  for (let k = 0; k < TANK_HOOPS; k++) {
    const y = k * step + step / 2 - TANK_HOOP_H / 2;
    withAlpha(ctx, 0.35, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, y + TANK_HOOP_H, w, 3);
    });
    ctx.fillStyle = '#1e1e20';
    ctx.fillRect(0, y, w, TANK_HOOP_H);
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, y, w, 1);
    for (let r = 0; r < 3; r++) {
      sootStreak(ctx, rng.range(0, w), y + TANK_HOOP_H, rng.range(2, 5), rng.range(10, 26), 0.35, '#5a3418');
    }
  }
  blotches(ctx, w, h, rng, 10, '#000000', 0.1, 8, 28);
};
