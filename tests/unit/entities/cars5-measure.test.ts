import { it } from 'vitest';
import * as THREE from 'three';
import * as fs from 'fs';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { setCarPaintTier } from '@/render/CarPaintFx';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshStandardMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const f = (n: number) => n.toFixed(2);
it('measure', () => {
  const rows: string[] = ['type,level,specL,specW,specH,bodyL,bodyW,bodyH,bodyMinY,wheelDia,wheelW,wheelbase,trackOuter,frontOver,rearOver,wheelTopY,tris'];
  for (const t of Object.keys(VEHICLE_SPECS) as VehicleType[]) {
    for (const tier of ['high', 'low'] as const) {
      setCarPaintTier(tier);
      const spec = VEHICLE_SPECS[t];
      const m = buildCarModel(t, spec, materials);
      m.group.updateMatrixWorld(true);
      const body = new THREE.Box3(), wh = new THREE.Box3();
      let tris = 0;
      m.group.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh || !me.geometry.getAttribute('position') || me.geometry.getAttribute('position').count === 0) return;
        const g = me.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const n = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3 * n;
        if ((o as THREE.InstancedMesh).isInstancedMesh) {
          const im = o as THREE.InstancedMesh; const mm = new THREE.Matrix4();
          for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mm); wh.union(g.boundingBox!.clone().applyMatrix4(mm.premultiply(im.matrixWorld))); }
        } else if (me.name === 'tyre') wh.union(g.boundingBox!.clone().applyMatrix4(me.matrixWorld));
        else body.union(g.boundingBox!.clone().applyMatrix4(me.matrixWorld));
      });
      const ws = m.group.children.filter((c) => c.name === 'steerPivot' || c.name === 'wheelMount');
      const zs = ws.map((w) => w.position.z), xs = ws.map((w) => Math.abs(w.position.x));
      const front = Math.max(...zs), rear = Math.min(...zs);
      rows.push([t, tier, spec.length, spec.width, spec.height, f(body.max.z - body.min.z), f(body.max.x - body.min.x), f(body.max.y), f(body.min.y), f(m.wheelRadius * 2),
        f(wh.max.x - wh.min.x - 2 * Math.max(...xs) + 0), f(front - rear), f(wh.max.x - wh.min.x), f(body.max.z - front), f(rear - body.min.z), f(wh.max.y), Math.round(tris)].join(','));
    }
  }
  fs.writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/cars5/measure-before.csv', rows.join('\n'));
});
