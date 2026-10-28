/**
 * Traffic-signal poles and heads for every signalised intersection (see game/TrafficLights).
 *
 * One steel pole stands on each of the four sidewalk corners. The corner that is the far-right corner for an
 * approach carries a mast arm reaching over that approach's lane with a 3-lamp vehicle head facing the driver;
 * every pole also carries two pedestrian heads (hand / walking man) facing the pedestrians who cross toward it.
 *
 * Draw calls: 2. One merged mesh holds every pole, arm and housing; one InstancedMesh holds every lamp and is
 * lit/unlit through its per-instance colour (unlit-glass dark vs. lit HDR colour on an unlit material), which is
 * what `updateSignalMeshes` flips whenever a phase changes.
 *
 * Wiring (orchestrator): `group.add(buildSignals(grid, materials))` once, then every frame
 * `updateSignalMeshes(signalGroup, lights)`. Add `signalColliders(grid)` to the static colliders if wanted.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec2 } from '@/core/Math2';
import type { GridModel, IMaterialLibrary, Intersection, StaticCollider, StreetDef } from '@/world/types';
import type { Phase, TrafficLights, WalkState } from '@/game/TrafficLights';
import { alignYaw, box, cyl, frameMatrix, xform } from './common';

export const SIGNAL_POLE_HEIGHT = 6.4;
const POLE_RADIUS = 0.08;
const CORNER_INSET = 0.45;
const LANE_OFFSET = 2.0;
const HEAD_Y = 5.15;
const HEAD_W = 0.36;
const HEAD_H = 1.05;
const HEAD_D = 0.3;
const LAMP_R = 0.125;
const LAMP_DY = 0.33;
const PED_Y = 2.75;
const PED_W = 0.3;
const PED_H = 0.42;
const PED_D = 0.2;
const PED_LAMP_R = 0.09;
const PED_LAMP_DY = 0.1;
const POLE_COLLIDER_R = 0.12;

const LIT: Record<'red' | 'yellow' | 'green' | 'hand' | 'walk', THREE.Color> = {
  red: new THREE.Color().setRGB(2.4, 0.12, 0.08),
  yellow: new THREE.Color().setRGB(2.6, 1.7, 0.1),
  green: new THREE.Color().setRGB(0.12, 2.2, 0.8),
  hand: new THREE.Color().setRGB(2.4, 0.9, 0.05),
  walk: new THREE.Color().setRGB(2.0, 2.1, 2.2),
};
const DARK: Record<keyof typeof LIT, THREE.Color> = {
  red: new THREE.Color().setRGB(0.1, 0.015, 0.015),
  yellow: new THREE.Color().setRGB(0.1, 0.075, 0.01),
  green: new THREE.Color().setRGB(0.01, 0.08, 0.04),
  hand: new THREE.Color().setRGB(0.08, 0.035, 0.005),
  walk: new THREE.Color().setRGB(0.08, 0.08, 0.09),
};

interface VehHead { ns: boolean; base: number; }
interface PedHead { acrossNs: boolean; base: number; }
interface Rig { id: string; veh: VehHead[]; ped: PedHead[]; key: number; }
interface SignalRig { lamps: THREE.InstancedMesh; rigs: Rig[]; }

interface Corner { sx: number; sz: number; pole: Vec2; }

function cornersOf(it: Intersection): Corner[] {
  const out: Corner[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({
        sx, sz,
        pole: { x: it.center.x + sx * (it.halfX + CORNER_INSET), z: it.center.z + sz * (it.halfZ + CORNER_INSET) },
      });
    }
  }
  return out;
}

function signalised(grid: GridModel, it: Intersection): boolean {
  return grid.streetById(it.nsStreetId).class === 'avenue' || grid.streetById(it.ewStreetId).class === 'avenue';
}

/** Does the street carry traffic in the given travel sign (+1 = east/south, -1 = west/north)? */
function carries(street: StreetDef, sign: 1 | -1): boolean {
  return street.oneWay === 0 || street.oneWay === sign;
}

const local = (m: THREE.Matrix4, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));

/** Static colliders for the signal poles (add to the physics world if the poles should be solid). */
export function signalColliders(grid: GridModel): StaticCollider[] {
  const out: StaticCollider[] = [];
  for (const it of grid.intersections) {
    if (!signalised(grid, it)) continue;
    for (const c of cornersOf(it)) {
      out.push({ shape: { kind: 'circle', r: POLE_COLLIDER_R }, pos: { x: c.pole.x, z: c.pole.z }, id: `signal:${it.id}:${c.sx}:${c.sz}` });
    }
  }
  return out;
}

