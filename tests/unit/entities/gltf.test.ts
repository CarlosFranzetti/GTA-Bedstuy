import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GltfCharacterSource, ProceduralCharacterSource, pickClips } from '@/entities/models/gltf/CharacterSource';
import { GltfVehicleSource } from '@/entities/models/gltf/VehicleSource';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const materials: IMaterialLibrary = {
  get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
};

/** A GLTFLoader plugin that stubs texture decoding: node has no Image, and we only test geometry / skeleton / clips. */
function stubTextures(loader: GLTFLoader): GLTFLoader {
  loader.register(() => ({ name: 'TEST_stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader;
}

async function parseFixture(): Promise<import('three/addons/loaders/GLTFLoader.js').GLTF> {
  const buf = readFileSync(new URL('../../fixtures/CesiumMan.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return stubTextures(new GLTFLoader()).parseAsync(ab, '');
}

const skinnedGeometries = (o: THREE.Object3D): THREE.BufferGeometry[] => {
  const out: THREE.BufferGeometry[] = [];
  o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) out.push((c as THREE.Mesh).geometry); });
  return out;
};

describe('GltfCharacterSource (CesiumMan)', () => {
  let source: GltfCharacterSource;
  beforeAll(async () => { source = GltfCharacterSource.fromGltf(await parseFixture()); });

  it('is ready and normalises the model to 1.75 m with feet on the ground', () => {
    expect(source.ready).toBe(true);
    const rig = source.instantiate(0);
    expect(rig.height).toBeCloseTo(1.75, 5);
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group, true);
    expect(box.max.y - box.min.y).toBeCloseTo(1.75, 1);
    expect(Math.abs(box.min.y)).toBeLessThan(0.05);
  });

  it('treats the single clip as the walk cycle', () => {
    const rig = source.instantiate(0);
    expect(rig.clips.walk).not.toBeNull();
    expect(rig.clips.idle).toBeNull();
    expect(rig.clips.run).toBeNull();
    expect(rig.mixer).toBeDefined();
  });

  it('holds still when slow and starts the walk action above 0.3 m/s', () => {
    const rig = source.instantiate(1);
    const walk = rig.clips.walk!;
    rig.setSpeed(0);
    expect(walk.isRunning()).toBe(false);
    rig.setSpeed(1.2);
    expect(walk.isRunning()).toBe(true);
    expect(walk.getEffectiveTimeScale()).toBeGreaterThan(0.6);
    rig.update(0.1);
    expect(walk.time).toBeGreaterThan(0);
    // a run speed with no run clip keeps walking, faster
    rig.setSpeed(6);
    expect(walk.isRunning()).toBe(true);
    expect(walk.getEffectiveTimeScale()).toBeGreaterThan(1.2);
  });

  it('shares the skinned geometry between instances', () => {
    const a = source.instantiate(0);
    const b = source.instantiate(5);
    const ga = skinnedGeometries(a.group);
    const gb = skinnedGeometries(b.group);
    expect(ga.length).toBeGreaterThan(0);
    expect(ga[0]).toBe(gb[0]);
    // ... but each has its own skeleton / node tree
    expect(a.group).not.toBe(b.group);
    let sa: THREE.Skeleton | undefined;
    let sb: THREE.Skeleton | undefined;
    a.group.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) sa = (c as THREE.SkinnedMesh).skeleton; });
    b.group.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) sb = (c as THREE.SkinnedMesh).skeleton; });
    expect(sa).toBeDefined();
    expect(sa).not.toBe(sb);
  });

  it('tints variants with shared materials and leaves the source untouched', () => {
    const colourOf = (rig: ReturnType<GltfCharacterSource['instantiate']>) => {
      let c = new THREE.Color();
      rig.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) c = ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone(); });
      return c;
    };
    const a = colourOf(source.instantiate(1));
    const b = colourOf(source.instantiate(2));
    const a2 = colourOf(source.instantiate(9)); // wraps to 1
    expect(a.equals(b)).toBe(false);
    expect(a.equals(a2)).toBe(true);
  });

  it('setDown pauses the animation and lays the group flat; setDown(false) restores', () => {
    const rig = source.instantiate(0);
    rig.setSpeed(1.4);
    rig.update(0.1);
    const t = rig.clips.walk!.time;
    rig.setDown(true);
    expect(Math.abs(rig.group.rotation.x)).toBeCloseTo(Math.PI / 2, 5);
    rig.update(0.5);
    expect(rig.clips.walk!.time).toBe(t);
    rig.setDown(false);
    expect(rig.group.rotation.x).toBe(0);
    rig.update(0.1);
    expect(rig.clips.walk!.time).toBeGreaterThan(t);
  });

  it('dispose detaches the group', () => {
    const rig = source.instantiate(0);
    const parent = new THREE.Group();
    parent.add(rig.group);
    rig.dispose();
    expect(rig.group.parent).toBeNull();
  });
});

