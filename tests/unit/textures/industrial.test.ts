import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import type { MaterialKey } from '@/world/types';
import type { Painter } from '@/textures/canvas';
import { ALLOWED, render } from './softcanvas';
import {
  CAST_IRON_VARIANTS, CHAINLINK_FENCE_VARIANTS, CHAINLINK_RAIL_VARIANTS, CORRUGATED_VARIANTS, GRAFFITI_COLORS,
  GRAFFITI_VARIANTS, GRANITE_CURB_VARIANTS, TAR_ROOF_VARIANTS, castIronFencePainter, chainlinkFencePainter,
  chainlinkRailPainter, corrugatedSteelPainter, graffitiPainter, graniteCurbPainter, tarRoofPainter,
} from '@/textures/painters/industrial';

function hash(px: Uint8ClampedArray): number {
  let hh = 2166136261 >>> 0;
  for (let i = 0; i < px.length; i++) { hh ^= px[i]; hh = Math.imul(hh, 16777619) >>> 0; }
  return hh;
}

function alphaCoverage(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] >= 128) n++;
  return n / (px.length / 4);
}

function meanLuma(px: Uint8ClampedArray): number {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return s / (px.length / 4);
}

/** Mean absolute channel difference between column a and column b. */
function colDiff(px: Uint8ClampedArray, w: number, h: number, a: number, b: number): number {
  let s = 0;
  for (let y = 0; y < h; y++) for (let k = 0; k < 4; k++) s += Math.abs(px[(y * w + a) * 4 + k] - px[(y * w + b) * 4 + k]);
  return s / (h * 4);
}

function rowDiff(px: Uint8ClampedArray, w: number, h: number, a: number, b: number): number {
  let s = 0;
  for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) s += Math.abs(px[(a * w + x) * 4 + k] - px[(b * w + x) * 4 + k]);
  return s / (w * 4);
}

/** Seam (last col vs first col) difference relative to the typical neighbour-column difference inside the tile. */
function seamX(px: Uint8ClampedArray, w: number, h: number): { seam: number; typical: number } {
  let t = 0;
  for (let x = 0; x < w - 1; x++) t += colDiff(px, w, h, x, x + 1);
  return { seam: colDiff(px, w, h, w - 1, 0), typical: t / (w - 1) };
}

function seamY(px: Uint8ClampedArray, w: number, h: number): { seam: number; typical: number } {
  let t = 0;
  for (let y = 0; y < h - 1; y++) t += rowDiff(px, w, h, y, y + 1);
  return { seam: rowDiff(px, w, h, h - 1, 0), typical: t / (h - 1) };
}

interface Case { name: string; painter: Painter; w: number; h: number; variants: number }

const CASES: Case[] = [
  { name: 'corrugatedSteel', painter: corrugatedSteelPainter, w: 512, h: 512, variants: CORRUGATED_VARIANTS },
  { name: 'chainlinkFence', painter: chainlinkFencePainter, w: 256, h: 256, variants: CHAINLINK_FENCE_VARIANTS },
  { name: 'chainlinkRail', painter: chainlinkRailPainter, w: 256, h: 64, variants: CHAINLINK_RAIL_VARIANTS },
  { name: 'graniteCurb', painter: graniteCurbPainter, w: 512, h: 128, variants: GRANITE_CURB_VARIANTS },
  { name: 'castIronFence', painter: castIronFencePainter, w: 256, h: 256, variants: CAST_IRON_VARIANTS },
  { name: 'tarRoof', painter: tarRoofPainter, w: 512, h: 512, variants: TAR_ROOF_VARIANTS },
  { name: 'graffiti', painter: graffitiPainter, w: 512, h: 256, variants: GRAFFITI_VARIANTS },
];

