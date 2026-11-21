/** Orchestrates static world generation: grid → roads, lots, buildings, furniture + static colliders. */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { BedstuyData, GridModel, IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import { buildGrid } from '@/world/Grid';
import { buildRoads } from '@/world/RoadBuilder';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { buildBuildings, lotSeeds } from '@/world/BuildingGen';
import { BuildingStream, STREAM_MESH, emptyLike } from '@/world/BuildingStream';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setBatchSkip } from '@/world/buildings/facade';
import { PHONE_HIDDEN_MESH } from '@/render/TierGeometry';
import { buildFurniture, type LampSpot } from '@/world/FurnitureGen';
import { buildProps } from '@/world/PropsGen';
import { buildSignals, signalColliders } from '@/world/props/signals';
import { createSkyline } from '@/world/Skyline';
import { TransitSystem } from '@/transit/TransitSystem';
import { browserTier } from '@/render/StartTier';
import type { Quality } from '@/render/Shadows';
import { FINE_CELLS, chunkKeyOfCell, chunkLayout, splitMeshesIntoCells, type ChunkLayout, type SplitStats } from '@/render/Culling';

export interface BuiltWorld {
  grid: GridModel;
  lots: Lot[];
  group: THREE.Group;
  colliders: StaticCollider[];
  furnitureGroup: THREE.Group;
  /** Traffic-signal poles/heads; drive with updateSignalMeshes(signalsGroup, traffic.lights) each frame. */
  signalsGroup: THREE.Group;
  lamps: LampSpot[];
  /** WBURG: the elevated line over Flushing Ave with its trains, stations and the lime-line entrances (already inside `group`; call `transit.update(dt, camera, night)` every frame). */
  transit: TransitSystem;
  /** Per-cell prop meshes (candidates for distance culling). */
  propCells: THREE.Mesh[];
  /**
   * Per-cell building and furniture meshes (`userData.cell` = cell key, `userData.chunk` = key of its 2 x 2 block chunk): a
   * `ChunkCuller` hides each chunk as a unit beyond `chunkRangeFor(tier)` (Culling.ts). Props stay in `propCells`.
   */
  chunkMeshes: THREE.Mesh[];
  chunks: ChunkLayout;
  stats: { meshes: number; lots: number; colliders: number; cells: SplitStats };
  /** Phone tier: the on-demand cell builder (ChunkCuller drives it through the shells' `userData.stream`); null on the other tiers. */
  stream: BuildingStream | null;
}

/** Meshes below this many triangles are not split per cell: one city-wide draw is cheaper than one per visible cell. */
export const MIN_SPLIT_TRIANGLES = 12_000;
/**
 * Per-tier split threshold, replacing the default (12 k x blocks / 10, which grew to 54 k on the 45-block map and left 1.4 of 1.6 M
 * building triangles city-wide and unculled on phone and low: PERF2). Medium 6 k: 1.13-1.25 M -> 0.88-1.02 M triangles (its budget)
 * for 341-380 -> 469-557 draws. Phone 20 k and low 10 k trade the other way: phone has triangles to spare and 150 draws to hold;
 * every group below the threshold stays one always-drawn city-wide mesh, every group above it costs one draw per visible cell.
 */
export const SMALL_MESH_SPLIT_TRIANGLES: Partial<Record<Quality, number>> = { phone: 20_000, low: 10_000, medium: 6_000 };
/**
 * Phone and low also split a mesh below the threshold when it occupies at most this many cells (shop signs, graffiti, roll gates:
 * 54 one-off meshes of 2 to 2 k triangles, each an always-drawn draw call in every view before). Dense small groups stay whole.
 */
export const SPARSE_SPLIT_CELLS: Partial<Record<Quality, number>> = { phone: 4, low: 4 };

/** Sidewalk slabs are 0.15 m tall; buildings and furniture sit on top of them. */
export const SIDEWALK_HEIGHT = 0.15;

/**
 * Cell size (m) for splitting merged static meshes: one block wide (N-S street pitch) by two blocks deep (2 x E-W street
 * pitch), anchored at the north-west street centre (the same lattice as before the east expansion, so cell contents of the
 * original blocks are unchanged). Measured on the real layout (4 camera spots, 60 deg / 1200 m frustum): unsplit = 29 draws /
 * 581k tris in view; 250 x 200 = 77 draws / 352k; 125 x 100 = 187 draws / 259k. Finer cells trade draw calls (CPU, x3
 * passes) for vertices. Cells are grouped into 2 x 2 block chunks that are hidden by distance (see `chunkLayout`).
 */
export function cullCellSize(grid: GridModel): { x: number; z: number } {
  const l = chunkLayout(grid.streets);
  return { x: l.cellX, z: l.cellZ };
}

