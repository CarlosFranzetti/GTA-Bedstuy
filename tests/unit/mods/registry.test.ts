import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ModRegistry, modIdOf } from '@/mods/registry';
import { MemoryModStore } from '@/mods/store';
import { LIMITS } from '@/mods/limits';
import { classifyDrop, normalisePaths, findFile, type ModFile } from '@/mods/files';
import { validateManifest, manifestForDrop, safePath } from '@/mods/manifest';
import { checkGltf, loadGlbScene, readGlbJson } from '@/mods/glb';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { carDff } from './carFixture';
import { buildTxd, w } from './rwWriters';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const file = (path: string, data: Uint8Array | string): ModFile => ({ path, data: typeof data === 'string' ? enc(data) : data });
const fakeDecode = async (_n: string, _d: Uint8Array): Promise<THREE.Texture> => { const t = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4); t.needsUpdate = false; return t; };

const manifestJson = (entries: unknown[], name = 'Test Pack'): string => JSON.stringify({ format: 1, name, author: 'me', licence: 'CC0-1.0', entries });

/** a one-triangle .glb built by hand */
export function tinyGlb(extra: Record<string, unknown> = {}, nodes: Array<{ name: string; mesh?: number }> = [{ name: 'body', mesh: 0 }]): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = new Uint16Array([0, 1, 2, 0]);
  const bin = new Uint8Array(pos.byteLength + 8);
  bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(idx.buffer), pos.byteLength);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'paint', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: bin.length }], ...extra,
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jb = enc(text);
  const total = 12 + 8 + jb.length + 8 + bin.length;
  return w().u32(0x46546c67).u32(2).u32(total).u32(jb.length).u32(0x4e4f534a).push(jb).u32(bin.length).u32(0x004e4942).push(bin).done();
}

describe('manifest', () => {
  it('accepts a vehicle and a texture entry and fills defaults', () => {
    const r = validateManifest(JSON.parse(manifestJson([
      { slot: 'vehicle:sedan', model: 'car.dff', textures: ['car.txd'] },
      { slot: 'texture:asphalt', image: 'road.png', repeat: [2, 2] },
      { slot: 'texture:brickRed:2', image: 'b.txd', texture: 'Brick' },
    ])));
    expect(r.errors).toEqual([]);
    const [v, t, t2] = r.manifest!.entries;
    expect(v).toMatchObject({ kind: 'vehicle', type: 'sedan', up: 'z', scale: 1, wheelFrames: [] });
    expect(t).toMatchObject({ kind: 'texture', key: 'asphalt', variant: 'all', repeat: [2, 2] });
    expect(t2).toMatchObject({ key: 'brickRed', variant: 2, texture: 'brick' });
  });
  it('refuses wrong slots, unsafe paths and bad numbers', () => {
    const bad = (e: unknown): string => validateManifest({ name: 'x', entries: [e] }).errors.join(' ');
    expect(bad({ slot: 'vehicle:spaceship', model: 'a.glb' })).toMatch(/not a vehicle class/);
    expect(bad({ slot: 'texture:sky', image: 'a.png' })).toMatch(/not a texture slot/);
    expect(bad({ slot: 'vehicle:sedan', model: '../a.glb' })).toMatch(/relative path/);
    expect(bad({ slot: 'vehicle:sedan', model: 'https://evil.example/a.glb' })).toMatch(/relative path/);
    expect(bad({ slot: 'vehicle:sedan', model: '/etc/a.glb' })).toMatch(/relative path/);
    expect(bad({ slot: 'vehicle:sedan', model: 'a.glb', scale: -1 })).toMatch(/scale/);
    expect(bad({ slot: 'texture:asphalt', image: 'a.png', repeat: [0, 5000] })).toMatch(/repeat/);
    expect(bad({ slot: 'house' })).toMatch(/slot/);
    expect(validateManifest(null).errors[0]).toMatch(/object/);
    expect(validateManifest({ entries: [] }).errors[0]).toMatch(/name/);
    expect(validateManifest({ name: 'x', format: 9, entries: [{}] }).errors[0]).toMatch(/format/);
  });
  it('safePath', () => {
    expect(safePath('a/b.txd')).toBe('a/b.txd');
    for (const p of ['', '..', 'a/../b', 'C:\\x', 'file:x', '//x', 'a\u0000b', 'x'.repeat(300), 42]) expect(safePath(p)).toBeNull();
  });
  it('builds a manifest for a dropped file', () => {
    expect(manifestForDrop('Mine', 'vehicle:suv', 'x.dff').entries[0]).toMatchObject({ kind: 'vehicle', type: 'suv', up: 'z' });
    expect(manifestForDrop('Mine', 'texture:asphalt', 'x.png').entries[0]).toMatchObject({ kind: 'texture', key: 'asphalt' });
  });
});

