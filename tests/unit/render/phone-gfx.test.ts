import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { phoneSunCasters, SUN_SHADOW, SHADOWS_ENABLED, setupShadows } from '@/render/Shadows';
import {
  buildLotCasterGeometry, CASTER_INSET, LOT_CASTER_HEIGHT,
  BLOB_CAR_CAPACITY, BLOB_Y, BlobShadows, CAR_BLOB_SCALE_L, CAR_BLOB_SCALE_W, PED_BLOB_SIZE, carBlobAlpha, pedBlobAlpha, writeBlobMatrix,
} from '@/render/BlobShadows';
import {
  SIGN_BLOOM_OFF_FPS, SIGN_BLOOM_ON_FPS, TIER_CONFIG, applyTierFog, fogFactorAt, fogRampFor, signBloomGate, tierConfig,
} from '@/render/QualityTier';

const at = (b: BlobShadows, kind: 'cars' | 'peds') => (b.group.children.find((c) => c.name === `blob:${kind}`) as THREE.InstancedMesh);
const pos = (m: THREE.InstancedMesh, i: number) => { const a = m.instanceMatrix.array; return [a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]].map((v) => Math.round(v * 1000) / 1000); };

describe('BlobShadows bookkeeping', () => {
  it('is exactly two instanced draws, empty until something is added', () => {
    const b = new BlobShadows();
    expect(b.group.children).toHaveLength(2);
    expect(b.group.children.every((c) => (c as THREE.InstancedMesh).isInstancedMesh)).toBe(true);
    b.beginFrame(); b.endFrame();
    expect(b.carCount).toBe(0); expect(b.pedCount).toBe(0); expect(b.drawCalls).toBe(0);
    expect(at(b, 'cars').visible).toBe(false);
  });

  it('adds cars and peds per frame and a blob that is not re-added disappears (removal)', () => {
    const b = new BlobShadows();
    b.beginFrame();
    b.addCar(1, 2, 0, 4.6, 1.8); b.addCar(10, 20, 1, 7, 2.4); b.addPed(3, 4); b.addPed(5, 6); b.addPed(7, 8);
    b.endFrame();
    expect(b.carCount).toBe(2); expect(b.pedCount).toBe(3); expect(b.drawCalls).toBe(2);
    expect(at(b, 'cars').count).toBe(2); expect(at(b, 'peds').count).toBe(3);
    expect(pos(at(b, 'cars'), 1)).toEqual([10, BLOB_Y, 20]);
    expect(pos(at(b, 'peds'), 2)).toEqual([7, BLOB_Y, 8]);
    // next frame: one car left, no peds
    b.beginFrame(); b.addCar(1, 2, 0, 4.6, 1.8); b.endFrame();
    expect(b.carCount).toBe(1); expect(b.pedCount).toBe(0); expect(b.drawCalls).toBe(1);
    expect(at(b, 'peds').visible).toBe(false); expect(at(b, 'peds').count).toBe(0);
  });

  it('follows the entity: a moved car rewrites its slot', () => {
    const b = new BlobShadows();
    b.beginFrame(); b.addCar(0, 0, 0, 4.6, 1.8); b.endFrame();
    b.beginFrame(); b.addCar(5, -3, 0, 4.6, 1.8); b.endFrame();
    expect(pos(at(b, 'cars'), 0)).toEqual([5, BLOB_Y, -3]);
  });

  it('sizes the car blob from the spec box, length along the heading', () => {
    const b = new BlobShadows();
    b.beginFrame(); b.addCar(0, 0, 0, 4.6, 1.8); b.addCar(0, 0, Math.PI / 2, 4.6, 1.8); b.endFrame();
    const a = at(b, 'cars').instanceMatrix.array;
    // heading 0: width on x, length on z
    expect(a[0]).toBeCloseTo(1.8 * CAR_BLOB_SCALE_W, 5);
    expect(a[10]).toBeCloseTo(4.6 * CAR_BLOB_SCALE_L, 5);
    // heading 90 deg: the length now lies along x (|a[8]| holds the z-axis scale in x)
    expect(Math.abs(a[16 + 8])).toBeCloseTo(4.6 * CAR_BLOB_SCALE_L, 5);
    expect(Math.abs(a[16 + 2])).toBeCloseTo(1.8 * CAR_BLOB_SCALE_W, 5);
  });

  it('peds are small round decals', () => {
    const b = new BlobShadows();
    b.beginFrame(); b.addPed(0, 0); b.addPed(0, 0, 2); b.endFrame();
    const a = at(b, 'peds').instanceMatrix.array;
    expect(a[0]).toBeCloseTo(PED_BLOB_SIZE, 5); expect(a[10]).toBeCloseTo(PED_BLOB_SIZE, 5);
    expect(a[16]).toBeCloseTo(PED_BLOB_SIZE * 2, 5);
  });

  it('drops (and counts) instances past the capacity instead of throwing', () => {
    const b = new BlobShadows(2, 1);
    b.beginFrame();
    expect(b.addCar(0, 0, 0, 4, 2)).toBe(true); expect(b.addCar(1, 0, 0, 4, 2)).toBe(true); expect(b.addCar(2, 0, 0, 4, 2)).toBe(false);
    expect(b.addPed(0, 0)).toBe(true); expect(b.addPed(1, 0)).toBe(false);
    b.endFrame();
    expect(b.carCount).toBe(2); expect(b.droppedCars).toBe(1); expect(b.pedCount).toBe(1); expect(b.droppedPeds).toBe(1);
    b.beginFrame();
    expect(b.droppedCars).toBe(0);
    expect(BLOB_CAR_CAPACITY).toBeGreaterThanOrEqual(64);
  });

  it('setEnabled hides the group and zeroes the draw count; strength fades but keeps a floor', () => {
    const b = new BlobShadows();
    b.beginFrame(); b.addCar(0, 0, 0, 4, 2); b.addPed(0, 0); b.endFrame();
    expect(b.drawCalls).toBe(2);
    b.setEnabled(false);
    expect(b.group.visible).toBe(false); expect(b.drawCalls).toBe(0); expect(b.enabled).toBe(false);
    b.setEnabled(true);
    const m = (at(b, 'cars').material as THREE.MeshBasicMaterial);
    b.setStrength(1); const day = m.opacity;
    b.setStrength(0); const night = m.opacity;
    expect(night).toBeLessThan(day); expect(night).toBeGreaterThan(day * 0.4);
    b.setStrength(NaN); expect(m.opacity).toBeCloseTo(day, 5);
  });

  it('matrix helper and alpha profiles', () => {
    const o = new Float32Array(16);
    writeBlobMatrix(o, 0, 3, 4, 0, 2, 5);
    expect([o[0], o[10], o[12], o[13], o[14], o[15]].map((v) => Math.round(v * 1000) / 1000)).toEqual([2, 5, 3, BLOB_Y, 4, 1]);
    expect(carBlobAlpha(0, 0)).toBe(1); expect(carBlobAlpha(1, 1)).toBe(0);
    expect(carBlobAlpha(0.3, 0.3)).toBeGreaterThan(carBlobAlpha(0.55, 0.6));
    expect(pedBlobAlpha(0, 0)).toBe(1); expect(pedBlobAlpha(1, 0)).toBe(0);
    expect(pedBlobAlpha(0.5, 0)).toBeGreaterThan(0.4);
  });
});

