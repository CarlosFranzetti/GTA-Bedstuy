#!/usr/bin/env node
/**
 * INTAKE seat: converts the originals of the first open-asset set into the files the game loads.
 *
 *   OPEN_ASSETS_SRC=<folder with the downloads> node scripts/dev/open-assets-build.mjs [--only <id>] [--dry]
 *
 * Re-runnable. Reads the untrusted originals from OPEN_ASSETS_SRC (nothing in it is ever executed; only parsed as data)
 * and writes, under src/assets/open/<source>/<item>/:
 *   model.glb                 cars and props: Y up, metres, origin on the ground under the centre, front toward +Z
 *                             (glTF convention; src/entities/models/gltf/VehicleSource.ts turns it to the game's -Z front,
 *                             deciding from nodes named wheel-front-* / wheel-back-*), textures embedded as small PNG
 *   surface-256.png, surface-512.png   surfaces: tileable, 8-bit palette PNG
 *   SOURCE.md                 page, author, licence line as read, date, what was changed
 * and src/assets/open/manifest.ts (generated, typed, URLs by `new URL(..., import.meta.url)`) and
 * src/assets/open/build-report.json (triangles, sizes, seam numbers).
 *
 * Tools: @gltf-transform (core, functions), sharp, meshoptimizer (all already devDependencies; see compress-models.mjs).
 * The models are NOT meshopt-compressed: they are 2 to 25 kB each and a plain glb loads with no decoder.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, getBounds } from '@gltf-transform/functions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'src/assets/open');
const SRC = process.env.OPEN_ASSETS_SRC;
if (!SRC) { console.error('set OPEN_ASSETS_SRC to the folder holding the downloads'); process.exit(2); }
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const FETCHED = '24 Nov 2026';

// ---------------------------------------------------------------------------------------------------- sources
const SOURCES = {
  'psx-style-cars': {
    title: 'PSX Style Cars', author: 'GGBotNet', page: 'https://opengameart.org/content/psx-style-cars',
    licence: 'CC0', licenceLine: 'OpenGameArt item page, "License(s): CC0"', credit: 'PSX Style Cars by GGBotNet (CC0), opengameart.org',
    dir: 'psx/x', notes: 'The zip also holds sound effects; none were taken. Wheels are part of each body mesh in the original.',
  },
  kenney: {
    title: 'Kenney kits (Car Kit 3.1, Retro Urban Kit 2.0, Mini Skate, Furniture Kit)', author: 'Kenney (www.kenney.nl)',
    page: 'https://kenney.nl/assets/car-kit', licence: 'CC0', licenceLine: 'kenney.nl asset page, "License Creative Commons CC0"; License.txt inside each zip: "License: (Creative Commons Zero, CC0)"',
    credit: 'Kenney (www.kenney.nl), CC0', notes: 'Pages: /assets/car-kit, /assets/retro-urban-kit, /assets/mini-skate, /assets/furniture-kit.',
  },
  'milkandbanana': {
    title: 'Traffic Road Assets', author: 'MilkAndBanana', page: 'https://opengameart.org/content/traffic-road-assets',
    licence: 'CC0', licenceLine: 'OpenGameArt item page, "License(s): CC0"; License.txt in the zip: "License: (Creative Commons Zero, CC0)"',
    credit: 'Traffic Road Assets by MilkAndBanana (CC0), opengameart.org',
  },
  'oga-mailbox': {
    title: 'Low Poly Textured Mailbox', author: 'Braveo', page: 'https://opengameart.org/content/low-poly-textured-mailbox',
    licence: 'CC0', licenceLine: 'OpenGameArt item page, "License(s): CC0"', credit: 'Low Poly Textured Mailbox by Braveo (CC0), opengameart.org',
  },
  'oga-vehicles': {
    title: '3D Vehicles Pack', author: 'OpenGameArt contributor (name on the item page)', page: 'https://opengameart.org/content/3d-vehicles-pack',
    licence: 'CC0', licenceLine: 'OpenGameArt item page, "License(s): CC0"; "Clay models only (no mat/UV maps)"', credit: '3D Vehicles Pack (CC0), opengameart.org/content/3d-vehicles-pack',
  },
  polyhaven: {
    title: 'Poly Haven textures', author: 'Poly Haven and the artists named per item', page: 'https://polyhaven.com/license',
    licence: 'CC0', licenceLine: 'polyhaven.com/license: "Our assets are all licensed as CC0"', credit: 'Poly Haven (polyhaven.com), CC0; artists named per item',
  },
  ambientcg: {
    title: 'ambientCG', author: 'ambientCG', page: 'https://docs.ambientcg.com/license/', licence: 'CC0',
    licenceLine: 'docs.ambientcg.com/license: "All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License"', credit: 'ambientCG (ambientcg.com), CC0',
  },
  'oga-textures': {
    title: 'OpenGameArt photo textures', author: 'ForKotLow', page: 'https://opengameart.org/content/asphalt-road-texture-free', licence: 'CC0',
    licenceLine: 'OpenGameArt item page, "License(s): CC0"; "Free Seamless Texture ... (Public Domain) By ForKotLow"', credit: 'Asphalt Road Texture Free by ForKotLow (CC0), opengameart.org',
  },
};

// ---------------------------------------------------------------------------------------------------- items
// fit: which axis to size and to how many metres (cars: length along Z). yaw in degrees, about +Y, applied before the fit.
const P = (n, f) => `psx/x/Car 0${n}/${f}`;
const K = (kit, f) => `${kit}/x/Models/GLB format/${f}.glb`;
const MODELS = [
  // ---- cars
  { id: 'psx-sedan', src: 'psx-style-cars', kind: 'car', cls: 'sedan', obj: P(2, 'Car2.obj'), tex: P(2, 'car2.png'), fit: ['z', 4.6], yaw: 0, use: 'sedan, beater' },
  { id: 'psx-sedan4', src: 'psx-style-cars', kind: 'car', cls: 'sedan', obj: P(5, 'Car5.obj'), tex: P(5, 'car5_grey.png'), fit: ['z', 4.8], yaw: 0, use: 'sedan, towncar' },
  { id: 'psx-police', src: 'psx-style-cars', kind: 'car', cls: 'cop', obj: P(5, 'Car5_Police.obj'), tex: P(5, 'car5_police.png'), fit: ['z', 4.9], yaw: 0, use: 'police car' },
  { id: 'psx-taxi', src: 'psx-style-cars', kind: 'car', cls: 'cab', obj: P(5, 'Car5_Taxi.obj'), tex: P(5, 'car5_taxi.png'), fit: ['z', 4.9], yaw: 0, use: 'taxi' },
  { id: 'psx-hatch', src: 'psx-style-cars', kind: 'car', cls: 'hatch', obj: P(3, 'Car3.obj'), tex: P(3, 'car3_yellow.png'), fit: ['z', 3.9], yaw: 0, use: 'hatch, hothatch' },
  { id: 'psx-wagon', src: 'psx-style-cars', kind: 'car', cls: 'wagon', obj: P(1, 'Car.obj'), tex: P(1, 'car_gray.png'), fit: ['z', 4.7], yaw: 0, use: 'wagon' },
  { id: 'psx-minivan', src: 'psx-style-cars', kind: 'car', cls: 'minivan', obj: P(4, 'Car4.obj'), tex: P(4, 'car4_lightgrey.png'), fit: ['z', 4.9], yaw: 0, use: 'minivan' },
  { id: 'psx-stepvan', src: 'psx-style-cars', kind: 'car', cls: 'stepvan', obj: 'psx/x/Car 08/Car8.obj', tex: 'psx/x/Car 08/Car8.png', fit: ['z', 6.0], yaw: 0, use: 'stepvan, delivery van' },
  { id: 'kenney-sedan', src: 'kenney', kind: 'car', cls: 'sedan', glb: K('car-kit', 'sedan'), fit: ['z', 4.6], yaw: 0, use: 'sedan', palette: true },
  { id: 'kenney-taxi', src: 'kenney', kind: 'car', cls: 'cab', glb: K('car-kit', 'taxi'), fit: ['z', 4.8], yaw: 0, use: 'taxi', palette: true },
  { id: 'kenney-police', src: 'kenney', kind: 'car', cls: 'cop', glb: K('car-kit', 'police'), fit: ['z', 4.9], yaw: 0, use: 'police car', palette: true },
  { id: 'kenney-suv', src: 'kenney', kind: 'car', cls: 'suv', glb: K('car-kit', 'suv'), fit: ['z', 4.85], yaw: 0, use: 'suv', palette: true },
  { id: 'kenney-van', src: 'kenney', kind: 'car', cls: 'cargovan', glb: K('car-kit', 'van'), fit: ['z', 5.2], yaw: 0, use: 'cargovan, panelvan', palette: true },
  { id: 'kenney-delivery', src: 'kenney', kind: 'car', cls: 'boxtruck', glb: K('car-kit', 'delivery'), fit: ['z', 6.6], yaw: 0, use: 'boxtruck', palette: true },
  { id: 'kenney-hatch-sports', src: 'kenney', kind: 'car', cls: 'hothatch', glb: K('car-kit', 'hatchback-sports'), fit: ['z', 3.9], yaw: 0, use: 'hothatch, hatch', palette: true },
  { id: 'kenney-garbage', src: 'kenney', kind: 'car', cls: 'garbage', glb: K('car-kit', 'garbage-truck'), fit: ['z', 8.0], yaw: 0, use: 'garbage truck', palette: true },
  { id: 'oga-bus', src: 'oga-vehicles', kind: 'car', cls: 'bus', obj: 'veh/x/dist/obj_mtl/bus.obj', mtl: 'veh/x/dist/obj_mtl/bus.mtl', fit: ['z', 11.5], yaw: 0, use: 'bus (clay model: no texture, tint at run time)', clay: true },
  { id: 'oga-pickup', src: 'oga-vehicles', kind: 'car', cls: 'pickup', obj: 'veh/x/dist/obj_mtl/pickup.obj', mtl: 'veh/x/dist/obj_mtl/pickup.mtl', fit: ['z', 5.4], yaw: 0, use: 'pickup (clay model: no texture, tint at run time)', clay: true },
  // ---- two-wheelers
  { id: 'kenney-skateboard', src: 'kenney', kind: 'prop', cls: 'skateboard', glb: 'mini-skate/x/Models/GLB format/skateboard.glb', fit: ['z', 0.8], yaw: 0, use: 'skateboard', palette: true },
  // ---- props
  { id: 'mb-hydrant', src: 'milkandbanana', kind: 'prop', cls: 'hydrant', glb: 'traffic/x/Traffic Road Assets/GLB/All/Water_Hydrant.glb', fit: ['y', 0.8], yaw: 0, use: 'fire hydrant' },
  { id: 'mb-streetlight', src: 'milkandbanana', kind: 'prop', cls: 'streetlight', glb: 'traffic/x/Traffic Road Assets/GLB/All/Streetlights.glb', fit: ['y', 7.5], yaw: 0, use: 'street lamp' },
  { id: 'mb-manhole', src: 'milkandbanana', kind: 'prop', cls: 'manhole', glb: 'traffic/x/Traffic Road Assets/GLB/All/Manhole_Cover.glb', fit: ['x', 0.7], yaw: 0, use: 'manhole cover (lay flat on the road)' },
  { id: 'mb-cone', src: 'milkandbanana', kind: 'prop', cls: 'cone', glb: 'traffic/x/Traffic Road Assets/GLB/All/Traffic_Cone.glb', fit: ['y', 0.7], yaw: 0, use: 'traffic cone' },
  { id: 'kenney-trafficlight', src: 'kenney', kind: 'prop', cls: 'trafficlight', glb: K('retro-urban-kit', 'detail-light-traffic'), fit: ['y', 6.0], yaw: 0, use: 'traffic signal head and pole', palette: true },
  { id: 'kenney-dumpster', src: 'kenney', kind: 'prop', cls: 'dumpster', glb: K('retro-urban-kit', 'detail-dumpster-closed'), fit: ['x', 1.8], yaw: 0, use: 'dumpster', palette: true },
  { id: 'kenney-bin', src: 'kenney', kind: 'prop', cls: 'bin', glb: 'furniture-kit/x/Models/GLTF format/trashcan.glb', fit: ['y', 0.95], yaw: 0, use: 'litter bin', palette: true },
  { id: 'oga-mailbox', src: 'oga-mailbox', kind: 'prop', cls: 'mailbox', fbx: 'mailbox/x/LP_Mailbox.fbx', tex: 'mailbox/x/LP_MailboxBase.png', fit: ['y', 1.25], yaw: 0, use: 'mailbox' },
];

// surfaces: file (relative to SRC), crop none, tileM = metres one tile should cover in the game
const SURFACES = [
  { id: 'asphalt-plain', src: 'oga-textures', file: 'asphalt/asphalt_road.png', tileM: 4, use: 'road surface, plain', note: 'photo of asphalt, blue-grey' },
  { id: 'asphalt-cracked', src: 'polyhaven', file: 'ph/asphalt_02.jpg', tileM: 4, use: 'road surface, cracked and patched look', ph: 'asphalt_02', who: 'Rob Tuytel' },
  { id: 'sidewalk-slabs', src: 'polyhaven', file: 'ph/concrete_pavement.jpg', tileM: 3, use: 'sidewalk slabs', ph: 'concrete_pavement', who: 'Charlotte Baglioni' },
  { id: 'brick-mixed', src: 'polyhaven', file: 'ph/brick_wall_005.jpg', tileM: 2.5, use: 'red brick wall, varied, weathered', ph: 'brick_wall_005', who: 'Dimitrios Savva (photography), Dario Barresi (processing)' },
  { id: 'brick-painted', src: 'polyhaven', file: 'ph/painted_brick.jpg', tileM: 2.5, use: 'painted brick (tint to any colour)', ph: 'painted_brick', who: 'Poly Haven artists' },
  { id: 'brownstone', src: 'polyhaven', file: 'ph/old_sandstone_02.jpg', tileM: 3, use: 'brownstone / sandstone facade', ph: 'old_sandstone_02', who: 'Poly Haven artists', note: 'nearest open match to brownstone: warm tan-brown ashlar' },
  { id: 'limestone', src: 'polyhaven', file: 'ph/sandstone_blocks_05.jpg', tileM: 3, use: 'limestone / pale stone blocks', ph: 'sandstone_blocks_05', who: 'Poly Haven artists' },
  { id: 'shutter', src: 'polyhaven', file: 'ph/painted_metal_shutter.jpg', tileM: 2.5, use: 'roll-down shutter', ph: 'painted_metal_shutter', who: 'Charlotte Baglioni (photography), Dario Barresi (baking), Rico Cilliers (processing)' },
  { id: 'awning-canvas', src: 'ambientcg', file: 'acg/Fabric045/Fabric045_1K-JPG_Color.jpg', tileM: 1, use: 'shop awning cloth, pale canvas (tint to any colour)', acg: 'Fabric045' },
  { id: 'awning-navy', src: 'ambientcg', file: 'acg/Fabric075/Fabric075_1K-JPG_Color.jpg', tileM: 1, use: 'shop awning cloth, navy', acg: 'Fabric075' },
  { id: 'grate-storm', src: 'ambientcg', file: 'acg/Grate002/Grate002_1K-JPG_Color.jpg', tileM: 0.7, use: 'storm drain / grate (a single object photo, NOT tileable: use as a decal)', acg: 'Grate002', decal: true },
];

// ---------------------------------------------------------------------------------------------------- helpers
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report = { generated: FETCHED, models: {}, surfaces: {} };
const read = (p) => readFile(join(SRC, p));
const tris = (doc) => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); n += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return n; };

async function pngSmall(buf, size, { nearest = false, colours = 128 } = {}) {
  let s = sharp(buf).removeAlpha();
  const meta = await sharp(buf).metadata();
  if (size && Math.max(meta.width, meta.height) > size) s = s.resize(size, size, { fit: 'fill', kernel: nearest ? 'nearest' : 'lanczos3' });
  return s.png({ palette: true, colours, effort: 10, dither: nearest ? 0 : 0.6 }).toBuffer();
}

/** Parses a Wavefront OBJ into one primitive per material. Triangulates fans; v is flipped for glTF. */
function parseObj(text) {
  const v = [], vt = [], vn = [];
  const groups = new Map(); let cur = 'default';
  const grp = () => { if (!groups.has(cur)) groups.set(cur, { map: new Map(), pos: [], uv: [], nrm: [], idx: [] }); return groups.get(cur); };
  for (const raw of text.split('\n')) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    const t = l.split(/\s+/);
    if (t[0] === 'v') v.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'vt') vt.push([Number(t[1]), Number(t[2])]);
    else if (t[0] === 'vn') vn.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'usemtl') cur = t[1];
    else if (t[0] === 'f') {
      const g = grp(); const ids = [];
      for (const c of t.slice(1)) {
        const [a, b, d] = c.split('/'); const key = c;
        let id = g.map.get(key);
        if (id === undefined) {
          id = g.pos.length / 3; g.map.set(key, id);
          g.pos.push(...v[Number(a) - 1]);
          const uv = b ? vt[Number(b) - 1] : [0, 0]; g.uv.push(uv[0], 1 - uv[1]);
          const n = d ? vn[Number(d) - 1] : [0, 1, 0]; g.nrm.push(...n);
        }
        ids.push(id);
      }
      for (let i = 1; i + 1 < ids.length; i++) g.idx.push(ids[0], ids[i], ids[i + 1]);
    }
  }
  return groups;
}

