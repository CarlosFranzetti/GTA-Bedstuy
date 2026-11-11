/**
 * WP10: the steel of the el on the real Broadway / Myrtle path. Real-path only (never imported by default-path code).
 *
 *  - deck, ballast, girders, rails and third rail follow the path as ribbons, merged per 125 m section (frustum culling);
 *  - platforms, canopies and name boards at the stations of each path;
 *  - columns and transverse bents are two InstancedMesh (one draw each) placed from `columnSpots`.
 * One shared vertex-colour steel material; the sections of the M path start where it leaves the J/Z geometry so the shared
 * Broadway stretch is built once. Heights come from ElLine (RAIL_Y, TRACK_OFFSET, FLOOR_ABOVE_RAIL), the same as the straight el.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import { GeoBuilder, rgb, type RGB } from '@/transit/GeoBuilder';
import { FLOOR_ABOVE_RAIL, OPERATOR, RAIL_Y, TRACK_OFFSET } from '@/transit/ElLine';
import { PLATFORM_HALF, SECTION_M } from '@/transit/ElStructure';
import { pointOnPath, sharedPrefix, type ElPath, type ElStationReal } from './elReal';

const STEEL = rgb(0x3d4a43), STEEL_LIGHT = rgb(0x56645b), CONCRETE = rgb(0x8c8a82), BALLAST = rgb(0x3b3835), RAIL = rgb(0x8a8f94), YELLOW = rgb(0xd8b21a), CANOPY = rgb(0x2f3b36);
const DECK_Y0 = 7.7, DECK_Y1 = 8.6;
const PLATFORM_TOP = RAIL_Y + FLOOR_ABOVE_RAIL - 0.02;
const PLAT_L0 = TRACK_OFFSET + 1.75, PLAT_L1 = PLAT_L0 + 3.3;
const MAX_STEP = 20;

interface Sample { p: Vec2; n: Vec2; d: Vec2 }

/** path samples from s0 to s1: every vertex in between plus extra points so no gap exceeds MAX_STEP; frame from a central difference */
function samples(path: ElPath, s0: number, s1: number): Sample[] {
  const ss: number[] = [s0];
  for (let k = 0; k < path.pts.length; k++) if (path.cum[k] > s0 + 0.01 && path.cum[k] < s1 - 0.01) ss.push(path.cum[k]);
  ss.push(s1);
  const dense: number[] = [];
  for (let i = 0; i < ss.length - 1; i++) {
    const n = Math.max(1, Math.ceil((ss[i + 1] - ss[i]) / MAX_STEP));
    for (let q = 0; q < n; q++) dense.push(ss[i] + ((ss[i + 1] - ss[i]) * q) / n);
  }
  dense.push(s1);
  return dense.map((s) => {
    const c = pointOnPath(path, s);
    const a = pointOnPath(path, s - 0.5).p, b = pointOnPath(path, s + 0.5).p;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const d = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    return { p: c.p, d, n: { x: -d.z, z: d.x } };
  });
}

/** a box in the path frame: lateral l0..l1 (n = (-dz, dx)), height y0..y1, over the samples; faces `skip` as GeoBuilder.box minus the ends */
function strip(b: GeoBuilder, sm: Sample[], l0: number, l1: number, y0: number, y1: number, color: RGB, skip = ''): void {
  const P = (s: Sample, l: number, y: number): number[] => [s.p.x + s.n.x * l, y, s.p.z + s.n.z * l];
  for (let i = 0; i < sm.length - 1; i++) {
    const a = sm[i], c = sm[i + 1];
    if (!skip.includes('u')) b.quad(P(a, l1, y1), P(c, l1, y1), P(c, l0, y1), P(a, l0, y1), color);
    if (!skip.includes('d')) b.quad(P(a, l0, y0), P(c, l0, y0), P(c, l1, y0), P(a, l1, y0), color);
    if (!skip.includes('f')) b.quad(P(a, l1, y0), P(c, l1, y0), P(c, l1, y1), P(a, l1, y1), color);
    if (!skip.includes('b')) b.quad(P(c, l0, y0), P(a, l0, y0), P(a, l0, y1), P(c, l0, y1), color);
  }
}

