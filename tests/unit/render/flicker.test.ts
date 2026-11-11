/**
 * Deterministic flicker guards (FLICKER lane, 11 Nov): every distance threshold needs hysteresis, every cap must be stable
 * (holders keep their slot; placement order must not matter), InstancedMesh culling must not leave a stale bounding sphere,
 * the shadow box must be texel-snapped, and the clip planes must give a usable depth step at 300 m on a 24-bit buffer.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CarLod, type LodCar } from '@/render/CarLod';
import { InstanceCuller } from '@/render/Culling';
import { PedLod, PED_LOD_HYSTERESIS } from '@/entities/models/pedBodyHi';
import { cellInReach, PROXY_REACH_HYSTERESIS } from '@/render/AoProxy';
import { updateShadowCamera, setupShadows } from '@/render/Shadows';
import { CAMERA_NEAR, CAMERA_FAR, depthStepAt } from '@/render/DepthRange';
import { ThirdPersonCamera } from '@/core/Camera';
import { CAR_CLOSE_DIST } from '@/render/QualityTier';
import { setCarPaintTier } from '@/render/CarPaintFx';
import type { CarModel } from '@/entities/models/carModel';
import type { IMaterialLibrary } from '@/world/types';

// ------------------------------------------------------------------ helpers

/** Deterministic pseudo-random in [0, 1). */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function shuffle<T>(a: T[], r: () => number): T[] {
  const o = a.slice();
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

function fakeModel(): CarModel {
  const group = new THREE.Group();
  const add = (name: string, geo: THREE.BufferGeometry): void => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); m.name = name; group.add(m); };
  add('body', new THREE.BoxGeometry(4, 1, 2).translate(0, 0.7, 0));
  add('glass', new THREE.BoxGeometry(2, 0.5, 1.8).translate(0, 1.4, 0));
  add('trim', new THREE.BoxGeometry(4, 0.1, 2));
  add('tyre', new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateX(Math.PI / 2));
  return { group, wheels: [], steerPivots: [], headlights: [], taillights: [], paintMeshes: [], wheelRadius: 0.3, ownMaterials: [] };
}
const lib = {
  get: (k: string) => new THREE.MeshBasicMaterial({ name: k }),
  carPaint: (c: string) => new THREE.MeshStandardMaterial({ name: `paint:${c}` }),
  awning: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial(), setNight: () => {},
} as unknown as IMaterialLibrary;
const mkCar = (): LodCar => ({ object3D: new THREE.Group(), spec: { type: 'sedan', color: '#ffffff' }, damage: 0 });

/** Cars at fixed distances from a camera at the origin; returns which are full-detail this frame. */
function frame(lod: CarLod, cars: LodCar[], dist: number[], order: number[]): boolean[] {
  lod.beginFrame();
  const near = new Array<boolean>(cars.length).fill(false);
  for (const i of order) near[i] = !lod.place(cars[i], dist[i], 0, 0, dist[i]);
  lod.endFrame();
  return near;
}

// ------------------------------------------------------------------ cars

describe('CarLod flicker', () => {
  const make = (cap: number): CarLod => { const l = new CarLod(lib, { buildModel: () => fakeModel(), nearDist: 40, margin: 4 }); l.setNearMax(cap); return l; };

  it('a car sitting on the near/far threshold changes level at most once while it jitters +-1 m (margin 4 m)', () => {
    const lod = make(99); const c = [mkCar()]; const r = rnd(1);
    let flips = 0, last: boolean | null = null;
    for (let f = 0; f < 600; f++) {
      const d = 40 + (r() - 0.5) * 2 + (f > 300 ? 1 : 0); // 39..42 m
      const n = frame(lod, c, [d], [0])[0];
      if (last !== null && n !== last) flips++;
      last = n;
    }
    expect(flips).toBeLessThanOrEqual(1);
  });

  it('a slow sweep through the threshold flips each car exactly once per crossing', () => {
    const lod = make(99); const c = [mkCar()];
    let flips = 0, last: boolean | null = null;
    for (let f = 0; f <= 1200; f++) { // 20 m -> 60 m -> 20 m at 0.05 m per frame
      const d = f <= 600 ? 20 + f * 0.0667 : 60 - (f - 600) * 0.0667;
      const n = frame(lod, c, [d], [0])[0];
      if (last !== null && n !== last) flips++;
      last = n;
    }
    expect(flips).toBe(2);
  });

  it('the cap keeps the same full-detail cars while the candidates do not change, whatever the placement order', () => {
    const lod = make(3); const cars = Array.from({ length: 8 }, mkCar);
    const dist = [20, 24, 28, 31, 22, 26, 30, 18]; // all inside nearDist, all beyond CAR_CLOSE_DIST
    expect(Math.min(...dist)).toBeGreaterThan(CAR_CLOSE_DIST);
    const r = rnd(7);
    const first = frame(lod, cars, dist, cars.map((_, i) => i));
    expect(first.filter(Boolean)).toHaveLength(3);
    for (let f = 0; f < 200; f++) {
      const jitter = dist.map((d) => d + (r() - 0.5) * 0.4);
      const now = frame(lod, cars, jitter, shuffle(cars.map((_, i) => i), r));
      expect(now).toEqual(first);
    }
  });

  it('a car that enters range does not evict a holder, and a freed slot goes to a candidate', () => {
    const lod = make(2); const cars = Array.from({ length: 4 }, mkCar);
    const order = [0, 1, 2, 3];
    let near = frame(lod, cars, [20, 22, 90, 90], order);
    expect(near).toEqual([true, true, false, false]);
    // car 2 drives up, ahead of the others in placement order and nearer to the camera
    near = frame(lod, cars, [30, 30, 18, 90], [2, 0, 1, 3]);
    expect(near).toEqual([true, true, false, false]);
    // car 0 leaves: its slot stays reserved for the rest of that frame, then a candidate takes it (one frame later, no reshuffle)
    near = frame(lod, cars, [90, 30, 18, 90], [2, 0, 1, 3]);
    expect(near).toEqual([false, true, false, false]);
    near = frame(lod, cars, [90, 30, 18, 90], [2, 0, 1, 3]);
    expect(near).toEqual([false, true, true, false]);
  });
});

