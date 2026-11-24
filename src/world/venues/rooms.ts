/**
 * VENUES rooms: the inside of the seven places, built on first entry through the same interior system as the deli, the club
 * and home (`interiors/Interiors.ts`). Local coordinates as the other rooms: centre (0, 0), x east, z south, the door in the
 * south wall (z = +d/2). Every static piece is a box baked into ONE vertex-coloured mesh (plus the 10 planes of the shell and
 * the people), colliders are 2D boxes. Marked spots (`Spot.id`) are the hooks for missions: they emit `venue:spot`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '@/core/Rng';
import type { HumanModel } from '@/entities/models/humanModel';
import type { PedOptions } from '@/entities/models/pedBody';
import { buildPerson } from '@/entities/models/pedMesh';
import type { IMaterialLibrary, IWorld2D } from '../types';
import { basic, RoomColliders, shell } from '../interiors/parts';
import { VENUE_ROOM, venueById, type VenueId } from './venues';

export type VenueSpotKind = 'exit' | 'bar' | 'talk' | 'couch' | 'dj' | 'mark' | 'train';
export interface VenueSpot { id: string; kind: VenueSpotKind; x: number; z: number; r: number; label: string; say?: string }
export interface VenueBeat { phase: number; bpm: number; level: number; index: number; dark?: boolean }

export interface VenueRoom {
  id: VenueId;
  group: THREE.Group;
  spawn: { x: number; z: number; heading: number };
  spots: VenueSpot[];
  update(t: number, beat: VenueBeat): void;
  /** counts for the notes and tests */
  stats(): { triangles: number; draws: number; people: number };
}
export interface VenueRoomDeps { world: IWorld2D; materials: IMaterialLibrary; dancerCount?: number }

const FACE_SHADE = [0.78, 0.78, 1.0, 0.45, 0.88, 0.62];

/** boxes in room-local coordinates, baked into one geometry; `solid` also registers a collider */
class Kit {
  readonly geos: THREE.BufferGeometry[] = [];
  readonly col: RoomColliders;
  constructor(world: IWorld2D, readonly w: number, readonly d: number, tag: string, origin: { x: number; z: number }) {
    this.col = new RoomColliders(world, origin.x, origin.z, tag);
    this.col.walls(w, d);
  }
  /** a box; `solid` adds a collider; `flat` skips the baked face shade (lit things) */
  b(sx: number, sy: number, sz: number, color: string, x: number, y: number, z: number, solid = false, flat = false): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const c = new THREE.Color(color);
    const col = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = (f * 4 + k) * 3; const s = flat ? 1 : FACE_SHADE[f]; col[i] = c.r * s; col[i + 1] = c.g * s; col[i + 2] = c.b * s; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(x, y, z);
    this.geos.push(g);
    if (solid) this.col.solid(x, z, sx, sz);
  }
  mesh(): THREE.Mesh {
    const m = new THREE.Mesh(mergeGeometries(this.geos, false)!, basic({ vertexColors: true }));
    this.geos.forEach((g) => g.dispose());
    return m;
  }
}

function put(m: HumanModel, x: number, z: number, heading: number): void {
  m.group.position.set(x, 0, z); m.group.rotation.y = -heading;
}
function idle(m: HumanModel, t: number, seed: number): void {
  m.rig.position.y = Math.sin(t * 1.6 + seed) * 0.006;
  m.torso.rotation.z = Math.sin(t * 0.9 + seed) * 0.02;
  m.head.rotation.y = Math.sin(t * 0.5 + seed * 2) * 0.25;
}
function dance(m: HumanModel, phase: number, level: number, seed: number): void {
  const bob = Math.sin(phase * Math.PI * 2 + seed);
  const k = 0.18 + 0.5 * level;
  m.rig.position.y = -Math.abs(bob) * 0.06 * (0.4 + level);
  m.knees[0].rotation.x = -Math.max(0, bob) * k; m.knees[1].rotation.x = -Math.max(0, -bob) * k;
  m.arms[0].rotation.x = -(seed % 3 < 1 ? 2.2 : 0.4) * (0.4 + 0.6 * Math.max(0, bob)) * (0.5 + level);
  m.arms[1].rotation.x = -(seed % 3 < 1 ? 1.9 : 0.3) * (0.4 + 0.6 * Math.max(0, -bob)) * (0.5 + level);
  m.torso.rotation.y = Math.sin(phase * Math.PI + seed) * 0.25 * (0.5 + level);
}