function parseMtl(text) {
  const out = {}; let cur = null;
  for (const raw of text.split('\n')) { const t = raw.trim().split(/\s+/); if (t[0] === 'newmtl') { cur = t[1]; out[cur] = [0.6, 0.6, 0.6]; } else if (t[0] === 'Kd' && cur) out[cur] = t.slice(1, 4).map(Number); }
  return out;
}

function docFromGroups(name, groups, { texBuf, colours }) {
  const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene(name);
  const node = doc.createNode(name); scene.addChild(node); const mesh = doc.createMesh(name); node.setMesh(mesh);
  let tex = null;
  if (texBuf) tex = doc.createTexture(name + '-tex').setImage(texBuf).setMimeType('image/png');
  for (const [mname, g] of groups) {
    const mat = doc.createMaterial(mname).setRoughnessFactor(1).setMetallicFactor(0);
    if (tex) mat.setBaseColorTexture(tex); else mat.setBaseColorFactor([...(colours?.[mname] ?? [0.6, 0.6, 0.6]).map((c) => c ** 2.2), 1]);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nrm)).setBuffer(buf))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buf));
    mesh.addPrimitive(prim);
  }
  return doc;
}

/** Fits the scene: yaw about Y, scale so the chosen axis is `m` metres, centre on x/z, stand on y = 0. One root node carries it. */
function fitScene(doc, { fit: [axis, m], yaw }) {
  const scene = doc.getRoot().listScenes()[0];
  const root = doc.createNode('root');
  for (const c of scene.listChildren()) { scene.removeChild(c); root.addChild(c); }
  scene.addChild(root);
  const h = (yaw * Math.PI) / 360;
  root.setRotation([0, Math.sin(h), 0, Math.cos(h)]);
  let b = getBounds(root); const ext = { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };
  const s = m / ext[axis]; root.setScale([s, s, s]);
  b = getBounds(root);
  root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  b = getBounds(root);
  return { size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((x) => +x.toFixed(3)) };
}