describe('dropped files', () => {
  it('strips one shared top folder, finds files by path or unique name, notes .img archives', () => {
    const fs = normalisePaths([file('pack/mod.json', '{}'), file('pack/cars/a.dff', 'x'), file('pack\\cars\\a.txd', 'x')]);
    expect(fs.map((f) => f.path)).toEqual(['mod.json', 'cars/a.dff', 'cars/a.txd']);
    expect(findFile(fs, 'CARS/A.DFF')?.path).toBe('cars/a.dff');
    expect(findFile(fs, 'a.dff')?.path).toBe('cars/a.dff');
    expect(findFile(fs, 'nope.dff')).toBeNull();
    const d = classifyDrop([file('gta3.img', 'x'), file('readme.txt', 'x'), file('a.dff', 'x'), file('a.txd', 'x'), file('t.png', 'x'), file('x.bin', 'x')]);
    expect(d.models).toHaveLength(1); expect(d.txds).toHaveLength(1); expect(d.images).toHaveLength(1);
    expect(d.notes.join(' ')).toMatch(/\.img archive/);
    expect(d.notes.join(' ')).toMatch(/x\.bin/);
  });
  it('refuses ".." paths and too many files', () => {
    expect(() => normalisePaths([file('a/../b.dff', 'x')])).toThrow(/\.\./);
    expect(() => normalisePaths(Array.from({ length: 300 }, (_, i) => file(`f${i}.png`, 'x')))).toThrow(/at most/);
  });
});

describe('glb', () => {
  it('reads the JSON and counts of a hand-built .glb and refuses unsafe ones', () => {
    const data = tinyGlb();
    expect(checkGltf(readGlbJson(data), LIMITS.high)).toEqual({ vertices: 3, triangles: 1 });
    expect(() => checkGltf(readGlbJson(tinyGlb({ buffers: [{ uri: 'https://x.example/a.bin', byteLength: 4 }] })), LIMITS.high)).toThrow(/outside buffer/);
    expect(() => checkGltf(readGlbJson(tinyGlb({ images: [{ uri: 'http://x.example/a.png' }] })), LIMITS.high)).toThrow(/outside image/);
    expect(() => checkGltf(readGlbJson(tinyGlb({ extensionsRequired: ['KHR_draco_mesh_compression'] })), LIMITS.high)).toThrow(/draco|KHR_draco/i);
    expect(() => checkGltf(readGlbJson(data), { ...LIMITS.high, maxVertices: 2 })).toThrow(/vertices/);
    expect(() => readGlbJson(Uint8Array.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 255, 255, 0, 0]))).toThrow();
  });
  it('parses through the glTF loader and names wheels and paint', async () => {
    const g = await loadGlbScene(tinyGlb({}, [{ name: 'body', mesh: 0 }, { name: 'tyre_a' }]), LIMITS.high, { wheelFrames: ['tyre_a'], paintMaterial: 'paint', up: 'z', scale: 2 });
    const names: string[] = [];
    g.scene.traverse((o) => names.push(o.name));
    expect(names).toContain('wheel tyre_a');
    expect(g.scene.scale.x).toBe(2);
    expect(g.triangles).toBe(1);
  });
  it('turns a bad file into a ModError, never a crash', async () => {
    await expect(loadGlbScene(enc('not a model'), LIMITS.high)).rejects.toThrow(/glTF/);
    await expect(loadGlbScene(new Uint8Array(LIMITS.low.maxModelFileBytes + 1), LIMITS.low)).rejects.toThrow(/too large/);
  });
});