describe('phone tier table: blobs, bloom, fog', () => {
  it('only phone has blobs and the sign bloom option', () => {
    expect(tierConfig('phone').blobShadows).toBe(true);
    expect(tierConfig('phone').signBloomFps).toBe(45);
    for (const q of ['low', 'medium', 'high'] as const) { expect(TIER_CONFIG[q].blobShadows).toBe(false); expect(TIER_CONFIG[q].signBloomFps).toBeNull(); }
  });

  it('fog ramp is nearer and denser on phone than the time cycle, and untouched elsewhere', () => {
    const p = tierConfig('phone').fog!;
    expect(p.near).toBeLessThan(35); // MOB's first ramp was 35 / 105
    expect(p.far).toBeLessThan(105);
    expect(p.far).toBeLessThanOrEqual(tierConfig('phone').cullDistance);
    // noon time cycle (150 / 1800) is clamped to the tier ramp, a heavy-fog hour keeps its own nearer ramp
    expect(fogRampFor('phone', 150, 1800)).toEqual(p);
    expect(fogRampFor('phone', 10, 50)).toEqual({ near: 10, far: 50 });
    for (const q of ['low', 'medium', 'high'] as const) expect(fogRampFor(q, 150, 1800)).toEqual({ near: 150, far: 1800 });
  });

  it('the world edge is fully fogged: at the cull distance the fog factor is 1, and it ramps smoothly from the near plane', () => {
    const t = tierConfig('phone');
    const p = t.fog!;
    expect(fogFactorAt(t.cullDistance, p.near, p.far)).toBe(1);
    expect(fogFactorAt(p.near, p.near, p.far)).toBe(0);
    expect(fogFactorAt((p.near + p.far) / 2, p.near, p.far)).toBeCloseTo(0.5, 5);
    // a dense ramp: 60% fog by the middle of the street block (35 m)
    expect(fogFactorAt(35, p.near, p.far)).toBeGreaterThan(0.15);
  });

  it('applyTierFog clamps the ramp and only recolours when the tier has an override', () => {
    const horizon = new THREE.Color('#d9c7a0');
    const f = new THREE.Fog('#112233', 150, 1800);
    applyTierFog(f, 'phone', horizon);
    expect(f.near).toBe(tierConfig('phone').fog!.near); expect(f.far).toBe(tierConfig('phone').fog!.far);
    expect(f.color.getHex()).toBe(horizon.getHex());
    const g = new THREE.Fog('#112233', 150, 1800);
    applyTierFog(g, 'low', horizon);
    expect([g.near, g.far, g.color.getHex()]).toEqual([150, 1800, new THREE.Color('#112233').getHex()]);
    applyTierFog(null, 'phone'); // no fog in the scene: no throw
  });
});