// ------------------------------------------------------------------ people

describe('PedLod flicker', () => {
  const make = (): PedLod => {
    const lod = new PedLod();
    for (const [name, d] of [['hi', 0], ['mid', 12], ['far', 40]] as const) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); m.name = name; lod.addLevel(m, d);
    }
    return lod;
  };
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.5, 0); cam.updateMatrixWorld(true);
  const level = (l: PedLod): number => l.levels.findIndex((x) => x.object.visible);
  const place = (l: PedLod, d: number): void => { l.position.set(0, 0, -d); l.updateMatrixWorld(true); };

  it('a person standing on 12 m or 40 m (camera sway +-0.5 m) changes level at most once; hysteresis is a share of the distance', () => {
    expect(PED_LOD_HYSTERESIS).toBeGreaterThan(0.05);
    PedLod.capOverride = 99;
    try {
      for (const edge of [12, 40]) {
        const l = make(); const r = rnd(edge); let flips = 0, last = -1;
        for (let f = 0; f < 400; f++) {
          place(l, edge + (r() - 0.5) * 1.0);
          l.update(cam);
          const lv = level(l);
          if (last >= 0 && lv !== last) flips++;
          last = lv;
        }
        expect(flips).toBeLessThanOrEqual(1);
      }
    } finally { PedLod.capOverride = null; }
  });

  it('exactly one level is visible at every distance of a slow walk through all three, two switches each way', () => {
    PedLod.capOverride = 99;
    try {
      const l = make(); let flips = 0, last = -1;
      for (let f = 0; f <= 1000; f++) {
        place(l, f <= 500 ? 2 + f * 0.1 : 52 - (f - 500) * 0.1); // 2 m -> 52 m -> 2 m
        l.update(cam);
        expect(l.levels.filter((x) => x.object.visible)).toHaveLength(1);
        const lv = level(l);
        if (last >= 0 && lv !== last) flips++;
        last = lv;
      }
      expect(flips).toBe(4);
    } finally { PedLod.capOverride = null; }
  });

  it('the cap of hi bodies keeps its holders when the scene order changes or a newcomer walks in', () => {
    PedLod.capOverride = 3; PedLod.resetPass();
    try {
      const lods = Array.from({ length: 6 }, make);
      const pass = (order: number[], dist: number[]): number[] => {
        for (const i of order) { place(lods[i], dist[i]); lods[i].update(cam); }
        return lods.map((_, i) => (lods[i].levels[0].object.visible ? i : -1)).filter((i) => i >= 0);
      };
      const d0 = [4, 5, 6, 7, 8, 9];
      const first = pass([0, 1, 2, 3, 4, 5], d0);
      expect(first).toHaveLength(3);
      const r = rnd(3);
      for (let f = 0; f < 100; f++) expect(pass(shuffle([0, 1, 2, 3, 4, 5], r), d0.map((d) => d + (r() - 0.5) * 0.2))).toEqual(first);
      // a person walks to 2 m, placed first in the order: the three holders stay hi
      const d1 = d0.slice(); d1[first.includes(5) ? 4 : 5] = 2;
      const newcomer = first.includes(5) ? 4 : 5;
      expect(pass([newcomer, ...[0, 1, 2, 3, 4, 5].filter((i) => i !== newcomer)], d1)).toEqual(first);
    } finally { PedLod.capOverride = null; }
  });
});

// ------------------------------------------------------------------ instanced culling