async function shrinkTextures(doc, item) {
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage(); if (!img) continue;
    const small = item.palette ? await pngSmall(Buffer.from(img), 128, { nearest: true, colours: 64 }) : await pngSmall(Buffer.from(img), 128);
    t.setImage(small).setMimeType('image/png');
  }
}

async function fbxToDoc(path, name, texBuf) {
  globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v) {} }) };
  globalThis.self ??= globalThis;
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const b = await readFile(path);
  const g = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  g.updateMatrixWorld(true);
  const groups = new Map(); const mat = {};
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); geo.computeVertexNormals?.();
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
    const key = o.name || 'part'; const gr = { pos: Array.from(pos.array), nrm: Array.from(nrm.array), uv: uv ? Array.from(uv.array) : new Array(pos.count * 2).fill(0), idx };
    if (uv) for (let i = 1; i < gr.uv.length; i += 2) gr.uv[i] = 1 - gr.uv[i];
    groups.set(key, gr); mat[key] = [0.6, 0.6, 0.6];
  });
  return docFromGroups(name, groups, { texBuf });
}

// ---------------------------------------------------------------------------------------------------- run models
const outList = [];
async function buildModel(it) {
  const srcInfo = SOURCES[it.src];
  const dir = join(OUT, it.src, it.id);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  let doc;
  if (it.obj) {
    const groups = parseObj((await read(it.obj)).toString('utf8'));
    const colours = it.mtl ? parseMtl((await read(it.mtl)).toString('utf8')) : null;
    const texBuf = it.tex ? await pngSmall(await read(it.tex), 128, { colours: 128 }) : null;
    doc = docFromGroups(it.id, groups, { texBuf, colours });
  } else if (it.fbx) {
    const texBuf = it.tex ? await pngSmall(await read(it.tex), 128, { colours: 128 }) : null;
    doc = await fbxToDoc(join(SRC, it.fbx), it.id, texBuf);
  } else {
    doc = await io.read(join(SRC, it.glb));
    await shrinkTextures(doc, it);
  }
  const fitInfo = fitScene(doc, it);
  await doc.transform(dedup(), prune());
  const names = []; doc.getRoot().listScenes()[0].traverse((n) => { if (n.getMesh()) names.push(n.getName()); });
  const glb = await io.writeBinary(doc);
  const file = join(dir, 'model.glb'); await writeFile(file, glb);
  const texSizes = doc.getRoot().listTextures().map((t) => { const s = t.getSize(); return s ? `${s[0]}x${s[1]}` : '?'; });
  const rec = { id: it.id, source: it.src, kind: it.kind, cls: it.cls, triangles: tris(doc), bytes: glb.length, textures: texSizes, sizeM: fitInfo.size, nodes: names.length, wheelNodes: names.filter((n) => /wheel/i.test(n)).length };
  report.models[it.id] = rec;
  await writeFile(join(dir, 'SOURCE.md'), sourceMd(it, srcInfo, rec));
  outList.push({ ...it, ...rec, path: `${it.src}/${it.id}/model.glb` });
  console.log(`${it.id.padEnd(22)} ${String(rec.triangles).padStart(5)} tris ${String(rec.bytes).padStart(7)} B tex ${texSizes.join(',') || '-'} size ${rec.sizeM.join('x')} wheels ${rec.wheelNodes}`);
}

