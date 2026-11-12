// CMU BVH -> our 12-bone person (src/entities/models/pedBody.ts). Pure maths, used by build-clips.mjs.
// Our rig: forward is -z, up is +y, arms hang along -y when every rotation is zero. CMU faces +z (left = +x), so the data is first
// turned half a circle about y. Rotations come out as Euler XYZ (three's default for Object3D.rotation) per bone, in the parent's frame:
//   hips, torso, head: child of rig (the heading frame); arm: child of torso; elbow: child of arm; leg: child of rig; knee: child of leg;
//   ankle (optional bone): child of knee. rig.position carries pelvis bob and sway.
import * as THREE from 'three';
import { fk } from './bvh.mjs';

export const BONES = ['hips', 'torso', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR', 'ankleL', 'ankleR'];
export const NCH = BONES.length * 3 + 3; // 39 rotations, then rig x, y, z
export const UNIT_M = 0.0564; // CMU/ASF unit (inches / 0.45) in metres

// our proportions (pedBody.ts): hip pivot 0.82 above the ground, thigh 0.40, knee to ankle 0.345 (ankle 0.075 high)
export const OUR = { hipY: 0.82, thigh: 0.40, shin: 0.345, ankleY: 0.075 };

const Y = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const C = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI); // CMU space -> our space (half turn about y)
const Cinv = C.clone().invert();