describe('sign bloom gate', () => {
  it('needs night, a phone-tier option and the frame rate', () => {
    expect(signBloomGate('phone', true, 60, false)).toBe(true);
    expect(signBloomGate('phone', false, 60, false)).toBe(false);   // daytime: off
    expect(signBloomGate('phone', true, 30, false)).toBe(false);    // slow device: off
    expect(signBloomGate('phone', true, 0, false)).toBe(false);     // no fps reading yet: off
    expect(signBloomGate('phone', true, NaN, true)).toBe(false);
    for (const q of ['low', 'medium', 'high'] as const) expect(signBloomGate(q, true, 120, false)).toBe(false); // those tiers have their own bloom
  });

  it('switches on at 45 fps and stays on until it drops under 38 (hysteresis)', () => {
    expect(signBloomGate('phone', true, SIGN_BLOOM_ON_FPS - 1, false)).toBe(false);
    expect(signBloomGate('phone', true, SIGN_BLOOM_ON_FPS, false)).toBe(true);
    expect(signBloomGate('phone', true, 41, true)).toBe(true);
    expect(signBloomGate('phone', true, SIGN_BLOOM_OFF_FPS - 0.5, true)).toBe(false);
  });
});

describe('phone sun shadow casters', () => {
  const lot = (type: string, x = 0) => ({ frontA: { x, z: 0 }, frontB: { x: x + 6, z: 0 }, depth: 20, outward: { x: 0, z: 1 }, type });

  it('one 12-triangle prism per building lot; vacant lots and scaffolds cast nothing', () => {
    const { geometry, lots } = buildLotCasterGeometry([lot('brownstone'), lot('apartment', 10), lot('vacant', 20), lot('scaffold', 30)]);
    expect(lots).toBe(2);
    expect(geometry.index!.count / 3).toBe(2 * 10); // 4 walls + top = 5 quads = 10 triangles a lot
    expect(geometry.getAttribute('position').count).toBe(2 * 8);
  });

  it('the prism is pulled in from the building line (no self-shadow acne) and as tall as the lot type', () => {
    const { geometry } = buildLotCasterGeometry([lot('brownstone')]);
    const p = geometry.getAttribute('position');
    let minZ = Infinity, maxZ = -Infinity, maxY = 0, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < p.count; i++) { minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i)); maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); }
    // outward is +z, so the lot extends towards -z from the front edge z = 0
    expect(maxZ).toBeCloseTo(-CASTER_INSET, 5); expect(minZ).toBeCloseTo(-(20 - CASTER_INSET), 5);
    expect(minX).toBeCloseTo(CASTER_INSET, 5); expect(maxX).toBeCloseTo(6 - CASTER_INSET, 5);
    expect(maxY).toBe(LOT_CASTER_HEIGHT.brownstone);
  });

  it('the caster boxes share the blob instance matrices (no extra upload) and follow the same counts', () => {
    const b = new BlobShadows();
    expect(b.sunCasters).toBe(false);
    const built = b.buildSunCasters([lot('brownstone')]);
    expect(built.lots).toBe(1);
    expect(b.casterGroup.children.map((c) => c.name).sort()).toEqual(['caster:buildings', 'caster:cars', 'caster:peds']);
    const cars = b.casterGroup.children.find((c) => c.name === 'caster:cars') as THREE.InstancedMesh;
    expect(cars.instanceMatrix).toBe(at(b, 'cars').instanceMatrix);
    b.beginFrame(); b.addCar(0, 0, 0, 4.6, 1.8); b.addCar(5, 0, 0, 4.6, 1.8); b.addPed(1, 1); b.endFrame();
    expect(cars.count).toBe(2);
    expect((b.casterGroup.children.find((c) => c.name === 'caster:peds') as THREE.InstancedMesh).count).toBe(1);
    // the car box has exactly the spec footprint once the blob scale is applied
    cars.geometry.computeBoundingBox();
    const bb = cars.geometry.boundingBox!;
    expect((bb.max.x - bb.min.x) * 1.8 * CAR_BLOB_SCALE_W).toBeCloseTo(1.8, 4);
    expect((bb.max.z - bb.min.z) * 4.6 * CAR_BLOB_SCALE_L).toBeCloseTo(4.6, 4);
    // building casters are a single draw: the whole prism mesh
    expect(b.casterGroup.visible).toBe(false); // hidden in the colour pass
  });

  it('casters are only shown inside the shadow render, and only while enabled; the blob weakens next to a real shadow', () => {
    const b = new BlobShadows();
    b.buildSunCasters([lot('brownstone')]);
    let seen: boolean | null = null;
    const r = { shadowMap: { render: () => { seen = b.casterGroup.visible; } } };
    b.wrapShadowRender(r as never);
    r.shadowMap.render(); expect(seen).toBe(false);           // setSunCasters not called yet
    const m = at(b, 'cars').material as THREE.MeshBasicMaterial;
    b.setStrength(1); const alone = m.opacity;
    b.setSunCasters(true);
    r.shadowMap.render(); expect(seen).toBe(true);
    expect(b.casterGroup.visible).toBe(false);                 // hidden again after the pass
    expect(m.opacity).toBeLessThan(alone);
    b.setSunCasters(false);
    expect(m.opacity).toBeCloseTo(alone, 5);
  });

  it('phone has a 512 px, 40 m sun shadow without the proxy build; other tiers keep theirs', () => {
    expect(SUN_SHADOW).toEqual({ phone: true, low: true, medium: true, high: true });
    expect(SHADOWS_ENABLED.phone).toBe(false); // no RenderProxies on a phone
    const r = { shadowMap: { enabled: false, type: 0, autoUpdate: false, needsUpdate: false } } as unknown as THREE.WebGLRenderer;
    const sun = new THREE.DirectionalLight();
    phoneSunCasters.ready = false;
    setupShadows(r, sun, 'phone');
    expect(r.shadowMap.enabled).toBe(false); // no stand-in casters built yet: the world meshes must not all cast into it
    new BlobShadows().buildSunCasters([]);
    setupShadows(r, sun, 'phone');
    expect(r.shadowMap.enabled).toBe(true); expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.x).toBe(512);
    expect(sun.shadow.camera.right - sun.shadow.camera.left).toBe(40);
  });
});