function sourceMd(it, s, rec) {
  const changed = it.kind === 'surface'
    ? 'Resized to 512 and 256 pixels (Lanczos), re-encoded as an 8-bit palette PNG (period look and small files). Seam check in build-report.json.'
    : `Converted by scripts/dev/open-assets-build.mjs: ${it.obj ? 'OBJ parsed to glTF (v flipped, fan-triangulated)' : it.fbx ? 'FBX parsed with three FBXLoader, geometry baked to world space' : 'glb kept as is'}; one root node rotates ${it.yaw} degrees, scales the model to ${it.fit[1]} m on ${it.fit[0]} and stands it on y = 0 centred on x/z; textures re-encoded as small PNG; ${it.clay ? 'no texture (clay model), tint at run time; ' : ''}the front of the model is toward +Z (glTF convention).`;
  return `# ${it.id}

- What: ${s.title}, item "${it.id}" (${it.use})
- Page: ${it.pageOverride ?? s.page}${it.ph ? `\n- Item page: https://polyhaven.com/a/${it.ph} (API record api.polyhaven.com/info/${it.ph}; author(s): ${it.who})` : ''}${it.acg ? `\n- Item page: https://ambientcg.com/a/${it.acg}` : ''}
- Author: ${it.who ?? s.author}
- Licence: ${s.licence}
- Licence line as read: ${s.licenceLine}
- Credit: ${s.credit}
- Fetched: ${FETCHED}
- Changed: ${changed}
${rec.triangles !== undefined ? `- Result: ${rec.triangles} triangles, ${rec.bytes} bytes, textures ${rec.textures.join(', ') || 'none'}\n` : ''}${s.notes ? `- Notes: ${s.notes}\n` : ''}${it.note ? `- Item note: ${it.note}\n` : ''}- Brands or lettering: none checked beyond looking at the render; any real brand seen is allowed since 24 Nov (rule 4) and is left as it is.
`;
}

// ---------------------------------------------------------------------------------------------------- run surfaces
/** Seam metric: mean abs difference across the wrap edge divided by the mean abs difference between neighbouring columns/rows. About 1 means the texture tiles. */
async function seamRatio(buf, size) {
  const { data } = await sharp(buf).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[y * size + x];
  let wrap = 0, inner = 0;
  for (let y = 0; y < size; y++) { wrap += Math.abs(at(0, y) - at(size - 1, y)); inner += Math.abs(at(size >> 1, y) - at((size >> 1) + 1, y)); }
  let wrapY = 0, innerY = 0;
  for (let x = 0; x < size; x++) { wrapY += Math.abs(at(x, 0) - at(x, size - 1)); innerY += Math.abs(at(x, size >> 1) - at(x, (size >> 1) + 1)); }
  return +(Math.max(wrap / Math.max(inner, 1), wrapY / Math.max(innerY, 1))).toFixed(2);
}

async function buildSurface(it) {
  const s = SOURCES[it.src]; const dir = join(OUT, it.src, it.id);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const src = await read(it.file);
  const full = await sharp(src).removeAlpha().resize(512, 512, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const ratio = await seamRatio(full, 512);
  const b512 = await sharp(full).png({ palette: true, colours: 128, effort: 10, dither: 0.6 }).toBuffer();
  const b256 = await sharp(full).resize(256, 256, { kernel: 'lanczos3' }).png({ palette: true, colours: 96, effort: 10, dither: 0.6 }).toBuffer();
  await writeFile(join(dir, 'surface-512.png'), b512); await writeFile(join(dir, 'surface-256.png'), b256);
  const rec = { id: it.id, source: it.src, kind: 'surface', bytes512: b512.length, bytes256: b256.length, seamRatio: ratio, tileable: it.decal ? false : ratio < 3, tileM: it.tileM, texelsPerM512: Math.round(512 / it.tileM) };
  report.surfaces[it.id] = rec;
  await writeFile(join(dir, 'SOURCE.md'), sourceMd({ ...it, kind: 'surface' }, s, {}));
  outList.push({ ...it, ...rec, kind: 'surface', path: `${it.src}/${it.id}` });
  console.log(`${it.id.padEnd(18)} 512: ${b512.length} B  256: ${b256.length} B  seam ratio ${ratio}${it.decal ? ' (decal)' : ''}`);
}

for (const it of MODELS) if (!only || only === it.id) await buildModel(it);
for (const it of SURFACES) if (!only || only === it.id) await buildSurface(it);

// ---------------------------------------------------------------------------------------------------- manifest
const q = (x) => JSON.stringify(x);
const rows = outList.map((e) => {
  const s = SOURCES[e.src];
  const common = `    id: ${q(e.id)}, kind: ${q(e.kind)}, licence: ${q(s.licence)}, credit: ${q(s.credit + (e.who ? ` (${e.who})` : ''))}, source: ${q(e.src)},`;
  if (e.kind === 'surface') {
    return `  {\n${common}\n    file: ${q(e.path + '/surface-512.png')}, url: new URL(${q('./' + e.path + '/surface-512.png')}, import.meta.url).href,\n    file256: ${q(e.path + '/surface-256.png')}, url256: new URL(${q('./' + e.path + '/surface-256.png')}, import.meta.url).href,\n    triangles: 0, bytes: ${e.bytes512}, bytes256: ${e.bytes256}, size: 512, tileM: ${e.tileM}, tileable: ${e.tileable}, use: ${q(e.use)},\n  },`;
  }
  return `  {\n${common}\n    file: ${q(e.path)}, url: new URL(${q('./' + e.path)}, import.meta.url).href,\n    triangles: ${e.triangles}, bytes: ${e.bytes}, size: ${q(e.textures.join(',') || 'none')}, dimsM: [${e.sizeM.join(', ')}], wheels: ${e.wheelNodes}, cls: ${q(e.cls)}, use: ${q(e.use)},\n  },`;
});
const manifest = `/**
 * Open-licence low-poly assets (INTAKE seat, 24 Nov 2026). GENERATED by scripts/dev/open-assets-build.mjs: do not edit by hand.
 *
 * Hosted and native builds only. Nothing imports this file yet, so the single-file build does not grow. A seat that uses it
 * must load it behind the hosted check, by dynamic import(), so the single-file build never inlines these files:
 *   if (import.meta.env.VITE_HOSTED) { const { OPEN_ASSETS } = await import('@/assets/open/manifest'); ... }
 * Models: Y up, metres, standing on y = 0, centred on x/z, front toward +Z (glTF convention; VehicleSource turns it to -Z).
 * Surfaces: tileable 8-bit PNG, 'size' pixels across, one tile covers 'tileM' metres.
 */
export type OpenAssetKind = 'car' | 'prop' | 'surface';

export interface OpenAsset {
  id: string;
  kind: OpenAssetKind;
  licence: 'CC0' | 'CC BY' | 'CC BY-SA';
  credit: string;
  source: string;
  /** Path under src/assets/open/. */
  file: string;
  /** Resolved URL (the 512 px image for surfaces). */
  url: string;
  file256?: string;
  url256?: string;
  triangles: number;
  /** Bytes of the model file, or of the 512 px image for surfaces. */
  bytes: number;
  bytes256?: number;
  /** Texture size(s) inside the model, or the pixel size of a surface. */
  size: string | number;
  dimsM?: [number, number, number];
  wheels?: number;
  tileM?: number;
  tileable?: boolean;
  cls?: string;
  /** Suggested vehicle class or surface use. */
  use: string;
}

export const OPEN_ASSETS: readonly OpenAsset[] = [
${rows.join('\n')}
];

export const openAsset = (id: string): OpenAsset | undefined => OPEN_ASSETS.find((a) => a.id === id);
`;
if (!only) {
  await writeFile(join(OUT, 'manifest.ts'), manifest);
  await writeFile(join(OUT, 'build-report.json'), JSON.stringify(report, null, 1) + '\n');
  console.log('wrote manifest.ts and build-report.json');
}
