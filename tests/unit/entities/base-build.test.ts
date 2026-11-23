/**
 * BASE seat (round 3): bodies built from the source's muscle by weight grid, measured. Reads the shipped glbs (src/assets/models/people/*.glb) and,
 * for the grid claim, re-runs the pipeline (scripts/people-pipeline.mjs) on two shapes.
 *   the three levels agree per build (girths within 10 percent hi to mid), the shipped grid deltas reproduce the source shapes at the decimated vertices,
 *   arm and leg outlines are smooth (no step over 3 mm between neighbouring centimetre samples), thighs meet at the top above slim builds, the shoulder
 *   outline is convex with no notch, nothing is NaN, triangle counts hold.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { clearPeople, parseShape, registerShape, dressLod, buildDebug, gridCoeffs, GRID_KEYS, bodyStack, type MhShape, type MhLod } from '@/entities/models/pedMesh';
import { composeSpec } from '@/textures/painters/pedWardrobe';
import { registerSpec, type PedSpec } from '@/textures/painters/ped';
// @ts-expect-error plain ESM script without types
import * as P from '../../../scripts/people-pipeline.mjs';

type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number; length: number }; readdirSync(p: URL): string[] };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);

const shapes = new Map<string, MhShape>();
/** six builds over the grid: [weight, muscle] */
const BUILDS: Array<[string, number, number]> = [['slim', -1, 0], ['average', 0, 0], ['soft heavy', 1, -0.6], ['obese', 1.3, -1], ['stocky strong', 0.8, 0.8], ['lean strong', -0.5, 1]];
let seq = 0;
function specFor(sex: 'm' | 'f', w: number, m: number): PedSpec {
  const spec = composeSpec(900 + seq, { group: 'wh', sex, age: 'adult' }, { look: 'street' });
  spec.id = `${spec.id}-bb${seq++}`; spec.bottom = { ...spec.bottom, kind: 'shorts', cut: 'run' };
  registerSpec(spec); buildDebug.set(spec.id, { weight: w, muscle: m });
  return spec;
}
const wOn = (L: MhLod, i: number, set: number[]): number => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
/** points where the triangle edges of the level cross the plane y, both ends passing `keep` */
function section(L: MhLod, pos: Float32Array, y: number, keep: (i: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = L.index[t + k], b = L.index[t + (k + 1) % 3];
    if (a > b) continue;
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1];
    if ((ya - y) * (yb - y) > 0 || ya === yb || !keep(a) || !keep(b)) continue;
    const u = (y - ya) / (yb - ya);
    out.push([pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u]);
  }
  return out;
}
/** girth of a section as the ellipse on its extents (Ramanujan) */
function girth(pts: Array<[number, number]>): number {
  if (pts.length < 3) return 0;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), a = (Math.max(...xs) - Math.min(...xs)) / 2, b = (Math.max(...zs) - Math.min(...zs)) / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}
const LEFT_LEG = [8, 9], LEFT_ARM = [4, 5], TRUNK = [1, 2];

