import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GltfCharacterSource, ProceduralCharacterSource, pickClips, baseClipName, clothMaterials, tintCloth } from '@/entities/models/gltf/CharacterSource';
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

type Bytes = { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };

async function parseFixture(): Promise<import('three/addons/loaders/GLTFLoader.js').GLTF> {
  // the project has no @types/node, so load node:fs without static types
  const spec: string = 'node:fs';
  const fs = (await import(/* @vite-ignore */ spec)) as { readFileSync(p: URL): Bytes };
  const buf = fs.readFileSync(new URL('../../fixtures/CesiumMan.glb', import.meta.url));
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
    rig.mixer!.stopAllAction(); // back to the bind pose
    rig.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose(); });
    rig.group.updateMatrixWorld(true);
    const bind = new THREE.Box3().setFromObject(rig.group, true);
    expect(bind.max.y - bind.min.y).toBeCloseTo(1.75, 2);
    expect(bind.min.y).toBeCloseTo(0, 2);
    rig.setSpeed(1.2);
    rig.update(0);
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group, true);
    // measured in the first frame of the walk clip: a striding pose is a little shorter than the bind pose (which is 1.75 exactly)
    expect(box.max.y - box.min.y).toBeGreaterThan(1.65);
    expect(box.max.y - box.min.y).toBeLessThan(1.8);
    expect(Math.abs(box.min.y)).toBeLessThan(0.1);
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
  it('strips armature and rig prefixes and prefers exact names over look-alikes', () => {
    const c = pickClips([clip('CharacterArmature|Man_RunningJump'), clip('CharacterArmature|Idle_Gun'), clip('CharacterArmature|Idle'), clip('CharacterArmature|Run_Back'), clip('CharacterArmature|Run'), clip('Man_Walk')]);
    expect(c.idle?.name).toBe('CharacterArmature|Idle');
    expect(c.run?.name).toBe('CharacterArmature|Run');
    expect(c.walk?.name).toBe('Man_Walk');
    expect(baseClipName('CharacterArmature|Man_Idle')).toBe('Idle');
    expect(baseClipName('Idle')).toBe('Idle');
  });
  it('never takes a jump / punch / sword clip for a locomotion clip', () => {
    const c = pickClips([clip('Man_RunningJump'), clip('Man_SwordSlash'), clip('Man_Punch')]);
    expect(c.run).toBeNull();
    expect(c.walk).toBeNull();
    expect(c.idle).toBeNull();
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
    expect(m.paintMeshes.map((p) => p.name)).toEqual(['body']);
    expect(m.ownMaterials.length).toBe(2);
    expect(m.wheelRadius).toBeGreaterThan(0.2);
    // spinning a roll pivot does not move the wheel
    const before = new THREE.Box3().setFromObject(m.wheels[0]).getCenter(new THREE.Vector3());
    m.wheels[0].rotation.x = 1;
    m.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(m.wheels[0]).getCenter(new THREE.Vector3()).distanceTo(before)).toBeLessThan(0.01);
  });
});