describe('pickClips', () => {
  const clip = (name: string) => new THREE.AnimationClip(name, 1, []);
  it('matches names case-insensitively', () => {
    const c = pickClips([clip('Armature|IDLE_loop'), clip('Walking'), clip('Jog_Fwd')]);
    expect(c.idle?.name).toBe('Armature|IDLE_loop');
    expect(c.walk?.name).toBe('Walking');
    expect(c.run?.name).toBe('Jog_Fwd');
  });
  it('a lone clip is the walk, whatever it is called', () => {
    expect(pickClips([clip('Take 001')]).walk?.name).toBe('Take 001');
  });
});

describe('ProceduralCharacterSource', () => {
  it('implements the same rig interface', () => {
    const rig = new ProceduralCharacterSource(materials, new Rng(1)).instantiate(3);
    expect(rig.height).toBeGreaterThan(1.6);
    rig.setSpeed(1.4);
    rig.update(0.1);
    rig.setDown(true);
    expect(rig.group.rotation.x).toBeCloseTo(Math.PI / 2, 5);
    rig.setDown(false);
    expect(rig.group.rotation.x).toBe(0);
    rig.dispose();
  });
});

describe('GltfVehicleSource', () => {
  /** A synthetic car facing +z (glTF default): body, 4 named wheels, head/tail lights. */
  function fakeCar(): THREE.Group {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.4), new THREE.MeshStandardMaterial({ name: 'CarPaint', color: 0x00ff00 }));
    body.name = 'Body';
    body.position.y = 0.7;
    root.add(body);
    const wheel = (n: string, x: number, z: number) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial());
      w.name = n; w.position.set(x, 0.35, z); root.add(w);
    };
    wheel('Wheel_FL', -0.9, 1.4); wheel('Wheel_FR', 0.9, 1.4); wheel('Wheel_RL', -0.9, -1.4); wheel('Wheel_RR', 0.9, -1.4);
    const light = (n: string, z: number) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshStandardMaterial());
      l.name = n; l.position.set(0.6, 0.8, z); root.add(l);
    };
    light('Headlight_R', 2.2); light('Taillight_R', -2.2);
    return root;
  }

  it('produces a CarModel scaled to the spec length, front toward -z', () => {
    const src = GltfVehicleSource.fromGltf({ scene: fakeCar() } as never, 'sedan');
    const spec = VEHICLE_SPECS.sedan;
    const m = src.instantiate(spec);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    expect(box.max.z - box.min.z).toBeCloseTo(spec.length, 2);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(m.wheels).toHaveLength(4);
    expect(m.steerPivots).toHaveLength(2);
    expect(m.headlights).toHaveLength(1);
    expect(m.taillights).toHaveLength(1);
    const zOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).z;
    expect(zOf(m.headlights[0])).toBeLessThan(0);
    expect(zOf(m.taillights[0])).toBeGreaterThan(0);
    for (const s of m.steerPivots) expect(s.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(0);
    expect(m.paintMeshes.map((p) => p.name)).toEqual(['Body']);
    expect(m.ownMaterials.length).toBe(2);
    expect(m.wheelRadius).toBeGreaterThan(0.2);
    // spinning a roll pivot does not move the wheel
    const before = new THREE.Box3().setFromObject(m.wheels[0]).getCenter(new THREE.Vector3());
    m.wheels[0].rotation.x = 1;
    m.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(m.wheels[0]).getCenter(new THREE.Vector3()).distanceTo(before)).toBeLessThan(0.01);
  });
});