export function buildSignals(grid: GridModel, materials: IMaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'signals';
  const solid: THREE.BufferGeometry[] = [];
  const lampMats: Array<{ m: THREE.Matrix4; kind: keyof typeof LIT }> = [];
  const rigs: Rig[] = [];

  for (const it of grid.intersections) {
    if (!signalised(grid, it)) continue;
    const ns = grid.streetById(it.nsStreetId);
    const ew = grid.streetById(it.ewStreetId);
    const rig: Rig = { id: it.id, veh: [], ped: [], key: -1 };
    rigs.push(rig);

    for (const c of cornersOf(it)) {
      // pole
      solid.push(xform(cyl(POLE_RADIUS, POLE_RADIUS * 1.25, SIGNAL_POLE_HEIGHT, 8), c.pole.x, SIGNAL_POLE_HEIGHT / 2, c.pole.z));
      solid.push(xform(cyl(POLE_RADIUS * 1.9, POLE_RADIUS * 1.9, 0.5, 8), c.pole.x, 0.25, c.pole.z));

      // vehicle head for the approach whose far-right corner this is
      // (southbound -> (-1,+1), northbound -> (+1,-1), eastbound -> (+1,+1), westbound -> (-1,-1))
      const nsSign: 1 | -1 = c.sx === -1 && c.sz === 1 ? 1 : -1;
      const nsHere = (c.sx === -1 && c.sz === 1) || (c.sx === 1 && c.sz === -1);
      const ewHere = (c.sx === 1 && c.sz === 1) || (c.sx === -1 && c.sz === -1);
      if (nsHere && carries(ns, nsSign)) {
        const off = ns.oneWay === 0 ? LANE_OFFSET : 0;
        const laneX = it.center.x + c.sx * off;
        // faces the driver: northward for southbound travel (n = -d), southward for northbound
        const n: Vec2 = { x: 0, z: -nsSign };
        addVehHead(solid, lampMats, rig, true, { x: laneX, z: c.pole.z }, c.pole, n);
      }
      if (ewHere) {
        const ewSign: 1 | -1 = c.sx === 1 && c.sz === 1 ? 1 : -1;
        if (carries(ew, ewSign)) {
          const off = ew.oneWay === 0 ? LANE_OFFSET : 0;
          const laneZ = it.center.z + c.sz * off;
          const n: Vec2 = { x: -ewSign, z: 0 };
          addVehHead(solid, lampMats, rig, false, { x: c.pole.x, z: laneZ }, c.pole, n);
        }
      }

      // pedestrian heads: one facing back along each crosswalk that ends at this corner's pole
      addPedHead(solid, lampMats, rig, false, c.pole, { x: 0, z: -c.sz }); // crosswalk across the ew roadway
      addPedHead(solid, lampMats, rig, true, c.pole, { x: -c.sx, z: 0 });  // crosswalk across the ns roadway
    }
  }

  if (solid.length > 0) {
    const merged = mergeGeometries(solid, false);
    for (const g of solid) g.dispose();
    if (merged) {
      const poles = new THREE.Mesh(merged, materials.get('metalDark'));
      poles.name = 'signal-poles';
      poles.castShadow = true;
      group.add(poles);
    }
  }

  const lampGeo = new THREE.CircleGeometry(1, 14);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, Math.max(1, lampMats.length));
  lamps.name = 'signal-lamps';
  lamps.frustumCulled = false;
  for (let i = 0; i < lampMats.length; i++) {
    lamps.setMatrixAt(i, lampMats[i].m);
    lamps.setColorAt(i, DARK[lampMats[i].kind]);
  }
  lamps.count = lampMats.length;
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  group.add(lamps);

  const sig: SignalRig = { lamps, rigs };
  group.userData.signals = sig;
  return group;
}

