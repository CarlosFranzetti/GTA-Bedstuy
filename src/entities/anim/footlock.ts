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

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class FootLock {
  /** the lock weight of each foot (0 free .. 1 held) and its remembered ground point in the rig frame (x, z) */
  readonly w = [0, 0];
  private readonly held = [false, false];
  private readonly ax = [0, 0];
  private readonly az = [0, 0];
  /** the last pose's foot slip handed back, for tests: metres the ankle was moved from the capture's place */
  readonly pull = [0, 0];
  private readonly hv = new THREE.Vector3(); private readonly kv = new THREE.Vector3(); private readonly av = new THREE.Vector3(); private readonly tv = new THREE.Vector3();
  private readonly lq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly kq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly aq: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];

  constructor(private readonly d: LegDims) {}

  reset(): void { this.w[0] = this.w[1] = 0; this.held[0] = this.held[1] = false; }

  /**
   * Hold planted feet. `p` is the final pose (Euler channels), `rig` the pelvis offset already chosen, `gs` the ground speed in the figure's units
   * (m/s), `yaw` its turning rate (rad/s, three's sense), `enable` 0..1 (0 for sitting, falling, jumping). Returns for each side whether the
   * leg, knee and ankle quaternions in `leg`, `knee`, `ankle` were overridden.
   */
  solve(p: Float32Array, rig: THREE.Vector3, dt: number, gs: number, yaw: number, enable: number, leg: THREE.Quaternion[], knee: THREE.Quaternion[], ankle: THREE.Quaternion[]): [boolean, boolean] {
    const d = this.d, res: [boolean, boolean] = [false, false];
    const cy = Math.cos(yaw * dt), sy = Math.sin(yaw * dt);
    for (let s = 0; s < 2; s++) {
      const lo = boneChannel(('leg' + SIDES[s]) as 'legL'), ko = boneChannel(('knee' + SIDES[s]) as 'kneeL'), ao = boneChannel(('ankle' + SIDES[s]) as 'ankleL');
      quat(qL, p, lo); quat(qK, p, ko); qLK.copy(qL).multiply(qK);
      const hip = this.hv.copy(d.hip[s]).add(rig);                                 // hip pivot in the rig frame
      const kneeOld = this.kv.copy(d.knee[s]).applyQuaternion(qL).add(hip);
      const A = this.av.copy(d.ankle[s]).applyQuaternion(qLK).add(kneeOld);        // ankle where the capture put it
      const hasA = d.hasAnkle;
      if (hasA) qW.copy(qLK).multiply(quat(qA, p, ao)); else qW.copy(qLK);
      let hs = 9;
      const ax0 = A.x, ay0 = A.y, az0 = A.z;
      for (const z of SOLE_Z) { this.tv.set(0, -FOOT.ankleH, z).applyQuaternion(qW); hs = Math.min(hs, ay0 + this.tv.y); }
      // down, held, up
      if (!this.held[s]) { if (hs < 0.02 && enable > 0.5) { this.held[s] = true; this.ax[s] = ax0; this.az[s] = az0; } }
      else {
        // the ground moves back under the figure; a turn swings it round the figure's origin (a ground point turns the other way from the heading)
        const x = this.ax[s], z = this.az[s] + gs * dt;
        this.ax[s] = x * cy + z * sy; this.az[s] = -x * sy + z * cy;
        if (hs > 0.045 || enable < 0.2) this.held[s] = false;
      }
      const target = this.held[s] ? (1 - sstep(0.012, 0.045, hs)) * enable : 0;
      this.w[s] += Math.max(-dt / 0.05, Math.min(dt / 0.05, target - this.w[s]));
      this.pull[s] = 0;
      if (this.w[s] < 0.01) continue;
      // the ankle's target: where the ground point is now, blended by the weight, no more than reach allows
      let tx = (this.ax[s] - ax0) * this.w[s], tz = (this.az[s] - az0) * this.w[s];
      const m = Math.hypot(tx, tz);
      if (m > 0.14) { tx *= 0.14 / m; tz *= 0.14 / m; }
      const a = d.knee[s].length(), b = d.ankle[s].length(), L = 0.995 * (a + b);
      // largest fraction of the move that keeps the leg inside its reach: |u + f t|^2 = L^2 with u the hip-to-ankle vector
      const ux = ax0 - hip.x, uy = ay0 - hip.y, uz = az0 - hip.z;
      const qa = tx * tx + tz * tz, qb = 2 * (ux * tx + uz * tz), qc = ux * ux + uy * uy + uz * uz - L * L;
      let f = 1;
      if (qc > 0) f = 0; else if (qa > 1e-12) { const disc = qb * qb - 4 * qa * qc; f = Math.min(1, (-qb + Math.sqrt(Math.max(0, disc))) / (2 * qa)); }
      tx *= f; tz *= f;
      this.pull[s] = Math.hypot(tx, tz);
      if (this.pull[s] < 1e-4) continue;
      // two-bone solve
      const Tx = ax0 + tx, Ty = ay0, Tz = az0 + tz;
      const kneeOldX = kneeOld.x, kneeOldY = kneeOld.y, kneeOldZ = kneeOld.z;
      const hx = hip.x, hy = hip.y, hz = hip.z;
      const dx = Tx - hx, dy = Ty - hy, dz = Tz - hz;
      const dist = Math.min(Math.max(Math.hypot(dx, dy, dz), Math.abs(a - b) + 1e-3), a + b - 1e-3);
      const Dx = dx / Math.hypot(dx, dy, dz), Dy = dy / Math.hypot(dx, dy, dz), Dz = dz / Math.hypot(dx, dy, dz);
      const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      // the knee stays on the side of the line the capture bent it to
      const kx = kneeOldX - hx, ky = kneeOldY - hy, kz = kneeOldZ - hz, kd = kx * Dx + ky * Dy + kz * Dz;
      let Px = kx - Dx * kd, Py = ky - Dy * kd, Pz = kz - Dz * kd;
      const pl = Math.hypot(Px, Py, Pz);
      if (pl < 1e-5) { Px = 0; Py = 0; Pz = -1; } else { Px /= pl; Py /= pl; Pz /= pl; }
      const Kx = hx + a * (Dx * cosA + Px * sinA), Ky = hy + a * (Dy * cosA + Py * sinA), Kz = hz + a * (Dz * cosA + Pz * sinA);
      // thigh: the smallest swing from the old direction to the new, so the captured twist stays
      v1.set(kneeOldX - hx, kneeOldY - hy, kneeOldZ - hz).normalize();
      v2.set(Kx - hx, Ky - hy, Kz - hz).normalize();
      const swing = qW.setFromUnitVectors(v1, v2);
      const nl = this.lq[s].copy(swing).multiply(qL);
      // shin: the smallest swing, in the new thigh's frame, from where the capture had it to the new knee-to-ankle direction (the captured twist stays)
      v3.set(Tx - Kx, Ty - Ky, Tz - Kz).normalize().applyQuaternion(qW.copy(nl).invert());
      quat(qK, p, ko);
      v1.copy(d.ankle[s]).normalize().applyQuaternion(qK);
      const nk = this.kq[s].setFromUnitVectors(v1, v3).multiply(qK);
      leg[s].copy(nl); knee[s].copy(nk);
      if (hasA) {
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
