import { it } from 'vitest';
import { clearPeople, parseShape, registerShape } from '@/entities/models/pedMesh';
import { headFrame } from '@/entities/models/pedHead';
it('probe', async () => {
  const fs: any = await import(/* @vite-ignore */ 'node:' + 'fs');
  clearPeople();
  const b = fs.readFileSync(new URL('../../../src/assets/models/people/wh_m.glb', import.meta.url));
  const shape = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  registerShape(shape);
  const f = headFrame(shape);
  console.log('frame', JSON.stringify(f));
  for (const lv of ['hi','mid','far'] as const) {
    const L = shape.lods[lv]; const p = L.position; let c=0, c2=0; const pts:number[][]=[];
    for (let i=0;i<p.length/3;i++){ const x=Math.abs(p[i*3]), y=p[i*3+1], z=p[i*3+2];
      if (Math.abs(x-f.eyeX)<0.02 && Math.abs(y-f.eyeY)<0.012 && z<f.midZ-0.03) { c++; pts.push([+(p[i*3]*1000).toFixed(1),+(y*1000-f.eyeY*1000).toFixed(1),+(z*1000).toFixed(1)]); }
    }
    console.log(lv, 'verts', p.length/3, 'tris', L.index.length/3, 'near one eye (+-20mm x, +-12mm y):', c);
    if (lv==='hi') console.log(JSON.stringify(pts.filter(q=>q[0]>0).slice(0,60)));
  }
});
