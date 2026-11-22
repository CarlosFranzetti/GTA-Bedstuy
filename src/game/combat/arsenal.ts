/**
 * COMBAT2: the weapons table. Pure data, no three.js. Everything here is invented or generic: no weapon, name, sound or animation is
 * taken from a game, and no real gun brand or model name is used.
 *
 *   melee   a baseball bat (two-hit swing), a length of pipe (slow, heavy), a frozen fish (the joke one)
 *   thrown  a bottle, a brick (see projectile.ts)
 *   guns    a pistol (12 rounds), a revolver (six shots, slow, loud), a pump shotgun (spread of pellets, a pump between shots)
 * One melee weapon, any thrown items and two guns can be carried at once (Hands).
 */
import type { Force } from '@/entities/pedVitals';

export type MeleeId = 'bat' | 'pipe' | 'fish';
export type GunId = 'pistol' | 'revolver' | 'shotgun';
export const MELEE_IDS: readonly MeleeId[] = ['bat', 'pipe', 'fish'];
export const GUN_IDS: readonly GunId[] = ['pistol', 'revolver', 'shotgun'];
export const MAX_GUNS = 2;

export interface MeleeDef {
  id: MeleeId;
  name: string;
  /** from the body centre to the target centre (m) */
  reach: number;
  arcDeg: number;
  /** seconds per swing, and the share of it at which the blow lands */
  swing: number;
  impactAt: number;
  /** a press this soon after a swing ends continues the chain */
  comboWindow: number;
  /** swings in a chain (the pose alternates forehand and backhand) */
  chain: number;
  /** damage and force of each swing of the chain */
  hits: ReadonlyArray<{ damage: number; force: Force }>;
  /** blows before it breaks (0 = never) */
  uses: number;
  /** the swing's pose */
  poses: ReadonlyArray<'swingR' | 'swingL' | 'smash'>;
}

export const MELEE: Record<MeleeId, MeleeDef> = {
  bat: { id: 'bat', name: 'Baseball bat', reach: 1.9, arcDeg: 100, swing: 0.55, impactAt: 0.45, comboWindow: 0.5, chain: 2, hits: [{ damage: 30, force: 'club' }, { damage: 38, force: 'club' }], uses: 0, poses: ['swingR', 'swingL'] },
  pipe: { id: 'pipe', name: 'Length of pipe', reach: 1.8, arcDeg: 80, swing: 0.85, impactAt: 0.5, comboWindow: 0.4, chain: 1, hits: [{ damage: 48, force: 'club' }], uses: 0, poses: ['smash'] },
  fish: { id: 'fish', name: 'Frozen fish', reach: 1.5, arcDeg: 90, swing: 0.42, impactAt: 0.45, comboWindow: 0.5, chain: 2, hits: [{ damage: 9, force: 'heavy' }, { damage: 9, force: 'heavy' }], uses: 12, poses: ['swingR', 'swingL'] },
};

export interface GunDef {
  id: GunId;
  name: string;
  /** rounds in the gun and the most spare rounds */
  mag: number;
  maxReserve: number;
  /** seconds between shots, the extra pause for a pump, the reload */
  fireInterval: number;
  pump: number;
  reload: number;
  range: number;
  /** damage per bullet or pellet, pellets per shot, spread (degrees, full cone) */
  damage: number;
  pellets: number;
  spreadDeg: number;
  force: Force;
  /** how far a shot is heard by people (they scatter inside the first, shout inside the second), metres */
  fleeRadius: number;
  shoutRadius: number;
  /** rounds one ammo box gives */
  box: number;
}

export const GUNS: Record<GunId, GunDef> = {
  pistol: { id: 'pistol', name: 'Pistol', mag: 12, maxReserve: 60, fireInterval: 1 / 3, pump: 0, reload: 1.5, range: 60, damage: 45, pellets: 1, spreadDeg: 0, force: 'shot', fleeRadius: 15, shoutRadius: 30, box: 12 },
  revolver: { id: 'revolver', name: 'Six-shooter', mag: 6, maxReserve: 36, fireInterval: 0.7, pump: 0, reload: 2.6, range: 70, damage: 70, pellets: 1, spreadDeg: 0, force: 'shot', fleeRadius: 22, shoutRadius: 42, box: 6 },
  shotgun: { id: 'shotgun', name: 'Pump shotgun', mag: 5, maxReserve: 25, fireInterval: 0.45, pump: 0.6, reload: 2.2, range: 22, damage: 14, pellets: 8, spreadDeg: 11, force: 'blast', fleeRadius: 24, shoutRadius: 45, box: 5 },
};

/** Damage of a shotgun pellet at `dist` metres: full inside 8 m, falling to 40 percent at the end of the range. */
export function pelletDamage(def: GunDef, dist: number): number {
  const k = dist <= 8 ? 1 : Math.max(0.4, 1 - 0.6 * (dist - 8) / Math.max(1, def.range - 8));
  return def.damage * k;
}

/** The pellet directions of one shot: `n` offsets in radians across the cone (a fixed fan with a little seeded scatter). */
export function pelletOffsets(def: GunDef, seed: number): number[] {
  const out: number[] = [];
  if (def.pellets <= 1) return [0];
  const half = (def.spreadDeg * Math.PI) / 360;
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < def.pellets; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const jitter = ((s / 4294967296) - 0.5) * 0.35;
    const f = def.pellets === 1 ? 0 : (i / (def.pellets - 1)) * 2 - 1;
    out.push((f + jitter * 0.6) * half);
  }
  return out;
}
