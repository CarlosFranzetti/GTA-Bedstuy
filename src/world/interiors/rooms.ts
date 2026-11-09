/** The three rooms. Local coordinates: centre (0,0), x east, z south, the door is in the south wall (z = +d/2). */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { HumanModel } from '@/entities/models/humanModel';
import type { PedOptions } from '@/entities/models/pedBody';
import { buildPedModel } from '@/entities/models/pedBodyHi';
import type { IMaterialLibrary, IWorld2D } from '../types';
import { INTERIORS, type InteriorId } from './defs';
import { basic, box, gradientPlane, plane, RoomColliders, shell, sleeveRows } from './parts';
import { PROCEDURAL_RECORDS } from '@/game/records';

export type SpotKind = 'exit' | 'shop' | 'listen' | 'dj' | 'bar' | 'talk' | 'couch' | 'window';
export interface Spot { id: string; kind: SpotKind; x: number; z: number; r: number; label: string }

/** What the room hears: beat phase 0..1, tempo, loudness 0..1. */
export interface Beat { phase: number; bpm: number; level: number; index: number; dark?: boolean }

export interface Room {
  id: InteriorId;
  group: THREE.Group;
  spawn: { x: number; z: number; heading: number };
  spots: Spot[];
  /** Animate: seconds of room time, the current beat. */
  update(t: number, beat: Beat): void;
  /** Number of dancing figures (club). */
  dancers: number;
}

export interface RoomDeps { world: IWorld2D; materials: IMaterialLibrary; dancerCount?: number }

const EXIT_SPOT = (d: number, label = 'Leave'): Spot => ({ id: 'exit', kind: 'exit', x: 0, z: d / 2 - 0.7, r: 1.3, label });
const SPAWN = (d: number) => ({ x: 0, z: d / 2 - 1.5, heading: 0 });

function place(model: HumanModel, x: number, z: number, heading: number, scale = 1): void {
  model.group.position.set(x, 0, z);
  model.group.rotation.y = -heading; // same convention as Math2.applyPose
  model.group.scale.setScalar(scale);
}

/** Idle NPC: slow breathing sway. */
function idle(model: HumanModel, t: number, seed: number): void {
  model.rig.position.y = Math.sin(t * 1.6 + seed) * 0.006;
  model.torso.rotation.z = Math.sin(t * 0.9 + seed) * 0.02;
  model.head.rotation.y = Math.sin(t * 0.5 + seed * 2) * 0.25;
}

/** Dance: knees bend on the beat, arms pump, torso twists. */
export function danceFigure(model: HumanModel, t: number, phase: number, level: number, seed: number): void {
  const bob = Math.sin(phase * Math.PI * 2 + seed);
  const k = 0.18 + 0.5 * level;
  model.rig.position.y = -Math.abs(bob) * 0.06 * (0.4 + level);
  model.knees[0].rotation.x = -Math.max(0, bob) * k; model.knees[1].rotation.x = -Math.max(0, -bob) * k;
  model.legs[0].rotation.x = Math.max(0, bob) * k * 0.5; model.legs[1].rotation.x = Math.max(0, -bob) * k * 0.5;
  const up = seed % 3 < 1 ? 1 : 0;
  model.arms[0].rotation.x = -(up ? 2.4 : 0.4) * (0.4 + 0.6 * Math.max(0, bob)) * (0.5 + level);
  model.arms[1].rotation.x = -(up ? 2.0 : 0.3) * (0.4 + 0.6 * Math.max(0, -bob)) * (0.5 + level);
  model.elbows[0].rotation.x = 0.5 + 0.4 * bob; model.elbows[1].rotation.x = 0.5 - 0.4 * bob;
  model.torso.rotation.y = Math.sin(phase * Math.PI + seed) * 0.25 * (0.5 + level);
  model.hips.rotation.y = -model.torso.rotation.y * 0.8;
  model.head.rotation.x = 0.12 * bob;
  model.head.rotation.y = Math.sin(t * 0.7 + seed) * 0.2;
}

function figure(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): HumanModel {
  return buildPedModel(materials, rng, opts);
}

// ---------------------------------------------------------------- WAX DELI

