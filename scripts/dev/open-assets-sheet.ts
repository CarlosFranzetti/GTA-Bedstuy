// INTAKE seat: contact sheet of every open asset in src/assets/open (standalone page, not the full game).
// Run: SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/open-assets-sheet.mjs <out.png>
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OPEN_ASSETS } from '../../src/assets/open/manifest';

declare global { interface Window { __ready?: unknown } }
const W = 1800, H = 1540, CW = 300, CH = 220, COLS = 6;
const gl = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setScissorTest(true); renderer.setClearColor(0x2a2825);
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const light = (s: THREE.Scene) => {
  s.add(new THREE.HemisphereLight(0xfff1dc, 0x4a4036, 1.5));
  const d = new THREE.DirectionalLight(0xffe2b8, 2.2); d.position.set(3, 6, 4); s.add(d);
};

type Cell = { label: string; scene: THREE.Scene; cam: THREE.PerspectiveCamera };
const cells: Cell[] = [];
const cars = OPEN_ASSETS.filter((a) => a.kind === 'car');
const props = OPEN_ASSETS.filter((a) => a.kind === 'prop');
const surfs = OPEN_ASSETS.filter((a) => a.kind === 'surface');
const stats: Record<string, unknown> = {};

async function addModel(a: (typeof OPEN_ASSETS)[number]) {
  const gltf = await loader.loadAsync(a.url);
  const scene = new THREE.Scene(); light(scene);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestFilter; mat.map.needsUpdate = true; }
    if (!mat.map && a.cls && /bus|pickup/.test(a.id)) mat.color.set(0xc9a24a);
  });
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(30, CW / CH, 0.1, 200);
  cam.position.copy(c).add(new THREE.Vector3(0.75, 0.45, 0.9).normalize().multiplyScalar(r * 2.9)); cam.lookAt(c);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 1.6, 24), new THREE.MeshLambertMaterial({ color: 0x3b3833 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; scene.add(floor);
  cells.push({ label: `${a.id}  ${a.triangles} tris`, scene, cam });
}
function addSurface(a: (typeof OPEN_ASSETS)[number]) {
  const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const t = texLoader.load(a.url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(2, 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: t })); scene.add(m);
  const cam = new THREE.PerspectiveCamera(30, CW / CH, 0.1, 50); cam.position.set(0, 0, 4.1); cam.lookAt(0, 0, 0);
  cells.push({ label: `${a.id}  512px, ${a.tileM} m/tile${a.tileable === false ? ' (decal)' : ''}`, scene, cam });
}
for (const a of cars) await addModel(a);
while (cells.length % COLS) cells.push({ label: '', scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera() });
for (const a of props) await addModel(a);
while (cells.length % COLS) cells.push({ label: '', scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera() });
for (const a of surfs) addSurface(a);
await new Promise((r) => setTimeout(r, 1500)); // textures decode

cells.forEach((c, i) => {
  const x = (i % COLS) * CW, y = H - (Math.floor(i / COLS) + 1) * CH;
  renderer.setViewport(x, y, CW, CH); renderer.setScissor(x, y, CW, CH); renderer.render(c.scene, c.cam);
});
const out = document.createElement('canvas'); out.width = W; out.height = H;
const g = out.getContext('2d')!; g.drawImage(gl, 0, 0);
g.font = '13px monospace'; g.textBaseline = 'top';
cells.forEach((c, i) => {
  const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 4, y + 4, CW - 8, 18); g.fillStyle = '#f2e7d0'; g.fillText(c.label, x + 8, y + 7);
  g.strokeStyle = '#1b1a18'; g.strokeRect(x, y, CW, CH);
});
stats.cells = cells.length;
document.body.appendChild(out); gl.style.display = 'none';
window.__ready = { data: out.toDataURL('image/png'), stats };