interface SignLib { sign?: (text: string, bg: string, fg: string) => THREE.Material }

function signMeshes(quads: Map<THREE.Material, number[]>): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const [mat, q] of quads) {
    const n = q.length / 5, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pos.set(q.slice(i * 5, i * 5 + 3), i * 3); uv.set(q.slice(i * 5 + 3, i * 5 + 5), i * 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = 'el:sign'; out.push(m);
  }
  return out;
}

/** one I-section column in its own frame: x along the line, y up, z across; foot at y 0.15 */
function columnGeometry(top: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(-0.42, 0.15, -0.42, 0.42, 0.55, 0.42, CONCRETE);
  b.box(-0.05, 0.55, -0.3, 0.05, top, 0.3, STEEL);
  b.box(-0.3, 0.55, -0.3, 0.3, top, -0.2, STEEL_LIGHT);
  b.box(-0.3, 0.55, 0.2, 0.3, top, 0.3, STEEL_LIGHT);
  b.box(-0.36, top - 0.35, -0.36, 0.36, top, 0.36, STEEL);
  return b.build();
}

/** the transverse bent over a column pair, one unit wide in z (scaled per instance) */
function bentGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(-0.18, DECK_Y0 - 1.3, -0.5, 0.18, DECK_Y0 - 0.2, 0.5, STEEL);
  b.box(-0.3, DECK_Y0 - 1.3, -0.5, 0.3, DECK_Y0 - 1.15, 0.5, STEEL_LIGHT);
  return b.build();
}

/**
 * `spots` as returned by columnSpots, all paths' spots concatenated; `stations` adds the platforms.
 * `mats` may carry `sign(text, bg, fg)` (the material library) for the name boards; without it the boards are left out.
 */