describe('industrial painters: determinism and primitives', () => {
  for (const c of CASES) {
    it(`${c.name}: has the planned variant count and sizes in the 256-512 range`, () => {
      expect(c.variants).toBeGreaterThanOrEqual(2);
      expect(Math.max(c.w, c.h)).toBeLessThanOrEqual(512);
      expect(Math.max(c.w, c.h)).toBeGreaterThanOrEqual(256);
    });
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: same seed gives an identical pixel hash, a different seed or variant differs`, () => {
        const a = render(c.painter, c.w, c.h, 7, v);
        const b = render(c.painter, c.w, c.h, 7, v);
        expect(hash(a.px)).toBe(hash(b.px));
        expect(hash(render(c.painter, c.w, c.h, 8, v).px)).not.toBe(hash(a.px));
        const other = render(c.painter, c.w, c.h, 7, (v + 1) % c.variants);
        expect(hash(other.px)).not.toBe(hash(a.px));
      });
      it(`${c.name} v${v}: only recordable primitives (no ellipse, gradients, pixel access) and aux does not change the colour map`, () => {
        const plain = render(c.painter, c.w, c.h, 3, v);
        const withAux = render(c.painter, c.w, c.h, 3, v, true);
        for (const n of withAux.names) expect(ALLOWED.has(n)).toBe(true);
        expect(withAux.names.has('ellipse' as string)).toBe(false);
        expect(hash(withAux.px)).toBe(hash(plain.px));
      });
      it(`${c.name} v${v}: wraps variants (variant + n wraps)`, () => {
        const a = render(c.painter, c.w, c.h, 5, v);
        const b = render(c.painter, c.w, c.h, 5, v + c.variants);
        expect(hash(b.px)).toBe(hash(a.px));
      });
    }
  }
});

describe('industrial painters: tileability', () => {
  const bothAxes: Case[] = CASES.filter((c) => ['corrugatedSteel', 'chainlinkFence', 'tarRoof'].includes(c.name));
  const xOnly: Case[] = CASES.filter((c) => ['graniteCurb', 'castIronFence', 'chainlinkRail'].includes(c.name));
  const tol = (s: { seam: number; typical: number }): number => s.typical * 1.6 + 5;

  for (const c of [...bothAxes, ...xOnly]) {
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: left and right edge columns are continuous`, () => {
        const r = render(c.painter, c.w, c.h, 11, v);
        const s = seamX(r.px, c.w, c.h);
        expect(s.seam).toBeLessThanOrEqual(tol(s));
      });
    }
  }
  for (const c of bothAxes) {
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: top and bottom edge rows are continuous`, () => {
        const r = render(c.painter, c.w, c.h, 11, v);
        const s = seamY(r.px, c.w, c.h);
        expect(s.seam).toBeLessThanOrEqual(tol(s));
      });
    }
  }
});

describe('industrial painters: alpha coverage', () => {
  const ranges: Record<string, [number, number]> = {
    chainlinkFence: [0.1, 0.4],
    chainlinkRail: [0.3, 0.5],
    castIronFence: [0.15, 0.45],
    graffiti: [0.02, 0.65],
  };
  for (const [name, [lo, hi]] of Object.entries(ranges)) {
    const c = CASES.find((k) => k.name === name)!;
    for (let v = 0; v < c.variants; v++) {
      it(`${name} v${v}: alpha-tested coverage is within ${lo}..${hi}`, () => {
        const cov = alphaCoverage(render(c.painter, c.w, c.h, 21, v).px);
        expect(cov).toBeGreaterThanOrEqual(lo);
        expect(cov).toBeLessThanOrEqual(hi);
      });
    }
  }
  it('graffiti leaves a transparent margin and the buff patch is the largest piece', () => {
    const covs = Array.from({ length: GRAFFITI_VARIANTS }, (_, v) => alphaCoverage(render(graffitiPainter, 512, 256, 21, v).px));
    expect(covs[5]).toBeGreaterThan(0.25);
    for (let v = 0; v < 5; v++) expect(covs[v]).toBeLessThan(covs[5]);
    for (let v = 0; v < GRAFFITI_VARIANTS; v++) {
      const px = render(graffitiPainter, 512, 256, 21, v).px;
      let edgeOpaque = 0;
      for (let x = 0; x < 512; x++) {
        if (px[x * 4 + 3] > 127) edgeOpaque++;
        if (px[((255 * 512) + x) * 4 + 3] > 127) edgeOpaque++;
      }
      expect(edgeOpaque).toBe(0);
    }
  });
  it('graffiti uses a 4-6 colour spray palette and no lettering calls', () => {
    expect(GRAFFITI_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(GRAFFITI_COLORS.length).toBeLessThanOrEqual(6);
    for (let v = 0; v < GRAFFITI_VARIANTS; v++) {
      const names = render(graffitiPainter, 512, 256, 1, v).names;
      expect(names.has('fillText' as string)).toBe(false);
    }
  });
  for (const name of ['corrugatedSteel', 'graniteCurb', 'tarRoof']) {
    const c = CASES.find((k) => k.name === name)!;
    for (let v = 0; v < c.variants; v++) {
      it(`${name} v${v}: opaque everywhere`, () => {
        const px = render(c.painter, c.w, c.h, 2, v).px;
        let minA = 255;
        for (let i = 3; i < px.length; i += 4) minA = Math.min(minA, px[i]);
        expect(minA).toBe(255);
      });
    }
  }
});

describe('industrial painters: look sanity', () => {
  it('chain-link wire pitch is 50 mm: diamonds are 32 px wide, 64 px tall (perpendicular pitch 28.6 px)', () => {
    const px = render(chainlinkFencePainter, 256, 256, 4, 0).px;
    // along row 16 (a knuckle row, y multiple of 32 -> 0, 32 ...), wire centres repeat every 32 px / 2
    const row = 100;
    const hits: number[] = [];
    for (let x = 0; x < 256; x++) if (px[(row * 256 + x) * 4 + 3] >= 128 && (x === 0 || px[(row * 256 + x - 1) * 4 + 3] < 128)) hits.push(x);
    expect(hits.length).toBeGreaterThanOrEqual(12);
    const gaps = hits.slice(1).map((x, i) => x - hits[i]);
    // two wire families -> crossings alternate; the sum of two consecutive gaps is one full 32 px period
    for (let i = 0; i + 1 < gaps.length; i += 2) expect(gaps[i] + gaps[i + 1]).toBe(32);
  });

  it('corrugation: 76 mm ribs, 16 per tile, crest columns lighter than trough columns in the relief map', () => {
    const r = render(corrugatedSteelPainter, 512, 512, 9, 0, true);
    const hp = r.h!;
    const at = (x: number, y: number): number => hp[(y * 512 + x) * 4];
    // pick a row away from fasteners: crest at x = 16 + 32 k, trough at x = 32 k
    for (let k = 1; k < 15; k++) expect(at(32 * k + 16, 200)).toBeGreaterThan(at(32 * k, 200) + 80);
  });

  it('tar roof: asphalt is dark, aluminium coating is light; seams every 0.9 m (two per tile)', () => {
    const l0 = meanLuma(render(tarRoofPainter, 512, 512, 2, 0).px);
    const l1 = meanLuma(render(tarRoofPainter, 512, 512, 2, 1).px);
    const l2 = meanLuma(render(tarRoofPainter, 512, 512, 2, 2).px);
    expect(l0).toBeLessThan(90);
    expect(l1).toBeGreaterThan(l0 + 40);
    expect(l2).toBeLessThan(110);
    const px = render(tarRoofPainter, 512, 512, 2, 0).px;
    const colMean = (x: number): number => {
      let s = 0;
      for (let y = 0; y < 512; y++) s += px[(y * 512 + x) * 4];
      return s / 512;
    };
    // seam columns (x = 0 / 1 and 255 / 256) are the darkest of their neighbourhood
    expect(colMean(255)).toBeLessThan(colMean(240) - 5);
    expect(colMean(0)).toBeLessThan(colMean(16) - 5);
  });

  it('granite curb: dark gutter at the foot, brighter chamfer than face', () => {
    const px = render(graniteCurbPainter, 512, 128, 6, 0).px;
    const rowMean = (y: number): number => {
      let s = 0;
      for (let x = 8; x < 504; x++) s += px[(y * 512 + x) * 4];
      return s / 496;
    };
    const top = rowMean(30), cham = rowMean(Math.round(128 * 0.5)), face = rowMean(80), gutter = rowMean(125);
    expect(gutter).toBeLessThan(face - 20);
    expect(cham).toBeGreaterThan(face + 25);
    expect(top).toBeGreaterThan(face);
  });

  it('cast iron is near black', () => {
    for (let v = 0; v < CAST_IRON_VARIANTS; v++) {
      const px = render(castIronFencePainter, 256, 256, 8, v).px;
      let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { s += px[i] + px[i + 1] + px[i + 2]; n += 3; }
      expect(s / n).toBeLessThan(70);
    }
  });
});

describe('MaterialLibrary wiring for the industrial keys', () => {
  const recordingFactory = (w: number, h: number): HTMLCanvasElement => {
    const state: Record<string, unknown> = { globalAlpha: 1, font: '10px sans-serif' };
    const ctx = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop in state) return state[prop];
        if (prop === 'ellipse') throw new Error('ctx.ellipse is not supported by the fake canvas');
        return () => undefined;
      },
      set(_t, prop: string, v) { state[prop] = v; return true; },
    });
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };
  const keys: [MaterialKey, number, boolean][] = [
    ['corrugatedSteel', CORRUGATED_VARIANTS, false], ['chainlinkFence', CHAINLINK_FENCE_VARIANTS, true],
    ['chainlinkRail', CHAINLINK_RAIL_VARIANTS, false], ['graniteCurb', GRANITE_CURB_VARIANTS, false],
    ['castIronFence', CAST_IRON_VARIANTS, true], ['tarRoof', TAR_ROOF_VARIANTS, false], ['graffiti', GRAFFITI_VARIANTS, true],
  ];
  for (const [key, n, alpha] of keys) {
    it(`${key}: builds ${n} variants with a map; alpha-tested keys are transparent with an alpha test`, () => {
      const lib = new MaterialLibrary(new Rng(5), recordingFactory);
      for (let v = 0; v < n; v++) {
        const m = lib.get(key, v) as THREE.MeshStandardMaterial;
        expect(m.map).toBeTruthy();
        if (alpha) {
          expect(m.transparent).toBe(true);
          expect(m.alphaTest).toBeGreaterThan(0);
        }
      }
      expect(lib.get(key, n)).toBe(lib.get(key, 0)); // wraps
    });
  }
});
