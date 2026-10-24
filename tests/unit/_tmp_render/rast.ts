import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';

export interface View { yaw: number; pitch: number; dist: number; fov?: number; target?: [number, number, number]; }

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function render(obj: THREE.Object3D, views: View[], W: number, H: number, file: string, bg = [200, 205, 212]): void {
  obj.updateMatrixWorld(true);
  const cols = views.length;
  const img = new Uint8Array(W * cols * H * 3);
  for (let i = 0; i < img.length; i += 3) { img[i] = bg[0]; img[i + 1] = bg[1]; img[i + 2] = bg[2]; }
  const tris: { m: THREE.Mesh; geo: THREE.BufferGeometry }[] = [];
  obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) tris.push({ m, geo: m.geometry }); });
  views.forEach((v, vi) => {
    const tgt = new THREE.Vector3(...(v.target ?? [0, 0.8, 0]));
    const cam = new THREE.PerspectiveCamera(v.fov ?? 30, W / H, 0.1, 100);
    cam.position.set(tgt.x + v.dist * Math.cos(v.pitch) * Math.sin(v.yaw), tgt.y + v.dist * Math.sin(v.pitch), tgt.z + v.dist * Math.cos(v.pitch) * Math.cos(v.yaw));
    cam.lookAt(tgt); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const vm = cam.matrixWorldInverse;
    const zb = new Float32Array(W * H).fill(Infinity);
    const light = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
    const pass = (transparent: boolean) => {
      for (const { m, geo } of tris) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!!mat.transparent !== transparent) continue;
        const col = mat.color ? mat.color : new THREE.Color(0.6, 0.6, 0.6);
        const emi = mat.emissive && mat.emissiveIntensity ? mat.emissive : null;
        const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
        const n = idx ? idx.count : pos.count;
        const mw = m.matrixWorld;
        const nm = new THREE.Matrix3().getNormalMatrix(mw);
        const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        const N = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        const S: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        const side = mat.side;
        for (let t = 0; t < n; t += 3) {
          let ok = true;
          for (let k = 0; k < 3; k++) {
            const ii = idx ? idx.getX(t + k) : t + k;
            P[k].fromBufferAttribute(pos, ii).applyMatrix4(mw);
            N[k].fromBufferAttribute(nor, ii).applyMatrix3(nm).normalize();
            const pv = P[k].clone().applyMatrix4(vm);
            if (pv.z > -0.1) { ok = false; break; }
            const pc = pv.clone().applyMatrix4(cam.projectionMatrix);
            S[k] = [(pc.x * 0.5 + 0.5) * W, (1 - (pc.y * 0.5 + 0.5)) * H, -pv.z];
          }
          if (!ok) continue;
          const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1]);
          if (area === 0) continue;
          // screen y is flipped -> front faces have negative area
          if (side !== THREE.DoubleSide && area > 0) continue;
          const x0 = Math.max(0, Math.floor(Math.min(S[0][0], S[1][0], S[2][0])));
          const x1 = Math.min(W - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])));
          const y0 = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1])));
          const y1 = Math.min(H - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((S[1][0] - px) * (S[2][1] - py) - (S[2][0] - px) * (S[1][1] - py)) / area;
            const w1 = ((S[2][0] - px) * (S[0][1] - py) - (S[0][0] - px) * (S[2][1] - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
            const z = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2];
            if (z >= zb[y * W + x]) continue;
            if (!transparent) zb[y * W + x] = z;
            const nn = new THREE.Vector3().addScaledVector(N[0], w0).addScaledVector(N[1], w1).addScaledVector(N[2], w2).normalize();
            if (side === THREE.DoubleSide && area > 0) nn.negate();
            const nv = nn.clone().transformDirection(vm);
            const lam = 0.3 + 0.55 * Math.max(0, nn.dot(light)) + 0.35 * Math.max(0, nv.z) + 0.1 * Math.max(0, nn.y);
            let r = col.r * lam, g = col.g * lam, b = col.b * lam;
            if (emi) { r += emi.r * 0.8; g += emi.g * 0.8; b += emi.b * 0.8; }
            if ((mat as THREE.MeshStandardMaterial).metalness > 0.9) { const rf = 0.5 + 0.5 * nn.y; r = r * 0.4 + rf * 0.6; g = g * 0.4 + rf * 0.6; b = b * 0.4 + rf * 0.65; }
            const o = ((y * cols * W) + vi * W + x) * 3;
            const a = transparent ? Math.min(1, mat.opacity ?? 0.6) : 1;
            img[o] = Math.min(255, (r * 255) * a + img[o] * (1 - a));
            img[o + 1] = Math.min(255, (g * 255) * a + img[o + 1] * (1 - a));
            img[o + 2] = Math.min(255, (b * 255) * a + img[o + 2] * (1 - a));
          }
        }
      }
    };
    pass(false); pass(true);
  });
  fs.writeFileSync(file, png(W * cols, H, img));
}
