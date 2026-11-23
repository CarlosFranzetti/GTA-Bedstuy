/**
 * SOMATO (round 3): the cast of body types as points in muscle by weight space, the seeded personal spread, and the street mix.
 * Draws 4,000 seeded people the way the street does (age and sex from the roster's weights, build from BODY_POOLS, the person from bodyBuildOf)
 * and prints and asserts the distributions. Set SOMATO_OUT=<file.json> to keep the numbers.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { BODY_POOLS, BODY_TYPES, CAST, SAFE, bodyBuildOf, bodyTypeId, bodyTypeOf, bmiOf, weightOfBmi, normCdf, normInv, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { PED_SPECS } from '@/textures/painters/ped';

const OLD_IDS: BodyTypeId[] = ['avg', 'slim', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'pear', 'petite', 'elder', 'teen', 'kid', 'lanky', 'swimmer', 'stoop-slim', 'elder-heavy', 'big-tall', 'pregnant', 'lean-teen', 'stout', 'slight'];
type Age = 'kid' | 'teen' | 'adult' | 'old';
// the street: age and sex shares from the roster the spawner draws from (civilians, by weight)
const share: Record<string, number> = {};
for (const s of PED_SPECS) if (s.role === 'civilian') { const k = `${s.age ?? 'adult'}-${s.sex === 'f' ? 'f' : 'm'}`; share[k] = (share[k] ?? 0) + (s.weight || 1); }
const KEYS = Object.keys(share), TOTAL = KEYS.reduce((a, k) => a + share[k], 0);
function mulberry(a: number): () => number { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickW = <T,>(r: () => number, l: Array<[T, number]>): T => { let t = l.reduce((a, [, w]) => a + w, 0) * r(); for (const [x, w] of l) { if (t < w) return x; t -= w; } return l[0][0]; };
interface P { age: Age; sex: 'm' | 'f'; type: BodyTypeId; w: number; m: number; bmi: number; h: number; neck: number }
function street(n: number, seed: number): P[] {
  const r = mulberry(seed), out: P[] = [];
  for (let i = 0; i < n; i++) {
    const k = pickW(r, KEYS.map((x) => [x, share[x]] as [string, number])), [age, sex] = k.split('-') as [Age, 'm' | 'f'];
    const type = pickW(r, BODY_POOLS[`${age}-${sex}`]);
    const spec = { id: `person-${seed}-${i}`, build: 'avg' as const, sex, age, role: 'civilian' as const, body: type };
    const b = bodyBuildOf(spec);
    out.push({ age, sex, type, w: b.weight, m: b.muscle, bmi: b.bmi, h: b.statureM, neck: b.neckCm });
  }
  return out;
}
const q = (a: number[], p: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const f = (x: number, d = 2): string => x.toFixed(d);
const N = 4000, pop = street(N, 20261123);

describe('SOMATO: the cast', () => {
  it('every old body type id still resolves, in the legacy view and the new one, and the cast covers every id', () => {
    for (const id of OLD_IDS) {
      expect(BODY_TYPES[id], id).toBeTruthy(); expect(CAST[id], id).toBeTruthy();
      const spec = { id: 'old-' + id, build: 'avg' as const, sex: 'm' as const, age: 'adult' as const, role: 'civilian' as const, body: id };
      expect(bodyTypeId(spec)).toBe(id); expect(bodyTypeOf(spec).h).toBeGreaterThan(0.7); expect(bodyBuildOf(spec).type).toBe(id);
    }
    expect(Object.keys(CAST).sort()).toEqual(Object.keys(BODY_TYPES).sort());
    for (const k of Object.keys(BODY_POOLS)) for (const [t] of BODY_POOLS[k]) expect(BODY_TYPES[t], t).toBeTruthy();
  });
  it('the normal distribution helpers and the BMI calibration are consistent', () => {
    for (const p of [0.05, 0.3, 0.5, 0.9, 0.995]) expect(normCdf(normInv(p))).toBeCloseTo(p, 4);
    for (const age of ['adult', 'old', 'teen', 'kid'] as const) for (const m of [-0.5, 0, 0.8]) for (const bmi of [18, 22, 27, 33]) {
      const w = weightOfBmi(bmi, m, age); expect(bmiOf(w, m, age)).toBeCloseTo(bmi, 5);
    }
    // heavier BMI is a higher weight coordinate, and muscle at the same BMI means a lower weight coordinate
    expect(weightOfBmi(33, 0, 'adult')).toBeGreaterThan(weightOfBmi(22, 0, 'adult'));
    expect(weightOfBmi(26, 1, 'adult')).toBeLessThan(weightOfBmi(26, 0, 'adult'));
  });
  it('the types read as what they are called: ectomorphs are lean, endomorphs soft and heavy, mesomorphs muscular, skinny-fat soft without muscle', () => {
    const w = (id: BodyTypeId): number => weightOfBmi(CAST[id].bmi, CAST[id].muscle, CAST[id].age);
    expect(w('ecto')).toBeLessThan(-0.4); expect(CAST.ecto.muscle).toBeLessThan(0);
    expect(CAST.athletic.muscle).toBeGreaterThanOrEqual(0.9); expect(w('athletic')).toBeLessThan(w('avg'));
    expect(w('heavy')).toBeGreaterThan(0.6); expect(w('obese')).toBeGreaterThan(w('heavy'));
    expect(CAST['skinny-fat'].muscle).toBeLessThan(-0.7); expect(w('skinny-fat')).toBeGreaterThan(0);
    expect(CAST.broad.muscle).toBeGreaterThan(0.5); expect(w('broad')).toBeGreaterThan(0.2);
    expect(CAST.wiry.muscle).toBeGreaterThan(0.3); expect(w('wiry')).toBeLessThan(0);
    for (const id of Object.keys(CAST) as BodyTypeId[]) expect(CAST[id].about.length, id).toBeGreaterThan(20);
  });
});

describe('SOMATO: 4,000 seeded people', () => {
  const rows: string[] = [], keep: Record<string, unknown> = {};
  it('coordinates by age and sex (printed), always inside the safe range', () => {
    for (const age of ['adult', 'old', 'teen', 'kid'] as const) for (const sex of ['m', 'f'] as const) {
      const g = pop.filter((p) => p.age === age && p.sex === sex); if (!g.length) continue;
      const W = g.map((p) => p.w), M = g.map((p) => p.m), B = g.map((p) => p.bmi), H = g.map((p) => p.h);
      rows.push(`${age.padEnd(5)} ${sex} n=${String(g.length).padStart(4)}  weight P5/50/95 ${f(q(W, .05))} ${f(q(W, .5))} ${f(q(W, .95))}  muscle ${f(q(M, .05))} ${f(q(M, .5))} ${f(q(M, .95))}  bmi ${f(q(B, .05), 1)} ${f(q(B, .5), 1)} ${f(q(B, .95), 1)}  stature ${f(q(H, .05))} ${f(q(H, .5))} ${f(q(H, .95))} (min ${f(Math.min(...H))} max ${f(Math.max(...H))})`);
      keep[`${age}-${sex}`] = { n: g.length, weight: [q(W, .05), q(W, .5), q(W, .95)], muscle: [q(M, .05), q(M, .5), q(M, .95)], bmi: [q(B, .05), q(B, .5), q(B, .95)], stature: [q(H, .05), q(H, .5), q(H, .95)] };
    }
    console.log('SOMATO coordinates\n' + rows.join('\n'));
    for (const p of pop) { expect(p.w).toBeGreaterThanOrEqual(SAFE.weight[0]); expect(p.w).toBeLessThanOrEqual(SAFE.weight[1]); expect(p.m).toBeGreaterThanOrEqual(SAFE.muscle[0]); expect(p.m).toBeLessThanOrEqual(SAFE.muscle[1]); }
  });
  it('adult statures follow the survey: median and 5th to 95th percentile by sex, and nobody outside them', () => {
    const want = { m: [1.648, 1.755, 1.87], f: [1.525, 1.626, 1.74] } as const;
    for (const sex of ['m', 'f'] as const) {
      const H = pop.filter((p) => p.age === 'adult' && p.sex === sex).map((p) => p.h);
      expect(H.length).toBeGreaterThan(300);
      const [lo, med, hi] = want[sex];
      // a truncated normal: nobody under the survey's P5 or over its P95; the 5th and 95th percentile OF THE STREET sit a little inside them (z = 1.31)
      expect(Math.abs(q(H, 0.5) - med)).toBeLessThan(0.012); expect(Math.min(...H)).toBeGreaterThan(lo - 0.001); expect(Math.max(...H)).toBeLessThan(hi + 0.001);
      expect(q(H, 0.05)).toBeLessThan(lo + 0.03); expect(q(H, 0.95)).toBeGreaterThan(hi - 0.03);
    }
  });
  it('the street BMI mix: about a third normal or under, a third overweight, a third obese; more stocky and heavy than slim', () => {
    for (const grp of ['adult', 'all grown'] as const) {
      const g = pop.filter((p) => (grp === 'adult' ? p.age === 'adult' : p.age === 'adult' || p.age === 'old'));
      const under = g.filter((p) => p.bmi < 25).length / g.length, over = g.filter((p) => p.bmi >= 25 && p.bmi < 30).length / g.length, obese = g.filter((p) => p.bmi >= 30).length / g.length;
      console.log(`SOMATO BMI mix ${grp}: under 25 ${f(under * 100, 0)}%, 25 to 30 ${f(over * 100, 0)}%, 30 and over ${f(obese * 100, 0)}% (n=${g.length}); under 18.5 ${f(g.filter((p) => p.bmi < 18.5).length / g.length * 100, 1)}%, 35 and over ${f(g.filter((p) => p.bmi >= 35).length / g.length * 100, 1)}%`);
      keep[`mix-${grp}`] = { under, over, obese };
      if (grp === 'adult') { expect(under).toBeGreaterThan(0.28); expect(under).toBeLessThan(0.40); expect(over).toBeGreaterThan(0.27); expect(over).toBeLessThan(0.40); expect(obese).toBeGreaterThan(0.27); expect(obese).toBeLessThan(0.40); expect(over + obese).toBeGreaterThan(under * 1.6); }
    }
    // the tails exist: lean people and very heavy people, in the thousands-of-people sense
    const A = pop.filter((p) => p.age === 'adult');
    expect(A.filter((p) => p.bmi < 20).length / A.length).toBeGreaterThan(0.06);
    expect(A.filter((p) => p.bmi >= 35).length / A.length).toBeGreaterThan(0.06);
  });
  it('men are more muscular when younger on average, women less muscular than men', () => {
    const mm = (a: P[]): number => a.reduce((s, p) => s + p.m, 0) / a.length;
    const men = pop.filter((p) => p.age === 'adult' && p.sex === 'm'), women = pop.filter((p) => p.age === 'adult' && p.sex === 'f');
    console.log(`SOMATO muscle mean: men ${f(mm(men))}, women ${f(mm(women))}`);
    expect(mm(men)).toBeGreaterThan(mm(women) - 0.05);
    // the same type, different ages: build a young and an old man of one type through the seeded latent age
    const same = Array.from({ length: 800 }, (_, i) => bodyBuildOf({ id: `age-${i}`, build: 'avg', sex: 'm', age: 'adult', role: 'civilian', body: 'avg' }));
    expect(same.some((b) => b.muscle > 0.15)).toBe(true); expect(same.some((b) => b.muscle < -0.4)).toBe(true);
  });
  it('the share of each named type, and every pool type is on the street', () => {
    const cnt: Record<string, number> = {}; for (const p of pop) cnt[p.type] = (cnt[p.type] ?? 0) + 1;
    const lines = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${f(c / N * 100, 1)}%`);
    console.log('SOMATO type shares: ' + lines.join(', '));
    keep.types = cnt;
    const used = new Set<string>(); for (const k of Object.keys(BODY_POOLS)) for (const [t] of BODY_POOLS[k]) used.add(t);
    for (const t of used) expect(cnt[t] ?? 0, t).toBeGreaterThan(0);
    const heavyish = ['heavy', 'stout', 'big-tall', 'obese', 'soft', 'broad', 'short-stocky', 'pear', 'elder-heavy', 'heavy-teen', 'chubby-kid'].reduce((a, t) => a + (cnt[t] ?? 0), 0);
    const slimish = ['ecto', 'slim', 'tall-thin', 'lanky', 'petite', 'slight', 'stoop-slim', 'lean-teen', 'slight-kid'].reduce((a, t) => a + (cnt[t] ?? 0), 0);
    expect(heavyish).toBeGreaterThan(slimish * 1.5);
  });
  it('a crowd of forty shows the tails: lean, heavy, tall and short people, in nearly every crowd', () => {
    let lean = 0, heavy = 0, tall = 0, short = 0, strong = 0, crowds = 200;
    for (let c = 0; c < crowds; c++) {
      const cr = street(40, 9000 + c).filter((p) => p.age === 'adult');
      if (cr.some((p) => p.bmi < 20)) lean++; if (cr.some((p) => p.bmi >= 35)) heavy++;
      if (cr.some((p) => (p.sex === 'm' ? p.h >= 1.82 : p.h >= 1.69))) tall++; if (cr.some((p) => (p.sex === 'm' ? p.h <= 1.69 : p.h <= 1.57))) short++;
      if (cr.some((p) => p.sex === 'm' && p.m > 0.8)) strong++;
    }
    console.log(`SOMATO crowds of 40 with at least one: lean ${lean}/200, very heavy ${heavy}/200, tall ${tall}/200, short ${short}/200, muscular man ${strong}/200`);
    for (const x of [lean, heavy, tall, short, strong]) expect(x / crowds).toBeGreaterThan(0.85);
  });
  it('is deterministic, and two people of one type differ', () => {
    const mk = (id: string) => ({ id, build: 'avg' as const, sex: 'f' as const, age: 'adult' as const, role: 'civilian' as const, body: 'soft' as BodyTypeId });
    expect(bodyBuildOf(mk('a'))).toEqual(bodyBuildOf(mk('a')));
    const seen = new Set<string>(); let samePair = 0;
    for (let i = 0; i < 200; i++) { const b = bodyBuildOf(mk('p' + i)); seen.add(`${b.weight.toFixed(3)}|${b.muscle.toFixed(3)}|${b.statureM.toFixed(3)}`); if (i && b.statureM === bodyBuildOf(mk('p' + (i - 1))).statureM) samePair++; }
    expect(seen.size).toBe(200); expect(samePair).toBe(0);
    const a = bodyBuildOf(mk('x1')), b = bodyBuildOf(mk('x2'));
    expect(Math.abs(a.weight - b.weight) + Math.abs(a.muscle - b.muscle) + Math.abs(a.statureM - b.statureM)).toBeGreaterThan(0.001);
    // the draw does not depend on another person: the same id in another order gives the same build
    const first = bodyBuildOf(mk('z9')); bodyBuildOf(mk('z8')); expect(bodyBuildOf(mk('z9'))).toEqual(first);
  });
  it('frame draws stay small and the neck varies on lean and heavy people alike', () => {
    const adults = Array.from({ length: 1000 }, (_, i) => bodyBuildOf({ id: `fr-${i}`, build: 'avg', sex: 'm', age: 'adult', role: 'civilian', body: i % 2 ? 'obese' : 'ecto' }));
    for (const b of adults) { expect(b.shoulderK).toBeGreaterThan(0.93); expect(b.shoulderK).toBeLessThan(1.08); expect(b.legK).toBeGreaterThanOrEqual(0.97); expect(b.legK).toBeLessThanOrEqual(1.03); expect(Math.abs(b.neckCm)).toBeLessThan(4); }
    const sd = (a: number[]): number => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
    expect(sd(adults.filter((_, i) => i % 2).map((b) => b.neckCm))).toBeGreaterThan(1); expect(sd(adults.filter((_, i) => !(i % 2)).map((b) => b.neckCm))).toBeGreaterThan(1);
    if (process.env.SOMATO_OUT) writeFileSync(process.env.SOMATO_OUT, JSON.stringify(keep, null, 1));
  });
});