describe('GltfVehicleSource (fake models)', () => {
  const body = () => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 3), new THREE.MeshStandardMaterial({ name: 'paint', color: 0x888888 }));
    b.name = 'Body';
    b.position.y = 0.65;
    return b;
  };
  const wheel = (n: string, x: number, z: number, root: THREE.Object3D) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial());
    w.name = n; w.position.set(x, 0.3, z); root.add(w);
  };

  it('synthesises lights, plates and (cop) a light bar when the model has no light nodes', () => {
    const root = new THREE.Group();
    root.add(body());
    wheel('wheel-front-left', 0.7, 1, root); wheel('wheel-front-right', -0.7, 1, root);
    wheel('wheel-back-left', 0.7, -1, root); wheel('wheel-back-right', -0.7, -1, root);
    const gltf = { scene: root } as never;
    const car = GltfVehicleSource.fromGltf(gltf, 'sedan').instantiate(VEHICLE_SPECS.sedan);
    expect(car.headlights).toHaveLength(1);
    expect(car.taillights).toHaveLength(1);
    expect(car.headlights[0].name).toBe('headlight');
    expect(car.taillights[0].name).toBe('taillight');
    expect(car.lightbar).toBeUndefined();
    const lamp = (car.headlights[0].material as THREE.MeshStandardMaterial);
    expect(lamp.emissiveIntensity).toBe(0);
    car.group.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(car.headlights[0]);
    const tb = new THREE.Box3().setFromObject(car.taillights[0]);
    expect(hb.max.z).toBeLessThan(0); // front is -z
    expect(tb.min.z).toBeGreaterThan(0);
    expect(hb.getSize(new THREE.Vector3()).x).toBeGreaterThan(0.6); // two lamps, left and right
    const plates: string[] = [];
    car.group.traverse((o) => { if (/^plate/.test(o.name)) plates.push(o.name); });
    expect(plates).toHaveLength(2);
    const cop = GltfVehicleSource.fromGltf(gltf, 'cop').instantiate(VEHICLE_SPECS.cop);
    expect(cop.lightbar).toBeTruthy();
    expect(cop.lightbar!.red.material).not.toBe(cop.lightbar!.blue.material);
    cop.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(cop.lightbar!.red).min.y).toBeGreaterThan(VEHICLE_SPECS.cop.height * 0.8);
  });

  it('turns a model whose long axis is x, and finds the front from the wheel names', () => {
    const root = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 1.6), new THREE.MeshStandardMaterial({ name: 'paint' }));
    b.position.y = 0.65; b.name = 'Body'; root.add(b);
    wheel('wheel-front-left', 1, 0.7, root); wheel('wheel-front-right', 1, -0.7, root);
    wheel('wheel-back-left', -1, 0.7, root); wheel('wheel-back-right', -1, -0.7, root);
    const car = GltfVehicleSource.fromGltf({ scene: root } as never, 'sedan').instantiate(VEHICLE_SPECS.sedan);
    car.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(car.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x);
    for (const s of car.steerPivots) expect(s.position.z).toBeLessThan(0);
    expect(car.wheels).toHaveLength(4);
  });

  it('keeps wheels round and on the ground when the body is stretched to the spec', () => {
    const root = new THREE.Group();
    root.add(body());
    wheel('wheel-front-left', 0.7, 1, root); wheel('wheel-front-right', -0.7, 1, root);
    wheel('wheel-back-left', 0.7, -1, root); wheel('wheel-back-right', -0.7, -1, root);
    const car = GltfVehicleSource.fromGltf({ scene: root } as never, 'suv').instantiate(VEHICLE_SPECS.suv);
    car.group.updateMatrixWorld(true);
    for (const w of car.wheels) {
      const b = new THREE.Box3().setFromObject(w, true);
      const s = b.getSize(new THREE.Vector3());
      expect(b.min.y).toBeCloseTo(0, 2);
      expect(s.y).toBeCloseTo(s.z, 2);
    }
  });

  it('a spare tyre named wheel is not spun', () => {
    const root = new THREE.Group();
    root.add(body());
    wheel('wheel-front-left', 0.7, 1, root); wheel('wheel-front-right', -0.7, 1, root);
    wheel('wheel-back-left', 0.7, -1, root); wheel('wheel-back-right', -0.7, -1, root);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), new THREE.MeshStandardMaterial());
    spare.name = 'wheel-spare'; spare.position.set(0, 1.2, -1.6); root.add(spare);
    const car = GltfVehicleSource.fromGltf({ scene: root } as never, 'suv').instantiate(VEHICLE_SPECS.suv);
    expect(car.wheels).toHaveLength(4);
  });

  it('lodParts is null for models that are not palette painted', () => {
    const root = new THREE.Group();
    root.add(body());
    expect(GltfVehicleSource.fromGltf({ scene: root } as never, 'sedan').lodParts()).toBeNull();
  });
});