/** `tier` picks the render-cell size (Culling.FINE_CELLS); omitted = the tier the page starts in (coarse cells without a browser). */
export function buildWorld(data: BedstuyData, materials: IMaterialLibrary, rng: Rng, tier: Quality = browserTier() ?? 'high'): BuiltWorld {
  const grid = buildGrid(data);
  const group = new THREE.Group();
  group.name = 'world';
  const colliders: StaticCollider[] = [];

  const roads = buildRoads(grid, materials);
  group.add(roads.group);
  colliders.push(...roads.colliders);

  const lots = subdivideLots(grid, data.pois, rng.fork('lots'), getBedstuyFaces());
  // phone: the classes this tier never draws (fire escapes, tanks, scaffolds, fences...: a fifth of the building triangles) are not baked at all
  if (tier === 'phone') setBatchSkip((name) => PHONE_HIDDEN_MESH.test('buildings:' + name));
  let stream: BuildingStream | null = null;
  let streamShells: THREE.Mesh[] = [];
  let buildings: { group: THREE.Group; colliders: StaticCollider[] };
  if (tier === 'phone' && STREAM_BUILDINGS) {
    const sb = buildBuildingsStreamed(lots, materials, rng.fork('buildings'), grid);
    buildings = sb; stream = sb.stream; streamShells = sb.shells;
  } else buildings = buildBuildings(lots, materials, rng.fork('buildings'));
  setBatchSkip(null);
  buildings.group.position.y = SIDEWALK_HEIGHT;
  group.add(buildings.group);
  colliders.push(...buildings.colliders);

  const furniture = buildFurniture(grid, lots, materials, rng.fork('furniture'));
  furniture.group.position.y = SIDEWALK_HEIGHT;
  group.add(furniture.group);
  colliders.push(...furniture.colliders);

  const props = buildProps(grid, lots, materials, rng.fork('props'));
  props.group.position.y = SIDEWALK_HEIGHT;
  group.add(props.group);
  colliders.push(...props.colliders);

  const chunks = chunkLayout(grid.streets, FINE_CELLS[tier]);
  const signals = buildSignals(grid, materials, chunks); // binned per render cell so the cullers can drop the far ones
  signals.position.y = SIDEWALK_HEIGHT;
  group.add(signals);
  colliders.push(...signalColliders(grid));

  // WBURG: the el, its trains and the subway entrances (own culling, see TransitSystem); built after the generators so their random streams are unchanged
  const transit = new TransitSystem(materials);
  group.add(transit.group);
  colliders.push(...transit.colliders);

  // The generators merge one geometry per material city-wide, which frustum culling can never reject. Re-bin the
  // triangles into per-cell meshes (same names/materials, so lamp lookup by name keeps working).
  const cells: SplitStats = { meshesBefore: 0, meshesAfter: 0, trianglesAfter: 0 };
  // the split threshold grows with the city (it was set for ten blocks): a material group that was not worth splitting then still is not
  const minSplit = SMALL_MESH_SPLIT_TRIANGLES[tier] ?? Math.round(MIN_SPLIT_TRIANGLES * (grid.blocks.length / 10));
  const split = (g: THREE.Object3D): THREE.Mesh[] => splitMeshesIntoCells(g, chunks.cellX, chunks.cellZ, cells, minSplit, chunks.originX, chunks.originZ, SPARSE_SPLIT_CELLS[tier] ?? 0);
  // meshes that were too small to split stay city-wide (no cell key) and are never chunk-culled
  const chunkMeshes = [...split(buildings.group), ...split(furniture.group)].filter((m) => typeof m.userData.cell === 'string'); // instanced kinds are skipped
  for (const sh of streamShells) { buildings.group.add(sh); chunkMeshes.push(sh); } // phone: cells of buildings built on demand (BuildingStream); not split, they are already per cell
  // fine-cell tiers cull per cell (a cell is drawn whole, so a 500 x 200 m chunk would draw its far half too); coarse tiers cull per 2 x 2 block chunk
  for (const m of chunkMeshes) m.userData.chunk = FINE_CELLS[tier] ? (m.userData.cell as string) : chunkKeyOfCell(chunks, m.userData.cell as string);
  // signal poles and lamps were binned by cell in buildSignals: same chunk rule
  signals.traverse((o) => {
    const cell = o.userData.chunk as string | undefined;
    if (!(o as THREE.Mesh).isMesh || cell === undefined) return;
    o.userData.cell = cell;
    o.userData.chunk = FINE_CELLS[tier] ? cell : chunkKeyOfCell(chunks, cell);
    chunkMeshes.push(o as THREE.Mesh);
  });
  const propCells = split(props.group);
  if (tier === 'phone') dropPhoneHidden(group, [chunkMeshes, propCells]);

  // the far skyline ring: forked last so the streams of everything above are unchanged
  const skyline = createSkyline(grid.bounds, materials, rng.fork('skyline'), tier === 'low'); // low: walls and roofs only (a third of the triangles)
  if (skyline) group.add(skyline);

  let meshes = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  return { grid, lots, group, colliders, furnitureGroup: furniture.group, signalsGroup: signals, lamps: furniture.lamps, transit, propCells, chunkMeshes, chunks, stats: { meshes, lots: lots.length, colliders: colliders.length, cells }, stream };
}