export function buildElStructureReal(paths: ElPath[], spots: Array<{ p: Vec2; dir: Vec2 }>, mats: unknown, stations: readonly ElStationReal[] = []): THREE.Group {
  const group = new THREE.Group();
  group.name = 'el:real';
  const steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25, name: 'el:steel' });
  const signLib = mats as SignLib | undefined;
  const signFn = signLib?.sign ? (text: string, bg: string, fg: string): THREE.Material => signLib.sign!(text, bg, fg) : undefined;
  const signQuads = new Map<THREE.Material, number[]>();
  const sign = (text: string, bg: string, fg: string, w: number, h: number, c: Vec2, d: Vec2, lat: number, y: number): void => {
    if (!signFn) return;
    const mat = signFn(text, bg, fg);
    let q = signQuads.get(mat);
    if (!q) { q = []; signQuads.set(mat, q); }
    const cx = c.x - d.z * lat, cz = c.z + d.x * lat;
    const corner = (u: number, v: number): number[] => [cx + d.x * u, y + v, cz + d.z * u];
    const a = corner(-w / 2, -h / 2), b = corner(w / 2, -h / 2), cc = corner(w / 2, h / 2), dd = corner(-w / 2, h / 2);
    q.push(...a, 0, 0, ...b, 1, 0, ...cc, 1, 1, ...a, 0, 0, ...cc, 1, 1, ...dd, 0, 1);
    q.push(...b, 0, 0, ...a, 1, 0, ...dd, 1, 1, ...b, 0, 0, ...dd, 1, 1, ...cc, 0, 1);
  };

  // ---- deck and track ribbons, per path and 125 m section; the M path starts where it leaves the J/Z geometry
  const jz = paths.find((p) => p.id === 'JZ');
  let sectionNo = 0;
  for (const path of paths) {
    const from = path.id === 'M' && jz ? Math.max(0, sharedPrefix(jz, path) - 0.01) : 0;
    for (let s0 = from; s0 < path.length - 0.01; s0 += SECTION_M) {
      const s1 = Math.min(path.length, s0 + SECTION_M);
      const sm = samples(path, s0, s1);
      const b = new GeoBuilder();
      strip(b, sm, -5.7, 5.7, DECK_Y0, DECK_Y1, CONCRETE);
      strip(b, sm, -5.7, -5.5, DECK_Y1 - 0.02, DECK_Y1 + 1.1, STEEL, 'b'); // parapet girders
      strip(b, sm, 5.5, 5.7, DECK_Y1 - 0.02, DECK_Y1 + 1.1, STEEL, 'f');
      strip(b, sm, -5.7, -5.5, DECK_Y0 - 0.9, DECK_Y0, STEEL_LIGHT, 'b');
      strip(b, sm, 5.5, 5.7, DECK_Y0 - 0.9, DECK_Y0, STEEL_LIGHT, 'f');
      strip(b, sm, -1.2, 1.2, DECK_Y0 - 0.5, DECK_Y0, STEEL_LIGHT);
      for (const tl of [-TRACK_OFFSET, TRACK_OFFSET]) {
        strip(b, sm, tl - 1.55, tl + 1.55, DECK_Y1, RAIL_Y - 0.13, BALLAST);
        for (const rl of [-0.72, 0.72]) strip(b, sm, tl + rl - 0.035, tl + rl + 0.035, RAIL_Y - 0.13, RAIL_Y, RAIL);
        strip(b, sm, tl + 1.05 - 0.04, tl + 1.05 + 0.04, RAIL_Y - 0.13, RAIL_Y - 0.02, YELLOW);
      }
      const mesh = new THREE.Mesh(b.build(), steel);
      mesh.name = `el:section-${path.id}-${sectionNo++}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // ---- stations: platforms, warning strip, railing, canopy, name boards
  const deck = new GeoBuilder(), canopy = new GeoBuilder();
  const built = new Set<string>();
  for (const st of stations) {
    const path = paths.find((p) => p.id === st.path);
    if (!path) continue;
    // a station wholly on the stretch the two paths share is built once
    const shared = jz && path.id === 'M' ? sharedPrefix(jz, path) : -1;
    if (path.id === 'M' && st.s + PLATFORM_HALF <= shared && built.has(st.id)) continue;
    built.add(st.id);
    const s0 = Math.max(0, st.s - PLATFORM_HALF), s1 = Math.min(path.length, st.s + PLATFORM_HALF);
    const sm = samples(path, s0, s1);
    for (const sg of [-1, 1] as const) {
      const la = sg * PLAT_L0, lb = sg * PLAT_L1;
      const l0 = Math.min(la, lb), l1 = Math.max(la, lb);
      strip(deck, sm, l0, l1, DECK_Y0, PLATFORM_TOP, CONCRETE);
      strip(deck, sm, sg > 0 ? l0 : l1 - 0.45, sg > 0 ? l0 + 0.45 : l1, PLATFORM_TOP, PLATFORM_TOP + 0.02, YELLOW, 'dfb');
      const lo = sg > 0 ? l1 : l0;
      strip(deck, sm, lo - 0.04, lo + 0.04, PLATFORM_TOP, PLATFORM_TOP + 1.1, STEEL);
      strip(canopy, sm, Math.min(sg * (PLAT_L0 + 0.3), lo + sg * 0.3), Math.max(sg * (PLAT_L0 + 0.3), lo + sg * 0.3), PLATFORM_TOP + 3.0, PLATFORM_TOP + 3.15, CANOPY);
      for (let s = s0 + 3; s <= s1 - 2; s += 6) {
        const c = pointOnPath(path, s), d = pointOnPath(path, s).dir;
        const one = [{ p: c.p, d, n: { x: -d.z, z: d.x } }, { p: { x: c.p.x + d.x * 0.2, z: c.p.z + d.z * 0.2 }, d, n: { x: -d.z, z: d.x } }];
        strip(canopy, one, lo - sg * 0.35 - 0.1, lo - sg * 0.35 + 0.1, PLATFORM_TOP, PLATFORM_TOP + 3.0, STEEL);
      }
    }
    for (let s = s0 + 8; s < s1 - 4; s += 20) {
      const c = pointOnPath(path, s);
      sign(st.name.toUpperCase(), '#1d3a2c', '#f2efe6', 2.6, 0.55, c.p, c.dir, PLAT_L0 + 1.0, PLATFORM_TOP + 2.6);
      sign(st.name.toUpperCase(), '#1d3a2c', '#f2efe6', 2.6, 0.55, c.p, c.dir, -(PLAT_L0 + 1.0), PLATFORM_TOP + 2.6);
    }
    const mid = pointOnPath(path, st.s);
    sign(`${OPERATOR}  ·  ${st.name.toUpperCase()}`, '#3b2a1c', '#f1d9a8', 5.2, 0.7, mid.p, mid.dir, PLAT_L1 + 0.2, PLATFORM_TOP + 3.3);
    sign(`${OPERATOR}  ·  ${st.name.toUpperCase()}`, '#3b2a1c', '#f1d9a8', 5.2, 0.7, mid.p, mid.dir, -(PLAT_L1 + 0.2), PLATFORM_TOP + 3.3);
  }
  if (deck.triangles) {
    const m = new THREE.Mesh(deck.build(), steel); m.name = 'el:stations'; m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  if (canopy.triangles) {
    const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, name: 'el:canopy' });
    const m = new THREE.Mesh(canopy.build(), cm); m.name = 'el:canopy'; m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  for (const m of signMeshes(signQuads)) group.add(m);

  // ---- columns and bents: two instanced meshes. A bent joins a left and a right column at the same place along the line.
  const n = spots.length;
  const pairs: Array<[number, number]> = [];
  const taken = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (taken[i]) continue;
    for (let j = i + 1; j < n; j++) {
      const dx = spots[j].p.x - spots[i].p.x, dz = spots[j].p.z - spots[i].p.z;
      if (Math.hypot(dx, dz) > 24) continue;
      const along = dx * spots[i].dir.x + dz * spots[i].dir.z, across = dx * -spots[i].dir.z + dz * spots[i].dir.x;
      if (!taken[j] && Math.abs(along) <= 1.2 && Math.abs(across) >= 10 && Math.abs(across) <= 22) { taken[i] = taken[j] = 1; pairs.push([i, j]); break; }
    }
  }
  const cols = new THREE.InstancedMesh(columnGeometry(DECK_Y0 - 0.2), steel, n);
  cols.name = 'el:columns';
  const bents = new THREE.InstancedMesh(bentGeometry(), steel, pairs.length);
  bents.name = 'el:bents';
  const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4(), scl = new THREE.Matrix4();
  const place = (x: number, z: number, dir: Vec2, sz: number): THREE.Matrix4 => {
    rot.makeRotationY(Math.atan2(-dir.z, dir.x));
    scl.makeScale(1, 1, sz);
    m4.makeTranslation(x, 0, z).multiply(rot).multiply(scl);
    return m4;
  };
  for (let i = 0; i < n; i++) cols.setMatrixAt(i, place(spots[i].p.x, spots[i].p.z, spots[i].dir, 1));
  pairs.forEach(([i, j], k) => {
    const a = spots[i], c = spots[j];
    const w = Math.hypot(a.p.x - c.p.x, a.p.z - c.p.z) + 0.8;
    bents.setMatrixAt(k, place((a.p.x + c.p.x) / 2, (a.p.z + c.p.z) / 2, a.dir, w));
  });
  cols.instanceMatrix.needsUpdate = true; bents.instanceMatrix.needsUpdate = true;
  cols.castShadow = bents.castShadow = true; cols.receiveShadow = bents.receiveShadow = true;
  cols.computeBoundingSphere(); bents.computeBoundingSphere();
  group.add(cols, bents);
  group.userData.columnCount = n;
  group.userData.bentCount = pairs.length;
  return group;
}
