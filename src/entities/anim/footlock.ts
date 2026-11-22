/**
 * Feet that plant (ANIM2). Two parts, both in the figure's own space (the rig frame: x right, y up, forward is -z; the legs are children of the rig):
 *
 *  1. Sole height. `soleRel` finds how far below the hip pivot the lowest point of either shoe is for a pose (heel, ball and toe, so a foot that
 *     rolls or digs in is judged by its sole, not by the ankle). The controller sets the pelvis from it, so a planted shoe stands ON the ground and
 *     does not sink into it or hover.
 *  2. Foot lock. When a foot comes down (its sole within 2 cm of the ground) its ground point is remembered; while the foot stays down the ground
 *     moves back under the figure at the figure's own speed and the leg is bent or straightened (a two-bone solve, knee kept in the plane the
 *     capture chose) so the ankle holds that point. The lock fades with the sole's height, so as the heel lifts the capture takes over again.
 *     The foot's own tilt is kept (the ankle turns against the leg), so a locked shoe lies as flat as the capture had it.
 *
 * Pure maths on arrays and three vectors: no scene needed (tests/unit/entities/anim-measure.ts runs it headless).
 */
import * as THREE from 'three';
import { boneChannel } from './clipPack';

/** the shoe against its ankle pivot: the ankle's height above the sole, and where the heel, ball and toe are along the foot (forward is -z) */
export const FOOT = { ankleH: 0.075, heel: 0.07, ball: -0.12, toe: -0.2 };
const SOLE_Z = [FOOT.heel, FOOT.ball, FOOT.toe];

export interface LegDims {
  /** the leg pivot (hip) in the rig frame, the knee pivot in the leg frame, the ankle pivot in the knee frame */
  hip: [THREE.Vector3, THREE.Vector3];
  knee: [THREE.Vector3, THREE.Vector3];
  ankle: [THREE.Vector3, THREE.Vector3];
  /** whether the skeleton has ankle bones (else the shoe is fixed on the shin) */
  hasAnkle: boolean;
}

const eul = new THREE.Euler();
const qL = new THREE.Quaternion(), qK = new THREE.Quaternion(), qA = new THREE.Quaternion(), qLK = new THREE.Quaternion(), qW = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const quat = (out: THREE.Quaternion, p: Float32Array, o: number): THREE.Quaternion => out.setFromEuler(eul.set(p[o], p[o + 1], p[o + 2], 'XYZ'));

const SIDES = ['L', 'R'] as const;

/** How far below the leg pivots (negative) the lowest sole point is, over both legs, for the pose `p` and these dimensions. */
export function soleRel(p: Float32Array, d: LegDims, useAnkle: boolean): number {
  let low = 9;
  for (let s = 0; s < 2; s++) {
    quat(qL, p, boneChannel(('leg' + SIDES[s]) as 'legL'));
    quat(qK, p, boneChannel(('knee' + SIDES[s]) as 'kneeL'));
    qLK.copy(qL).multiply(qK);
    // ankle pivot relative to the leg pivot
    v1.copy(d.ankle[s]).applyQuaternion(qLK).add(v3.copy(d.knee[s]).applyQuaternion(qL));
    const ay = v1.y;
    if (d.hasAnkle && useAnkle) qW.copy(qLK).multiply(quat(qA, p, boneChannel(('ankle' + SIDES[s]) as 'ankleL'))); else qW.copy(qLK);
    for (const z of SOLE_Z) { v2.set(0, -FOOT.ankleH, z).applyQuaternion(qW); low = Math.min(low, ay + v2.y); }
  }
  return low;
}

/**
 * Where the ball of one foot is in the rig frame for a pose (x right, y up from the leg pivots' level, z back; the clip's own rig surge is NOT added): used to
 * tabulate how fast a clip's planted foot travels back at each phase (locomotion.ts `strideTable`). Writes [x, y, z] into `out`.
 */