describe('ModRegistry', () => {
  const carMod = (extraEntries: unknown[] = []): ModFile[] => [
    file('mod.json', manifestJson([{ slot: 'vehicle:sedan', model: 'car.dff' }, ...extraEntries])),
    file('car.dff', carDff()),
  ];

  it('installs a .dff car, fits it to the class, finds wheels and paint, and remembers it', async () => {
    const store = new MemoryModStore();
    const reg = new ModRegistry({ tier: 'high', store, decodeImage: fakeDecode });
    const rep = await reg.install(carMod());
    expect(rep.errors).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.entries[0]).toMatchObject({ entry: 'vehicle:sedan', ok: true });
    const src = reg.vehicleSource('sedan')!;
    expect(src).not.toBeNull();
    const spec = { ...VEHICLE_SPECS.sedan, color: '#336699' };
    const model = src.instantiate(spec);
    expect(model.wheels).toHaveLength(4);
    expect(model.steerPivots).toHaveLength(2);
    expect(model.paintMeshes.length).toBeGreaterThan(0);
    const box = new THREE.Box3().setFromObject(model.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(spec.length, 1);
    expect(box.min.y).toBeCloseTo(0, 2);
    const paint = model.paintMeshes[0].material as THREE.MeshStandardMaterial;
    expect(paint.color.getHexString()).toBe(new THREE.Color('#336699').getHexString());
    expect(reg.vehicleSource('suv')).toBeNull(); // the stock car stays everywhere else
    expect(reg.list()).toHaveLength(1);
    expect((await store.list())).toHaveLength(1);
    // a new registry on the same device gets it back
    const again = new ModRegistry({ tier: 'high', store, decodeImage: fakeDecode });
    expect((await again.restore()).every((r) => r.ok)).toBe(true);
    expect(again.vehicleSource('sedan')).not.toBeNull();
    expect(await again.remove(modIdOf('Test Pack'))).toBe(true);
    expect(again.vehicleSource('sedan')).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('pairs a .txd with the same name as the model', async () => {
    const reg = new ModRegistry({ tier: 'high', decodeImage: fakeDecode });
    const px = new Uint8Array(64).fill(200);
    const txd = buildTxd([{ name: 'glass', width: 4, height: 4, kind: 'bgra', pixels: px }]);
    const rep = await reg.install([...carMod(), file('car.txd', txd)]);
    expect(rep.ok).toBe(true);
    expect(rep.entries[0].message).not.toMatch(/not in the mod/);
    const rep2 = await new ModRegistry({ tier: 'high', decodeImage: fakeDecode }).install(carMod());
    expect(rep2.entries[0].message).toMatch(/1 texture name/);
  });

  it('leaves stock in place when an entry fails, and keeps the entries that work', async () => {
    const reg = new ModRegistry({ tier: 'high', decodeImage: fakeDecode });
    const rep = await reg.install([...carMod([{ slot: 'vehicle:suv', model: 'missing.dff' }, { slot: 'vehicle:cop', model: 'broken.dff' }]), file('broken.dff', new Uint8Array(100))]);
    expect(rep.ok).toBe(true);
    expect(rep.entries.map((e) => e.ok)).toEqual([true, false, false]);
    expect(rep.entries[1].message).toMatch(/not in the mod/);
    expect(reg.vehicleSource('suv')).toBeNull();
    expect(reg.vehicleSource('cop')).toBeNull();
    const none = await reg.install([file('mod.json', manifestJson([{ slot: 'vehicle:cop', model: 'broken.dff' }], 'Broken')), file('broken.dff', new Uint8Array(100))]);
    expect(none.ok).toBe(false);
    expect(none.errors[0]).toMatch(/stock game is unchanged/);
    expect(reg.list().map((m) => m.name)).toEqual(['Test Pack']);
  });

  it('refuses model mods on the phone tier but loads textures', async () => {
    const reg = new ModRegistry({ tier: 'phone', decodeImage: fakeDecode });
    const rep = await reg.install(carMod());
    expect(rep.ok).toBe(false);
    expect(rep.entries[0].message).toMatch(/phones/);
    expect(reg.vehicleSource('sedan')).toBeNull();
    const png = new Uint8Array(32); const dv = new DataView(png.buffer); dv.setUint32(0, 0x89504e47); dv.setUint32(4, 0x0d0a1a0a); dv.setUint32(16, 256); dv.setUint32(20, 256);
    const t = await reg.install([file('mod.json', manifestJson([{ slot: 'texture:asphalt', image: 'road.png' }], 'Road')), file('road.png', png)]);
    expect(t.ok).toBe(true);
  });

  it('refuses over-budget mods and answers needsSlots when there is no mod.json', async () => {
    const reg = new ModRegistry({ tier: 'low', decodeImage: fakeDecode });
    const big = await reg.install([file('mod.json', manifestJson([{ slot: 'vehicle:sedan', model: 'car.dff' }])), file('car.dff', carDff()), file('pad.png', new Uint8Array(LIMITS.low.maxModBytes))]);
    expect(big.ok).toBe(false);
    expect(big.errors[0]).toMatch(/per mod/);
    const drop = await reg.install([file('car.dff', carDff()), file('car.txd', 'x'), file('a.png', 'x')]);
    expect(drop.ok).toBe(false);
    expect(drop.needsSlots).toEqual({ models: ['car.dff'], txds: ['car.txd'], images: ['a.png'] });
    const manifest = manifestForDrop('From Panel', 'vehicle:sedan', 'car.dff');
    const ok = await reg.install([file('car.dff', carDff())], manifest);
    expect(ok.ok).toBe(true);
  });

  it('hands a texture to the material library through overrideMaps and inherits the stock repeat', async () => {
    const reg = new ModRegistry({ tier: 'high', decodeImage: fakeDecode });
    const png = new Uint8Array(32); const dv = new DataView(png.buffer); dv.setUint32(0, 0x89504e47); dv.setUint32(4, 0x0d0a1a0a); dv.setUint32(16, 64); dv.setUint32(20, 64);
    const rep = await reg.install([file('mod.json', manifestJson([{ slot: 'texture:asphalt:1', image: 'road.png' }, { slot: 'texture:concrete', image: 't.txd', texture: 'slab' }], 'Ground')), file('road.png', png),
      file('t.txd', buildTxd([{ name: 'Slab', width: 4, height: 4, kind: 'bgra', pixels: new Uint8Array(64) }]))]);
    expect(rep.errors).toEqual([]);
    const calls: Array<[string, number, Record<string, unknown>]> = [];
    const stock = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    stock.map!.repeat.set(3, 5);
    const sources: Record<string, unknown> = {};
    reg.applyTo({ vehicleSources: sources, materials: { overrideMaps: ((k: string, v: number, m: Record<string, unknown>) => { calls.push([k, v, m]); }) as never, get: () => stock } });
    expect(calls.map((c) => `${c[0]}:${c[1]}`)).toContain('asphalt:1');
    expect(calls.filter((c) => c[0] === 'concrete').length).toBe(8);
    expect((calls[0][2].repeat as { x: number }).x).toBe(3);
    expect(Object.keys(sources)).toEqual([]);
  });

  it('applies and un-applies vehicle sources', async () => {
    const reg = new ModRegistry({ tier: 'high', decodeImage: fakeDecode });
    await reg.install(carMod());
    const sources: Record<string, unknown> = {};
    const target = { vehicleSources: sources, materials: { overrideMaps: (() => undefined) as never } };
    reg.applyTo(target);
    expect(sources.sedan).toBeDefined();
    await reg.setEnabled(modIdOf('Test Pack'), false);
    reg.applyTo(target);
    expect(sources.sedan).toBeUndefined();
  });
});
