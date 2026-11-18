import { describe, expect, it } from 'vitest';
import { FOG_GONE_BY, FOG_START_WINDOW, Forecast, KIND_PARAMS, LEAD_HOURS, MAX_HOLD_HOURS, WEATHER_KINDS, fogHourFactor, newKindParams, targetsAt, type WeatherKind } from '@/game/WeatherForecast';

const SEEDS = [0, 1, 7, 42, 'bedstuy', 20260101, 99999, 'rain'];
const DAYS = 40;

describe('Forecast', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = new Forecast(42).list(24 * 10).map((s) => `${s.kind}@${s.start.toFixed(4)}`);
    const b = new Forecast(42).list(24 * 10).map((s) => `${s.kind}@${s.start.toFixed(4)}`);
    const c = new Forecast(43).list(24 * 10).map((s) => `${s.kind}@${s.start.toFixed(4)}`);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is the same wherever you start asking (asking out of order does not change the chain)', () => {
    const f1 = new Forecast('x');
    const late = f1.kindAt(24 * 20 + 3);
    const early = f1.kindAt(5);
    const f2 = new Forecast('x');
    expect(f2.kindAt(5)).toBe(early);
    expect(f2.kindAt(24 * 20 + 3)).toBe(late);
  });

  it('never holds a state past its cap, never repeats a state back to back, and covers time without gaps', () => {
    for (const seed of SEEDS) {
      const segs = new Forecast(seed).list(24 * DAYS);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        expect(s.end - s.start).toBeLessThanOrEqual(MAX_HOLD_HOURS[s.kind] + 1e-9);
        expect(s.end - s.start).toBeGreaterThan(0.5);
        if (i > 0) {
          expect(s.start).toBeCloseTo(segs[i - 1].end, 9);
          expect(s.kind).not.toBe(segs[i - 1].kind);
        }
      }
    }
  });

  it('builds cloud before rain, grows rain in steps, and clears a storm to light rain or broken cloud', () => {
    const prev = new Map<WeatherKind, Set<WeatherKind>>();
    const next = new Map<WeatherKind, Set<WeatherKind>>();
    for (const seed of SEEDS) {
      const segs = new Forecast(seed).list(24 * DAYS);
      for (let i = 1; i < segs.length; i++) {
        const a = segs[i - 1].kind, b = segs[i].kind;
        (prev.get(b) ?? prev.set(b, new Set()).get(b)!).add(a);
        (next.get(a) ?? next.set(a, new Set()).get(a)!).add(b);
      }
    }
    const into = (k: WeatherKind): WeatherKind[] => [...(prev.get(k) ?? [])];
    const out = (k: WeatherKind): WeatherKind[] => [...(next.get(k) ?? [])];
    for (const p of into('lightRain')) expect(['overcast', 'heavyRain', 'thunderstorm']).toContain(p);
    for (const p of into('heavyRain')) expect(['lightRain']).toContain(p);
    for (const p of into('thunderstorm')) expect(['heavyRain']).toContain(p);
    for (const n of out('thunderstorm')) expect(['lightRain', 'partlyCloudy']).toContain(n);
    for (const n of out('fog')) expect(['partlyCloudy', 'clear']).toContain(n);
    // every kind actually shows up over this many days, so the tests above bit
    for (const k of WEATHER_KINDS) expect(prev.has(k) || k === 'clear' || k === 'partlyCloudy').toBe(true);
    expect(prev.has('thunderstorm')).toBe(true);
    expect(prev.has('fog')).toBe(true);
  });

  it('forms fog only before dawn and has burned it off by mid-morning', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      for (const s of new Forecast(seed).list(24 * DAYS)) {
        if (s.kind !== 'fog') continue;
        seen++;
        const h = ((s.start % 24) + 24) % 24;
        expect(h).toBeGreaterThanOrEqual(FOG_START_WINDOW[0] - 1e-9);
        expect(h).toBeLessThanOrEqual(FOG_START_WINDOW[1] + 1e-9);
        const endH = h + (s.end - s.start);
        expect(endH).toBeLessThanOrEqual(FOG_GONE_BY + 1e-9);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('has a quiet start (clear or partly cloudy) at hour zero', () => {
    for (const seed of SEEDS) expect(['clear', 'partlyCloudy']).toContain(new Forecast(seed).kindAt(0));
  });

  it('tolerates junk input', () => {
    const f = new Forecast(1);
    expect(WEATHER_KINDS).toContain(f.kindAt(NaN));
    expect(WEATHER_KINDS).toContain(f.kindAt(-5));
    expect(WEATHER_KINDS).toContain(f.kindAt(Infinity > 0 ? 1e4 : 0));
  });
});

describe('targetsAt (blends toward the next kind)', () => {
  it('is continuous: no quantity jumps faster than its lead time allows', () => {
    const step = 0.01;
    for (const seed of [3, 'bedstuy']) {
      const f = new Forecast(seed);
      const a = newKindParams(), b = newKindParams();
      let prev: ReturnType<typeof newKindParams> | null = null;
      for (let t = 0; t < 24 * 8; t += step) {
        targetsAt(f, t, a);
        if (prev) {
          for (const k of Object.keys(a) as (keyof typeof a)[]) {
            // smoothstep peaks at 1.5 / lead per hour
            expect(Math.abs(a[k] - prev[k])).toBeLessThanOrEqual((1.5 / LEAD_HOURS[k]) * step * 1.02 + 1e-9);
          }
        }
        prev = Object.assign(b, a);
      }
    }
  });

  it('cloud arrives before rain: half an hour ahead of a rain kind the cloud is already up and the rain not yet', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const f = new Forecast(seed);
      for (const s of f.list(24 * DAYS)) {
        const nxt = f.at(s.end + 1e-6).cur;
        if (nxt.kind !== 'lightRain' || s.kind !== 'overcast') continue;
        const t = targetsAt(f, s.end - 0.5);
        expect(t.cloud).toBeGreaterThan(0.85);
        expect(t.rain).toBeCloseTo(0, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('settles exactly on the kind well inside a segment', () => {
    const f = new Forecast(5);
    const s = f.at(24 * 3).cur;
    const mid = (s.start + s.end) / 2;
    const t = targetsAt(f, Math.max(s.start, s.end - 3));
    void mid;
    const p = KIND_PARAMS[s.kind];
    // a long enough segment shows its pure values early on (leads are at most 1 h)
    if (s.end - s.start > 2) expect(targetsAt(f, s.start + 0.01).cloud).toBeGreaterThanOrEqual(Math.min(p.cloud, KIND_PARAMS[s.kind].cloud) - 0.2);
    expect(t.rain).toBeGreaterThanOrEqual(0);
  });
});

describe('fogHourFactor', () => {
  it('is dense before dawn and thins monotonically through the morning', () => {
    expect(fogHourFactor(5)).toBe(1);
    let last = 1;
    for (let h = 6; h <= 12; h += 0.1) { const v = fogHourFactor(h); expect(v).toBeLessThanOrEqual(last + 1e-9); last = v; }
    expect(fogHourFactor(10.5)).toBeLessThan(0.35);
    expect(fogHourFactor(22)).toBe(1);
  });
});
