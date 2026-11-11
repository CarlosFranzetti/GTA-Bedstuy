import * as THREE from 'three';
import { Game, PoseSnapshots, type BlendedPose } from '@/core/Game';
import { Input } from '@/core/Input';
import { Rng } from '@/core/Rng';
import { EventBus } from '@/core/Events';
import { ThirdPersonCamera } from '@/core/Camera';
import { clamp, type Vec2 } from '@/core/Math2';
import type { Entity, IVehicle, VehicleType, GraphNode, HudState } from '@/world/types';
import { loadBedstuyData } from '@/world/Grid';
import { buildWorld } from '@/world/WorldBuilder';
import { loadPeople } from '@/entities/models/pedMesh';
import { updateSignalMeshes } from '@/world/props/signals';
import { TrafficLights } from '@/game/TrafficLights';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { World2D } from '@/physics/World2D';
import { Player, ENTER_RANGE, doorDistance } from '@/entities/Player';
import { setPedDayContext } from '@/entities/models/pedBody';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { Pedestrian } from '@/entities/Pedestrian';
import { resolveCharacterSource, GltfCharacterSource } from '@/entities/models/gltf/CharacterSource';
import { resolveVehicleSources } from '@/entities/models/gltf/VehicleSource';
import { TrafficSystem } from '@/game/TrafficSystem';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { DayNight } from '@/game/DayNight';
import { Hud, type RadioHudState, type BlockedHudState } from '@/ui/Hud';
import { Minimap } from '@/ui/Minimap';
import { TouchControls } from '@/ui/TouchControls';
import { AudioSystem } from '@/audio/AudioSystem';
import { RenderPipeline } from '@/render/Pipeline';
import { BlobShadows } from '@/render/BlobShadows';
import { applyTierFog } from '@/render/QualityTier';
import { setupShadows, updateShadowCamera, applyShadowFlags, SHADOWS_ENABLED, SUN_SHADOW, type Quality } from '@/render/Shadows';
import { SkyDome } from '@/render/SkyDome';
import { NightLights } from '@/render/NightLights';
import { SunFlare } from '@/render/LensFlare';
import { setLampsLit } from '@/world/FurnitureGen';
import { loadTexturePacks } from '@/textures/packs';
import { setStorefrontHour } from '@/world/buildings/mixeduse';
import { resolveQuality, startHostedTextures } from '@/textures/hosted';
import { Weather } from '@/game/Weather';
import { LIGHTING } from '@/render/LightingConfig';
import { tierConfig, pixelRatioFor } from '@/render/QualityTier';
import { setNormalMaps, setAnisotropy } from '@/render/TierDetail';
import { setPhoneDetailHidden } from '@/render/TierGeometry';
import { Menu } from '@/ui/Menu';
import { RadioUi } from '@/ui/RadioUi';
import { GamepadInput } from '@/core/Gamepad';
import { SaveManager, SaveStore } from '@/ui/GameSave';
import { MapScreen, navPlaces, placesFromLots } from '@/ui/MapScreen';
import { getPlayerLook, setPlayerLook, randomPlayerLook, type PlayerLook as RosterLook } from '@/textures/painters/pedRoster';
import { LoadingScreen, nextPaint, withTimeout } from '@/render/Loading';
import { PerfMonitor, PassCounter } from '@/render/Perf';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { StoryDirector } from '@/game/story/StoryDirector';
import { AmbientNotices } from '@/game/story/AmbientNotices';
import { createPointerRouter } from '@/game/missions/PointerRoute';
import { buildMissions } from '@/game/missions/content';
import { MissionMarkerView } from '@/game/missions/MissionMarkerView';
import { saveMissionData, loadMissionData, clearMissionData } from '@/game/missions/MissionStore';
import { MissionHud } from '@/ui/MissionHud';
import { DistanceCuller, InstanceCuller, ChunkCuller, chunkRangeFor } from '@/render/Culling';
import { CarLod, applyCarShadowFlags } from '@/render/CarLod';
import { RenderProxies } from '@/render/AoProxy';
import { buildCarModel } from '@/entities/models/carModel';
import { applyClutterState } from '@/world/PropsGen';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS, RecordSource, bundledDropRecords, type BufferContext } from '@/game/records';
import { DjGame } from '@/game/DjGame';
import { WebDjAudio, RecordPreview } from '@/game/DjAudio';
import { DjUi } from '@/ui/DjUi';
import { ShopUi } from '@/ui/ShopUi';
import { Interiors, FadeOverlay, WebAmbient } from '@/world/interiors';
import { Phone, savePhoneData, loadPhoneData, clearPhoneData } from '@/game/Phone';
import { PhoneHud } from '@/ui/PhoneHud';
import type { MissionHudState } from '@/game/missions/types';

declare global {
  interface Window { __gtaReady?: boolean; __gtaStats?: Record<string, number>; }
}

const app = document.getElementById('app')!;

