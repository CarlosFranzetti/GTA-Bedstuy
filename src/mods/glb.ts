/**
 * glTF 2.0 mod models. The JSON is read first, on its own, to refuse anything unsafe or too large BEFORE the loader allocates:
 * no URI that is not a data: URI (a mod file never makes the game fetch anything), no draco / basisu compression (their decoders
 * are separate downloads), vertex and index counts within the tier's budget. Then three's GLTFLoader parses it (meshopt works).
 */
import * as THREE from 'three';
import { createGltfLoader, type GLTF } from '@/entities/models/gltf/loader';
import { ModError, type ModLimits } from './limits';

const REFUSED_EXT = ['KHR_draco_mesh_compression', 'KHR_texture_basisu'];

interface GltfJson {
  asset?: { version?: string };
  extensionsRequired?: string[];
  accessors?: Array<{ count?: number }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number }> }>;
  buffers?: Array<{ uri?: string; byteLength?: number }>;
  images?: Array<{ uri?: string }>;
  nodes?: unknown[];
  materials?: unknown[];
}

/** Splits a .glb into its JSON text and checks the container. Returns null for plain .gltf JSON. */
export function readGlbJson(data: Uint8Array): GltfJson {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let text: string;
  if (data.length >= 12 && dv.getUint32(0, true) === 0x46546c67) { // "glTF"
    if (dv.getUint32(4, true) !== 2) throw new ModError('Only glTF 2.0 files are supported.', 'format');
    if (dv.getUint32(8, true) > data.length) throw new ModError('The .glb is cut short.', 'truncated');
    const len = dv.getUint32(12, true), type = dv.getUint32(16, true);
    if (type !== 0x4e4f534a || 20 + len > data.length) throw new ModError('The .glb has no readable JSON block.', 'format');
    text = new TextDecoder().decode(data.subarray(20, 20 + len));
  } else {
    text = new TextDecoder().decode(data);
  }
  try { return JSON.parse(text) as GltfJson; } catch { throw new ModError('The glTF JSON could not be read.', 'format'); }
}

export function checkGltf(json: GltfJson, limits: ModLimits): { vertices: number; triangles: number } {
  if (!json || typeof json !== 'object' || json.asset?.version !== '2.0') throw new ModError('Only glTF 2.0 files are supported.', 'format');
  for (const e of json.extensionsRequired ?? []) if (REFUSED_EXT.includes(e)) throw new ModError(`This file needs "${e}", which the game cannot decode. Export it plain or with meshopt compression.`, 'format');
  for (const b of json.buffers ?? []) if (b.uri !== undefined && !/^data:/i.test(b.uri)) throw new ModError('This .gltf points at an outside buffer file. Use a .glb (everything inside one file).', 'format');
  for (const im of json.images ?? []) if (im.uri !== undefined && !/^data:/i.test(im.uri)) throw new ModError('This glTF points at an outside image file. Use a .glb with the images inside it.', 'format');
  const acc = json.accessors ?? [];
  let vertices = 0, triangles = 0;
  for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
    const pos = p.attributes?.POSITION;
    const vc = pos !== undefined ? acc[pos]?.count ?? 0 : 0;
    const ic = p.indices !== undefined ? acc[p.indices]?.count ?? 0 : vc;
    if (!Number.isFinite(vc) || !Number.isFinite(ic) || vc < 0 || ic < 0) throw new ModError('The glTF has an unusable accessor count.', 'format');
    vertices += vc; triangles += Math.floor(ic / 3);
  }
  if (vertices > limits.maxVertices) throw new ModError(`The model has ${vertices} vertices; this device allows ${limits.maxVertices}.`, 'oversize');
  if (triangles > limits.maxTriangles) throw new ModError(`The model has ${triangles} triangles; this device allows ${limits.maxTriangles}.`, 'oversize');
  if ((json.materials?.length ?? 0) > limits.maxMaterials) throw new ModError(`The model has ${json.materials?.length} materials; this device allows ${limits.maxMaterials}.`, 'oversize');
  if ((json.nodes?.length ?? 0) > limits.maxFrames) throw new ModError(`The model has ${json.nodes?.length} nodes; this device allows ${limits.maxFrames}.`, 'oversize');
  if (triangles === 0) throw new ModError('The glTF has no triangles.', 'format');
  return { vertices, triangles };
}

export interface GlbOptions { scale?: number; up?: 'y' | 'z'; wheelFrames?: string[]; paintMaterial?: string | null }

/** Parses a .glb / .gltf into a scene in the game's axes (y up), with wheels and paint named the way the car source expects. */
export async function loadGlbScene(data: Uint8Array, limits: ModLimits, opts: GlbOptions = {}): Promise<{ scene: THREE.Group; vertices: number; triangles: number; notes: string[] }> {
  if (data.byteLength > limits.maxModelFileBytes) throw new ModError(`This model file is too large for this device (${(data.byteLength / 1048576).toFixed(1)} MB; the limit is ${(limits.maxModelFileBytes / 1048576).toFixed(0)} MB).`, 'oversize');
  const counts = checkGltf(readGlbJson(data), limits);
  let gltf: GLTF;
  try {
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    gltf = await createGltfLoader().parseAsync(copy, '');
  } catch (err) {
    throw new ModError(`The glTF could not be read: ${err instanceof Error ? err.message : String(err)}`, 'format');
  }
  const scene = new THREE.Group();
  scene.name = 'glb-mod';
  const inner = gltf.scene;
  if (opts.up === 'z') inner.rotation.x = -Math.PI / 2;
  const s = opts.scale ?? 1;
  scene.scale.setScalar(s);
  scene.add(inner);
  const notes: string[] = [];
  const wanted = new Set((opts.wheelFrames ?? []).map((w) => w.toLowerCase()));
  let hit = 0;
  inner.traverse((o) => {
    if (wanted.has(o.name.toLowerCase()) && !/wheel/i.test(o.name)) { o.name = `wheel ${o.name}`; hit++; }
    const m = o as THREE.Mesh;
    if (m.isMesh && opts.paintMaterial && !Array.isArray(m.material) && m.material.name === opts.paintMaterial) { m.material.name = 'paint'; }
  });
  if (wanted.size && hit === 0) notes.push('None of the "wheelFrames" names were found in the file.');
  scene.updateMatrixWorld(true);
  return { scene, ...counts, notes };
}
