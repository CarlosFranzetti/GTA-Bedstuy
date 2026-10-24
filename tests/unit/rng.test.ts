import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(1988), b = new Rng(1988);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
  it('differs for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('int is inclusive of both ends', () => {
    const r = new Rng('ints'); const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(0, 2));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
  it('fork is independent of later draws on the parent', () => {
    const p1 = new Rng(7), p2 = new Rng(7);
    const f1 = p1.fork('lots'); p2.next(); // fork taken at the same point in both? no: fork consumes one draw
    const f2 = new Rng(7).fork('lots');
    expect(f1.next()).toBe(f2.next());
    expect(f1.next()).not.toBe(p2.next());
  });
});