// ---- renderer / scene
const isTouch = Input.isTouchDevice();
const params = new URLSearchParams(location.search);
// A/B switches for perf measurements and bug reports: ?proxies=0 (full shadow/AO scene renders), ?lod=0 (full cars everywhere)
const proxiesAllowed = params.get('proxies') !== '0';
/** Render proxies (shadow / AO stand-ins) are only built for tiers that draw shadows or AO; the phone tier builds them on its first switch up. */
let useProxies = false;
const useCarLod = params.get('lod') !== '0';
const resolvedQuality = resolveQuality(params.get('q'), isTouch); // ?q=ultra exists only in the hosted build: 'high' + ultra textures
let quality: Quality = resolvedQuality.quality;
// the scene is drawn into the composer's targets, so the canvas MSAA only multisamples the final full-screen quad: skip it on phones
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'phone', powerPreference: 'high-performance' });
const tier0 = tierConfig(quality);
const ratioFor = (q: Quality): number => pixelRatioFor(q, window.devicePixelRatio, window.innerWidth);
renderer.setPixelRatio(ratioFor(quality));
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
const materials = new MaterialLibrary(rng.fork('materials'), undefined, { maxAnisotropy: Math.min(tier0.anisotropy, renderer.capabilities.getMaxAnisotropy()) });
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
const blobs = new BlobShadows(); // phone tier: instanced soft decals under cars and pedestrians instead of a shadow map
scene.add(blobs.group);
blobs.setEnabled(tierConfig(quality).blobShadows);
blobs.buildSunCasters(world.lots); // phone sun shadow: boxes under cars / peds + building-lot prisms (3 shadow draws), see BlobShadows.ts
scene.add(blobs.casterGroup);
blobs.wrapShadowRender(renderer);
/** Phone: the sun shadow map is fed by the blob casters only, so the world meshes (and the player model) stop casting; other tiers restore them. */
let phoneSunOn: boolean | null = null;
function syncSunCasters(q: Quality): void {
  const phoneSun = SUN_SHADOW[q] && !SHADOWS_ENABLED[q];
  if (phoneSun === phoneSunOn) return;
  phoneSunOn = phoneSun;
  blobs.setSunCasters(phoneSun);
  applyShadowFlags(world.group, !phoneSun, true);
  if (!phoneSun) for (const m of proxies.covered) m.castShadow = false; // proxied meshes stay out of the shadow pass (the proxies cast for them)
  proxies.shadowGroup.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = !phoneSun; });
  applyShadowFlags(player.object3D, !phoneSun, false);
}
setupShadows(renderer, dayNight.sun, quality);
applyShadowFlags(world.group, true, true);
// Shadow pass + AO G-buffer draw merged position-only stand-ins instead of every material mesh (see AoProxy.ts)
const proxies = new RenderProxies();
let carLodReady = false;
let instanceCuller: InstanceCuller | null = null;
function ensureProxies(): void {
  if (useProxies || !proxiesAllowed || !SHADOWS_ENABLED[quality]) return;
  useProxies = true;
  instanceCuller?.setRange(Infinity); // the proxies read the full instance matrices
  const t0 = performance.now();
  const build = proxies.addStatic([world.group], 100, 100);
  scene.add(proxies.shadowGroup);
  console.info(`[perf] render proxies: ${proxies.ao.children.length} cells, ${build.vertices} verts, ${build.triangles} tris from ${build.covered.length} meshes (${build.skipped.length} kept real) in ${Math.round(performance.now() - t0)} ms`);
  proxies.wrapShadowRender(renderer);
  if (carLodReady) registerHulls();
  shadowFlagged = new WeakSet<object>();
  instanceCuller?.setRange(tierConfig(quality).instanceDistance);
}
ensureProxies();
const sky = new SkyDome(scene, renderer, materials);
sky.starsEnabled = tier0.stars;
dayNight.attachSky(sky);
scene.environmentIntensity = dayNight.isNight ? LIGHTING.envIntensityNight : LIGHTING.envIntensityDay;
const nightLights = new NightLights(scene, world.lamps, { poolSize: LIGHTING.lampPool[quality] });
const sunFlare = new SunFlare(scene);
// wet-street / rain state: patches the ground materials in place, so it is built before the shader warm-up compile
const weather = new Weather(scene, materials, { rainStreaks: 2000 }); // streak pool; the tier sets how many are drawn
weather.setRainStreaks(tier0.rainStreaks);
weather.attach({ dayNight });
loading.done('lights');
await nextPaint();

// distance culling: prop cells (static) and, per frame, traffic cars and peds
const culler = new DistanceCuller(tier0.cullDistance);
for (const m of world.propCells) culler.addStatic(m);
const chunkCuller = new ChunkCuller(chunkRangeFor(quality)); // 2x2-block chunks hidden by distance (GRID9)
for (const m of world.chunkMeshes) chunkCuller.add(m);
// street trees, lamps, hydrants: one InstancedMesh per kind covers the whole city, so thin them by distance on the phone tier
instanceCuller = new InstanceCuller();
for (const o of world.furnitureGroup.children) if ((o as THREE.InstancedMesh).isInstancedMesh) instanceCuller.add(o as THREE.InstancedMesh);
instanceCuller.setRange(tier0.instanceDistance);

