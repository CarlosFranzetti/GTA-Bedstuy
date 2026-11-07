import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { QUALITY_ORDER, TIER_CONFIG, pixelRatioFor, tierBelow, tierConfig } from '@/render/QualityTier';
import { DEFAULT_CULL_DISTANCE, DistanceCuller, cullDistanceFor, shouldHide } from '@/render/Culling';
import { LIGHTING } from '@/render/LightingConfig';
import { SHADOWS_ENABLED, phoneSunCasters, setupShadows } from '@/render/Shadows';
import { resolveQuality } from '@/textures/hosted';
import { QUALITIES } from '@/ui/Menu';
import { FLAT_ROUGHNESS, setAnisotropy, setNormalMaps } from '@/render/TierDetail';
import { CarLod } from '@/render/CarLod';
import { Weather } from '@/game/Weather';
import { NightLights } from '@/render/NightLights';

describe('tier table', () => {
  it('has phone below low, in order', () => {
    expect(QUALITY_ORDER).toEqual(['phone', 'low', 'medium', 'high']);
    expect(tierBelow('low')).toBe('phone');
    expect(tierBelow('phone')).toBeUndefined();
    expect(tierBelow('high')).toBe('medium');
  });

  it('phone values match the brief', () => {
    const p = tierConfig('phone');
    expect(p.maxPixelRatio).toBeLessThanOrEqual(1);
    expect(p.maxBufferWidth).toBeLessThanOrEqual(720);
    expect(p.traffic).toEqual({ maxMoving: 10, peds: 14, parkOccupancy: 0.3, cops: 1 });
    expect(p.rainStreaks).toBe(200);
    expect(p.anisotropy).toBe(2);
    expect(p.normalMaps).toBe(false);
    expect(p.stars).toBe(false);
    expect(p.minimapHz).toBe(30);
    expect(p.cullDistance).toBe(110);
    expect(p.fog).not.toBeNull();
    expect(p.fog!.far).toBeLessThanOrEqual(p.cullDistance);
    expect(LIGHTING.lampPool.phone).toBe(4);
  });

  it('every phone number is strictly lighter than low, and low/medium/high are untouched', () => {
    const p = TIER_CONFIG.phone, l = TIER_CONFIG.low;
    expect(p.cullDistance).toBeLessThan(l.cullDistance);
    expect(p.carNearDist).toBeLessThan(l.carNearDist);
    expect(p.pedDistance).toBeLessThan(l.pedDistance);
    expect(p.rainStreaks).toBeLessThan(l.rainStreaks);
    expect(p.anisotropy).toBeLessThan(l.anisotropy);
    expect(p.traffic.maxMoving).toBeLessThan(l.traffic.maxMoving);
    expect(p.traffic.peds).toBeLessThan(l.traffic.peds);
    expect(p.traffic.parkOccupancy).toBeLessThan(l.traffic.parkOccupancy);
    expect(p.traffic.cops).toBeLessThan(l.traffic.cops);
    expect(LIGHTING.lampPool.phone).toBeLessThan(LIGHTING.lampPool.low);
    // low keeps its previous behaviour
    expect(l).toMatchObject({ maxPixelRatio: 1.25, cullDistance: 220, carNearDist: 72, rainStreaks: 600, fog: null, normalMaps: true });
    expect(LIGHTING.lampPool).toMatchObject({ low: 6, medium: 12, high: 12 });
    for (const q of ['low', 'medium', 'high'] as const) expect(TIER_CONFIG[q].traffic).toEqual({ maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 });
  });

  it('shadows: phone has a tiny sun map fed by the blob casters (no proxy build); the other tiers keep theirs', () => {
    const r = { shadowMap: { enabled: false, type: 0, autoUpdate: false, needsUpdate: false } } as unknown as THREE.WebGLRenderer;
    const sun = new THREE.DirectionalLight();
    phoneSunCasters.ready = true;
    setupShadows(r, sun, 'phone');
    expect(SHADOWS_ENABLED).toEqual({ phone: false, low: true, medium: true, high: true });
    expect(r.shadowMap.enabled).toBe(true);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.x).toBe(512);
    const low = new THREE.DirectionalLight();
    setupShadows(r, low, 'low');
    expect(r.shadowMap.enabled).toBe(true);
    expect(low.castShadow).toBe(true);
    expect(low.shadow.mapSize.x).toBe(1024);
    expect(low.shadow.camera.right).toBe(60);
  });

});

