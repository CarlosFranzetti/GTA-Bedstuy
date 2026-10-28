import * as THREE from 'three';
import { Game, PoseSnapshots, type BlendedPose } from '@/core/Game';
import { Input } from '@/core/Input';
import { Rng } from '@/core/Rng';
import { EventBus } from '@/core/Events';
import { ThirdPersonCamera } from '@/core/Camera';
import { clamp, dist, type Vec2 } from '@/core/Math2';
import type { Entity, IVehicle, VehicleType, GraphNode, HudState } from '@/world/types';
import { loadBedstuyData } from '@/world/Grid';
import { buildWorld } from '@/world/WorldBuilder';
import { updateSignalMeshes } from '@/world/props/signals';
import { TrafficLights } from '@/game/TrafficLights';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { World2D } from '@/physics/World2D';
import { Player, ENTER_RANGE } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { Pedestrian } from '@/entities/Pedestrian';
import { resolveCharacterSource, GltfCharacterSource } from '@/entities/models/gltf/CharacterSource';
import { resolveVehicleSources } from '@/entities/models/gltf/VehicleSource';
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
import { SunFlare } from '@/render/LensFlare';
import { setLampsLit } from '@/world/FurnitureGen';
import { loadTexturePacks } from '@/textures/packs';
import { LIGHTING } from '@/render/LightingConfig';
import { Menu } from '@/ui/Menu';
import { GamepadInput } from '@/core/Gamepad';
import { loadPosition, savePosition, watchPagehide, type SavedPosition } from '@/ui/SaveState';
import { LoadingScreen, nextPaint, withTimeout } from '@/render/Loading';
import { PerfMonitor, PassCounter } from '@/render/Perf';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { MissionMarkerView } from '@/game/missions/MissionMarkerView';
import { saveMissionData, loadMissionData, clearMissionData } from '@/game/missions/MissionStore';
import { MissionHud } from '@/ui/MissionHud';
import { DistanceCuller } from '@/render/Culling';
import { CarLod, applyCarShadowFlags } from '@/render/CarLod';
import { RenderProxies } from '@/render/AoProxy';
import { buildCarModel } from '@/entities/models/carModel';

declare global {
  interface Window { __gtaReady?: boolean; __gtaStats?: Record<string, number>; }
}

const app = document.getElementById('app')!;

// ---- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const isTouch = Input.isTouchDevice();
const params = new URLSearchParams(location.search);
// A/B switches for perf measurements and bug reports: ?proxies=0 (full shadow/AO scene renders), ?lod=0 (full cars everywhere)
const useProxies = params.get('proxies') !== '0';
const useCarLod = params.get('lod') !== '0';
let quality: Quality = (params.get('q') as Quality | null) ?? (isTouch ? 'low' : 'medium');
const pixelRatioFor = (q: Quality): number => Math.min(q === 'low' ? 1.25 : 1.75, window.devicePixelRatio);
renderer.setPixelRatio(pixelRatioFor(quality));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
// The composer calls renderer.render() once per pass; with autoReset on, info.render.calls only holds the last pass.
// Reset manually once per frame instead so the stats are the real per-frame total.
renderer.info.autoReset = false;
renderer.domElement.className = 'game';
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();

// ---- loading screen (steps paint between the long synchronous build stages)
const loading = new LoadingScreen(app);
await nextPaint();

