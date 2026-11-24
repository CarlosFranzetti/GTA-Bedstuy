import { buildDff, cubeGeo, type TestFrame } from './rwWriters';

/** A tiny pickup-shaped car as a .dff: body box, one "wheel" mesh and four wheel dummies (game axes: x right, y forward, z up). */
export function carDff(extra: { paint?: [number, number, number, number]; withHeadlights?: boolean } = {}): Uint8Array {
  const paint = extra.paint ?? [60, 255, 0, 255];
  const frames: TestFrame[] = [
    { name: 'car' },
    { name: 'chassis', parent: 0 },
    { name: 'wheel', parent: 0 },
    { name: 'wheel_lf_dummy', pos: [-0.9, 1.3, 0.3], parent: 0 },
    { name: 'wheel_rf_dummy', pos: [0.9, 1.3, 0.3], parent: 0 },
    { name: 'wheel_lb_dummy', pos: [-0.9, -1.3, 0.3], parent: 0 },
    { name: 'wheel_rb_dummy', pos: [0.9, -1.3, 0.3], parent: 0 },
    { name: 'chassis_dam', parent: 0 },
  ];
  const body = cubeGeo(-1, -2, 0.3, 1, 2, 1.3, [{ color: paint }, { color: [90, 120, 140, 255], texture: 'glass' }]);
  body.normals = [];
  for (let i = 0; i < 8; i++) { const [x, y, z] = body.positions.slice(i * 3, i * 3 + 3); const l = Math.hypot(x, y, z - 0.8) || 1; body.normals.push(x / l, y / l, (z - 0.8) / l); }
  const wheel = cubeGeo(-0.12, -0.3, -0.3, 0.12, 0.3, 0.3, [{ color: [30, 30, 30, 255] }]);
  const dam = cubeGeo(-1, -2, 0.3, 1, 2, 1.3);
  return buildDff({ frames, geos: [body, wheel, dam], atomics: [[1, 0], [2, 1], [7, 2]] });
}
