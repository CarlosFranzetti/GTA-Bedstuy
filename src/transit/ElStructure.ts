/**
 * WBURG: the steel of the elevated line over Flushing Ave: curb-line columns with transverse bents, plate girders and deck
 * with two tracks (rails + third rail), two stations (side platforms, canopy, stairs, station-name boards, a kiosk at each
 * stair foot), and the "lime line" subway entrances (green globe, railed stair-down) at two corners.
 * Geometry is built in 125 m sections so frustum and distance culling work; everything is merged per section.
 */
import * as THREE from 'three';
import type { StaticCollider, IMaterialLibrary } from '@/world/types';
import { GeoBuilder, rgb, type RGB } from './GeoBuilder';
import { EL_X_EAST, EL_X_WEST, EL_Z, FLOOR_ABOVE_RAIL, OPERATOR, RAIL_Y, STATIONS, TRACK_OFFSET, type Station } from './ElLine';

export const SECTION_M = 125;
const STEEL = rgb(0x3d4a43), STEEL_LIGHT = rgb(0x56645b), CONCRETE = rgb(0x8c8a82), BALLAST = rgb(0x3b3835), RAIL = rgb(0x8a8f94), YELLOW = rgb(0xd8b21a), CANOPY = rgb(0x2f3b36), GREEN = rgb(0x1f7a3a), BENCH = rgb(0x6b5a3c), DARK = rgb(0x1a1b1d);
/** curb-line column z offset from the street centreline (road half width 8 + half a column) */
const COL_Z = 8.4;
const DECK_Y0 = 7.7, DECK_Y1 = 8.6;
const PLATFORM_TOP = RAIL_Y + FLOOR_ABOVE_RAIL - 0.02;
const PLAT_Z0 = TRACK_OFFSET + 1.75, PLAT_Z1 = PLAT_Z0 + 3.3;
/** cross-street centres (avenues) the columns must keep clear of, and their clear half width */
const AVENUES = [-250, 0, 250, 500, 750, 1000];
const AVENUE_CLEAR = 11.5;
export const STAIR_LEN = 17;
/** where a platform ends and its stair landing begins, measured from the station centre */
export const PLATFORM_HALF = 47;

export interface StationEntrance { station: number; x: number; z: number; /** +1 south sidewalk / -1 north */ side: 1 | -1; }

export interface ElBuild {
  sections: Array<{ mesh: THREE.Mesh; cx: number; cz: number; r: number }>;
  props: THREE.Object3D[];
  colliders: StaticCollider[];
  entrances: StationEntrance[];
  /** subway ("lime line") entrances: centre + footprint, for tests and the map */
  subway: Array<{ name: string; x: number; z: number }>;
  /** materials to toggle at night */
  night: Array<{ mat: THREE.MeshStandardMaterial; day: number; nightV: number }>;
}

function columnXs(): number[] {
  const xs: number[] = [];
  for (let x = EL_X_WEST; x <= EL_X_EAST; x += 12) {
    if (AVENUES.some((a) => Math.abs(x - a) < AVENUE_CLEAR)) continue;
    xs.push(x);
  }
  return xs;
}

const isInPlatform = (x: number, st: Station): boolean => Math.abs(x - st.x) <= PLATFORM_HALF + 2;

function poly(pts: Array<[number, number]>, id: string): StaticCollider {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const ordered = area < 0 ? pts.slice().reverse() : pts;
  return { shape: { kind: 'polygon', points: ordered.map(([x, z]) => ({ x, z })) }, pos: { x: 0, z: 0 }, id };
}

/** One I-section column from the street (y = 0.15, on the sidewalk) up to the bent. */
function column(b: GeoBuilder, x: number, z: number, top: number): void {
  b.box(x - 0.42, 0.15, z - 0.42, x + 0.42, 0.55, z + 0.42, CONCRETE); // pier base
  b.box(x - 0.05, 0.55, z - 0.3, x + 0.05, top, z + 0.3, STEEL); // web
  b.box(x - 0.3, 0.55, z - 0.3, x + 0.3, top, z - 0.2, STEEL_LIGHT); // flanges
  b.box(x - 0.3, 0.55, z + 0.2, x + 0.3, top, z + 0.3, STEEL_LIGHT);
  b.box(x - 0.36, top - 0.35, z - 0.36, x + 0.36, top, z + 0.36, STEEL); // capital plate
}