describe('GltfCharacterSource (fake models)', () => {
  /** A skinned stick figure with a root armature scale of 100 and a weapon child, like the Quaternius exports. */
  function fakeRig(): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
    const scene = new THREE.Group();
    const armature = new THREE.Group();
    armature.name = 'CharacterArmature';
    armature.scale.setScalar(100);
    const root = new THREE.Bone(); root.name = 'Root';
    const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 0.009, 0); root.add(hips);
    const head = new THREE.Bone(); head.name = 'Head'; head.position.set(0, 0.008, 0); hips.add(head);
    armature.add(root);
    const geo = new THREE.BoxGeometry(0.004, 0.017, 0.002, 1, 4, 1).translate(0, 0.0085, 0);
    const n = geo.getAttribute('position').count;
    const idx = new Uint16Array(n * 4), w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { idx[i * 4] = geo.getAttribute('position').getY(i) > 0.009 ? 2 : 1; w[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    const shirt = new THREE.MeshStandardMaterial({ name: 'Shirt', color: 0x203040 });
    const skin = new THREE.MeshStandardMaterial({ name: 'Skin', color: 0x8a6040 });
    const shirtMesh = new THREE.SkinnedMesh(geo, shirt);
    const skinMesh = new THREE.SkinnedMesh(geo.clone(), skin);
    for (const m of [shirtMesh, skinMesh]) { m.bind(new THREE.Skeleton([root, hips, head])); armature.add(m); }
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshStandardMaterial());
    sword.name = 'Sword';
    armature.add(sword);
    scene.add(armature);
    const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0.009, 0, 0, 0.009, 0])]);
    return { scene, animations: ['CharacterArmature|Idle', 'CharacterArmature|Walk', 'CharacterArmature|Run', 'CharacterArmature|Sword_Slash'].map(clip) };
  }

  it('normalises a centimetre-scale armature (x100) to 1.75 m and removes the sword', () => {
    const src = GltfCharacterSource.fromGltf(fakeRig() as never);
    const rig = src.instantiate(0);
    rig.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(rig.group, true);
    expect(Number.isFinite(b.min.y) && Number.isFinite(b.max.x)).toBe(true);
    expect(b.max.y - b.min.y).toBeGreaterThan(1.6);
    expect(b.max.y - b.min.y).toBeLessThan(1.9);
    expect(Math.abs(b.min.y)).toBeLessThan(0.08);
    let sword = false;
    rig.group.traverse((o) => { if (o.name === 'Sword') sword = true; });
    expect(sword).toBe(false);
  });

  it('matches the prefixed clip names to idle / walk / run and ignores the sword slash', () => {
    const rig = GltfCharacterSource.fromGltf(fakeRig() as never).instantiate(0);
    expect(rig.clips.idle?.getClip().name).toBe('CharacterArmature|Idle');
    expect(rig.clips.walk?.getClip().name).toBe('CharacterArmature|Walk');
    expect(rig.clips.run?.getClip().name).toBe('CharacterArmature|Run');
    rig.setSpeed(5.5);
    expect(rig.clips.run!.isRunning()).toBe(true);
    expect(rig.clips.run!.getEffectiveTimeScale()).toBeCloseTo(1, 1);
    rig.setSpeed(0);
    expect(rig.clips.idle!.isRunning()).toBe(true);
  });

  it('tints the cloth material of a multi-material model and leaves skin alone', () => {
    const src = GltfCharacterSource.fromGltf(fakeRig() as never);
    const colourOf = (variant: number, mat: string) => {
      let hex = -1;
      src.instantiate(variant).group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).name === mat) hex = (m.material as THREE.MeshStandardMaterial).color.getHex(); });
      return hex;
    };
    expect(colourOf(1, 'Shirt')).not.toBe(colourOf(2, 'Shirt'));
    expect(colourOf(0, 'Shirt')).toBe(new THREE.Color(0x203040).getHex()); // variant 0 keeps the authored colour
    expect(colourOf(1, 'Skin')).toBe(colourOf(2, 'Skin'));
    expect(colourOf(3, 'Skin')).toBe(new THREE.Color(0x8a6040).getHex());
  });

  it('cloth helpers: shirt names win; dark cloth takes the tint, light cloth is multiplied', () => {
    const mk = (name: string) => new THREE.MeshStandardMaterial({ name });
    const mats = [mk('Skin'), mk('Shirt'), mk('Pants'), mk('Hair')];
    expect([...clothMaterials(mats)].map((m) => m.name)).toEqual(['Shirt']);
    expect([...clothMaterials([mk('Skin'), mk('Metal'), mk('Black'), mk('Brown')])].map((m) => m.name)).toEqual(['Black', 'Brown']);
    const dark = tintCloth(new THREE.Color(0x101820), new THREE.Color(0xd9534f));
    expect(dark.r).toBeGreaterThan(0.2);
    const light = tintCloth(new THREE.Color(0xffffff), new THREE.Color(0x4f8fd9));
    expect(light.getHex()).toBe(new THREE.Color(0x4f8fd9).getHex());
  });
});