function addVehHead(
  solid: THREE.BufferGeometry[],
  lampMats: Array<{ m: THREE.Matrix4; kind: keyof typeof LIT }>,
  rig: Rig,
  ns: boolean,
  headXZ: Vec2,
  pole: Vec2,
  n: Vec2,
): void {
  // mast arm from the pole to the head
  const dx = headXZ.x - pole.x;
  const dz = headXZ.z - pole.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.2) {
    const dir = { x: dx / len, z: dz / len };
    solid.push(xform(box(len, 0.1, 0.1), pole.x + dx / 2, SIGNAL_POLE_HEIGHT - 0.25, pole.z + dz / 2, alignYaw(dir)));
  }
  // hanger from the arm down to the top of the head
  const armY = SIGNAL_POLE_HEIGHT - 0.25;
  const headTop = HEAD_Y + HEAD_H / 2 + 0.12; // backplate is a little taller than the housing
  solid.push(xform(box(0.07, armY - headTop, 0.07), headXZ.x, (armY + headTop) / 2, headXZ.z));
  const f = frameMatrix(headXZ, HEAD_Y, n);
  // housing + backplate
  const housing = box(HEAD_W, HEAD_H, HEAD_D);
  housing.applyMatrix4(local(f, 0, 0, -HEAD_D / 2 + 0.02));
  solid.push(housing);
  const back = box(HEAD_W + 0.28, HEAD_H + 0.24, 0.03);
  back.applyMatrix4(local(f, 0, 0, -HEAD_D + 0.01));
  solid.push(back);
  rig.veh.push({ ns, base: lampMats.length });
  for (let i = 0; i < 3; i++) {
    const kind = (['red', 'yellow', 'green'] as const)[i];
    lampMats.push({ m: local(f, 0, LAMP_DY - i * LAMP_DY, 0.025, LAMP_R, LAMP_R, 1), kind });
  }
}

function addPedHead(
  solid: THREE.BufferGeometry[],
  lampMats: Array<{ m: THREE.Matrix4; kind: keyof typeof LIT }>,
  rig: Rig,
  acrossNs: boolean,
  pole: Vec2,
  n: Vec2,
): void {
  // the head sits on the pole, offset 0.16 m toward its facing side so it clears the pole
  const p: Vec2 = { x: pole.x + n.x * 0.16, z: pole.z + n.z * 0.16 };
  const f = frameMatrix(p, PED_Y, n);
  const housing = box(PED_W, PED_H, PED_D);
  housing.applyMatrix4(local(f, 0, 0, -PED_D / 2 + 0.02));
  solid.push(housing);
  rig.ped.push({ acrossNs, base: lampMats.length });
  lampMats.push({ m: local(f, 0, PED_LAMP_DY, 0.025, PED_LAMP_R, PED_LAMP_R, 1), kind: 'hand' });
  lampMats.push({ m: local(f, 0, -PED_LAMP_DY, 0.025, PED_LAMP_R, PED_LAMP_R, 1), kind: 'walk' });
}

const PHASE_CODE: Record<Phase, number> = { red: 0, yellow: 1, green: 2 };
const WALK_CODE: Record<WalkState, number> = { dont: 0, flash: 1, walk: 2 };

/**
 * Flip the lamps to match the controller. Cheap: an intersection is only touched when its phases (or the
 * DON'T WALK blink) changed since the last call.
 */
export function updateSignalMeshes(group: THREE.Object3D, lights: TrafficLights): void {
  const sig = group.userData.signals as SignalRig | undefined;
  if (!sig) return;
  const blink = Math.floor(lights.clock * 2) & 1;
  let dirty = false;
  const lamps = sig.lamps;
  for (const rig of sig.rigs) {
    const st = lights.stateOf(rig.id);
    if (!st) continue;
    const wNs = WALK_CODE[st.walkAcrossNs];
    const wEw = WALK_CODE[st.walkAcrossEw];
    const key = PHASE_CODE[st.ns] | (PHASE_CODE[st.ew] << 2) | (wNs << 4) | (wEw << 6) |
      (((wNs === 1 || wEw === 1) ? blink : 0) << 8);
    if (key === rig.key) continue;
    rig.key = key;
    dirty = true;
    for (const h of rig.veh) {
      const ph = h.ns ? st.ns : st.ew;
      lamps.setColorAt(h.base, ph === 'red' ? LIT.red : DARK.red);
      lamps.setColorAt(h.base + 1, ph === 'yellow' ? LIT.yellow : DARK.yellow);
      lamps.setColorAt(h.base + 2, ph === 'green' ? LIT.green : DARK.green);
    }
    for (const h of rig.ped) {
      const w = h.acrossNs ? st.walkAcrossNs : st.walkAcrossEw;
      const handOn = w === 'dont' || (w === 'flash' && blink === 1);
      lamps.setColorAt(h.base, handOn ? LIT.hand : DARK.hand);
      lamps.setColorAt(h.base + 1, w === 'walk' ? LIT.walk : DARK.walk);
    }
  }
  if (dirty && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
}
