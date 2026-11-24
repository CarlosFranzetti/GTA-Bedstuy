// MODS harness page script (served by vite dev: /scripts/dev/mods-harness.html). No game, no main.ts.
// Builds a tiny car as a RenderWare .dff and a 4x4 .txd in memory (the writers from the tests), installs them through the real
// registry, fits the car to the "sedan" class, renders stock-vs-mod side by side, applies a ground texture through the real
// MaterialLibrary, and mounts the real Mods panel. Result for scripts: window.__ready (info object), window.__modsHarness.
import * as THREE from 'three';
import { Rng } from '/src/core/Rng.ts';
import { MaterialLibrary } from '/src/textures/MaterialLibrary.ts';
import { VEHICLE_SPECS } from '/src/entities/Vehicle.ts';
import { ModRegistry } from '/src/mods/registry.ts';
import { ModsPanel } from '/src/ui/ModsPanel.ts';
import { buildTxd } from '/tests/unit/mods/rwWriters.ts';
import { carDff } from '/tests/unit/mods/carFixture.ts';

const canvas = document.getElementById('view');
const log = (s) => { document.getElementById('log').textContent += s + '\n'; };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(480, 270, false);
renderer.setClearColor(0x20242c);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 6, 4); scene.add(sun);
const cam = new THREE.PerspectiveCamera(40, 480 / 270, 0.1, 100);
cam.position.set(9, 5.2, 4); cam.lookAt(0, 0.6, -3);

const materials = new MaterialLibrary(new Rng(7));
const registry = new ModRegistry({ tier: 'high' });
const panel = new ModsPanel(document.getElementById('overlay'), registry, { vehicleTypes: Object.keys(VEHICLE_SPECS), onChange: apply });
document.getElementById('open').addEventListener('click', () => panel.open());

function apply() {
  const sources = {};
  registry.applyTo({ vehicleSources: sources, materials });
  return sources;
}

const png = (() => { const b = new Uint8Array(32); const dv = new DataView(b.buffer); dv.setUint32(0, 0x89504e47); dv.setUint32(4, 0x0d0a1a0a); dv.setUint32(16, 8); dv.setUint32(20, 8); return b; })();
void png;

// a 8x8 checker as a bgra .txd for the ground
const checker = new Uint8Array(8 * 8 * 4);
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = (x + y) & 1 ? [200, 170, 60] : [60, 70, 90]; checker.set([c[2], c[1], c[0], 255], (y * 8 + x) * 4); }
const txd = buildTxd([{ name: 'Checker', width: 8, height: 8, kind: 'bgra', pixels: checker }]);

const enc = (s) => new TextEncoder().encode(s);
const manifest = enc(JSON.stringify({ format: 1, name: 'Harness pack', author: 'harness', licence: 'CC0-1.0', entries: [
  { slot: 'vehicle:sedan', model: 'car.dff' },
  { slot: 'texture:asphalt', image: 'ground.txd', texture: 'checker', repeat: [6, 6] },
] }));
const rep = await registry.install([{ path: 'mod.json', data: manifest }, { path: 'car.dff', data: carDff() }, { path: 'ground.txd', data: txd }]);
const sources = apply();

const spec = { ...VEHICLE_SPECS.sedan, color: '#c0392b' };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), materials.get('asphalt', 0));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
let tris = 0;
if (sources.sedan) {
  const car = sources.sedan.instantiate(spec);
  car.group.position.x = 0; scene.add(car.group);
  car.group.traverse((o) => { if (o.isMesh) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  window.__car = car;
}
renderer.render(scene, cam);
const info = {
  installed: rep.ok, errors: rep.errors, entries: rep.entries, warnings: rep.warnings,
  hasSedanSource: !!sources.sedan,
  triangles: tris, drawCalls: renderer.info.render.calls,
  wheels: window.__car?.wheels.length ?? 0, steer: window.__car?.steerPivots.length ?? 0, paintMeshes: window.__car?.paintMeshes.length ?? 0,
  groundHasMap: !!materials.get('asphalt', 0).map, groundMapName: materials.get('asphalt', 0).map?.name ?? null,
  bbox: window.__car ? new THREE.Box3().setFromObject(window.__car.group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null,
  spec: { length: spec.length, width: spec.width, height: spec.height },
};
log(JSON.stringify(info, null, 1));
// the worked example of docs/MODS.md, from files already in the repository (vite serves /src/assets)
const grab = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const exManifest = await grab('/docs/examples/mod-example/mod.json');
const ex = new ModRegistry({ tier: 'high' });
const exRep = await ex.install([
  { path: 'mod.json', data: exManifest },
  { path: 'car.glb', data: await grab('/src/assets/models/vehicle-sedan.glb') },
  { path: 'road_color.jpg', data: await grab('/src/assets/textures/cc0/asphalt/color_1k.jpg') },
  { path: 'road_normal.jpg', data: await grab('/src/assets/textures/cc0/asphalt/normal_1k.jpg') },
  { path: 'road_rough.jpg', data: await grab('/src/assets/textures/cc0/asphalt/rough_1k.jpg') },
]);
info.example = { ok: exRep.ok, errors: exRep.errors, entries: exRep.entries, warnings: exRep.warnings };
if (ex.vehicleSource('sedan')) {
  const m = ex.vehicleSource('sedan').instantiate({ ...VEHICLE_SPECS.sedan, color: '#2e6fba' });
  m.group.position.set(0, 0, -6); scene.add(m.group);
  info.example.wheels = m.wheels.length; info.example.steer = m.steerPivots.length; info.example.paintMeshes = m.paintMeshes.length;
}
renderer.render(scene, cam);
window.__modsHarness = { registry, panel, scene, renderer, cam, materials };
window.__ready = info;
