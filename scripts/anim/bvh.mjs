// Minimal BVH reader + forward kinematics (data is parsed, never executed). Used only by build-clips.mjs.
import * as THREE from 'three';
import fs from 'node:fs';

export function parseBvh(path) {
  const txt = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  const joints = [];
  const stack = [];
  let i = 0;
  let cur = null;
  for (; i < txt.length; i++) {
    const t = txt[i].trim();
    if (t.startsWith('MOTION')) { i++; break; }
    let m;
    if ((m = /^(ROOT|JOINT)\s+(\S+)/.exec(t))) {
      cur = { name: m[2], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [] };
      joints.push(cur);
      stack.push(joints.length - 1);
    } else if (/^End Site/.test(t)) {
      cur = { name: '__end', parent: -2, offset: [0, 0, 0], channels: [] };
      stack.push(-2);
    } else if ((m = /^OFFSET\s+(\S+)\s+(\S+)\s+(\S+)/.exec(t))) {
      if (cur && cur.parent !== -2) cur.offset = [+m[1], +m[2], +m[3]];
    } else if ((m = /^CHANNELS\s+(\d+)\s+(.*)$/.exec(t))) {
      cur.channels = m[2].trim().split(/\s+/);
    } else if (t === '}') stack.pop();
  }
  const frames = +/Frames:\s*(\d+)/.exec(txt[i++])[1];
  const dt = +/Frame Time:\s*(\S+)/.exec(txt[i++])[1];
  const data = [];
  for (let f = 0; f < frames; f++) data.push(txt[i + f].trim().split(/\s+/).map(Number));
  return { joints, frames, dt, data, index: Object.fromEntries(joints.map((j, k) => [j.name, k])) };
}

const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };

/** per-frame world rotations and positions of every joint (BVH space, Y up, as stored) */
export function fk(b, f) {
  const row = b.data[f];
  let c = 0;
  const rot = [], pos = [];
  const q = new THREE.Quaternion(), tmp = new THREE.Quaternion();
  b.joints.forEach((j, k) => {
    const lp = new THREE.Vector3(...j.offset);
    q.identity();
    for (const ch of j.channels) {
      const v = row[c++];
      if (ch.endsWith('position')) lp.setComponent('XYZ'.indexOf(ch[0]), v);
      else { tmp.setFromAxisAngle(AX[ch[0]], v * Math.PI / 180); q.multiply(tmp); }
    }
    if (j.parent < 0) { rot[k] = q.clone(); pos[k] = lp; }
    else {
      rot[k] = rot[j.parent].clone().multiply(q);
      pos[k] = pos[j.parent].clone().add(lp.applyQuaternion(rot[j.parent]));
    }
  });
  return { rot, pos };
}
