/** Orchestrates static world generation: grid → roads, lots, buildings, furniture + static colliders. */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { BedstuyData, GridModel, IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import { buildGrid } from '@/world/Grid';
import { buildRoads } from '@/world/RoadBuilder';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { buildBuildings } from '@/world/BuildingGen';
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
}

/** Meshes below this many triangles are not split per cell: one city-wide draw is cheaper than one per visible cell. */
export const MIN_SPLIT_TRIANGLES = 12_000;
/**
 * Medium splits smaller meshes too (awnings, signs, decals...): left city-wide they are drawn unculled, 54 draws / 147 k
 * triangles in every view. Measured at 6 k: medium 1.13-1.25 M -> 0.88-1.02 M triangles (its 1.2 M budget) for 341-380 -> 469-557
 * draws; low would go 871 k -> 700 k triangles for 288 -> 399 draws, so it and phone (150-draw budget) keep the default.
 */
export const SMALL_MESH_SPLIT_TRIANGLES: Partial<Record<Quality, number>> = { phone: 15_000, low: 15_000, medium: 6_000 };
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
  const buildings = buildBuildings(lots, materials, rng.fork('buildings'));
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

  // the far skyline ring: forked last so the streams of everything above are unchanged
  const skyline = createSkyline(grid.bounds, materials, rng.fork('skyline'));
  if (skyline) group.add(skyline);

  let meshes = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  return { grid, lots, group, colliders, furnitureGroup: furniture.group, signalsGroup: signals, lamps: furniture.lamps, transit, propCells, chunkMeshes, chunks, stats: { meshes, lots: lots.length, colliders: colliders.length, cells } };
}
