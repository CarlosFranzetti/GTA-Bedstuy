/**
 * The glTF files that ship in src/assets/models, run through the same sources the game uses (node, no GPU: texture
 * decoding is stubbed). Checks the things that are easy to get wrong with a third-party pack: orientation, scale, the
 * synthesised lights / plates / light bar, recolouring, LOD parts, clip names and the character armature scale.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createGltfLoader, type GLTF } from '@/entities/models/gltf/loader';
import { GltfVehicleSource, KENNEY_PAINT_CELLS } from '@/entities/models/gltf/VehicleSource';
import { GltfCharacterSource, pickClips } from '@/entities/models/gltf/CharacterSource';
import { PaletteCarPaint } from '@/entities/models/gltf/PaletteCarPaint';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { VehicleType } from '@/world/types';

type Bytes = { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };

async function parseShipped(file: string): Promise<GLTF> {
  const spec: string = 'node:fs';
  const fs = (await import(/* @vite-ignore */ spec)) as { readFileSync(p: URL): Bytes };
  const buf = fs.readFileSync(new URL(`../../../src/assets/models/${file}`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = createGltfLoader();
  loader.register(() => ({ name: 'TEST_stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader.parseAsync(ab, '');
}

const TYPES: VehicleType[] = ['sedan', 'suv', 'boxtruck', 'cop'];
const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o, true);
const finite = (b: THREE.Box3) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite);

describe.each(TYPES)('shipped vehicle-%s.glb', (type) => {
  let source: GltfVehicleSource;
  const spec = VEHICLE_SPECS[type];
  beforeAll(async () => { source = GltfVehicleSource.fromGltf(await parseShipped(`vehicle-${type}.glb`), type); });

  it('is fitted to the spec box, facing -z, standing on the ground, no NaN', () => {
    const m = source.instantiate(spec);
    m.group.updateMatrixWorld(true);
    const b = boxOf(m.group);
    expect(finite(b)).toBe(true);
    const s = b.getSize(new THREE.Vector3());
    expect(s.z).toBeCloseTo(spec.length, 1);
    expect(s.x).toBeCloseTo(spec.width, 1);
    expect(s.y).toBeGreaterThanOrEqual(spec.height - 0.05);
    expect(s.y).toBeLessThanOrEqual(spec.height + (type === 'cop' ? 0.12 : 0.05)); // the cop's light bar stands on the roof
    expect(b.min.y).toBeCloseTo(0, 2);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 1);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0, 1);
    // front axle (steered) is toward -z
    for (const st of m.steerPivots) expect(st.position.z).toBeLessThan(0);
  });

  it('has four round wheels on the ground (two steered), and spins them without moving them', () => {
    const m = source.instantiate(spec);
    m.group.updateMatrixWorld(true);
    expect(m.wheels).toHaveLength(4);
    expect(m.steerPivots).toHaveLength(2);
    expect(m.wheelRadius).toBeGreaterThan(0.25);
    expect(m.wheelRadius).toBeLessThan(0.75);
    for (const w of m.wheels) {
      const wb = boxOf(w);
      expect(wb.min.y).toBeCloseTo(0, 1);
      const ws = wb.getSize(new THREE.Vector3());
      expect(ws.y).toBeCloseTo(ws.z, 1); // round, not stretched with the body
      const before = wb.getCenter(new THREE.Vector3());
      w.rotation.x = 1.3;
      m.group.updateMatrixWorld(true);
      expect(boxOf(w).getCenter(new THREE.Vector3()).distanceTo(before)).toBeLessThan(0.02);
    }
  });

  it('synthesises head and tail lights on the body (the pack has no light nodes), initially unlit', () => {
    const m = source.instantiate(spec);
    m.group.updateMatrixWorld(true);
    const body = boxOf(m.group).expandByScalar(0.05);
    expect(m.headlights.length).toBeGreaterThan(0);
    expect(m.taillights.length).toBeGreaterThan(0);
    const zc = (o: THREE.Object3D) => boxOf(o).getCenter(new THREE.Vector3()).z;
    for (const l of m.headlights) {
      const mat = l.material as THREE.MeshStandardMaterial;
      expect(mat.emissiveIntensity).toBe(0);
      expect(mat.emissive.getHex()).not.toBe(0);
      expect(zc(l)).toBeLessThan(-spec.length * 0.3);
      expect(finite(boxOf(l)) && body.containsBox(boxOf(l))).toBe(true);
    }
    for (const l of m.taillights) {
      expect((l.material as THREE.MeshStandardMaterial).emissive.r).toBeGreaterThan(0.5);
      expect(zc(l)).toBeGreaterThan(spec.length * 0.3);
      expect(finite(boxOf(l)) && body.containsBox(boxOf(l))).toBe(true);
    }
    // lamp materials are per car, so one car's brake lights do not light another's
    const m2 = source.instantiate(spec);
    expect(m2.headlights[0].material).not.toBe(m.headlights[0].material);
    expect(m.ownMaterials.length).toBeGreaterThanOrEqual(2);
  });

  it('has a front and a rear plate', () => {
    const m = source.instantiate(spec);
    const plates: THREE.Object3D[] = [];
    m.group.traverse((o) => { if (/^plate/.test(o.name)) plates.push(o); });
    expect(plates.map((p) => p.name).sort()).toEqual(['plateFront', 'plateRear']);
    m.group.updateMatrixWorld(true);
    expect(boxOf(plates.find((p) => p.name === 'plateFront')!).getCenter(new THREE.Vector3()).z).toBeLessThan(0);
    expect(boxOf(plates.find((p) => p.name === 'plateRear')!).getCenter(new THREE.Vector3()).z).toBeGreaterThan(0);
  });

  it(type === 'cop' ? 'gets a red / blue light bar on the roof' : 'has no light bar', () => {
    const m = source.instantiate(spec);
    if (type !== 'cop') { expect(m.lightbar).toBeUndefined(); return; }
    expect(m.lightbar).toBeTruthy();
    const { red, blue } = m.lightbar!;
    expect(red.material).not.toBe(blue.material);
    m.group.updateMatrixWorld(true);
    const rb = boxOf(red), bb = boxOf(blue);
    expect(rb.getCenter(new THREE.Vector3()).x).toBeLessThan(bb.getCenter(new THREE.Vector3()).x);
    const body = boxOf(m.group);
    expect(rb.min.y).toBeGreaterThan(body.max.y * 0.6); // on the roof, not on the bonnet
    expect(rb.max.y).toBeLessThan(body.max.y + 0.3);
    // Vehicle flashes these through emissive: they must be standard materials
    expect((red.material as THREE.MeshStandardMaterial).emissive).toBeDefined();
  });

  it('recolours only the paint (the colour variants of the procedural cars)', () => {
    const red = source.instantiate({ ...spec, color: '#ff0000' });
    const blue = source.instantiate({ ...spec, color: '#0000ff' });
    expect(red.paintMeshes).toHaveLength(1);
    expect(red.paintMeshes[0].name).toBe('body');
    const rm = red.paintMeshes[0].material as PaletteCarPaint, bm = blue.paintMeshes[0].material as PaletteCarPaint;
    if (KENNEY_PAINT_CELLS[type]) {
      expect(rm.isPaletteCarPaint).toBe(true);
      expect(rm.paintColor.getHex()).not.toBe(bm.paintColor.getHex());
      // the same colour shares one material between cars
      expect(source.instantiate({ ...spec, color: '#ff0000' }).paintMeshes[0].material).toBe(rm);
      // wheels keep the original palette material
      expect((red.wheels[0].children[0] as THREE.Mesh).material).not.toBe(rm);
    } else {
      expect(rm.isPaletteCarPaint).toBeUndefined(); // the cop keeps its livery
    }
  });

  it('dents: the paint geometry is float32 so Vehicle can deform it', () => {
    const m = source.instantiate(spec);
    const pos = m.paintMeshes[0].geometry.getAttribute('position');
    expect(pos.array instanceof Float32Array).toBe(true);
    expect((pos as THREE.BufferAttribute).normalized).toBe(false);
  });

  it(KENNEY_PAINT_CELLS[type] ? 'offers merged far-car parts' : 'has no far-car parts (cop cars always use the full model)', () => {
    const lod = source.lodParts();
    if (!KENNEY_PAINT_CELLS[type]) { expect(lod).toBeNull(); return; }
    expect(lod).not.toBeNull();
    const l = lod!;
    expect(l.body.getAttribute('uv')).toBeDefined();
    expect(l.body.getAttribute('position').count).toBeGreaterThan(300);
    expect(l.body.getAttribute('position').count).toBeLessThan(12000);
    l.body.computeBoundingBox();
    expect(finite(l.body.boundingBox!)).toBe(true);
    const s = l.body.boundingBox!.getSize(new THREE.Vector3());
    expect(s.z).toBeCloseTo(spec.length, 1);
    expect(l.body.boundingBox!.min.y).toBeCloseTo(0, 1);
    expect(l.head && l.tail).toBeTruthy();
    expect(l.hull.getAttribute('normal')).toBeDefined();
    expect(l.hull.getAttribute('uv')).toBeUndefined();
    expect(l.material.paintColor.getHex()).toBe(0xffffff);
    expect(source.lodParts()).toBe(l); // cached
  });
});

