import { it } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { IMaterialLibrary } from '@/world/types';
import { render } from './rast';

const cache = new Map<string, THREE.Material>();
const std = (c: number, extra: object = {}) => new THREE.MeshStandardMaterial({ color: c, ...extra });
const materials: IMaterialLibrary = {
  get: (k: string) => {
    if (!cache.has(k)) cache.set(k, k === 'carGlass' ? std(0x1b2a3a, { transparent: true, opacity: 0.6 }) : k === 'metalDark' ? std(0x2a2c30) : k === 'tire' ? std(0x161616) : std(0xeeeeee));
    return cache.get(k)!;
  },
  awning: () => std(0xff0000), sign: () => new THREE.MeshBasicMaterial({ color: 0xf6f1dc }), carPaint: (c: string) => std(new THREE.Color(c).getHex()), setNight: () => {},
} as unknown as IMaterialLibrary;

const S = '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad';
it('render cars', () => {
  const only = process.env.CARS ? process.env.CARS.split(',') : ['sedan', 'suv', 'boxtruck', 'cop'];
  for (const t of only as ('sedan' | 'suv' | 'boxtruck' | 'cop')[]) {
    const m = buildCarModel(t, VEHICLE_SPECS[t], materials);
    const big = t === 'boxtruck';
    const d = big ? 15 : 7.5;
    const ty = big ? 1.5 : 0.7;
    const tgt: [number, number, number] = [0, ty, 0];
    render(m.group, [
      { yaw: Math.PI / 2, pitch: 0.05, dist: d, target: tgt },
      { yaw: -0.65, pitch: 0.25, dist: d, target: tgt },
      { yaw: Math.PI + 0.6, pitch: 0.25, dist: d, target: tgt },
    ], 760, 430, S + '/car_' + t + '.png');
  }
});
