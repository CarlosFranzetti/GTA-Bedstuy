import * as THREE from 'three';
import { Game } from '@/core/Game';
import { Input } from '@/core/Input';
import { Rng } from '@/core/Rng';
import { EventBus } from '@/core/Events';
import { ThirdPersonCamera } from '@/core/Camera';
import { clamp, dist, type Vec2 } from '@/core/Math2';
import type { Entity, IVehicle, VehicleType, GraphNode } from '@/world/types';
import { loadBedstuyData } from '@/world/Grid';
import { buildWorld } from '@/world/WorldBuilder';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { World2D } from '@/physics/World2D';
import { Player, ENTER_RANGE } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { Pedestrian } from '@/entities/Pedestrian';
import { TrafficSystem } from '@/game/TrafficSystem';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { DayNight } from '@/game/DayNight';
import { Hud } from '@/ui/Hud';
import { Minimap } from '@/ui/Minimap';
import { TouchControls } from '@/ui/TouchControls';
import { AudioSystem } from '@/audio/AudioSystem';
import { RenderPipeline } from '@/render/Pipeline';
import { setupShadows, updateShadowCamera, applyShadowFlags, type Quality } from '@/render/Shadows';
import { SkyDome } from '@/render/SkyDome';
import { NightLights } from '@/render/NightLights';
import { setLampsLit } from '@/world/FurnitureGen';
import { loadTexturePacks } from '@/textures/packs';

declare global {
  interface Window { __gtaReady?: boolean; __gtaStats?: Record<string, number>; }
}

const app = document.getElementById('app')!;