describe('PaletteCarPaint', () => {
  it('patches the fragment shader, binds its uniforms, and survives clone()', () => {
    const m = new PaletteCarPaint().setCell({ col: 6, row: 1 }).setPaint('#336699');
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <color_fragment>\nvoid main(){}',
    };
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, null);
    expect(Object.keys(shader.uniforms).sort()).toEqual(['paintColor', 'paintRect', 'paintRef']);
    expect(shader.fragmentShader).toContain('uniform vec4 paintRect');
    expect(shader.fragmentShader).toContain('USE_INSTANCING_COLOR');
    expect(shader.fragmentShader).not.toContain('#include <color_fragment>');
    expect(m.paintRect.x).toBeCloseTo(6 / 8, 2);
    expect(m.paintRect.y).toBeCloseTo(1 / 4, 2);
    const c = m.clone();
    expect(c.isPaletteCarPaint).toBe(true);
    expect(c.paintColor.getHex()).toBe(m.paintColor.getHex());
    expect(c.paintRect.equals(m.paintRect)).toBe(true);
    expect(c.paintColor).not.toBe(m.paintColor); // own uniform values per clone
    expect(c.onBeforeCompile).not.toBe(m.onBeforeCompile);
    expect(c.customProgramCacheKey()).toBe(m.customProgramCacheKey()); // clones share one program
  });
});