const exitSpot = (d: number, label: string): VenueSpot => ({ id: 'exit', kind: 'exit', x: 0, z: d / 2 - 0.7, r: 1.3, label });
const spawnOf = (d: number) => ({ x: 0, z: d / 2 - 1.5, heading: 0 });

interface Cast { models: HumanModel[]; add(m: HumanModel, x: number, z: number, heading: number): HumanModel }
function cast(g: THREE.Group): Cast {
  const models: HumanModel[] = [];
  return {
    models,
    add(m, x, z, heading) { put(m, x, z, heading); g.add(m.group); models.push(m); return m; },
  };
}
const person = (deps: VenueRoomDeps, seed: string, opts: PedOptions = {}): HumanModel => buildPerson(deps.materials, new Rng(seed), opts);

function finish(id: VenueId, g: THREE.Group, kit: Kit, spots: VenueSpot[], people: HumanModel[], update: VenueRoom['update'] = () => undefined): VenueRoom {
  g.add(kit.mesh());
  const { d } = VENUE_ROOM[id];
  return {
    id, group: g, spawn: spawnOf(d), spots, update,
    stats() {
      let triangles = 0, draws = 0;
      g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) { draws++; const geo = m.geometry; triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3; } });
      return { triangles: Math.round(triangles), draws, people: people.length };
    },
  };
}

// ------------------------------------------------------------------ bars (three variants)