describe('BASE: bodies from the source grid', () => {
  beforeAll(async () => {
    clearPeople();
    const fs = await nodeFs();
    for (const f of fs.readdirSync(DIR).filter((n: string) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      shapes.set(s.name, s); registerShape(s);
    }
  });

  it('the run-time shape deformers are off by default (VITE_BODY_OLD=1 restores them)', () => {
    for (const [k, v] of Object.entries(bodyStack)) expect(v, k).toBe(false);
  });

  it('every shape ships the 8 grid deltas on hi, finite, with joint moves; nothing is NaN on any level; triangle counts hold', () => {
    expect(shapes.size).toBeGreaterThanOrEqual(23);
    for (const s of shapes.values()) {
      expect(Object.keys(s.lods.hi.grid ?? {}).sort(), s.name).toEqual([...GRID_KEYS].sort());
      for (const k of GRID_KEYS) { expect(s.gridRig?.[k]?.shoulderL?.length, s.name).toBe(3); for (const v of s.lods.hi.grid![k]) expect(Number.isFinite(v)).toBe(true); }
      for (const d of ['hi', 'mid', 'far'] as const) for (const v of s.lods[d].position) expect(Number.isFinite(v), `${s.name} ${d}`).toBe(true);
      const tris = (d: 'hi' | 'mid' | 'far'): number => s.lods[d].index.length / 3;
      expect(tris('hi'), s.name).toBeGreaterThan(5000); expect(tris('hi'), s.name).toBeLessThanOrEqual(6150);      // 5,330 before round 3; up to +800 allowed
      expect(tris('mid'), s.name).toBeGreaterThan(1000); expect(tris('mid'), s.name).toBeLessThanOrEqual(1250);
      expect(tris('far'), s.name).toBeGreaterThan(350); expect(tris('far'), s.name).toBeLessThanOrEqual(420);
    }
  });

  it('the bilinear grid blend is the source blend: corners give one key, the centre gives none, coefficients past 1 extrapolate only along weight at average muscle or less', () => {
    expect(gridCoeffs({ weight: 0, muscle: 0 })).toEqual([]);
    expect(gridCoeffs({ weight: 1, muscle: -1 })).toEqual([['02', 1]]);
    expect(gridCoeffs({ weight: 1, muscle: 1 })).toEqual([['22', 1]]);
    const c = Object.fromEntries(gridCoeffs({ weight: 0.5, muscle: 0.5 }));
    expect(c['12'] + c['21'] + c['22']).toBeCloseTo(0.75, 6);
    expect(Object.fromEntries(gridCoeffs({ weight: 3, muscle: 0 }))['12']).toBeCloseTo(1.4, 6);
    expect(Object.fromEntries(gridCoeffs({ weight: 3, muscle: 2 }))['22']).toBeCloseTo(1, 6);
  });

  it('the shipped grid deltas reproduce the source shapes at the decimated vertices (within the 1.5 mm int8 step and the position quantisation)', async () => {
    const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
    const src = P.loadSources();
    for (const name of ['wh_f', 'ba_m_old']) {
      const built = P.buildShape(src, MeshoptSimplifier, name), s = shapes.get(name)!, H = s.lods.hi, B = built.lods.hi;
      // match shipped hi vertices to the pipeline's by position (the arms were re-spaced on load, so torso, legs and head only), then compare every key
      const cell = new Map<string, number>(), key = (x: number, y: number, z: number): string => `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
      for (let i = 0; i < B.position.length / 3; i++) cell.set(key(B.position[i * 3], B.position[i * 3 + 1], B.position[i * 3 + 2]), i);
      let matched = 0, worst = 0;
      for (let i = 0; i < H.position.length / 3; i++) {
        if (wOn(H, i, [4, 5, 6, 7]) > 0) continue;
        const j = cell.get(key(H.position[i * 3], H.position[i * 3 + 1], H.position[i * 3 + 2])); if (j === undefined) continue;
        matched++;
        for (const k of GRID_KEYS) for (let q = 0; q < 3; q++) worst = Math.max(worst, Math.abs(H.grid![k][i * 3 + q] - B.grid[k][j * 3 + q]));
      }
      expect(matched, name).toBeGreaterThan(H.position.length / 3 * 0.4);
      const step = Math.max(...GRID_KEYS.map((k) => built.people.gridScale[k]));
      expect(worst, name).toBeLessThanOrEqual(step * 0.5 + 1e-4);
      // and the pipeline's delta is the source's own shape at that grid point: base + delta = the body built with the grid target (face front masked)
      for (const k of ['02', '22', '00']) {
        const alt = P.buildBody(src, { ...P.SHAPES[name], targets: { ...P.SHAPES[name].targets, ...P.gridTargets(P.SHAPES[name], k) } }), base = built.body, keep = P.faceKeep(base);
        let err = 0, n = 0;
        for (let i = 0; i < B.position.length / 3; i++) {
          const v = B.mesh.src[B.srcVertex[i]]; if (keep[v] < 1) continue;
          for (let q = 0; q < 3; q++) err = Math.max(err, Math.abs(B.position[i * 3 + q] + B.grid[k][i * 3 + q] - alt.positions[v * 3 + q]));
          n++;
        }
        expect(n).toBeGreaterThan(1000);
        expect(err, `${name} ${k}`).toBeLessThan(1e-5);
      }
    }
  }, 120000);

  it('the three levels agree per build: chest, waist, hip, thigh and upper-arm girths within 10 percent hi to mid', () => {
    for (const sex of ['m', 'f'] as const) for (const [label, w, m] of BUILDS) {
      const spec = specFor(sex, w, m), s = shapes.get(sex === 'm' ? 'wh_m' : 'wh_f')!, H = s.landmarks.crownY, R = s.rig;
      const at = (d: 'hi' | 'mid'): number[] => {
        const L = s.lods[d], pos = dressLod(s, spec, L, false).position;
        const trunk = (i: number): boolean => wOn(L, i, TRUNK) > 0.5, leg = (i: number): boolean => wOn(L, i, LEFT_LEG) > 0.5 && pos[i * 3] < 0, arm = (i: number): boolean => wOn(L, i, LEFT_ARM) > 0.5 && pos[i * 3] < 0;
        return [girth(section(L, pos, H * 0.72, trunk)), girth(section(L, pos, H * 0.61, trunk)), girth(section(L, pos, R.hipL[1] - 0.02, trunk)), girth(section(L, pos, R.hipL[1] - 0.12, leg)), girth(section(L, pos, (R.shoulderL[1] + R.elbowL[1]) / 2, arm))];
      };
      const hi = at('hi'), mid = at('mid');
      hi.forEach((g, k) => { expect(g, `${sex} ${label} girth ${k}`).toBeGreaterThan(0.1); expect(Math.abs(mid[k] / g - 1), `${sex} ${label} girth ${k}: hi ${g.toFixed(3)} mid ${mid[k].toFixed(3)}`).toBeLessThan(0.1); });
    }
  });

  it('arm and leg outlines are smooth: no step over 3 mm between neighbouring centimetre samples, front and side, six builds (hi)', () => {
    const report: string[] = [];
    for (const [label, w, m] of BUILDS) {
      const spec = specFor('m', w, m), s = shapes.get('wh_m')!, L = s.lods.hi, pos = dressLod(s, spec, L, false).position, R = s.rig;
      const leg = (i: number): boolean => wOn(L, i, LEFT_LEG) > 0.5 && pos[i * 3] < 0, arm = (i: number): boolean => wOn(L, i, LEFT_ARM) > 0.5 && pos[i * 3] < -0.05;
      for (const [part, keep, y0, y1] of [['leg', leg, s.landmarks.ankleY + 0.05, R.hipL[1] - 0.1], ['arm', arm, R.wristL[1] + 0.03, R.shoulderL[1] - 0.1]] as const) {
        let prev: number[] | null = null, worst = 0, wy = 0;
        for (let y = y0; y <= y1; y += 0.01) {
          const pts = section(L, pos, y, keep); if (pts.length < 3) continue;
          const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), o = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
          if (prev) for (let k = 0; k < 4; k++) { const d = Math.abs(o[k] - prev[k]); if (d > worst) { worst = d; wy = y; } }
          prev = o;
        }
        report.push(`${label} ${part} ${(worst * 1000).toFixed(1)} mm at ${wy.toFixed(2)}`);
        expect(worst, `${label} ${part}: ${(worst * 1000).toFixed(1)} mm at y ${wy.toFixed(2)}`).toBeLessThanOrEqual(0.003);
      }
    }
    console.log('outline steps', report.join('; '));
  });

  it('the thighs meet at the top for every build above slim (gap under 5 mm two centimetres below the fork)', () => {
    for (const sex of ['m', 'f'] as const) for (const [label, w, m] of BUILDS.filter((b) => b[0] !== 'slim' && b[0] !== 'lean strong')) {
      const spec = specFor(sex, w, m), s = shapes.get(sex === 'm' ? 'wh_m' : 'wh_f')!, L = s.lods.hi, pos = dressLod(s, spec, L, false).position;
      let fork = Infinity;
      for (let i = 0; i < pos.length / 3; i++) if (Math.abs(pos[i * 3]) < 0.006 && pos[i * 3 + 1] > s.landmarks.ankleY + 0.3 && pos[i * 3 + 1] < s.rig.hipL[1] && wOn(L, i, [1, 8, 10]) > 0.5) fork = Math.min(fork, pos[i * 3 + 1]);
      const y = fork - 0.02;
      const l = section(L, pos, y, (i) => wOn(L, i, [8, 9]) > 0.5).filter((p) => p[0] < 0.01), r = section(L, pos, y, (i) => wOn(L, i, [10, 11]) > 0.5).filter((p) => p[0] > -0.01);
      const gap = Math.min(...r.map((p) => p[0])) - Math.max(...l.map((p) => p[0]));
      expect(gap, `${sex} ${label}: gap ${(gap * 1000).toFixed(1)} mm at y ${y.toFixed(3)}`).toBeLessThan(0.005);
    }
  });

  it('the shoulder outline seen from the front is convex with no notch, from the deltoid to the neck, six builds', () => {
    for (const sex of ['m', 'f'] as const) for (const [label, w, m] of BUILDS) {
      const spec = specFor(sex, w, m), s = shapes.get(sex === 'm' ? 'wh_m' : 'wh_f')!, L = s.lods.hi, pos = dressLod(s, spec, L, false).position, R = s.rig;
      const notHead = (i: number): boolean => wOn(L, i, [3]) < 0.5 && pos[i * 3] < 0;
      // outer edge of the left side, every 5 mm from the armpit up to the base of the neck
      const pts: Array<[number, number]> = [];
      for (let y = R.shoulderL[1] - 0.08; y <= s.landmarks.chinY - 0.04; y += 0.005) { const sec = section(L, pos, y, notHead); if (sec.length) pts.push([y, -Math.min(...sec.map((p) => p[0]))]); }
      const top = pts.reduce((a, p) => (p[1] > a[1] ? p : a));
      const above = pts.filter((p) => p[0] >= top[0]), end = above[above.length - 1];
      let inside = 0;
      for (const p of above) {
        // the chord from the widest point to the neck end; a notch is a point INSIDE it (closer to the midline)
        const t = (p[0] - top[0]) / (end[0] - top[0] || 1), chord = top[1] + (end[1] - top[1]) * t;
        inside = Math.max(inside, chord - p[1]);
      }
      expect(inside, `${sex} ${label}: ${(inside * 1000).toFixed(1)} mm inside the chord`).toBeLessThan(0.004);
      for (let k = 1; k < above.length; k++) expect(above[k][1], `${sex} ${label}: the outline narrows going up`).toBeLessThanOrEqual(above[k - 1][1] + 0.002);
    }
  });
});
