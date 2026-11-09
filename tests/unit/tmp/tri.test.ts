import { it } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
const mat = () => new THREE.MeshBasicMaterial();
const materials: any = { get: () => mat(), carPaint: () => mat(), awning: () => mat(), sign: () => mat(), setNight() {} };
it('tris', () => {
  for (const [t, c, v] of [['sedan', '#e0b01e', 0], ['cop', '#fff', 0], ['sedan', '#7f8c8d', 0], ['suv', '#2c3e50', 0]] as const) {
    const m = buildCarModel(t, { ...VEHICLE_SPECS[t], color: c }, materials, v);
    let n = 0; const per: string[] = [];
    m.group.traverse((o) => { const g = (o as any).geometry; if (g && (o as any).visible) { const k = (g.index ? g.index.count : g.attributes.position.count) / 3 * ((o as any).count ?? 1); n += k; per.push(`${o.name}:${k}`); } });
    console.log(t, c, n, per.join(' '));
  }
});
