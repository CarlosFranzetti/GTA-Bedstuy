#!/usr/bin/env node
/**
 * Compress character GLBs for the single-file artifact budget.
 *
 *   node scripts/compress-models.mjs <input.glb> <output.glb> [--keep Idle,Walk,Run] [--tex 512]
 *   node scripts/compress-models.mjs --batch <dir-with-raw-glbs>      (the five Quaternius civilians, see MAP below)
 *
 * What it does (all through @gltf-transform, dev-only; the game itself only needs the decoder in gltf/loader.ts):
 *   1. drops every animation clip except the ones the game plays (Idle, Walk, Run by default; the packs carry 17)
 *   2. dedup / prune / weld, resamples and prunes keyframes
 *   3. resizes textures to <= 512 px and re-encodes them as WebP (needs `sharp`; skipped when a file has no textures)
 *   4. quantizes vertex data (KHR_mesh_quantization) and compresses with EXT_meshopt_compression
 * The loader reads meshopt through MeshoptDecoder (bundled, no separate decoder download). Draco is deliberately not used:
 * its decoder is a separate wasm download that does not fit a single file build.
 *
 * Needs (devDependencies): @gltf-transform/core, @gltf-transform/extensions, @gltf-transform/functions, meshoptimizer
 * (and sharp only when a model has textures).
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { basename, join, resolve, dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

/** Quaternius Ultimate Animated Character Pack raw file -> shipped file name. */
export const MAP = {
  'quaternius-uac-Casual_Male.glb': 'character-casual-male.glb',
  'quaternius-uac-Casual_Female.glb': 'character-casual-female.glb',
  'quaternius-uac-Suit_Male.glb': 'character-suit-male.glb',
  'quaternius-uac-Suit_Female.glb': 'character-suit-female.glb',
  'quaternius-uac-Worker_Male.glb': 'character-worker.glb',
};

/**
 * The pack's `Skin` material is near black (linear 0.013) in every file, which renders as a black face and hands. Each shipped
 * person gets its own natural skin tone instead (sRGB hex), so the crowd varies. Only the Skin colour factor changes.
 */
export const SKIN = {
  'character-casual-male.glb': 0xc68a5e,
  'character-casual-female.glb': 0xf1c9a5,
  'character-suit-male.glb': 0x8d5524,
  'character-suit-female.glb': 0xd9a877,
  'character-worker.glb': 0x6b4226,
};
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };

export async function compress(input, output, { keep = ['Idle', 'Walk', 'Run'], tex = 512, skin = null } = {}) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(input);
  const root = doc.getRoot();
  const keepRe = new RegExp(`(^|[|/])(${keep.join('|')})$`, 'i');
  for (const a of root.listAnimations()) if (!keepRe.test(a.getName())) a.dispose();

  if (skin !== null) {
    for (const m of root.listMaterials()) if (/^skin$/i.test(m.getName())) m.setBaseColorFactor([lin((skin >> 16) & 255), lin((skin >> 8) & 255), lin(skin & 255), 1]);
  }
  const steps = [dedup(), resample(), prune(), weld({ tolerance: 0.0001 })];
  if (root.listTextures().length) {
    const sharp = (await import('sharp')).default;
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 80 }));
  }
  steps.push(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await doc.transform(...steps);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  doc.getRoot().getAsset().generator = 'GTA Bed-Stuy compress-models (glTF-Transform)';
  await mkdir(dirname(resolve(output)), { recursive: true });
  const bytes = await io.writeBinary(doc);
  await writeFile(output, bytes);
  return { in: (await readFile(input)).length, out: bytes.length, clips: root.listAnimations().map((a) => a.getName()) };
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && argv.length) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const keep = opt('--keep', 'Idle,Walk,Run').split(',');
  const tex = Number(opt('--tex', '512'));
  const jobs = [];
  if (argv[0] === '--batch') {
    const dir = argv[1];
    const outDir = opt('--out', join(dirname(new URL(import.meta.url).pathname), '..', 'src', 'assets', 'models'));
    for (const f of await readdir(dir)) if (MAP[f]) jobs.push([join(dir, f), join(outDir, MAP[f])]);
  } else jobs.push([argv[0], argv[1]]);
  for (const [i, o] of jobs) {
    const r = await compress(i, o, { keep, tex, skin: SKIN[basename(o)] ?? null });
    console.log(`${basename(i)} -> ${basename(o)}: ${(r.in / 1024).toFixed(0)} KB -> ${(r.out / 1024).toFixed(0)} KB, clips ${r.clips.join(',')}`);
  }
}
