import { it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { pedAtlasPainter, PED_SPECS, PED_ATLAS } from '@/textures/painters/ped';
import { buildPedModel } from '@/entities/models/pedBodyHi';
import { paintPedHi } from '@/textures/painters/pedHi';
import { animateWalk } from '@/entities/models/humanModel';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { skinLayoutFor, paintBox } from '@/entities/models/carSkin';
import { CAR_COLORWAYS, SKIN_W, SKIN_H, paintCarSkin, SKIN_PAINT_BASE } from '@/textures/painters/vehicleSkin';
import { SoftCtx, guard } from '../textures/softcanvas';

function crc(buf: Buffer): number { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(t: string, d: Buffer): Buffer { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

type Sampler = (u: number, v: number) => [number, number, number];
interface Job { mesh: THREE.Mesh; sampler: Sampler; uvName?: string; tint?: [number, number, number] }

function rasterize(jobs: Job[], cam: THREE.PerspectiveCamera, W: number, H: number, bg: [number, number, number]): Uint8Array {
  const out = new Uint8Array(W * H * 4); const z = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255; }
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const light = new THREE.Vector3(-0.4, 0.8, 0.5).normalize();
  for (const j of jobs) {
    j.mesh.updateWorldMatrix(true, false);
    const g = j.mesh.geometry; const pos = g.getAttribute('position'); const uv = g.getAttribute(j.uvName ?? 'uv');
    const nrm = new THREE.Matrix3().getNormalMatrix(j.mesh.matrixWorld);
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const P: THREE.Vector4[] = [], W3: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k++) { const w = new THREE.Vector3().fromBufferAttribute(pos, t + k).applyMatrix4(j.mesh.matrixWorld); W3.push(w); P.push(new THREE.Vector4(w.x, w.y, w.z, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix)); }
      if (P.some((p) => p.w <= 0.05)) continue;
      const n = new THREE.Vector3().crossVectors(W3[1].clone().sub(W3[0]), W3[2].clone().sub(W3[0])).normalize();
      const toCam = cam.position.clone().sub(W3[0]);
      if (n.dot(toCam) <= 0) continue; // backface
      const lam = 0.45 + 0.55 * Math.max(0, n.dot(light));
      void nrm; void vp;
      const sx = P.map((p) => (p.x / p.w * 0.5 + 0.5) * W), sy = P.map((p) => (1 - (p.y / p.w * 0.5 + 0.5)) * H), sz = P.map((p) => p.z / p.w), iw = P.map((p) => 1 / p.w);
      const minX = Math.max(0, Math.floor(Math.min(...sx))), maxX = Math.min(W - 1, Math.ceil(Math.max(...sx)));
      const minY = Math.max(0, Math.floor(Math.min(...sy))), maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
      const den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2]);
      if (Math.abs(den) < 1e-9) continue;
      const us = [0, 1, 2].map((k) => uv.getX(t + k)), vs = [0, 1, 2].map((k) => uv.getY(t + k));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const a = ((sy[1] - sy[2]) * (px - sx[2]) + (sx[2] - sx[1]) * (py - sy[2])) / den;
        const b = ((sy[2] - sy[0]) * (px - sx[2]) + (sx[0] - sx[2]) * (py - sy[2])) / den;
        const c = 1 - a - b;
        if (a < -0.001 || b < -0.001 || c < -0.001) continue;
        const depth = a * sz[0] + b * sz[1] + c * sz[2];
        if (depth >= z[y * W + x]) continue;
        const wsum = a * iw[0] + b * iw[1] + c * iw[2];
        const u = (a * us[0] * iw[0] + b * us[1] * iw[1] + c * us[2] * iw[2]) / wsum;
        const v = (a * vs[0] * iw[0] + b * vs[1] * iw[1] + c * vs[2] * iw[2]) / wsum;
        const col = j.sampler(u, v);
        z[y * W + x] = depth;
        const o = (y * W + x) * 4; out[o] = Math.min(255, col[0] * lam); out[o + 1] = Math.min(255, col[1] * lam); out[o + 2] = Math.min(255, col[2] * lam);
      }
    }
  }
  return out;
}

function atlasSampler(variant: number): Sampler {
  const sc = new SoftCtx(PED_ATLAS, PED_ATLAS); pedAtlasPainter(guard(sc), PED_ATLAS, PED_ATLAS, new Rng(`ped:${variant}`), variant);
  const px = sc.pixels();
  return (u, v) => { const x = Math.min(PED_ATLAS - 1, Math.max(0, Math.floor(u * PED_ATLAS))), y = Math.min(PED_ATLAS - 1, Math.max(0, Math.floor((1 - v) * PED_ATLAS))); const i = (y * PED_ATLAS + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
}

const mats = { get: () => new THREE.MeshStandardMaterial(), carPaint: () => new THREE.MeshStandardMaterial() } as never;
const meshesOf = (o: THREE.Object3D): THREE.Mesh[] => { const r: THREE.Mesh[] = []; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) r.push(c as THREE.Mesh); }); return r; };


function hiSampler(variant: number): Sampler {
  const sc = new SoftCtx(512, 512); paintPedHi(guard(sc), null, null, 512, new Rng(`pedhi:${variant}`), variant);
  const px = sc.pixels();
  return (u, v) => { const x = Math.min(511, Math.max(0, Math.floor(u * 512))), y = Math.min(511, Math.max(0, Math.floor((1 - v) * 512))); const i = (y * 512 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
}
it('soft render hi peds', () => {
  const W = 1200, H = 520; const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);
  const jobs: Job[] = [];
  const list = (process.env.PEDS ?? '0,1,2,3,5,16').split(',').map(Number);
  list.forEach((v, k) => {
    const m = buildPedModel(mats, new Rng(3), { variant: v, heightScale: 1 });
    m.group.position.set((k - (list.length - 1) / 2) * 0.62, 0, 0); m.group.rotation.y = Number(process.env.ROT ?? 3.14159); if (k % 2) animateWalk(m, 1.0, 1);
    m.group.updateMatrixWorld(true);
    const s = hiSampler(v);
    const body = m.group.getObjectByName('body') as THREE.Mesh;
    console.log(PED_SPECS[v].id, m.triangles);
    body.geometry = body.geometry.toNonIndexed(); jobs.push({ mesh: body, sampler: s });
  });
  cam.position.set(0, 1.1, 6.5); cam.lookAt(0, 0.95, 0);
  writeFileSync('/tmp/claude-0/scratch/hi.png', png(W, H, rasterize(jobs, cam, W, H, [140, 165, 190])));
  const W2 = 900, H2 = 700; const cam2 = new THREE.PerspectiveCamera(20, W2 / H2, 0.1, 100);
  const m = buildPedModel(mats, new Rng(3), { variant: list[0], heightScale: 1 }); m.group.rotation.y = Math.PI; m.group.updateMatrixWorld(true); { const b = m.group.getObjectByName('body') as THREE.Mesh; b.geometry = b.geometry.toNonIndexed(); }
  cam2.position.set(0.5, 1.62, 1.6); cam2.lookAt(0, 1.6, 0);
  writeFileSync('/tmp/claude-0/scratch/hi-face.png', png(W2, H2, rasterize([{ mesh: m.group.getObjectByName('body') as THREE.Mesh, sampler: hiSampler(list[0]) }], cam2, W2, H2, [140, 165, 190])));
});