describe.each(['character.glb', 'character-hoodie.glb'])('shipped %s', (file) => {
  let source: GltfCharacterSource;
  let gltf: GLTF;
  beforeAll(async () => { gltf = await parseShipped(file); source = GltfCharacterSource.fromGltf(gltf); });

  it('has Idle, Walk and Run clips with exact names', () => {
    const c = pickClips(gltf.animations);
    expect(c.idle?.name).toBe('Idle');
    expect(c.walk?.name).toBe('Walk');
    expect(c.run?.name).toBe('Run');
  });

  it('is 1.75 m tall with its feet on y = 0 (the armature scale of 100 is measured, not trusted), no NaN', () => {
    const rig = source.instantiate(0);
    rig.group.updateMatrixWorld(true);
    const b = boxOf(rig.group); // first frame of the idle clip
    expect(finite(b)).toBe(true);
    const s = b.getSize(new THREE.Vector3());
    expect(s.y).toBeGreaterThan(1.68);
    expect(s.y).toBeLessThan(1.82);
    expect(Math.abs(b.min.y)).toBeLessThan(0.06);
    expect(s.x).toBeLessThan(1.2); // not 100x
    expect(s.z).toBeLessThan(1.2);
    expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.15); // centred over the origin
    // the group has no leftover scale of its own: the owner positions it in metres
    expect(rig.group.scale.x).toBe(1);
  });

  if (file === 'character.glb') {
    it('faces -z (the game forward): the eyes are in front of the head bone', () => {
      const rig = source.instantiate(0);
      rig.group.updateMatrixWorld(true);
      let head: THREE.Object3D | undefined;
      const eyes: THREE.Mesh[] = [];
      rig.group.traverse((o) => {
        if (/^head$/i.test(o.name)) head ??= o;
        const m = o as THREE.Mesh;
        if (m.isMesh && /eye/i.test((m.material as THREE.Material).name)) eyes.push(m);
      });
      expect(head).toBeDefined();
      expect(eyes.length).toBeGreaterThan(0);
      const eyeZ = boxOf(eyes[0]).getCenter(new THREE.Vector3()).z;
      expect(eyeZ).toBeLessThan(head!.getWorldPosition(new THREE.Vector3()).z);
    });
  }

  it('has no sword or other weapon node', () => {
    let weapon = false;
    source.instantiate(0).group.traverse((o) => { if (/sword|weapon|pistol/i.test(o.name)) weapon = true; });
    expect(weapon).toBe(false);
  });

  it('drives idle / walk / run from the ground speed with matched playback speed', () => {
    const rig = source.instantiate(3);
    rig.setSpeed(0);
    expect(rig.clips.idle!.isRunning()).toBe(true);
    rig.setSpeed(1.4);
    expect(rig.clips.walk!.isRunning()).toBe(true);
    expect(rig.clips.walk!.getEffectiveTimeScale()).toBeCloseTo(1, 1);
    rig.setSpeed(5.5);
    expect(rig.clips.run!.isRunning()).toBe(true);
    expect(rig.clips.run!.getEffectiveTimeScale()).toBeCloseTo(1, 1);
    rig.update(0.3);
    rig.group.updateMatrixWorld(true);
    expect(finite(boxOf(rig.group))).toBe(true);
  });

  it('tints the cloth (not skin or hair) per variant, and variant 0 keeps the authored colours', () => {
    const colours = (variant: number): Map<string, number> => {
      const out = new Map<string, number>();
      source.instantiate(variant).group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) out.set(mat.name || mat.uuid, (mat as THREE.MeshStandardMaterial).color.getHex());
      });
      return out;
    };
    const a = colours(0), b = colours(2), c = colours(10); // 10 wraps to 2
    const changed = [...a.keys()].filter((k) => a.get(k) !== b.get(k));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(a.size); // something stays untouched
    expect(changed.some((k) => /skin|hair|eye/i.test(k))).toBe(false);
    for (const k of b.keys()) expect(c.get(k)).toBe(b.get(k));
  });
});