export function buildEl(lib: IMaterialLibrary): ElBuild {
  const out: ElBuild = { sections: [], props: [], colliders: [], entrances: [], subway: [], night: [] };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25, name: 'el:steel' });
  const sectionCount = Math.ceil((EL_X_EAST - EL_X_WEST) / SECTION_M);
  const xsAll = columnXs();

  for (let si = 0; si < sectionCount; si++) {
    const x0 = EL_X_WEST + si * SECTION_M, x1 = Math.min(EL_X_EAST, x0 + SECTION_M);
    const b = new GeoBuilder();
    // deck slab, ballast, fascia girders (continuous)
    b.box(x0, DECK_Y0, EL_Z - 5.7, x1, DECK_Y1, EL_Z + 5.7, CONCRETE);
    b.box(x0, DECK_Y1 - 0.02, EL_Z - 5.7, x1, DECK_Y1 + 1.1, EL_Z - 5.5, STEEL, 'l');
    b.box(x0, DECK_Y1 - 0.02, EL_Z + 5.5, x1, DECK_Y1 + 1.1, EL_Z + 5.7, STEEL, 'l');
    b.box(x0, DECK_Y0 - 0.9, EL_Z - 5.7, x1, DECK_Y0, EL_Z - 5.5, STEEL_LIGHT, 'l');
    b.box(x0, DECK_Y0 - 0.9, EL_Z + 5.5, x1, DECK_Y0, EL_Z + 5.7, STEEL_LIGHT, 'l');
    b.box(x0, DECK_Y0 - 0.5, EL_Z - 1.2, x1, DECK_Y0, EL_Z + 1.2, STEEL_LIGHT); // centre girder under the two tracks
    for (const tz of [-TRACK_OFFSET, TRACK_OFFSET]) {
      b.box(x0, DECK_Y1, EL_Z + tz - 1.55, x1, RAIL_Y - 0.13, EL_Z + tz + 1.55, BALLAST); // ballast + ties as one dark strip
      for (const rz of [-0.72, 0.72]) b.box(x0, RAIL_Y - 0.13, EL_Z + tz + rz - 0.035, x1, RAIL_Y, EL_Z + tz + rz + 0.035, RAIL);
      b.box(x0, RAIL_Y - 0.13, EL_Z + tz + 1.05 - 0.04, x1, RAIL_Y - 0.02, EL_Z + tz + 1.05 + 0.04, YELLOW); // third rail cover
    }
    // columns + bents
    for (const x of xsAll) {
      if (x < x0 || x >= x1) continue;
      for (const sz of [-1, 1]) {
        column(b, x, EL_Z + sz * COL_Z, DECK_Y0 - 0.2);
        out.colliders.push({ shape: { kind: 'circle', r: 0.4 }, pos: { x, z: EL_Z + sz * COL_Z }, id: `el-col-${x}-${sz}` });
      }
      b.box(x - 0.18, DECK_Y0 - 1.3, EL_Z - COL_Z - 0.4, x + 0.18, DECK_Y0 - 0.2, EL_Z + COL_Z + 0.4, STEEL); // transverse bent
      b.box(x - 0.3, DECK_Y0 - 1.3, EL_Z - COL_Z - 0.4, x + 0.3, DECK_Y0 - 1.15, EL_Z + COL_Z + 0.4, STEEL_LIGHT);
      for (const sz of [-1, 1]) { // knee braces
        b.quad([x - 0.1, DECK_Y0 - 1.3, EL_Z + sz * (COL_Z - 0.4)], [x + 0.1, DECK_Y0 - 1.3, EL_Z + sz * (COL_Z - 0.4)], [x + 0.1, DECK_Y0 - 3.0, EL_Z + sz * COL_Z], [x - 0.1, DECK_Y0 - 3.0, EL_Z + sz * COL_Z], STEEL);
      }
    }
    const g = b.build();
    const m = new THREE.Mesh(g, mat);
    m.name = `el:section-${si}`;
    m.castShadow = true; m.receiveShadow = true;
    out.sections.push({ mesh: m, cx: (x0 + x1) / 2, cz: EL_Z, r: SECTION_M / 2 + 14 });
  }

  // ---- stations
  const stationDeck = new GeoBuilder(), canopy = new GeoBuilder();
  // sign boards: quads accumulated per sign material, merged into one double-sided mesh per material (a handful of draws, not dozens)
  const signQuads = new Map<THREE.Material, number[]>();
  const sign = (text: string, bg: string, fg: string, w: number, h: number, pos: [number, number, number], yaw: number): void => {
    const mat = lib.sign(text, bg, fg);
    let q = signQuads.get(mat);
    if (!q) { q = []; signQuads.set(mat, q); }
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const corner = (lx: number, ly: number): number[] => [pos[0] + lx * c, pos[1] + ly, pos[2] - lx * sn];
    const a = corner(-w / 2, -h / 2), b = corner(w / 2, -h / 2), cc = corner(w / 2, h / 2), d = corner(-w / 2, h / 2);
    // front (uv left to right), then the back face with the same text mirrored back to reading order
    q.push(...a, 0, 0, ...b, 1, 0, ...cc, 1, 1, ...a, 0, 0, ...cc, 1, 1, ...d, 0, 1);
    q.push(...b, 0, 0, ...a, 1, 0, ...d, 1, 1, ...b, 0, 0, ...d, 1, 1, ...cc, 0, 1);
  };
  const flushSigns = (): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    for (const [mat, q] of signQuads) {
      const n = q.length / 5, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { pos.set(q.slice(i * 5, i * 5 + 3), i * 3); uv.set(q.slice(i * 5 + 3, i * 5 + 5), i * 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = 'el:sign'; meshes.push(m);
    }
    signQuads.clear();
    return meshes;
  };
  STATIONS.forEach((st, si) => {
    const px0 = st.x - st.length / 2, px1 = st.x + st.length / 2;
    for (const sz of [-1, 1] as const) {
      const za = EL_Z + sz * PLAT_Z0, zb = EL_Z + sz * PLAT_Z1;
      const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      stationDeck.box(px0, DECK_Y0, z0, px1, PLATFORM_TOP, z1, CONCRETE);
      // warning strip on the track-side edge
      stationDeck.box(px0, PLATFORM_TOP, sz > 0 ? z0 : z1 - 0.45, px1, PLATFORM_TOP + 0.02, sz > 0 ? z0 + 0.45 : z1, YELLOW);
      // outer railing + landing + stair
      const zo = sz > 0 ? z1 : z0;
      stationDeck.box(px0, PLATFORM_TOP, zo - 0.04, px1, PLATFORM_TOP + 1.1, zo + 0.04, STEEL);
      // canopy: posts every 6 m on the outer edge, sloped roof plate, fascia
      for (let x = px0 + 3; x <= px1 - 2; x += 6) canopy.box(x - 0.1, PLATFORM_TOP, zo - 0.35 * sz - 0.1, x + 0.1, PLATFORM_TOP + 3.5, zo - 0.35 * sz + 0.1, STEEL);
      canopy.quad([px0, PLATFORM_TOP + 3.0, EL_Z + sz * (PLAT_Z0 + 0.3)], [px1, PLATFORM_TOP + 3.0, EL_Z + sz * (PLAT_Z0 + 0.3)], [px1, PLATFORM_TOP + 3.6, zo + sz * 0.3], [px0, PLATFORM_TOP + 3.6, zo + sz * 0.3], CANOPY);
      canopy.quad([px0, PLATFORM_TOP + 3.6, zo + sz * 0.3], [px1, PLATFORM_TOP + 3.6, zo + sz * 0.3], [px1, PLATFORM_TOP + 3.0, EL_Z + sz * (PLAT_Z0 + 0.3)], [px0, PLATFORM_TOP + 3.0, EL_Z + sz * (PLAT_Z0 + 0.3)], CANOPY);
      canopy.box(px0, PLATFORM_TOP + 3.55, zo - 0.05, px1, PLATFORM_TOP + 3.8, zo + 0.15, STEEL);
      // benches and a windscreen
      for (let x = px0 + 12; x < px1 - 8; x += 22) {
        stationDeck.box(x, PLATFORM_TOP, EL_Z + sz * (PLAT_Z0 + 1.6) - 0.25, x + 2.2, PLATFORM_TOP + 0.45, EL_Z + sz * (PLAT_Z0 + 1.6) + 0.25, BENCH);
        stationDeck.box(x + 0.1, PLATFORM_TOP, EL_Z + sz * (PLAT_Z0 + 2.4) - 0.04, x + 2.1, PLATFORM_TOP + 2.0, EL_Z + sz * (PLAT_Z0 + 2.4) + 0.04, DARK);
      }
      // station-name boards, both faces, hung under the canopy fascia every 20 m
      for (let x = px0 + 8; x < px1 - 4; x += 20) sign(st.name.toUpperCase(), '#1d3a2c', '#f2efe6', 2.6, 0.55, [x, PLATFORM_TOP + 2.6, EL_Z + sz * (PLAT_Z0 + 1.0)], 0);
      // operator roundel board
      sign(`${st.operator}  ·  ${st.name.toUpperCase()}`, '#3b2a1c', '#f1d9a8', 5.2, 0.7, [st.x, PLATFORM_TOP + 3.3, zo + sz * 0.22], sz > 0 ? 0 : Math.PI);
      // landing + stair toward the end of the platform (north platform west, south platform east)
      const dirX = sz < 0 ? -1 : 1;
      const lx0 = sz < 0 ? px0 - 2 : px1, lx1 = sz < 0 ? px0 : px1 + 2;
      const zs0 = sz > 0 ? EL_Z + 8.15 : EL_Z - 10.35, zs1 = zs0 + 2.2;
      stationDeck.box(lx0, DECK_Y0, Math.min(z0, zs0), lx1, PLATFORM_TOP, Math.max(z1, zs1), CONCRETE);
      // stair treads from the landing edge down to the sidewalk
      const startX = sz < 0 ? lx0 : lx1;
      const steps = Math.round((PLATFORM_TOP - 0.15) / 0.34);
      for (let k = 0; k < steps; k++) {
        const x = startX + dirX * (k * (STAIR_LEN / steps));
        const xa = Math.min(x, x + dirX * (STAIR_LEN / steps)), xb = Math.max(x, x + dirX * (STAIR_LEN / steps));
        const top = PLATFORM_TOP - (k + 1) * ((PLATFORM_TOP - 0.15) / steps);
        stationDeck.box(xa, top - 0.3, zs0, xb, top, zs1, CONCRETE);
      }
      // stair railings and stringers
      for (const zr of [zs0, zs1 - 0.06]) stationDeck.quad([startX, PLATFORM_TOP + 1.0, zr + 0.03], [startX + dirX * STAIR_LEN, 1.15, zr + 0.03], [startX + dirX * STAIR_LEN, 0.15, zr + 0.03], [startX, PLATFORM_TOP, zr + 0.03], STEEL);
      for (const zr of [zs0, zs1 - 0.06]) stationDeck.quad([startX, PLATFORM_TOP, zr + 0.03], [startX + dirX * STAIR_LEN, 0.15, zr + 0.03], [startX + dirX * STAIR_LEN, 1.15, zr + 0.03], [startX, PLATFORM_TOP + 1.0, zr + 0.03], STEEL);
      const footX = startX + dirX * STAIR_LEN;
      // stair-foot kiosk with the operator sign
      const kx0 = Math.min(footX, footX + dirX * 2.6), kx1 = Math.max(footX, footX + dirX * 2.6);
      stationDeck.box(kx0, 0.15, zs0, kx1, 3.0, zs1, STEEL_LIGHT);
      stationDeck.box(kx0 - 0.1, 3.0, zs0 - 0.1, kx1 + 0.1, 3.2, zs1 + 0.1, STEEL);
      const kz = (zs0 + zs1) / 2;
      sign(`${OPERATOR}  ${st.name.toUpperCase()}`, '#1d3a2c', '#f2efe6', 2.6, 0.5, [(kx0 + kx1) / 2, 3.45, sz > 0 ? zs1 + 0.12 : zs0 - 0.12], sz > 0 ? 0 : Math.PI);
      void kz;
      out.entrances.push({ station: si, x: footX + dirX * 0.2, z: (zs0 + zs1) / 2, side: sz });
      out.colliders.push(poly([[Math.min(startX, footX), zs0], [Math.max(startX, footX) + 2.6, zs0], [Math.max(startX, footX) + 2.6, zs1], [Math.min(startX, footX), zs1]], `el-stair-${si}-${sz}`));
    }
  });
  const stMesh = new THREE.Mesh(stationDeck.build(), mat); stMesh.name = 'el:stations'; stMesh.castShadow = true; stMesh.receiveShadow = true;
  const canMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide, name: 'el:canopy' });
  const canMesh = new THREE.Mesh(canopy.build(), canMat); canMesh.name = 'el:canopy'; canMesh.castShadow = true; canMesh.receiveShadow = true;
  out.props.push(stMesh, canMesh, ...flushSigns());

  // ---- lime-line subway entrances (G-train style: green globe, railed stair going down)
  const ent = new GeoBuilder();
  const globeMat = new THREE.MeshStandardMaterial({ color: 0x2fbf5a, emissive: new THREE.Color(0x2fbf5a), emissiveIntensity: 0.25, roughness: 0.4, name: 'lime:globe' });
  out.night.push({ mat: globeMat, day: 0.25, nightV: 1.6 });
  const globes: THREE.Mesh[] = [];
  const entranceAt = (name: string, x: number, z: number, along: 'x' | 'z', label: string): void => {
    const w = along === 'x' ? 3.2 : 1.4, d = along === 'x' ? 1.4 : 3.2;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    ent.box(x0, 0.15, z0, x1, 0.2, z1, DARK); // the opening
    // stairwell: dark well with treads going down, drawn as stepped strips slightly below the paving
    for (let k = 0; k < 6; k++) {
      const f = k / 6;
      if (along === 'x') ent.box(x0 + 0.1 + f * (w - 0.2), 0.2, z0 + 0.1, x0 + 0.1 + (f + 0.16) * (w - 0.2), 0.205 + (0.05) * (1 - f), z1 - 0.1, rgb(k % 2 ? 0x55575a : 0x707276));
      else ent.box(x0 + 0.1, 0.2, z0 + 0.1 + f * (d - 0.2), x1 - 0.1, 0.205 + 0.05 * (1 - f), z0 + 0.1 + (f + 0.16) * (d - 0.2), rgb(k % 2 ? 0x55575a : 0x707276));
    }
    // green railing on all four sides (open at the entry end)
    const rail = (ax: number, az: number, bx: number, bz: number): void => { ent.box(Math.min(ax, bx) - 0.03, 0.15, Math.min(az, bz) - 0.03, Math.max(ax, bx) + 0.03, 1.05, Math.max(az, bz) + 0.03, GREEN); };
    rail(x0, z0, x1, z0); rail(x0, z1, x1, z1);
    if (along === 'x') rail(x1, z0, x1, z1); else rail(x0, z1, x1, z1);
    // globe posts at the two rail ends
    const post = (px: number, pz: number): void => {
      ent.box(px - 0.05, 0.15, pz - 0.05, px + 0.05, 2.7, pz + 0.05, GREEN);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), globeMat); g.position.set(px, 2.95, pz); g.name = 'lime:globe'; globes.push(g);
    };
    if (along === 'x') { post(x1, z0); post(x1, z1); } else { post(x0, z1); post(x1, z1); }
    // sign board on the first globe post side
    sign(label, '#0f4a26', '#e9f3e3', 1.7, 0.5, [x, 1.5, along === 'x' ? (z > -400 ? z0 - 0.06 : z1 + 0.06) : z0 - 0.06], along === 'x' ? (z > -400 ? Math.PI : 0) : Math.PI);
    out.colliders.push(poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], `lime-${name}`));
    out.subway.push({ name, x, z });
  };
  // Garvey x Flushing (south-east sidewalk corner) and Garvey x Myrtle (north-east sidewalk corner)
  entranceAt('Flushing Av', 273, -488.2, 'x', 'LIME LINE · FLUSHING AV · BKLYN TRANSIT');
  entranceAt('Myrtle-Willoughby', 273, -309.7, 'x', 'LIME LINE · MYRTLE AV · BKLYN TRANSIT');
  const entMesh = new THREE.Mesh(ent.build(), mat); entMesh.name = 'lime:entrances'; entMesh.castShadow = true; entMesh.receiveShadow = true;
  out.props.push(entMesh, ...globes, ...flushSigns());
  return out;
}

export type { RGB };