export function buildDeli(deps: RoomDeps): Room {
  const def = INTERIORS.deli; const { w, d, h } = def;
  const g = new THREE.Group(); g.name = 'interior-deli';
  g.add(shell(w, d, h, { floor: '#5b4632', wall: '#d8c7a3', ceil: '#cfc6b3', trim: '#3b2a1a' }));
  const col = new RoomColliders(deps.world, def.origin.x, def.origin.z, 'deli'); col.walls(w, d);

  // record bins along the west and north walls (crates + sleeves)
  const colors = PROCEDURAL_RECORDS.flatMap((r) => r.colors);
  const rows: Array<{ x: number; y: number; z: number; count: number; colors: string[]; axis: 'x' | 'z' }> = [];
  for (let i = 0; i < 3; i++) {
    const z = -2.4 + i * 1.5;
    g.add(box(1.0, 0.7, 1.2, '#8a6a42', -w / 2 + 0.9, 0.35, z)); col.solid(-w / 2 + 0.9, z, 1.0, 1.2);
    rows.push({ x: -w / 2 + 0.7, y: 0.85, z: z - 0.5, count: 22, colors: colors.slice(i * 6, i * 6 + 8), axis: 'z' });
  }
  for (let i = 0; i < 3; i++) {
    const x = -1.2 + i * 1.7;
    g.add(box(1.2, 0.7, 1.0, '#8a6a42', x, 0.35, -d / 2 + 0.9)); col.solid(x, -d / 2 + 0.9, 1.2, 1.0);
    rows.push({ x: x - 0.55, y: 0.85, z: -d / 2 + 0.7, count: 24, colors: colors.slice(8 + i * 5, 8 + i * 5 + 8), axis: 'x' });
  }
  g.add(sleeveRows(rows));
  // wall display: framed covers
  for (let i = 0; i < 6; i++) g.add(box(0.5, 0.5, 0.03, colors[(i * 3) % colors.length], -3.8 + i * 0.9, 2.1, -d / 2 + 0.04));
  // counter + register
  g.add(box(3.2, 1.0, 0.8, '#6e4a2a', 2.6, 0.5, -0.6)); col.solid(2.6, -0.6, 3.2, 0.8);
  g.add(box(0.5, 0.35, 0.4, '#222', 3.4, 1.17, -0.6));
  g.add(box(0.7, 0.04, 0.5, '#bbb', 1.8, 1.02, -0.6));
  // listening station: headphones on a post by the east wall
  g.add(box(0.9, 0.9, 0.6, '#2d3b4d', w / 2 - 0.8, 0.45, 1.8)); col.solid(w / 2 - 0.8, 1.8, 0.9, 0.6);
  g.add(box(0.5, 0.06, 0.34, '#101010', w / 2 - 0.8, 0.93, 1.8));
  g.add(box(0.08, 0.2, 0.28, '#d33', w / 2 - 0.8, 1.08, 1.8));
  // the sign over the counter + a ceiling strip
  g.add(box(2.4, 0.4, 0.05, '#d62828', 2.6, 2.6, -d / 2 + 0.05));
  g.add(box(w - 1, 0.04, 0.2, '#fff6d0', 0, h - 0.03, 0));
  // owner NPC behind the counter
  const owner = figure(deps.materials, new Rng('deli-owner'), { variant: 'odette' });
  place(owner, 2.6, -1.3, Math.PI);
  g.add(owner.group);
  // a customer browsing
  const cust = figure(deps.materials, new Rng('deli-cust'), { variant: 'denim-girl' });
  place(cust, -1.0, 0.6, -Math.PI / 2); g.add(cust.group);

  return {
    id: 'deli', group: g, spawn: SPAWN(d), dancers: 0,
    spots: [
      EXIT_SPOT(d),
      // H7: the north crates and the counter gave no prompt (the old 2.6 m spot ended before the middle crates)
      { id: 'bins', kind: 'shop', x: -1.8, z: -1.4, r: 4.2, label: 'Browse the bins' },
      { id: 'counter', kind: 'shop', x: 1.2, z: 0.4, r: 1.5, label: 'Browse the bins' },
      { id: 'owner', kind: 'talk', x: 3.4, z: 0.5, r: 1.3, label: 'Talk to the owner' },
      { id: 'listen', kind: 'listen', x: w / 2 - 1.8, z: 1.8, r: 1.4, label: 'Use the listening station' },
    ],
    update(t) { idle(owner, t, 1); idle(cust, t, 2); },
  };
}

// ---------------------------------------------------------------- HOME