// ---- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const isTouch = Input.isTouchDevice();
const params = new URLSearchParams(location.search);
let quality: Quality = (params.get('q') as Quality | null) ?? (isTouch ? 'low' : 'medium');
renderer.setPixelRatio(Math.min(quality === 'low' ? 1.25 : 1.75, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.className = 'game';
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();

// ---- world
const data = loadBedstuyData();
const rng = new Rng(data.seed);
const events = new EventBus();
const materials = new MaterialLibrary(rng.fork('materials'), undefined, { maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
const packsReady = loadTexturePacks(materials, renderer.capabilities.getMaxAnisotropy()).catch((e) => { console.warn('texture packs failed', e); return 0; });
const world = buildWorld(data, materials, rng);
scene.add(world.group);
const { grid } = world;

const physics = new World2D(12);
for (const c of world.colliders) physics.addStatic(c.shape, c.pos, c.id);

const dayNight = new DayNight(scene, materials, { startHour: 17.5 });
scene.add(dayNight.sun.target);
setupShadows(renderer, dayNight.sun, quality);
applyShadowFlags(world.group, true, true);
const sky = new SkyDome(scene, renderer, materials);
dayNight.attachSky(sky);
scene.environmentIntensity = dayNight.isNight ? 0.5 : 0.18;
const nightLights = new NightLights(scene, world.lamps, { poolSize: quality === 'low' ? 6 : 12 });

// ---- entities
let vehicleSeq = 0;
const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
  new Vehicle(`veh${vehicleSeq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, materials, events);
const crosswalkNodes = new Set<string>();
for (const cw of grid.crosswalks) {
  for (const p of [cw.a, cw.b]) crosswalkNodes.add(grid.nearestSidewalkNode(p).id);
}
const makePed = (id: string, node: GraphNode) =>
  new Pedestrian(id, node, grid.sidewalks, physics, materials, events, rng.fork(id), crosswalkNodes);

const player = new Player('player', { x: 9, z: 20 }, materials, events);
scene.add(player.object3D);
physics.addBody(player.body);

const wanted = new WantedSystem(events);
const traffic = new TrafficSystem(grid, physics, events, rng.fork('traffic'), scene, materials, makeVehicle, makePed);
const cops = new CopSystem(grid, physics, events, rng.fork('cops'), scene, makeVehicle, wanted);
const audio = new AudioSystem(events);

events.on('enterVehicle', () => { physics.removeBody(player.body.id); if (player.vehicle) nightLights.attachHeadlights(player.vehicle.object3D, player.vehicle.spec.length); });
events.on('exitVehicle', () => { physics.addBody(player.body); nightLights.attachHeadlights(null); });

// ---- ui
const overlay = document.createElement('div');
overlay.id = 'overlay';
app.appendChild(overlay);
const hud = new Hud(overlay);
const minimap = new Minimap(overlay, grid);
hud.showSplash();

const input = new Input(renderer.domElement);
const cam = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
const pipeline = new RenderPipeline(renderer, scene, cam.camera, { quality });
pipeline.setNight(dayNight.isNight);
setLampsLit(world.furnitureGroup, dayNight.isNight);
input.onFirstGesture = () => { hud.hideSplash(); events.emit('userGesture', {}); };
overlay.addEventListener('mousedown', () => input.notifyGesture());
overlay.addEventListener('pointerdown', () => input.notifyGesture());
if (isTouch) new TouchControls(overlay, input);

// ---- loop
const allVehicles = (): IVehicle[] => [...traffic.vehicles, ...cops.cops];
const entityById = new Map<string, Entity>();
let fps = 60, frames = 0, fpsClock = 0;
let lastNight = dayNight.isNight;
const copPositions: Vec2[] = [];

let freeCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
function updateCamera(): void {
  const pos = player.body.pos;
  const heading = player.vehicle ? player.vehicle.body.heading : player.body.heading;
  if (freeCam) { cam.camera.position.copy(freeCam.pos); cam.camera.lookAt(freeCam.look); }
  else cam.update(1 / 60, pos, heading, player.inVehicle ? 'vehicle' : 'foot', input);
}
const game = new Game(
  () => {
    const pos = player.body.pos;
    const heading = player.vehicle ? player.vehicle.body.heading : player.body.heading;
    updateCamera();
    updateShadowCamera(dayNight.sun, player.body.pos);
    sky.update(dayNight.timeOfDay, dayNight.sun.position.clone().normalize(), dayNight.isNight, cam.camera.position);
    pipeline.render();
    frames++;
    const street = grid.nearestStreet(pos);
    let prompt = '';
    const key = isTouch ? 'CAR' : 'F';
    if (player.inVehicle) prompt = `${key}  Exit car`;
    else { for (const v of allVehicles()) if (dist(v.doorPos(), pos) <= ENTER_RANGE) { prompt = `${key}  Enter car`; break; } }
    hud.update({
      stars: wanted.stars,
      speedKmh: player.vehicle ? Math.abs(player.vehicle.speed) * 3.6 : 0,
      inVehicle: player.inVehicle,
      radioStation: audio.stationName,
      prompt,
      timeOfDay: dayNight.timeOfDay,
      streetName: street.signName,
      fps,
    });
    copPositions.length = 0;
    for (const c of cops.cops) copPositions.push(c.body.pos);
    minimap.update(pos, heading, copPositions);
    window.__gtaStats = { drawCalls: renderer.info.render.calls, fps, vehicles: traffic.vehicles.length, peds: traffic.peds.length, cops: cops.cops.length, meshes: world.stats.meshes, colliders: world.stats.colliders };
  },
  () => input.endFrame(),
);

game.add({
  update(dt) {
    // input
    player.control(input, cam.yaw);
    if (input.pressed('KeyF')) { if (player.inVehicle) player.exit(); else player.tryEnter(allVehicles()); }

    // ai + systems
    traffic.update(dt, player.body.pos);
    cops.update(dt, player.body.pos);
    wanted.update(dt);

    // entities
    entityById.clear();
    for (const v of traffic.vehicles) { if (v.headlights !== lastNight) { v.headlights = lastNight; applyShadowFlags(v.object3D, true, false); } v.update(dt); entityById.set(v.body.id, v); }
    for (const v of cops.cops) { if (v.headlights !== lastNight) { v.headlights = lastNight; applyShadowFlags(v.object3D, true, false); } v.update(dt); entityById.set(v.body.id, v); }
    for (const p of traffic.peds) { p.update(dt); entityById.set(p.body.id, p); }
    player.update(dt);
    entityById.set(player.body.id, player);

    // physics
    const contacts = physics.step(dt);
    for (const c of contacts) {
      entityById.get(c.a.id)?.onContact?.(c, c.b);
      entityById.get(c.b.id)?.onContact?.(c, c.a);
    }
    // re-sync meshes to corrected positions
    for (const e of entityById.values()) { e.object3D.position.x = e.body.pos.x; e.object3D.position.z = e.body.pos.z; }
    if (player.inVehicle && player.vehicle) { player.object3D.position.x = player.vehicle.body.pos.x; player.object3D.position.z = player.vehicle.body.pos.z; }

    // keep the player on the map
    const b = grid.bounds, m = 25;
    const pb = player.vehicle ? player.vehicle.body : player.body;
    pb.pos.x = clamp(pb.pos.x, b.minX - m, b.maxX + m);
    pb.pos.z = clamp(pb.pos.z, b.minZ - m, b.maxZ + m);

    // environment + audio
    dayNight.update(dt);
    if (dayNight.isNight !== lastNight) {
      lastNight = dayNight.isNight; audio.setNight(lastNight); pipeline.setNight(lastNight); setLampsLit(world.furnitureGroup, lastNight);
      scene.environmentIntensity = lastNight ? 0.5 : 0.18;
      for (const v of allVehicles()) v.headlights = lastNight;
    }
    nightLights.update(player.body.pos, dayNight.isNight, dt);
    audio.setEngine(player.vehicle ? Math.abs(player.vehicle.speed) : 0, player.vehicle ? Math.abs(player.lastVehicleInput.throttle) : 0, player.inVehicle);
    audio.update(dt);

    fpsClock += dt; if (fpsClock >= 0.5) { fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
  },
});

window.addEventListener('resize', () => {
  cam.setAspect(window.innerWidth / window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setSize(window.innerWidth, window.innerHeight);
});
applyShadowFlags(player.object3D, true, false);
packsReady.then((n) => { window.__gtaStats = { ...(window.__gtaStats ?? {}), packs: n }; });
document.addEventListener('visibilitychange', () => { game.paused = document.hidden; });

// debug/review hooks (harmless in production)
(window as unknown as { __gtaDebug: unknown }).__gtaDebug = {
  setFreeCam(x: number, y: number, z: number, lx: number, ly: number, lz: number) { freeCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) }; },
  clearFreeCam() { freeCam = null; },
  setHour(h: number) { dayNight.timeOfDay = h; },
  setQuality(q: Quality) { quality = q; pipeline.setQuality(q); setupShadows(renderer, dayNight.sun, q); },
  packsReady,
  teleport(x: number, z: number, heading?: number) { const b = player.vehicle ? player.vehicle.body : player.body; b.pos.x = x; b.pos.z = z; b.vel.x = 0; b.vel.z = 0; if (heading !== undefined) b.heading = heading; },
  /** run n fixed simulation steps synchronously (for scripted review) */
  step(n: number) { for (let i = 0; i < n; i++) { for (const sys of game.systems) sys.update(game.step); input.endFrame(); } },
  settle(n: number) { for (let i = 0; i < n; i++) updateCamera(); },
  player, cops, traffic, wanted, physics, grid, events, scene, sky, pipeline, nightLights, dayNight, renderer, materials,
  nearby(r: number) { const p = player.body.pos; const out: unknown[] = []; for (const b of physics.bodies()) { const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (b.shape.kind === 'circle' && d < r) out.push({ id: b.id, kind: b.kind, d: +d.toFixed(2) }); } return out; },
};

window.__gtaReady = true;
game.start();