describe('pixel ratio', () => {
  it('phone renders at most 720 px wide and never above 1', () => {
    expect(pixelRatioFor('phone', 3, 390)).toBe(1);               // portrait phone: 390 css px < 720
    expect(pixelRatioFor('phone', 3, 915) * 915).toBeLessThanOrEqual(720.0001); // landscape
    expect(pixelRatioFor('phone', 2, 1280) * 1280).toBeLessThanOrEqual(720.0001);
    expect(pixelRatioFor('phone', 0.75, 500)).toBe(0.75);
    expect(pixelRatioFor('phone', NaN, 500)).toBe(1);
  });
  it('other tiers keep their caps', () => {
    expect(pixelRatioFor('low', 3, 1000)).toBe(1.25);
    expect(pixelRatioFor('low', 1, 1000)).toBe(1);
    expect(pixelRatioFor('medium', 3, 1000)).toBe(1.75);
    expect(pixelRatioFor('high', 3, 2500)).toBe(1.75);
  });
});

describe('culling radius per tier', () => {
  it('phone culls at 110 m, the other tiers at 220 m', () => {
    expect(cullDistanceFor('phone')).toBe(110);
    for (const q of ['low', 'medium', 'high'] as const) expect(cullDistanceFor(q)).toBe(DEFAULT_CULL_DISTANCE);
  });

  it('a prop cell 150 m away is visible at low and hidden at phone; setMaxDist switches without rebuilding', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.position.set(150, 0, 0);
    const culler = new DistanceCuller(cullDistanceFor('low'));
    culler.addStatic(mesh);
    culler.update(0, 0);
    expect(mesh.visible).toBe(true);
    culler.setMaxDist(cullDistanceFor('phone'));
    culler.update(0, 0);
    expect(mesh.visible).toBe(false);
    culler.setMaxDist(cullDistanceFor('low'));
    culler.update(0, 0);
    expect(mesh.visible).toBe(true);
  });

  it('peds use their own shorter range without changing the prop range', () => {
    const culler = new DistanceCuller(110);
    const ped = new THREE.Object3D();
    expect(culler.applyTo(ped, 80, 0, 0, 0, 1, tierConfig('phone').pedDistance)).toBe(true);
    expect(ped.visible).toBe(false);
    expect(culler.applyTo(ped, 40, 0, 0, 0, 1, tierConfig('phone').pedDistance)).toBe(false);
    expect(ped.visible).toBe(true);
    // a range above maxDist can never widen the cull
    expect(culler.applyTo(new THREE.Object3D(), 150, 0, 0, 0, 1, 500)).toBe(true);
    expect(shouldHide(false, 111, 0, 0, 0, 0, 110)).toBe(true);
  });
});

describe('resolveQuality / menu', () => {
  it('?q=phone is accepted and touch devices default to phone', () => {
    expect(resolveQuality('phone', false, true)).toEqual({ quality: 'phone', ultra: false });
    expect(resolveQuality('phone', false, false)).toEqual({ quality: 'phone', ultra: false });
    expect(resolveQuality(undefined, true)).toEqual({ quality: 'phone', ultra: false });
    expect(resolveQuality(null, false)).toEqual({ quality: 'medium', ultra: false });
    expect(resolveQuality('bogus', true)).toEqual({ quality: 'phone', ultra: false });
    expect(resolveQuality('low', true)).toEqual({ quality: 'low', ultra: false });
  });
  it('the menu lists phone first', () => {
    expect(QUALITIES).toEqual(['phone', 'low', 'medium', 'high']);
  });
});

describe('TierDetail', () => {
  const tex = (a = 16) => { const t = new THREE.Texture(); t.anisotropy = a; return t; };
  it('strips and restores normal / roughness maps on plain standard materials, leaves car paint alone', () => {
    const n = tex(), r = tex();
    const wall = new THREE.MeshStandardMaterial({ normalMap: n, roughnessMap: r, roughness: 1 });
    const flat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    const paint = new THREE.MeshPhysicalMaterial({ normalMap: n, clearcoat: 1 });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), wall), new THREE.Mesh(new THREE.BufferGeometry(), [flat, paint]));
    expect(setNormalMaps(root, false)).toBe(1);
    expect(wall.normalMap).toBeNull(); expect(wall.roughnessMap).toBeNull(); expect(wall.roughness).toBe(FLAT_ROUGHNESS);
    expect(paint.normalMap).toBe(n);
    expect(setNormalMaps(root, false)).toBe(0); // idempotent
    expect(setNormalMaps(root, true)).toBe(1);
    expect(wall.normalMap).toBe(n); expect(wall.roughnessMap).toBe(r); expect(wall.roughness).toBe(1);
  });
  it('caps anisotropy at 2 and restores each texture\'s own value', () => {
    const a = tex(16), b = tex(1);
    const m = new THREE.MeshStandardMaterial({ map: a, normalMap: b });
    const root = new THREE.Mesh(new THREE.BufferGeometry(), m);
    expect(setAnisotropy(root, 2)).toBe(1);
    expect(a.anisotropy).toBe(2); expect(b.anisotropy).toBe(1);
    expect(setAnisotropy(root, 16)).toBe(1);
    expect(a.anisotropy).toBe(16);
  });
});