export function buildHome(deps: RoomDeps): Room {
  const def = INTERIORS.home; const { w, d, h } = def;
  const g = new THREE.Group(); g.name = 'interior-home';
  g.add(shell(w, d, h, { floor: '#7a5a3a', wall: '#b9a58d', ceil: '#e7ddd0', trim: '#4a3624' }));
  const col = new RoomColliders(deps.world, def.origin.x, def.origin.z, 'home'); col.walls(w, d);
  // street window on the west wall with a dusky street scene behind the glass
  g.add(box(0.02, 1.6, 2.7, '#2a2018', -w / 2 + 0.03, 1.6, -0.5));
  g.add(gradientPlane(2.4, 1.4, '#44609e', '#f6b36c', -w / 2 + 0.05, 1.6, -0.5, Math.PI / 2));
  g.add(box(0.1, 0.05, 2.8, '#d8d0c4', -w / 2 + 0.1, 0.84, -0.5));
  // couch (south-east, facing the window) and a rug
  g.add(plane(3.0, 2.2, '#8c3b3b', 0.2, 0.01, 0.4, 'floor'));
  g.add(box(2.0, 0.45, 0.9, '#3d5a73', 1.9, 0.225, 1.8)); g.add(box(2.0, 0.5, 0.2, '#35506a', 1.9, 0.7, 2.2)); col.solid(1.9, 1.9, 2.0, 1.0);
  // record shelf along the north wall: cube shelf + sleeves
  g.add(box(3.2, 1.3, 0.4, '#5c3f26', -0.2, 0.65, -d / 2 + 0.25)); col.solid(-0.2, -d / 2 + 0.25, 3.2, 0.4);
  const colors = PROCEDURAL_RECORDS.flatMap((r) => r.colors);
  g.add(sleeveRows([{ x: -1.65, y: 1.45, z: -d / 2 + 0.3, count: 28, colors: colors.slice(0, 12), axis: 'x' }]));
  // DJ table: two turntables and a mixer
  const dx = 2.6, dz = -d / 2 + 0.55;
  g.add(box(2.4, 0.85, 0.7, '#2b2b30', dx, 0.425, dz)); col.solid(dx, dz, 2.4, 0.7);
  for (const s of [-0.85, 0.85]) {
    g.add(box(0.7, 0.06, 0.55, '#d9d9d9', dx + s, 0.88, dz));
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 24), basic({ color: '#0c0c0c' })); platter.position.set(dx + s, 0.93, dz); g.add(platter);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 12), basic({ color: '#e63946' })); label.position.set(dx + s, 0.935, dz); g.add(label);
  }
  g.add(box(0.5, 0.08, 0.5, '#1a1a1e', dx, 0.9, dz));
  g.add(box(0.04, 0.04, 0.3, '#ff58b4', dx, 0.96, dz));
  // bed corner + lamp
  g.add(box(1.6, 0.4, 2.0, '#cfd6e4', -w / 2 + 1.1, 0.2, d / 2 - 1.3)); col.solid(-w / 2 + 1.1, d / 2 - 1.3, 1.6, 2.0);
  g.add(box(0.25, 0.25, 0.25, '#ffd98a', -w / 2 + 0.4, 0.95, d / 2 - 2.5));
  return {
    id: 'home', group: g, spawn: SPAWN(d), dancers: 0,
    spots: [
      EXIT_SPOT(d, 'Leave the apartment'),
      { id: 'decks', kind: 'dj', x: dx, z: dz + 1.1, r: 1.6, label: 'Play the turntables' },
      { id: 'couch', kind: 'couch', x: 1.9, z: 0.6, r: 1.5, label: 'Sit on the couch' },
      { id: 'window', kind: 'window', x: -w / 2 + 1.2, z: -0.5, r: 1.5, label: 'Look out the window' },
    ],
    update() { /* static */ },
  };
}

// ---------------------------------------------------------------- AFTERSLOTH