/**
 * Phone tier: removes (and frees) the meshes of the classes the tier never draws (TierGeometry.PHONE_HIDDEN_MESH: props bags and wires,
 * manholes, grates, skid marks...). They were only switched off through a camera layer before, which kept every vertex in memory.
 * A later switch to a higher tier cannot bring them back (a reload does). Returns the number of meshes dropped.
 */
/** Clutter buckets above rank 0 (`props:clutter-<cat>-r1|r2...`): the phone tier turns every one off through its material (clutterTier.ts), so they are never drawn. */
const PHONE_CLUTTER_MESH = /^props:clutter-[a-z]+-r[12]/;

export function dropPhoneHidden(root: THREE.Object3D, lists: THREE.Mesh[][] = []): number {
  const doomed: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && (PHONE_HIDDEN_MESH.test(o.name) || PHONE_CLUTTER_MESH.test(o.name))) doomed.push(o as THREE.Mesh); });
  const set = new Set(doomed);
  for (const m of doomed) { m.removeFromParent(); m.geometry.dispose(); }
  for (const l of lists) { let w = 0; for (let i = 0; i < l.length; i++) if (!set.has(l[i])) l[w++] = l[i]; l.length = w; }
  return doomed.length;
}

/** Phone tier builds its buildings per render cell on demand (BuildingStream). Off: every tier builds the whole city at boot as before. */
export const STREAM_BUILDINGS = true;

/**
 * The boot pass of the streamed buildings. Lots are grouped by the render cell of their centre and each group is built on its own, so the
 * peak is one group rather than the city: the colliders are kept, the streamed material classes become empty shells (bounds and
 * attribute layout of the real geometry, nothing else), and the other classes are merged city-wide as before (`group`).
 */
function buildBuildingsStreamed(
  lots: Lot[], materials: IMaterialLibrary, rng: Rng, grid: GridModel,
): { group: THREE.Group; colliders: StaticCollider[]; stream: BuildingStream; shells: THREE.Mesh[] } {
  const layout = chunkLayout(grid.streets, FINE_CELLS.phone);
  const seeds = lotSeeds(lots, rng);
  const skip = (name: string): boolean => PHONE_HIDDEN_MESH.test('buildings:' + name);
  const byCell = new Map<string, Set<string>>();
  for (const l of lots) {
    // the building stands behind its front line: centre = middle of the front pushed half a depth away from the street
    const cx = (l.frontA.x + l.frontB.x) / 2 - l.outward.x * l.depth / 2, cz = (l.frontA.z + l.frontB.z) / 2 - l.outward.z * l.depth / 2;
    const key = `${Math.floor((cx - layout.originX) / layout.cellX)}_${Math.floor((cz - layout.originZ) / layout.cellZ)}`;
    let s = byCell.get(key);
    if (!s) { s = new Set(); byCell.set(key, s); }
    s.add(l.id);
  }
  const stream = new BuildingStream(lots, materials, rng, seeds, skip);
  const group = new THREE.Group();
  group.name = 'buildings';
  const colliders: StaticCollider[] = [];
  const shells: THREE.Mesh[] = [];
  const small = new Map<string, { material: THREE.Material; name: string; shadow: boolean; geos: THREE.BufferGeometry[] }>();
  setBatchSkip(skip);
  try {
    for (const key of [...byCell.keys()].sort()) {
      const ids = byCell.get(key)!;
      const r = buildBuildings(lots, materials, rng, ids, seeds);
      colliders.push(...r.colliders);
      const cellShells: THREE.Mesh[] = [];
      for (const m of [...r.group.children] as THREE.Mesh[]) {
        if (STREAM_MESH.test(m.name)) {
          const shell = new THREE.Mesh(emptyLike(m.geometry), m.material);
          shell.name = m.name; shell.castShadow = m.castShadow; shell.receiveShadow = m.receiveShadow;
          shell.userData = { cell: key, chunk: key, stream };
          cellShells.push(shell);
          m.geometry.dispose();
        } else {
          let e = small.get(m.name);
          if (!e) { e = { material: m.material as THREE.Material, name: m.name, shadow: m.castShadow, geos: [] }; small.set(m.name, e); }
          e.geos.push(m.geometry);
        }
      }
      stream.register(key, ids, cellShells);
      shells.push(...cellShells);
    }
  } finally { setBatchSkip(null); }
  for (const e of small.values()) {
    const g = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
    if (!g) continue;
    if (e.geos.length > 1) for (const x of e.geos) x.dispose();
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, e.material);
    mesh.name = e.name; mesh.castShadow = e.shadow; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, colliders, stream, shells };
}