const toOurs = (v) => new THREE.Vector3(-v.x, v.y, -v.z);
const arc = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
const eul = (q) => { const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'); return [e.x, e.y, e.z]; };

export function legScale(b) {
  const o = (n) => new THREE.Vector3(...b.joints[b.index[n]].offset).length();
  const L = o('LeftLeg') + o('LeftFoot');
  const R = o('RightLeg') + o('RightFoot');
  return (OUR.thigh + OUR.shin) / (0.5 * (L + R)); // our metres per CMU unit
}

/** Our-leg forward kinematics: ankle height (relative to the hip pivot) for hip + knee rotation (x only matters for height). */
function ourAnkleDrop(legQ, kneeQ) {
  const thigh = new THREE.Vector3(0, -OUR.thigh, 0).applyQuaternion(legQ);
  const shin = new THREE.Vector3(0, -OUR.shin, 0).applyQuaternion(legQ.clone().multiply(kneeQ));
  return thigh.y + shin.y; // negative number: how far below the hip the ankle is
}

/**
 * Per-frame channels for frames [f0, f1] (inclusive, source frames, never frame 0 = the T pose the conversion adds).
 * opts.heading: 'path' (constant, direction of travel) | 'ramp' (linear between the body's first and last facing)
 * opts.rigY: 'ground' (feet planted: pelvis follows the stance foot) | 'air' (pelvis relative to the feet only)
 * opts.detrend: 'linear' | 'mean' | 'smooth'
 */
export function retarget(b, f0, f1, opts = {}) {
  const I = b.index;
  const k = legScale(b) / 1; // metres (ours) per unit
  const rest = fk(b, 0);
  const n = f1 - f0 + 1;
  const frames = [];
  for (let f = f0; f <= f1; f++) frames.push(fk(b, f));

  // heading
  const hipsPos = frames.map((fr) => toOurs(fr.pos[I.Hips]));
  const facing = (fr) => {
    const q = C.clone().multiply(fr.rot[I.Hips]).multiply(rest.rot[I.Hips].clone().invert()).multiply(Cinv);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  };
  const dxz = hipsPos[n - 1].clone().sub(hipsPos[0]);
  const pathYaw = Math.atan2(-dxz.x, -dxz.z);
  let yaw0, yaw1;
  if (opts.heading === 'ramp') { yaw0 = facing(frames[0]); yaw1 = facing(frames[n - 1]); while (yaw1 - yaw0 > Math.PI) yaw1 -= 2 * Math.PI; while (yaw1 - yaw0 < -Math.PI) yaw1 += 2 * Math.PI; }
  else if (opts.heading === 'face') { yaw0 = yaw1 = facing(frames[0]); }
  else if (opts.heading === 'none' || Math.hypot(dxz.x, dxz.z) < 3) { yaw0 = yaw1 = facing(frames[Math.floor(n / 2)]); }
  else { yaw0 = yaw1 = pathYaw; }
  const netYaw = yaw1 - yaw0;

  const out = [];
  const ankleMin = [], pelvisRel = [];
  const ankleRestM = (rest.pos[I.LeftFoot].y + rest.pos[I.RightFoot].y) * 0.5;
  const hipsRestY = rest.pos[I.Hips].y;
  for (let i = 0; i < n; i++) {
    const fr = frames[i];
    const t = n > 1 ? i / (n - 1) : 0;
    const Rh = new THREE.Quaternion().setFromAxisAngle(Y, -(yaw0 + (yaw1 - yaw0) * t));
    const P = (name) => toOurs(fr.pos[I[name]]).applyQuaternion(Rh);
    const D = (name) => Rh.clone().multiply(C).multiply(fr.rot[I[name]]).multiply(rest.rot[I[name]].clone().invert()).multiply(Cinv);
    const row = new Array(NCH).fill(0);
    const set = (bone, q) => { const e = eul(q); const o = BONES.indexOf(bone) * 3; row[o] = e[0]; row[o + 1] = e[1]; row[o + 2] = e[2]; };

    const qHips = D('Hips'), qTorso = D('Spine1'), qHead = D('Head');
    set('hips', qHips); set('torso', qTorso); set('head', qHead);

    const legQ = {}, kneeQ = {}, footDir = {};
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right';
      // arm
      const sh = P(side + 'Arm'), el = P(side + 'ForeArm'), wr = P(side + 'Hand');
      const qa = qTorso.clone().invert().multiply(arc(DOWN, el.clone().sub(sh)));
      const armWorld = qTorso.clone().multiply(qa);
      const fa = el.clone().sub(wr).multiplyScalar(-1).applyQuaternion(armWorld.clone().invert()); // el->wr in arm frame
      set('arm' + s, qa);
      set('elbow' + s, arc(DOWN, fa));
      // leg
      const hp = P(side + 'UpLeg'), kn = P(side + 'Leg'), an = P(side + 'Foot'), toe = P(side + 'ToeBase');
      const ql = arc(DOWN, kn.clone().sub(hp));
      const kd = an.clone().sub(kn).applyQuaternion(ql.clone().invert());
      const qk = arc(DOWN, kd);
      set('leg' + s, ql); set('knee' + s, qk);
      legQ[s] = ql; kneeQ[s] = qk;
      // ankle: foot direction against the rest foot direction, both in the shin frame
      const shinWorld = ql.clone().multiply(qk);
      const fd = toe.clone().sub(an).applyQuaternion(shinWorld.clone().invert());
      footDir[s] = fd;
    }
    out.push({ row, legQ, kneeQ, footDir, hipsY: hipsPos[i].y * k, ankleY: { L: toOurs(fr.pos[I.LeftFoot]).y * k, R: toOurs(fr.pos[I.RightFoot]).y * k }, hipsXZ: [hipsPos[i].x * k, hipsPos[i].z * k], Rh });
  }
  // rest foot direction in the shin frame (rest pose has straight legs)
  const restFoot = {};
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 'Left' : 'Right';
    const an = toOurs(rest.pos[I[side + 'Foot']]), toe = toOurs(rest.pos[I[side + 'ToeBase']]);
    restFoot[s] = toe.clone().sub(an).normalize();
  }
  for (const o of out) {
    for (const s of ['L', 'R']) {
      const bo = BONES.indexOf('ankle' + s) * 3;
      const e = eul(arc(restFoot[s], o.footDir[s]));
      o.row[bo] = e[0]; o.row[bo + 1] = e[1]; o.row[bo + 2] = e[2];
    }
  }

  // pelvis: height and sway
  const restDrop = ourAnkleDrop(new THREE.Quaternion(), new THREE.Quaternion());
  for (let i = 0; i < n; i++) {
    const o = out[i];
    // mocap ankle height above the rest ankle height, in our metres
    const m = { L: o.ankleY.L - ankleRestM * k, R: o.ankleY.R - ankleRestM * k };
    const ours = { L: ourAnkleDrop(o.legQ.L, o.kneeQ.L) - restDrop, R: ourAnkleDrop(o.legQ.R, o.kneeQ.R) - restDrop };
    // ours.* is the ankle height relative to rest with the pelvis in place; the pelvis moves by dy so that
    // (ours + dy) = mocap for the stance foot (the lower one), or follows the pelvis-to-feet distance in the air
    let dy;
    if (opts.rigY === 'air') {
      const feetMocap = 0.5 * (m.L + m.R), feetOurs = 0.5 * (ours.L + ours.R);
      const pelvisMocap = o.hipsY - hipsRestY * k;
      dy = (pelvisMocap - feetMocap) - (-feetOurs) - 0; // hips height above feet, mocap versus ours
      dy = (pelvisMocap - feetMocap) + feetOurs * -1;
      dy = ((o.hipsY - hipsRestY * k) - feetMocap) - 0 + (0 - (-feetOurs));
      dy = (pelvisMocap - feetMocap) - (0 - feetOurs) * 0 + feetOurs * 0;
      dy = (pelvisMocap - feetMocap) + feetOurs; // ours.* is negative when the leg lifts the ankle? see below
      dy = (pelvisMocap - feetMocap) - 0;
      // ankle height relative to rest with the pelvis in place is  +drop change; pelvis must move by (mocapAnkle - oursAnkle) to match feet
      dy = feetMocap - feetOurs; // the feet match the mocap feet height ...
      dy = dy - (feetMocap - pelvisMocap) + (feetMocap - pelvisMocap); // ... and then the vertical offset of pelvis against feet is the leg pose itself
      dy = pelvisMocap - feetMocap + (feetMocap - feetOurs) - 0;
    } else {
      const lowM = Math.min(m.L, m.R), lowO = Math.min(ours.L, ours.R);
      dy = lowM - lowO; // keep the lower foot where the mocap has it
    }
    o.dy = dy;
  }
  return { out, k, netYaw, n, yaw0, yaw1 };
}