function buildBar(id: 'bar-dive' | 'bar-lounge' | 'bar-sports', deps: VenueRoomDeps): VenueRoom {
  const { w, d, h, origin } = VENUE_ROOM[id];
  const row = venueById(id);
  const pal = id === 'bar-dive' ? { floor: '#3a2b1e', wall: '#5a3f2a', ceil: '#241a12', trim: '#c8481f', counter: '#6b3f22', top: '#2a1a10' }
    : id === 'bar-lounge' ? { floor: '#1d1220', wall: '#3a1d40', ceil: '#150c18', trim: '#ff4fa0', counter: '#2b1030', top: '#c9a24a' }
      : { floor: '#2b2f33', wall: '#1d3150', ceil: '#14202f', trim: '#e63946', counter: '#3d3d40', top: '#9a9a9a' };
  const g = new THREE.Group(); g.name = `interior-${id}`;
  g.add(shell(w, d, h, pal));
  const k = new Kit(deps.world, w, d, id, origin);
  const c = cast(g);
  // the bar along the north wall, a back shelf of bottles, stools
  const bz = -d / 2 + 2.0;
  k.b(w - 4, 1.05, 0.8, pal.counter, 0.5, 0.525, bz, true);
  k.b(w - 4 + 0.1, 0.06, 0.95, pal.top, 0.5, 1.08, bz);
  k.b(w - 3, 0.1, 0.4, '#3b2a1a', 0.5, 1.5, -d / 2 + 0.3);
  const bottles = ['#2ec4b6', '#ff9f1c', '#e71d36', '#9b5de5', '#06d6a0'];
  for (let i = 0; i < 14; i++) k.b(0.1, 0.34, 0.1, bottles[i % 5], -w / 2 + 2.2 + i * ((w - 4) / 14), 1.72, -d / 2 + 0.3, false, true);
  const stools: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 5; i++) { const x = -w / 2 + 3.0 + i * 1.5; stools.push({ x, z: bz + 0.9 }); k.b(0.36, 0.7, 0.36, '#1a1a1d', x, 0.35, bz + 0.9, true); k.b(0.42, 0.08, 0.42, pal.trim, x, 0.72, bz + 0.9); }
  // tables and chairs
  for (let i = 0; i < 3; i++) { const x = -w / 2 + 2.2 + i * 2.6, z = 0.9; k.b(0.9, 0.75, 0.9, pal.counter, x, 0.375, z, true); k.b(0.4, 0.45, 0.4, '#222', x - 0.8, 0.22, z); k.b(0.4, 0.45, 0.4, '#222', x + 0.8, 0.22, z); }
  const spots: VenueSpot[] = [
    exitSpot(d, `Leave ${row.name}`),
    { id: 'stool', kind: 'bar', x: stools[2].x, z: stools[2].z, r: 1.7, label: 'Take a stool and order ($6)' },
    { id: 'bartender', kind: 'talk', x: -w / 2 + 2.0, z: bz + 0.9, r: 1.4, label: 'Talk to the bartender', say: `Bartender: "First one is on the house if you tell me something I do not know."` },
    { id: 'table', kind: 'couch', x: -w / 2 + 4.8, z: 1.9, r: 1.6, label: 'Sit at a table', say: 'You take a table. The wood is sticky and honest.' },
  ];
  if (id === 'bar-dive') {
    k.b(1.0, 1.8, 0.5, '#2a3a52', w / 2 - 0.5, 0.9, -1.2, true); k.b(0.7, 0.5, 0.05, '#ffcf86', w / 2 - 0.5, 1.4, -0.93, false, true); // jukebox
    k.b(2.6, 0.8, 1.4, '#1f5a3a', w / 2 - 2.2, 0.4, 2.0, true); // pool table
    spots.push({ id: 'jukebox', kind: 'mark', x: w / 2 - 1.6, z: -1.2, r: 1.5, label: 'Play the jukebox', say: 'You feed it a dollar. It plays the same decade it always plays.' });
  } else if (id === 'bar-lounge') {
    for (let i = 0; i < 2; i++) { k.b(0.9, 0.55, 2.2, '#5a1f3a', -w / 2 + 0.7, 0.275, -0.2 + i * 2.6, true); k.b(0.2, 0.5, 2.2, '#4a1830', -w / 2 + 0.3, 0.8, -0.2 + i * 2.6); }
    for (let i = 0; i < 8; i++) k.b(0.06, 0.1, 0.06, '#ffd98a', -w / 2 + 3 + i * 0.9, 0.84, 0.9, false, true); // candles
    spots.push({ id: 'booth', kind: 'couch', x: -w / 2 + 1.5, z: 1.1, r: 1.7, label: 'Slide into the booth', say: 'The booth is the kind where people lean in to be heard. Or to be close.' });
  } else {
    for (let i = 0; i < 3; i++) k.b(2.2, 1.2, 0.08, '#8ad1ff', -3 + i * 3.2, 2.3, -d / 2 + 0.06, false, true); // three screens
    k.b(0.7, 1.2, 0.5, '#4a4a4f', w / 2 - 0.6, 0.6, 1.5, true); // dart board cabinet
    spots.push({ id: 'screens', kind: 'mark', x: 0.5, z: -d / 2 + 3.4, r: 2.4, label: 'Watch the game', say: 'Three screens, three different games, and everyone sure their team is winning.' });
  }
  // a back room behind the east wall door
  k.b(1.0, 2.1, 0.12, '#2a1d14', w / 2 - 0.08, 1.05, d / 2 - 2.4);
  spots.push({ id: 'backroom', kind: 'mark', x: w / 2 - 1.2, z: d / 2 - 2.4, r: 1.5, label: 'Back room', say: 'A back room with a card table and a lamp that has opinions about who sits where.' });
  const bt = c.add(person(deps, `${id}-bartender`, { variant: 'ba-durag' }), -w / 2 + 2.0, bz - 0.2, 0);
  const patrons = [c.add(person(deps, `${id}-p1`), stools[0].x, stools[0].z + 0.5, Math.PI), c.add(person(deps, `${id}-p2`), stools[4].x, stools[4].z + 0.5, Math.PI)];
  return finish(id, g, k, spots, c.models, (t) => { idle(bt, t, 3); patrons.forEach((p, i) => idle(p, t, 5 + i)); });
}

// ------------------------------------------------------------------ after-hours