// ---- entities (optional real models: src/assets/models/README.md)
loading.begin('entities');
Vehicle.sources = await resolveVehicleSources();
await withTimeout(loadPeople(), 8_000, 0); // MakeHuman-based people (HUMAN); falls back to procedural if a glb is missing
{ const chars = await resolveCharacterSource(materials, rng.fork('characters')); if (chars instanceof GltfCharacterSource) { Pedestrian.characterSource = chars; Player.characterSource = chars; } }
let vehicleSeq = 0;
const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
  new Vehicle(`veh${vehicleSeq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, materials, events);
// far cars are drawn as instances of a per-type model (see CarLod); GLB models and cop cars always use the full model
const carLod = new CarLod(materials, {
  buildModel: (t) => (Vehicle.sources[t as VehicleType] ? null : buildCarModel(t as VehicleType, VEHICLE_SPECS[t as VehicleType], materials)),
  exclude: ['cop'],
  nearDist: useCarLod ? tier0.carNearDist : Infinity,
});
scene.add(carLod.group);
const HULL_TYPES = ['sedan', 'suv', 'boxtruck', 'cargovan', 'hatch', 'beater', 'bus'];
function registerHulls(): void {
  for (const t of HULL_TYPES) { const g = carLod.hullFor(t); if (g) proxies.addHull(t, g, true); }
  proxies.addHull('capsule', new THREE.CapsuleGeometry(0.28, 1.1, 2, 6).translate(0, 0.83, 0), false);
}
carLodReady = true;
if (useProxies) registerHulls();
const hullKey = (t: string): string => (t === 'cop' || t === 'cab' ? 'sedan' : t);
let shadowFlagged = new WeakSet<object>();
const crosswalkNodes = new Set<string>();
for (const cw of grid.crosswalks) {
  for (const p of [cw.a, cw.b]) crosswalkNodes.add(grid.nearestSidewalkNode(p).id);
}
const makePed = (id: string, node: GraphNode) =>
  new Pedestrian(id, node, grid.sidewalks, physics, materials, events, rng.fork(id), crosswalkNodes);

// spawn on foot at the saved position (clamped to the map), else at the default spot
const SPAWN = { x: 9, z: 20 };
const saves = new SaveManager(new SaveStore());
const saved = saves.bootSave();
// player look: restored from the save, else a fresh random one (new game)
{ const l = saved?.playerLook as unknown as Partial<RosterLook> | null | undefined; if (l && typeof l.group === 'string' && typeof l.variant === 'number') setPlayerLook(l as RosterLook); }
const bootLook = getPlayerLook();
const spawn = saved
  ? { x: clamp(saved.pose.x, grid.bounds.minX - 25, grid.bounds.maxX + 25), z: clamp(saved.pose.z, grid.bounds.minZ - 25, grid.bounds.maxZ + 25) }
  : SPAWN;
const player = new Player('player', spawn, materials, events);
player.blockedAt = (p, r, ignoreId) => physics.overlapsSolid(p, r, ignoreId);
if (saved) { player.body.heading = saved.pose.heading; dayNight.timeOfDay = saved.hour; }
scene.add(player.object3D);
physics.addBody(player.body);

const wanted = new WantedSystem(events);
wanted.onStarAdded = (m) => hud.showToast(m); // name the crime whenever a star is added (H8)
const drop = bundledDropRecords();
const inventory = new Inventory(PROCEDURAL_RECORDS);
const missions = new MissionSystem(buildMissions(grid, data, world.lots), {
  persist: saveMissionData,
  bus: events,
  raiseWanted: (stars) => wanted.raiseTo(stars),
  pay: (n) => { inventory.add(n); },
  spend: (n) => inventory.spend(n),
  setFlag: (f) => { inventory.setFlag(f); },
});
missions.restore(loadMissionData());
const missionMarkers = new MissionMarkerView();
scene.add(missionMarkers.group);
const lights = new TrafficLights(grid); // clocked by TrafficSystem only; main just mirrors it onto the signal meshes
const traffic = new TrafficSystem(grid, physics, events, rng.fork('traffic'), scene, materials, makeVehicle, makePed, lights, world.lots, tier0.traffic);
const cops = new CopSystem(grid, physics, events, rng.fork('cops'), scene, makeVehicle, wanted, { lights, patrolCount: tier0.traffic.cops });
const audio = new AudioSystem(events);
const phone = new Phone();
phone.restore(loadPhoneData());
phone.persist = savePhoneData;
phone.bind(missions);

// DJ audio, record source and the shop / decks UIs need the audio context, so they are built on the first interior action
// (the F press is a user gesture, so the context exists by then)
let djAudio: WebDjAudio | null = null, preview: RecordPreview | null = null, recSource: RecordSource | null = null;
let dj: DjGame | null = null, shopUi: ShopUi | null = null, djUi: DjUi | null = null;
const fade = new FadeOverlay(document.body);
const ambient = new WebAmbient(() => audio.djHost, () => recSource);
const uiOpen = (): boolean => !!(shopUi?.isOpen || djUi?.isOpen);

events.on('enterVehicle', () => { physics.removeBody(player.body.id); if (player.vehicle) nightLights.attachHeadlights(player.vehicle.object3D, player.vehicle.spec.length); });
events.on('exitVehicle', () => { physics.addBody(player.body); nightLights.attachHeadlights(null); });
player.onEnterStart = () => physics.removeBody(player.body.id); // the glide to the door crosses the car's box: no collisions while entering

loading.done('entities');

// ---- ui
const overlay = document.createElement('div');
overlay.id = 'overlay';
app.appendChild(overlay);
const hud = new Hud(overlay);
const missionHud = new MissionHud(overlay);
missionHud.setRouter(createPointerRouter(grid));
setTimeout(() => missionHud.showHomeHint(), 2500); // one-time 'your place is the green awning' toast at first spawn
const minimap = new Minimap(overlay, grid);
const map = new MapScreen(overlay, grid, { places: [...navPlaces(), ...placesFromLots(world.lots)] });

const input = new Input(renderer.domElement);
let lastOutside: Vec2 = { x: SPAWN.x, z: SPAWN.z };
function ensureAudio(): boolean {
  if (recSource) return true;
  const h = audio.djHost;
  if (!h) return false;
  recSource = new RecordSource(h.ctx as unknown as BufferContext, (def) => (def.kind === 'library' ? audio.library.getTrack(def.ref!)?.url : drop.urls.get(def.id)));
  djAudio = new WebDjAudio(h);
  preview = new RecordPreview(h);
  dj = new DjGame(djAudio, events);
  shopUi = new ShopUi(overlay, { releasePointerLock: true, 
    inventory, stock: PROCEDURAL_RECORDS, source: recSource, preview, events, dropRecords: drop.defs,
    libraryTracks: () => audio.library.serialize().pool.map((t) => ({ id: t.id, name: t.name, path: t.path })),
  });
  djUi = new DjUi(overlay, { game: dj, inventory, source: recSource, onToggle: (o) => ambient.duck(o), releasePointerLock: true });
  return true;
}
const interiors = new Interiors({
  scene, world: physics, materials, inventory, getHour: () => dayNight.timeOfDay,
  teleport: (x, z, h) => { const b = player.body; b.pos.x = x; b.pos.z = z; b.vel.x = 0; b.vel.z = 0; b.heading = h; player.prevPos.x = x; player.prevPos.z = z; },
  events, onMessage: (m) => hud.showToast(m), onFade: (a) => fade.set(a),
  onChange: (id) => { ensureAudio(); ambient.set(id); },
  onAction: (a) => {
    if (!ensureAudio()) { hud.showToast('Audio is still starting. Try again in a moment.'); return; }
    if (a.kind === 'shop' || a.kind === 'listen') shopUi!.open();
    else djUi!.open(a.venue, { minutes: missions.djRequest?.venue === a.venue ? missions.djRequest.minutes : undefined });
  },
  dancerCount: quality === 'phone' ? 12 : 16,
});
// event bridge: interiors / shop / DJ events -> missions; the power-cut twist -> club blackout
events.on('interior:entered', (e) => missions.notify({ type: 'interior:entered', id: e.id }));
events.on('interior:exited', (e) => missions.notify({ type: 'interior:exited', id: e.id }));
events.on('shop:bought', (e) => missions.notify({ type: 'shop:bought', recordId: e.recordId, shop: e.shop, price: e.price }));
events.on('dj:setFinished', (e) => missions.notify({ type: 'dj:setFinished', venue: e.venue, score: e.score, minutes: e.minutes }));
events.on('mission:twist', (e) => { if (e.id === 'aftersloth-residency') interiors.setBlackout(true); });
events.on('mission:objective', (e) => { if (e.id === 'aftersloth-residency' && e.index >= 5) interiors.setBlackout(false); });
events.on('mission:completed', (e) => { if (e.id === 'aftersloth-residency') interiors.setBlackout(false); });
events.on('mission:failed', (e) => { if (e.id === 'aftersloth-residency') interiors.setBlackout(false); });
const phoneHud = new PhoneHud(overlay, phone, { saves, canSave: () => interiors.state === 'outside' });
map.onOpen = () => { if (phoneHud.isOpen) phoneHud.toggle(); };
const missionHudScratch = {} as MissionHudState;
const cam = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
cam.attachLetterbox(overlay);
events.on('mission:started', () => cam.setLetterbox(true, 2.5));
// story ("Air Rights"): phone follow-ups, radio bulletins and ads, letterbox beats, flag-driven street notices, cargo damage
const story = new StoryDirector(missions, phone, { onBeat: (sec) => cam.setLetterbox(true, sec), onBroadcast: (b) => audio.setBroadcast(b) });
const storyNotices = new AmbientNotices(grid); scene.add(storyNotices.group);
events.on('impact', (e) => { const v = player.vehicle; if (v && (e.a === v.body.id || e.b === v.body.id)) missions.notify({ type: 'impact', strength: e.strength }); });
const pipeline = new RenderPipeline(renderer, scene, cam.camera, { quality });
if (useProxies) proxies.attachToPipeline(pipeline);
pipeline.setNight(dayNight.isNight);
pipeline.setExposure(LIGHTING.exposure);
setLampsLit(world.furnitureGroup, dayNight.isNight);
input.onFirstGesture = () => { hud.hideSplash(); events.emit('userGesture', {}); };
overlay.addEventListener('mousedown', () => input.notifyGesture());
overlay.addEventListener('pointerdown', () => input.notifyGesture());
if (isTouch) new TouchControls(overlay, input);

/** Game day counter (0 = Monday; advances when the clock wraps past midnight) for the rotating trash-bag piles. */
let gameDay = 0;
let prevHour = dayNight.timeOfDay;

// ---- quality switching (debug hook and the automatic drop share this path)
function applyQuality(q: Quality): void {
  const prev = quality;
  quality = q;
  const t = tierConfig(q);
  syncSunCasters(q);
  ensureProxies(); // first switch up from the phone tier: build the shadow / AO stand-ins before the pipeline attaches to them
  renderer.setPixelRatio(ratioFor(q));
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setQuality(q);
  if (useProxies) proxies.attachToPipeline(pipeline);
  pipeline.setSize(window.innerWidth, window.innerHeight);
  chunkCuller.setMaxDist(chunkRangeFor(q));
  setupShadows(renderer, dayNight.sun, q);
  blobs.setEnabled(t.blobShadows);
  if (q === prev) return;
  // everything below changes with the tier (see QualityTier.ts)
  culler.setMaxDist(t.cullDistance);
  instanceCuller?.setRange(t.instanceDistance);
  carLod.setNearDist(useCarLod ? t.carNearDist : Infinity);
  weather.setRainStreaks(t.rainStreaks);
  sky.starsEnabled = t.stars;
  nightLights.setPoolSize(LIGHTING.lampPool[q]);
  traffic.setDensity(t.traffic);
  cops.setPatrolCount(t.traffic.cops);
  applyDetail(t);
}
/** Material detail of a tier: normal / roughness maps and texture anisotropy (re-run after late texture loads). */
function applyDetail(t = tierConfig(quality)): void {
  setNormalMaps(scene, t.normalMaps);
  setPhoneDetailHidden(world.group, t.simpleGeometry);
  setAnisotropy(scene, Math.min(t.anisotropy, renderer.capabilities.getMaxAnisotropy()));
  applyClutterState(world.group, quality, gameDay);
}
// Explicit ?q= (review scripts, bug reports) or ?perf=0 keeps the requested quality for the whole session.
const perf = new PerfMonitor({
  getQuality: () => quality,
  setQuality: applyQuality,
  autoDrop: !params.has('q') && params.get('perf') !== '0',
  touch: isTouch,
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
const nearDoor = (v: IVehicle, p: Vec2): boolean => doorDistance(v, p) <= ENTER_RANGE;
let saveTick = 0;
let minimapAcc = 0;
/** seconds between minimap redraws (phone: 30 Hz; 0 = every frame) */
const minimapPeriod = (): number => { const hz = tierConfig(quality).minimapHz; return hz > 0 ? 1 / hz - 0.004 : 0; };

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
  const pedRange = tierConfig(quality).pedDistance;
  const veh = player.vehicle;
  carLod.setView(cam.camera);
  carLod.beginFrame();
  proxies.beginFrame();
  blobs.beginFrame();
  for (const v of traffic.vehicles) {
    const b = placeInterpolated(v, alpha);
    if (v === veh) { carLod.release(v); v.object3D.visible = true; proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h); blobs.addCar(b.x, b.z, b.h, v.spec.length, v.spec.width); continue; }
    if (culler.applyTo(v.object3D, b.x, b.z, refX, refZ, v.spec.length)) continue;
    const dy = refY - 0.8, dx = b.x - refX, dz = b.z - refZ;
    carLod.place(v, b.x, b.z, b.h, Math.sqrt(dx * dx + dy * dy + dz * dz));
    proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h);
    blobs.addCar(b.x, b.z, b.h, v.spec.length, v.spec.width);
  }
  carLod.endFrame();
  for (const v of cops.cops) { const b = placeInterpolated(v, alpha); proxies.addCar(hullKey(v.spec.type), b.x, b.z, b.h); blobs.addCar(b.x, b.z, b.h, v.spec.length, v.spec.width); }
  for (const p of traffic.peds) { const b = placeInterpolated(p, alpha); if (!culler.applyTo(p.object3D, b.x, b.z, refX, refZ, 1, pedRange)) { proxies.addPed(b.x, b.z); blobs.addPed(b.x, b.z); } }
  if (veh) {
    const b = poses.blend(veh.body, alpha, blended);
    camTarget.x = b.x; camTarget.z = b.z; camHeading = b.h;
    player.object3D.position.x = b.x; player.object3D.position.z = b.z;
  } else {
    const b = placeInterpolated(player, alpha);
    camTarget.x = b.x; camTarget.z = b.z; camHeading = b.h;
    proxies.addPed(b.x, b.z);
    blobs.addPed(b.x, b.z);
  }
  proxies.endFrame();
  blobs.endFrame();
}

const PROMPT_KEY = isTouch ? 'CAR' : 'F';
const PROMPT_EXIT = `${PROMPT_KEY}  Exit car`;
const PROMPT_ENTER = `${PROMPT_KEY}  Enter car`;
let slowTick = 0;
let streetName = '';
let prompt = '';
const hudState: HudState & RadioHudState & BlockedHudState = { stars: 0, speedKmh: 0, inVehicle: false, radioStation: '', prompt: '', timeOfDay: 0, streetName: '', fps: 60 };
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
    weather.update(frameDt, cam.camera.position);
    pipeline.setWeather(weather.wetness, weather.rain);
    culler.update(cam.camera.position.x, cam.camera.position.z);
    chunkCuller.update(cam.camera.position.x, cam.camera.position.z, cam.camera.position.y); // range grows with camera height so aerials see every chunk
    instanceCuller?.update(cam.camera.position.x, cam.camera.position.z);
    updateShadowCamera(dayNight.sun, camTarget);
    sky.update(dayNight.timeOfDay, sunDir, dayNight.isNight, cam.camera.position);
    applyTierFog(scene.fog as THREE.Fog | null, quality); // phone: nearer, denser ramp (DayNight rewrites near/far and sets the colour to the sky horizon every step)
    blobs.setStrength((dayNight.isNight ? 0 : Math.min(1, sunDir.y * 2.5)) * (1 - weather.overcast));
    sunFlare.suppress = cam.flareSuppress; // no flare when the camera sits inside another car while reversing
    sunFlare.update(sunDir, (dayNight.isNight ? 0 : 1) * (1 - weather.overcast), cam.camera.position);
    pipeline.setHour(dayNight.timeOfDay);
    focusPoint.set(camTarget.x, 1.2, camTarget.z);
    pipeline.setFocus(cam.camera.position.distanceTo(focusPoint));
    renderer.info.reset();
    passes.gbufferIndex = quality === 'low' || quality === 'phone' ? -1 : 1;
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
      if (!player.inVehicle) { const ip = interiors.prompt(pos); if (ip) prompt = isTouch ? ip.replace(/^F  /, `${PROMPT_KEY}  `) : ip; }
    }
    hudState.stars = wanted.stars;
    hudState.speedKmh = player.vehicle ? Math.hypot(player.vehicle.body.vel.x, player.vehicle.body.vel.z) * 3.6 : 0;
    hudState.blockedSeconds = (player.vehicle as { blockedSeconds?: number } | null)?.blockedSeconds ?? 0;
    hudState.inVehicle = player.inVehicle;
    hudState.radioStation = audio.stationName;
    hudState.radioTrack = audio.trackName;
    audio.setBroadcast({ weather: weather.state, rain: weather.rain, street: hudState.streetName });
    hudState.talkProgress = audio.talkProgress;
    hudState.prompt = uiOpen() || interiors.locked ? '' : prompt;
    hudState.timeOfDay = dayNight.timeOfDay;
    hudState.streetName = streetName;
    hudState.fps = fps;
    hud.update(hudState);
    Object.assign(missionHudScratch, missions.hud); missionHudScratch.cash = inventory.cash; // Inventory owns the wallet
    missionHud.update(missionHudScratch, frameDt);
    missionHud.updatePointer(missions.markers, camTarget, cam.yaw);
    missionMarkers.sync(missions.markers, missions.markersVersion); missionMarkers.update(performance.now() / 1000);
    interiors.update(frameDt, dj?.roomBeat ?? null);
    phone.update(frameDt, pos, dayNight.timeOfDay);
    phoneHud.update(missions.hud.prompt, pos, camHeading);
    map.update(camTarget, camHeading, missions.markers, frameDt);
    copPositions.length = 0;
    for (const c of cops.cops) copPositions.push(c.body.pos);
    minimapAcc += frameDt;
    if (minimapAcc >= minimapPeriod()) { if (!interiors.inside) minimap.update(camTarget, camHeading, copPositions, minimapAcc, missions.markers); minimapAcc = 0; }

    stats.drawCalls = renderer.info.render.calls;
    stats.drawCallsShadow = passes.shadow; stats.drawCallsScene = passes.scene; stats.drawCallsGBuffer = passes.gbuffer; stats.drawCallsPost = passes.post;
    stats.triangles = renderer.info.render.triangles;
    stats.fps = fps;
    pipeline.setMeasuredFps(fps);
    stats.fps1pctLow = Math.round(perf.fps1pctLow * 10) / 10;
    stats.heapMBPerMin = Math.round(perf.heapMBPerMin * 10) / 10;
    stats.culledObjects = culler.hiddenCount; stats.carsFar = carLod.farCount;
    stats.vehicles = traffic.vehicles.length; stats.peds = traffic.peds.length; stats.cops = cops.cops.length;
  },
  () => input.endFrame(),
);

// pause menu, gamepad, settings (Menu fires its persisted-setting callbacks once at construction)
let lastPad = performance.now();
const gamepad = new GamepadInput(input, { onToast: (m) => hud.showToast(m), onStart: () => { if (shopUi?.isOpen) shopUi.close(); else if (djUi?.isOpen) djUi.leave(); else menu.toggle(); }, onNav: (d) => { if (phoneHud.isOpen) phoneHud.navigate(d); else if (shopUi?.isOpen) shopUi.navigate(d); else if (djUi?.isOpen) djUi.navigate(d); else menu.navigate(d); } });
const radioUi = new RadioUi(overlay, audio);
const menu = new Menu(overlay, {
  onPause: (p) => { game.paused = p || document.hidden; gamepad.paused = p; audio.setPaused(p); if (!p) { input.endFrame(); input.requestLock(); } },
  onQuality: (q) => applyQuality(q),
  onMasterVolume: (v) => audio.setMasterVolume(v),
  onRadioVolume: (v) => audio.setRadioVolume(v),
  onRadioLibrary: () => radioUi.open(),
  onInvertLookY: (b) => { input.invertLookY = b; },
  onReset: () => { clearMissionData(); missions.story.reset(); inventory.reset(PROCEDURAL_RECORDS); clearPhoneData(); phone.messages.length = 0; phone.version++; if (interiors.inside) interiors.exit(); const b = player.vehicle ? player.vehicle.body : player.body; b.pos.x = SPAWN.x; b.pos.z = SPAWN.z; b.vel.x = 0; b.vel.z = 0; },
}, { touch: isTouch, initialQuality: quality, ignoreSavedQuality: params.has('q'), saves, canSave: () => interiors.state === 'outside' });
input.onModeChange = (m) => { hud.setInputMode(m); menu.setInputMode(m); };
hud.setInputMode(input.mode); menu.setInputMode(input.mode);
let pendingLook: RosterLook | null = null;
saves.bind({
  getPose: () => { const b = player.vehicle ? player.vehicle.body : player.body; return { x: b.pos.x, z: b.pos.z, heading: b.heading, inCar: player.inVehicle, vehicleType: player.vehicle?.spec.type }; },
  setPose: (p) => { if (interiors.inside) interiors.exit(); if (player.inVehicle) player.exit(); const b = player.body; b.pos.x = p.x; b.pos.z = p.z; b.vel.x = 0; b.vel.z = 0; b.heading = p.heading; player.prevPos.x = p.x; player.prevPos.z = p.z; lastOutside.x = p.x; lastOutside.z = p.z; if (p.inCar) player.tryEnter(allVehicles()); },
  getHour: () => dayNight.timeOfDay, setHour: (h) => { dayNight.timeOfDay = h; prevHour = h; dayNight.update(0); },
  getDay: () => gameDay, setDay: (d) => { gameDay = d; applyClutterState(world.group, quality, gameDay); },
  inventory, missions, phone,
  getWanted: () => wanted.stars, setWanted: (n) => { wanted.stars = n; events.emit('wantedChanged', { stars: n }); },
  getWeather: () => weather.state, setWeather: (w) => weather.setState(w as 'dry' | 'rain' | 'wet' | 'drying', true),
  getStation: () => audio.stationName, setStation: (st) => { for (let i = 0; i < 12 && audio.stationName !== st; i++) audio.nextStation(); },
  getLook: () => ({ seed: 0, ...(pendingLook ?? bootLook) }),
  setLook: (l) => { const r = l as unknown as Partial<RosterLook> | null; if (r && typeof r.group === 'string' && typeof r.variant === 'number' && (r.group !== bootLook.group || r.variant !== bootLook.variant)) pendingLook = r as RosterLook; },
  getStreet: () => streetName,
}, {
  newGame: () => {
    clearMissionData(); missions.story.reset(); inventory.reset(PROCEDURAL_RECORDS); clearPhoneData(); phone.messages.length = 0; phone.version++;
    if (interiors.inside) interiors.exit(); if (player.inVehicle) player.exit();
    const b = player.body; b.pos.x = SPAWN.x; b.pos.z = SPAWN.z; b.vel.x = 0; b.vel.z = 0;
    dayNight.timeOfDay = 8; prevHour = 8; gameDay = 0; weather.setState('dry', true); wanted.stars = 0;
    pendingLook = randomPlayerLook(`${Math.random()}:${Date.now()}`);
  },
  // the player model is built once at boot, so a different look (new game, or a save with another look) is applied by autosaving and reloading
  afterApply: () => { input.endFrame(); story.resync(); if (pendingLook) { saves.autosave(Date.now(), true, true); location.reload(); } },
});
window.addEventListener('pagehide', () => saves.autosave(Date.now(), interiors.state === 'outside', true));

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
    const away = interiors.state !== 'outside'; // inside a room (3 km off the map) or fading: the street sim keeps watching the door
    const blocked = interiors.locked || uiOpen();
    if (!away) { lastOutside.x = player.body.pos.x; lastOutside.z = player.body.pos.z; }
    if (blocked) { for (const k of ['KeyF', 'KeyE', 'KeyR', 'KeyX', 'KeyP']) input.consume(k); }
    else {
      player.control(input, cam.yaw);
      if (input.consume('KeyP') && !map.isOpen) phoneHud.toggle();
      if (input.consume('KeyF')) {
        const fpos = player.body.pos;
        if (!player.inVehicle && interiors.interact(fpos)) { /* door / shop / decks / bar handled */ }
        else if (missions.interact(fpos)) { /* mission talk / knock / crank handled */ }
        else if (player.inVehicle) player.exit();
        else if (!away) player.tryEnter(allVehicles());
      }
    }

    // ai + systems
    traffic.update(dt, away ? lastOutside : player.body.pos);
    cops.update(dt, away ? lastOutside : player.body.pos, player.vehicle ? player.vehicle.body : player.body);
    wanted.update(dt);
    {
      const pv = player.vehicle; const mb = (pv ?? player).body;
      missions.update(uiOpen() ? 0 : dt, mb.pos, player.inVehicle, wanted.stars, pv ? Math.abs(pv.speed) : Math.hypot(mb.vel.x, mb.vel.z), dayNight.timeOfDay, pv?.spec.type ?? '');
      storyNotices.sync(missions.story);
      if (input.consume('KeyR')) missions.retry(dayNight.timeOfDay);
      if (input.consume('KeyX')) missions.abandon();
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
    if (!away) { pb.pos.x = clamp(pb.pos.x, b.minX - m, b.maxX + m); pb.pos.z = clamp(pb.pos.z, b.minZ - m, b.maxZ + m); }

    // environment + audio
    if (interiors.state !== 'inside') dayNight.update(dt); // the clock stops while the player is in a room, so a DJ set cannot run the club past closing
    if (dayNight.timeOfDay < prevHour - 12) { gameDay++; applyClutterState(world.group, quality, gameDay); }
    setPedDayContext(dayNight.timeOfDay, gameDay % 7 === 6); // Sunday-only church clothes
    prevHour = dayNight.timeOfDay;
    setStorefrontHour(dayNight.timeOfDay);
    traffic.setHour(dayNight.timeOfDay);
    audio.sc?.setGameHour(dayNight.timeOfDay);
    if (dayNight.isNight !== lastNight) {
      lastNight = dayNight.isNight; audio.setNight(lastNight); pipeline.setNight(lastNight); setLampsLit(world.furnitureGroup, lastNight);
      scene.environmentIntensity = lastNight ? LIGHTING.envIntensityNight : LIGHTING.envIntensityDay;
      for (const v of allVehicles()) v.headlights = lastNight;
    }
    nightLights.update(away ? lastOutside : player.body.pos, dayNight.isNight, dt);
    audio.setEngine(player.vehicle ? Math.abs(player.vehicle.speed) : 0, player.vehicle ? Math.abs(player.lastVehicleInput.throttle) : 0, player.inVehicle);
    const pv = player.vehicle as ({ slip?: number } & IVehicle) | null;
    audio.setSlip(pv?.slip ?? 0); audio.setHandbrake(player.inVehicle && player.lastVehicleInput.handbrake);
    audio.update(dt);
    if (++saveTick >= 120 && !away) { saveTick = 0; saves.autosave(Date.now(), true); }
  },
});

// resize: the canvas is stretched by CSS while the drag is in progress; buffers are reallocated once it settles
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
const applyResize = (): void => {
  renderer.setPixelRatio(ratioFor(quality)); // the phone tier caps the buffer width, so it follows rotation
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', () => {
  cam.setAspect(window.innerWidth / window.innerHeight);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 120);
});
syncSunCasters(quality);
packsReady.then((n) => { stats.packs = n; applyDetail(); });
// AudioSystem pauses itself when the tab is hidden; the simulation pauses here
document.addEventListener('visibilitychange', () => { game.paused = document.hidden || menu.isOpen; });

// debug/review hooks (harmless in production)
(window as unknown as { __gtaDebug: unknown }).__gtaDebug = {
  setFreeCam(x: number, y: number, z: number, lx: number, ly: number, lz: number) { freeCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) }; },
  clearFreeCam() { freeCam = null; },
  cam, saves, map, audio,
  /** Freeze/unfreeze the simulation and render loop (review scripts take deterministic A/B shots with renderOnce). */
  setPaused(p: boolean) { game.paused = p; },
  /** Stops the requestAnimationFrame loop (headless review scripts then draw frames by hand with renderOnce). */
  stopLoop() { game.stop(); },
  setHour(h: number) { dayNight.timeOfDay = h; prevHour = h; dayNight.update(0); setStorefrontHour(h); traffic.setHour(h, true); },
  setQuality(q: Quality) { applyQuality(q); },
  setWeather(s: 'dry' | 'rain' | 'wet' | 'drying', snap = false) { weather.setState(s, snap); },
  /** Renders one frame synchronously and returns the per-pass draw-call split (for perf scripts). */
  renderOnce(alpha = 1, dt = 1 / 60) {
    drawFrame(alpha, dt);
    return { total: renderer.info.render.calls, shadow: passes.shadow, scene: passes.scene, gbuffer: passes.gbuffer, post: passes.post, triangles: renderer.info.render.triangles, shadowTris: passes.shadowTris, sceneTris: passes.sceneTris, gbufferTris: passes.gbufferTris };
  },
  packsReady,
  get hostedTextures() { return hostedTextures.done; },
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
  interiors, inventory, phone, get dj() { return dj; }, get shopUi() { return shopUi; }, get djUi() { return djUi; }, ensureAudio, missions,
  player, cops, traffic, wanted, physics, grid, events, scene, sky, pipeline, blobs, nightLights, dayNight, renderer, materials, perf, culler, carLod, proxies, weather,
  nearby(r: number) { const p = player.body.pos; const out: unknown[] = []; for (const b of physics.bodies()) { const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (b.shape.kind === 'circle' && d < r) out.push({ id: b.id, kind: b.kind, d: +d.toFixed(2) }); } return out; },
};

// ---- finish loading: textures (bounded wait), then GPU warm-up so the first visible frame has neither pop-in nor a compile hitch
camTarget.x = player.body.pos.x; camTarget.z = player.body.pos.z; camHeading = player.body.heading;
const packCount = await withTimeout(packsReady, 10_000, -1);
if (packCount < 0) loading.skip('textures', 'Textures are still loading; continuing without waiting.');
else loading.done('textures');
loading.begin('shaders');
await nextPaint();
applyDetail(); // strips normal maps / lowers anisotropy for the phone tier before the first compile
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
// hosted build only (no-op in the single-file artifact): swaps larger texture tiers in after the first paint
const hostedTextures = startHostedTextures(materials, { ultra: resolvedQuality.ultra, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