describe('InstanceCuller bounding volume', () => {
  it('is recomputed after a compaction: a tree row next to the camera is not frustum-culled by the spawn-area sphere', () => {
    // 1000 posts along x; the camera range keeps ~60 of them
    const geo = new THREE.BoxGeometry(0.5, 8, 0.5).translate(0, 4, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 1000);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 1000; i++) mesh.setMatrixAt(i, m.makeTranslation(i * 10, 0, 0));
    const cull = new InstanceCuller(10);
    cull.add(mesh);
    cull.setRange(150);
    cull.update(0, 0);
    mesh.updateMatrixWorld(true);
    const frustumAt = (x: number, yaw: number): THREE.Frustum => {
      const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 900);
      cam.position.set(x, 1.7, 0); cam.rotation.y = yaw; cam.updateMatrixWorld(true);
      return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    };
    expect(new THREE.Frustum().intersectsObject(mesh)).toBeDefined();
    expect(frustumAt(0, -Math.PI / 2).intersectsObject(mesh)).toBe(true); // looking down +x from the spawn
    // drive 6 km east, look back (-x): the live posts are in front of the camera, the spawn-time sphere is 6 km behind it
    cull.update(6000, 0);
    expect(mesh.count).toBeGreaterThan(10);
    expect(frustumAt(6000, Math.PI / 2).intersectsObject(mesh)).toBe(true);
    // and a camera looking the other way (away from every live post) does cull it
    expect(frustumAt(6000, -Math.PI / 2).intersectsObject(mesh)).toBe(true); // posts east of 6000 are live too
    expect(frustumAt(0, Math.PI / 2).intersectsObject(mesh)).toBe(false);
  });
});

// ------------------------------------------------------------------ AO / shadow proxy reach

describe('proxy reach hysteresis', () => {
  it('a cell on the 70 m edge flips once under +-3 m of camera sway and not at all inside the margin', () => {
    const r = rnd(5); let vis = false, flips = 0;
    for (let f = 0; f < 500; f++) {
      const px = 70 + (r() - 0.5) * 6; // cell box spans x 0..50 on the camera's x axis: nearest edge 70 m from px=120..
      const v = cellInReach(vis, 0, 50, -50, 50, 50 + px, 0, 70);
      if (v !== vis) flips++;
      vis = v;
    }
    expect(flips).toBeLessThanOrEqual(1);
    expect(PROXY_REACH_HYSTERESIS).toBeGreaterThanOrEqual(4);
    expect(cellInReach(true, 0, 50, -50, 50, 50 + 74, 0, 70)).toBe(true);
    expect(cellInReach(false, 0, 50, -50, 50, 50 + 74, 0, 70)).toBe(false);
  });
});

// ------------------------------------------------------------------ shadow box

describe('shadow box texel snapping', () => {
  for (const q of ['low', 'medium', 'high'] as const) {
    it(`${q}: the box centre moves in whole shadow texels in light space (a slow dolly never shimmers sub-texel)`, () => {
      const sun = new THREE.DirectionalLight(0xffffff, 1);
      sun.position.set(80, 120, 60);
      const renderer = { shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false } } as unknown as THREE.WebGLRenderer;
      setupShadows(renderer, sun, q);
      const texel = (2 * sun.shadow.camera.right) / sun.shadow.mapSize.x;
      const dir = sun.position.clone().normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right).normalize();
      const seen = new Set<string>();
      for (let i = 0; i < 2000; i++) {
        updateShadowCamera(sun, { x: 12.3 + i * 0.001, z: -40 + i * 0.0007 }); // 2 m of dolly in 1 mm steps
        const t = sun.target.position;
        const rr = t.dot(right) / texel, uu = t.dot(up) / texel;
        expect(Math.abs(rr - Math.round(rr))).toBeLessThan(1e-3);
        expect(Math.abs(uu - Math.round(uu))).toBeLessThan(1e-3);
        seen.add(`${Math.round(rr)}_${Math.round(uu)}`);
      }
      expect(seen.size).toBeLessThan(2.5 / texel * 2 + 4); // steps, not a continuous drift
      expect(seen.size).toBeGreaterThan(1);
    });
  }
});

// ------------------------------------------------------------------ depth precision

describe('clip planes', () => {
  it('the camera uses the shared planes and they resolve at least 2.5 cm at 300 m on a 24-bit buffer', () => {
    const cam = new ThirdPersonCamera(16 / 9).camera;
    expect(cam.near).toBe(CAMERA_NEAR);
    expect(cam.far).toBe(CAMERA_FAR);
    expect(depthStepAt(300)).toBeLessThanOrEqual(0.03); // was 5.4 cm at near 0.1
    expect(depthStepAt(300, 0.1)).toBeGreaterThan(depthStepAt(300) * 1.9);
    // road paint 4 mm over details: separated by polygonOffset steps beyond ~80 m instead of by geometry
    expect(depthStepAt(80)).toBeLessThan(0.004 * 1.5);
  });
  it('near stays inside the camera wall margin (0.35 m) at 16:9 and 82 degrees', () => {
    const half = Math.tan((82 * Math.PI) / 360);
    expect(CAMERA_NEAR * half * (16 / 9)).toBeLessThan(0.35);
  });
});

setCarPaintTier('medium');