function buildAfterhours(deps: VenueRoomDeps): VenueRoom {
  const id: VenueId = 'afterhours';
  const { w, d, h, origin } = VENUE_ROOM[id];
  const g = new THREE.Group(); g.name = `interior-${id}`;
  g.add(shell(w, d, h, { floor: '#4b4a47', wall: '#6e6b66', ceil: '#2a2a2c', trim: '#ff8a00' }));
  const k = new Kit(deps.world, w, d, id, origin);
  const c = cast(g);
  for (let i = 0; i < 6; i++) k.b(0.14, 0.14, 0.14, '#ffe9a0', -w / 2 + 1.5 + i * 1.9, h - 0.6, -1.5 + (i % 2) * 2.4, false, true); // bare bulbs
  k.b(0.9, 0.95, 5.0, '#7a5a3a', w / 2 - 0.7, 0.475, 0.5, true); // a plank bar on the east wall
  k.b(0.1, 0.12, 0.1, '#e8e8e8', w / 2 - 0.7, 1.05, 0.5, false, true);
  k.b(3.2, 0.9, 0.9, '#232326', 0, 0.45, -d / 2 + 1.0, true); // a table of decks and a mixer
  k.b(0.9, 0.05, 0.6, '#cfcfcf', -0.9, 0.93, -d / 2 + 1.0); k.b(0.9, 0.05, 0.6, '#cfcfcf', 0.9, 0.93, -d / 2 + 1.0); k.b(0.5, 0.08, 0.5, '#101018', 0, 0.95, -d / 2 + 1.0);
  for (const s of [-1, 1]) k.b(0.9, 1.7, 0.7, '#0c0c10', s * 3.6, 0.85, -d / 2 + 0.6, true);
  for (let i = 0; i < 3; i++) k.b(2.0, 0.5, 0.9, ['#7a3b3b', '#3b5a7a', '#5a7a3b'][i], -w / 2 + 1.2, 0.25, -1.0 + i * 2.2, true); // mismatched sofas
  k.b(2.2, 2.2, 0.1, '#3a4a3a', -w / 2 + 3.2, 1.1, d / 2 - 1.2); // a tarp over the back room
  const spots: VenueSpot[] = [
    exitSpot(d, 'Leave Sunrise Annex'),
    { id: 'bar', kind: 'bar', x: w / 2 - 2.0, z: 0.5, r: 1.9, label: 'Get a drink from the plank ($6)' },
    { id: 'booth', kind: 'dj', x: 0, z: -d / 2 + 2.4, r: 1.8, label: 'Take the decks' },
    { id: 'couch', kind: 'couch', x: -w / 2 + 2.4, z: 0.9, r: 1.8, label: 'Collapse onto a sofa', say: 'The sofa remembers every Sunday. You stay a while.' },
    { id: 'backroom', kind: 'mark', x: -w / 2 + 3.2, z: d / 2 - 2.2, r: 1.6, label: 'Behind the tarp', say: 'Behind the tarp: a crate, a scale, a kettle. Nobody asks.' },
  ];
  const dj = c.add(person(deps, 'ah-dj', { variant: 'dj' }), 0, -d / 2 + 0.55, Math.PI);
  const bt = c.add(person(deps, 'ah-bar', { variant: 'la-denim' }), w / 2 - 1.5, 0.5, -Math.PI / 2);
  const crowd = [0, 1, 2, 3, 4].map((i) => c.add(person(deps, `ah-c${i}`), -2.5 + i * 1.3, -0.5 + (i % 2) * 1.4, i));
  return finish(id, g, k, spots, c.models, (t, beat) => {
    crowd.forEach((p, i) => dance(p, beat.index + beat.phase, 0.25 + 0.2 * beat.level, i * 1.9));
    dance(dj, beat.index + beat.phase, 0.15, 0.3); dj.arms[0].rotation.x = -1.1; dj.arms[1].rotation.x = -1.2 + Math.sin(t * 6) * 0.12; idle(bt, t, 2);
  });
}

// ------------------------------------------------------------------ club