describe('runtime tier hooks', () => {
  it('Weather draws only as many streaks as the tier allows', () => {
    const lib = { get: () => new THREE.MeshStandardMaterial() } as never;
    const w = new Weather(new THREE.Scene(), lib, { rainStreaks: 2000, canvasFactory: () => { throw new Error('no canvas'); } });
    const mesh = (w as unknown as { rainMesh: THREE.LineSegments }).rainMesh;
    w.setRainStreaks(TIER_CONFIG.phone.rainStreaks);
    expect(mesh.geometry.drawRange.count).toBe(400);
    w.setRainStreaks(5000);
    expect(mesh.geometry.drawRange.count).toBe(4000); // clamped to what was built
  });

  it('NightLights pool resizes to the tier (4 on phone) and releases the removed lights', () => {
    const scene = new THREE.Scene();
    const nl = new NightLights(scene, Array.from({ length: 30 }, (_, i) => ({ pos: { x: i * 20, z: 0 }, height: 7.75 })), { poolSize: LIGHTING.lampPool.low });
    expect(nl.lights).toHaveLength(6);
    nl.setPoolSize(LIGHTING.lampPool.phone);
    expect(nl.lights).toHaveLength(4);
    expect(scene.children.filter((c) => (c as THREE.PointLight).isPointLight)).toHaveLength(4);
    for (let i = 0; i < 6; i++) nl.update({ x: 0, z: 5 }, true, 0.5);
    expect(nl.lights.filter((l) => l.intensity > 0)).toHaveLength(4);
    nl.setPoolSize(12);
    expect(scene.children.filter((c) => (c as THREE.PointLight).isPointLight)).toHaveLength(12);
  });

  it('CarLod switches to its instanced model closer on phone', () => {
    const lod = new CarLod({ carPaint: () => new THREE.MeshStandardMaterial(), get: () => new THREE.MeshStandardMaterial() } as never, { buildModel: () => null, nearDist: TIER_CONFIG.low.carNearDist });
    lod.setNearDist(tierConfig('phone').carNearDist);
    expect((lod as unknown as { near: number }).near).toBe(14);
    lod.setNearDist(-5); // ignored
    expect((lod as unknown as { near: number }).near).toBe(14);
  });
});

import { InstanceCuller } from '@/render/Culling';
import { HIDDEN_LAYER, PHONE_HIDDEN_MESH, setPhoneDetailHidden } from '@/render/TierGeometry';

describe('TierGeometry', () => {
  it('hides the small-detail meshes on a camera layer and restores them', () => {
    const root = new THREE.Group();
    const mk = (name: string) => { const m = new THREE.Mesh(new THREE.BufferGeometry()); m.name = name; root.add(m); return m; };
    const fire = mk('buildings:metalDark:0'), wires = mk('props:wires'), wall = mk('buildings:limestone:0'), man = mk('manholes'), poles = mk('signal-poles');
    expect(setPhoneDetailHidden(root, true)).toBe(3);
    for (const m of [fire, wires, man]) { expect(m.layers.isEnabled(HIDDEN_LAYER)).toBe(true); expect(m.layers.isEnabled(0)).toBe(false); expect(m.visible).toBe(true); }
    for (const m of [wall, poles]) expect(m.layers.isEnabled(0)).toBe(true);
    expect(setPhoneDetailHidden(root, true)).toBe(0);
    expect(setPhoneDetailHidden(root, false)).toBe(3);
    expect(fire.layers.isEnabled(0)).toBe(true);
    expect(PHONE_HIDDEN_MESH.test('furniture:treeLeaves')).toBe(false);
  });
});

describe('InstanceCuller', () => {
  function trees(n: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), n);
    for (let i = 0; i < n; i++) m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 10, 0, 0));
    return m;
  }
  it('keeps only instances in range (compacted, order kept), restores all on Infinity', () => {
    const m = trees(100); // x = 0..990
    const c = new InstanceCuller(10);
    c.add(m);
    c.setRange(100);
    c.update(0, 0);
    expect(m.count).toBe(12); // x <= 110
    const a = m.instanceMatrix.array as Float32Array;
    expect(a[11 * 16 + 12]).toBe(110);
    c.update(2, 0); // moved less than the step: nothing recomputed
    expect(m.count).toBe(12);
    c.update(500, 0);
    expect(m.count).toBe(23);
    expect(a[0 * 16 + 12]).toBe(390);
    c.setRange(Infinity);
    expect(m.count).toBe(100);
    expect(a[99 * 16 + 12]).toBe(990);
    expect(m.visible).toBe(true);
  });
  it('hides a mesh with nothing in range (no empty draw call)', () => {
    const m = trees(5);
    const c = new InstanceCuller(0);
    c.add(m);
    c.setRange(5);
    c.update(5000, 5000);
    expect(m.count).toBe(0);
    expect(m.visible).toBe(false);
    c.setRange(Infinity);
    expect(m.visible).toBe(true);
  });
});