export function buildClub(deps: RoomDeps): Room {
  const def = INTERIORS.club; const { w, d, h } = def;
  const g = new THREE.Group(); g.name = 'interior-club';
  g.add(shell(w, d, h, { floor: '#0b0b12', wall: '#14101c', ceil: '#07070b', trim: '#ff2d95' }));
  const col = new RoomColliders(deps.world, def.origin.x, def.origin.z, 'club'); col.walls(w, d);

  // dance floor of 6 x 4 tiles that change colour on the beat
  const TILES_X = 6, TILES_Z = 4, tw = 1.5;
  const palette = ['#ff2d95', '#00d4ff', '#9b5de5', '#ffd60a'].map((c) => basic({ color: c }));
  const dark = basic({ color: '#15101f' });
  const tiles: THREE.Mesh[] = [];
  const geo = new THREE.PlaneGeometry(tw - 0.06, tw - 0.06);
  for (let i = 0; i < TILES_X; i++) for (let j = 0; j < TILES_Z; j++) {
    const m = new THREE.Mesh(geo, dark);
    m.rotation.x = -Math.PI / 2;
    m.position.set((i - (TILES_X - 1) / 2) * tw, 0.012, -0.8 + (j - (TILES_Z - 1) / 2) * tw);
    g.add(m); tiles.push(m);
  }
  // DJ booth on a stage along the north wall
  g.add(box(7, 0.35, 2.4, '#1a1426', 0, 0.175, -d / 2 + 1.3));
  const bx = 0, bz = -d / 2 + 1.0;
  g.add(box(3.2, 0.95, 0.8, '#222232', bx, 0.35 + 0.475, bz + 0.5)); col.solid(bx, bz + 0.5, 3.2, 0.8);
  g.add(box(0.8, 0.05, 0.5, '#cfcfcf', bx - 1.0, 1.32, bz + 0.5)); g.add(box(0.8, 0.05, 0.5, '#cfcfcf', bx + 1.0, 1.32, bz + 0.5));
  g.add(box(0.5, 0.07, 0.5, '#101018', bx, 1.32, bz + 0.5));
  // speakers
  for (const sx of [-3.4, 3.4]) { g.add(box(0.9, 1.9, 0.7, '#0c0c10', sx, 0.35 + 0.95, -d / 2 + 0.6)); col.solid(sx, -d / 2 + 0.6, 0.9, 0.7); g.add(box(0.5, 0.5, 0.05, '#222', sx, 1.0, -d / 2 + 0.97)); }
  // bar along the east wall
  g.add(box(0.8, 1.05, 6, '#2c1d33', w / 2 - 0.8, 0.525, 1.4)); col.solid(w / 2 - 0.8, 1.4, 0.8, 6);
  g.add(box(0.9, 0.05, 6.1, '#ff2d95', w / 2 - 0.8, 1.07, 1.4));
  const bottles = ['#2ec4b6', '#ff9f1c', '#e71d36', '#9b5de5', '#06d6a0'];
  for (let i = 0; i < 12; i++) g.add(box(0.1, 0.32, 0.1, bottles[i % 5], w / 2 - 0.15, 1.7, -1.2 + i * 0.5));
  g.add(box(0.12, 0.08, 6, '#00d4ff', w / 2 - 0.1, 1.5, 1.4));
  // couches along the west wall
  for (const z of [-0.5, 2.3]) { g.add(box(0.9, 0.45, 2.0, '#3b1d4d', -w / 2 + 0.8, 0.225, z)); col.solid(-w / 2 + 0.8, z, 0.9, 2.0); }
  // neon sign over the stage
  g.add(box(3.4, 0.5, 0.04, '#ff2d95', 0, 3.2, -d / 2 + 0.05));
  // lasers: thin additive beams hanging from the ceiling, fanned by the beat
  const lasers: THREE.Mesh[] = [];
  const laserGeo = new THREE.BoxGeometry(0.03, 0.03, 9);
  const laserMats = [basic({ color: '#00ffa8', additive: true, opacity: 0.8 }), basic({ color: '#ff2d95', additive: true, opacity: 0.8 }), basic({ color: '#00d4ff', additive: true, opacity: 0.8 })];
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group(); pivot.position.set((i - 2.5) * 2.4, h - 0.2, -1);
    const beam = new THREE.Mesh(laserGeo, laserMats[i % 3]); beam.position.z = 4.5; pivot.add(beam);
    g.add(pivot); lasers.push(pivot as unknown as THREE.Mesh);
  }
  // strobe: a ceiling-wide white additive plane
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const strobe = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, d - 1), strobeMat);
  strobe.rotation.x = Math.PI / 2; strobe.position.y = h - 0.05; g.add(strobe);
  // glow wash on the floor (pulses)
  const washMat = new THREE.MeshBasicMaterial({ color: 0xff2d95, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(TILES_X * tw, TILES_Z * tw), washMat);
  wash.rotation.x = -Math.PI / 2; wash.position.set(0, 0.02, -0.8); g.add(wash);

  // people
  const rng = new Rng('aftersloth');
  const count = Math.max(12, Math.min(20, deps.dancerCount ?? 16));
  const dancers: Array<{ m: HumanModel; seed: number }> = [];
  for (let i = 0; i < count; i++) {
    const m = figure(deps.materials, rng.fork(`dancer${i}`));
    const px = (rng.next() - 0.5) * (TILES_X * tw - 1.2), pz = -0.8 + (rng.next() - 0.5) * (TILES_Z * tw - 1.2);
    place(m, px, pz, rng.range(-Math.PI, Math.PI));
    g.add(m.group); dancers.push({ m, seed: i * 1.7 + rng.next() * 3 });
  }
  const dj = figure(deps.materials, new Rng('dj-sloth'), { variant: 'dj' });
  place(dj, bx, bz - 0.15, Math.PI); g.add(dj.group);
  const bartender = figure(deps.materials, new Rng('bartender'), { variant: 'durag-tee' });
  place(bartender, w / 2 - 1.5, 1.4, -Math.PI / 2); g.add(bartender.group);
  const guests = [figure(deps.materials, new Rng('guest1')), figure(deps.materials, new Rng('guest2'))];
  place(guests[0], -w / 2 + 1.5, -0.5, Math.PI / 2); place(guests[1], -w / 2 + 1.5, 2.3, Math.PI / 2);
  guests.forEach((m) => g.add(m.group));

  let lastIdx = -1;
  return {
    id: 'club', group: g, spawn: SPAWN(d), dancers: count,
    spots: [
      EXIT_SPOT(d, 'Leave Aftersloth'),
      { id: 'booth', kind: 'dj', x: bx, z: bz + 1.4, r: 1.7, label: 'Take the decks' },
      { id: 'bar', kind: 'bar', x: w / 2 - 2.0, z: 1.4, r: 1.8, label: 'Order a drink ($6)' },
    ],
    update(t, beat) {
      const lvl = beat.dark ? 0 : Math.max(0.15, beat.level);
      lasers.forEach((p) => { p.visible = !beat.dark; });
      if (beat.index !== lastIdx) {
        lastIdx = beat.index;
        for (let i = 0; i < tiles.length; i++) {
          const on = ((i * 7 + beat.index * 3) % 5) < 2;
          tiles[i].material = on && !beat.dark ? palette[(i + beat.index) % 4] : dark;
        }
        washMat.color.set(['#ff2d95', '#00d4ff', '#9b5de5', '#ffd60a'][beat.index % 4]);
      }
      const pulse = Math.pow(1 - beat.phase, 3);
      washMat.opacity = beat.dark ? 0 : 0.05 + 0.25 * pulse * lvl;
      // strobe on the downbeat of every bar: short bursts
      strobeMat.opacity = beat.index % 4 === 0 && beat.phase < 0.12 ? 0.55 * lvl : (beat.index % 8 === 7 && beat.phase > 0.5 && Math.floor(beat.phase * 24) % 2 === 0 ? 0.35 * lvl : 0);
      const sweep = Math.sin((beat.index + beat.phase) * Math.PI / 2);
      lasers.forEach((p, i) => { p.rotation.y = Math.sin(t * 0.8 + i) * 0.5 + sweep * 0.25 * (i % 2 ? 1 : -1); p.rotation.x = -0.35 - 0.3 * Math.sin((beat.index + beat.phase) * 0.8 + i) * lvl; });
      dancers.forEach((dn) => danceFigure(dn.m, t, beat.index + beat.phase, lvl, dn.seed));
      danceFigure(dj, t, beat.index + beat.phase, 0.4, 0.3);
      dj.arms[0].rotation.x = -1.1; dj.arms[1].rotation.x = -1.2 + Math.sin(t * 6) * 0.15;
      idle(bartender, t, 5); guests.forEach((m, i) => idle(m, t, 7 + i));
    },
  };
}

export function buildRoom(id: InteriorId, deps: RoomDeps): Room {
  return id === 'deli' ? buildDeli(deps) : id === 'club' ? buildClub(deps) : buildHome(deps);
}
