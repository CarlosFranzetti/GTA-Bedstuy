import { it } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { setCarPaintTier } from '@/render/CarPaintFx';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
const mat = () => new THREE.MeshStandardMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as any;
it('x', () => {
  for (const tier of ['high','low'] as const) { setCarPaintTier(tier);
  for (const t of ['sedan','bus'] as const) {
  const m = buildCarModel(t, VEHICLE_SPECS[t], materials);
  const out: string[] = [];
  m.group.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.geometry.getAttribute('position')) out.push(`${tier} ${t} ${me.name} ${((me.geometry.index?.count ?? me.geometry.getAttribute('position').count)/3)} x${(o as any).count ?? 1}`); });
  console.log(out.join('\n'));
  } }
});