function buildClub(deps: VenueRoomDeps): VenueRoom {
  const id: VenueId = 'club';
  const { w, d, h, origin } = VENUE_ROOM[id];
  const g = new THREE.Group(); g.name = `interior-${id}`;
  g.add(shell(w, d, h, { floor: '#0a0a12', wall: '#120a1c', ceil: '#06060a', trim: '#6ff3ff' }));
  const k = new Kit(deps.world, w, d, id, origin);
  const c = cast(g);
  // floor tiles that change on the beat (one mesh per tile, two shared materials)
  const palette = ['#ff2d95', '#6ff3ff', '#9b5de5', '#ffd60a'].map((col) => basic({ color: col }));
  const dark = basic({ color: '#150f22' });
  const TX = 5, TZ = 4, tw = 1.7;
  const tiles: THREE.Mesh[] = []; const tg = new THREE.PlaneGeometry(tw - 0.06, tw - 0.06);
  for (let i = 0; i < TX; i++) for (let j = 0; j < TZ; j++) { const m = new THREE.Mesh(tg, dark); m.rotation.x = -Math.PI / 2; m.position.set((i - (TX - 1) / 2) * tw, 0.012, -0.9 + (j - (TZ - 1) / 2) * tw); g.add(m); tiles.push(m); }
  // the stage and the booth (turntables and a mixer, as in the other clubs)
  k.b(8, 0.4, 2.6, '#1a1426', 0, 0.2, -d / 2 + 1.4);
  const bz = -d / 2 + 1.2;
  k.b(3.4, 0.95, 0.8, '#222232', 0, 0.4 + 0.475, bz + 0.5, true);
  k.b(0.8, 0.05, 0.5, '#cfcfcf', -1.0, 1.38, bz + 0.5); k.b(0.8, 0.05, 0.5, '#cfcfcf', 1.0, 1.38, bz + 0.5); k.b(0.5, 0.07, 0.5, '#101018', 0, 1.38, bz + 0.5);
  for (const sx of [-4.4, 4.4]) { k.b(1.0, 2.0, 0.8, '#0c0c10', sx, 1.0, -d / 2 + 0.6, true); k.b(0.55, 0.55, 0.05, '#222', sx, 1.0, -d / 2 + 1.02); }
  k.b(4.0, 0.6, 0.05, '#6ff3ff', 0, 3.7, -d / 2 + 0.06, false, true); // the sign over the stage
  // the bar on the east wall, VIP booths on the west
  k.b(0.9, 1.05, 7, '#2c1d33', w / 2 - 0.8, 0.525, 1.0, true); k.b(1.0, 0.05, 7.1, '#ff2d95', w / 2 - 0.8, 1.08, 1.0, false, true);
  const bottles = ['#2ec4b6', '#ff9f1c', '#e71d36', '#9b5de5', '#06d6a0'];
  for (let i = 0; i < 14; i++) k.b(0.1, 0.34, 0.1, bottles[i % 5], w / 2 - 0.15, 1.75, -2.2 + i * 0.5, false, true);
  for (let i = 0; i < 3; i++) { k.b(1.0, 0.5, 2.2, '#3b1d4d', -w / 2 + 0.9, 0.25, -1.5 + i * 3.0, true); k.b(1.1, 0.04, 1.6, '#c9a24a', -w / 2 + 2.0, 0.55, -1.5 + i * 3.0); }
  // the rope line inside the door and a door to the back
  for (const s of [-1, 1]) k.b(0.07, 1.0, 0.07, '#c9a24a', s * 1.4, 0.5, d / 2 - 2.2); k.b(2.8, 0.06, 0.06, '#8b0a1e', 0, 0.92, d / 2 - 2.2);
  k.b(1.2, 2.1, 0.12, '#1d1a17', -w / 2 + 0.08 + 0.1, 1.05, d / 2 - 3.5); // a door in the west wall to the back
  // lights: a wash and a couple of beams, driven by the beat
  const washMat = new THREE.MeshBasicMaterial({ color: 0xff2d95, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(TX * tw, TZ * tw), washMat); wash.rotation.x = -Math.PI / 2; wash.position.set(0, 0.02, -0.9); g.add(wash);
  const beams: THREE.Group[] = []; const bgeo = new THREE.BoxGeometry(0.03, 0.03, 9);
  const bm = [basic({ color: '#00ffa8', additive: true, opacity: 0.8 }), basic({ color: '#ff2d95', additive: true, opacity: 0.8 }), basic({ color: '#6ff3ff', additive: true, opacity: 0.8 })];
  for (let i = 0; i < 4; i++) { const p = new THREE.Group(); p.position.set((i - 1.5) * 3.4, h - 0.2, -1); const bmesh = new THREE.Mesh(bgeo, bm[i % 3]); bmesh.position.z = 4.5; p.add(bmesh); g.add(p); beams.push(p); }
  // people
  const dancers: Array<{ m: HumanModel; seed: number }> = [];
  const rng = new Rng('venue-club');
  const n = Math.max(6, Math.min(10, (deps.dancerCount ?? 16) - 6));
  for (let i = 0; i < n; i++) { const m = c.add(person(deps, `club-d${i}`), (rng.next() - 0.5) * (TX * tw - 1.5), -0.9 + (rng.next() - 0.5) * (TZ * tw - 1.5), rng.range(-Math.PI, Math.PI)); dancers.push({ m, seed: i * 1.7 + rng.next() * 3 }); }
  const dj = c.add(person(deps, 'club-dj', { variant: 'dj' }), 0, bz - 0.15, Math.PI);
  const bt = c.add(person(deps, 'club-bar', { variant: 'ba-durag' }), w / 2 - 1.6, 1.0, -Math.PI / 2);
  const bouncer = c.add(person(deps, 'club-bouncer'), 2.0, d / 2 - 2.2, Math.PI);
  const spots: VenueSpot[] = [
    exitSpot(d, 'Leave Neon Paloma'),
    { id: 'booth', kind: 'dj', x: 0, z: bz + 1.4, r: 1.8, label: 'Take the decks' },
    { id: 'bar', kind: 'bar', x: w / 2 - 2.0, z: 1.0, r: 1.9, label: 'Order a drink ($6)' },
    { id: 'dancefloor', kind: 'mark', x: 0, z: -0.9, r: 3.2, label: 'Hit the floor', say: 'The floor takes you in. For a minute you are just another body on the beat.' },
    { id: 'vip', kind: 'couch', x: -w / 2 + 2.6, z: -0.5, r: 1.9, label: 'Sit in the VIP booth', say: 'Velvet, a candle, and a view of everyone who needs to be seen.' },
    { id: 'backroom', kind: 'mark', x: -w / 2 + 1.5, z: d / 2 - 3.5, r: 1.6, label: 'Back office', say: 'Back office: a desk, a safe, a promoter on the phone with five people at once.' },
    { id: 'door', kind: 'talk', x: 0, z: d / 2 - 1.6, r: 1.6, label: 'Talk to the door', say: 'Doorman: "Names on the list, or friends of names on the list."' },
  ];
  let last = -1;
  return finish(id, g, k, spots, c.models, (t, beat) => {
    const lvl = beat.dark ? 0 : Math.max(0.15, beat.level);
    beams.forEach((p, i) => { p.visible = !beat.dark; p.rotation.y = Math.sin(t * 0.8 + i) * 0.5; p.rotation.x = -0.4 - 0.25 * Math.sin((beat.index + beat.phase) * 0.8 + i) * lvl; });
    if (beat.index !== last) {
      last = beat.index;
      tiles.forEach((m, i) => { m.material = ((i * 7 + beat.index * 3) % 5) < 2 && !beat.dark ? palette[(i + beat.index) % 4] : dark; });
      washMat.color.set(['#ff2d95', '#6ff3ff', '#9b5de5', '#ffd60a'][beat.index % 4]);
    }
    washMat.opacity = beat.dark ? 0 : 0.05 + 0.25 * Math.pow(1 - beat.phase, 3) * lvl;
    dancers.forEach((dn) => dance(dn.m, beat.index + beat.phase, lvl, dn.seed));
    dance(dj, beat.index + beat.phase, 0.4, 0.3); dj.arms[0].rotation.x = -1.1; dj.arms[1].rotation.x = -1.2 + Math.sin(t * 6) * 0.15;
    idle(bt, t, 4); idle(bouncer, t, 8);
  });
}

// ------------------------------------------------------------------ dispensary

function buildDispensary(deps: VenueRoomDeps): VenueRoom {
  const id: VenueId = 'dispensary';
  const { w, d, h, origin } = VENUE_ROOM[id];
  const g = new THREE.Group(); g.name = `interior-${id}`;
  g.add(shell(w, d, h, { floor: '#d9d6cf', wall: '#eef2ea', ceil: '#f6f6f2', trim: '#5fbf6a' }));
  const k = new Kit(deps.world, w, d, id, origin);
  const c = cast(g);
  k.b(w - 3, 1.0, 0.9, '#f4f6f1', 0, 0.5, -d / 2 + 2.2, true); k.b(w - 3, 0.05, 1.0, '#7fb8c4', 0, 1.02, -d / 2 + 2.2); // glass counter
  for (let i = 0; i < 6; i++) k.b(0.22, 0.28, 0.22, ['#5fbf6a', '#b9e07a', '#7fd6a8'][i % 3], -w / 2 + 2.4 + i * 0.7, 1.2, -d / 2 + 2.2, false, true); // jars
  k.b(3.0, 0.9, 0.06, '#5fff8a', 0, 2.1, -d / 2 + 0.06, false, true); // the menu screen
  k.b(2.0, 0.7, 0.5, '#e8e8e4', w / 2 - 1.2, 0.35, 0.8, true); // a waiting bench
  k.b(0.9, 2.1, 0.12, '#cfd6cc', -w / 2 + 0.08 + 0.1, 1.05, 0.2); // office door
  const spots: VenueSpot[] = [
    exitSpot(d, 'Leave Fernwell'),
    { id: 'counter', kind: 'talk', x: 0, z: -d / 2 + 3.2, r: 1.9, label: 'Talk to the budtender', say: 'Budtender: "Flower, edibles, or you just want to look cool in the line?"' },
    { id: 'menu', kind: 'mark', x: 0, z: -d / 2 + 2.9, r: 2.4, label: 'Read the menu', say: 'The menu has more adjectives than a wine list.' },
    { id: 'bench', kind: 'couch', x: w / 2 - 1.6, z: 1.6, r: 1.5, label: 'Wait on the bench', say: 'You wait. The playlist is acoustic and judging you.' },
    { id: 'backroom', kind: 'mark', x: -w / 2 + 1.4, z: 0.2, r: 1.5, label: 'Back office', say: 'Back office: invoices, a scale that has seen things, and a man who says he is only the accountant.' },
  ];
  const bud = c.add(person(deps, 'disp-bud', { variant: 'odette' }), 0, -d / 2 + 1.2, 0);
  const cust = c.add(person(deps, 'disp-cust'), 1.8, -0.6, Math.PI);
  return finish(id, g, k, spots, c.models, (t) => { idle(bud, t, 1); idle(cust, t, 4); });
}

// ------------------------------------------------------------------ gym

function buildGym(deps: VenueRoomDeps): VenueRoom {
  const id: VenueId = 'gym';
  const { w, d, h, origin } = VENUE_ROOM[id];
  const g = new THREE.Group(); g.name = `interior-${id}`;
  g.add(shell(w, d, h, { floor: '#26282a', wall: '#a9a7a1', ceil: '#3a3a3c', trim: '#ffd400' }));
  const k = new Kit(deps.world, w, d, id, origin);
  const c = cast(g);
  k.b(0.1, 2.2, d - 3, '#c9d6dc', -w / 2 + 0.07, 1.5, -1.0, false, true); // mirror wall (west)
  // weights floor: three benches, a squat rack, dumbbell rack
  for (let i = 0; i < 3; i++) { const x = -3.8 + i * 2.8; k.b(0.5, 0.45, 1.5, '#1a1a1d', x, 0.225, -1.2, true); k.b(1.8, 0.05, 0.05, '#c8c8cc', x, 1.15, -1.5); k.b(0.3, 0.3, 0.06, '#222', x - 0.9, 1.15, -1.5); k.b(0.3, 0.3, 0.06, '#222', x + 0.9, 1.15, -1.5); }
  k.b(1.8, 2.4, 1.4, '#3a3a3e', 3.6, 1.2, -d / 2 + 1.0, true);
  for (let i = 0; i < 8; i++) k.b(0.2, 0.2, 0.3, '#111', -w / 2 + 2.2 + i * 0.32, 0.9, -d / 2 + 0.4, false);
  k.b(2.8, 0.7, 0.5, '#2a2a2e', -w / 2 + 3.2, 0.35, -d / 2 + 0.5, true);
  // cardio: three treadmills along the east wall
  for (let i = 0; i < 3; i++) { const z = -2.4 + i * 1.8; k.b(0.9, 0.3, 1.8, '#1f1f22', w / 2 - 1.2, 0.15, z, true); k.b(0.9, 1.0, 0.1, '#2a2a2e', w / 2 - 0.6, 1.1, z); k.b(0.4, 0.2, 0.05, '#5fff8a', w / 2 - 0.6, 1.5, z, false, true); }
  // a heavy bag and a ring corner
  k.b(0.45, 1.3, 0.45, '#8b1e1e', -w / 2 + 2.6, 1.25, d / 2 - 2.4); k.b(0.05, 1.0, 0.05, '#888', -w / 2 + 2.6, 2.4, d / 2 - 2.4);
  // the front desk by the door and lockers
  k.b(2.6, 1.0, 0.7, '#ffd400', w / 2 - 2.2, 0.5, d / 2 - 1.2, true);
  for (let i = 0; i < 6; i++) k.b(0.5, 1.8, 0.5, i % 2 ? '#3b5a7a' : '#2b4056', w / 2 - 0.5, 0.9, 1.8 + i * 0.52 - 3.0 + 3.0, false);
  const spots: VenueSpot[] = [
    exitSpot(d, 'Leave Iron Stoop Gym'),
    { id: 'desk', kind: 'talk', x: w / 2 - 2.2, z: d / 2 - 2.4, r: 1.6, label: 'Talk to the front desk', say: 'Front desk: "Day pass is free if you can lift the stack. Pay if you cannot."' },
    { id: 'bench', kind: 'train', x: 0, z: 0.4, r: 2.4, label: 'Hit the bench press', say: 'You rack it. Your chest has notes.' },
    { id: 'treadmill', kind: 'train', x: w / 2 - 2.4, z: -0.6, r: 1.8, label: 'Run the treadmill', say: 'Ten minutes at a pace you will regret by evening.' },
    { id: 'bag', kind: 'train', x: -w / 2 + 3.4, z: d / 2 - 2.4, r: 1.6, label: 'Work the heavy bag', say: 'The bag takes it and gives it back.' },
    { id: 'lockers', kind: 'mark', x: w / 2 - 1.5, z: 2.4, r: 1.6, label: 'Lockers', say: 'A locker with a dent in the shape of an argument.' },
  ];
  const desk = c.add(person(deps, 'gym-desk', { variant: 'la-denim' }), w / 2 - 2.2, d / 2 - 0.4, Math.PI);
  const trainer = c.add(person(deps, 'gym-trainer'), 2.2, 1.4, -Math.PI / 2);
  const lifter = c.add(person(deps, 'gym-lifter'), -3.8, -0.2, 0);
  return finish(id, g, k, spots, c.models, (t) => { idle(desk, t, 1); idle(trainer, t, 3); lifter.arms[0].rotation.x = -1.4 + Math.sin(t * 1.4) * 0.45; lifter.arms[1].rotation.x = -1.4 + Math.sin(t * 1.4) * 0.45; });
}

export function buildVenueRoom(id: VenueId, deps: VenueRoomDeps): VenueRoom {
  switch (id) {
    case 'bar-dive': case 'bar-lounge': case 'bar-sports': return buildBar(id, deps);
    case 'afterhours': return buildAfterhours(deps);
    case 'club': return buildClub(deps);
    case 'dispensary': return buildDispensary(deps);
    case 'gym': return buildGym(deps);
  }
}