// ---- world
loading.begin('materials');
const data = loadBedstuyData();
const rng = new Rng(data.seed);
const events = new EventBus();
const materials = new MaterialLibrary(rng.fork('materials'), undefined, { maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
materials.carPaintDetail();
loading.done('materials');
loading.begin('textures'); // finished when the async packs are awaited below, before the splash
const packsReady = loadTexturePacks(materials, renderer.capabilities.getMaxAnisotropy()).catch((e) => { console.warn('texture packs failed', e); return 0; });
await nextPaint();
loading.begin('world');
const world = buildWorld(data, materials, rng);
scene.add(world.group);
const { grid } = world;

const physics = new World2D(12);
for (const c of world.colliders) physics.addStatic(c.shape, c.pos, c.id);
loading.done('world');
await nextPaint();

loading.begin('lights');
const dayNight = new DayNight(scene, materials, { startHour: LIGHTING.startHour });
scene.add(dayNight.sun.target);
setupShadows(renderer, dayNight.sun, quality);
applyShadowFlags(world.group, true, true);
// Shadow pass + AO G-buffer draw merged position-only stand-ins instead of every material mesh (see AoProxy.ts)
const proxies = new RenderProxies();
if (useProxies) {
  const t0 = performance.now();
  const build = proxies.addStatic([world.group], 100, 100);
  scene.add(proxies.shadowGroup);
  console.info(`[perf] render proxies: ${proxies.ao.children.length} cells, ${build.vertices} verts, ${build.triangles} tris from ${build.covered.length} meshes (${build.skipped.length} kept real) in ${Math.round(performance.now() - t0)} ms`);
}
if (useProxies) proxies.wrapShadowRender(renderer);
const sky = new SkyDome(scene, renderer, materials);
dayNight.attachSky(sky);
scene.environmentIntensity = dayNight.isNight ? LIGHTING.envIntensityNight : LIGHTING.envIntensityDay;
const nightLights = new NightLights(scene, world.lamps, { poolSize: LIGHTING.lampPool[quality] });
const sunFlare = new SunFlare(scene);
loading.done('lights');
await nextPaint();

// distance culling: prop cells (static) and, per frame, traffic cars and peds
const culler = new DistanceCuller(220);
for (const m of world.propCells) culler.addStatic(m);

// ---- entities (optional real models: src/assets/models/README.md)
loading.begin('entities');
Vehicle.sources = await resolveVehicleSources();
{ const chars = await resolveCharacterSource(materials, rng.fork('characters')); if (chars instanceof GltfCharacterSource) { Pedestrian.characterSource = chars; Player.characterSource = chars; } }
let vehicleSeq = 0;
const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
  new Vehicle(`veh${vehicleSeq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, materials, events);
// far cars are drawn as instances of a per-type model (see CarLod); GLB models and cop cars always use the full model
const carLod = new CarLod(materials, {
  buildModel: (t) => (Vehicle.sources[t as VehicleType] ? null : buildCarModel(t as VehicleType, VEHICLE_SPECS[t as VehicleType], materials)),
  exclude: ['cop'],
  nearDist: useCarLod ? 32 : Infinity,
});
scene.add(carLod.group);
const HULL_TYPES = ['sedan', 'suv', 'boxtruck'];
if (useProxies) for (const t of HULL_TYPES) { const g = carLod.hullFor(t); if (g) proxies.addHull(t, g, true); }
if (useProxies) proxies.addHull('capsule', new THREE.CapsuleGeometry(0.28, 1.1, 2, 6).translate(0, 0.83, 0), false);
const hullKey = (t: string): string => (t === 'cop' ? 'sedan' : t);
const shadowFlagged = new WeakSet<object>();
const crosswalkNodes = new Set<string>();
for (const cw of grid.crosswalks) {
  for (const p of [cw.a, cw.b]) crosswalkNodes.add(grid.nearestSidewalkNode(p).id);
}
const makePed = (id: string, node: GraphNode) =>
  new Pedestrian(id, node, grid.sidewalks, physics, materials, events, rng.fork(id), crosswalkNodes);

// spawn on foot at the saved position (clamped to the map), else at the default spot
const SPAWN = { x: 9, z: 20 };
const saved = loadPosition();
const spawn = saved
  ? { x: clamp(saved.x, grid.bounds.minX - 25, grid.bounds.maxX + 25), z: clamp(saved.z, grid.bounds.minZ - 25, grid.bounds.maxZ + 25) }
  : SPAWN;
const player = new Player('player', spawn, materials, events);
if (saved) { player.body.heading = saved.heading; dayNight.timeOfDay = saved.hour; }
scene.add(player.object3D);
physics.addBody(player.body);

const wanted = new WantedSystem(events);
const missions = new MissionSystem(buildMissions(grid, data, world.lots), {
  persist: saveMissionData,
  bus: events,
  raiseWanted: (stars) => wanted.raiseTo(stars),
});
missions.restore(loadMissionData());
const missionMarkers = new MissionMarkerView();
scene.add(missionMarkers.group);
const lights = new TrafficLights(grid); // clocked by TrafficSystem only; main just mirrors it onto the signal meshes
const traffic = new TrafficSystem(grid, physics, events, rng.fork('traffic'), scene, materials, makeVehicle, makePed, lights, world.lots);
const cops = new CopSystem(grid, physics, events, rng.fork('cops'), scene, makeVehicle, wanted, { lights, patrolCount: 2 });
const audio = new AudioSystem(events);

events.on('enterVehicle', () => { physics.removeBody(player.body.id); if (player.vehicle) nightLights.attachHeadlights(player.vehicle.object3D, player.vehicle.spec.length); });
events.on('exitVehicle', () => { physics.addBody(player.body); nightLights.attachHeadlights(null); });

loading.done('entities');

// ---- ui
const overlay = document.createElement('div');
overlay.id = 'overlay';
app.appendChild(overlay);
const hud = new Hud(overlay);
const missionHud = new MissionHud(overlay);
const minimap = new Minimap(overlay, grid);

const input = new Input(renderer.domElement);
const cam = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
const pipeline = new RenderPipeline(renderer, scene, cam.camera, { quality });
if (useProxies) proxies.attachToPipeline(pipeline);
pipeline.setNight(dayNight.isNight);
pipeline.setExposure(LIGHTING.exposure);
setLampsLit(world.furnitureGroup, dayNight.isNight);
input.onFirstGesture = () => { hud.hideSplash(); events.emit('userGesture', {}); };
overlay.addEventListener('mousedown', () => input.notifyGesture());
overlay.addEventListener('pointerdown', () => input.notifyGesture());
if (isTouch) new TouchControls(overlay, input);

// ---- quality switching (debug hook and the automatic drop share this path)
function applyQuality(q: Quality): void {
  quality = q;
  renderer.setPixelRatio(pixelRatioFor(q));
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setQuality(q);
  if (useProxies) proxies.attachToPipeline(pipeline);
  pipeline.setSize(window.innerWidth, window.innerHeight);
  setupShadows(renderer, dayNight.sun, q);
}
// Explicit ?q= (review scripts, bug reports) or ?perf=0 keeps the requested quality for the whole session.
const perf = new PerfMonitor({
  getQuality: () => quality,
  setQuality: applyQuality,
  autoDrop: !params.has('q') && params.get('perf') !== '0',
});

// ---- loop
const vehicleScratch: IVehicle[] = [];
/** Traffic + cop cars in one reusable array (valid until the next call). */
const allVehicles = (): IVehicle[] => {
  vehicleScratch.length = 0;
  for (const v of traffic.vehicles) vehicleScratch.push(v);
  for (const v of cops.cops) vehicleScratch.push(v);
  return vehicleScratch;
};
const entityById = new Map<string, Entity>();
let fps = 60, frames = 0, fpsClock = 0;
let lastNight = dayNight.isNight;
const copPositions: Vec2[] = [];

// render interpolation: poses are snapshotted at the start of every fixed step and blended by alpha at draw time
const poses = new PoseSnapshots();
const blended: BlendedPose = { x: 0, z: 0, h: 0 };
const camTarget: Vec2 = { x: 0, z: 0 };
let camHeading = 0;
const sunDir = dayNight.sunDirection; // true astronomical sun (the shadow light is mirrored/lifted at night)
const focusPoint = new THREE.Vector3();
const camCtx: { world: typeof physics; vehicle: IVehicle | null } = { world: physics, vehicle: null };
const doorScratch: Vec2 = { x: 0, z: 0 };
const nearDoor = (v: IVehicle, p: Vec2): boolean => {
  const d = (v as { doorPosInto?: (out: Vec2) => Vec2 }).doorPosInto?.(doorScratch) ?? v.doorPos();
  return dist(d, p) <= ENTER_RANGE;
};
const savedPose: SavedPosition = { x: 0, z: 0, heading: 0, hour: 0 };
const currentPose = (): SavedPosition => {
  const b = player.vehicle ? player.vehicle.body : player.body;
  savedPose.x = b.pos.x; savedPose.z = b.pos.z; savedPose.heading = b.heading; savedPose.hour = dayNight.timeOfDay;
  return savedPose;
};
let saveTick = 0;

let freeCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
function updateCamera(dt = 1 / 60): void {
  if (freeCam) { cam.camera.position.copy(freeCam.pos); cam.camera.lookAt(freeCam.look); }
  else {
    camCtx.vehicle = player.vehicle;
    cam.update(dt, camTarget, camHeading, player.inVehicle ? 'vehicle' : 'foot', input, camCtx);
    // consumed here: otherwise frames that run no fixed step (display > 60 Hz) would re-apply the same mouse delta
    input.mouseDX = 0; input.mouseDY = 0;
  }
}
/** Writes the interpolated pose of an entity to its object (x, z, yaw only; physics bodies are untouched). */
function placeInterpolated(e: Entity, alpha: number): BlendedPose {
  poses.blend(e.body, alpha, blended);
  const o = e.object3D;
  o.position.x = blended.x; o.position.z = blended.z; o.rotation.y = -blended.h;
  return blended;
}
function interpolateAll(alpha: number, refX: number, refY: number, refZ: number): void {
  const veh = player.vehicle;
  carLod.setView(cam.camera);
  carLod.beginFrame();
  proxies.beginFrame();
  for (const v of traffic.vehicles) {
    const b = placeInterpolated(v, alpha);
    if (v === veh) { carLod.release(v); v.object3D.visible = true; proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h); continue; }
    if (culler.applyTo(v.object3D, b.x, b.z, refX, refZ, v.spec.length)) continue;
    const dy = refY - 0.8, dx = b.x - refX, dz = b.z - refZ;
    carLod.place(v, b.x, b.z, b.h, Math.sqrt(dx * dx + dy * dy + dz * dz));
    proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h);
  }
  carLod.endFrame();
  for (const v of cops.cops) { const b = placeInterpolated(v, alpha); proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h); }
  for (const p of traffic.peds) { const b = placeInterpolated(p, alpha); if (!culler.applyTo(p.object3D, b.x, b.z, refX, refZ, 1)) proxies.addPed(b.x, b.z); }
  if (veh) {
    const b = poses.blend(veh.body, alpha, blended);
    camTarget.x = b.x; camTarget.z = b.z; camHeading = b.h;
    player.object3D.position.x = b.x; player.object3D.position.z = b.z;
  } else {
    const b = placeInterpolated(player, alpha);
    camTarget.x = b.x; camTarget.z = b.z; camHeading = b.h;
    proxies.addPed(b.x, b.z);
  }
  proxies.endFrame();
}

const PROMPT_KEY = isTouch ? 'CAR' : 'F';
const PROMPT_EXIT = `${PROMPT_KEY}  Exit car`;
const PROMPT_ENTER = `${PROMPT_KEY}  Enter car`;
let slowTick = 0;
let streetName = '';
let prompt = '';
const hudState: HudState = { stars: 0, speedKmh: 0, inVehicle: false, radioStation: '', prompt: '', timeOfDay: 0, streetName: '', fps: 60 };
const passes = new PassCounter();
passes.attach(renderer);
const stats: Record<string, number> = { drawCalls: 0, drawCallsShadow: 0, drawCallsScene: 0, drawCallsGBuffer: 0, drawCallsPost: 0, triangles: 0, fps: 60, fps1pctLow: 0, heapMBPerMin: 0, culledObjects: 0, carsFar: 0, vehicles: 0, peds: 0, cops: 0, meshes: world.stats.meshes, colliders: world.stats.colliders };
window.__gtaStats = stats;

/** Draws one frame (interpolation, camera, culling, shadow box, post chain). Also used by `__gtaDebug.renderOnce`. */
function drawFrame(alpha: number, frameDt: number): void {
    // reference for distance culling: the camera, so free-cam review shots are unaffected
    interpolateAll(alpha, cam.camera.position.x, cam.camera.position.y, cam.camera.position.z);
    updateCamera(frameDt);
    updateSignalMeshes(world.signalsGroup, lights);
    culler.update(cam.camera.position.x, cam.camera.position.z);
    updateShadowCamera(dayNight.sun, camTarget);
    sky.update(dayNight.timeOfDay, sunDir, dayNight.isNight, cam.camera.position);
    sunFlare.update(sunDir, dayNight.isNight ? 0 : 1, cam.camera.position);
    pipeline.setHour(dayNight.timeOfDay);
    focusPoint.set(camTarget.x, 1.2, camTarget.z);
    pipeline.setFocus(cam.camera.position.distanceTo(focusPoint));
    renderer.info.reset();
    passes.gbufferIndex = quality === 'low' ? -1 : 1;
    passes.beginFrame();
    pipeline.render();
}

const game = new Game(
  (alpha, frameDt) => {
    const pos = player.body.pos;
    drawFrame(alpha, frameDt);
    frames++; fpsClock += frameDt;
    if (fpsClock >= 0.5) { fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
    perf.frame(frameDt);
    const nowPad = performance.now(); // gamepad polling runs while paused too (Start / menu navigation)
    gamepad.inVehicle = player.inVehicle; gamepad.update(Math.min(0.1, (nowPad - lastPad) / 1000)); lastPad = nowPad;

    // street name and the enter/exit prompt change slowly: refresh ~15 times per second
    if (slowTick++ % 4 === 0) {
      streetName = grid.nearestStreet(pos).signName;
      prompt = '';
      if (player.inVehicle) prompt = PROMPT_EXIT;
      else { for (const v of allVehicles()) if (nearDoor(v, pos)) { prompt = PROMPT_ENTER; break; } }
    }
    hudState.stars = wanted.stars;
    hudState.speedKmh = player.vehicle ? Math.abs(player.vehicle.speed) * 3.6 : 0;
    hudState.inVehicle = player.inVehicle;
    hudState.radioStation = audio.stationName;
    hudState.prompt = prompt;
    hudState.timeOfDay = dayNight.timeOfDay;
    hudState.streetName = streetName;
    hudState.fps = fps;
    hud.update(hudState);
    missionHud.update(missions.hud, frameDt);
    missionMarkers.sync(missions.markers, missions.markersVersion); missionMarkers.update(performance.now() / 1000);
    copPositions.length = 0;
    for (const c of cops.cops) copPositions.push(c.body.pos);
    minimap.update(camTarget, camHeading, copPositions, frameDt, missions.markers);

    stats.drawCalls = renderer.info.render.calls;
    stats.drawCallsShadow = passes.shadow; stats.drawCallsScene = passes.scene; stats.drawCallsGBuffer = passes.gbuffer; stats.drawCallsPost = passes.post;
    stats.triangles = renderer.info.render.triangles;
    stats.fps = fps;
    stats.fps1pctLow = Math.round(perf.fps1pctLow * 10) / 10;
    stats.heapMBPerMin = Math.round(perf.heapMBPerMin * 10) / 10;
    stats.culledObjects = culler.hiddenCount; stats.carsFar = carLod.farCount;
    stats.vehicles = traffic.vehicles.length; stats.peds = traffic.peds.length; stats.cops = cops.cops.length;
  },
  () => input.endFrame(),
);

// pause menu, gamepad, settings (Menu fires its persisted-setting callbacks once at construction)
let lastPad = performance.now();
const gamepad = new GamepadInput(input, { onToast: (m) => hud.showToast(m), onStart: () => menu.toggle(), onNav: (d) => menu.navigate(d) });
const menu = new Menu(overlay, {
  onPause: (p) => { game.paused = p || document.hidden; gamepad.paused = p; audio.setPaused(p); if (!p) { input.endFrame(); input.requestLock(); } },
  onQuality: (q) => applyQuality(q),
  onMasterVolume: (v) => audio.setMasterVolume(v),
  onRadioVolume: (v) => audio.setRadioVolume(v),
  onInvertLookY: (b) => { input.invertLookY = b; },
  onReset: () => { clearMissionData(); const b = player.vehicle ? player.vehicle.body : player.body; b.pos.x = SPAWN.x; b.pos.z = SPAWN.z; b.vel.x = 0; b.vel.z = 0; },
}, { touch: isTouch, initialQuality: quality, ignoreSavedQuality: params.has('q') });
input.onModeChange = (m) => { hud.setInputMode(m); menu.setInputMode(m); };
hud.setInputMode(input.mode); menu.setInputMode(input.mode);
watchPagehide(currentPose);

// 1) first system: snapshot every dynamic body's pose before the step moves it (render lerps prev -> current)
game.add({
  update() {
    poses.beginCapture();
    for (const v of traffic.vehicles) poses.capture(v.body);
    for (const v of cops.cops) poses.capture(v.body);
    for (const p of traffic.peds) poses.capture(p.body);
    poses.capture(player.body);
    poses.endCapture();
  },
});

// 2) the simulation
game.add({
  update(dt) {
    // input
    player.control(input, cam.yaw);
    if (input.pressed('KeyF')) { if (player.inVehicle) player.exit(); else player.tryEnter(allVehicles()); }

    // ai + systems
    traffic.update(dt, player.body.pos);
    cops.update(dt, player.body.pos, player.vehicle ? player.vehicle.body : player.body);
    wanted.update(dt);
    {
      const pv = player.vehicle; const mb = (pv ?? player).body;
      missions.update(dt, mb.pos, player.inVehicle, wanted.stars, pv ? Math.abs(pv.speed) : Math.hypot(mb.vel.x, mb.vel.z), dayNight.timeOfDay);
      if (input.pressed('KeyR')) missions.retry(dayNight.timeOfDay);
      if (input.pressed('KeyX')) missions.abandon();
    }

    // entities
    entityById.clear();
    for (const v of traffic.vehicles) { if (!shadowFlagged.has(v)) { shadowFlagged.add(v); if (useProxies) applyCarShadowFlags(v.object3D, proxies.hasHull(hullKey(v.spec.type))); } if (v.headlights !== lastNight) v.headlights = lastNight; v.update(dt); entityById.set(v.body.id, v); }
    for (const v of cops.cops) { if (!shadowFlagged.has(v)) { shadowFlagged.add(v); if (useProxies) applyCarShadowFlags(v.object3D, proxies.hasHull(hullKey(v.spec.type))); } if (v.headlights !== lastNight) v.headlights = lastNight; v.update(dt); entityById.set(v.body.id, v); }
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
      scene.environmentIntensity = lastNight ? LIGHTING.envIntensityNight : LIGHTING.envIntensityDay;
      for (const v of allVehicles()) v.headlights = lastNight;
    }
    nightLights.update(player.body.pos, dayNight.isNight, dt);
    audio.setEngine(player.vehicle ? Math.abs(player.vehicle.speed) : 0, player.vehicle ? Math.abs(player.lastVehicleInput.throttle) : 0, player.inVehicle);
    const pv = player.vehicle as ({ slip?: number } & IVehicle) | null;
    audio.setSlip(pv?.slip ?? 0); audio.setHandbrake(player.inVehicle && player.lastVehicleInput.handbrake);
    audio.update(dt);
    if (++saveTick >= 120) { saveTick = 0; savePosition(currentPose()); }
  },
});

// resize: the canvas is stretched by CSS while the drag is in progress; buffers are reallocated once it settles
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
const applyResize = (): void => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', () => {
  cam.setAspect(window.innerWidth / window.innerHeight);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 120);
});
applyShadowFlags(player.object3D, true, false);
packsReady.then((n) => { stats.packs = n; });
// AudioSystem pauses itself when the tab is hidden; the simulation pauses here
document.addEventListener('visibilitychange', () => { game.paused = document.hidden || menu.isOpen; });

// debug/review hooks (harmless in production)
(window as unknown as { __gtaDebug: unknown }).__gtaDebug = {
  setFreeCam(x: number, y: number, z: number, lx: number, ly: number, lz: number) { freeCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) }; },
  clearFreeCam() { freeCam = null; },
  /** Freeze/unfreeze the simulation and render loop (review scripts take deterministic A/B shots with renderOnce). */
  setPaused(p: boolean) { game.paused = p; },
  /** Stops the requestAnimationFrame loop (headless review scripts then draw frames by hand with renderOnce). */
  stopLoop() { game.stop(); },
  setHour(h: number) { dayNight.timeOfDay = h; dayNight.update(0); },
  setQuality(q: Quality) { applyQuality(q); },
  /** Renders one frame synchronously and returns the per-pass draw-call split (for perf scripts). */
  renderOnce(alpha = 1, dt = 1 / 60) {
    drawFrame(alpha, dt);
    return { total: renderer.info.render.calls, shadow: passes.shadow, scene: passes.scene, gbuffer: passes.gbuffer, post: passes.post, triangles: renderer.info.render.triangles, shadowTris: passes.shadowTris, sceneTris: passes.sceneTris, gbufferTris: passes.gbufferTris };
  },
  packsReady,
  teleport(x: number, z: number, heading?: number) { const b = player.vehicle ? player.vehicle.body : player.body; b.pos.x = x; b.pos.z = z; b.vel.x = 0; b.vel.z = 0; if (heading !== undefined) b.heading = heading; },
  /** run n fixed simulation steps synchronously (for scripted review) */
  step(n: number) { for (let i = 0; i < n; i++) { for (const sys of game.systems) sys.update(game.step); input.endFrame(); } },
  settle(n: number) {
    // review scripts call this after teleport/step without a render: align the camera target with the bodies first
    const veh = player.vehicle;
    camTarget.x = (veh ? veh.body : player.body).pos.x; camTarget.z = (veh ? veh.body : player.body).pos.z;
    camHeading = (veh ? veh.body : player.body).heading;
    for (let i = 0; i < n; i++) updateCamera();
  },
  player, cops, traffic, wanted, physics, grid, events, scene, sky, pipeline, nightLights, dayNight, renderer, materials, perf, culler, carLod, proxies,
  nearby(r: number) { const p = player.body.pos; const out: unknown[] = []; for (const b of physics.bodies()) { const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (b.shape.kind === 'circle' && d < r) out.push({ id: b.id, kind: b.kind, d: +d.toFixed(2) }); } return out; },
};

// ---- finish loading: textures (bounded wait), then GPU warm-up so the first visible frame has neither pop-in nor a compile hitch
camTarget.x = player.body.pos.x; camTarget.z = player.body.pos.z; camHeading = player.body.heading;
const packCount = await withTimeout(packsReady, 10_000, -1);
if (packCount < 0) loading.skip('textures', 'Textures are still loading; continuing without waiting.');
else loading.done('textures');
loading.begin('shaders');
await nextPaint();
updateCamera();
try {
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await withTimeout(renderer.compileAsync(scene, cam.camera), 20_000, undefined);
  else renderer.compile(scene, cam.camera);
  pipeline.render(); // builds the post-processing targets/programs once
} catch (e) { console.warn('shader warm-up failed', e); }
renderer.info.reset();
loading.done('shaders');

hud.showSplash();
void loading.hide();
window.__gtaReady = true;
game.start();
