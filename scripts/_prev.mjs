import sharp from 'sharp';
import { loadSources, buildShape, SHAPES } from './people-pipeline.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const names = process.argv[2].split(','); const lodName = process.argv[3] || 'hi'; const out = process.argv[4];
const src = loadSources();
const COL = { head: [230,180,150], neck: [200,150,120], torso: [90,120,200], pelvis: [60,60,120], upperArm: [200,90,90], foreArm: [220,150,60], hand: [240,220,120], thigh: [60,160,90], shin: [100,200,160], shoe: [40,40,40] };
const W = 300, H = 640; const views = [0, 0.7];
const img = Buffer.alloc(W * H * 3 * names.length * views.length, 30);
const TW = W * names.length * views.length;
let col = 0;
for (const nm of names) { const b = buildShape(src, MeshoptSimplifier, nm); const g = b.lods[lodName];
  console.log(nm, g.triangles, JSON.stringify(b.people.landmarks));
  for (const yaw of views) {
    const zb = new Float32Array(W * H).fill(1e9); const ox = col * W; col++;
    const c = Math.cos(yaw), s = Math.sin(yaw); const sc = H / 2.05;
    const P = g.position; const prj = (i) => { const x = P[i*3], y = P[i*3+1], z = P[i*3+2]; const rx = x*c + z*s, rz = -x*s + z*c; return [ox + W/2 + rx*sc, H - 10 - y*sc, rz]; };
    const N = g.normal;
    for (let t = 0; t < g.indices.length; t += 3) {
      const ia = [g.indices[t], g.indices[t+1], g.indices[t+2]]; const p = ia.map(prj);
      const reg = g.regions[t/3]; const base = COL[reg];
      // face normal view dir
      const nz = [0,1,2].reduce((a,k)=>a+(-N[ia[k]*3]*s + N[ia[k]*3+2]*c),0)/3; const nx = [0,1,2].reduce((a,k)=>a+N[ia[k]*3],0)/3; const ny=[0,1,2].reduce((a,k)=>a+N[ia[k]*3+1],0)/3;
      const lit = Math.max(0.15, -nz*0.7 + ny*0.3 - nx*0.2);
      const minx = Math.floor(Math.min(p[0][0],p[1][0],p[2][0])), maxx = Math.ceil(Math.max(p[0][0],p[1][0],p[2][0]));
      const miny = Math.floor(Math.min(p[0][1],p[1][1],p[2][1])), maxy = Math.ceil(Math.max(p[0][1],p[1][1],p[2][1]));
      const den = (p[1][1]-p[2][1])*(p[0][0]-p[2][0]) + (p[2][0]-p[1][0])*(p[0][1]-p[2][1]); if (Math.abs(den) < 1e-9) continue;
      for (let y = Math.max(0,miny); y <= Math.min(H-1,maxy); y++) for (let x = Math.max(ox,minx); x <= Math.min(ox+W-1,maxx); x++) {
        const l1 = ((p[1][1]-p[2][1])*(x-p[2][0]) + (p[2][0]-p[1][0])*(y-p[2][1]))/den; const l2 = ((p[2][1]-p[0][1])*(x-p[2][0]) + (p[0][0]-p[2][0])*(y-p[2][1]))/den; const l3 = 1-l1-l2;
        if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
        const z = l1*p[0][2]+l2*p[1][2]+l3*p[2][2]; if (z >= zb[y*W + x-ox]) continue; zb[y*W + x-ox] = z;
        const o = (y*TW + x)*3; const e = (l1<0.04||l2<0.04||l3<0.04) ? 0.8 : 1; for (let k=0;k<3;k++) img[o+k] = Math.min(255, base[k]*lit*e);
      }
    }
  }
}
await sharp(img, { raw: { width: TW, height: H, channels: 3 } }).png().toFile(out);