export function ballRel(p: Float32Array, d: LegDims, side: 0 | 1, out: number[]): void {
  quat(qL, p, boneChannel(('leg' + SIDES[side]) as 'legL'));
  quat(qK, p, boneChannel(('knee' + SIDES[side]) as 'kneeL'));
  qLK.copy(qL).multiply(qK);
  v1.copy(d.ankle[side]).applyQuaternion(qLK).add(v3.copy(d.knee[side]).applyQuaternion(qL)).add(d.hip[side]);
  if (d.hasAnkle) qW.copy(qLK).multiply(quat(qA, p, boneChannel(('ankle' + SIDES[side]) as 'ankleL'))); else qW.copy(qLK);
  v2.set(0, -FOOT.ankleH, FOOT.ball).applyQuaternion(qW);
  out[0] = v1.x + v2.x; out[1] = v1.y + v2.y; out[2] = v1.z + v2.z;
}

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class FootLock {
  /** the lock weight of each foot (0 free .. 1 held) and its remembered ground point in the rig frame (x, z) */
  readonly w = [0, 0];
  private readonly held = [false, false];
  private readonly ax = [0, 0];
  private readonly az = [0, 0];
  private readonly prevHs = [1, 1];
  private readonly cx = [0, 0];
  private readonly cz = [0, 0];
  private readonly tx = [0, 0];
  private readonly tz = [0, 0];
  /** how far the pelvis was sunk this frame so held feet could be reached */
  drop = 0;
  /** the last pose's foot slip handed back, for tests: metres the ankle was moved from the capture's place */
  readonly pull = [0, 0];
  private readonly hv = new THREE.Vector3(); private readonly kv = new THREE.Vector3(); private readonly av = new THREE.Vector3(); private readonly tv = new THREE.Vector3();
  private readonly lq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly kq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly aq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];

  constructor(private readonly d: LegDims) {}

  reset(): void { this.w[0] = this.w[1] = 0; this.held[0] = this.held[1] = false; }

  /**
   * Hold planted feet. `p` is the final pose (Euler channels), `rig` the pelvis offset already chosen (lowered here when a held foot would
   * otherwise need a longer leg: the caller must write it back), `gs` the ground speed in the figure's units (m/s), `yaw` its turning rate
   * (rad/s, three's sense), `enable` 0..1 (0 for sitting, falling, jumping). Returns for each side whether the leg, knee and ankle quaternions in
   * `leg`, `knee`, `ankle` were overridden.
   */
  solve(p: Float32Array, rig: THREE.Vector3, dt: number, gs: number, yaw: number, enable: number, leg: THREE.Quaternion[], knee: THREE.Quaternion[], ankle: THREE.Quaternion[]): [boolean, boolean] {
    const d = this.d, res: [boolean, boolean] = [false, false];
    const cy = Math.cos(yaw * dt), sy = Math.sin(yaw * dt);
    // pass 1: which feet are down, where the ground point is now, and how far the pelvis must sink so the legs reach it
    let need = 0;
    for (let s = 0; s < 2; s++) {
      const lo = boneChannel(('leg' + SIDES[s]) as 'legL'), ko = boneChannel(('knee' + SIDES[s]) as 'kneeL'), ao = boneChannel(('ankle' + SIDES[s]) as 'ankleL');
      quat(qL, p, lo); quat(qK, p, ko); qLK.copy(qL).multiply(qK);
      const hip = this.hv.copy(d.hip[s]).add(rig);
      const A = this.av.copy(d.ankle[s]).applyQuaternion(qLK).add(this.kv.copy(d.knee[s]).applyQuaternion(qL)).add(hip);
      if (d.hasAnkle) qW.copy(qLK).multiply(quat(qA, p, ao)); else qW.copy(qLK);
      // the ball of the foot is what stays put in mid-stance (the foot rolls over it; the ankle travels forward by a foot length), so it is the held point
      this.tv.set(0, -FOOT.ankleH, FOOT.ball).applyQuaternion(qW);
      const bx = A.x + this.tv.x, bz = A.z + this.tv.z;
      // the foot is down when its lowest sole point is (heel, ball or toe), whichever that is
      const hs = A.y + this.tv.y;
      let low = hs;
      for (const z of [FOOT.heel, FOOT.toe]) { this.tv.set(0, -FOOT.ankleH, z).applyQuaternion(qW); low = Math.min(low, A.y + this.tv.y); }
      if (!this.held[s]) { if ((hs < 0.027 || (low < 0.012 && hs < 0.045)) && enable > 0.5) { this.held[s] = true; this.ax[s] = bx; this.az[s] = bz; } }
      else {
        // the ground moves back under the figure; a turn swings it round the figure's origin (a ground point turns the other way from the heading)
        const x = this.ax[s], z = this.az[s] + gs * dt;
        this.ax[s] = x * cy + z * sy; this.az[s] = -x * sy + z * cy;
        if (hs > 0.045 || enable < 0.2) this.held[s] = false;
      }
      // the weight fades only as the foot lifts (a foot coming down is taken at once)
      const rising = hs > this.prevHs[s] + 1e-5;
      this.prevHs[s] = hs;
      const target = this.held[s] ? (rising ? 1 - sstep(0.015, 0.045, hs) : 1) * enable : 0;
      this.w[s] += Math.max(-dt / 0.05, Math.min(dt / 0.025, target - this.w[s]));
      // held: the full offset to the ground point; once the foot is up the last offset is kept and fades with the weight (the anchor is stale by then)
      if (this.held[s]) { this.cx[s] = this.ax[s] - bx; this.cz[s] = this.az[s] - bz; }
      // a foot the capture drags far from its ground point (an acceleration the clip does not match) is let go gradually, never pulled hard
      const full = Math.hypot(this.cx[s], this.cz[s]), gain = this.w[s] * (1 - sstep(0.09, 0.26, full));
      const tx = this.cx[s] * gain, tz = this.cz[s] * gain;
      this.tx[s] = tx; this.tz[s] = tz;
      // sink needed: the horizontal distance to the target ankle fixes how far down it can be at full reach
      if (this.w[s] > 0.01) {
        const L = 0.985 * (d.knee[s].length() + d.ankle[s].length());
        const ux = A.x + tx - hip.x, uy = A.y - hip.y, uz = A.z + tz - hip.z, h2 = ux * ux + uz * uz;
        const dy = L * L > h2 ? -Math.sqrt(L * L - h2) - uy : 0.05;
        if (dy > 0) need = Math.max(need, Math.min(0.05, dy) * Math.min(1, this.w[s] * 2));
      }
    }
    // the pelvis sinks at once and rises back slowly (no pop either way)
    this.drop = Math.max(need, this.drop - 0.3 * dt);
    if (this.drop > 1e-5) rig.y -= this.drop;
    // pass 2: the two-bone solve for every foot that is held, or that must keep its place while the pelvis is lowered
    for (let s = 0; s < 2; s++) {
      const lo = boneChannel(('leg' + SIDES[s]) as 'legL'), ko = boneChannel(('knee' + SIDES[s]) as 'kneeL'), ao = boneChannel(('ankle' + SIDES[s]) as 'ankleL');
      const lift = this.drop;
      const tx = this.tx[s], tz = this.tz[s];
      this.pull[s] = Math.hypot(tx, tz);
      if (this.pull[s] < 1e-4 && lift < 1e-4) continue;
      quat(qL, p, lo); quat(qK, p, ko); qLK.copy(qL).multiply(qK);
      const hip = this.hv.copy(d.hip[s]).add(rig);
      const kneeOld = this.kv.copy(d.knee[s]).applyQuaternion(qL).add(hip);
      const A = this.av.copy(d.ankle[s]).applyQuaternion(qLK).add(kneeOld);
      const a = d.knee[s].length(), b = d.ankle[s].length();
      // the target: where the ankle was in the world (the pelvis has sunk, so a foot keeps its height by reaching), moved by the held offset
      const Tx = A.x + tx, Ty = A.y + lift, Tz = A.z + tz;
      const hx = hip.x, hy = hip.y, hz = hip.z, kx = kneeOld.x - hx, ky = kneeOld.y - hy, kz = kneeOld.z - hz;
      const dx = Tx - hx, dy = Ty - hy, dz = Tz - hz, dl = Math.hypot(dx, dy, dz);
      const dist = Math.min(Math.max(dl, Math.abs(a - b) + 1e-3), 0.992 * (a + b));
      const Dx = dx / dl, Dy = dy / dl, Dz = dz / dl;
      const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      // the knee stays on the side of the line the capture bent it to
      const kd = kx * Dx + ky * Dy + kz * Dz;
      let Px = kx - Dx * kd, Py = ky - Dy * kd, Pz = kz - Dz * kd;
      const pl = Math.hypot(Px, Py, Pz);
      // a leg that is nearly straight has no steady side of its own (its old knee sits on the line): the side fades to forward (-z, across the line) as the old bend fades
      const fz = -1, fd = fz * Dz, Fx = -Dx * fd, Fy = -Dy * fd, Fz = fz - Dz * fd, fl = Math.hypot(Fx, Fy, Fz) || 1;
      const bent = sstep(0.0005 * a, 0.01 * a, pl);
      if (pl < 1e-5) { Px = Fx; Py = Fy; Pz = Fz; } else { Px /= pl; Py /= pl; Pz /= pl; }
      Px = Px * bent + (Fx / fl) * (1 - bent); Py = Py * bent + (Fy / fl) * (1 - bent); Pz = Pz * bent + (Fz / fl) * (1 - bent);
      const pn = Math.hypot(Px, Py, Pz) || 1; Px /= pn; Py /= pn; Pz /= pn;
      const Kx = hx + a * (Dx * cosA + Px * sinA), Ky = hy + a * (Dy * cosA + Py * sinA), Kz = hz + a * (Dz * cosA + Pz * sinA);
      const Ex = hx + Dx * dist, Ey = hy + Dy * dist, Ez = hz + Dz * dist;   // the ankle as reached
      // thigh: the smallest swing from the old direction to the new, so the captured twist stays
      v1.set(kx, ky, kz).normalize();
      v2.set(Kx - hx, Ky - hy, Kz - hz).normalize();
      const swing = qW.setFromUnitVectors(v1, v2);
      const nl = this.lq[s].copy(swing).multiply(qL);
      // shin: the smallest swing, in the new thigh's frame, from where the capture had it to the new knee-to-ankle direction (the captured twist stays)
      v3.set(Ex - Kx, Ey - Ky, Ez - Kz).normalize().applyQuaternion(qW.copy(nl).invert());
      quat(qK, p, ko);
      v1.copy(d.ankle[s]).normalize().applyQuaternion(qK);
      const nk = this.kq[s].setFromUnitVectors(v1, v3).multiply(qK);
      // the solve is mixed in by how far it moves the foot (a straight captured leg gets a few degrees of bend from the reach limit; that must fade out, not pop off when the pull ends)
      const kk = sstep(0.0004, 0.012, Math.max(this.pull[s], lift));
      qW.setFromEuler(eul.set(p[lo], p[lo + 1], p[lo + 2], 'XYZ')); nl.copy(qW.slerp(nl, kk));
      qK.setFromEuler(eul.set(p[ko], p[ko + 1], p[ko + 2], 'XYZ')); nk.copy(qK.slerp(nk, kk));
      leg[s].copy(nl); knee[s].copy(nk);
      if (d.hasAnkle) {
        // the foot keeps the tilt it had in the capture: its world orientation is carried over
        quat(qA, p, ao);
        const world = qLK.copy(qL).multiply(qK.setFromEuler(eul.set(p[ko], p[ko + 1], p[ko + 2], 'XYZ'))).multiply(qA);
        ankle[s].copy(this.aq[s].copy(nl).multiply(nk).invert().multiply(world));
      }
      res[s] = true;
    }
    return res;
  }
}
