import type { HumanModel } from './humanModel';
import type { JumpPhase } from '@/entities/Jump';

/**
 * Jump pose for the procedural person: crouch on take-off, tucked legs with raised arms in the air (legs extend toward the
 * landing), a deep absorb on landing that eases out. `t` is seconds in the phase, `vy` the vertical speed (m/s).
 * Only rotations and the rig height are touched; `animateWalk` writes the same fields on the next walking frame.
 */
export function animateJump(model: HumanModel, phase: JumpPhase, t: number, vy: number): void {
  let crouch = 0, tuck = 0, reach = 0;
  if (phase === 'takeoff') crouch = Math.min(1, t / 0.07);
  else if (phase === 'air') { tuck = vy > 0 ? 0.6 : Math.max(0.1, 0.6 + vy / 9); reach = 1; }
  else if (phase === 'land') crouch = Math.max(0, 1 - t / 0.2) * 1.2;
  const knee = -(0.25 + crouch * 0.9 + tuck * 0.9);
  const hip = crouch * 0.55 + tuck * 0.75;
  for (let i = 0; i < 2; i++) {
    model.legs[i].rotation.x = hip * (i === 0 ? 1 : 0.85);
    model.knees[i].rotation.x = knee;
    model.arms[i].rotation.x = -reach * 2.3 + crouch * 0.6;
    model.elbows[i].rotation.x = 0.3 + reach * 0.2;
  }
  model.torso.rotation.x = 0.1 + crouch * 0.35;
  model.torso.rotation.y = 0; model.torso.rotation.z = 0;
  model.hips.rotation.y = 0; model.hips.rotation.z = 0;
  model.head.rotation.x = -crouch * 0.2;
  model.rig.position.x = 0;
  model.rig.position.y = -crouch * 0.16 - tuck * 0.05;
}
