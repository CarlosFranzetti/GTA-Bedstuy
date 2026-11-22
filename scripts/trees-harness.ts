// TREES review harness (standalone, no game): street-tree forms as instanced in the game, and a park grove built with landmarks/parts.ts.
// Dev server: vite --port N, then /scripts/trees-harness.html?view=street|park&cam=x,y,z,lx,ly,lz&w=640&h=360&q=phone
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Rng } from '@/core/Rng';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { buildCloudGeometry, buildTreeTrunkGeometry } from '@/world/props/treeCloud';
import { TREE_FORMS, treePartsFor } from '@/world/data/streetTrees';
import { Kit } from '@/world/landmarks/kit';
import { tree, shrub, hedge } from '@/world/landmarks/parts';
const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 640), H = Number(q.get('h') ?? 360);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H); document.body.appendChild(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9c4dc); scene.fog = new THREE.Fog(0xb9c8d4, 60, 220);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
const sun = new THREE.DirectionalLight(0xffe0b0, 2.6); sun.position.set(-30, 40, 25); scene.add(sun);
scene.add(new THREE.HemisphereLight(0xb4cce8, 0x7a6a50, 0.7));
const materials = new MaterialLibrary(new Rng(7)); materials.setEnvironment(scene.environment);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x59683a, roughness: 1 }));
scene.add(ground);
const view = q.get('view') ?? 'street';
const rng = new Rng(11);
if (view === 'street') {
  const trunkG = buildTreeTrunkGeometry(), cloudG = buildCloudGeometry();
  const rows = TREE_FORMS.length;
  const trunkM: THREE.Matrix4[] = [], leafM: THREE.Matrix4[] = [];
  const _m = new THREE.Matrix4(), _l = new THREE.Matrix4();
  const speciesOf = [1, 2, 4, 3];
  for (let f = 0; f < rows; f++) for (let i = 0; i < 5; i++) {
    const style = { dbhIn: 12 + i * 4, species: speciesOf[f], scale: 0.8 + i * 0.12, canopy: 1 };
    const tr = new Rng(`${f}:${i}`);
    const R = (1.2 + 0.4 * tr.next()) * style.canopy;
    const base = new THREE.Matrix4().makeTranslation(i * 14 - 28, 0, f * 14 - 20).multiply(new THREE.Matrix4().makeRotationY(tr.next() * 6)).scale(new THREE.Vector3(style.scale, style.scale, style.scale));
    const parts = treePartsFor(style, R, tr.next(), tr.next());
    trunkM.push(new THREE.Matrix4().multiplyMatrices(base, _m.makeScale(...parts.trunk)));
    for (const [ox, oy, oz, r, sq] of parts.clouds) leafM.push(new THREE.Matrix4().multiplyMatrices(base, _l.compose(new THREE.Vector3(ox, oy, oz), new THREE.Quaternion(), new THREE.Vector3(r, r * sq, r))));
  }
  const mk = (g: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[]) => { const im = new THREE.InstancedMesh(g, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.frustumCulled = false; scene.add(im); };
  mk(trunkG, materials.get('treeTrunk'), trunkM); mk(cloudG, materials.get('treeLeaves'), leafM);
} else {
  const kit = new Kit(materials as never, { ox: 0, oz: 0, fx: 1, fz: 0, nx: 0, nz: 1 }, 'harness', false);
  const taken: Array<[number, number]> = [];
  const ok = (x: number, z: number): boolean => taken.every(([a, b]) => Math.hypot(a - x, b - z) > 5);
  for (let g = 0; g < 7; g++) {
    const cx = rng.range(-50, 50), cz = rng.range(-30, 40);
    for (let i = 0; i < 4; i++) { const x = cx + rng.range(-9, 9), z = cz + rng.range(-9, 9); if (!ok(x, z)) continue; taken.push([x, z]); tree(kit, x, z, rng, rng.range(0.9, 1.35)); }
  }
  for (let i = 0; i < 18; i++) { const [a, b] = taken[i % taken.length]; shrub(kit, a + rng.range(-4, 4), b + rng.range(-4, 4), rng, rng.range(0.9, 1.5)); }
  hedge(kit, -60, 55, 60, 55, rng, 0.95);
  for (const m of kit.finish()) scene.add(m);
  console.log('park triangles', kit.triangles);
}
const cam = new THREE.PerspectiveCamera(60, W / H, 0.3, 500);
const c = (q.get('cam') ?? (view === 'street' ? '-30,2.2,-40,0,6,-5' : '-55,1.7,70,0,5,0')).split(',').map(Number);
cam.position.set(c[0], c[1], c[2]); cam.lookAt(c[3], c[4], c[5]);
renderer.render(scene, cam); renderer.render(scene, cam);
(window as never as { __ready: unknown }).__ready = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
