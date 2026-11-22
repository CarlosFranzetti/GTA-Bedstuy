/**
 * COMBAT2: how much a person can take, and what kind of person they are when it kicks off. Pure numbers, no three.js, no random
 * draws (everything comes from a hash of the person's id, so a person is the same person every run).
 *
 *   health   by age and build: a frail person goes down in about four jabs, a big one in about seven
 *   strikes  a jab 12, a heavy punch 24, a thrown bottle 14, a brick 22, a club 36, a shot 45, a shotgun blast 60 (up to a max, by range)
 *   outcome  'stagger' (a step back), 'down' (on the ground for a few seconds), 'out' (knocked out: down for a good while)
 *   temper   flee, cower, film it, or fight back: seeded shares by age
 */
export type Age = 'kid' | 'teen' | 'adult' | 'old';
export type Build = 'frail' | 'slight' | 'average' | 'big' | 'heavy';
export type Temperament = 'flee' | 'cower' | 'film' | 'fight';
export type Force = 'light' | 'heavy' | 'thrown' | 'shot' | 'club' | 'blast';
export type Outcome = 'stagger' | 'down' | 'out';

export const hashUnit = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** Health of an average adult; the others scale from it. */
export const BASE_HEALTH: Record<Age, number> = { kid: 30, teen: 48, adult: 60, old: 42 };
export const BUILD_FACTOR: Record<Build, number> = { frail: 0.7, slight: 0.88, average: 1, big: 1.2, heavy: 1.4 };
/** Upper bounds of the hash that pick a build: 12 percent frail, then slight, average, big, heavy. */
const BUILD_CUTS: ReadonlyArray<[number, Build]> = [[0.12, 'frail'], [0.32, 'slight'], [0.68, 'average'], [0.88, 'big'], [1.01, 'heavy']];

export function buildFor(id: string): Build {
  const u = hashUnit(`${id}:build`);
  for (const [cut, b] of BUILD_CUTS) if (u < cut) return b;
  return 'average';
}

export function maxHealthFor(age: Age, build: Build): number { return Math.round(BASE_HEALTH[age] * BUILD_FACTOR[build]); }

/** Shares of each temperament by age (they sum to 1). */
export const TEMPER_SHARES: Record<Age, Record<Temperament, number>> = {
  adult: { flee: 0.45, cower: 0.15, film: 0.22, fight: 0.18 },
  teen: { flee: 0.45, cower: 0.12, film: 0.33, fight: 0.10 },
  old: { flee: 0.40, cower: 0.30, film: 0.25, fight: 0.05 },
  kid: { flee: 0.60, cower: 0.40, film: 0, fight: 0 },
};
const ORDER: Temperament[] = ['flee', 'cower', 'film', 'fight'];

export function temperamentFor(id: string, age: Age): Temperament {
  const u = hashUnit(`${id}:temper`), s = TEMPER_SHARES[age];
  let acc = 0;
  for (const t of ORDER) { acc += s[t]; if (u < acc) return t; }
  return 'flee';
}

/** Default damage of each kind of blow. */
export const DAMAGE: Record<Force, number> = { light: 12, heavy: 24, thrown: 20, shot: 45, club: 36, blast: 60 };
/** Kinds of blow that always put a person on the ground. */
const KNOCKS: ReadonlySet<Force> = new Set(['heavy', 'thrown', 'shot', 'club', 'blast']);
/** A second jab inside this many seconds knocks a person down; below this share of health a jab does too. */
export const HIT_MEMORY = 6;
export const REELING_SHARE = 0.4;
/** Seconds on the ground: knocked down, and knocked out (each person 0 to 1 of the spread on top). */
export const DOWN_SECONDS = 6;
export const OUT_SECONDS = 24;
export const OUT_SPREAD = 14;

export class PedVitals {
  readonly max: number;
  health: number;
  readonly build: Build;
  readonly temper: Temperament;
  /** a mission person who must not stay out */
  immune = false;
  /** seconds since the last blow (the jab memory) */
  sinceHit = 1e9;
  /** number of blows taken */
  hits = 0;
  out = false;

  constructor(readonly id: string, readonly age: Age = 'adult') {
    this.build = buildFor(id);
    this.max = maxHealthFor(age, this.build);
    this.health = this.max;
    this.temper = temperamentFor(id, age);
  }

  get fraction(): number { return Math.max(0, this.health / this.max); }
  /** has taken enough to show it (a bloodied nose, a dark drip) */
  get hurt(): boolean { return this.health < this.max * 0.6; }

  /** Take a blow. A person who is already out takes damage but stays out (the caller lengthens nothing). */
  strike(force: Force, damage: number = DAMAGE[force], onGround = false): Outcome {
    const memory = this.sinceHit < HIT_MEMORY;
    this.sinceHit = 0; this.hits++;
    this.health = Math.max(0, this.health - Math.max(0, damage));
    if (this.health <= 0 && !this.immune) { this.out = true; return 'out'; }
    if (this.health <= 0 && this.immune) this.health = 1;
    if (onGround) return 'down';
    if (KNOCKS.has(force) || memory || this.fraction < REELING_SHARE) return 'down';
    return 'stagger';
  }

  tick(dt: number): void { this.sinceHit += dt; }

  /** Seconds this person stays on the ground after `outcome`. */
  downSeconds(outcome: Outcome): number {
    if (outcome === 'out') return OUT_SECONDS + OUT_SPREAD * hashUnit(`${this.id}:out`);
    return DOWN_SECONDS;
  }

  /** Back on their feet: part of the health returns. */
  wake(): void { this.out = false; this.health = Math.max(this.health, Math.round(this.max * 0.35)); }
}
